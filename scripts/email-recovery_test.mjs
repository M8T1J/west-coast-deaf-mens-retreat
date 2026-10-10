// HISTORICAL pg_net proposal only; not the current scheduler or a deployment prerequisite.
// Offline SQL + real worker integration. Extension background workers are mocked.
// Requires a preinstalled local PGlite module; no live database or network access.
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/send-registration-email/worker.ts';
if (!Deno.args[0]?.startsWith('file:')) throw new Error('Supply a local file: URL for PGlite.');
const { PGlite } = await import(Deno.args[0]);
const db = new PGlite({ database: 'postgres' });
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const job = async id => await one('select * from public.registration_email_outbox where id=$1', [id]);
// Only synthetic fixture management may use the extension owner. The migration
// and scheduler never switch into this role themselves.
const owner = async (sql, args = []) => {
    await db.exec('set role supabase_admin');
    try { return args.length ? await db.query(sql, args) : await db.exec(sql); }
    finally { await db.exec('set role postgres'); }
};
const latest = async () => await one('select * from wcdmr_email_private.recovery_runs order by id desc limit 1');
const tick = async () => {
    await db.exec("update wcdmr_email_private.recovery_runs set started_at=least(started_at,clock_timestamp()-interval '61 seconds'); select wcdmr_email_private.recover_registration_emails();");
};
const reset = async () => {
    await owner('truncate net.http_request_queue, net._http_response');
    await db.exec('truncate public.registration_email_outbox, public.registrations, wcdmr_email_private.recovery_runs; update public.registration_email_dispatch_control set next_send_allowed_at=now();');
};
const enqueue = async () => {
    const row = await one(`insert into public.registrations(client_registration_id,first_name,last_name,full_name,email,phone,address_line,city,zip_code,full_address,church_name,emergency_name,emergency_phone,payment_method,amount_due)
      values(gen_random_uuid(),'Synthetic','Registrant','Synthetic Registrant','test@example.com','555-0100','Test','Test','00000','Test','Test','Test','555-0101','zelle',245) returning id`);
    await db.query("update public.registrations set payment_status='verified',registration_status='completed',amount_received=245,payment_verified_at=now() where id=$1", [row.id]);
    return (await one('select id from public.registration_email_outbox where registration_id=$1', [row.id])).id;
};
const secret = 'synthetic-offline-worker-credential-0000000000';
let providerCalls = 0;
let providerStatus = 200;
const rpcNames = {
    claim_registration_email: ['p_outbox_id'],
    authorize_registration_email_send: ['p_outbox_id', 'p_claim_token'],
    complete_registration_email: ['p_outbox_id', 'p_claim_token'],
    fail_registration_email: ['p_outbox_id', 'p_claim_token', 'p_error_code', 'p_retry_after_seconds'],
};
const worker = createHandler({
    env: name => ({ REGISTRATION_EMAIL_WORKER_SECRET: secret, REGISTRATION_EMAIL_SEND_ENABLED: 'true',
        SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-database-key',
        EMAILJS_SERVICE_ID: 'synthetic-service', EMAILJS_PAYMENT_VERIFIED_TEMPLATE_ID: 'synthetic-template',
        EMAILJS_PUBLIC_KEY: 'synthetic-public', EMAILJS_PRIVATE_KEY: 'synthetic-private' })[name],
    fetch: async (url, init) => {
        const path = new URL(url);
        if (path.hostname === 'api.emailjs.com') {
            providerCalls++;
            return new Response(providerStatus === 200 ? 'OK' : 'Synthetic provider response', { status: providerStatus });
        }
        const rpc = path.pathname.split('/').at(-1);
        assert.ok(rpcNames[rpc], `Unexpected mocked request: ${rpc}`);
        const body = JSON.parse(init.body);
        const args = rpcNames[rpc].map(name => body[name]);
        const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
        await db.exec('set role service_role');
        try {
            const result = rpc === 'claim_registration_email'
                ? (await db.query(`select * from public.${rpc}(${placeholders})`, args)).rows
                : (await one(`select public.${rpc}(${placeholders}) as value`, args)).value;
            return new Response(JSON.stringify(result), { status: 200 });
        } finally { await db.exec('set role postgres'); }
    },
});
const work = async () => {
    const response = await worker(new Request('https://worker.invalid', {
        method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
    }));
    return { status: response.status, body: await response.json() };
};
try {
    const [roles, extensionObjects] = (await Deno.readTextFile('supabase/tests/email-recovery-fixture.sql')).split('-- EXTENSION OBJECTS');
    await db.exec(roles);
    const application = await Deno.readTextFile('supabase/tests/admin-create-fixture.sql');
    // BYPASSRLS role creation requires the fixture superuser, just as on hosted
    // Supabase. All application objects are then created by normal postgres.
    await db.exec(application.match(/^create role .*;$/gm).join('\n'));
    await db.exec('set role postgres');
    await db.exec(application.replace(/^create role .*;$/gm, ''));
    for (const file of ['20260919000000_create_registration_email_outbox.sql', '20260920000000_add_registration_email_worker_rpcs.sql']) {
        await db.exec(await Deno.readTextFile(`supabase/migrations/${file}`));
    }
    await db.exec(extensionObjects);
    const existingJob = await enqueue();
    const existingJobSnapshot = JSON.stringify(await job(existingJob));
    const existingRegistrationSnapshot = JSON.stringify((await db.query('select * from public.registrations')).rows);
    const migration = await Deno.readTextFile('supabase/archive/pg-net-recovery/20260925000000_add_registration_email_recovery.sql.disabled');
    // Only extension installation is replaced. Execute the entire helper,
    // monitoring, ACL, schedule and deactivation SQL unmodified against doubles.
    check((migration.match(/^create extension .*;$/gm) || []).length === 3, 'exact extension substitutions');
    const migrationSql = migration.replace(/^create extension .*;$/gm, '-- extension supplied by isolated fixture');
    check((await one("select current_user as role")).role === 'postgres', 'migration role is postgres');
    check(!(await one("select rolsuper from pg_roles where rolname='postgres'")).rolsuper, 'postgres is not superuser');
    check(!(await one("select pg_has_role('postgres','supabase_admin','MEMBER') as member")).member, 'postgres cannot assume extension owner');
    // Reproduce the audited bug: these REVOKEs cannot remove another grantor's
    // grants. Do not mistake statement success/warnings for effective denial.
    await db.exec('revoke all on vault.decrypted_secrets from service_role; revoke all on net.http_request_queue from public;');
    check((await one("select has_table_privilege('service_role','vault.decrypted_secrets','SELECT') as allowed")).allowed, 'owner Vault grant survives postgres REVOKE');
    check((await one("select has_table_privilege('anon','net.http_request_queue','SELECT') as allowed")).allowed, 'owner PUBLIC queue grant survives postgres REVOKE');
    const blocked = async label => {
        await assert.rejects(db.exec(migrationSql), e => e.code === '42501'); checks++;
        await db.exec('rollback; set role postgres;');
        check((await one("select to_regnamespace('wcdmr_email_private') as schema")).schema === null, `${label}: no private objects committed`);
        check(Number((await one('select count(*) as n from cron.job')).n) === 0, `${label}: no Cron job`);
        check(Number((await owner('select count(*) as n from net.http_request_queue'))[0].rows[0].n) === 0, `${label}: no HTTP request`);
        check(Number((await owner('select count(*) as n from vault.secrets'))[0].rows[0].n) === 0, `${label}: no credential installed`);
        check(JSON.stringify(await job(existingJob)) === existingJobSnapshot, `${label}: existing backlog unchanged`);
        check(JSON.stringify((await db.query('select * from public.registrations')).rows) === existingRegistrationSnapshot, `${label}: registration unchanged`);
    };
    await blocked('production-like initial grants');
    // Simulate SEPARATE owner-authorized prerequisites. Never part of migration.
    await owner('revoke all on all tables in schema net, vault from public,anon,authenticated,service_role; revoke all on all sequences in schema net,vault from public,anon,authenticated,service_role;');
    await blocked('PUBLIC extension functions still callable');
    await owner('revoke all on all functions in schema net,vault from public,anon,authenticated,service_role;');
    for (const [grant, revoke, label] of [
        ['grant select on vault.decrypted_secrets to service_role', 'revoke select on vault.decrypted_secrets from service_role', 'direct Vault view grant'],
        ['grant select on vault.secrets to authenticated', 'revoke select on vault.secrets from authenticated', 'raw Vault grant'],
        ['grant select(headers) on net.http_request_queue to anon', 'revoke select(headers) on net.http_request_queue from anon', 'column header grant'],
        ['grant select(headers) on net.http_request_queue to public', 'revoke select(headers) on net.http_request_queue from public', 'PUBLIC column grant'],
        ['grant update on net.http_request_queue to service_role', 'revoke update on net.http_request_queue from service_role', 'queue write grant'],
        ['grant select on net._http_response to public', 'revoke select on net._http_response from public', 'PUBLIC response grant'],
        ['grant usage on sequence net.http_request_queue_id_seq to public', 'revoke usage on sequence net.http_request_queue_id_seq from public', 'PUBLIC sequence grant'],
        ['grant usage on sequence net.http_request_queue_id_seq to authenticated', 'revoke usage on sequence net.http_request_queue_id_seq from authenticated', 'role sequence grant'],
        ['grant execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) to service_role', 'revoke execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) from service_role', 'Vault function grant'],
        ['grant execute on function vault.test_secret_gateway() to authenticated', 'revoke execute on function vault.test_secret_gateway() from authenticated', 'SECURITY DEFINER access path'],
        ['grant execute on function net.http_post(text,jsonb,jsonb,jsonb,integer) to public', 'revoke execute on function net.http_post(text,jsonb,jsonb,jsonb,integer) from public', 'PUBLIC HTTP function grant'],
        ['revoke execute on function cron.alter_job(bigint,text,text,text,text,boolean) from postgres', 'grant execute on function cron.alter_job(bigint,text,text,text,text,boolean) to postgres', 'missing scheduler privilege'],
    ]) {
        await owner(grant); await blocked(label); await owner(revoke);
    }
    await owner('create role indirect_reader; grant select on net.http_request_queue to indirect_reader; alter role anon noinherit; grant indirect_reader to anon;');
    check(!(await one("select has_table_privilege('anon','net.http_request_queue','SELECT') as allowed")).allowed, 'NOINHERIT hides direct privilege test');
    await blocked('SET ROLE membership access');
    await owner('revoke indirect_reader from anon; revoke select on net.http_request_queue from indirect_reader; alter role anon inherit;');
    await owner('revoke all on vault.secrets,vault.decrypted_secrets from postgres; grant select(name,decrypted_secret) on vault.decrypted_secrets to postgres;');
    // Every actual dependency is necessary; owner-only and unrelated APIs are not.
    for (const signature of [
        'vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)',
        'net.http_post(text,jsonb,jsonb,jsonb,integer)',
        'net._urlencode_string(character varying)',
        'net._encode_url_with_params_array(text,text[])', 'net.wake()',
    ]) {
        await owner(`revoke execute on function ${signature} from postgres`);
        await blocked(`missing dependency ${signature}`);
        await owner(`grant execute on function ${signature} to postgres`);
    }
    for (const [object, privilege] of [
        ['vault.decrypted_secrets', 'select(name)'],
        ['vault.decrypted_secrets', 'select(decrypted_secret)'],
        ['net._http_response', 'select(content)'],
        ['net.http_request_queue', 'insert(headers)'],
        ['net.http_request_queue', 'select(id)'],
        ['sequence net.http_request_queue_id_seq', 'usage'],
    ]) {
        await owner(`revoke ${privilege} on ${object} from postgres`);
        await blocked(`missing ${object} ${privilege}`);
        await owner(`grant ${privilege} on ${object} to postgres`);
    }
    for (const signature of [
        'vault._crypto_aead_det_encrypt(bytea,bytea,bigint,bytea,bytea)',
        'vault._crypto_aead_det_noncegen()', 'vault.test_secret_gateway()', 'net.unrelated_helper()',
    ]) check(!(await one("select has_function_privilege('postgres',$1,'EXECUTE') as allowed", [signature])).allowed, `${signature} remains owner-only`);
    check(!(await one("select has_table_privilege('postgres','vault.secrets','SELECT') as allowed")).allowed, 'raw Vault table not required');
    check(!(await one("select has_column_privilege('postgres','net.http_request_queue','headers','SELECT') as allowed")).allowed, 'queue header read not required');
    await db.exec(migrationSql);
    const schedule = await one('select * from cron.job');
    check(schedule.active === false && schedule.schedule === '* * * * *', 'job initially inactive');
    check(schedule.command === 'select wcdmr_email_private.recover_registration_emails();', 'Cron contains no credential or request body');
    check(Number((await owner('select count(*) as n from net.http_request_queue'))[0].rows[0].n) === 0, 'installation never calls HTTP');
    check(Number((await one('select count(*) as n from vault.decrypted_secrets')).n) === 0, 'installation never creates secrets');
    check(JSON.stringify(await job(existingJob)) === existingJobSnapshot, 'successful inactive install leaves backlog unchanged');
    check(JSON.stringify((await db.query('select * from public.registrations')).rows) === existingRegistrationSnapshot, 'successful inactive install leaves registration unchanged');
    await reset();
    for (const role of ['anon', 'authenticated', 'service_role']) {
        check(!(await one("select has_function_privilege($1,'wcdmr_email_private.recover_registration_emails()','execute') as allowed", [role])).allowed, `${role} helper denied`);
        await db.exec(`set role ${role}`);
        for (const sql of ['select wcdmr_email_private.recover_registration_emails()', 'select * from wcdmr_email_private.recovery_runs', 'select * from wcdmr_email_private.recovery_health', 'select * from net.http_request_queue', 'select * from net._http_response', 'select * from vault.decrypted_secrets']) {
            await assert.rejects(db.query(sql), e => e.code === '42501'); checks++;
        }
        await db.exec('set role postgres');
    }
    await tick();
    check((await latest()).outcome === 'no_work', 'empty queue does not need Vault or invoke worker');
    let id = await enqueue();
    await tick();
    check((await latest()).outcome === 'configuration_error', 'missing Vault credential fails closed');
    check((await job(id)).attempts === 0, 'scheduler never claims');
    await owner('insert into vault.secrets values($1,$2)', ['REGISTRATION_EMAIL_WORKER_SECRET', secret]);
    await owner('insert into vault.secrets values($1,$2)', ['REGISTRATION_EMAIL_WORKER_SECRET', secret]);
    await tick();
    check((await latest()).outcome === 'configuration_error', 'duplicate credential fails closed');
    await owner('truncate vault.secrets');
    for (const invalid of ['short', 'x'.repeat(4001), secret + '\r\n']) {
        await owner('insert into vault.secrets values($1,$2)', ['REGISTRATION_EMAIL_WORKER_SECRET', invalid]);
        await tick();
        check((await latest()).outcome === 'configuration_error', 'malformed credential fails closed');
        await owner('truncate vault.secrets');
    }
    await owner('insert into vault.secrets values($1,$2)', ['REGISTRATION_EMAIL_WORKER_SECRET', secret]);
    await tick();
    let run = await latest();
    const request = (await owner('select * from net.http_request_queue where id=$1', [run.request_id])).rows[0];
    check(run.outcome === 'pending', 'due row queues HTTP');
    check(request.url === 'https://xauxotzqlrylhrjababc.supabase.co/functions/v1/send-registration-email', 'fixed URL');
    check(JSON.stringify(request.body) === '{"dry_run":false}', 'unscoped one-job worker request');
    check(request.headers.Authorization === `Bearer ${secret}` && request.timeout_milliseconds === 90000, 'Vault credential and explicit timeout');
    await db.exec('select wcdmr_email_private.recover_registration_emails()');
    check(Number((await owner('select count(*) as n from net.http_request_queue'))[0].rows[0].n) === 1, 'duplicate tick cannot enqueue burst');
    await tick();
    check((await latest()).outcome === 'in_flight', 'pending invocation not duplicated on next minute');
    await db.query("update wcdmr_email_private.recovery_runs set started_at=now()-interval '4 minutes' where id=$1", [run.id]);
    await tick();
    check((await one('select outcome from wcdmr_email_private.recovery_runs where id=$1', [run.id])).outcome === 'response_unknown', 'lost HTTP response classified without requeue');
    check((await job(id)).status === 'queued' && (await job(id)).attempts === 0, 'transport monitoring never changes outbox');

    // A single invocation can consume at most one job, even with multiple due jobs.
    await reset();
    id = await enqueue();
    const second = await enqueue();
    providerCalls = 0;
    let result = await work();
    check(result.body.status === 'sent' && providerCalls === 1, 'real worker sends exactly one of two due jobs');
    check((await job(id)).status === 'sent' && (await job(second)).status === 'queued', 'second row remains queued');
    check((await job(id)).attempts === 1, 'single authorization');

    await reset(); id = await enqueue();
    const owned = await one('select * from public.claim_registration_email($1)', [id]);
    await tick(); check((await latest()).outcome === 'no_work', 'unexpired sending lease is not recovery work');
    await db.query("select public.fail_registration_email($1,$2,'pre_dispatch_failure',null)", [id, owned.claim_token]);
    check((await job(id)).next_attempt_at !== null, 'proven pre-dispatch failure is retryable');
    await tick(); check((await latest()).outcome === 'no_work', 'pre-dispatch backoff respected');
    await db.query("update public.registration_email_outbox set next_attempt_at=now()-interval '1 second' where id=$1", [id]);
    await tick(); check((await latest()).outcome === 'pending', 'due pre-dispatch retry wakes scheduler');
    await work(); check((await job(id)).status === 'sent', 'proven no-send can safely retry');
    check((await one('select public.complete_registration_email($1,$2) as done', [id, owned.claim_token])).done === false, 'old token cannot finalize newer send');

    // Full RPC lease recovery: unauthorized expired claim may be sent; an
    // authorized or legacy ambiguous claim must never reach the provider again.
    for (const mode of ['pre_send', 'authorized', 'legacy']) {
        await reset(); id = await enqueue(); providerCalls = 0;
        if (mode === 'legacy') {
            await db.query("update public.registration_email_outbox set status='sending',next_attempt_at=null where id=$1", [id]);
        } else {
            const claim = await one('select * from public.claim_registration_email($1)', [id]);
            if (mode === 'authorized') await db.query('select public.authorize_registration_email_send($1,$2)', [id, claim.claim_token]);
            await db.query("update public.registration_email_outbox set lease_expires_at=now()-interval '1 second' where id=$1", [id]);
        }
        await tick();
        check((await latest()).outcome === 'pending', `${mode}: expired-only work wakes scheduler`);
        result = await work();
        const state = await job(id);
        if (mode === 'pre_send') check(state.status === 'sent' && providerCalls === 1, 'safe expired claim recovers');
        else {
            check(state.status === 'failed' && state.last_error_code === 'delivery_unknown' && state.next_attempt_at === null, `${mode}: ambiguous held`);
            check(providerCalls === 0 && result.body.status === 'no_job', `${mode}: no ambiguous resend`);
            const again = await work();
            check(again.body.status === 'no_job' && providerCalls === 0, `${mode}: repeated wake cannot resend`);
        }
    }
    // Terminal and future jobs cannot cause scheduler HTTP requests.
    await reset(); id = await enqueue();
    for (const code of ['delivery_unknown', 'configuration_error', 'quota_exhausted', 'provider_rejected', 'invalid_registration']) {
        await db.query("update public.registration_email_outbox set status='failed',next_attempt_at=null,last_error_code=$2 where id=$1", [id, code]);
        await tick(); check((await latest()).outcome === 'no_work', `${code} held`);
    }
    await db.query("update public.registration_email_outbox set status='queued',next_attempt_at=now()+interval '1 hour',last_error_code=null where id=$1", [id]);
    await tick(); check((await latest()).outcome === 'no_work', 'future job waits');
    await db.query("update public.registration_email_outbox set next_attempt_at=now(),attempts=5 where id=$1", [id]);
    await tick(); check((await latest()).outcome === 'no_work', 'exhausted attempts excluded');

    await reset(); id = await enqueue(); providerStatus = 429; providerCalls = 0;
    result = await work();
    let state = await job(id);
    check(result.body.reason === 'rate_limited' && state.attempts === 1 && state.next_attempt_at !== null, '429 schedules existing backoff');
    await tick(); check((await latest()).outcome === 'no_work', 'scheduler respects backoff');
    await db.query("update public.registration_email_outbox set next_attempt_at=now()-interval '1 second' where id=$1", [id]);
    await db.exec('update public.registration_email_dispatch_control set next_send_allowed_at=now()');
    providerStatus = 200;
    await tick(); check((await latest()).outcome === 'pending', 'due retry wakes worker');
    result = await work();
    check(result.body.status === 'sent' && (await job(id)).attempts === 2 && providerCalls === 2, 'retry safe rejection only');
    await reset(); id = await enqueue(); providerStatus = 500; providerCalls = 0;
    await work(); await tick();
    check((await job(id)).last_error_code === 'delivery_unknown' && (await latest()).outcome === 'no_work', 'ambiguous provider response never scheduled');
    await work(); check(providerCalls === 1, 'no second provider call after ambiguous response');
    providerStatus = 200;

    await reset(); id = await enqueue();
    await db.query('update public.registration_email_outbox set attempts=4 where id=$1', [id]);
    providerStatus = 429;
    await work();
    state = await job(id);
    check(state.attempts === 5 && state.next_attempt_at === null, 'fifth rejection is not retryable');
    await tick(); check((await latest()).outcome === 'no_work', 'scheduler excludes final rejected attempt');
    providerStatus = 200;

    // Persist only numeric status and allowlisted metadata, never raw bodies.
    for (const [status, content, timedOut, expected, reason] of [
        [200, JSON.stringify({ status: 'sent', outbox_id: id }), false, 'sent', null],
        [200, JSON.stringify({ status: 'no_job' }), false, 'no_job', null],
        [200, JSON.stringify({ status: 'not_authorized', outbox_id: id, reason: 'dispatch_throttled' }), false, 'not_authorized', 'dispatch_throttled'],
        [200, JSON.stringify({ status: 'failed', outbox_id: id, reason: 'delivery_unknown', secret }), false, 'failed', 'delivery_unknown'],
        [503, JSON.stringify({ error: 'sending_disabled' }), false, 'http_error', 'sending_disabled'],
        [502, JSON.stringify({ status: 'reconciliation_required', outbox_id: id, reason: 'completion_unconfirmed' }), false, 'reconciliation_required', 'completion_unconfirmed'],
        [200, JSON.stringify({ status: secret, reason: secret }), false, 'invalid_response', null],
        [200, JSON.stringify({ status: 'sent', outbox_id: secret }), false, 'invalid_response', null],
        [200, '{not JSON ' + secret, false, 'invalid_response', null],
        [200, 'x'.repeat(5000), false, 'invalid_response', null],
        [null, secret, true, 'transport_error', null],
    ]) {
        await reset(); id = await enqueue(); await tick(); run = await latest();
        await owner('insert into net._http_response(id,status_code,content,timed_out) values($1,$2,$3,$4)', [run.request_id, status, content, timedOut]);
        await tick();
        const recorded = await one('select * from wcdmr_email_private.recovery_runs where id=$1', [run.id]);
        check(recorded.outcome === expected && recorded.reason === reason, `sanitized ${expected}`);
        check(!JSON.stringify(recorded).includes(secret), 'credential absent from monitoring');
    }
    await reset(); id = await enqueue();
    await owner('update net.test_configuration set fail_enqueue=true');
    await tick();
    check((await latest()).outcome === 'enqueue_failed', 'enqueue exception sanitized');
    check(Number((await owner('select count(*) as n from net.http_request_queue'))[0].rows[0].n) === 0, 'partial enqueue rolled back');
    check((await job(id)).attempts === 0, 'enqueue failure never modifies outbox');
    await owner('update net.test_configuration set fail_enqueue=false');
    const health = await one('select * from wcdmr_email_private.recovery_health');
    check(Number(health.due_jobs) === 1 && health.last_tick_at !== null, 'private health reports backlog and heartbeat');
    await owner("insert into cron.job(jobname) values('unrelated'); insert into cron.job_run_details values(1,1,now()-interval '31 days'),(2,2,now()-interval '31 days');");
    await db.exec("update wcdmr_email_private.recovery_runs set started_at=now()-interval '31 days';");
    await tick();
    check((await one('select count(*) as n from cron.job_run_details')).n === 1, 'retention only cleans own Cron history');
    check(Number((await one("select count(*) as n from wcdmr_email_private.recovery_runs where started_at<now()-interval '30 days'")).n) === 0, 'bounded monitoring retention');
    console.log(`PASS: ${checks} isolated scheduler/worker assertions. No network or live database used. pg_cron/pg_net/Vault are test doubles; independent-connection races and extension installation are not simulated.`);
} finally { await db.close(); }

// Isolated in-memory SQL validation; requires an already-installed PGlite module.
// deno run --unstable-bare-node-builtins --node-modules-dir=none --no-lock --cached-only --allow-read --allow-env --deny-net --deny-write --deny-run --deny-ffi scripts/admin-create-sql_test.mjs file:///path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
if (!Deno.args[0]?.startsWith('file:')) throw new Error('Supply a local file: URL for PGlite; network imports are not permitted.');
const { PGlite } = await import(Deno.args[0]);
const db = new PGlite();
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
const one = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
const count = async table => Number((await one(`select count(*) as n from public.${table}`)).n);
const reject = async (sql, args, code) => { await assert.rejects(db.query(sql,args), e=>e.code===code); checks++; };
const actor = '22222222-2222-4222-8222-222222222222';
const otherActor = '33333333-3333-4333-8333-333333333333';
let serial = 0;
const uuid = () => `11111111-1111-4111-8111-${String(++serial).padStart(12,'0')}`;
const fields = {
 first_name:' Synthetic  First ',last_name:'Registrant',email:' TEST@EXAMPLE.COM ',phone:'555-0100',
 address_line:'Test address',city:'Test city',zip_code:'00000',church_name:'Test church',
 emergency_name:'Test contact',emergency_phone:'555-0101',payment_method:'zelle',amount_due:245,
};
const create = async (id, body=fields, user=actor, reviewed=true) => (await one('select public.admin_create_registration($1,$2,$3,$4) as result',[id,user,body,reviewed])).result;
try {
 await db.exec(await Deno.readTextFile('supabase/tests/admin-create-fixture.sql'));
 for (const file of ['20260919000000_create_registration_email_outbox.sql','20260920000000_add_registration_email_worker_rpcs.sql','20260922000000_add_admin_registration_creation.sql']) {
   await db.exec(await Deno.readTextFile(`supabase/migrations/${file}`));
 }
 for (const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   await reject('select * from public.admin_registration_requests',[],'42501');
   await reject('select public.admin_create_registration($1,$2,$3,true)',[uuid(),actor,fields],'42501');
   await db.exec('reset role');
 }
 check((await one("select relrowsecurity from pg_class where oid='public.admin_registration_requests'::regclass")).relrowsecurity,'receipt RLS');
 check(!(await one("select prosecdef from pg_proc where oid='public.admin_create_registration(uuid,uuid,jsonb,boolean)'::regprocedure")).prosecdef,'RPC security invoker');
 await db.exec('set role service_role');
 const requestId = uuid();
 const created = await create(requestId);
 check(created.status==='created','created');
 const row = await one('select * from public.registrations where id=$1',[created.id]);
 for (const [key,value] of Object.entries({source:'admin_import',registration_status:'pending',payment_status:'not_started',currency:'USD',payment_understanding:false,updated_by:actor,first_name:'Synthetic First',email:'test@example.com'})) check(row[key]===value,key);
 check(Number(row.amount_received)===0 && Number(row.amount_due)===245,'amounts');
 for (const key of ['payment_claimed_at','payment_verified_at','payment_verified_by','payment_provider_transaction_id','payment_provider_payer_id','payment_provider_event_id']) check(row[key]===null,key);
 check(await count('registration_email_outbox')===0,'creation does not enqueue email');
 const receipt = await one('select * from public.admin_registration_requests where request_id=$1',[requestId]);
 check(receipt.created_by===actor && receipt.admin_reviewed===true && /^[a-f0-9]{64}$/.test(receipt.request_fingerprint),'receipt audit');
 await reject('update public.admin_registration_requests set admin_reviewed=false',[],'42501');
 await reject('delete from public.admin_registration_requests',[],'42501');
 check((await create(requestId)).status==='replayed','identical retry');
 check((await create(requestId,{...fields,phone:'555-0102'})).status==='request_conflict','changed request rejected');
 check((await create(requestId,fields,otherActor)).status==='request_conflict','other actor rejected');
 const duplicate = await create(uuid(),{...fields,first_name:'synthetic\tfirst',last_name:'REGISTRANT',email:'test@example.com'});
 check(duplicate.status==='duplicate_registration' && duplicate.id===created.id,'normalized duplicate');
 check(await count('registrations')===1 && await count('admin_registration_requests')===1,'no duplicate or partial receipt');
 // Different family members may share an email. All three supported methods stay unverified.
 for (const method of ['paypal','money_order']) {
   const result = await create(uuid(),{...fields,first_name:method,payment_method:method});
   check(result.status==='created','different person sharing email');
   check((await one('select payment_status from public.registrations where id=$1',[result.id])).payment_status==='not_started','method pending');
 }
 for (const body of [{...fields,payment_status:'verified'},{...fields,source:'website'},{...fields,payment_understanding:true},{...fields,first_name:''},{...fields,amount_due:1.001},{...fields,amount_due:'245'},{...fields,amount_due:100001},{...fields,email:'a@example.com,b@example.com'},{...fields,youth_info:'x'.repeat(2001)}]) check((await create(uuid(),body)).status==='invalid_details','invalid fields');
 check((await create(uuid(),fields,actor,false)).status==='invalid_details','review required');
 const before = await count('registrations');
 await assert.rejects(create(uuid(),{...fields,email:'rollback@example.com'},'99999999-9999-4999-8999-999999999999'),e=>e.code==='23503'); checks++;
 check(await count('registrations')===before,'receipt FK failure rolls insert back');
 // The same unique index protects direct public inserts, identity edits, and restoration.
 const publicInsert = `insert into public.registrations(client_registration_id,first_name,last_name,full_name,email,phone,address_line,city,zip_code,full_address,church_name,emergency_name,emergency_phone,payment_method,amount_due) values ($1,'Synthetic First','Registrant','Synthetic First Registrant','test@example.com','555','Test','Test','00000','Test','Test','Test','555','zelle',245)`;
 await reject(publicInsert,[uuid()],'23505');
 await db.query('update public.registrations set deleted_at=now() where id=$1',[created.id]);
 check((await create(requestId)).status==='registration_deleted','deleted retry cannot recreate');
 const publicId = uuid(); await db.query(publicInsert,[publicId]);
 check((await create(publicId,{...fields,email:'other@example.com'})).status==='request_conflict','website UUID never overwritten');
 check((await create(uuid())).status==='duplicate_registration','admin against existing public row');
 await reject('update public.registrations set deleted_at=null where id=$1',[created.id],'23505');
 const editTarget = (await one("select id from public.registrations where first_name='paypal'")).id;
 await reject("update public.registrations set first_name='Synthetic First' where id=$1",[editTarget],'23505');
 // Replay survives later edits/verification and cannot issue another outbox event.
 const editRequest = (await one('select request_id from public.admin_registration_requests where registration_id=$1',[editTarget])).request_id;
 await db.query("update public.registrations set first_name='Edited',payment_status='verified',registration_status='completed',amount_received=245,payment_verified_at=now() where id=$1",[editTarget]);
 check((await create(editRequest,{...fields,first_name:'paypal',payment_method:'paypal'})).status==='replayed','replay after edits');
 check(await count('registration_email_outbox')===1,'only explicit verification enqueues');
 const concurrentId=uuid();
 const outcomes=await Promise.all([create(concurrentId,{...fields,email:'parallel@example.com'}),create(concurrentId,{...fields,email:'parallel@example.com'})]);
 check(outcomes.map(x=>x.status).sort().join(',')==='created,replayed','queued simultaneous retries');
 const dupOutcomes=await Promise.all([create(uuid(),{...fields,email:'parallel2@example.com'}),create(uuid(),{...fields,email:'parallel2@example.com'})]);
 check(dupOutcomes.map(x=>x.status).sort().join(',')==='created,duplicate_registration','queued different UUID duplicates');
 // Canonical numeric scale must not change the fingerprint.
 const amountId=uuid(); const amountFields={...fields,email:'cents@example.com',amount_due:1.1};
 await create(amountId,amountFields); check((await create(amountId,amountFields)).status==='replayed','numeric fingerprint stable');
 console.log(`PASS: ${checks} isolated SQL assertions. No live database or network used. PGlite serializes client queries; independent-connection race testing is not simulated.`);
} finally { await db.close(); }

// New conflicts must stop the migration, not trigger cleanup or partial schema changes.
const conflictDb = new PGlite();
try {
 await conflictDb.exec(await Deno.readTextFile('supabase/tests/admin-create-fixture.sql'));
 await conflictDb.exec(`insert into public.registrations(client_registration_id,first_name,last_name,full_name,email,phone,address_line,city,zip_code,full_address,church_name,emergency_name,emergency_phone,payment_method,amount_due)
 select gen_random_uuid(),'Same','Person','Same Person','duplicate@example.com','555','Test','Test','00000','Test','Test','Test','555','zelle',245 from generate_series(1,2)`);
 await assert.rejects(conflictDb.exec(await Deno.readTextFile('supabase/migrations/20260922000000_add_admin_registration_creation.sql')), e=>e.code==='23505');
 await conflictDb.exec('rollback');
 const { rows } = await conflictDb.query("select to_regclass('public.admin_registration_requests') as receipt_table, (select count(*) from public.registrations) as registrations");
 assert.equal(rows[0].receipt_table,null);
 assert.equal(Number(rows[0].registrations),2);
 console.log('PASS: 3 additional assertions: conflicting preexisting rows abort migration without cleanup or partial schema changes.');
} finally { await conflictDb.close(); }

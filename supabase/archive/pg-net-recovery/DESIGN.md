# Superseded — do not deploy

Supabase Support confirmed hosted pg_net PUBLIC grants cannot be hardened.
This historical proposal is retained for review only, outside migrations.
Its simulated owner-hardening tests do not establish hosted compatibility.

### Automatic email recovery (installed inactive)

`20260925000000_add_registration_email_recovery.sql` adds Supabase Cron
(`pg_cron`) + asynchronous HTTP (`pg_net`) recovery. This is the
[Supabase-native scheduling pattern](https://supabase.com/docs/guides/functions/schedule-functions).
It depends on the existing outbox and four worker RPCs, which remain unchanged.
The migration is project-specific: its fixed worker URL targets
`xauxotzqlrylhrjababc`. Review that URL before using the migration in any other
project. Installation requests the extensions, checks owner-level security
prerequisites, and only then creates one named job. It creates no credential,
sends no HTTP request, and changes no outbox/registration records. A failed
precondition aborts the entire transaction, including any new extension installs. Scheduling and deactivation happen in one transaction with no active
window. **Do not activate until configuration and the existing backlog have been
reviewed.** Activation may send any existing due eligible row.

The private, SECURITY INVOKER helper
`wcdmr_email_private.recover_registration_emails()` is executable only by its
owner, `postgres`. It is not a browser or service-role RPC. The Cron command
contains only this function call. The helper reads exactly one Vault entry named
`REGISTRATION_EMAIL_WORKER_SECRET`, validates it, and constructs the bearer
header internally. That Vault value must match the Edge Function secret of the
same name. Supabase Vault and Edge Function secrets are separate stores; updating
one does not update the other. Missing, duplicate, or malformed Vault entries fail
closed with `configuration_error`. No service-role key or EmailJS credential is
copied into Vault or Cron.

The job runs every minute when activated:

- Collect prior asynchronous HTTP results into sanitized monitoring.
- Invoke the worker only if there is a due queued/retryable failed job, or an
  expired `sending` claim. Expired-only work must wake the worker too.
- Send exactly one `{"dry_run":false}` request, without an `outbox_id`, with a
  90-second HTTP timeout. The existing worker consumes at most one email per
  invocation; recovery may classify multiple expired leases without sending them.
- A transaction advisory lock and 55-second guard prevent scheduler bursts.
  Pending scheduler requests suppress further calls for up to three minutes;
  after that a missing response is recorded as `response_unknown`. This is an
  observation about HTTP, **not** permission to reset or resend the underlying job.
- Never claim, reset, requeue, or finalize outbox rows itself. Only the worker's
  existing fenced RPCs do that. Immediate Admin dispatch can run concurrently;
  row locking, claim tokens, and the shared rate gate remain authoritative.

Safe retries still require `next_attempt_at` to be due and fewer than five send
authorizations. The existing RPC backoff, jitter, `Retry-After`, and shared rate
gate remain unchanged. Future, sent, terminal, and exhausted jobs are excluded.
An expired claim without send authorization can recover; an expired authorized
send (or legacy claim without a token) becomes `delivery_unknown` with no next
attempt. Provider timeouts/ambiguous responses and accepted-but-unconfirmed sends
must never cause automatic resending. Exact end-to-end delivery cannot be
atomically guaranteed across EmailJS and Postgres; uncertainty deliberately
requires manual provider-history reconciliation. Do not blanket-requeue failed
jobs. Existing `REGISTRATION_EMAIL_SEND_ENABLED` is still the send kill switch,
and `REGISTRATION_EMAIL_ALLOWED_OUTBOX_ID` must remain absent for general recovery.

Monitoring is private and available read-only from the Supabase SQL Editor as
`postgres` (no worker invocation):

```sql
select * from wcdmr_email_private.recovery_health;
select started_at, finished_at, request_id, http_status, outcome, reason, outbox_id
from wcdmr_email_private.recovery_runs order by id desc limit 50;
```

The health view reports heartbeat, last request time, due-job count/oldest due
timestamp, expired leases, and manual-review/unknown-delivery counts. Investigate
a missing heartbeat for more than five minutes while the job is active, due work
older than five minutes, persistent expired leases, configuration/HTTP errors,
and any manual-review outcome. These are operational thresholds, not automatic
resend rules. This implementation provides dashboard/SQL monitoring; it does
not configure an external alert destination. Cron success only proves the SQL
tick ran; HTTP 200 can still contain `failed` or `not_authorized`. Only the
canonical outbox `sent` state confirms worker completion. A late HTTP response
after `response_unknown` does not supersede canonical outbox state.

Durable monitoring stores only timestamps, request/outbox IDs, numeric HTTP
status, and allowlisted outcomes/reasons. It never stores raw exceptions,
response bodies, headers, credentials, or registration personal data. The
internal pg_net queue necessarily holds the bearer header until dispatch;
browser/service-role/PUBLIC access to extension relations, columns, sequences,
and callable APIs must already have been restricted by their actual owner.
The migration verifies effective privileges before continuing. Its own private
monitoring objects are owned by postgres and have explicit revocations. Do not expose these internal
objects in API schemas or copy them into application logs. Retention deletes at
most 1,000 completed monitoring entries and 1,000 **this job's** Cron history
entries older than 30 days per tick; it never deletes outbox or registration
records. If the job is paused, automatic retention also pauses.

Permission preconditions and remaining production limitation:

- On hosted Supabase, Vault/pg_net objects can be owned by `supabase_admin`.
  A `postgres` grant option is not authority to revoke grants made by that owner.
  The migration no longer attempts these ineffective extension-object REVOKEs,
  changes ownership, switches to a superuser, or installs a privilege bypass.
- A separately authorized, provider-supported **extension-owner** operation must
  restrict grants before this migration can succeed. Do not assume the SQL Editor
  or CLI's normal `postgres` role can perform that operation. If no supported
  owner-level path is available, rollout is blocked; do not weaken the checks.
- Required denial: `PUBLIC`, `anon`, `authenticated`, `service_role`, and any roles
  reachable through their memberships must have no privileges on Vault/pg_net
  relations or columns, no sequence access, and no execution access to functions
  in those schemas. This includes raw Vault storage, its decrypted view, HTTP
  queue headers, response storage, and alternative SECURITY DEFINER APIs. Schema
  USAGE alone is allowed; it does not confer data/function access. The check is
  deliberately conservative for NOINHERIT memberships, which may permit SET ROLE.
- Required preservation: `postgres` needs schema USAGE, decrypted-view SELECT,
  outbox SELECT, HTTP queue INSERT/returned-ID SELECT and sequence usage, HTTP
  response SELECT, execution of the Vault/pg_net dependency functions, Cron
  schedule/alter execution, and Cron history SELECT/DELETE. Managed extension
  owners/background workers keep their own privileges. Review any unrelated
  consumers before owner-level hardening and preserve their specifically needed
  access; this project does not need the denied client roles to use those APIs.
- Privilege assertions raise SQLSTATE `42501` with object/role names only. Both insufficient
  isolation and missing scheduler privileges abort **before** private objects or
  Cron jobs are installed. No decrypted values are selected by these assertions.
- The audited production defaults do **not** pass. Vault currently grants
  service-role access from `supabase_admin`; pg_net defaults expose internal
  tables/sequences through PUBLIC. A fresh extension installation will normally
  fail the gate and roll back. This migration is intentionally not a one-step
  unattended install under those defaults.
- Re-audit grants after extension upgrades or privilege changes; installation
  assertions do not prevent a privileged operator from later regranting access.
  Never activate or install a credential without checking the current grants.

Future rollout, requiring separate authorization:

1. Run the offline tests below. In an isolated Supabase/Postgres environment,
   verify actual extension installation, owner/grantor behavior, inactive job
   creation, and independent-connection claim races. The PGlite doubles exercise
   PostgreSQL ACLs but cannot certify hosted extension/background-worker behavior.
2. Resolve the owner-level prerequisite through a supported administrative path,
   without installing the worker credential or activating any email job. Recheck
   effective privileges read-only. Enabling/hardening production extensions is a
   separate action requiring authorization; it has not been performed here.
3. Apply the migration **as postgres**, preserving its transaction boundary. Any
   failed assertion requires a rollback, not skipped statements. Confirm the
   named Cron job `wcdmr-registration-email-recovery` is inactive. No Edge Function
   or frontend deployment is required for this scheduler.
4. Only after installation and permission review, securely store the existing
   dedicated worker credential in Vault as `REGISTRATION_EMAIL_WORKER_SECRET`.
   Never put it in Git, copied SQL scripts, screenshots, or logs. Keep gateway JWT
   verification disabled: the worker authenticates this dedicated bearer itself.
   Confirm sending is enabled and the test-row restriction is absent.
5. Review the backlog and separately enable the named job in Supabase Dashboard
   → Cron. Inspect its history, sanitized results, and canonical outbox states.
   No terminal or Codex session is needed for subsequent operation.
6. To pause scheduled processing, deactivate that named job in the Dashboard.
   An already queued/running HTTP request may finish; deactivation is not an
   in-flight cancellation. The worker send-enable flag also affects immediate
   Admin dispatch. Never clear claims or reset attempts as a pause mechanism.

Offline verification (only synthetic fixtures; already-cached dependencies):

```sh
deno test --node-modules-dir=none --no-lock --cached-only --deny-net --deny-env --deny-read --deny-write --deny-run --deny-ffi supabase/functions/send-registration-email/worker_test.ts supabase/functions/admin-registrations/handler_test.ts
deno run --unstable-bare-node-builtins --node-modules-dir=none --no-lock --cached-only --allow-read --allow-env --deny-net --deny-write --deny-run --deny-ffi scripts/email-recovery_test.mjs file:///absolute/path/to/pglite/dist/index.js
```

The isolated suite executes the new migration with only its three extension
installation statements replaced by local test doubles. It runs the actual
worker against the actual existing SQL RPCs and a fake EmailJS transport. Tests
first reproduce the ineffective postgres REVOKEs against supabase_admin grants.
The migration and scheduler run as a separate, non-superuser postgres role, not
as PGlite's bootstrap superuser. A renamed bootstrap role and a separate session
superuser are used solely for synthetic fixture setup. The tests explicitly
give postgres ownership of the isolated database to permit schema creation
(PGlite cannot GRANT on its template1 catalog row); extension objects remain
owned by supabase_admin. This does not confer extension-owner or superuser rights.
The tests simulate a separate owner-authorized hardening step; the production migration
never performs that step. Negative cases cover direct, inherited/SET ROLE,
PUBLIC, column, sequence, and function grants, missing scheduler privileges,
transaction rollback, and no job/request/secret/backlog mutation on failure.
Additional cases cover inactive installation, due/expired-only wakeups, missing
credentials, duplicate/pending ticks, transport uncertainty, sanitized outcomes,
one email per invocation, safe lease recovery, ambiguous-delivery holds, retry
timing, terminal exclusions, and bounded retention. PGlite serializes queries;
it does not simulate independent-connection races, hosted Cron execution, Vault
encryption, or real HTTP background workers. No live services are contacted.

# Supabase registration backend

This directory contains the source for the deployed Supabase Edge Functions.
It must not contain secrets.

## Required Supabase secrets

Set these in the Supabase Edge Functions secrets dashboard before deployment:

```text
ALLOWED_ORIGIN=https://www.wcdmr.com
ADMIN_EMAILS=organizer@example.com
TURNSTILE_SECRET_KEY=<secret>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only function
environment values. Never add their values to this repository or browser code.

## Functions

- `public-register` accepts a validated, Turnstile-protected public
  registration and creates one pending record idempotently.
- `admin-registrations` requires a signed-in Supabase user whose email is in
  `ADMIN_EMAILS`; it lists, creates, edits, verifies, and soft-deletes registrations.
  After a successful new payment verification, it automatically invokes
  `send-registration-email` server-to-server for that registration's outbox row.
- `send-registration-email` is a server-only, one-job outbox worker. Its source
  and offline tests are included; adding these files does not deploy or run it.

The frontend uses these functions as its registration source of truth. Do not
put function secrets, database credentials, or access tokens in this directory.

## Admin-to-worker authentication diagnostic (local preparation only)

`GET /functions/v1/admin-registrations/email-worker-auth-check` requires the same
configured origin, Supabase JWT-authenticated user, and `ADMIN_EMAILS` allowlist
as other admin operations. Platform JWT verification remains enabled. No browser
UI or scheduled invocation is added.

The route uses only server-side `REGISTRATION_EMAIL_WORKER_SECRET` to POST
the fixed body `{"dry_run":true}` to the configured project's email worker. It
accepts no query parameters or client overrides; non-GET requests are rejected
(the existing CORS preflight remains available). It never calls the admin
database dependency or the sending helper. Worker dry-runs perform SELECTs only,
without changing registrations, claiming jobs, or contacting the email provider.

The response body is only `{"result":"PASS"}` (HTTP 200) or
`{"result":"FAIL"}`. Origin/authentication failures retain HTTP 403/401;
unsupported methods use 405, query parameters use 400, and configuration or worker
failures use 503. Responses disable caching with `Cache-Control: no-store`.
PASS requires worker HTTP 200 with `dry_run: true` and status `preview` or `no_job`.
Requests disallow redirects, abort after 25 seconds, and cap worker response bodies
at 4096 bytes. No worker data, credentials, or raw errors are returned or logged.

Offline tests mock every external request, including JWT authentication, and
cover access restrictions, fixed dry-run requests, sanitization, invalid
configuration, oversized responses, and the real timeout. This preparation does
not deploy or invoke a live function, change secrets, or enable scheduling.

The temporary **Test Email Connection** button in `/admin/` is local preparation.
Only a click issues the diagnostic GET, using the current tab's admin JWT; the
browser supplies the page origin for the server's existing restriction. No worker
credential enters the browser. The button displays only PASS or FAIL, disables
repeat clicks during a request, and discards results after logout or a login
change. It disallows redirects and caching and aborts after 30 seconds. It does
not refresh, create, edit, or verify registrations, call the worker directly, or
enable any scheduled task.

```sh
deno test --no-check --node-modules-dir=none --no-lock --cached-only --allow-read=admin-app.js,admin/index.html,supabase-client.js --deny-net --deny-env --deny-write --deny-run --deny-ffi scripts/admin-email-connection_test.js scripts/admin-create_test.js scripts/admin-delete_test.js scripts/supabase-client_test.js
```

## Admin creation (local implementation; migration required)

`20260922000000_add_admin_registration_creation.sql` adds the server-only
`admin_registration_requests` receipt table, `admin_create_registration` RPC,
and `registrations_active_identity_unique` index. Adding these files does not
apply the migration or deploy any function. The migration depends on the existing
registrations schema inspected on September 22, 2026. It performs no backfill,
merging, deletion, or payment verification. If conflicting active identities
exist when the index is created, the transaction fails without changing them.

Admin POST requests use `{ request_id, registration, admin_reviewed: true }`.
The registration object accepts first/last name, email, phone, optional videophone,
address line/city/ZIP, church, emergency name/phone, optional bunk/youth information,
payment method, and amount due. Other fields, including payment/registration
status, received amount, source, and audit identities, are rejected. The Edge
Function checks the same origin, JWT-authenticated user, and `ADMIN_EMAILS` as
existing admin actions. Only the server supplies the actor UUID to the RPC.

The RPC inserts `source = admin_import`, `registration_status = pending`,
`payment_status = not_started`, `amount_received = 0`, and `currency = USD`.
Verification, claimed-payment, and provider fields are null. It derives full
name/address, records the creator and immutable original-payload fingerprint,
and stores the admin-review acknowledgement separately from the registrant's
`payment_understanding` (which remains false). Creation does not call the email
worker or create a payment-verification outbox event. Received Zelle/money-order
payments can be explicitly verified afterward using the existing Edit action;
the current UI does not expose PayPal verification.

The existing unique `client_registration_id` is reused for request UUIDs.
Same-UUID retries are serialized within the database transaction. Matching
creator/payload retries return the original registration without updating it;
changed payloads or actors conflict. A retry for a subsequently deleted record
returns a conflict instead of recreating it. The receipt and registration commit
atomically. Only the service role has RPC execution and receipt SELECT/INSERT;
receipt UPDATE/DELETE and browser access are not granted.

The active identity index applies to public and admin inserts, identity edits,
and undeletes. It compares trimmed lowercase email and lowercase first/last
names with collapsed/trimmed whitespace, only where `deleted_at IS NULL`.
Cancelled, non-deleted records still reserve the identity. Different names may
share an email. Name edits now require structured first/last names and derive
`full_name`, so the index inputs cannot silently diverge from the displayed name.
This rule is for the current retreat; a future multi-event schema must include
event identity. It cannot identify one person using different names/emails.

The Add Registration form is enabled only after a successful live list load.
It keeps an uncertain submission's exact payload/UUID in memory across retries
and Close/reopen, freezes its fields, and blocks double submits. Definitive
validation failures permit corrections; conflicts require review. Refreshing
or closing the browser loses the in-memory draft; the database identity index
still prevents an exact active duplicate. No create draft or registration is
read from or written to browser storage. Confirmed creation is followed by a
live reload; a failed reload keeps the dashboard unavailable and explicitly
reports that creation already succeeded. A duplicate can be reviewed in the
current 500-row list, or its reference is shown if it is outside that window.

`public-register` still requires successful Turnstile verification before any
insert. Its only behavior change is a sanitized HTTP 409 for database uniqueness
conflicts. No public bypass or direct browser database permission is added.

### Offline creation tests

Backend tests mock all I/O, including Turnstile and email. Frontend tests run the
actual admin script against synthetic DOM/storage/API adapters. No server or
live function is started. Run from the repository root:

```sh
deno test --node-modules-dir=none --no-lock --cached-only --deny-net --deny-env --deny-read --deny-write --deny-run --deny-ffi supabase/functions/admin-registrations/ supabase/functions/public-register/index_test.ts
deno test --node-modules-dir=none --no-lock --cached-only --allow-read=admin-app.js --deny-net --deny-env --deny-write --deny-run --deny-ffi scripts/admin-create_test.js
# Shared client error metadata (also offline):
deno test --node-modules-dir=none --no-lock --cached-only --allow-read=supabase-client.js --deny-net --deny-env --deny-write --deny-run --deny-ffi scripts/supabase-client_test.js
```

The SQL test uses an already-installed local PGlite module (validated with
0.3.14), a synthetic baseline in `supabase/tests/admin-create-fixture.sql`, and
an in-memory database. It exercises migration constraints, ACLs, rollback,
idempotency, duplicate inserts/edits/restoration, and outbox isolation. It never
connects to Supabase. PGlite serializes its client queries, so queued simultaneous
calls do not substitute for an independent-connection PostgreSQL race test.
Do not run the fixture against a project database.

```sh
deno run --unstable-bare-node-builtins --node-modules-dir=none --no-lock --cached-only --allow-read --allow-env --deny-net --deny-write --deny-run --deny-ffi scripts/admin-create-sql_test.mjs file:///absolute/path/to/pglite/dist/index.js
```

## Registration email worker

Requires the applied `20260920000000_add_registration_email_worker_rpcs.sql`
migration. It uses the four transactional RPCs for all state changes; it never
patches registrations or the outbox directly. `currency character(3)` is
supported: the authorization snapshot supplies `USD` as a JSON string.

### Server configuration

| Environment value | Requirement |
| --- | --- |
| `REGISTRATION_EMAIL_WORKER_SECRET` | Dedicated, randomly generated bearer credential, at least 32 characters (prefer 32 random bytes encoded as hex). Never reuse a public key or user JWT. |
| `REGISTRATION_EMAIL_WORKER_SECRET_NEXT` | Optional staged rotation credential, 32–4000 characters. Worker compatibility still accepts either valid credential. Admin email dispatch and its diagnostic use the original secret name only, with no fallback to NEXT. The original remains mandatory for the worker. Keep NEXT configured until the updated admin is deployed and verified. |
| `REGISTRATION_EMAIL_SEND_ENABLED` | Only the exact string `true` enables sends. Missing or any other value disables them. |
| `REGISTRATION_EMAIL_ALLOWED_OUTBOX_ID` | Set to the existing queued test row's UUID for the initial controlled test. Requests for any other UUID are rejected; omitted request IDs resolve to this UUID. Removing the restriction enables general queue processing. |
| `EMAILJS_SERVICE_ID` | Connected sender service ID. |
| `EMAILJS_PAYMENT_VERIFIED_TEMPLATE_ID` | Dedicated payment-verified template ID. |
| `EMAILJS_PUBLIC_KEY` | EmailJS account public key, sent as `user_id`. |
| `EMAILJS_PRIVATE_KEY` | EmailJS private key, sent as `accessToken`; mandatory for actual sends. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only Supabase environment values. |

No values are supplied by the source code. Keep sending disabled and restrict
the allowed UUID to the existing test job until the recipient and template have
been reviewed. The existing queued row is not claimed by deployment or a dry-run.
Immediate invocation comes from `admin-registrations`. The optional GitHub
Actions recovery workflow is a **disabled draft**; no database scheduler migration
is needed. There is no direct browser invocation of the worker.

### Automatic payment-verification dispatch and diagnostics

After a successful PATCH transitions payment status from a non-verified value
to `verified` and returns registration status `completed`, the admin handler
awaits the email helper. The database trigger has already committed the
`payment_verified` outbox row. The helper looks up that row and POSTs
`{ "outbox_id": "<row UUID>", "dry_run": false }` to the worker using the
server-only `REGISTRATION_EMAIL_WORKER_SECRET` bearer credential. The worker's
send-enable flag, allowed-outbox restriction, and eligibility checks still apply.
Ordinary edits, repeated verification, failed writes, and concurrent verification
conflicts do not dispatch; rows already marked sent are skipped. This path makes
one worker request and does not schedule retries for queued or failed jobs.

The helper uses a 25-second abort deadline for lookup and worker processing.
Email failures do not undo the committed verification or change its successful
admin response. A send is confirmed only when the worker returns `status: "sent"`
with the matching outbox ID; HTTP 200 alone is insufficient.

Unconfirmed sends log `Registration saved; payment verification email not
confirmed`, the `registration_id`, and a safe `code`: `configuration_error`,
`outbox_lookup_failed`, `worker_request_failed`, `worker_did_not_confirm_send`, or
`email_processing_timeout`. Once the worker-request phase starts, logs also
include a locally defined `error_category`: `http_error`, `transport_error`,
`request_aborted`, `timeout`, `invalid_json`, `response_read_error`, or
`send_not_confirmed`. The numeric worker `http_status` is included only when a
response was received. These diagnostics exclude raw exceptions, response
bodies, headers, worker secrets, EmailJS credentials, and registration personal
fields such as names and email addresses; the registration UUID remains for
correlation. A timeout or unconfirmed response does not prove no email was sent.

EmailJS must allow non-browser requests and private-key authorization. Check
the impact of account-wide settings on existing browser email flows. Use a
template without CAPTCHA, auto-replies, attachments, CC, or BCC. Configure:

- To Email: `{{to_email}}`; To Name: `{{to_name}}`; Subject: `{{subject}}`.
- Fixed From Name: `West Coast Deaf Men's Retreat`; From Email: the connected
  service's authorized sender; fixed Reply-To: `wcdeafmr@gmail.com`.
- Body: use the existing `emailjs-registration-confirmation-template.html`
  layout with escaped double-brace variables, never unescaped triple braces.
- Complete variable contract: `to_email`, `to_name`, `subject`, `email_heading`,
  `intro_copy`, `amount_label`, `amount`, `reference_label`, `payment_id`,
  `event_dates`, `venue`, `venue_address`, `next_step_one`, `next_step_two`,
  `next_step_three`, `outro_copy`, `support_copy`, `rsvp_link`, `facebook_link`,
  `instagram_link`. No `message` HTML document or legacy aliases are sent.

`amount` is the verified `amount_received`, formatted to two decimals;
`payment_id` is the registration UUID labeled **Registration reference**.
Names, recipient, and amount come only from the database; event details and
links are fixed in `worker.ts`. Review those constants with the template before
enabling a send.

### Request and response contract

Only POST with `Content-Type: application/json` and
`Authorization: Bearer <credential>` is accepted, where the credential exactly
matches the mandatory `REGISTRATION_EMAIL_WORKER_SECRET` or a valid optional
`REGISTRATION_EMAIL_WORKER_SECRET_NEXT` during rotation. The
platform JWT check is disabled only for this function; the handler verifies
its dedicated secret before any database access. There is no browser CORS grant.
The body is limited to 1 KiB and accepts only an optional UUID `outbox_id` and
an optional boolean `dry_run`. `{}` defaults to a dry-run. Only explicit
`"dry_run": false`, together with the server enable flag, can send.

Dry-runs perform SELECT requests only. A preview reports eligibility, masked
recipient, amount, currency, template ID, configuration readiness, and queue
state. They never claim jobs, increment attempts, recover leases, or call
EmailJS. The preview is advisory: the RPC rechecks current eligibility and rate
availability before a real send. A general preview does not recover stale jobs.

Responses use `status` values `preview`, `no_job`, `not_authorized`, `sent`,
`failed`, or `reconciliation_required`; request/configuration failures use
`error`. HTTP 200 means processing completed, not necessarily an email was sent:
inspect `status` and `reason`. `sent` means EmailJS returned its documented
acceptance response, not confirmed inbox delivery. A repeated request for a
sent row is a no-op. Preview eligibility does not override the send-enable flag.

Claim/authorization RPCs are never retried. Each authorized attempt makes at
most one EmailJS POST, with a 15-second deadline and redirects disabled. An
explicit 429 rejection uses SQL backoff and `Retry-After`; recognized quota
errors, other permanent rejections, and configuration errors require correction.
Timeouts, network failures after dispatch, 408/5xx responses, and unexpected
success bodies become `delivery_unknown` and require review. Only a failure
known to occur before dispatch is classified `pre_dispatch_failure`.

The database enforces the shared rate gate, five-attempt limit, retry delays,
and lease recovery. Existing browser sends can still share the provider limit.
Failure/completion updates may be retried up to three times (10-second database
request deadlines). A lost completion response is reconciled against the sent
state. Provider acceptance with unconfirmed database completion returns HTTP
502 with `provider_accepted: true`; failed failure-recording returns HTTP 503.
Neither case repeats the email. An unresolved lease is left for the existing
RPC recovery and manual review. Never reset an uncertain job without reviewing
provider history: EmailJS does not provide a documented send idempotency key.
No raw provider bodies, credentials, or registration records are logged.

### Offline validation

The worker entrypoint is `send-registration-email/index.ts`; its tests import
only `worker.ts`, inject synthetic
configuration, and mock every outbound request. They do not start a server or
invoke a deployed function. The timeout test intentionally takes 15 seconds.

```sh
deno check --node-modules-dir=none --no-lock supabase/functions/send-registration-email/index.ts supabase/functions/send-registration-email/worker_test.ts
deno test --node-modules-dir=none --no-lock --cached-only --deny-net --deny-env --deny-read --deny-write --deny-run --deny-ffi supabase/functions/send-registration-email/worker_test.ts
deno lint supabase/functions/send-registration-email
deno fmt --check supabase/functions/send-registration-email
```

The admin tests import `handler.ts`, inject synthetic configuration and
authentication, and mock database and worker requests. They cover dispatch after
the committed verification, unchanged successful responses on email failures,
sanitized categories and HTTP statuses, sent-row skips, ordinary edits and
repeated verification, failed writes, invalid/unauthorized requests, and
concurrent verification conflicts. Diagnostic cases include HTTP 401/403/429/
500/503, transport errors, abort errors, invalid JSON, response-read failures,
and unconfirmed sends. Rotation cases verify the original is used even when NEXT
is different, absent, empty, or invalid; missing/invalid original never falls back
to NEXT or dispatches. The diagnostic also fails closed and never falls back.
The browser JWT and admin allowlist still control admin access, independently of
the worker credential. They do not start a server or invoke deployed functions.

Final rotation Step 2 preparation switches both local admin-to-worker calls back
to the original secret name after its credential promotion. Worker dual-secret
compatibility is unchanged. Deployment and subsequent verification are separate
steps; these offline checks do not change secrets, enable scheduling, or send email.

```sh
deno check --node-modules-dir=none --no-lock supabase/functions/admin-registrations/index.ts supabase/functions/admin-registrations/handler_test.ts
deno test --node-modules-dir=none --no-lock --cached-only --deny-net --deny-env --deny-read --deny-write --deny-run --deny-ffi supabase/functions/admin-registrations/handler_test.ts
deno lint supabase/functions/admin-registrations
deno fmt --check supabase/functions/admin-registrations
```

The first type-check may download Node type definitions for Deno's built-in
`node:crypto` and `node:assert/strict` support; it does not execute the function.
The tests run with external access denied. No project npm dependency is added.

### Automatic email recovery (GitHub Actions, disabled draft)

The planned Supabase Cron/pg_net migration has been moved outside `migrations/`
to `archive/pg-net-recovery/`, with a `.sql.disabled` suffix. **Do not deploy it.**
Supabase Support confirmed hosted pg_net PUBLIC grants cannot be hardened.
Historical design and isolated test fixtures are retained for reference only.

The replacement is documented in [GitHub Actions email recovery](../docs/EMAIL_RECOVERY_ACTIONS.md).
It invokes the existing worker every five minutes when separately authorized
and enabled. Both the schedule and job are currently disabled. No secret has
been uploaded and no remote configuration has been changed.

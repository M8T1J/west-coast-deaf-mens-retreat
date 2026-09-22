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
  `ADMIN_EMAILS`; it lists, edits, verifies, and soft-deletes registrations.
  After a successful new payment verification, it automatically invokes
  `send-registration-email` server-to-server for that registration's outbox row.
- `send-registration-email` is a server-only, one-job outbox worker. Its source
  and offline tests are included; adding these files does not deploy or run it.

The frontend uses these functions as its registration source of truth. Do not
put function secrets, database credentials, or access tokens in this directory.

## Registration email worker

Requires the applied `20260920000000_add_registration_email_worker_rpcs.sql`
migration. It uses the four transactional RPCs for all state changes; it never
patches registrations or the outbox directly. `currency character(3)` is
supported: the authorization snapshot supplies `USD` as a JSON string.

### Server configuration

| Environment value | Requirement |
| --- | --- |
| `REGISTRATION_EMAIL_WORKER_SECRET` | Dedicated, randomly generated bearer credential, at least 32 characters (prefer 32 random bytes encoded as hex). Never reuse a public key or user JWT. |
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
Automatic invocation comes from `admin-registrations`; no scheduler or direct
browser invocation of the worker is installed here.

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
`Authorization: Bearer <REGISTRATION_EMAIL_WORKER_SECRET>` is accepted. The
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
and unconfirmed sends. They do not start a server or invoke deployed functions.

```sh
deno check --node-modules-dir=none --no-lock supabase/functions/admin-registrations/index.ts supabase/functions/admin-registrations/handler_test.ts
deno test --node-modules-dir=none --no-lock --cached-only --deny-net --deny-env --deny-read --deny-write --deny-run --deny-ffi supabase/functions/admin-registrations/handler_test.ts
deno lint supabase/functions/admin-registrations
deno fmt --check supabase/functions/admin-registrations
```

The first type-check may download Node type definitions for Deno's built-in
`node:crypto` and `node:assert/strict` support; it does not execute the function.
The tests run with external access denied. No project npm dependency is added.

# Registration email recovery — prepared, disabled GitHub Actions workflow

Status: prepared, disabled workflow. No active schedule, worker invocation, or
Supabase production change is part of this preparation.

## Behavior

`.github/workflows/registration-email-recovery.yml` contains a commented-out
five-minute UTC schedule at minutes 2, 7, 12, …, 57 (`2-57/5 * * * *`). The
offset avoids the top of the hour. A literal `if: ${{ false }}` disables the
entire job, including manual dispatch. There are no push or pull-request triggers.
GitHub requires schedules on the default branch and supports intervals as short
as five minutes. Scheduled runs use the latest default-branch commit and may be
delayed or dropped under load, so this is a best-effort recovery tick, not a
delivery guarantee. See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

When later enabled, each tick runs `scripts/invoke-registration-email.py` once.
It sends an HTTPS POST to the fixed existing Supabase worker, with
`{"dry_run":false}` and the dedicated bearer credential. This is a real worker
wake-up, not a dry-run preview: the worker checks eligibility and can send at most
one email. No outbox ID override, database preflight, batch loop, or direct email
provider call is added. Immediate dispatch from the admin handler remains intact.

The worker and database RPCs are unchanged: send-enable kill switch, optional
allowed-outbox restriction, verified-payment/registration validation, claim
fencing, leases, global provider throttle, backoff, maximum attempts, and
uncertain-delivery holds continue to apply. Expired leases are recovered inside
the existing claim RPC without a separate database scheduler.

The caller rejects redirects, uses normal TLS certificate verification, reads at
most 4097 response bytes, and has a 90-second socket timeout. The workflow has a
three-minute overall timeout and a concurrency group with cancellation disabled.
No immediate HTTP retries occur, including for 429, 5xx, or ambiguous timeouts.
The next scheduled tick lets the durable outbox decide what is safe to retry.
Cancellation or a lost response does not prove the email was not sent.

`sent`, `no_job`, and dispatch throttling are normal outcomes. Other results fail
the job, including HTTP 200 with `status: failed`. Logs contain fixed messages
only, not credentials, response bodies, exception details, or registration data.
Investigate failures in protected Supabase diagnostics; do not reset uncertain
deliveries without checking provider history. Enable Actions failure notifications
and monitor missing runs/backlog separately: no run means no failure notification.

## Credential storage and future activation (not performed)

The sole invocation credential is the repository Actions secret
`REGISTRATION_EMAIL_WORKER_SECRET`, matching the existing Edge Function secret.
Its value is injected only into the invocation step's environment, not command
arguments, workflow YAML, source, URLs, artifacts, or output. Do not copy the
Supabase service-role key or EmailJS keys into GitHub. Checkout is pinned to a
commit, uses only `contents: read`, and does not persist its GitHub credential.
Anyone able to change trusted workflow/code can potentially access its secret;
restrict repository write access and review changes accordingly.

The repository Actions secret is already configured from the approved worker
credential. This preparation does not read or change it. GitHub and Supabase are
independent secret stores; future rotations must update both. Follow [GitHub's
secret documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Before later activation: review the backlog and worker configuration, confirm the
fixed project URL, validate a controlled test with the existing outbox restriction,
and review billing. Activation requires separate explicit authorization: enable
the schedule on the default branch and remove the literal false job guard. Neither
has been performed. This preparation does not enable a schedule.
Disabling this workflow stops recovery only; the existing Supabase send-enable
kill switch also governs immediate sends. Never apply the archived pg_net migration.

## Limits

GitHub's schedule is best effort, minimum five minutes, with possible delays or
dropped runs. Public repository schedules disable after 60 days without activity.
This path adds at most one email per tick (12/hour), not a five-minute delivery
guarantee. See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

At five-minute intervals, 30 days means 8640 runs; 31 days means 8928. Standard
public-repository runners are free. Private-repository jobs round up to whole
minutes, so this exceeds GitHub Free's 2000 minutes/month even for short jobs.
Repository visibility/billing has not been checked remotely. See
[billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [rounding](https://docs.github.com/en/actions/how-tos/monitor-workflows/view-job-execution-time).
8928 Supabase calls/month fit within the 500000 Free invocation allowance before
other usage; provider quotas and Supabase availability still apply.

## Local validation

### Separate manual authentication test

`registration-email-auth-test.yml` is a separate `workflow_dispatch`-only workflow.
It has no schedule or push trigger, runs only from `main`, and has no user-supplied
URL, request-body, outbox, or send-mode inputs. Committing it does not execute it.
The recovery workflow above remains disabled and unchanged.

After separate approval to run the test, select **Registration email authentication
test (dry run)** in GitHub Actions, select **Run workflow**, and choose `main`.
Each manual dispatch makes exactly one request. Do not run it until authorized.

The test reads the existing repository Actions secret and sends the literal body
`{"dry_run":true}` to the fixed worker endpoint. It never adds or updates secrets.
Missing/malformed credentials fail before HTTP; redirects are rejected and requests
are not retried. A pass requires HTTP 200 plus `dry_run: true` and `status` equal
to `preview` or `no_job`. This confirms the worker accepted the credential at test
time; it does not retrieve or reveal either stored credential, establish provider
delivery, or enable sending. Other responses produce a sanitized failure.

The existing worker's dry-run path performs database reads only, before any claim,
send authorization, or email provider call. Its preview may contain personal data;
the test parses the bounded response only in memory and never prints or saves it.
Logs contain only a fixed pass/fail message, with no credentials, hashes, personal
data, response bodies, or exception details. No artifacts or outputs are published.

Offline test command (synthetic credentials; sockets forbidden):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/test-registration-email-auth_test.py
```

Preparation checks: 9 authentication tests, 15 recovery regression tests, and 3
existing worker dry-run tests passed offline. Workflow YAML and manual/main-only
guards passed validation. Deno behavioral tests used `--no-check` because Node
type definitions are not cached. The GitHub test has not been dispatched and
the live credential match remains unverified until an approved run succeeds.

### Recovery validation

Run the scheduler tests without credentials or external services:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/invoke-registration-email_test.py
deno test --node-modules-dir=none --no-lock --cached-only --deny-net --deny-env --deny-read --deny-write --deny-run --deny-ffi supabase/functions/send-registration-email/worker_test.ts supabase/functions/admin-registrations/handler_test.ts
```

The Python tests forbid sockets and mock responses, redirects, and transport
failures. Deno tests use synthetic credentials and mocked services. Local tests
cannot establish GitHub scheduling, remote secret correctness, or live delivery.

Local results (2026-10-10): 15 Python scheduler tests passed; 26 existing worker
tests and 8 existing admin-dispatch tests passed. Ruby's YAML parser also verified
the inactive trigger/job, read-only permissions, concurrency, and job timeout.
The credential-free CLI exited 1 before HTTP, as expected. `git diff --check`
passed. The Deno run used a temporary 2.2.4 runtime and added `--no-check` to the
command above because `@types/node` was not cached; behavioral tests ran with
network access denied, but TypeScript type-checking was not completed. No SQL
integration or live GitHub/Supabase execution was performed for this change.

The old SQL, design, and test fixtures are retained as a superseded proposal in
`supabase/archive/pg-net-recovery/` and the historical `email-recovery_test.mjs`.
Their simulated extension-owner hardening is not available on hosted Supabase.

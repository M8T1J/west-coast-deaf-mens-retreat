# Registration email recovery — disabled GitHub Actions draft

Status: disabled implementation, prepared for source-control review. No active
schedule, secret upload, worker invocation, or Supabase production change.

## Behavior

`.github/workflows/registration-email-recovery.yml` has a commented-out schedule
at minutes 2, 7, 12, …, 57 UTC (`2-57/5 * * * *`). The offset avoids the top of
the hour. A literal `if: ${{ false }}` also disables the entire job, including
manual dispatch. There are no push or pull-request triggers.

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

No real secret has been read or uploaded during this local work. After separate
authorization, add it through GitHub **Settings → Secrets and variables → Actions
→ New repository secret**, directly from the approved credential source. Do not
paste it into chat or a shell command. GitHub and Supabase are independent secret
stores; rotations must update both. Follow [GitHub's secret documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Before later activation: review the backlog and worker configuration, confirm the
fixed project URL, validate a controlled test with the existing outbox restriction,
and review billing. Only after approval, remove the literal false job guard and
uncomment the schedule on the default branch. Neither step has been performed.
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

import assert from "node:assert/strict";
import { createHandler } from "./worker.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const REG = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const NOW = Date.parse("2026-09-20T20:00:00Z");
const ENV: Record<string, string | undefined> = {
  REGISTRATION_EMAIL_WORKER_SECRET:
    "synthetic-worker-secret-for-offline-tests-only",
  REGISTRATION_EMAIL_SEND_ENABLED: "true",
  SUPABASE_URL: "https://database.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role",
  EMAILJS_SERVICE_ID: "synthetic-service",
  EMAILJS_PAYMENT_VERIFIED_TEMPLATE_ID: "synthetic-template",
  EMAILJS_PUBLIC_KEY: "synthetic-public-key",
  EMAILJS_PRIVATE_KEY: "synthetic-private-key",
};
const JOB = {
  id: ID,
  registration_id: REG,
  event_type: "payment_verified",
  status: "sending",
  attempts: 0,
  sent_at: null,
  next_attempt_at: null,
  claim_token: TOKEN,
  lease_expires_at: "2026-09-20T20:02:00Z",
  send_started_at: null,
  last_error_code: null,
};
const REGISTRATION = {
  id: REG,
  email: "test@example.com",
  full_name: "Test Registrant",
  first_name: "Test",
  last_name: "Registrant",
  amount_received: "125.00",
  currency: "USD",
  payment_status: "verified",
  registration_status: "completed",
  payment_verified_at: "2026-09-20T19:00:00Z",
  deleted_at: null,
  emergency_name: "PRIVATE",
  youth_info: "PRIVATE",
  amount_due: 999,
};
const AUTHORIZED = {
  authorized: true,
  reason: "authorized",
  outbox: { ...JOB, attempts: 1, send_started_at: "2026-09-20T20:00:00Z" },
  registration: REGISTRATION,
};
const QUEUED = {
  ...JOB,
  status: "queued",
  claim_token: null,
  lease_expires_at: null,
  next_attempt_at: "2026-09-20T19:00:00Z",
};
type Step = {
  path: string;
  data?: unknown;
  status?: number;
  headers?: Record<string, string>;
  error?: Error;
  waitForAbort?: boolean;
  beforeResponse?: () => void;
};
const claim = (data: unknown = [JOB]): Step => ({
  path: "/rest/v1/rpc/claim_registration_email",
  data,
});
const authorize = (data: unknown = AUTHORIZED): Step => ({
  path: "/rest/v1/rpc/authorize_registration_email_send",
  data,
});
const email = (
  status = 200,
  data: unknown = "OK",
  headers?: Record<string, string>,
): Step => ({ path: "/api/v1.0/email/send", status, data, headers });
const complete = (data: unknown = true): Step => ({
  path: "/rest/v1/rpc/complete_registration_email",
  data,
});
const fail = (data: unknown = true): Step => ({
  path: "/rest/v1/rpc/fail_registration_email",
  data,
});

function harness(
  steps: Step[],
  overrides: Record<string, string | undefined> = {},
) {
  const env = { ...ENV, ...overrides };
  const calls: {
    url: URL;
    init: RequestInit;
    body: Record<string, unknown> | undefined;
  }[] = [];
  const errors: string[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const step = steps[calls.length];
    calls.push({
      url,
      init: init || {},
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (!step || step.path !== url.pathname) {
      errors.push(`Unexpected request ${url.pathname}`);
      throw new Error("Unexpected mocked request");
    }
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    if (url.hostname === "database.invalid") {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer synthetic-service-role",
      );
    } else {
      assert.equal(
        url.href,
        "https://api.emailjs.com/api/v1.0/email/send",
      );
    }
    if (step.waitForAbort) {
      await new Promise<void>((_resolve, reject) => {
        init!.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("timed out", "AbortError")),
          { once: true },
        );
      });
    }
    if (step.error) throw step.error;
    step.beforeResponse?.();
    return new Response(
      typeof step.data === "string" ? step.data : JSON.stringify(step.data),
      {
        status: step.status || 200,
        headers: step.headers,
      },
    );
  };
  const handler = createHandler({
    env: (key) => env[key],
    fetch: mockFetch,
    now: () => NOW,
    sleep: () => Promise.resolve(),
  });
  return {
    calls,
    env,
    async run(
      body: unknown = {},
      headers: Record<string, string> = {},
      method = "POST",
    ) {
      const request = new Request("https://worker.invalid", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.REGISTRATION_EMAIL_WORKER_SECRET}`,
          ...headers,
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      });
      const response = await handler(request);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      return { status: response.status, body: await response.json() };
    },
    handler,
    done() {
      assert.deepEqual(errors, []);
      assert.equal(calls.length, steps.length);
    },
  };
}

function drySteps(
  job: unknown = QUEUED,
  registration: unknown = REGISTRATION,
): Step[] {
  return [
    { path: "/rest/v1/registration_email_outbox", data: [job] },
    {
      path: "/rest/v1/registrations",
      data: registration ? [registration] : [],
    },
    {
      path: "/rest/v1/registration_email_dispatch_control",
      data: [{ next_send_allowed_at: "2026-09-20T19:59:00Z" }],
    },
  ];
}

Deno.test("unauthorized requests and browser credentials never access the database", async () => {
  for (
    const authorization of [
      "",
      "Bearer synthetic-public-key",
      "Bearer ordinary-user-jwt",
      `Bearer ${"x".repeat(ENV.REGISTRATION_EMAIL_WORKER_SECRET!.length)}`,
    ]
  ) {
    const h = harness([]);
    assert.equal(
      (await h.run({}, { Authorization: authorization })).status,
      401,
    );
    h.done();
  }
});

Deno.test("unsupported methods and short worker secrets fail closed", async () => {
  const h = harness([]);
  for (const method of ["GET", "OPTIONS", "PUT"]) {
    assert.equal((await h.run({}, {}, method)).status, 405);
  }
  h.done();
  const bad = harness([], { REGISTRATION_EMAIL_WORKER_SECRET: "short" });
  assert.equal((await bad.run()).status, 503);
  bad.done();
});

Deno.test("strict input rejects recipient overrides, bad IDs and nonboolean dry_run", async () => {
  for (
    const body of [
      { email: "other@example.com" },
      { outbox_id: "bad" },
      { outbox_id: null },
      { dry_run: "false" },
      [],
      null,
    ]
  ) {
    const h = harness([]);
    assert.equal((await h.run(body)).status, 400);
    h.done();
  }
  const h = harness([]);
  assert.equal((await h.run({}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await h.run({ unexpected: "x".repeat(1100) })).status, 413);
  const malformed = await h.handler(
    new Request("https://worker.invalid", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.REGISTRATION_EMAIL_WORKER_SECRET}`,
        "Content-Type": "application/json",
      },
      body: "{",
    }),
  );
  assert.equal(malformed.status, 400);
  h.done();
});

Deno.test("streamed request body limit does not depend on Content-Length", async () => {
  const h = harness([]);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1025));
      controller.close();
    },
  });
  const response = await h.handler(
    new Request("https://worker.invalid", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.REGISTRATION_EMAIL_WORKER_SECRET}`,
        "Content-Type": "application/json",
      },
      body,
    }),
  );
  assert.equal(response.status, 413);
  h.done();
});

Deno.test("sending requires explicit enablement and every EmailJS credential before claiming", async () => {
  for (const value of [undefined, "false", "TRUE", "1"]) {
    const h = harness([], { REGISTRATION_EMAIL_SEND_ENABLED: value });
    assert.equal(
      (await h.run({ dry_run: false })).body.error,
      "sending_disabled",
    );
    h.done();
  }
  for (
    const key of [
      "EMAILJS_SERVICE_ID",
      "EMAILJS_PAYMENT_VERIFIED_TEMPLATE_ID",
      "EMAILJS_PUBLIC_KEY",
      "EMAILJS_PRIVATE_KEY",
    ]
  ) {
    const h = harness([], { [key]: undefined });
    assert.equal(
      (await h.run({ dry_run: false })).body.error,
      "email_not_configured",
    );
    h.done();
  }
});

Deno.test("invalid server configuration and outbox scope fail before database access", async () => {
  for (
    const override of [
      { SUPABASE_URL: "http://database.invalid" },
      { SUPABASE_URL: "https://user:pass@database.invalid" },
      { SUPABASE_SERVICE_ROLE_KEY: undefined },
      { REGISTRATION_EMAIL_ALLOWED_OUTBOX_ID: "bad" },
    ]
  ) {
    const h = harness([], override);
    assert.equal((await h.run()).status, 503);
    h.done();
  }
  const h = harness([], { REGISTRATION_EMAIL_ALLOWED_OUTBOX_ID: ID });
  assert.equal((await h.run({ outbox_id: OTHER })).status, 403);
  h.done();
});

Deno.test("default dry-run is GET-only, masked, and works with sending disabled and no private key", async () => {
  const h = harness(drySteps(), {
    REGISTRATION_EMAIL_SEND_ENABLED: undefined,
    EMAILJS_PRIVATE_KEY: undefined,
    REGISTRATION_EMAIL_ALLOWED_OUTBOX_ID: ID,
  });
  const result = await h.run();
  assert.equal(result.body.dry_run, true);
  assert.equal(result.body.eligible, true);
  assert.equal(result.body.recipient, "t***@example.com");
  assert.equal(result.body.amount, "125.00");
  assert.equal(result.body.currency, "USD");
  assert.equal(result.body.send_enabled, false);
  assert.equal(result.body.email_configured, false);
  assert.equal(h.calls[0].url.searchParams.get("id"), `eq.${ID}`);
  assert.ok(h.calls.every((c) => c.init.method === "GET"));
  assert.ok(!JSON.stringify(result.body).includes(TOKEN));
  assert.ok(!JSON.stringify(result.body).includes("test@example.com"));
  assert.ok(!JSON.stringify(result.body).includes("PRIVATE"));
  h.done();
});

Deno.test("dry-run selection orders oldest first and respects due times without claiming", async () => {
  const h = harness(drySteps());
  await h.run();
  const p = h.calls[0].url.searchParams;
  assert.equal(p.get("order"), "created_at.asc,id.asc");
  assert.equal(p.get("next_attempt_at"), `lte.${new Date(NOW).toISOString()}`);
  assert.equal(p.get("status"), "in.(queued,failed)");
  h.done();
});

Deno.test("dry-run reports invalid registrations, terminal jobs and throttling", async () => {
  for (
    const registration of [
      null,
      { ...REGISTRATION, deleted_at: "2026-09-20" },
      { ...REGISTRATION, payment_status: "refunded" },
      { ...REGISTRATION, currency: "EUR" },
      { ...REGISTRATION, amount_received: null },
      { ...REGISTRATION, email: "a@example.com,b@example.com" },
    ]
  ) {
    const h = harness(drySteps(QUEUED, registration));
    assert.equal(
      (await h.run({ outbox_id: ID })).body.reason,
      "invalid_registration",
    );
    h.done();
  }
  for (
    const job of [
      { ...QUEUED, status: "sent" },
      { ...QUEUED, next_attempt_at: null },
      { ...QUEUED, attempts: 5 },
      JOB,
    ]
  ) {
    const h = harness(drySteps(job));
    assert.equal((await h.run({ outbox_id: ID })).body.reason, "job_not_due");
    h.done();
  }
  const steps = drySteps();
  steps[2].data = [{ next_send_allowed_at: "2026-09-20T20:01:00Z" }];
  const h = harness(steps);
  assert.equal((await h.run()).body.reason, "dispatch_throttled");
  h.done();
});

Deno.test("empty queue is a no-op in both dry and send modes", async () => {
  const preview = harness([{
    path: "/rest/v1/registration_email_outbox",
    data: [],
  }]);
  assert.equal((await preview.run()).body.status, "no_job");
  preview.done();
  const send = harness([claim([])]);
  assert.equal((await send.run({ dry_run: false })).body.status, "no_job");
  send.done();
});

Deno.test("send uses authoritative amount, exact template contract, private key and fenced RPCs", async () => {
  const h = harness([claim(), authorize(), email(), complete()], {
    REGISTRATION_EMAIL_ALLOWED_OUTBOX_ID: ID,
  });
  assert.equal((await h.run({ dry_run: false })).body.status, "sent");
  assert.deepEqual(h.calls[0].body, { p_outbox_id: ID });
  assert.deepEqual(h.calls[1].body, { p_outbox_id: ID, p_claim_token: TOKEN });
  assert.deepEqual(h.calls[3].body, h.calls[1].body);
  const payload = h.calls[2].body!;
  assert.deepEqual(Object.keys(payload).sort(), [
    "accessToken",
    "service_id",
    "template_id",
    "template_params",
    "user_id",
  ]);
  assert.equal(payload.accessToken, ENV.EMAILJS_PRIVATE_KEY);
  const params = payload.template_params as Record<string, string>;
  assert.equal(params.to_email, REGISTRATION.email);
  assert.equal(params.to_name, REGISTRATION.full_name);
  assert.equal(params.amount, "125.00");
  assert.equal(params.payment_id, REG);
  assert.deepEqual(
    Object.keys(params).sort(),
    [
      "to_email",
      "to_name",
      "subject",
      "email_heading",
      "intro_copy",
      "amount_label",
      "amount",
      "reference_label",
      "payment_id",
      "event_dates",
      "venue",
      "venue_address",
      "next_step_one",
      "next_step_two",
      "next_step_three",
      "outro_copy",
      "support_copy",
      "rsvp_link",
      "facebook_link",
      "instagram_link",
    ].sort(),
  );
  assert.ok(!JSON.stringify(payload).includes("PRIVATE"));
  h.done();
});

Deno.test("SQL authorization denial never reaches EmailJS", async () => {
  for (
    const reason of [
      "claim_not_owned",
      "already_authorized",
      "lease_expired",
      "invalid_registration",
      "attempts_exhausted",
      "dispatch_throttled",
    ]
  ) {
    const h = harness([claim(), authorize({ authorized: false, reason })]);
    assert.equal((await h.run({ dry_run: false })).body.reason, reason);
    h.done();
  }
});

Deno.test("lost claim response is not retried and cannot send", async () => {
  const h = harness([{ ...claim(), error: new TypeError("connection lost") }]);
  assert.equal((await h.run({ dry_run: false })).status, 503);
  h.done();
});

Deno.test("lost authorization response records proven pre-dispatch failure without replaying authorization", async () => {
  const h = harness([claim(), {
    ...authorize(),
    error: new TypeError("connection lost"),
  }, fail()]);
  assert.equal(
    (await h.run({ dry_run: false })).body.reason,
    "pre_dispatch_failure",
  );
  assert.equal(h.calls[2].body?.p_error_code, "pre_dispatch_failure");
  h.done();
});

Deno.test("mismatched or expired authorization cannot cause a send", async () => {
  for (
    const outbox of [
      { ...AUTHORIZED.outbox, claim_token: OTHER },
      { ...AUTHORIZED.outbox, registration_id: OTHER },
      { ...AUTHORIZED.outbox, attempts: 6 },
      { ...AUTHORIZED.outbox, lease_expires_at: "2026-09-20T19:59:00Z" },
    ]
  ) {
    const h = harness([claim(), authorize({ ...AUTHORIZED, outbox }), fail()]);
    assert.equal(
      (await h.run({ dry_run: false })).body.reason,
      "pre_dispatch_failure",
    );
    h.done();
  }
});

Deno.test("invalid delivery snapshot is held without contacting EmailJS", async () => {
  for (
    const registration of [
      { ...REGISTRATION, currency: "EUR" },
      { ...REGISTRATION, email: "a@example.com\r\nBcc:x@example.com" },
      { ...REGISTRATION, amount_received: "NaN" },
      { ...REGISTRATION, amount_received: 0 },
      { ...REGISTRATION, id: OTHER },
    ]
  ) {
    const h = harness([
      claim(),
      authorize({ ...AUTHORIZED, registration }),
      fail(),
    ]);
    assert.equal(
      (await h.run({ dry_run: false })).body.reason,
      "invalid_registration",
    );
    h.done();
  }
});

Deno.test("provider classification is conservative and never retries the email", async () => {
  for (
    const [status, body, code] of [
      [429, "Too many requests", "rate_limited"],
      [429, "Monthly quota exceeded", "quota_exhausted"],
      [402, "Payment required", "quota_exhausted"],
      [400, "Bad recipient", "provider_rejected"],
      [401, "Bad credentials", "configuration_error"],
      [403, "API disabled", "configuration_error"],
      [408, "Request timeout", "delivery_unknown"],
      [500, "Server error", "delivery_unknown"],
      [503, "Unavailable", "delivery_unknown"],
      [302, "Redirect", "delivery_unknown"],
      [200, "Unexpected acceptance response", "delivery_unknown"],
      [202, "Queued", "delivery_unknown"],
    ] as const
  ) {
    const h = harness([claim(), authorize(), email(status, body), fail()]);
    assert.equal((await h.run({ dry_run: false })).body.reason, code);
    assert.equal(h.calls[3].body?.p_error_code, code);
    h.done();
  }
});

Deno.test("Retry-After delta seconds and HTTP date are passed to SQL backoff", async () => {
  for (
    const [header, expected] of [
      ["900", 900],
      ["Sun, 20 Sep 2026 20:05:00 GMT", 300],
      ["invalid", null],
      ["-1", null],
    ] as const
  ) {
    const h = harness([
      claim(),
      authorize(),
      email(429, "Throttled", { "Retry-After": header }),
      fail(),
    ]);
    await h.run({ dry_run: false });
    assert.equal(h.calls[3].body?.p_retry_after_seconds, expected);
    h.done();
  }
});

Deno.test("provider timeout, network loss and oversized response require review", async () => {
  for (
    const step of [{
      ...email(),
      error: new DOMException("timeout", "AbortError"),
    }, {
      ...email(),
      error: new TypeError("synthetic-private-key network loss"),
    }, email(200, "x".repeat(4097))]
  ) {
    const h = harness([claim(), authorize(), step, fail()]);
    const result = await h.run({ dry_run: false });
    assert.equal(result.body.reason, "delivery_unknown");
    assert.ok(!JSON.stringify(result.body).includes("synthetic-private-key"));
    h.done();
  }
});

Deno.test("JSON-string OK is recognized as provider acceptance", async () => {
  const h = harness([claim(), authorize(), email(200, '"OK"'), complete()]);
  assert.equal((await h.run({ dry_run: false })).body.status, "sent");
  h.done();
});

Deno.test("known provider success retries only completion after transient database failure", async () => {
  const h = harness([claim(), authorize(), email(), {
    ...complete(),
    error: new Error("unavailable"),
  }, complete()]);
  assert.equal((await h.run({ dry_run: false })).body.status, "sent");
  assert.equal(
    h.calls.filter((c) => c.url.hostname === "api.emailjs.com").length,
    1,
  );
  h.done();
});

Deno.test("lost completion response is reconciled from sent state", async () => {
  const h = harness([
    claim(),
    authorize(),
    email(),
    { ...complete(), error: new Error("response lost") },
    complete(false),
    {
      path: "/rest/v1/registration_email_outbox",
      data: [{ status: "sent", sent_at: "2026-09-20T20:00:01Z" }],
    },
  ]);
  assert.equal((await h.run({ dry_run: false })).body.status, "sent");
  h.done();
});

Deno.test("persistent completion failure reports accepted-but-unconfirmed and never re-sends", async () => {
  const h = harness([
    claim(),
    authorize(),
    email(),
    ...Array.from(
      { length: 3 },
      () => ({ ...complete(), error: new Error("unavailable") }),
    ),
    {
      path: "/rest/v1/registration_email_outbox",
      data: [{ status: "sending", sent_at: null }],
    },
  ]);
  const result = await h.run({ dry_run: false });
  assert.equal(result.status, 502);
  assert.equal(result.body.provider_accepted, true);
  assert.equal(result.body.reason, "completion_unconfirmed");
  h.done();
});

Deno.test("failure recording retries only SQL and reports a fenced-out claim", async () => {
  const h = harness([
    claim(),
    authorize(),
    email(500, "private provider details"),
    { ...fail(), error: new Error("unavailable") },
    fail(false),
  ]);
  const result = await h.run({ dry_run: false });
  assert.equal(result.status, 503);
  assert.equal(result.body.reason, "failure_update_unconfirmed");
  assert.ok(!JSON.stringify(result.body).includes("private provider details"));
  h.done();
});

Deno.test("provider fetch is aborted after the real 15-second deadline", async () => {
  const h = harness([
    claim(),
    authorize(),
    { ...email(), waitForAbort: true },
    fail(),
  ]);
  const result = await h.run({ dry_run: false });
  assert.equal(result.body.reason, "delivery_unknown");
  assert.equal(h.calls[2].init.signal?.aborted, true);
  h.done();
});

Deno.test("kill switch is checked again after SQL authorization", async () => {
  const steps = [claim(), authorize(), fail()];
  const h = harness(steps);
  steps[1].beforeResponse = () => {
    h.env.REGISTRATION_EMAIL_SEND_ENABLED = "false";
  };
  assert.equal(
    (await h.run({ dry_run: false })).body.reason,
    "pre_dispatch_failure",
  );
  h.done();
});

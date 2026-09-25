// Mock I/O retains the asynchronous production dependency signatures.
// deno-lint-ignore-file require-await
import assert from "node:assert/strict";
import { createHandler } from "./handler.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const SECRET = "synthetic-worker-secret-0123456789";
const current = {
  id: ID,
  payment_status: "awaiting_manual_verification",
  registration_status: "pending",
  amount_received: 125,
};
const saved = {
  ...current,
  payment_status: "verified",
  registration_status: "completed",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

type Options = {
  old?: typeof current;
  updated?: unknown[];
  patchStatus?: number;
  jobs?: unknown;
  lookupStatus?: number;
  worker?: unknown;
  workerStatus?: number;
  throws?: boolean;
  workerError?: Error;
  workerResponse?: () => Response;
  env?: Record<string, string | undefined>;
  user?: { id: string; email: string } | null;
};
function harness(options: Options = {}) {
  const calls: string[] = [];
  const logs: unknown[] = [];
  let patches = 0;
  let sends = 0;
  const env: Record<string, string | undefined> = {
    ALLOWED_ORIGIN: "https://site.invalid",
    ADMIN_EMAILS: "admin@example.com",
    SUPABASE_URL: "https://database.invalid",
    REGISTRATION_EMAIL_WORKER_SECRET: SECRET,
    ...options.env,
  };
  const handler = createHandler({
    env: (key) => env[key],
    authenticatedUser: async () =>
      options.user === undefined
        ? { id: "admin", email: "admin@example.com" }
        : options.user,
    log: (...args) => logs.push(args),
    databaseRequest: async (path, init) => {
      calls.push(path);
      if (path.startsWith("registration_email_outbox?")) {
        assert.equal(patches, 1);
        const params = new URL(`https://database.invalid/${path}`).searchParams;
        assert.equal(params.get("registration_id"), `eq.${ID}`);
        assert.equal(params.get("event_type"), "eq.payment_verified");
        assert.ok(init?.signal);
        return json(
          options.jobs ?? [{ id: JOB, status: "queued", sent_at: null }],
          options.lookupStatus,
        );
      }
      if (init?.method === "PATCH") {
        patches++;
        assert.equal(JSON.parse(String(init.body)).updated_by, "admin");
        return json(options.updated ?? [saved], options.patchStatus);
      }
      return json([options.old ?? current]);
    },
    fetch: async (input, init) => {
      sends++;
      assert.equal(patches, 1);
      assert.equal(
        String(input),
        "https://database.invalid/functions/v1/send-registration-email",
      );
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${SECRET}`,
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        outbox_id: JOB,
        dry_run: false,
      });
      if (options.throws) throw new Error(SECRET);
      if (options.workerError) throw options.workerError;
      if (options.workerResponse) return options.workerResponse();
      return json(
        options.worker ?? { status: "sent", outbox_id: JOB },
        options.workerStatus,
      );
    },
  });
  return {
    calls,
    logs,
    sends: () => sends,
    run: async (
      changes: unknown = { payment_status: "verified" },
      method = "PATCH",
    ) => {
      const response = await handler(
        new Request("https://edge.invalid/admin-registrations", {
          method,
          headers: {
            Origin: env.ALLOWED_ORIGIN!,
            Authorization: "Bearer browser-token",
            "Content-Type": "application/json",
          },
          ...(method === "GET"
            ? {}
            : { body: JSON.stringify({ id: ID, changes }) }),
        }),
      );
      const body = await response.json();
      assert.ok(!JSON.stringify(body).includes(SECRET));
      assert.ok(!JSON.stringify(logs).includes(SECRET));
      return { status: response.status, body };
    },
  };
}

Deno.test("verification commits before scoped worker dispatch and preserves response", async () => {
  const h = harness();
  assert.deepEqual(await h.run(), { status: 200, body: saved });
  assert.equal(h.sends(), 1);
  assert.ok(
    h.calls[1].includes("&payment_status=eq.awaiting_manual_verification"),
  );
  assert.equal(h.logs.length, 0);
});

Deno.test("email failures are sanitized and never undo successful verification", async () => {
  for (
    const options of [
      { workerStatus: 503 },
      { throws: true },
      { worker: { status: "failed", reason: SECRET } },
      { worker: { status: "no_job" } },
      { worker: { status: "not_authorized" } },
      { worker: { status: "reconciliation_required" } },
      { worker: { status: "sent", outbox_id: ID } },
      { worker: null, workerStatus: 401 },
      { lookupStatus: 500 },
      { jobs: [] },
      { jobs: [{ id: "bad" }] },
      { env: { REGISTRATION_EMAIL_WORKER_SECRET: undefined } },
      { env: { SUPABASE_URL: "https://user:password@database.invalid" } },
    ]
  ) {
    const h = harness(options);
    assert.deepEqual(await h.run(), { status: 200, body: saved });
    assert.equal(h.logs.length, 1);
    assert.ok(h.sends() <= 1);
  }
});

Deno.test("worker failures log only safe categories and available HTTP status", async () => {
  const sensitive =
    `${SECRET} Bearer browser-token EMAILJS_PRIVATE_KEY=private-test recipient@example.com Personal Name`;
  const cases: [Options, string, number?][] = [
    ...[401, 403, 429, 500, 503].map((status): [Options, string, number] => [
      {
        workerResponse: () =>
          new Response(sensitive, {
            status,
            statusText: sensitive,
            headers: { "x-sensitive": sensitive },
          }),
      },
      "http_error",
      status,
    ]),
    [{ workerError: new TypeError(sensitive) }, "transport_error"],
    [{ workerError: new Error(sensitive) }, "transport_error"],
    [
      { workerError: new DOMException(sensitive, "AbortError") },
      "request_aborted",
    ],
    [{ workerResponse: () => new Response(sensitive) }, "invalid_json", 200],
    [
      {
        workerResponse: () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error(sensitive));
              },
            }),
          ),
      },
      "response_read_error",
      200,
    ],
    [
      { worker: { status: sensitive, reason: sensitive } },
      "send_not_confirmed",
      200,
    ],
    [{ worker: { status: "sent", outbox_id: ID } }, "send_not_confirmed", 200],
  ];
  for (const [options, category, status] of cases) {
    const h = harness(options);
    assert.deepEqual(await h.run(), { status: 200, body: saved });
    assert.equal(h.sends(), 1);
    assert.deepEqual(h.logs, [[
      "Registration saved; payment verification email not confirmed",
      {
        registration_id: ID,
        code: category === "send_not_confirmed"
          ? "worker_did_not_confirm_send"
          : "worker_request_failed",
        error_category: category,
        ...(status === undefined ? {} : { http_status: status }),
      },
    ]]);
  }
});

Deno.test("sent outbox rows are never dispatched", async () => {
  for (
    const job of [{ id: JOB, status: "sent", sent_at: null }, {
      id: JOB,
      status: "queued",
      sent_at: "2026-09-20",
    }]
  ) {
    const h = harness({ jobs: [job] });
    assert.equal((await h.run()).status, 200);
    assert.equal(h.sends(), 0);
    assert.equal(h.logs.length, 0);
  }
});

Deno.test("ordinary edits and repeated verification do not query outbox or dispatch", async () => {
  for (
    const [old, changes] of [
      [saved, { payment_status: "verified" }],
      [saved, { phone: "Updated" }],
      [current, { phone: "Updated" }],
      [current, { payment_status: "refunded" }],
    ] as const
  ) {
    const h = harness({ old });
    assert.equal((await h.run(changes)).status, 200);
    assert.equal(h.calls.length, 2);
    assert.equal(h.sends(), 0);
  }
});

Deno.test("failed, missing, or non-completing writes never dispatch", async () => {
  for (
    const options of [{ patchStatus: 500 }, { updated: [] }, {
      updated: [current],
    }]
  ) {
    const h = harness(options);
    await h.run();
    assert.equal(h.calls.length, 2);
    assert.equal(h.sends(), 0);
  }
});

Deno.test("unauthorized and invalid requests never write or dispatch", async () => {
  for (
    const [options, changes, status] of [
      [{ user: null }, { payment_status: "verified" }, 401],
      [{ user: { id: "other", email: "other@example.com" } }, {}, 403],
      [{}, { payment_status: "verified", amount_received: 0 }, 400],
      [{}, { payment_status: "invalid" }, 400],
      [{}, { registration_status: "completed" }, 400],
      [{}, { worker_secret: SECRET }, 400],
    ] as const
  ) {
    const h = harness(options);
    assert.equal((await h.run(changes)).status, status);
    assert.ok(h.calls.length <= 1);
    assert.equal(h.sends(), 0);
  }
});

Deno.test("concurrent verification conflict does not dispatch or retry the write", async () => {
  const h = harness({ updated: [] });
  assert.equal((await h.run()).status, 409);
  assert.equal(h.calls.length, 2);
  assert.equal(h.sends(), 0);
});

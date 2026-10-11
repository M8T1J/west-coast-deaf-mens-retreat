// All external I/O is injected; no real credentials or network access.
// deno-lint-ignore-file require-await
import assert from "node:assert/strict";
import { createHandler } from "./handler.ts";

const NEXT = "synthetic-next-worker-credential-0123456789";
const ORIGINAL = "synthetic-original-worker-credential-9876543210";
const PRIVATE = `${NEXT} ${ORIGINAL} person@example.com private-job-id`;
const PATH = "/functions/v1/admin-registrations/email-worker-auth-check";
type Options = {
  env?: Record<string, string | undefined>;
  user?: string | null;
  authThrows?: boolean;
  worker?: () => Response;
  fetchError?: Error;
  waitForAbort?: boolean;
};

function harness(options: Options = {}) {
  const env: Record<string, string | undefined> = {
    ALLOWED_ORIGIN: "https://site.invalid",
    ADMIN_EMAILS: "admin@example.com",
    SUPABASE_URL: "https://database.invalid",
    REGISTRATION_EMAIL_WORKER_SECRET_NEXT: NEXT,
    REGISTRATION_EMAIL_WORKER_SECRET: ORIGINAL,
    ...options.env,
  };
  const reads: string[] = [];
  let authCalls = 0;
  let fetches = 0;
  let databaseCalls = 0;
  const logs: unknown[] = [];
  const handler = createHandler({
    env: (key) => {
      reads.push(key);
      return env[key];
    },
    authenticatedUser: async (authorization) => {
      authCalls++;
      if (options.authThrows) throw new Error(PRIVATE);
      if (authorization !== "Bearer browser-jwt" || options.user === null) {
        return null;
      }
      return { id: "admin-id", email: options.user ?? "admin@example.com" };
    },
    databaseRequest: async () => {
      databaseCalls++;
      throw new Error(
        "Diagnostic must never access the admin database dependency",
      );
    },
    log: (...args) => logs.push(args),
    fetch: async (input, init) => {
      fetches++;
      assert.equal(
        String(input),
        "https://database.invalid/functions/v1/send-registration-email",
      );
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${env.REGISTRATION_EMAIL_WORKER_SECRET_NEXT}`,
      );
      assert.equal(
        new Headers(init?.headers).get("Content-Type"),
        "application/json",
      );
      assert.equal(init?.body, '{"dry_run":true}');
      if (options.fetchError) throw options.fetchError;
      if (options.waitForAbort) {
        return await new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException(PRIVATE, "AbortError")),
            { once: true },
          );
        });
      }
      return options.worker?.() ??
        new Response('{"dry_run":true,"status":"no_job"}');
    },
  });
  return {
    reads,
    authCalls: () => authCalls,
    fetches: () => fetches,
    run: async (request: {
      method?: string;
      path?: string;
      origin?: string | null;
      authorization?: string | null;
      body?: string;
    } = {}) => {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (request.origin !== null) {
        headers.set("Origin", request.origin ?? "https://site.invalid");
      }
      if (request.authorization !== null) {
        headers.set(
          "Authorization",
          request.authorization ?? "Bearer browser-jwt",
        );
      }
      const response = await handler(
        new Request(`https://edge.invalid${request.path ?? PATH}`, {
          method: request.method ?? "GET",
          headers,
          ...(request.body === undefined ? {} : { body: request.body }),
        }),
      );
      const raw = await response.text();
      assert.equal(databaseCalls, 0);
      assert.deepEqual(logs, []);
      for (
        const sensitive of [
          NEXT,
          ORIGINAL,
          "person@example.com",
          "private-job-id",
        ]
      ) {
        assert.ok(!raw.includes(sensitive));
        assert.ok(!JSON.stringify([...response.headers]).includes(sensitive));
      }
      if (request.method !== "OPTIONS") {
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.deepEqual(Object.keys(JSON.parse(raw)), ["result"]);
      }
      return { response, body: raw ? JSON.parse(raw) : null };
    },
  };
}

Deno.test("diagnostic accepts only confirmed dry-run responses and returns sanitized PASS", async () => {
  for (const status of ["preview", "no_job"]) {
    for (const path of [PATH, "/admin-registrations/email-worker-auth-check"]) {
      const h = harness({
        worker: () =>
          new Response(JSON.stringify({
            dry_run: true,
            status,
            recipient: PRIVATE,
            outbox_id: PRIVATE,
            secret: NEXT,
          })),
      });
      const { response, body } = await h.run({ path });
      assert.equal(response.status, 200);
      assert.deepEqual(body, { result: "PASS" });
      assert.equal(
        response.headers.get("Access-Control-Allow-Origin"),
        "https://site.invalid",
      );
      assert.equal(h.fetches(), 1);
      assert.ok(h.reads.includes("REGISTRATION_EMAIL_WORKER_SECRET_NEXT"));
      assert.ok(!h.reads.includes("REGISTRATION_EMAIL_WORKER_SECRET"));
    }
  }
});

Deno.test("diagnostic requires permitted origin, browser JWT and admin allowlist before worker access", async () => {
  const cases: [
    Options,
    Parameters<ReturnType<typeof harness>["run"]>[0],
    number,
  ][] = [
    [{}, { origin: null }, 403],
    [{}, { origin: "https://other.invalid" }, 403],
    [{}, { authorization: null }, 401],
    [{}, { authorization: `Bearer ${NEXT}` }, 401],
    [{}, { authorization: `Bearer ${ORIGINAL}` }, 401],
    [{ user: null }, {}, 401],
    [{ user: "other@example.com" }, {}, 403],
    [{ env: { ADMIN_EMAILS: undefined } }, {}, 403],
    [{ authThrows: true }, {}, 503],
  ];
  for (const [options, request, status] of cases) {
    const h = harness(options);
    const result = await h.run(request);
    assert.equal(result.response.status, status);
    assert.deepEqual(result.body, { result: "FAIL" });
    assert.equal(h.fetches(), 0);
    assert.ok(!h.reads.includes("REGISTRATION_EMAIL_WORKER_SECRET_NEXT"));
    if (
      request?.origin === null || request?.origin === "https://other.invalid"
    ) {
      assert.equal(h.authCalls(), 0);
      assert.equal(
        result.response.headers.get("Access-Control-Allow-Origin"),
        null,
      );
    }
  }
});

Deno.test("diagnostic rejects methods and client overrides without invoking worker or writes", async () => {
  for (const method of ["POST", "PATCH", "DELETE", "PUT", "HEAD"]) {
    const h = harness();
    const result = await h.run({
      method,
      ...(method === "HEAD" ? {} : {
        body: JSON.stringify({
          dry_run: false,
          outbox_id: "private-job-id",
          url: "https://other.invalid",
          secret: ORIGINAL,
        }),
      }),
    });
    assert.equal(result.response.status, 405);
    assert.deepEqual(result.body, { result: "FAIL" });
    assert.equal(h.fetches(), 0);
  }
  for (
    const query of [
      "dry_run=false",
      "outbox_id=private-job-id",
      "url=https://other.invalid",
      "secret=override",
    ]
  ) {
    const h = harness();
    const result = await h.run({ path: `${PATH}?${query}` });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.body, { result: "FAIL" });
    assert.equal(h.fetches(), 0);
  }
  const h = harness();
  assert.equal((await h.run({ method: "OPTIONS" })).response.status, 204);
  assert.equal(h.authCalls(), 0);
  assert.equal(h.fetches(), 0);
});

Deno.test("diagnostic fails closed on invalid NEXT or server URL without fallback", async () => {
  const configs: Record<string, string | undefined>[] = [
    ...[
      undefined,
      "",
      "x".repeat(31),
      "x".repeat(4001),
      `${NEXT}\n`,
      `${NEXT} `,
    ].map((secret) => ({ REGISTRATION_EMAIL_WORKER_SECRET_NEXT: secret })),
    ...[
      undefined,
      "bad",
      "http://database.invalid",
      "https://user:password@database.invalid",
      "https://database.invalid/path",
      "https://database.invalid/?query=1",
      "https://database.invalid/#fragment",
    ].map((url) => ({ SUPABASE_URL: url })),
  ];
  for (const env of configs) {
    const h = harness({ env });
    const result = await h.run();
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, { result: "FAIL" });
    assert.equal(h.fetches(), 0);
    assert.ok(!h.reads.includes("REGISTRATION_EMAIL_WORKER_SECRET"));
  }
});

Deno.test("diagnostic sanitizes HTTP, transport, parsing and unconfirmed outcome failures", async () => {
  const options: Options[] = [
    ...[301, 401, 403, 429, 500, 503].map((status) => ({
      worker: () =>
        new Response(PRIVATE, { status, headers: { "x-private": PRIVATE } }),
    })),
    ...[
      new Error(PRIVATE),
      new TypeError(PRIVATE),
      new DOMException(PRIVATE, "AbortError"),
    ].map((fetchError) => ({ fetchError })),
    { worker: () => new Response(PRIVATE) },
    { worker: () => new Response(new Uint8Array([0xff])) },
    ...[
      null,
      [],
      { dry_run: false, status: "preview" },
      { dry_run: "true", status: "no_job" },
      { dry_run: true, status: "sent" },
      { dry_run: true, status: "failed", error: PRIVATE },
      { status: "preview" },
    ].map((outcome) => ({
      worker: () => new Response(JSON.stringify(outcome)),
    })),
    {
      worker: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error(PRIVATE));
            },
          }),
        ),
    },
  ];
  for (const option of options) {
    const h = harness(option);
    const result = await h.run();
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, { result: "FAIL" });
    assert.equal(h.fetches(), 1);
  }
});

Deno.test("diagnostic bounds streamed worker output and cancels oversized responses", async () => {
  let cancelled = false;
  const h = harness({
    worker: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                '{"dry_run":true,"status":"preview","private":"',
              ),
            );
            controller.enqueue(new TextEncoder().encode("x".repeat(4096)));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  assert.deepEqual((await h.run()).body, { result: "FAIL" });
  assert.equal(cancelled, true);
});

Deno.test("diagnostic aborts a stalled worker request at the 25-second deadline", async () => {
  const h = harness({ waitForAbort: true });
  const result = await h.run();
  assert.equal(result.response.status, 503);
  assert.deepEqual(result.body, { result: "FAIL" });
  assert.equal(h.fetches(), 1);
});

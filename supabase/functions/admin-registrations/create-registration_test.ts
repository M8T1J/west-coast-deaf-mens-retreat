// deno-lint-ignore-file require-await
import assert from "node:assert/strict";
import { createHandler } from "./handler.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const fields = {
  first_name: " Synthetic  First ",
  last_name: "Registrant",
  email: " TEST@EXAMPLE.COM ",
  phone: "555-0100",
  address_line: "Synthetic address",
  city: "Test city",
  zip_code: "00000",
  church_name: "Test church",
  emergency_name: "Test contact",
  emergency_phone: "555-0101",
  payment_method: "zelle",
  amount_due: 245,
};
const input = () => ({
  request_id: ID,
  registration: { ...fields },
  admin_reviewed: true,
});
function harness(
  options: { user?: string; rpc?: unknown; status?: number; throws?: boolean } =
    {},
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const logs: unknown[] = [];
  const handler = createHandler({
    env: (key) =>
      ({
        ALLOWED_ORIGIN: "https://site.invalid",
        ADMIN_EMAILS: "admin@example.com",
      })[key],
    authenticatedUser: async () =>
      options.user === "none"
        ? null
        : { id: ACTOR, email: options.user || "admin@example.com" },
    fetch: async () => {
      throw new Error("No Turnstile or email fetch is permitted");
    },
    log: (...args) => logs.push(args),
    databaseRequest: async (path, init) => {
      writes.push({ path, body: JSON.parse(String(init?.body)) });
      assert.equal(path, "rpc/admin_create_registration");
      assert.equal(init?.method, "POST");
      if (options.throws) {
        throw new Error("private-person@example.com synthetic-secret");
      }
      return new Response(
        JSON.stringify(options.rpc ?? { status: "created", id: ID }),
        { status: options.status || 200 },
      );
    },
  });
  return {
    writes,
    logs,
    run: async (body: unknown = input(), origin = "https://site.invalid") => {
      const response = await handler(
        new Request("https://edge.invalid/admin-registrations", {
          method: "POST",
          headers: {
            Origin: origin,
            Authorization: "Bearer synthetic-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
      return { status: response.status, body: await response.json() };
    },
  };
}

Deno.test("admin creation normalizes allowlisted fields and uses authenticated actor in one RPC", async () => {
  for (const method of ["zelle", "money_order", "paypal"]) {
    const h = harness();
    const body = input();
    body.registration.payment_method = method;
    assert.deepEqual(await h.run(body), {
      status: 201,
      body: { status: "created", id: ID },
    });
    assert.equal(h.writes.length, 1);
    const rpc = h.writes[0].body;
    assert.equal(rpc.p_actor_id, ACTOR);
    assert.equal(rpc.p_request_id, ID);
    const registration = rpc.p_registration as Record<string, unknown>;
    assert.equal(registration.first_name, "Synthetic First");
    assert.equal(registration.email, "test@example.com");
    assert.equal(registration.youth_info, null);
    assert.equal(registration.amount_due, 245);
    assert.ok(!("payment_status" in registration));
    assert.equal(h.logs.length, 0);
  }
});

Deno.test("unauthorized users and wrong origins never reach create RPC", async () => {
  for (
    const [user, status] of [["none", 401], ["other@example.com", 403]] as const
  ) {
    const h = harness({ user });
    assert.equal((await h.run()).status, status);
    assert.equal(h.writes.length, 0);
  }
  const h = harness();
  assert.equal((await h.run(input(), "https://other.invalid")).status, 403);
  assert.equal(h.writes.length, 0);
});

Deno.test("invalid or privileged creation fields are rejected without writes", async () => {
  const bad = [
    { ...input(), request_id: "bad" },
    { ...input(), admin_reviewed: false },
    { ...input(), p_actor_id: ACTOR },
    { ...input(), registration: [] },
    ...[
      "payment_status",
      "registration_status",
      "amount_received",
      "source",
      "payment_verified_at",
      "payment_verified_by",
      "payment_understanding",
      "id",
    ].map((key) => ({
      ...input(),
      registration: { ...fields, [key]: "verified" },
    })),
    ...[0, -1, 1.001, 100001, "245"].map((amount_due) => ({
      ...input(),
      registration: { ...fields, amount_due },
    })),
    ...[
      { first_name: "" },
      { email: "bad" },
      { youth_info: "x".repeat(2001) },
      { videophone: 123 },
      { payment_method: "cash" },
    ].map((change) => ({ ...input(), registration: { ...fields, ...change } })),
  ];
  for (const body of bad) {
    const h = harness();
    assert.equal((await h.run(body)).status, 400);
    assert.equal(h.writes.length, 0);
  }
});

Deno.test("creation results and conflicts are sanitized; replay never becomes a PATCH", async () => {
  for (
    const [status, http] of [
      ["replayed", 200],
      ["duplicate_registration", 409],
      ["request_conflict", 409],
      ["registration_deleted", 409],
      ["invalid_details", 400],
    ] as const
  ) {
    const h = harness({
      rpc: { status, id: ID, raw: "private-person@example.com" },
    });
    const result = await h.run();
    assert.equal(result.status, http);
    assert.equal(h.writes.length, 1);
    assert.ok(!JSON.stringify(result).includes("private-person"));
    if (status === "duplicate_registration") {
      assert.equal(result.body.existing_id, ID);
    }
  }
  for (
    const options of [{ throws: true }, { status: 500 }, {
      rpc: { status: "unexpected", secret: "private-person@example.com" },
    }]
  ) {
    const h = harness(options);
    assert.equal((await h.run()).status, 500);
    assert.ok(!JSON.stringify(h.logs).includes("private-person"));
  }
});

Deno.test("identity edits update structured names and derived full name, and reject duplicates safely", async () => {
  for (const duplicate of [false, true]) {
    let written: Record<string, unknown> | undefined;
    const handler = createHandler({
      env: (key) =>
        ({
          ALLOWED_ORIGIN: "https://site.invalid",
          ADMIN_EMAILS: "admin@example.com",
        })[key],
      authenticatedUser: async () => ({
        id: ACTOR,
        email: "admin@example.com",
      }),
      fetch: async () => {
        throw new Error("No email allowed");
      },
      log: () => {},
      databaseRequest: async (_path, init) => {
        if (!init?.method) {
          return new Response(
            JSON.stringify([{
              id: ID,
              first_name: "Old",
              last_name: "Name",
              payment_status: "not_started",
              registration_status: "pending",
            }]),
          );
        }
        written = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify(
            duplicate
              ? { code: "23505", details: "private-person@example.com" }
              : [{ id: ID, ...written }],
          ),
          { status: duplicate ? 409 : 200 },
        );
      },
    });
    const response = await handler(
      new Request("https://edge.invalid/admin-registrations", {
        method: "PATCH",
        headers: {
          Origin: "https://site.invalid",
          Authorization: "Bearer synthetic-token",
        },
        body: JSON.stringify({
          id: ID,
          changes: {
            first_name: " New  First ",
            last_name: "Last",
            email: " NEW@EXAMPLE.COM ",
          },
        }),
      }),
    );
    assert.equal(response.status, duplicate ? 409 : 200);
    assert.equal(written?.full_name, "New First Last");
    assert.equal(written?.first_name, "New First");
    assert.equal(written?.email, "new@example.com");
    assert.ok(!(await response.text()).includes("private-person"));
  }
});

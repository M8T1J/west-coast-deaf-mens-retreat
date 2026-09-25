// Capture the local entrypoint instead of starting a server. Every fetch is mocked.
// deno-lint-ignore-file require-await
import assert from "node:assert/strict";

Deno.test("public create still requires Turnstile before insert; identity conflicts are sanitized", async () => {
  const originalServe = Deno.serve;
  const originalEnvGet = Deno.env.get;
  const originalFetch = globalThis.fetch;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const calls: string[] = [];
  let turnstileOK = false;
  const env: Record<string, string> = {
    ALLOWED_ORIGIN: "https://site.invalid",
    SUPABASE_URL: "https://database.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role",
    TURNSTILE_SECRET_KEY: "synthetic-turnstile",
  };
  try {
    Deno.env.get = (name) => env[name];
    Deno.serve = ((callback: typeof handler) => {
      handler = callback;
    }) as unknown as typeof Deno.serve;
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return new Response(JSON.stringify({ success: turnstileOK }));
      }
      assert.ok(
        url.startsWith(
          "https://database.invalid/rest/v1/registrations?on_conflict=",
        ),
      );
      return new Response(
        JSON.stringify({
          code: "23505",
          details: "private-person@example.com",
        }),
        { status: 409 },
      );
    };
    await import("./index.ts");
    assert.ok(handler);
    const body = {
      clientRegistrationId: "11111111-1111-4111-8111-111111111111",
      firstName: "Synthetic",
      lastName: "Registrant",
      email: "test@example.com",
      phone: "555-0100",
      addressLine: "Test address",
      city: "Test city",
      zipCode: "00000",
      churchName: "Test church",
      emergencyName: "Test contact",
      emergencyPhone: "555-0101",
      paymentMethod: "zelle",
      amount: 245,
      paymentUnderstanding: true,
    };
    const run = (value: unknown) =>
      handler!(
        new Request("https://edge.invalid/public-register", {
          method: "POST",
          headers: { Origin: "https://site.invalid" },
          body: JSON.stringify(value),
        }),
      );
    assert.equal((await run(body)).status, 400);
    assert.equal(calls.length, 0);
    assert.equal(
      (await run({ ...body, turnstileToken: "synthetic-token" })).status,
      403,
    );
    assert.equal(calls.length, 1);
    turnstileOK = true;
    const response = await run({ ...body, turnstileToken: "synthetic-token" });
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.code, "duplicate_registration");
    assert.ok(!JSON.stringify(result).includes("private-person"));
    assert.equal(calls.length, 3);
  } finally {
    Deno.serve = originalServe;
    Deno.env.get = originalEnvGet;
    globalThis.fetch = originalFetch;
  }
});

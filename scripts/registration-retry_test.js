// Offline-only retry test: browser storage and Supabase are mocked in a VM.
import assert from "node:assert/strict";
import vm from "node:vm";

const UUID_ONE = "11111111-1111-4111-8111-111111111111";
const UUID_TWO = "22222222-2222-4222-8222-222222222222";

function harness(callFunction) {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const window = {
    addEventListener() {},
    wcdmrSupabase: { callFunction },
    wcdmrTurnstileWidgetId: "synthetic-widget",
    turnstile: {
      getResponse: () => "synthetic-turnstile-token",
      reset() {},
    },
  };
  const context = vm.createContext({
    window,
    localStorage,
    console: { warn() {} },
    Date,
    JSON,
    Map,
    Array,
    String,
    Object,
    Math,
    Promise,
  });
  return { context, localStorage, window };
}

const source = await Deno.readTextFile("registration-handler.js");
const fields = () => ({
  firstName: "Synthetic",
  lastName: "Registrant",
  email: "test@example.invalid",
  phone: "555-0100",
  addressLine: "Synthetic Road",
  city: "Test City",
  zipCode: "00000",
  churchName: "Test Church",
  emergencyName: "Test Contact",
  emergencyPhone: "555-0101",
  paymentUnderstanding: true,
  amount: 245,
  paymentMethod: "zelle",
});

Deno.test("failed public registration retry reuses its UUID and confirmed success clears it", async () => {
  const requests = [];
  let calls = 0;
  const h = harness(async (_name, options) => {
    requests.push(options.body);
    calls += 1;
    if (calls === 1) throw new Error("synthetic lost response");
    return { id: "synthetic-registration-row", status: "pending" };
  });
  vm.runInContext(source, h.context, { filename: "registration-handler.js" });
  const makeId = () => UUID_ONE;

  const firstAttempt = { ...fields() };
  firstAttempt.registrationId = h.window.wcdmrGetOrCreateRegistrationClientId(
    makeId,
    firstAttempt,
  );
  await assert.rejects(
    h.window.storeRegistrationData(firstAttempt),
    /synthetic lost response/,
  );
  assert.equal(
    h.localStorage.getItem("wcdmr_registration_client_id"),
    UUID_ONE,
  );
  assert.equal(requests[0].clientRegistrationId, UUID_ONE);
  assert.ok(
    h.localStorage.getItem("wcdmr_registrations"),
    "saved form data remains available",
  );

  // The page constructs a fresh form object on retry; the persisted id wins.
  const retry = { ...fields() };
  retry.registrationId = h.window.wcdmrGetOrCreateRegistrationClientId(
    () => UUID_TWO,
    retry,
  );
  assert.equal(retry.registrationId, UUID_ONE);
  const result = await h.window.storeRegistrationData(retry);
  assert.equal(result.id, "synthetic-registration-row");
  assert.equal(requests[1].clientRegistrationId, UUID_ONE);
  assert.equal(h.localStorage.getItem("wcdmr_registration_client_id"), null);
  assert.ok(
    h.localStorage.getItem("wcdmr_registrations_backup"),
    "existing safety-copy recovery remains",
  );

  const nextDraft = h.window.wcdmrGetOrCreateRegistrationClientId(
    () => UUID_TWO,
    fields(),
  );
  assert.equal(
    nextDraft,
    UUID_TWO,
    "a later registration receives a fresh id after success",
  );
});

Deno.test("an unconfirmed successful HTTP response does not clear the retry UUID", async () => {
  const h = harness(async () => null);
  vm.runInContext(source, h.context, { filename: "registration-handler.js" });
  const draft = fields();
  const id = h.window.wcdmrGetOrCreateRegistrationClientId(
    () => UUID_ONE,
    draft,
  );
  await h.window.storeRegistrationData({ ...fields(), registrationId: id });
  assert.equal(
    h.localStorage.getItem("wcdmr_registration_client_id"),
    UUID_ONE,
  );
});

Deno.test("different attendees get separate UUIDs while each failed draft keeps its retry UUID", async () => {
  const requests = [];
  let calls = 0;
  const h = harness(async (_name, options) => {
    requests.push(options.body.clientRegistrationId);
    calls += 1;
    if (calls === 1) throw new Error("synthetic lost response");
    return { id: `synthetic-row-${calls}`, status: "pending" };
  });
  vm.runInContext(source, h.context, { filename: "registration-handler.js" });

  const attendeeA = { ...fields() };
  attendeeA.registrationId = h.window.wcdmrGetOrCreateRegistrationClientId(
    () => UUID_ONE,
    attendeeA,
  );
  await assert.rejects(
    h.window.storeRegistrationData(attendeeA),
    /synthetic lost response/,
  );

  const attendeeB = {
    ...fields(),
    firstName: "Different",
    fullName: "Different Registrant",
    email: "different@example.invalid",
  };
  attendeeB.registrationId = h.window.wcdmrGetOrCreateRegistrationClientId(
    () => UUID_TWO,
    attendeeB,
  );
  assert.equal(attendeeB.registrationId, UUID_TWO);
  await h.window.storeRegistrationData(attendeeB);

  const retryA = { ...fields() };
  retryA.registrationId = h.window.wcdmrGetOrCreateRegistrationClientId(
    () => UUID_TWO,
    retryA,
  );
  assert.equal(retryA.registrationId, UUID_ONE);
  await h.window.storeRegistrationData(retryA);

  assert.deepEqual(requests, [UUID_ONE, UUID_TWO, UUID_ONE]);
});

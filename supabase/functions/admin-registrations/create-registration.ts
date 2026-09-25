import { jsonResponse } from "../_shared/http.ts";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const FIELDS: Record<string, [number, boolean]> = {
  first_name: [100, true],
  last_name: [100, true],
  email: [254, true],
  phone: [50, true],
  videophone: [50, false],
  address_line: [200, true],
  city: [100, true],
  zip_code: [30, true],
  church_name: [200, true],
  emergency_name: [200, true],
  emergency_phone: [50, true],
  bunk_selection: [500, false],
  youth_info: [2000, false],
  payment_method: [20, true],
};

export function creationPayload(body: Record<string, unknown>) {
  if (
    Object.keys(body).some((key) =>
      !["request_id", "registration", "admin_reviewed"].includes(key)
    ) ||
    typeof body.request_id !== "string" || !UUID.test(body.request_id) ||
    body.admin_reviewed !== true || !body.registration ||
    typeof body.registration !== "object" || Array.isArray(body.registration)
  ) return null;
  const input = body.registration as Record<string, unknown>;
  if (
    Object.keys(input).some((key) =>
      !Object.hasOwn(FIELDS, key) && key !== "amount_due"
    )
  ) return null;
  const registration: Record<string, string | number | null> = {};
  for (const [key, [limit, required]] of Object.entries(FIELDS)) {
    const value = input[key];
    if (value != null && typeof value !== "string") return null;
    let text = typeof value === "string" ? value.trim() : "";
    if ((required && !text) || text.length > limit) return null;
    if (key === "first_name" || key === "last_name") {
      text = text.replace(/\s+/g, " ");
    }
    if (key === "email") text = text.toLowerCase();
    registration[key] = text || null;
  }
  const amount = input.amount_due;
  if (
    !EMAIL.test(String(registration.email)) ||
    /\p{Cc}/u.test(String(registration.email)) ||
    !["paypal", "zelle", "money_order"].includes(
      String(registration.payment_method),
    ) ||
    typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
    amount > 100000 || Number(amount.toFixed(2)) !== amount
  ) return null;
  registration.amount_due = amount;
  return { requestId: body.request_id.toLowerCase(), registration };
}

export async function createRegistration(
  body: Record<string, unknown>,
  actorId: string,
  origin: string,
  databaseRequest: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<Response> {
  const payload = creationPayload(body);
  if (!payload) {
    return jsonResponse(
      { error: "Registration details are invalid", code: "invalid_details" },
      400,
      origin,
    );
  }
  const response = await databaseRequest("rpc/admin_create_registration", {
    method: "POST",
    body: JSON.stringify({
      p_request_id: payload.requestId,
      p_actor_id: actorId,
      p_registration: payload.registration,
      p_admin_reviewed: true,
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Admin creation unavailable");
  }
  const result = await response.json();
  if (
    ["created", "replayed"].includes(result?.status) &&
    typeof result.id === "string" && UUID.test(result.id)
  ) {
    return jsonResponse(
      { id: result.id, status: result.status },
      result.status === "created" ? 201 : 200,
      origin,
    );
  }
  const errors: Record<string, [number, string]> = {
    invalid_details: [400, "Registration details are invalid"],
    duplicate_registration: [
      409,
      "An active registration already exists for this name and email.",
    ],
    request_conflict: [
      409,
      "This request ID was already used for a different submission.",
    ],
    registration_deleted: [
      409,
      "This request created a registration that was subsequently deleted. It was not recreated.",
    ],
  };
  const known =
    typeof result?.status === "string" && Object.hasOwn(errors, result.status)
      ? errors[result.status]
      : null;
  if (!known) throw new Error("Invalid admin creation response");
  return jsonResponse(
    {
      error: known[1],
      code: result.status,
      ...(result.status === "duplicate_registration" &&
          typeof result.id === "string" && UUID.test(result.id)
        ? { existing_id: result.id }
        : {}),
    },
    known[0],
    origin,
  );
}

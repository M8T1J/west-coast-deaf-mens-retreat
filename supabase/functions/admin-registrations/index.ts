import {
  allowedOrigin,
  corsHeaders,
  jsonResponse,
  readJson,
} from "../_shared/http.ts";
import { authenticatedUser, databaseRequest, queryValue } from "../_shared/supabase.ts";

const EDITABLE_FIELDS = new Set([
  "first_name", "last_name", "full_name", "email", "phone", "videophone",
  "address_line", "city", "zip_code", "full_address", "church_name",
  "emergency_name", "emergency_phone", "bunk_selection", "youth_info",
  "payment_method", "amount_due", "amount_received", "payment_status",
  "payment_provider_transaction_id", "payment_provider_payer_id",
  "payment_verification_note", "registration_status", "cancellation_note",
]);
const PAYMENT_STATUSES = new Set([
  "not_started", "pending_paypal", "awaiting_manual_verification", "verified", "failed", "refunded",
]);
const REGISTRATION_STATUSES = new Set(["pending", "completed", "cancelled"]);

function isAdmin(email: string): boolean {
  const allowed = (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

async function authorize(request: Request, origin: string) {
  const user = await authenticatedUser(request.headers.get("Authorization"));
  if (!user) return { response: jsonResponse({ error: "Authentication required" }, 401, origin) };
  if (!isAdmin(user.email)) return { response: jsonResponse({ error: "Administrator access required" }, 403, origin) };
  return { user };
}

function safeChanges(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const changes = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => EDITABLE_FIELDS.has(key)),
  );
  return Object.keys(changes).length ? changes : null;
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return jsonResponse({ error: "Origin not allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const authorization = await authorize(request, origin);
  if ("response" in authorization) return authorization.response;
  const { user } = authorization;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const requestedLimit = Number(url.searchParams.get("limit") || 100);
      const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 100, 1), 500);
      const response = await databaseRequest(
        `registrations?deleted_at=is.null&order=submitted_at.desc&limit=${limit}`,
      );
      if (!response.ok) throw new Error("Registration list failed");
      return jsonResponse(await response.json(), 200, origin);
    }

    const body = await readJson(request);
    if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return jsonResponse({ error: "Registration id is required" }, 400, origin);

    if (request.method === "DELETE") {
      const response = await databaseRequest(`registrations?id=eq.${queryValue(id)}&deleted_at=is.null`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }),
      });
      if (!response.ok) throw new Error("Registration deletion failed");
      const rows = await response.json();
      if (!rows.length) return jsonResponse({ error: "Registration not found" }, 404, origin);
      return jsonResponse({ id, deleted: true }, 200, origin);
    }

    if (request.method !== "PATCH") return jsonResponse({ error: "Method not allowed" }, 405, origin);
    const changes = safeChanges(body.changes);
    if (!changes) return jsonResponse({ error: "No editable changes supplied" }, 400, origin);

    const currentResponse = await databaseRequest(
      `registrations?id=eq.${queryValue(id)}&deleted_at=is.null&limit=1`,
    );
    if (!currentResponse.ok) throw new Error("Registration lookup failed");
    const current = (await currentResponse.json())[0];
    if (!current) return jsonResponse({ error: "Registration not found" }, 404, origin);

    const proposedPaymentStatus = String(changes.payment_status ?? current.payment_status);
    const proposedRegistrationStatus = String(changes.registration_status ?? current.registration_status);
    if (!PAYMENT_STATUSES.has(proposedPaymentStatus) || !REGISTRATION_STATUSES.has(proposedRegistrationStatus)) {
      return jsonResponse({ error: "Invalid registration or payment status" }, 400, origin);
    }

    if (proposedPaymentStatus === "verified") {
      const amountReceived = Number(changes.amount_received ?? current.amount_received);
      if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
        return jsonResponse({ error: "A verified payment requires a received amount" }, 400, origin);
      }
      changes.registration_status = "completed";
      if (!current.payment_verified_at) {
        changes.payment_verified_at = new Date().toISOString();
        changes.payment_verified_by = user.id;
      }
    } else if (proposedRegistrationStatus === "completed") {
      return jsonResponse({ error: "Only a verified payment may complete a registration" }, 400, origin);
    }

    if (proposedRegistrationStatus === "cancelled") {
      changes.cancelled_at = new Date().toISOString();
      changes.cancelled_by = user.id;
    }
    changes.updated_at = new Date().toISOString();
    changes.updated_by = user.id;

    const response = await databaseRequest(`registrations?id=eq.${queryValue(id)}&deleted_at=is.null`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes),
    });
    if (!response.ok) throw new Error("Registration update failed");
    const rows = await response.json();
    if (!rows.length) return jsonResponse({ error: "Registration not found" }, 404, origin);
    return jsonResponse(rows[0], 200, origin);
  } catch (error) {
    console.error("Admin registration request failed", error);
    return jsonResponse({ error: "Unable to process registration request" }, 500, origin);
  }
});

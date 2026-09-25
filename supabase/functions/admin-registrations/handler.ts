import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createRegistration } from "./create-registration.ts";
import { sendVerificationEmail } from "./verification-email.ts";

type Dependencies = {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  databaseRequest: (path: string, init?: RequestInit) => Promise<Response>;
  authenticatedUser: (
    authorization: string | null,
  ) => Promise<{ id: string; email: string } | null>;
  log: (message: string, details: unknown) => void;
};
const queryValue = encodeURIComponent;

export function createHandler(deps: Dependencies) {
  const { databaseRequest, authenticatedUser } = deps;

  const EDITABLE_FIELDS = new Set([
    "first_name",
    "last_name",
    "full_name",
    "email",
    "phone",
    "videophone",
    "address_line",
    "city",
    "zip_code",
    "full_address",
    "church_name",
    "emergency_name",
    "emergency_phone",
    "bunk_selection",
    "youth_info",
    "payment_method",
    "amount_due",
    "amount_received",
    "payment_status",
    "payment_provider_transaction_id",
    "payment_provider_payer_id",
    "payment_verification_note",
    "registration_status",
    "cancellation_note",
  ]);
  const PAYMENT_STATUSES = new Set([
    "not_started",
    "pending_paypal",
    "awaiting_manual_verification",
    "verified",
    "failed",
    "refunded",
  ]);
  const REGISTRATION_STATUSES = new Set(["pending", "completed", "cancelled"]);

  function isAdmin(email: string): boolean {
    const allowed = (deps.env("ADMIN_EMAILS") || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return allowed.includes(email.toLowerCase());
  }

  async function authorize(request: Request, origin: string) {
    const user = await authenticatedUser(request.headers.get("Authorization"));
    if (!user) {
      return {
        response: jsonResponse(
          { error: "Authentication required" },
          401,
          origin,
        ),
      };
    }
    if (!isAdmin(user.email)) {
      return {
        response: jsonResponse(
          { error: "Administrator access required" },
          403,
          origin,
        ),
      };
    }
    return { user };
  }

  function safeChanges(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const changes = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([key]) =>
        EDITABLE_FIELDS.has(key)
      ),
    );
    return Object.keys(changes).length ? changes : null;
  }

  return async (request: Request): Promise<Response> => {
    const configuredOrigin = deps.env("ALLOWED_ORIGIN");
    const origin =
      configuredOrigin && request.headers.get("Origin") === configuredOrigin
        ? configuredOrigin
        : null;
    if (!origin) return jsonResponse({ error: "Origin not allowed" }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const authorization = await authorize(request, origin);
    if (authorization.response) return authorization.response;
    const { user } = authorization;

    try {
      if (request.method === "GET") {
        const url = new URL(request.url);
        const requestedLimit = Number(url.searchParams.get("limit") || 100);
        const limit = Math.min(
          Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 100, 1),
          500,
        );
        const response = await databaseRequest(
          `registrations?deleted_at=is.null&order=submitted_at.desc&limit=${limit}`,
        );
        if (!response.ok) throw new Error("Registration list failed");
        return jsonResponse(await response.json(), 200, origin);
      }

      const body = await readJson(request);
      if (!body) {
        return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
      }
      if (request.method === "POST") {
        return await createRegistration(body, user.id, origin, databaseRequest);
      }
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) {
        return jsonResponse(
          { error: "Registration id is required" },
          400,
          origin,
        );
      }

      if (request.method === "DELETE") {
        const response = await databaseRequest(
          `registrations?id=eq.${queryValue(id)}&deleted_at=is.null`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              deleted_at: new Date().toISOString(),
              deleted_by: user.id,
              updated_at: new Date().toISOString(),
              updated_by: user.id,
            }),
          },
        );
        if (!response.ok) throw new Error("Registration deletion failed");
        const rows = await response.json();
        if (!rows.length) {
          return jsonResponse({ error: "Registration not found" }, 404, origin);
        }
        return jsonResponse({ id, deleted: true }, 200, origin);
      }

      if (request.method !== "PATCH") {
        return jsonResponse({ error: "Method not allowed" }, 405, origin);
      }
      const changes = safeChanges(body.changes);
      if (!changes) {
        return jsonResponse(
          { error: "No editable changes supplied" },
          400,
          origin,
        );
      }

      const currentResponse = await databaseRequest(
        `registrations?id=eq.${queryValue(id)}&deleted_at=is.null&limit=1`,
      );
      if (!currentResponse.ok) throw new Error("Registration lookup failed");
      const current = (await currentResponse.json())[0];
      if (!current) {
        return jsonResponse({ error: "Registration not found" }, 404, origin);
      }

      if (
        "first_name" in changes || "last_name" in changes ||
        "full_name" in changes
      ) {
        // Require structured names for name changes; do not guess how to split a full name.
        const first = changes.first_name ?? current.first_name;
        const last = changes.last_name ?? current.last_name;
        if (
          typeof first !== "string" || !first.trim() ||
          first.trim().length > 100 ||
          typeof last !== "string" || !last.trim() ||
          last.trim().length > 100 ||
          ("full_name" in changes &&
            !("first_name" in changes || "last_name" in changes))
        ) {
          return jsonResponse(
            { error: "Edit first and last name separately" },
            400,
            origin,
          );
        }
        changes.first_name = first.trim().replace(/\s+/g, " ");
        changes.last_name = last.trim().replace(/\s+/g, " ");
        changes.full_name = `${changes.first_name} ${changes.last_name}`;
      }
      if ("email" in changes) {
        if (
          typeof changes.email !== "string" ||
          changes.email.trim().length > 254 ||
          !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(changes.email.trim())
        ) {
          return jsonResponse({ error: "Email is invalid" }, 400, origin);
        }
        changes.email = changes.email.trim().toLowerCase();
      }

      const proposedPaymentStatus = String(
        changes.payment_status ?? current.payment_status,
      );
      const proposedRegistrationStatus = String(
        changes.registration_status ?? current.registration_status,
      );
      if (
        !PAYMENT_STATUSES.has(proposedPaymentStatus) ||
        !REGISTRATION_STATUSES.has(proposedRegistrationStatus)
      ) {
        return jsonResponse(
          { error: "Invalid registration or payment status" },
          400,
          origin,
        );
      }

      if (proposedPaymentStatus === "verified") {
        const amountReceived = Number(
          changes.amount_received ?? current.amount_received,
        );
        if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
          return jsonResponse(
            { error: "A verified payment requires a received amount" },
            400,
            origin,
          );
        }
        changes.registration_status = "completed";
        if (!current.payment_verified_at) {
          changes.payment_verified_at = new Date().toISOString();
          changes.payment_verified_by = user.id;
        }
      } else if (proposedRegistrationStatus === "completed") {
        return jsonResponse(
          { error: "Only a verified payment may complete a registration" },
          400,
          origin,
        );
      }

      if (proposedRegistrationStatus === "cancelled") {
        changes.cancelled_at = new Date().toISOString();
        changes.cancelled_by = user.id;
      }
      changes.updated_at = new Date().toISOString();
      changes.updated_by = user.id;

      const verifying = current.payment_status !== "verified" &&
        changes.payment_status === "verified";
      // Compare the old status in the write so a concurrent verification cannot
      // make this request mistake an ordinary edit for a new transition.
      const guard = verifying
        ? `&payment_status=${
          current.payment_status == null
            ? "is.null"
            : `eq.${queryValue(current.payment_status)}`
        }`
        : "";
      const response = await databaseRequest(
        `registrations?id=eq.${queryValue(id)}&deleted_at=is.null${guard}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(changes),
        },
      );
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        if (failure?.code === "23505") {
          return jsonResponse(
            {
              error: "This change conflicts with an existing registration.",
              code: "duplicate_registration",
            },
            409,
            origin,
          );
        }
        throw new Error("Registration update failed");
      }
      const rows = await response.json();
      if (!rows.length) {
        return jsonResponse(
          {
            error: verifying
              ? "Registration changed; refresh and try again"
              : "Registration not found",
          },
          verifying ? 409 : 404,
          origin,
        );
      }
      if (
        verifying && rows[0].payment_status === "verified" &&
        rows[0].registration_status === "completed"
      ) {
        // The successful PATCH has committed the trigger-created outbox row.
        await sendVerificationEmail(id, deps);
      }
      return jsonResponse(rows[0], 200, origin);
    } catch {
      deps.log("Admin registration request failed", {
        code: "admin_request_failed",
        method: request.method,
      });
      return jsonResponse(
        { error: "Unable to process registration request" },
        500,
        origin,
      );
    }
  };
}

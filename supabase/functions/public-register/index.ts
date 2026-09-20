import {
  allowedOrigin,
  corsHeaders,
  jsonResponse,
  optionalText,
  readJson,
  requiredText,
} from "../_shared/http.ts";
import { databaseRequest, queryValue } from "../_shared/supabase.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAYMENT_METHODS = new Set(["paypal", "zelle", "money_order"]);

async function verifyTurnstile(token: string, request: Request): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret || !token) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result?.success === true;
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return jsonResponse({ error: "Origin not allowed" }, 403);
  if (request.method === "OPTIONS") {
    const headers = new Headers(corsHeaders(origin));
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, apikey");
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  const body = await readJson(request);
  if (!body) return jsonResponse({ error: "Invalid JSON body" }, 400, origin);

  const clientRegistrationId = requiredText(body.clientRegistrationId, 36);
  const firstName = requiredText(body.firstName, 100);
  const lastName = requiredText(body.lastName, 100);
  const email = requiredText(body.email, 254)?.toLowerCase();
  const phone = requiredText(body.phone, 50);
  const addressLine = requiredText(body.addressLine, 200);
  const city = requiredText(body.city, 100);
  const zipCode = requiredText(body.zipCode, 30);
  const churchName = requiredText(body.churchName, 200);
  const emergencyName = requiredText(body.emergencyName, 200);
  const emergencyPhone = requiredText(body.emergencyPhone, 50);
  const paymentMethod = requiredText(body.paymentMethod, 20);
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const paymentUnderstanding = body.paymentUnderstanding === true;
  const turnstileToken = requiredText(body.turnstileToken, 4096);

  if (
    !clientRegistrationId || !UUID_PATTERN.test(clientRegistrationId) ||
    !firstName || !lastName || !email || !EMAIL_PATTERN.test(email) || !phone ||
    !addressLine || !city || !zipCode || !churchName || !emergencyName || !emergencyPhone ||
    !paymentMethod || !PAYMENT_METHODS.has(paymentMethod) ||
    !Number.isFinite(amount) || amount <= 0 || amount > 100000 || !paymentUnderstanding ||
    !turnstileToken
  ) {
    return jsonResponse({ error: "Registration details are invalid" }, 400, origin);
  }

  if (!await verifyTurnstile(turnstileToken, request)) {
    return jsonResponse({ error: "Registration verification failed" }, 403, origin);
  }

  const submittedAt = new Date().toISOString();
  const awaitingManualVerification = paymentMethod === "zelle" || paymentMethod === "money_order";
  const registration = {
    client_registration_id: clientRegistrationId,
    source: "website",
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`,
    email,
    phone,
    videophone: optionalText(body.videophone, 50),
    address_line: addressLine,
    city,
    zip_code: zipCode,
    full_address: `${addressLine}, ${city}, ${zipCode}`,
    church_name: churchName,
    emergency_name: emergencyName,
    emergency_phone: emergencyPhone,
    bunk_selection: optionalText(body.bunkSelection, 500),
    youth_info: optionalText(body.youthInfo, 2000),
    payment_understanding: true,
    registration_status: "pending",
    payment_method: paymentMethod,
    amount_due: Math.round(amount * 100) / 100,
    currency: "USD",
    payment_status: awaitingManualVerification ? "awaiting_manual_verification" : "pending_paypal",
    payment_claimed_at: awaitingManualVerification ? submittedAt : null,
    submitted_at: submittedAt,
  };

  try {
    const insert = await databaseRequest("registrations?on_conflict=client_registration_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(registration),
    });
    if (!insert.ok) throw new Error("Registration insert failed");
    const created = await insert.json();
    const row = created[0] || await (async () => {
      const existing = await databaseRequest(
        `registrations?client_registration_id=eq.${queryValue(clientRegistrationId)}&select=id,registration_status`,
      );
      if (!existing.ok) throw new Error("Registration lookup failed");
      return (await existing.json())[0];
    })();
    if (!row?.id) throw new Error("Registration was not returned");
    return jsonResponse({ id: row.id, status: row.registration_status }, 201, origin);
  } catch (error) {
    console.error("Unable to save registration", error);
    return jsonResponse({ error: "Unable to save registration" }, 500, origin);
  }
});

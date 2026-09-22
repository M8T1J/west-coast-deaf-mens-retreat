import { createHash, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";
const OUTBOX_FIELDS =
  "id,registration_id,event_type,status,attempts,sent_at,next_attempt_at,claim_token,lease_expires_at,send_started_at,last_error_code";
const REGISTRATION_FIELDS =
  "id,email,full_name,first_name,last_name,amount_received,currency,payment_status,registration_status,payment_verified_at,deleted_at";
const EMAIL_KEYS = [
  "EMAILJS_SERVICE_ID",
  "EMAILJS_PAYMENT_VERIFIED_TEMPLATE_ID",
  "EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY",
] as const;

type Row = Record<string, unknown>;
type FailureCode =
  | "rate_limited"
  | "quota_exhausted"
  | "configuration_error"
  | "provider_rejected"
  | "delivery_unknown"
  | "pre_dispatch_failure"
  | "invalid_registration";
type Claim = {
  id: string;
  registration_id: string;
  claim_token: string;
  attempts: number;
};
type Dependencies = {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function json(body: Row, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid database response");
  }
  return value as Row;
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error("Invalid database response");
  return value.map(row);
}

async function boundedText(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RequestError(413, "body_too_large");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function input(
  request: Request,
): Promise<{ id?: string; dryRun: boolean }> {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
      "application/json"
  ) {
    throw new RequestError(415, "application_json_required");
  }
  let value: Row;
  try {
    value = row(JSON.parse(await boundedText(request.body, 1024)));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "invalid_json");
  }
  if (
    Object.keys(value).some((key) => !["outbox_id", "dry_run"].includes(key))
  ) {
    throw new RequestError(400, "unexpected_fields");
  }
  if (
    "outbox_id" in value &&
    (typeof value.outbox_id !== "string" || !UUID.test(value.outbox_id))
  ) {
    throw new RequestError(400, "invalid_outbox_id");
  }
  if ("dry_run" in value && typeof value.dry_run !== "boolean") {
    throw new RequestError(400, "invalid_dry_run");
  }
  return {
    id: (value.outbox_id as string | undefined)?.toLowerCase(),
    dryRun: value.dry_run !== false,
  };
}

function authenticated(request: Request, secret: string): boolean {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 4096) return false;
  // Hash to fixed-length buffers before the native constant-time comparison.
  return timingSafeEqual(
    createHash("sha256").update(secret).digest(),
    createHash("sha256").update(header.slice(7)).digest(),
  );
}

function deliveryData(registration: Row, registrationId: string) {
  const email = typeof registration.email === "string"
    ? registration.email.trim()
    : "";
  const amount = typeof registration.amount_received === "number" ||
      typeof registration.amount_received === "string"
    ? Number(registration.amount_received)
    : NaN;
  if (
    registration.id !== registrationId || registration.currency !== "USD" ||
    !Number.isFinite(amount) || amount <= 0 ||
    email.length > 254 ||
    !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ||
    /\p{Cc}/u.test(String(registration.email))
  ) throw new Error("Invalid registration");
  const name = (value: unknown) =>
    typeof value === "string" ? value.replace(/\p{Cc}/gu, "").trim() : "";
  return {
    email,
    amount: amount.toFixed(2),
    name: (name(registration.full_name) ||
      [name(registration.first_name), name(registration.last_name)].filter(
        Boolean,
      ).join(" ") || "Registrant").slice(0, 200),
  };
}

function templateParams(
  registration: Row,
  registrationId: string,
): Record<string, string> {
  const data = deliveryData(registration, registrationId);
  // The dedicated EmailJS template MUST use escaped {{variables}}, not {{{HTML}}}.
  return {
    to_email: data.email,
    to_name: data.name,
    subject: "WCDMR 2026 — Payment verified and registration confirmed",
    email_heading: "Payment verified — registration confirmed",
    intro_copy:
      "We have verified your payment for the West Coast Deaf Men's Retreat 2026. Your registration is confirmed.",
    amount_label: "Amount received (USD)",
    amount: data.amount,
    reference_label: "Registration reference",
    payment_id: registrationId,
    event_dates: "November 6–8, 2026",
    venue: "Pine Crest Camp, Twin Peaks, CA",
    venue_address: "1140 PINECREST ROAD, TWIN PEAKS, CA 92361",
    next_step_one: "Complete the RSVP form if you have not already.",
    next_step_two: "Keep this email for your records.",
    next_step_three: "Follow us for updates and event reminders.",
    outro_copy: "We look forward to seeing you at Pine Crest Camp.",
    support_copy: "Questions? Email wcdeafmr@gmail.com.",
    rsvp_link: "https://forms.gle/qaW22U9mB2C1hGx86",
    facebook_link: "https://www.facebook.com/wcdmr",
    instagram_link: "https://www.instagram.com/wcdmr97/",
  };
}

function retryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim())
    ? Number(value)
    : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(Math.ceil(seconds), 2147483647)
    : null;
}

function claimFrom(value: Row): Claim {
  if (
    typeof value.id !== "string" || !UUID.test(value.id) ||
    typeof value.registration_id !== "string" ||
    !UUID.test(value.registration_id) ||
    typeof value.claim_token !== "string" || !UUID.test(value.claim_token) ||
    !Number.isInteger(value.attempts) || Number(value.attempts) < 0
  ) throw new Error("Invalid claim");
  return value as Claim;
}

export function createHandler(
  deps: Dependencies,
): (request: Request) => Promise<Response> {
  const now = deps.now || Date.now;
  const sleep = deps.sleep ||
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function timed<T>(
    ms: number,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await task(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    const secret = deps.env("REGISTRATION_EMAIL_WORKER_SECRET") || "";
    if (secret.length < 32 || secret.length > 4000) {
      return json({ error: "worker_not_configured" }, 503);
    }
    if (!authenticated(request, secret)) {
      return json({ error: "unauthorized" }, 401);
    }

    let claim: Claim | undefined;
    try {
      const { id: requestedId, dryRun } = await input(request);
      const allowedId = deps.env("REGISTRATION_EMAIL_ALLOWED_OUTBOX_ID")?.trim()
        .toLowerCase();
      if (allowedId && !UUID.test(allowedId)) {
        throw new RequestError(503, "invalid_worker_configuration");
      }
      if (allowedId && requestedId && allowedId !== requestedId) {
        throw new RequestError(403, "outbox_not_allowed");
      }
      const targetId = allowedId || requestedId;
      const enabled = () =>
        deps.env("REGISTRATION_EMAIL_SEND_ENABLED") === "true";
      if (!dryRun && !enabled()) {
        throw new RequestError(503, "sending_disabled");
      }

      let base: URL;
      try {
        base = new URL(deps.env("SUPABASE_URL") || "");
      } catch {
        throw new RequestError(503, "database_not_configured");
      }
      const databaseKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
      if (
        base.protocol !== "https:" || base.username || base.password ||
        base.search || base.hash ||
        base.pathname !== "/" || !databaseKey
      ) throw new RequestError(503, "database_not_configured");
      const emailValues = EMAIL_KEYS.map((key) => deps.env(key)?.trim() || "");
      const emailConfigured = emailValues.every(Boolean);
      if (!dryRun && !emailConfigured) {
        throw new RequestError(503, "email_not_configured");
      }

      const database = async (path: string, body?: Row): Promise<unknown> => {
        return await timed(10_000, async (signal) => {
          const response = await deps.fetch(`${base.origin}/rest/v1/${path}`, {
            method: body ? "POST" : "GET",
            redirect: "error",
            signal,
            headers: {
              apikey: databaseKey!,
              Authorization: `Bearer ${databaseKey}`,
              "Content-Type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error("Database request failed");
          }
          return await response.json();
        });
      };
      const rpc = (name: string, body: Row) => database(`rpc/${name}`, body);
      const select = async (table: string, params: Record<string, string>) =>
        rows(await database(`${table}?${new URLSearchParams(params)}`));

      if (dryRun) {
        const [job] = await select("registration_email_outbox", {
          select: OUTBOX_FIELDS,
          order: "created_at.asc,id.asc",
          limit: "1",
          ...(targetId ? { id: `eq.${targetId}` } : {
            event_type: "eq.payment_verified",
            status: "in.(queued,failed)",
            sent_at: "is.null",
            next_attempt_at: `lte.${new Date(now()).toISOString()}`,
            attempts: "lt.5",
            claim_token: "is.null",
            lease_expires_at: "is.null",
          }),
        });
        if (!job) return json({ dry_run: true, status: "no_job" });
        if (
          typeof job.registration_id !== "string" ||
          !UUID.test(job.registration_id)
        ) throw new Error("Invalid job");
        const [registration] = await select("registrations", {
          select: REGISTRATION_FIELDS,
          id: `eq.${job.registration_id}`,
          limit: "1",
        });
        const [gate] = await select("registration_email_dispatch_control", {
          select: "next_send_allowed_at",
          id: "eq.true",
          limit: "1",
        });
        if (
          !gate ||
          !Number.isFinite(Date.parse(String(gate.next_send_allowed_at)))
        ) throw new Error("Missing dispatch gate");
        let reason = "eligible";
        let data: ReturnType<typeof deliveryData> | undefined;
        try {
          data = deliveryData(registration || {}, job.registration_id);
        } catch {
          reason = "invalid_registration";
        }
        if (
          !registration || registration.deleted_at !== null ||
          registration.payment_status !== "verified" ||
          registration.registration_status !== "completed" ||
          !registration.payment_verified_at
        ) reason = "invalid_registration";
        if (
          job.event_type !== "payment_verified" ||
          !["queued", "failed"].includes(String(job.status)) ||
          job.sent_at !== null || job.claim_token !== null ||
          job.lease_expires_at !== null ||
          !Number.isInteger(job.attempts) || Number(job.attempts) >= 5 ||
          Number(job.attempts) < 0 ||
          !job.next_attempt_at ||
          !(Date.parse(String(job.next_attempt_at)) <= now())
        ) reason = "job_not_due";
        if (
          reason === "eligible" &&
          Date.parse(String(gate.next_send_allowed_at)) > now()
        ) reason = "dispatch_throttled";
        return json({
          dry_run: true,
          status: "preview",
          outbox_id: job.id,
          registration_id: job.registration_id,
          job_status: job.status,
          attempts: job.attempts,
          next_attempt_at: job.next_attempt_at,
          eligible: reason === "eligible",
          reason,
          send_enabled: enabled(),
          email_configured: emailConfigured,
          template_id: emailValues[1] || null,
          recipient: data
            ? `${data.email[0]}***@${data.email.split("@")[1]}`
            : null,
          amount: data?.amount || null,
          currency: registration?.currency || null,
        });
      }

      // Claim and authorization calls are never retried: either could have committed
      // even if its HTTP response was lost. All writes use the applied fenced RPCs.
      const claimed = rows(
        await rpc("claim_registration_email", {
          p_outbox_id: targetId || null,
        }),
      );
      if (!claimed.length) return json({ status: "no_job" });
      if (claimed.length !== 1) throw new Error("Invalid claim count");
      claim = claimFrom(claimed[0]);
      if (targetId && claim.id !== targetId) {
        throw new Error("Claim scope mismatch");
      }
      const owned = { p_outbox_id: claim.id, p_claim_token: claim.claim_token };

      const failed = async (
        code: FailureCode,
        retrySeconds: number | null = null,
      ): Promise<Response> => {
        // Repeating this RPC cannot overwrite a newer claim. Never include a raw
        // provider body or exception in the database, logs, or HTTP response.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const saved = await rpc("fail_registration_email", {
              ...owned,
              p_error_code: code,
              p_retry_after_seconds: retrySeconds,
            });
            if (saved === true) {
              return json({
                status: "failed",
                outbox_id: claim!.id,
                reason: code,
              });
            }
            break;
          } catch {
            if (attempt < 2) await sleep(200 * (attempt + 1));
          }
        }
        return json({
          status: "reconciliation_required",
          outbox_id: claim!.id,
          reason: "failure_update_unconfirmed",
        }, 503);
      };

      let authorization: Row;
      try {
        authorization = row(
          await rpc("authorize_registration_email_send", owned),
        );
      } catch {
        return await failed("pre_dispatch_failure");
      }
      if (authorization.authorized !== true) {
        const reasons = [
          "claim_not_owned",
          "already_authorized",
          "lease_expired",
          "invalid_registration",
          "attempts_exhausted",
          "dispatch_throttled",
        ];
        const reason = String(authorization.reason);
        if (authorization.authorized !== false || !reasons.includes(reason)) {
          return await failed("pre_dispatch_failure");
        }
        return json({ status: "not_authorized", outbox_id: claim.id, reason });
      }

      let payload: string;
      try {
        const authorizedJob = row(authorization.outbox);
        if (
          authorizedJob.id !== claim.id ||
          authorizedJob.claim_token !== claim.claim_token ||
          authorizedJob.registration_id !== claim.registration_id ||
          authorizedJob.status !== "sending" ||
          authorizedJob.event_type !== "payment_verified" ||
          authorizedJob.sent_at !== null ||
          authorizedJob.attempts !== claim.attempts + 1 ||
          Number(authorizedJob.attempts) > 5 ||
          !authorizedJob.send_started_at ||
          !(Date.parse(String(authorizedJob.lease_expires_at)) > now())
        ) {
          return await failed("pre_dispatch_failure");
        }
        payload = JSON.stringify({
          service_id: emailValues[0],
          template_id: emailValues[1],
          user_id: emailValues[2],
          accessToken: emailValues[3],
          template_params: templateParams(
            row(authorization.registration),
            claim.registration_id,
          ),
        });
      } catch {
        return await failed("invalid_registration");
      }
      if (!enabled()) return await failed("pre_dispatch_failure");

      let outcome: {
        accepted: boolean;
        code: FailureCode;
        retry: number | null;
      };
      try {
        outcome = await timed(15_000, async (signal) => {
          // Exactly one provider request. Redirects cannot forward credentials.
          const response = await deps.fetch(EMAILJS_URL, {
            method: "POST",
            redirect: "error",
            signal,
            headers: { "Content-Type": "application/json" },
            body: payload,
          });
          const text = (await boundedText(response.body, 4096)).trim();
          if (response.status === 200 && (text === "OK" || text === '"OK"')) {
            return { accepted: true, code: "delivery_unknown", retry: null };
          }
          let code: FailureCode = "delivery_unknown";
          if (
            response.status === 402 ||
            ((response.status === 400 || response.status === 429) &&
              /\bquota\b|\bmonthly\b/i.test(text))
          ) code = "quota_exhausted";
          else if (response.status === 429) code = "rate_limited";
          else if (response.status === 401 || response.status === 403) {
            code = "configuration_error";
          } else if (
            response.status >= 400 && response.status < 500 &&
            response.status !== 408
          ) code = "provider_rejected";
          return {
            accepted: false,
            code,
            retry: code === "rate_limited"
              ? retryAfter(response.headers.get("Retry-After"), now())
              : null,
          };
        });
      } catch {
        outcome = { accepted: false, code: "delivery_unknown", retry: null };
      }
      if (!outcome.accepted) return await failed(outcome.code, outcome.retry);

      // A lost completion response may conceal a committed success. Retry only
      // finalization, then read the canonical job state. NEVER resend EmailJS.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (await rpc("complete_registration_email", owned) === true) {
            return json({ status: "sent", outbox_id: claim.id });
          }
          break;
        } catch {
          if (attempt < 2) await sleep(200 * (attempt + 1));
        }
      }
      try {
        const [current] = await select("registration_email_outbox", {
          select: "status,sent_at",
          id: `eq.${claim.id}`,
          limit: "1",
        });
        if (current?.status === "sent" && current.sent_at) {
          return json({ status: "sent", outbox_id: claim.id });
        }
      } catch {
        /* Keep the lease/send marker for recovery and manual review. */
      }
      return json({
        status: "reconciliation_required",
        outbox_id: claim.id,
        provider_accepted: true,
        reason: "completion_unconfirmed",
      }, 502);
    } catch (error) {
      if (error instanceof RequestError) {
        return json({ error: error.code }, error.status);
      }
      // No raw errors: they can contain headers, provider payloads, or personal data.
      return json({
        error: "database_or_worker_unavailable",
        ...(claim ? { outbox_id: claim.id } : {}),
      }, 503);
    }
  };
}

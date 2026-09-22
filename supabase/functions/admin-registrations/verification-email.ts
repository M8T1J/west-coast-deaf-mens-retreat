type Dependencies = {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  databaseRequest: (path: string, init?: RequestInit) => Promise<Response>;
  log: (message: string, details: unknown) => void;
};

// Never propagate email failures into the already committed admin action, or
// log raw worker responses/errors that could contain credentials or PII.
export async function sendVerificationEmail(id: string, deps: Dependencies) {
  let failure = "configuration_error";
  let workerHttpStatus: number | undefined;
  let workerPhase: "request" | "http" | "body" | "outcome" | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const secret = deps.env("REGISTRATION_EMAIL_WORKER_SECRET") || "";
    const base = new URL(deps.env("SUPABASE_URL") || "");
    if (
      secret.length < 32 || secret.length > 4000 ||
      base.protocol !== "https:" ||
      base.username || base.password || base.search || base.hash ||
      base.pathname !== "/"
    ) {
      throw new Error();
    }
    failure = "outbox_lookup_failed";
    const response = await deps.databaseRequest(
      `registration_email_outbox?${new URLSearchParams({
        select: "id,status,sent_at",
        registration_id: `eq.${id}`,
        event_type: "eq.payment_verified",
        limit: "1",
      })}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error();
    }
    const jobs = await response.json();
    const job = Array.isArray(jobs) && jobs.length === 1 ? jobs[0] : null;
    if (
      !job || typeof job.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        job.id,
      )
    ) {
      throw new Error();
    }
    // A re-verification must never disturb an existing sent job.
    if (job.status === "sent" || job.sent_at) return;
    failure = "worker_request_failed";
    workerPhase = "request";
    const result = await deps.fetch(
      `${base.origin}/functions/v1/send-registration-email`,
      {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ outbox_id: job.id, dry_run: false }),
      },
    );
    workerHttpStatus = result.status;
    if (!result.ok) {
      workerPhase = "http";
      await result.body?.cancel();
      throw new Error();
    }
    workerPhase = "body";
    const outcome = await result.json();
    // The worker also reports delivery failures in HTTP 200 responses.
    if (outcome?.status === "sent" && outcome.outbox_id === job.id) return;
    failure = "worker_did_not_confirm_send";
    workerPhase = "outcome";
    throw new Error();
  } catch (error) {
    // Only locally defined categories and the numeric HTTP status are logged.
    // Fetch errors can embed URLs/credentials; response bodies and headers are
    // untrusted, including gateway errors and worker/provider diagnostics.
    const category = controller.signal.aborted
      ? "timeout"
      : workerPhase === "http"
      ? "http_error"
      : error instanceof Error && error.name === "AbortError"
      ? "request_aborted"
      : workerPhase === "request"
      ? "transport_error"
      : workerPhase === "body"
      ? error instanceof SyntaxError ? "invalid_json" : "response_read_error"
      : workerPhase === "outcome"
      ? "send_not_confirmed"
      : undefined;
    deps.log("Registration saved; payment verification email not confirmed", {
      registration_id: id,
      code: controller.signal.aborted ? "email_processing_timeout" : failure,
      ...(workerPhase ? { error_category: category } : {}),
      ...(workerHttpStatus !== undefined
        ? { http_status: workerHttpStatus }
        : {}),
    });
  } finally {
    clearTimeout(timer);
  }
}

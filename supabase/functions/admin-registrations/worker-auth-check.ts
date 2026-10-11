type Dependencies = {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
};

// No database dependency, caller overrides, raw diagnostics, or send mode.
export async function checkWorkerAuthentication(
  deps: Dependencies,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const secret = deps.env("REGISTRATION_EMAIL_WORKER_SECRET_NEXT") || "";
    const base = new URL(deps.env("SUPABASE_URL") || "");
    if (
      !/^[\x21-\x7e]{32,4000}$/.test(secret) ||
      base.protocol !== "https:" || base.username || base.password ||
      base.search || base.hash || base.pathname !== "/"
    ) return false;

    const response = await deps.fetch(
      `${base.origin}/functions/v1/send-registration-email`,
      {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: '{"dry_run":true}',
      },
    );
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      return false;
    }

    // Bound streamed responses too; Content-Length is not trusted.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return false;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const outcome = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return !controller.signal.aborted && outcome?.dry_run === true &&
      ["preview", "no_job"].includes(outcome?.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

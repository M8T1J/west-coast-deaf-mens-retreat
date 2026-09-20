const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export function allowedOrigin(request: Request): string | null {
  const configuredOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const requestOrigin = request.headers.get("Origin");
  if (!configuredOrigin || requestOrigin !== configuredOrigin) return null;
  return configuredOrigin;
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function jsonResponse(body: unknown, status: number, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: origin ? corsHeaders(origin) : JSON_HEADERS,
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= maxLength ? text : null;
}

export function requiredText(value: unknown, maxLength: number): string | null {
  const text = optionalText(value, maxLength);
  return text && text.length > 0 ? text : null;
}

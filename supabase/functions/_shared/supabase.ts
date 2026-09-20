const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function configured(): { url: string; serviceRoleKey: string } {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase server credentials are not configured");
  }
  return { url: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY };
}

export async function databaseRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url, serviceRoleKey } = configured();
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function authenticatedUser(authorization: string | null): Promise<{
  id: string;
  email: string;
} | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const { url, serviceRoleKey } = configured();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" && typeof user?.email === "string"
    ? { id: user.id, email: user.email }
    : null;
}

export function queryValue(value: string): string {
  return encodeURIComponent(value);
}

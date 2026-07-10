export const AUTH_COOKIE = "bdc_auth";

let cachedToken: string | null = null;

// Web Crypto so the same code runs in both proxy and Node route handlers.
export async function authToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const password = process.env.ACCESS_PASSWORD ?? "";
  const data = new TextEncoder().encode(`bdc-v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  cachedToken = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return cachedToken;
}

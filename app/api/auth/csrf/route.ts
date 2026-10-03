import { appendCsrfCookie, csrfCookieValue, generateCsrfToken, isValidCsrfToken } from "@/lib/server/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const current = csrfCookieValue(request);
  const token = isValidCsrfToken(current) ? current : generateCsrfToken();
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  appendCsrfCookie(headers, token);
  return new Response(JSON.stringify({ token }), { status: 200, headers });
}

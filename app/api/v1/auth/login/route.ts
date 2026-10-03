import { appendAuthCookie } from "@/lib/server/auth-cookie";
import { fetchDedicatedAuthApi, responseFromUpstream } from "@/lib/server/banking-upstream";
import { appendCsrfCookie, csrfFailureResponse, generateCsrfToken, validateCsrfRequest } from "@/lib/server/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set(["ADMIN", "EMPLOYEE", "CUSTOMER", "TELLER", "MANAGER", "BANNED"]);

function noStore(value: string | null): string {
  if (!value) return "no-store";
  return /(^|,)\s*no-store(?:\s*,|$)/i.test(value) ? value : `${value}, no-store`;
}

function protocolFailure(): Response {
  return new Response(JSON.stringify({ code: "BANKING_UPSTREAM_PROTOCOL_ERROR", message: "The banking service returned an invalid response." }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  if (!validateCsrfRequest(request)) return csrfFailureResponse();
  const result = await fetchDedicatedAuthApi(request, "login");
  if (!result.upstream || !result.responseHeaders) return responseFromUpstream(result);
  const text = await result.upstream.text();
  const headers = new Headers(result.responseHeaders);
  headers.set("Cache-Control", noStore(headers.get("Cache-Control")));
  if (!result.upstream.ok) return new Response(text, { status: result.upstream.status, headers });
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return protocolFailure(); }
  if (!payload || typeof payload !== "object") return protocolFailure();
  const data = payload as { token?: unknown; username?: unknown; role?: unknown };
  if (typeof data.token !== "string" || !data.token || typeof data.username !== "string" || !data.username || typeof data.role !== "string" || !ROLES.has(data.role)) return protocolFailure();
  appendAuthCookie(headers, data.token);
  appendCsrfCookie(headers, generateCsrfToken());
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ username: data.username, role: data.role }), { status: result.upstream.status, headers });
}

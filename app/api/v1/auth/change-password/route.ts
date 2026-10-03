import { appendAuthCookieDeletion } from "@/lib/server/auth-cookie";
import { appendCsrfCookieDeletion, csrfFailureResponse, validateCsrfRequest } from "@/lib/server/csrf";
import { fetchDedicatedAuthApi, responseFromUpstream } from "@/lib/server/banking-upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withSessionDeletion(response: Response): Response {
  const headers = new Headers(response.headers);
  appendAuthCookieDeletion(headers);
  appendCsrfCookieDeletion(headers);
  return new Response(response.body, { status: response.status, headers });
}

export async function PUT(request: Request): Promise<Response> {
  if (!validateCsrfRequest(request)) return csrfFailureResponse();
  const result = await fetchDedicatedAuthApi(request, "change-password");
  if (!result.upstream) return responseFromUpstream(result);
  if (!result.responseHeaders) return responseFromUpstream(result);
  const response = new Response(result.upstream.body, { status: result.upstream.status, headers: result.responseHeaders });
  if (result.upstream.status === 200) return withSessionDeletion(response);
  if (result.upstream.status === 401) {
    const terminal = withSessionDeletion(response);
    const headers = new Headers(terminal.headers);
    headers.set("X-Bank-Auth-Expired", "1");
    return new Response(terminal.body, { status: terminal.status, headers });
  }
  return response;
}

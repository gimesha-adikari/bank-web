import { proxyToBankingApi, isAllowedPath, UpstreamConfigurationError } from "@/lib/server/banking-upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  if (!isAllowedPath(path)) return Response.json({ code: "INVALID_API_PATH", message: "The requested API path is not valid." }, { status: 400 });
  try {
    return await proxyToBankingApi(request, path);
  } catch (error) {
    if (error instanceof UpstreamConfigurationError) return Response.json({ code: "BANKING_PROXY_MISCONFIGURED", message: "The banking API is not configured." }, { status: 500 });
    throw error;
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET,POST,PUT,PATCH,DELETE,OPTIONS" } });
}

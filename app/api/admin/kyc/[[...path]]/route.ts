import { proxyToKycApi } from "@/lib/server/banking-upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const { path = [] } = await context.params;
  return proxyToKycApi(request, "admin/kyc", path);
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;

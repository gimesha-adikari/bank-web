import { apiGet, apiGetBinary, apiJson, apiRequest } from "./http";
import { ApiError } from "./errors";
import type {
  KycAdminCheck, KycCase, KycCheck, KycDecisionRequest, KycDocument, KycDocumentType,
  KycReviewPage, KycReviewQuery, KycSubmitRequest, KycSubmitResponse, KycUploadResponse
} from "./contracts";

type CheckScore = { score: number | string | null };

async function readChecks<T extends KycCheck>(path: string) {
  const checks = await apiGet<(Omit<T, "score"> & CheckScore)[]>(path);
  // The shared lossless parser keeps fractional JSON numbers as text. Check scores are doubles.
  return checks.map(({ score, ...check }) => ({ ...check, score: score === null ? null : Number(score) }));
}

export const kycApi = {
  upload(file: File, type: KycDocumentType, options: { timeoutMs?: number } = {}): Promise<KycUploadResponse> {
    const body = new FormData();
    body.set("file", file);
    body.set("type", type);
    return apiRequest("/api/kyc/upload", { method: "POST", body, timeoutMs: options.timeoutMs });
  },
  file: (id: string): Promise<KycDocument> => apiGetBinary(`/api/kyc/file/${encodeURIComponent(id)}`),
  submit(body: KycSubmitRequest, options: { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<KycSubmitResponse> {
    const headers = options.idempotencyKey === undefined ? undefined : { "X-Idempotency-Key": options.idempotencyKey };
    return apiJson("/api/kyc/submit", "POST", body, { headers, timeoutMs: options.timeoutMs });
  },
  async me(): Promise<KycCase | null> {
    try {
      return await apiGet<KycCase>("/api/kyc/me");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  checks: (id: string) => readChecks<KycCheck>(`/api/kyc/${encodeURIComponent(id)}/checks`),
  admin: {
    list(query: KycReviewQuery = {}): Promise<KycReviewPage> {
      const params = new URLSearchParams();
      if (query.status !== undefined) params.set("status", query.status);
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.size !== undefined) params.set("size", String(query.size));
      const search = params.toString();
      return apiGet(search ? `/api/admin/kyc?${search}` : "/api/admin/kyc");
    },
    checks: (id: string) => readChecks<KycAdminCheck>(`/api/admin/kyc/${encodeURIComponent(id)}/checks`),
    decide: (id: string, body: KycDecisionRequest) => apiJson<KycCase>(`/api/admin/kyc/${encodeURIComponent(id)}/decision`, "POST", body)
  }
};

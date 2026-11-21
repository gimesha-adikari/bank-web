import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateCsrfToken, onAuthExpired } from "@/lib/api/http";
import { kycApi } from "@/lib/api/kyc";

const csrf = "a".repeat(43);
const submission = { docFrontId: "front", docBackId: "back", selfieId: "selfie", addressId: "address", consent: true };

describe("KYC client", () => {
  beforeEach(invalidateCsrfToken);
  afterEach(() => vi.unstubAllGlobals());

  it("lets the browser encode the file and type multipart fields with CSRF", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(Response.json({ id: "upload-id" }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([0, 128, 255])], "synthetic.png", { type: "image/png" });

    await expect(kycApi.upload(file, "DOC_FRONT")).resolves.toEqual({ id: "upload-id" });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/kyc/upload");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("content-type")).toBeNull();
    expect(new Headers(init.headers).get("x-csrf-token")).toBe(csrf);
    const form = init.body as FormData;
    expect(form.get("file")).toBe(file);
    expect(form.get("type")).toBe("DOC_FRONT");
  });

  it("adds the optional submit key and sends reviews through the Admin namespace", async () => {
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(Response.json(url === "/api/auth/csrf" ? { token: csrf } : {})));
    vi.stubGlobal("fetch", fetchMock);
    await kycApi.submit(submission, { idempotencyKey: "kyc-key" });
    await kycApi.submit(submission);
    await kycApi.admin.list({ status: "UNDER_REVIEW", page: 0, size: 25 });
    await kycApi.admin.decide("case-1", { decision: "NEEDS_MORE_INFO", reason: "Image is unreadable" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/csrf",
      "/api/kyc/submit",
      "/api/kyc/submit",
      "/api/admin/kyc?status=UNDER_REVIEW&page=0&size=25",
      "/api/admin/kyc/case-1/decision"
    ]);
    const options = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new Headers(options.headers).get("x-idempotency-key")).toBe("kyc-key");
    expect(new Headers(options.headers).get("idempotency-key")).toBeNull();
    expect(JSON.parse(String(options.body))).toEqual(submission);
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("x-idempotency-key")).toBeNull();
  });

  it("maps only the self-case 404 to no case", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ message: "Not found" }, { status: 404 })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(kycApi.me()).resolves.toBeNull();
    await expect(kycApi.checks("case-1")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/kyc/me", "/api/kyc/case-1/checks"]);
  });

  it("keeps check scores numeric without changing the financial decimal parser", async () => {
    const check = { type: "LIVENESS", score: 0.875, passed: true };
    const adminCheck = { ...check, id: "check-1", caseId: "case-1", detailsJson: "{}", createdAt: "2026-01-01T00:00:00Z" };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json([check]))
      .mockResolvedValueOnce(Response.json([adminCheck])));
    await expect(kycApi.checks("case-1")).resolves.toEqual([check]);
    await expect(kycApi.admin.checks("case-1")).resolves.toEqual([adminCheck]);
    expect(fetch).toHaveBeenLastCalledWith("/api/admin/kyc/case-1/checks", expect.objectContaining({ method: "GET" }));
  });

  it("returns a typed binary document with its disposition", async () => {
    const bytes = Uint8Array.of(0, 128, 255);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, {
      headers: { "Content-Type": "image/png", "Content-Disposition": 'inline; filename="document.png"' }
    })));
    const document = await kycApi.file("document-id");
    expect(document.contentDisposition).toBe('inline; filename="document.png"');
    expect(document.blob.type).toBe("image/png");
    const contents = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(document.blob);
    });
    expect(new Uint8Array(contents)).toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith("/api/kyc/file/document-id", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("uses the normal auth-expiry path for binary requests and preserves 403s", async () => {
    const expired = vi.fn();
    const removeListener = onAuthExpired(expired);
    try {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(Response.json({ message: "Access denied" }, { status: 403 }))
        .mockResolvedValueOnce(Response.json({ message: "Expired" }, { status: 401, headers: { "X-Bank-Auth-Expired": "1" } })));
      await expect(kycApi.file("document-id")).rejects.toMatchObject({ status: 403, message: "Access denied" });
      expect(expired).not.toHaveBeenCalled();
      await expect(kycApi.file("document-id")).rejects.toMatchObject({ status: 401, authExpired: true });
      expect(expired).toHaveBeenCalledTimes(1);
    } finally {
      removeListener();
    }
  });
});

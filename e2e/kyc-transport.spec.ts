import { expect, test, type Page } from "@playwright/test";

const documentId = "85baf41c-42a5-4e47-ae18-bfbca3acf998";
const documentBytes = [137, 80, 78, 71, 13, 10, 26, 10, 255];

async function signIn(page: Page, username: string) {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/v1/auth/login", {
    data: { username, password: "secret" },
    headers: { "X-CSRF-Token": csrf.token }
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ username, role: username.toUpperCase() });
  await page.goto("/");
}

test("browser KYC upload and protected document retrieval use the BFF", async ({ page, request }) => {
  const anonymous = await request.get(`/api/kyc/file/${documentId}`);
  expect(anonymous.status()).toBe(401);

  await signIn(page, "customer");
  const result = await page.evaluate(async (bytes) => {
    const csrf = await (await fetch("/api/auth/csrf")).json();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], "synthetic.png", { type: "image/png" }));
    form.set("type", "DOC_FRONT");
    const upload = await fetch("/api/kyc/upload", { method: "POST", body: form, headers: { "X-CSRF-Token": csrf.token } });
    const { id } = await upload.json();
    const document = await fetch(`/api/kyc/file/${id}`);
    return {
      uploadStatus: upload.status,
      documentStatus: document.status,
      type: document.headers.get("content-type"),
      disposition: document.headers.get("content-disposition"),
      cache: document.headers.get("cache-control"),
      bytes: Array.from(new Uint8Array(await document.arrayBuffer()))
    };
  }, documentBytes);

  expect(result).toEqual({
    uploadStatus: 200,
    documentStatus: 200,
    type: "image/png",
    disposition: 'inline; filename="synthetic.png"',
    cache: "no-store",
    bytes: documentBytes
  });
});

test("bank-core remains the authority for KYC review access", async ({ page }) => {
  await signIn(page, "customer");
  expect(await page.evaluate(async () => (await fetch("/api/admin/kyc")).status)).toBe(403);
  await signIn(page, "admin");
  expect(await page.evaluate(async () => (await fetch("/api/admin/kyc?page=2")).json()))
    .toEqual({ page: 2, size: 20, total: 0, content: [] });
});

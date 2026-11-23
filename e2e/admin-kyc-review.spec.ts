import { expect, test, type Page } from "@playwright/test";

const pendingCaseId = "70000000-0000-4000-8000-000000000001";
const underReviewCaseId = "70000000-0000-4000-8000-000000000099";
const needsInfoCaseId = "70000000-0000-4000-8000-000000000098";

async function signIn(page: Page, username: string, path = "/admin/kyc") {
  await page.context().clearCookies();
  const bootstrap = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/validate-token");
  await page.goto(`/login?returnTo=${encodeURIComponent(path)}`);
  await bootstrap;
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function reviewEvidence(page: Page) {
  const response = await page.request.get("http://127.0.0.1:38080/test/requests");
  return await response.json() as {
    requests: { method: string; path: string }[];
    adminReviewDecisions: { username: string; caseId: string; decision: string; reason: string | null }[];
    adminReviewAttempts: { username: string; caseId: string }[];
  };
}

test("Admin opens an actionable KYC case from the landing page even with no pending cases", async ({ page }) => {
  await signIn(page, "kyc-review-actionable", "/admin");
  const reviewLink = page.getByRole("link", { name: "Review KYC", exact: true });
  await expect(reviewLink).toHaveAttribute("href", "/admin/kyc");
  await reviewLink.click();
  await expect(page).toHaveURL(/\/admin\/kyc$/);
  const filter = page.getByLabel("Filter by status");
  await expect(filter).toHaveValue("UNDER_REVIEW");
  const actionableCase = page.getByRole("button", { name: new RegExp(underReviewCaseId) });
  await actionableCase.click();
  await expect(page.getByRole("button", { name: "Approve case" })).toBeVisible();

  await filter.selectOption("PENDING");
  await expect(page.getByText(/no cases.*pending.*choose another status/i)).toBeVisible();
  await expect(actionableCase).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve case" })).toHaveCount(0);

  await filter.selectOption("UNDER_REVIEW");
  await expect(actionableCase).toBeVisible();
});

test("Admin reviews paginated cases, checks and protected documents through the BFF", async ({ page }) => {
  await page.addInitScript(() => {
    const revoked: string[] = [];
    Object.defineProperty(window, "revokedReviewBlobUrls", { value: revoked });
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => { revoked.push(url); revoke(url); };
  });
  await signIn(page, "kyc-review-admin");
  await expect(page).toHaveURL(/\/admin\/kyc$/);
  await expect(page.getByRole("link", { name: "KYC review" })).toHaveAttribute("href", "/admin/kyc");
  await page.getByLabel("Filter by status").selectOption("PENDING");
  await expect(page.getByRole("button", { name: new RegExp(pendingCaseId) })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("button", { name: /70000000-0000-4000-8000-000000000021/ })).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(pendingCaseId) }).click();

  await expect(page.getByText("FACE_MATCH")).toBeVisible();
  await expect(page.getByText(/private fixture/)).toHaveCount(0);
  await expect(page.getByText(/does not return applicant identity details/i)).toBeVisible();
  await page.getByRole("button", { name: "View ID front" }).click();
  await expect(page.getByRole("img", { name: "ID front submitted for KYC" })).toBeVisible();
  await page.getByRole("button", { name: "Close document" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { revokedReviewBlobUrls: string[] }).revokedReviewBlobUrls.length)).toBe(1);

  const evidence = await reviewEvidence(page);
  expect(evidence.requests.some((item) => item.method === "GET" && item.path === `/admin/kyc/${pendingCaseId}/checks`)).toBe(true);
  expect(evidence.requests.some((item) => item.method === "GET" && item.path === "/kyc/file/75000000-0000-4000-8000-000000000001")).toBe(true);
});

test("Admin decision buttons match current transitions and require confirmation", async ({ page }) => {
  await signIn(page, "kyc-review-decisions");
  await page.getByLabel("Filter by status").selectOption("PENDING");
  await page.getByRole("button", { name: new RegExp(pendingCaseId) }).click();
  await expect(page.getByRole("button", { name: "Request more information" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve case" })).toHaveCount(0);
  await page.getByRole("button", { name: "Request more information" }).click();
  await page.getByLabel("Reason (optional)").fill("Please provide a clearer address document.");
  await expect(page.getByRole("button", { name: "Confirm decision" })).toBeVisible();
  const before = await reviewEvidence(page);
  expect(before.adminReviewDecisions).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.locator(".success-box")).toContainText(/bank-core recorded the needs more information status/i);
  await expect(page.getByRole("button", { name: "Reject case" })).toBeVisible();
  await page.getByRole("button", { name: "Reject case" }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();

  await page.getByLabel("Filter by status").selectOption("UNDER_REVIEW");
  await page.getByRole("button", { name: new RegExp(underReviewCaseId) }).click();
  await page.getByRole("button", { name: "Approve case" }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.locator(".success-box")).toContainText(/bank-core recorded the approved status/i);

  const evidence = await reviewEvidence(page);
  expect(evidence.adminReviewDecisions).toContainEqual({ username: "kyc-review-decisions", caseId: pendingCaseId, decision: "NEEDS_MORE_INFO", reason: "Please provide a clearer address document." });
  expect(evidence.adminReviewDecisions).toContainEqual({ username: "kyc-review-decisions", caseId: pendingCaseId, decision: "REJECTED", reason: null });
  expect(evidence.adminReviewDecisions).toContainEqual({ username: "kyc-review-decisions", caseId: underReviewCaseId, decision: "APPROVED", reason: null });
  expect(evidence.requests.filter((item) => item.method === "POST" && item.path.endsWith("/decision"))).toHaveLength(3);

  await page.getByLabel("Filter by status").selectOption("NEEDS_MORE_INFO");
  await page.getByRole("button", { name: new RegExp(needsInfoCaseId) }).click();
  await expect(page.getByRole("button", { name: "Reject case" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve case" })).toHaveCount(0);
});

test("an uncertain persisted decision is reconciled without an automatic resend", async ({ page }) => {
  await signIn(page, "kyc-review-timeout");
  await page.getByLabel("Filter by status").selectOption("UNDER_REVIEW");
  await page.getByRole("button", { name: new RegExp(underReviewCaseId) }).click();
  await page.getByRole("button", { name: "Approve case" }).click();
  await page.getByRole("button", { name: "Confirm decision" }).click();

  await expect(page.locator(".success-box")).toContainText(/response was interrupted.*bank-core currently reports approved.*no decision was resent/i);
  const evidence = await reviewEvidence(page);
  expect(evidence.adminReviewDecisions.filter((item) => item.username === "kyc-review-timeout" && item.caseId === underReviewCaseId)).toHaveLength(1);
  expect(evidence.adminReviewAttempts.filter((item) => item.username === "kyc-review-timeout" && item.caseId === underReviewCaseId)).toHaveLength(1);
});

for (const username of ["customer", "teller", "manager"]) {
  test(`${username} is denied Admin KYC navigation and backend review requests`, async ({ page }) => {
    await signIn(page, username, "/admin/kyc");
    await expect(page).not.toHaveURL(/\/admin\/kyc$/);
    await page.goto("/admin/kyc");
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "KYC review" })).toHaveCount(0);

    expect(await page.evaluate(async () => (await fetch("/api/admin/kyc")).status)).toBe(403);
    const csrf = await (await page.request.get("/api/auth/csrf")).json();
    const decisionStatus = await page.evaluate(async (token) => (await fetch("/api/admin/kyc/70000000-0000-4000-8000-000000000099/decision", {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ decision: "APPROVED" })
    })).status, csrf.token);
    expect(decisionStatus).toBe(403);
  });
}

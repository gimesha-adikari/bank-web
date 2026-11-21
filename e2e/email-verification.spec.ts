import { expect, test, type APIRequestContext } from "@playwright/test";

const registerVerify = "/api/v1/auth/verify-email";
const emailChangeVerify = "/api/v1/users/me/email/verify";
const result = "/verification-result";
const registrationLink = `${registerVerify}?token=registration-fixture`;

async function callsToCore(request: APIRequestContext, path: string) {
  const { requests } = await (await request.get("http://127.0.0.1:38080/test/requests")).json() as {
    requests: { path: string; method: string }[];
  };
  return requests.filter((entry) => entry.path === path);
}

test("registration asks for verification and resends through the public CSRF-protected BFF", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Username").fill("new-customer");
  await page.getByLabel("Email", { exact: true }).fill("new-customer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic!1");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page.getByText(/verify your email before you can sign in/i)).toBeVisible();
  expect((await page.context().cookies()).some(({ name }) => name.includes("bank-web-auth"))).toBe(false);

  const resend = page.getByRole("button", { name: "Resend verification email" });
  const address = page.getByLabel("Email address");
  await expect(address).toHaveValue("new-customer@example.test");
  await address.fill("rate-limited@example.test");
  await resend.click();
  await expect(page.locator("form").getByRole("alert")).toContainText(/wait.*try again/i);
  await address.fill("new-customer@example.test");
  await resend.click();
  await expect(page.getByText(/if verification is needed/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in after verification" })).toHaveAttribute("href", "/login");
});

test("a registration link skips speculative requests and verifies once before a token-free result", async ({ page, request }) => {
  const initialCalls = (await callsToCore(request, registerVerify)).length;
  expect((await page.request.head(registrationLink)).status()).toBe(405);
  expect((await page.request.get(registrationLink, { headers: { "Sec-Purpose": "prefetch" } })).status()).toBe(204);
  expect(await callsToCore(request, registerVerify)).toHaveLength(initialCalls);

  const response = await page.goto(registrationLink, { referer: "https://mail.example.test/inbox" });
  const entryResponse = await response?.request().redirectedFrom()?.response();
  expect(entryResponse?.status()).toBe(303);
  expect(await entryResponse?.headerValue("cache-control")).toBe("no-store");
  expect(await entryResponse?.headerValue("referrer-policy")).toBe("no-referrer");
  expect((await response?.request().allHeaders())?.referer).toBeUndefined();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`${result}?flow=registration&status=verified`);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/login");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  expect(await callsToCore(request, registerVerify)).toHaveLength(initialCalls + 1);
});

test("invalid registration links offer resend and transport failures are recoverable", async ({ page }) => {
  await page.goto(`${registerVerify}?token=invalid-fixture`);
  await expect(page).toHaveURL(/verification-result\?flow=registration&status=invalid$/);
  await expect(page.getByRole("heading", { name: "Verification link is invalid or expired" })).toBeVisible();
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByText(/if verification is needed/i)).toBeVisible();

  await page.goto(`${registerVerify}?token=transport-fixture`);
  await expect(page).toHaveURL(/verification-result\?flow=registration&status=unavailable$/);
  await expect(page.getByRole("heading", { name: "Verification could not be confirmed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();
});

test("the exact email-change link works without an active browser session", async ({ page }) => {
  expect(await page.context().cookies()).toHaveLength(0);
  await page.goto(`${emailChangeVerify}?token=email-change-fixture`);
  await expect(page).toHaveURL(/verification-result\?flow=email-change&status=verified$/);
  await expect(page.getByRole("heading", { name: "Email address updated" })).toBeVisible();
  await expect(page.getByText(/refresh your profile.*sign in again/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open profile" })).toHaveAttribute("href", "/customer/profile");

  await page.goto(`${emailChangeVerify}?token=email-change-fixture`);
  await expect(page).toHaveURL(/verification-result\?flow=email-change&status=invalid$/);
  await expect(page.getByRole("heading", { name: "Verification link is invalid or expired" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend verification email" })).toHaveCount(0);
});

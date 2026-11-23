import { expect, test, type Page } from "@playwright/test";

type TellerEvidence = {
  tellerMutations: { method: string; path: string; query: string; body: unknown; idempotencyKey: string | null }[];
  tellerReads: { method: string; path: string; query: string; username: string }[];
  tellerUsers: { userId: string; role: { roleName: string } }[];
  ids: { nina: string; ninaTimeout: string; sam: string; ava: string };
};

async function signIn(page: Page, username: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function tellerEvidence(page: Page): Promise<TellerEvidence> {
  const response = await page.request.get("http://127.0.0.1:38080/test/requests");
  return response.json() as Promise<TellerEvidence>;
}

test("Manager can resume the guarded Teller lifecycle workspace", async ({ page }) => {
  await page.goto("/staff/tellers");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await signIn(page, "manager");
  await expect(page).toHaveURL(/\/staff\/tellers$/);
  await expect(page.getByRole("heading", { name: "Teller management" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tellers", exact: true })).toHaveAttribute("href", "/staff/tellers");
});

for (const username of ["admin", "teller"]) {
  test(`${username} cannot access Manager Teller lifecycle`, async ({ page }) => {
    await page.goto("/login");
    await signIn(page, username);
    await page.goto("/staff/tellers");
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("link", { name: "Tellers", exact: true })).toHaveCount(0);
    const status = await page.evaluate(async () => (await fetch("/api/v1/tellers")).status);
    expect(status).toBe(403);
  });
}

test("Manager searches the unpaginated directory locally and sees linked user IDs distinctly", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "manager-teller-directory");
  await page.getByRole("link", { name: "Tellers", exact: true }).click();
  await expect(page.getByText("Ava Teller")).toBeVisible();
  await expect(page.getByText(/without pagination or server-side search/)).toBeVisible();
  await page.getByLabel("Search tellers").fill("former");
  await expect(page.getByText("Former Teller")).toBeVisible();
  await expect(page.getByText("Ava Teller")).toHaveCount(0);
  await page.getByRole("button", { name: /view former teller/i }).click();
  await expect(page.getByText("Employee ID is not returned by bank-core.")).toBeVisible();
  await expect(page.getByText("Linked user UUID")).toBeVisible();
  await expect(page.getByText("Not linked (former Teller)")).toBeVisible();
});

test("Manager assigns an existing customer login using its user UUID and the backend DTO", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "manager-teller-create");
  await page.goto("/staff/tellers");
  await page.getByRole("button", { name: "Assign existing customer as Teller" }).click();
  await expect(page.getByText(/assigns the TELLER role.*revokes its existing sessions.*must sign in again/i)).toBeVisible();
  await page.getByLabel("Existing customer login").selectOption({ label: "Nina Candidate · nina.candidate@example.test" });
  await page.getByLabel("Phone").fill("0712345678");
  await page.getByLabel("Address").fill("1 Synthetic Avenue");
  await page.getByLabel("Gender").selectOption("OTHER");
  await page.getByLabel("Date of birth").fill("1991-05-06");
  await page.getByLabel("Department (optional)").fill("Branch Operations");
  await page.getByRole("button", { name: "Assign Teller" }).click();
  await expect(page.getByText("Teller assignment was confirmed by bank-core.")).toBeVisible();

  const evidence = await tellerEvidence(page);
  const created = evidence.tellerMutations.find((entry: { method: string }) => entry.method === "POST");
  if (!created) throw new Error("No Teller assignment request was recorded.");
  expect(created.path).toBe("/api/v1/tellers");
  expect(created.query).toBe(`userId=${evidence.ids.nina}`);
  expect(created.body).toEqual({
    email: "nina.candidate@example.test", firstName: "Nina", lastName: "Candidate", phone: "0712345678",
    address: "1 Synthetic Avenue", gender: "OTHER", dateOfBirth: "1991-05-06", department: "Branch Operations"
  });
  expect(created.idempotencyKey).toBeNull();
  await expect(page.getByText("TELLER", { exact: true })).toBeVisible();
});

test("Manager updates by linked user UUID and deliberately removes a Teller assignment", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "manager-teller-change");
  await page.goto("/staff/tellers");
  await page.getByRole("button", { name: /view sam teller/i }).click();
  await page.getByRole("button", { name: "Edit Teller profile" }).click();
  await page.getByLabel("Phone").fill("0722222222");
  await page.getByRole("button", { name: "Save Teller profile" }).click();
  await expect(page.getByText("Teller profile update was confirmed by bank-core.")).toBeVisible();
  await page.getByRole("button", { name: /view sam teller/i }).click();
  await page.getByRole("button", { name: "Remove Teller assignment" }).click();
  await expect(page.getByText(/changes the linked login role to CUSTOMER/i)).toBeVisible();
  await expect(page.getByText(/revokes the user’s existing sessions.*must sign in again.*401.*403/i)).toBeVisible();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByText("Teller removal was confirmed by bank-core.")).toBeVisible();

  const evidence = await tellerEvidence(page);
  expect(evidence.tellerMutations).toContainEqual(expect.objectContaining({ method: "PUT", path: `/api/v1/tellers/${evidence.ids.sam}` }));
  expect(evidence.tellerMutations).toContainEqual(expect.objectContaining({ method: "DELETE", path: `/api/v1/tellers/${evidence.ids.sam}` }));
  expect(evidence.tellerUsers.find((entry: { userId: string }) => entry.userId === evidence.ids.sam)?.role.roleName).toBe("CUSTOMER");
});

test("uncertain Teller assignment is reconciled read-only without retrying", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, "manager-teller-create-timeout");
  await page.goto("/staff/tellers");
  await page.getByRole("button", { name: "Assign existing customer as Teller" }).click();
  await page.getByLabel("Existing customer login").selectOption({ label: "Nina Timeout · nina.timeout@example.test" });
  await page.getByLabel("Phone").fill("0712345678");
  await page.getByLabel("Address").fill("2 Synthetic Avenue");
  await page.getByLabel("Gender").selectOption("OTHER");
  await page.getByLabel("Date of birth").fill("1991-05-06");
  await page.getByRole("button", { name: "Assign Teller" }).click();
  await expect(page.getByText(/previous response was interrupted/i)).toBeVisible();
  await expect(page.getByText("Teller assignment was confirmed by bank-core.")).toBeVisible();
  const evidence = await tellerEvidence(page);
  expect(evidence.tellerMutations.filter((entry) => entry.method === "POST" && entry.query === `userId=${evidence.ids.ninaTimeout}`)).toHaveLength(1);
  expect(evidence.tellerReads.filter((entry) => entry.username === "manager-teller-create-timeout").length).toBeGreaterThanOrEqual(2);
});

import { expect, test, type APIRequestContext } from "@playwright/test";

const core = "http://127.0.0.1:38080";
const payHere = "/api/v1/wallet/payhere";
const callbackPaths = [`${payHere}/notify`, `${payHere}/notify/preapprove`];
const notification = "order_id=fixture&payhere_amount=10.00&payhere_currency=LKR&status_code=2&md5sig=mock%2Bsignature";
const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };

async function evidence(request: APIRequestContext) {
  return (await request.get(`${core}/test/requests`)).json() as Promise<{
    requests: { method: string; path: string }[];
    payHereNotifications: {
      path: string; contentType: string; body: string; hasAuthorization: boolean; hasCookie: boolean; hasCsrf: boolean;
    }[];
  }>;
}

async function signIn(request: APIRequestContext, username: string): Promise<string> {
  const { token } = await (await request.get("/api/auth/csrf")).json();
  const login = await request.post("/api/v1/auth/login", {
    headers: { "X-CSRF-Token": token }, data: { username, password: "secret" }
  });
  expect(login.status()).toBe(200);
  expect(await login.json()).not.toHaveProperty("token");
  return (await (await request.get("/api/auth/csrf")).json()).token;
}

test("PayHere browser navigation stays off the bank-web origin and cannot display a payment result", async ({ page, request }) => {
  const { requests } = await evidence(request);
  for (const path of [
    "checkout/fixture", "preapprove/fixture", "return?intentId=fixture&status_code=2", "cancel?intentId=fixture&status=SUCCESS",
    "cards/return?sessionId=fixture&status=2", "cards/cancel?sessionId=fixture&status=2"
  ]) {
    const response = await page.goto(`${payHere}/${path}`);
    expect(response?.status()).toBe(404);
    expect(response?.headers()["location"]).toBeUndefined();
    expect(response?.headers()["content-type"]).toContain("application/json");
    expect(await response?.json()).toEqual({ code: "NOT_FOUND", message: "The requested resource was not found." });
  }
  expect((await evidence(request)).requests.slice(requests.length)).toEqual([]);
});

test("only the direct mock core receives PayHere form notifications", async ({ page, request }) => {
  const { requests, payHereNotifications } = await evidence(request);
  for (const path of [...callbackPaths, "/api/v1/wallet/webhook"]) {
    const result = await request.post(path, { headers: formHeaders, data: notification });
    expect(result.status()).toBe(404);
  }
  const token = await signIn(page.request, "customer");
  for (const path of [...callbackPaths, `${payHere}/future`, "/api/v1/wallet/pay%68ere/notify"]) {
    const result = await page.request.post(path, { headers: { ...formHeaders, "X-CSRF-Token": token }, data: notification });
    expect(result.status()).toBe(404);
    expect(result.headers()["set-cookie"]).toBeUndefined();
  }
  for (const method of ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"]) {
    const result = await request.fetch(callbackPaths[0], { method });
    expect(result.status()).toBe(404);
    expect(result.headers()["allow"]).toBeUndefined();
  }
  expect((await evidence(request)).requests.slice(requests.length).filter(({ path }) => path.startsWith("/api/v1/wallet/"))).toEqual([]);

  for (const path of callbackPaths) {
    expect((await request.get(`${core}${path}`)).status()).toBe(405);
    expect((await request.post(`${core}${path}`, { data: { order_id: "fixture" } })).status()).toBe(415);
    const direct = await request.post(`${core}${path}`, { headers: formHeaders, data: notification });
    expect(direct.status()).toBe(200);
    expect(direct.headers()["content-type"]).toBe("text/plain");
    expect(await direct.text()).toBe("mock notification received");
  }
  expect((await evidence(request)).payHereNotifications.slice(payHereNotifications.length)).toEqual(callbackPaths.map((path) => ({
    path, contentType: "application/x-www-form-urlencoded", body: notification, hasAuthorization: false, hasCookie: false, hasCsrf: false
  })));
});

test("wallet JSON requests retain BFF session and CSRF protection and core role enforcement", async ({ page, request }) => {
  const statusPath = "/api/v1/wallet/payments/w1-intent";
  const createPath = "/api/v1/wallet/payments/qr";
  expect((await request.get(statusPath)).status()).toBe(401);

  await signIn(page.request, "manager");
  expect((await page.request.get(statusPath)).status()).toBe(403);
  await page.context().clearCookies();

  const token = await signIn(page.request, "customer");
  const options = await request.fetch(statusPath, { method: "OPTIONS" });
  expect(options.status()).toBe(204);
  const pending = await page.request.get(statusPath);
  expect(pending.status()).toBe(200);
  expect(await pending.json()).toEqual({ intentId: "w1-intent", status: "PROCESSING" });
  const rejected = await page.request.post(createPath, { data: {} });
  expect(rejected.status()).toBe(403);
  expect(await rejected.json()).toMatchObject({ code: "CSRF_VALIDATION_FAILED" });
  expect((await page.request.post(createPath, { headers: { "X-CSRF-Token": token }, data: {} })).status()).toBe(200);
});

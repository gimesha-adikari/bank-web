import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.MOCK_BANK_CORE_PORT ?? "38080");
const users = [
  ["customer", "CUSTOMER", "e2e-sentinel-jwt"],
  ["teller", "TELLER", "e2e-teller-jwt"],
  ["manager", "MANAGER", "e2e-manager-jwt"],
  ["admin", "ADMIN", "e2e-admin-jwt"],
  ["employee", "EMPLOYEE", "e2e-employee-jwt"],
  ["banned", "BANNED", "e2e-banned-jwt"],
  ...["new-customer", "timeout-customer", "info-customer", "rejected-customer", "lookup-error", "denied-customer", "accounts-error", "retry-customer"]
    .map((username) => [username, "CUSTOMER", `e2e-${username}-jwt`])
].map(([username, role, token]) => ({ username, role, token }));
const account = { accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS", accountStatus: "ACTIVE", balance: "100.0000" };
const documentId = "85baf41c-42a5-4e47-ae18-bfbca3acf998";
const kycDocument = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255]);
const requests = [];
const delayedDepositReceipts = new Map();
const usedVerificationTokens = new Set();
const documentTypes = ["DOC_FRONT", "DOC_BACK", "SELFIE", "ADDRESS_PROOF"];
const onboardingUploads = new Map();
const onboardingCases = new Map();
const customerRecords = new Map();
const retryAttempts = new Map();

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

function authenticatedUser(request) {
  return users.find(({ token }) => request.headers.authorization === `Bearer ${token}`);
}

function profileFor(user) {
  return {
    userId: `0ce3cd10-6395-4acd-9a40-${String(users.indexOf(user) + 1).padStart(12, "0")}`,
    username: user.username, firstName: "Test", lastName: "", email: `${user.username}@example.test`, roleName: user.role
  };
}

function caseFor(status, fields = {}) {
  return { caseId: randomUUID(), status, decisionReason: null, reviewerNotes: null, ...fields };
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/test/requests" && request.method === "GET") return json(response, 200, { count: requests.length, requests });
  requests.push({ method: request.method, path: url.pathname, correlationId: request.headers["x-correlation-id"] ?? null });
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  const path = url.pathname.replace(/^\/api\/v1\//, "");
  if (path === "auth/register" && request.method === "POST") {
    const registration = await new Response(await body(request)).json().catch(() => null);
    if (!registration?.username || !registration.email || !registration.password) {
      return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid registration" });
    }
    response.writeHead(201, { "Content-Type": "text/plain" });
    return response.end("User registered successfully");
  }
  if (path === "auth/resend-verification" && request.method === "POST") {
    const payload = await new Response(await body(request)).json().catch(() => null);
    if (typeof payload?.email !== "string" || !payload.email.includes("@") || Object.keys(payload).length !== 1) {
      return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid email address" });
    }
    if (payload.email === "rate-limited@example.test") return json(response, 429, { message: "Too many requests" }, { "Retry-After": "60" });
    response.writeHead(200, { "Content-Type": "text/plain" });
    return response.end("If an account exists, a verification email has been sent");
  }
  if (["auth/verify-email", "users/me/email/verify"].includes(path) && request.method === "GET") {
    if (request.headers.authorization || request.headers.cookie) return json(response, 400, { message: "Unexpected credentials" });
    const isRegistration = path === "auth/verify-email";
    const token = url.searchParams.get("token");
    const validToken = isRegistration ? "registration-fixture" : "email-change-fixture";
    if (token === "transport-fixture") {
      request.socket.destroy();
      return;
    }
    if (token !== validToken || usedVerificationTokens.has(token)) {
      if (!isRegistration) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Invalid or expired verification token" });
      response.writeHead(403, { "Content-Type": "text/plain" });
      return response.end("Invalid or expired token");
    }
    usedVerificationTokens.add(token);
    response.writeHead(200, { "Content-Type": "text/plain" });
    return response.end(isRegistration ? "Email verified successfully" : "Email updated successfully");
  }
  if (path === "auth/login" && request.method === "POST") {
    let credentials;
    try {
      credentials = JSON.parse((await body(request)).toString());
    } catch {
      return json(response, 400, { message: "Invalid login request" });
    }
    const user = users.find(({ username }) => credentials?.username === username && credentials?.password === "secret");
    return user
      ? json(response, 200, user, { "Cache-Control": "private" })
      : json(response, 401, { message: "Invalid credentials" });
  }
  if (path === "auth/available" && request.method === "GET") return json(response, 200, "Username available");
  const user = authenticatedUser(request);
  if (path === "auth/logout" && request.method === "POST") {
    if (!user) return json(response, 401, { code: "AUTH", message: "Expired" });
    await body(request);
    response.writeHead(200, { "Content-Type": "text/plain" });
    return response.end("Logged out");
  }
  if (path === "auth/change-password" && request.method === "PUT") {
    if (!user) return json(response, 401, { code: "AUTH", message: "Expired" });
    await body(request);
    response.writeHead(200, { "Content-Type": "text/plain" });
    return response.end("Password changed successfully");
  }
  if (path === "auth/validate-token" && request.method === "GET") {
    return user ? json(response, 200, { username: user.username, role: user.role }) : json(response, 401, { code: "AUTH", message: "Expired" });
  }
  if (!user || (path === "expired" && request.method === "GET")) return json(response, 401, { code: "AUTH", message: "Expired" });
  if (path === "users/me" && request.method === "GET") return json(response, 200, profileFor(user));
  if (path === "customers/me" && request.method === "GET") {
    if (user.username === "lookup-error") return json(response, 503, { message: "Service unavailable" });
    const existing = customerRecords.get(user.username);
    if (existing) return json(response, 200, existing);
    if (["customer", "accounts-error"].includes(user.username)) {
      return json(response, 200, { ...profileFor(user), customerId: "existing-customer", status: "ACTIVE" });
    }
    return json(response, 404, { code: "ERR_NOT_FOUND", message: "Customer not found" });
  }
  if (path === "customers/me" && request.method === "PUT") {
    if (onboardingCases.get(user.username)?.status !== "APPROVED") return json(response, 409, {});
    const payload = await new Response(await body(request)).json().catch(() => null);
    const userId = profileFor(user).userId;
    if (!payload || payload.userId !== userId || !payload.firstName?.trim() || !payload.lastName?.trim()
      || !payload.email?.includes("@") || !payload.phone?.trim() || !["MALE", "FEMALE", "OTHER"].includes(payload.gender)
      || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth) || payload.status !== "ACTIVE") {
      return json(response, 400, { code: "ERR_VALIDATION", errors: { userId: "Required authenticated user UUID and valid customer fields." } });
    }
    const saved = { ...payload, customerId: customerRecords.get(user.username)?.customerId ?? randomUUID(), updatedAt: new Date().toISOString() };
    customerRecords.set(user.username, saved);
    return json(response, 200, saved);
  }
  if (url.pathname === "/kyc/me" && request.method === "GET") {
    if (user.username === "denied-customer") return json(response, 403, { message: "Access denied" });
    if (!onboardingCases.has(user.username)) {
      if (user.username === "info-customer") onboardingCases.set(user.username, caseFor("NEEDS_MORE_INFO", { decisionReason: "Please clarify your address." }));
      if (user.username === "rejected-customer") onboardingCases.set(user.username, caseFor("REJECTED", { decisionReason: "Document could not be verified." }));
    }
    const latest = onboardingCases.get(user.username);
    if (!latest) return json(response, 404, { status: 404, error: "Not Found" });
    const result = json(response, 200, latest);
    if (user.username === "new-customer" && latest.status === "PENDING") latest.status = "APPROVED";
    return result;
  }
  if (/^\/kyc\/[^/]+\/checks$/.test(url.pathname) && request.method === "GET") {
    const latest = onboardingCases.get(user.username);
    if (latest?.caseId !== url.pathname.split("/")[2]) return json(response, 404, {});
    const checks = latest.status === "APPROVED" ? [{ type: "FACE_MATCH", score: 0.95, passed: true }] : [];
    return json(response, 200, checks);
  }
  if (url.pathname === "/kyc/submit" && request.method === "POST") {
    const payload = await new Response(await body(request)).json().catch(() => null);
    const key = request.headers["x-idempotency-key"];
    const ids = [payload?.docFrontId, payload?.docBackId, payload?.selfieId, payload?.addressId];
    if (!key || request.headers["idempotency-key"] || payload?.consent !== true || new Set(ids).size !== 4
      || ids.some((id, index) => {
        const upload = onboardingUploads.get(id);
        return upload?.owner !== user.username || upload.type !== documentTypes[index];
      })) return json(response, 400, { message: "Invalid verification payload" });
    if (user.username === "retry-customer") {
      const attempt = JSON.stringify({ key, payload });
      if (!retryAttempts.has(user.username)) {
        retryAttempts.set(user.username, attempt);
        request.socket.destroy();
        return;
      }
      if (retryAttempts.get(user.username) !== attempt) return json(response, 400, { message: "Different retry payload or key" });
    }
    const timedOut = user.username === "timeout-customer";
    const saved = caseFor(timedOut ? "UNDER_REVIEW" : "PENDING", { ...payload, reviewerNotes: timedOut ? "ml_unavailable" : null });
    onboardingCases.set(user.username, saved);
    if (timedOut) {
      setTimeout(() => {
        if (!response.destroyed) json(response, 200, { caseId: saved.caseId, status: saved.status });
      }, 4_000).unref();
      return;
    }
    return json(response, 200, { caseId: saved.caseId, status: saved.status });
  }
  if (url.pathname === "/kyc/upload" && request.method === "POST") {
    const form = await new Response(await body(request), { headers: { "Content-Type": request.headers["content-type"] } }).formData().catch(() => null);
    const file = form?.get("file");
    const type = form?.get("type");
    if (!(file instanceof File) || file.type !== "image/png" || !documentTypes.includes(type) || !kycDocument.equals(Buffer.from(await file.arrayBuffer()))) {
      return json(response, 400, { message: "Unexpected KYC upload" });
    }
    if (user.username === "customer") return json(response, 200, { id: documentId });
    const id = randomUUID();
    onboardingUploads.set(id, { owner: user.username, type });
    return json(response, 200, { id });
  }
  if (url.pathname === `/kyc/file/${documentId}` && request.method === "GET") {
    if (!["CUSTOMER", "ADMIN"].includes(user.role)) return json(response, 403, { message: "Access denied" });
    response.writeHead(200, { "Content-Type": "image/png", "Content-Disposition": 'inline; filename="synthetic.png"' });
    return response.end(kycDocument);
  }
  if (url.pathname === "/admin/kyc" && request.method === "GET") {
    return user.role === "ADMIN"
      ? json(response, 200, { page: Number(url.searchParams.get("page") ?? "0"), size: 20, total: 0, content: [] })
      : json(response, 403, { message: "Access denied" });
  }
  if (path === "customers" && request.method === "GET") return json(response, 200, []);
  if (path === "branches" && request.method === "GET") return json(response, 200, []);
  if (path === "accounts/my" && request.method === "GET") {
    if (user.username === "accounts-error") return json(response, 503, { message: "Accounts service unavailable" });
    return json(response, 200, user.username === "new-customer" ? [] : [account]);
  }
  if (path === "accounts/account-1" && request.method === "GET") return json(response, 200, account);
  if (path === "accounts/account-1/transactions" && request.method === "GET") return json(response, 200, []);
  if (path === "transactions/deposit" && request.method === "POST") {
    let amount;
    try {
      amount = JSON.parse((await body(request)).toString()).amount;
    } catch {
      return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid deposit request" });
    }
    if (amount === "70.01") {
      const key = request.headers["idempotency-key"];
      if (!key) return json(response, 400, { code: "ERR_IDEMPOTENCY_KEY_INVALID", message: "An idempotency key is required" });
      const saved = delayedDepositReceipts.get(key);
      if (saved) return json(response, 200, { ...saved, replayed: true });

      const receipt = { operationType: "DEPOSIT", journalReference: "JR-delayed", amount: "70.0100", currency: "LKR" };
      delayedDepositReceipts.set(key, receipt);
      setTimeout(() => {
        if (!response.destroyed) json(response, 200, receipt);
      }, 4_000).unref();
      return;
    }
    if (amount === "70.02") {
      request.socket.destroy();
      return;
    }
    return json(response, 200, { operation: "DEPOSIT", journalReference: "JR-1", amount: "10.00", currency: "LKR" });
  }
  return json(response, 404, { code: "NOT_FOUND", message: "Not found" });
});

server.listen(port, "127.0.0.1");

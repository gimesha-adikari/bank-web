import http from "node:http";

const port = Number(process.env.MOCK_BANK_CORE_PORT ?? "38080");
const users = [
  ["customer", "CUSTOMER", "e2e-sentinel-jwt"],
  ["teller", "TELLER", "e2e-teller-jwt"],
  ["manager", "MANAGER", "e2e-manager-jwt"],
  ["admin", "ADMIN", "e2e-admin-jwt"],
  ["employee", "EMPLOYEE", "e2e-employee-jwt"],
  ["banned", "BANNED", "e2e-banned-jwt"]
].map(([username, role, token]) => ({ username, role, token }));
const account = { accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS", accountStatus: "ACTIVE", balance: "100.0000" };
const requests = [];

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

function authenticatedUser(request) {
  return users.find(({ token }) => request.headers.authorization === `Bearer ${token}`);
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/test/requests" && request.method === "GET") return json(response, 200, { count: requests.length, requests });
  requests.push({ method: request.method, path: url.pathname, correlationId: request.headers["x-correlation-id"] ?? null });
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  const path = url.pathname.replace(/^\/api\/v1\//, "");
  if (path === "auth/login" && request.method === "POST") {
    let credentials;
    try {
      credentials = JSON.parse(await body(request));
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
  if (path === "customers" && request.method === "GET") return json(response, 200, []);
  if (path === "branches" && request.method === "GET") return json(response, 200, []);
  if (path === "accounts/my" && request.method === "GET") return json(response, 200, [account]);
  if (path === "accounts/account-1" && request.method === "GET") return json(response, 200, account);
  if (path === "accounts/account-1/transactions" && request.method === "GET") return json(response, 200, []);
  if (path === "transactions/deposit" && request.method === "POST") {
    await body(request);
    return json(response, 200, { operation: "DEPOSIT", journalReference: "JR-1", amount: "10.00", currency: "LKR" });
  }
  return json(response, 404, { code: "NOT_FOUND", message: "Not found" });
});

server.listen(port, "127.0.0.1");

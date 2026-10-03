import http from "node:http";

const port = Number(process.env.MOCK_BANK_CORE_PORT ?? "38080");
const token = "e2e-sentinel-jwt";
const account = { accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS", accountStatus: "ACTIVE", balance: "100.0000" };

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

function authenticated(request) {
  return request.headers.authorization === `Bearer ${token}`;
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  const path = url.pathname.replace(/^\/api\/v1\//, "");
  if (path === "auth/login" && request.method === "POST") {
    await body(request);
    return json(response, 200, { token, username: "customer", role: "CUSTOMER" }, { "Cache-Control": "private" });
  }
  if (path === "auth/available" && request.method === "GET") return json(response, 200, "Username available");
  if (path === "auth/logout" && request.method === "POST") {
    if (!authenticated(request)) return json(response, 401, { code: "AUTH", message: "Expired" });
    await body(request);
    response.writeHead(200, { "Content-Type": "text/plain" });
    return response.end("Logged out");
  }
  if (path === "auth/change-password" && request.method === "PUT") {
    if (!authenticated(request)) return json(response, 401, { code: "AUTH", message: "Expired" });
    await body(request);
    response.writeHead(200, { "Content-Type": "text/plain" });
    return response.end("Password changed successfully");
  }
  if (path === "auth/validate-token" && request.method === "GET") {
    return authenticated(request) ? json(response, 200, { username: "customer", role: "CUSTOMER" }) : json(response, 401, { code: "AUTH", message: "Expired" });
  }
  if (path === "expired" && request.method === "GET") return json(response, authenticated(request) ? 401 : 401, { code: "AUTH", message: "Expired" });
  if (!authenticated(request)) return json(response, 401, { code: "AUTH", message: "Expired" });
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

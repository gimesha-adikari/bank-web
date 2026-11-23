import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.MOCK_BANK_CORE_PORT ?? "38080");
const timeoutCustomerUsers = Array.from({ length: 3 }, (_, repeatIndex) =>
  Array.from({ length: 3 }, (_, retryIndex) => {
    const username = `timeout-customer-r${repeatIndex}-t${retryIndex}`;
    return [username, "CUSTOMER", `e2e-${username}-jwt`];
  })
).flat();
const users = [
  ["customer", "CUSTOMER", "e2e-sentinel-jwt"],
  ["teller", "TELLER", "e2e-teller-jwt"],
  ["manager", "MANAGER", "e2e-manager-jwt"],
  ["admin", "ADMIN", "e2e-admin-jwt"],
  ["employee", "EMPLOYEE", "e2e-employee-jwt"],
  ["banned", "BANNED", "e2e-banned-jwt"],
  ["kyc-review-admin", "ADMIN", "e2e-kyc-review-admin-jwt"],
  ["kyc-review-decisions", "ADMIN", "e2e-kyc-review-decisions-jwt"],
  ["kyc-review-timeout", "ADMIN", "e2e-kyc-review-timeout-jwt"],
  ...["admin-access-directory", "admin-access-role-change", "admin-access-timeout", "admin-access-validation"]
    .map((username) => [username, "ADMIN", `e2e-${username}-jwt`]),
  ["alex.customer", "CUSTOMER", "e2e-alex-customer-jwt"],
  ["teller.jordan", "TELLER", "e2e-teller-jordan-jwt"],
  ["inactive.customer", "CUSTOMER", "e2e-inactive-customer-jwt"],
  ["timeout.customer", "CUSTOMER", "e2e-timeout-dot-customer-jwt"],
  ["manager.lee", "MANAGER", "e2e-manager-lee-jwt"],
  ["directory-forbidden", "TELLER", "e2e-directory-forbidden-jwt"],
  ["directory-expired", "TELLER", "e2e-directory-expired-jwt"],
  ["directory-network", "TELLER", "e2e-directory-network-jwt"],
  ...["account-directory-forbidden", "account-directory-expired", "account-directory-network", "account-update-forbidden", "account-update-conflict", "account-update-validation", "account-update-timeout", "account-close-forbidden", "account-close-conflict", "account-close-timeout"]
    .map((username) => [username, "TELLER", `e2e-${username}-jwt`]),
  ["teller-opening-forbidden", "TELLER", "e2e-teller-opening-forbidden-jwt"],
  ["teller-opening-expired", "TELLER", "e2e-teller-opening-expired-jwt"],
  ["teller-opening-timeout", "TELLER", "e2e-teller-opening-timeout-jwt"],
  ["teller-opening-validation", "TELLER", "e2e-teller-opening-validation-jwt"],
  ...["new-customer", "info-customer", "rejected-customer", "lookup-error", "denied-customer", "accounts-error", "retry-customer",
    "opening-approved", "opening-timeout", "opening-network", "opening-branch", "opening-missing", "opening-pending", "opening-auth", "opening-expired",
    "opening-vault", "opening-record-gone", "opening-branches-unavailable", "opening-conflict", "opening-invalid-key",
    "opening-kyc-rejected", "opening-network-validation", "directory-linked", "directory-new", "directory-missing",
    "directory-conflict", "directory-invalid"]
    .map((username) => [username, "CUSTOMER", `e2e-${username}-jwt`]),
  ...["manager-teller-directory", "manager-teller-create", "manager-teller-change", "manager-teller-create-timeout"]
    .map((username) => [username, "MANAGER", `e2e-${username}-jwt`]),
  ["nina-candidate", "CUSTOMER", "e2e-nina-candidate-jwt"],
  ["nina-timeout", "CUSTOMER", "e2e-nina-timeout-jwt"],
  ["sam-teller", "TELLER", "e2e-sam-teller-jwt"],
  ...timeoutCustomerUsers,
  ...["admin-customer-delete", "admin-customer-delete-conflict", "admin-customer-delete-timeout-persisted", "admin-customer-delete-timeout-present"]
    .map((username) => [username, "ADMIN", `e2e-${username}-jwt`]),
  ["a3-stale-customer", "CUSTOMER", "e2e-a3-stale-customer-jwt"],
  ["a3-absent-customer", "CUSTOMER", "e2e-a3-absent-customer-jwt"]
].map(([username, role, token]) => ({ username, role, token }));
if (new Set(users.map(({ token }) => token)).size !== users.length) {
  throw new Error("Mock bank-core fixture contains duplicate user tokens");
}
const managerTellerIds = {
  nina: "0ce3cd10-6395-4acd-9a40-000000000901",
  ninaTimeout: "0ce3cd10-6395-4acd-9a40-000000000902",
  sam: "0ce3cd10-6395-4acd-9a40-000000000903",
  ava: "0ce3cd10-6395-4acd-9a40-000000000904"
};
const adminAccessIds = {
  alex: "0ce3cd10-6395-4acd-9a40-000000000921",
  teller: "0ce3cd10-6395-4acd-9a40-000000000922",
  inactive: "0ce3cd10-6395-4acd-9a40-000000000923",
  timeout: "0ce3cd10-6395-4acd-9a40-000000000924",
  manager: "0ce3cd10-6395-4acd-9a40-000000000925",
  managerEmployee: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0091",
  alexEmployee: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0092"
};
const account = { accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS", accountStatus: "ACTIVE", balance: "100.0000" };
const documentId = "85baf41c-42a5-4e47-ae18-bfbca3acf998";
const kycDocument = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255]);
const requests = [];
const tellerMutations = [];
const tellerReads = [];
const tellerEmployees = new Map();
const adminAccessMutations = [];
const adminAccessReads = [];
const adminAccessRoles = ["ADMIN", "MANAGER", "TELLER", "EMPLOYEE", "CUSTOMER", "BANNED"]
  .map((roleName) => ({ roleId: `role-${roleName.toLowerCase()}`, roleName, description: `${roleName} role`, permissions: null }));
const adminAccessEmployees = [
  { firstName: "Jordan", lastName: "Teller", email: "teller.jordan@example.test", roleName: "TELLER", status: "ACTIVE", department: "Branch Operations", phone: "0722222000", address: "5 Synthetic Road", gender: "OTHER", dateOfBirth: "1991-07-08", hireDate: "2025-01-02T09:00:00", managerId: adminAccessIds.managerEmployee, userId: adminAccessIds.teller },
  { firstName: "Lee", lastName: "Manager", email: "manager.lee@example.test", roleName: "MANAGER", status: "ACTIVE", department: "Operations", phone: "0722223000", address: "6 Synthetic Road", gender: "OTHER", dateOfBirth: "1988-04-12", hireDate: "2024-04-02T09:00:00", managerId: null, userId: adminAccessIds.manager }
];
const delayedDepositReceipts = new Map();
const usedVerificationTokens = new Set();
const documentTypes = ["DOC_FRONT", "DOC_BACK", "SELFIE", "ADDRESS_PROOF"];
const onboardingUploads = new Map();
const onboardingCases = new Map();
const adminReviewCases = new Map();
const adminReviewDecisions = [];
const adminReviewAttempts = [];
const adminReviewDocumentIds = new Set([
  "75000000-0000-4000-8000-000000000001", "75000000-0000-4000-8000-000000000002",
  "75000000-0000-4000-8000-000000000003", "75000000-0000-4000-8000-000000000004"
]);
const customerRecords = new Map();
const customerDirectoryRecords = new Map();
const customerDeletionAttempts = [];
const payHereNotifications = [];
const retryAttempts = new Map();
const openedAccounts = new Map();
const accountOpeningClaims = new Map();
const accountOpeningAttempts = new Map();
const accountOpeningCreations = new Map();
const tellerOpeningRequests = [];
const tellerOpenedAccounts = new Map();
const staffAccountRecords = new Map([
  ["40000000-0000-4000-8000-000000000001", { accountId: "40000000-0000-4000-8000-000000000001", accountNumber: "1000000001", accountType: "SAVINGS", accountStatus: "ACTIVE", balance: "1250.1234", createdAt: "2026-01-02T03:04:05", updatedAt: "2026-01-03T04:05:06" }],
  ["40000000-0000-4000-8000-000000000002", { accountId: "40000000-0000-4000-8000-000000000002", accountNumber: "1000000002", accountType: "CHECKING", accountStatus: "ACTIVE", balance: "50.5000", createdAt: "2026-01-04T03:04:05", updatedAt: "2026-01-04T03:04:05" }],
  ["40000000-0000-4000-8000-000000000003", { accountId: "40000000-0000-4000-8000-000000000003", accountNumber: "1000000003", accountType: "FIXED_DEPOSIT", accountStatus: "CLOSED", balance: "0.0000", createdAt: "2026-01-05T03:04:05", updatedAt: "2026-01-06T03:04:05" }]
]);
const staffAccountHistories = new Map([
  ["40000000-0000-4000-8000-000000000001", [{ transactionId: "50000000-0000-4000-8000-000000000001", accountId: "40000000-0000-4000-8000-000000000001", type: "TRANSFER_OUT", amount: "15.2300", balanceAfter: "1250.1234", description: "Sample account transfer", createdAt: "2026-01-07T08:09:10" }]],
  ["40000000-0000-4000-8000-000000000002", []],
  ["40000000-0000-4000-8000-000000000003", []]
]);
const staffAccountUpdates = [];
const staffAccountClosures = [];
const openingMinimum = { SAVINGS: 1000n, CHECKING: 0n, FIXED_DEPOSIT: 5000n };
const branches = [
  { branchId: 21, branchName: "Central Branch", address: "5 Main Street", contactNumber: "0112234567" },
  { branchId: 2147483647, branchName: "Harbour Branch", address: "12 Harbour Road" }
];

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

function authenticatedUser(request) {
  return users.find(({ token }) => request.headers.authorization === `Bearer ${token}`);
}

function profileFor(user) {
  const profile = {
    userId: `0ce3cd10-6395-4acd-9a40-${String(users.indexOf(user) + 1).padStart(12, "0")}`,
    username: user.username, firstName: "Test", lastName: "", email: `${user.username}@example.test`, roleName: user.role
  };
  if (user.username === "directory-linked") return { ...profile, firstName: "Ava", lastName: "Martin", email: "ava.martin@example.test", address: "10 Sample Road" };
  if (user.username === "directory-new") return { ...profile, firstName: "Grace", lastName: "Hopper", email: "grace.hopper@example.test", address: "20 Synthetic Street" };
  if (user.username === "directory-missing") return { ...profile, firstName: "Vanishing", lastName: "Identity", email: "vanishing@example.test" };
  if (user.username === "directory-conflict") return { ...profile, firstName: "Duplicate", lastName: "Identity", email: "duplicate@example.test" };
  if (user.username === "directory-invalid") return { ...profile, firstName: "Invalid", lastName: "Details", email: "invalid.details@example.test" };
  const adminAccessProfiles = {
    "alex.customer": { userId: adminAccessIds.alex, firstName: "Alex", lastName: "Customer", email: "alex.customer@example.test", address: "1 Synthetic Road", mobileNumber: "0712345678" },
    "teller.jordan": { userId: adminAccessIds.teller, firstName: "Jordan", lastName: "Teller", email: "teller.jordan@example.test", address: "5 Synthetic Road", mobileNumber: "0722222000" },
    "inactive.customer": { userId: adminAccessIds.inactive, firstName: "Inez", lastName: "Inactive", email: "inactive.customer@example.test", address: "2 Synthetic Road", mobileNumber: "0712345000" },
    "timeout.customer": { userId: adminAccessIds.timeout, firstName: "Toby", lastName: "Timeout", email: "timeout.customer@example.test", address: "3 Synthetic Road", mobileNumber: "0722222222" },
    "manager.lee": { userId: adminAccessIds.manager, firstName: "Lee", lastName: "Manager", email: "manager.lee@example.test", address: "6 Synthetic Road", mobileNumber: "0722223000" }
  };
  if (adminAccessProfiles[user.username]) return { ...profile, ...adminAccessProfiles[user.username] };
  const fixedUserIds = {
    "nina-candidate": managerTellerIds.nina,
    "nina-timeout": managerTellerIds.ninaTimeout,
    "sam-teller": managerTellerIds.sam
  };
  if (fixedUserIds[user.username]) profile.userId = fixedUserIds[user.username];
  if (user.username === "nina-candidate") return { ...profile, firstName: "Nina", lastName: "Candidate", email: "nina.candidate@example.test", address: "1 Candidate Road", mobileNumber: "0711112222" };
  if (user.username === "nina-timeout") return { ...profile, firstName: "Nina", lastName: "Timeout", email: "nina.timeout@example.test", address: "2 Candidate Road", mobileNumber: "0711113333" };
  if (user.username === "sam-teller") return { ...profile, firstName: "Sam", lastName: "Teller", email: "sam.teller@example.test", address: "3 Teller Road", mobileNumber: "0722222222" };
  return profile;
}

function userDirectoryFor(user) {
  const profile = profileFor(user);
  return {
    userId: profile.userId, username: user.username, email: profile.email,
    firstName: profile.firstName, lastName: profile.lastName,
    role: { roleId: `role-${user.role.toLowerCase()}`, roleName: user.role, description: null },
    isActive: user.username === "inactive.customer" ? false : true, address: profile.address ?? null, mobileNumber: profile.mobileNumber ?? null,
    emailVerified: true
  };
}

function initialTeller(name, email, userId, status = "ACTIVE") {
  const [firstName, ...lastParts] = name.split(" ");
  return {
    firstName, lastName: lastParts.join(" "), email, roleName: "TELLER", status,
    department: "Branch Operations", phone: "0712345000", address: "4 Teller Street",
    gender: "OTHER", dateOfBirth: "1990-01-02", hireDate: "2025-01-15T10:00:00",
    managerId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", userId
  };
}

function tellerEmployeesFor(username) {
  if (tellerEmployees.has(username)) return tellerEmployees.get(username);
  let records = [];
  if (username === "manager-teller-directory") {
    records = [
      initialTeller("Ava Teller", "ava.teller@example.test", managerTellerIds.ava),
      initialTeller("Former Teller", "former.teller@example.test", null, "INACTIVE")
    ];
  }
  if (username === "manager-teller-change") records = [initialTeller("Sam Teller", "sam.teller@example.test", managerTellerIds.sam)];
  tellerEmployees.set(username, records);
  return records;
}

function initialDirectoryCustomer(username, customerId) {
  const user = users.find((candidate) => candidate.username === username);
  const profile = profileFor(user);
  return {
    customerId, userId: profile.userId, username: user.username, firstName: profile.firstName, lastName: profile.lastName,
    gender: "OTHER", email: profile.email, phone: "0711111111", address: profile.address ?? "",
    dateOfBirth: "1990-02-03", status: "ACTIVE", createdAt: "2026-01-01T00:00:00"
  };
}

customerDirectoryRecords.set("directory-linked", initialDirectoryCustomer("directory-linked", "30000000-0000-4000-8000-000000000001"));
customerDirectoryRecords.set("directory-other", {
  customerId: "30000000-0000-4000-8000-000000000002", userId: null, username: null, firstName: "Morgan", lastName: "Reed",
  gender: "FEMALE", email: "morgan.reed@example.test", phone: "0722222222", address: "30 Example Lane",
  dateOfBirth: "1984-10-12", status: "PENDING", createdAt: "2026-01-02T00:00:00"
});
const deletionCustomerFixtures = [
  ["admin-customer-delete", "30000000-0000-4000-8000-000000000003", "Dana", "Safe"],
  ["admin-customer-delete-conflict", "30000000-0000-4000-8000-000000000004", "Casey", "Dependent"],
  ["admin-customer-delete-timeout-persisted", "30000000-0000-4000-8000-000000000005", "Pat", "Persisted"],
  ["admin-customer-delete-timeout-present", "30000000-0000-4000-8000-000000000006", "Riley", "Uncertain"],
  ["a3-stale-customer", "30000000-0000-4000-8000-000000000007", "Ari", "Updated"],
  ["a3-absent-customer", "30000000-0000-4000-8000-000000000008", "Sam", "Removed"]
];
for (const [username, customerId, firstName, lastName] of deletionCustomerFixtures) {
  const record = initialDirectoryCustomer(username, customerId);
  record.firstName = firstName;
  record.lastName = lastName;
  customerDirectoryRecords.set(customerId, record);
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
  if (url.pathname === "/test/requests" && request.method === "GET") return json(response, 200, {
    count: requests.length, requests, accountOpeningCreations: Object.fromEntries(accountOpeningCreations),
    tellerOpeningRequests, tellerOpenedAccountCount: tellerOpenedAccounts.size,
    staffAccountUpdates, staffAccountClosures, staffAccountRecords: Object.fromEntries(staffAccountRecords),
    adminReviewDecisions, adminReviewAttempts, tellerMutations, tellerReads,
    adminAccessMutations, adminAccessReads,
    customerDeletionAttempts, payHereNotifications,
    tellerUsers: users.map(userDirectoryFor),
    ids: { ...managerTellerIds, ...adminAccessIds }
  });
  if (url.pathname === "/test/seed-account-opening-conflict" && request.method === "POST") {
    const input = await new Response(await body(request)).json().catch(() => null);
    if (input?.username !== "opening-conflict" || typeof input.key !== "string") {
      return json(response, 400, { message: "Invalid account-opening conflict fixture" });
    }
    const user = users.find(({ username }) => username === input.username);
    const seededAccount = {
      accountId: randomUUID(), accountNumber: "1000099999", accountType: "CHECKING", accountStatus: "ACTIVE", balance: "10.0000"
    };
    openedAccounts.set(input.username, [seededAccount]);
    accountOpeningClaims.set(`${input.username}:${input.key.toLowerCase()}`, {
      fingerprint: JSON.stringify(["CHECKING", 21, "10.00"]), account: seededAccount
    });
    accountOpeningCreations.set(input.username, 1);
    return json(response, 201, { account: seededAccount, userFound: Boolean(user) });
  }
  requests.push({
    method: request.method,
    path: url.pathname,
    correlationId: request.headers["x-correlation-id"] ?? null,
    ...(url.pathname === "/api/v1/accounts" && request.method === "POST"
      ? { idempotencyKey: request.headers["idempotency-key"] ?? null }
      : /^\/api\/v1\/accounts\/[\da-f-]{36}$/.test(url.pathname) && request.method === "POST"
        ? { idempotencyKey: request.headers["idempotency-key"] ?? null }
      : {})
  });
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
  if (path === "wallet/payhere/notify" || path === "wallet/payhere/notify/preapprove") {
    if (request.method !== "POST") return json(response, 405, { message: "POST required" }, { Allow: "POST" });
    if (request.headers["content-type"] !== "application/x-www-form-urlencoded") {
      return json(response, 415, { message: "Form content type required" });
    }
    payHereNotifications.push({
      path: url.pathname, contentType: request.headers["content-type"], body: (await body(request)).toString(),
      hasAuthorization: Boolean(request.headers.authorization), hasCookie: Boolean(request.headers.cookie),
      hasCsrf: Boolean(request.headers["x-csrf-token"])
    });
    response.writeHead(200, { "Content-Type": "text/plain" });
    return response.end("mock notification received");
  }
  const user = authenticatedUser(request);
  if ((path === "wallet/payments/w1-intent" && request.method === "GET") || (path === "wallet/payments/qr" && request.method === "POST")) {
    if (!user) return json(response, 401, { code: "AUTH", message: "Missing session" });
    if (user.role !== "CUSTOMER") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Customer role required" });
    return json(response, 200, { intentId: "w1-intent", status: "PROCESSING" });
  }
  const openingCustomer = user?.username.startsWith("opening-");
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
  if (path === "access-control/roles" && request.method === "GET") {
    adminAccessReads.push({ method: request.method, path: url.pathname, username: user.username });
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    return json(response, 200, adminAccessRoles);
  }
  if (path === "access-control/employees" && request.method === "GET") {
    adminAccessReads.push({ method: request.method, path: url.pathname, username: user.username });
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    return json(response, 200, adminAccessEmployees);
  }
  if (path === "access-control/employees/managers" && request.method === "GET") {
    adminAccessReads.push({ method: request.method, path: url.pathname, username: user.username });
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    return json(response, 200, adminAccessEmployees.filter((employee) => employee.roleName === "MANAGER").map((employee) => ({
      employeeId: employee.userId === adminAccessIds.manager ? adminAccessIds.managerEmployee : adminAccessIds.alexEmployee,
      firstName: employee.firstName, lastName: employee.lastName
    })));
  }
  if (path === "access-control/users" && request.method === "GET") {
    adminAccessReads.push({ method: request.method, path: url.pathname, username: user.username });
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    return json(response, 200, users.map(userDirectoryFor));
  }
  const adminAccessUser = /^access-control\/users\/([^/]+)$/.exec(path);
  if (adminAccessUser && request.method === "GET") {
    adminAccessReads.push({ method: request.method, path: url.pathname, username: user.username });
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    const username = decodeURIComponent(adminAccessUser[1]);
    const target = users.find((candidate) => candidate.username === username);
    return target ? json(response, 200, userDirectoryFor(target)) : json(response, 404, { code: "ERR_NOT_FOUND", message: "User not found" });
  }
  const adminRoleUpdate = /^access-control\/roles\/([\da-f-]{36})$/.exec(path);
  if (adminRoleUpdate && request.method === "PUT") {
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    const payload = await new Response(await body(request)).json().catch(() => null);
    adminAccessMutations.push({ actor: user.username, method: request.method, path: url.pathname, body: payload, idempotencyKey: request.headers["idempotency-key"] ?? null });
    const target = users.find((candidate) => profileFor(candidate).userId === adminRoleUpdate[1]);
    if (!target) return json(response, 404, { code: "ERR_NOT_FOUND", message: "User not found" });
    if (!payload || !payload.firstName || !payload.lastName || !payload.email || !payload.phone || !payload.address
      || !payload.roleName || payload.department === undefined || !payload.status || !payload.gender || !payload.dateOfBirth) {
      return json(response, 400, { code: "ERR_VALIDATION", errors: { roleName: "Role profile fields are required" } });
    }
    if (!adminAccessRoles.some((role) => role.roleName === payload.roleName)) {
      return json(response, 404, { code: "ERR_NOT_FOUND", message: "Role not found" });
    }
    if (user.username === "admin-access-validation") return json(response, 400, { code: "ERR_VALIDATION", errors: { phone: "Invalid phone" } });
    const beforeRole = target.role;
    if (payload.roleName === "CUSTOMER") {
      const employee = adminAccessEmployees.find((candidate) => candidate.userId === adminRoleUpdate[1]);
      if (employee) {
        employee.status = "INACTIVE";
        employee.userId = null;
      }
      target.role = "CUSTOMER";
    } else {
      const existing = adminAccessEmployees.find((candidate) => candidate.email === profileFor(target).email);
      if (existing && existing.userId && existing.userId !== adminRoleUpdate[1]) {
        return json(response, 409, { code: "ERR_CONFLICT", message: "Employee email is assigned to another login" });
      }
      const employee = existing ?? {};
      Object.assign(employee, {
        firstName: payload.firstName, lastName: payload.lastName, email: payload.email, roleName: payload.roleName,
        phone: payload.phone, address: payload.address, department: payload.department, status: payload.status,
        gender: payload.gender, dateOfBirth: payload.dateOfBirth, managerId: payload.managerId ?? employee.managerId ?? null,
        hireDate: employee.hireDate ?? new Date().toISOString(), userId: adminRoleUpdate[1]
      });
      if (!existing) adminAccessEmployees.push(employee);
      target.role = payload.roleName;
    }
    if (user.username === "admin-access-timeout" && adminRoleUpdate[1] === adminAccessIds.timeout) {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end(beforeRole === target.role ? "User role and employee status updated successfully" : "User role and employee status updated successfully");
    return;
  }
  if (path === "tellers" && request.method === "GET") {
    tellerReads.push({ method: "GET", path: url.pathname, query: url.searchParams.toString(), username: user.username });
    if (user.role !== "MANAGER") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    return json(response, 200, tellerEmployeesFor(user.username));
  }
  if (path === "tellers/users" && request.method === "GET") {
    if (user.role !== "MANAGER") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    return json(response, 200, users.map(userDirectoryFor));
  }
  const tellerUpdate = /^tellers\/([\da-f-]{36})$/.exec(path);
  if ((path === "tellers" && request.method === "POST") || (tellerUpdate && ["PUT", "DELETE"].includes(request.method))) {
    if (user.role !== "MANAGER") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    const targetId = request.method === "POST" ? url.searchParams.get("userId") : tellerUpdate?.[1];
    if (request.method === "DELETE") {
      tellerMutations.push({ method: request.method, path: url.pathname, query: url.searchParams.toString(), body: null, idempotencyKey: request.headers["idempotency-key"] ?? null });
      const employees = tellerEmployeesFor(user.username);
      const employee = employees.find((entry) => entry.userId === targetId);
      if (!employee) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Employee not found" });
      const targetUser = users.find((entry) => profileFor(entry).userId === targetId);
      if (!targetUser) return json(response, 404, { code: "ERR_NOT_FOUND", message: "User not found" });
      employee.status = "INACTIVE";
      employee.userId = null;
      targetUser.role = "CUSTOMER";
      if (user.username === "manager-teller-delete-timeout") {
        request.socket.destroy();
        return;
      }
      response.writeHead(204);
      return response.end();
    }

    const payload = await new Response(await body(request)).json().catch(() => null);
    tellerMutations.push({ method: request.method, path: url.pathname, query: url.searchParams.toString(), body: payload, idempotencyKey: request.headers["idempotency-key"] ?? null });
    const targetUser = users.find((entry) => profileFor(entry).userId === targetId);
    if (!targetUser) return json(response, 404, { code: "ERR_NOT_FOUND", message: "User not found" });
    if (targetUser.role === "ADMIN") return json(response, 409, { code: "ERR_CONFLICT", message: "Admin cannot be assigned as a teller" });
    if (!payload || !payload.email?.includes("@") || !payload.firstName?.trim() || !payload.lastName?.trim()
      || !payload.phone?.trim() || !payload.address?.trim() || payload.address.length > 255
      || !["MALE", "FEMALE", "OTHER"].includes(payload.gender)
      || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth) || payload.dateOfBirth >= new Date().toISOString().slice(0, 10)) {
      return json(response, 400, { code: "ERR_VALIDATION", errors: { dateOfBirth: "must be a past date" } });
    }
    const employees = tellerEmployeesFor(user.username);
    let employee = employees.find((entry) => entry.userId === targetId)
      ?? employees.find((entry) => entry.email === payload.email);
    if (employee?.userId && employee.userId !== targetId) return json(response, 409, { code: "ERR_CONFLICT", message: "Email address is unavailable" });
    if (employees.some((entry) => entry.email === payload.email && entry !== employee)) return json(response, 409, { code: "ERR_CONFLICT", message: "Email address is unavailable" });
    if (!employee) {
      employee = {
        ...payload, roleName: "TELLER", status: "ACTIVE", hireDate: new Date().toISOString(),
        managerId: null, userId: targetId
      };
      employees.push(employee);
    } else {
      Object.assign(employee, payload, { roleName: "TELLER", status: "ACTIVE", userId: targetId });
    }
    targetUser.role = "TELLER";
    if (user.username === "manager-teller-create-timeout" && request.method === "POST") {
      request.socket.destroy();
      return;
    }
    response.writeHead(request.method === "POST" ? 201 : 200, { "Content-Type": "text/plain" });
    return response.end(request.method === "POST" ? "Teller assigned successfully" : "Teller updated");
  }
  if (path === "users/me" && request.method === "GET") return json(response, 200, profileFor(user));
  if (path === "users/all" && request.method === "GET") {
    if (!["ADMIN", "MANAGER", "TELLER"].includes(user.role)) return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    return json(response, 200, users.filter((candidate) => candidate.role === "CUSTOMER").map(profileFor).filter((profile) =>
      !search || [profile.firstName, profile.lastName, profile.email].some((value) => value?.toLowerCase().includes(search))
    ));
  }
  if (path === "customers/me" && request.method === "GET") {
    if (user.username === "lookup-error") return json(response, 503, { message: "Service unavailable" });
    const existing = customerRecords.get(user.username);
    if (existing) return json(response, 200, existing);
    if (["customer", "accounts-error"].includes(user.username) || (openingCustomer && user.username !== "opening-missing")) {
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
      if (openingCustomer) onboardingCases.set(user.username, caseFor(user.username === "opening-pending" ? "UNDER_REVIEW" : "APPROVED"));
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
    const timedOut = user.username.startsWith("timeout-customer-r");
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
  if (url.pathname.startsWith("/kyc/file/") && request.method === "GET") {
    const requestedId = url.pathname.split("/").at(-1);
    if (!["CUSTOMER", "ADMIN"].includes(user.role)) return json(response, 403, { message: "Access denied" });
    if (requestedId !== documentId && !adminReviewDocumentIds.has(requestedId)) return json(response, 404, { message: "Document not found" });
    if (user.role === "ADMIN" && requestedId !== documentId && !user.username.startsWith("kyc-review-")) return json(response, 404, { message: "Document not found" });
    response.writeHead(200, { "Content-Type": "image/png", "Content-Disposition": 'inline; filename="synthetic.png"' });
    return response.end(kycDocument);
  }
  if (url.pathname === "/admin/kyc" && request.method === "GET") {
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (!adminReviewCases.has(user.username)) {
      const reviewFixtureUser = ["kyc-review-admin", "kyc-review-decisions", "kyc-review-timeout"].includes(user.username);
      const pending = Array.from({ length: user.username === "kyc-review-admin" ? 21 : reviewFixtureUser ? 2 : 0 }, (_, index) => ({
        caseId: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        status: "PENDING", docFrontId: "75000000-0000-4000-8000-000000000001", docBackId: "75000000-0000-4000-8000-000000000002",
        selfieId: "75000000-0000-4000-8000-000000000003", addressId: "75000000-0000-4000-8000-000000000004",
        decisionReason: null, createdAt: "2026-03-01T10:00:00Z", updatedAt: "2026-03-01T10:00:00Z", reviewerId: null, decidedAt: null, reviewerNotes: null
      }));
      if (reviewFixtureUser) pending.push({
        caseId: "70000000-0000-4000-8000-000000000099", status: "UNDER_REVIEW", docFrontId: "75000000-0000-4000-8000-000000000001",
        docBackId: "75000000-0000-4000-8000-000000000002", selfieId: "75000000-0000-4000-8000-000000000003", addressId: "75000000-0000-4000-8000-000000000004",
        decisionReason: null, createdAt: "2026-03-02T10:00:00Z", updatedAt: "2026-03-02T10:00:00Z", reviewerId: null, decidedAt: null, reviewerNotes: null
      });
      if (user.username === "kyc-review-decisions") pending.push({
        caseId: "70000000-0000-4000-8000-000000000098", status: "NEEDS_MORE_INFO", docFrontId: "75000000-0000-4000-8000-000000000001",
        docBackId: "75000000-0000-4000-8000-000000000002", selfieId: "75000000-0000-4000-8000-000000000003", addressId: "75000000-0000-4000-8000-000000000004",
        decisionReason: "Please clarify the address document.", createdAt: "2026-03-02T09:00:00Z", updatedAt: "2026-03-02T09:30:00Z", reviewerId: null, decidedAt: null, reviewerNotes: null
      });
      adminReviewCases.set(user.username, pending);
    }
    const status = url.searchParams.get("status") ?? "PENDING";
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "20");
    const matching = adminReviewCases.get(user.username).filter((item) => item.status === status);
    return json(response, 200, { page, size, total: matching.length, content: matching.slice(page * size, (page + 1) * size) });
  }
  const adminChecksMatch = /^\/admin\/kyc\/([\da-f-]{36})\/checks$/.exec(url.pathname);
  if (adminChecksMatch && request.method === "GET") {
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    const found = (adminReviewCases.get(user.username) ?? []).find((item) => item.caseId === adminChecksMatch[1]);
    return json(response, 200, found ? [{
      id: "76000000-0000-4000-8000-000000000001", caseId: found.caseId, type: "FACE_MATCH", score: 0.91,
      passed: true, detailsJson: "{\"sensitiveFixture\":\"must not render\"}", createdAt: "2026-03-02T10:01:00Z"
    }] : []);
  }
  const adminDecisionMatch = /^\/admin\/kyc\/([\da-f-]{36})\/decision$/.exec(url.pathname);
  if (adminDecisionMatch && request.method === "POST") {
    if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    adminReviewAttempts.push({ username: user.username, caseId: adminDecisionMatch[1] });
    const decision = await new Response(await body(request)).json().catch(() => null);
    const cases = adminReviewCases.get(user.username) ?? [];
    const found = cases.find((item) => item.caseId === adminDecisionMatch[1]);
    if (!found || !["APPROVED", "REJECTED", "NEEDS_MORE_INFO"].includes(decision?.decision)) return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid decision" });
    const allowed = found.status === "PENDING" ? decision.decision === "NEEDS_MORE_INFO"
      : found.status === "AUTO_REVIEW" || found.status === "UNDER_REVIEW" ? true
        : found.status === "NEEDS_MORE_INFO" ? decision.decision === "REJECTED" : false;
    if (!allowed) return json(response, 400, { code: "ERR_VALIDATION", message: "Illegal transition" });
    adminReviewDecisions.push({ username: user.username, caseId: found.caseId, decision: decision.decision, reason: decision.reason ?? null });
    found.status = decision.decision;
    found.decisionReason = decision.reason ?? null;
    found.reviewerNotes = decision.reason ?? null;
    found.reviewerId = "00000000-0000-4000-8000-000000000001";
    found.decidedAt = new Date().toISOString();
    found.updatedAt = found.decidedAt;
    if (user.username === "kyc-review-timeout") {
      request.socket.destroy();
      return;
    }
    return json(response, 200, found);
  }
  if (path === "customers" || path.startsWith("customers/")) {
    if (!["ADMIN", "MANAGER", "TELLER"].includes(user.role)) return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (["directory-expired", "directory-forbidden", "directory-network"].includes(user.username)) {
      if (user.username === "directory-expired") return json(response, 401, { code: "AUTH", message: "Expired" }, { "X-Bank-Auth-Expired": "1" });
      if (user.username === "directory-forbidden") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
      request.socket.destroy();
      return;
    }
    if (path === "customers" && request.method === "GET") return json(response, 200, [...customerDirectoryRecords.values()]);
    if (path === "customers" && request.method === "POST") {
      const payload = await new Response(await body(request)).json().catch(() => null);
      const linkedUser = users.find((candidate) => profileFor(candidate).userId === payload?.userId);
      if (!linkedUser || linkedUser.role !== "CUSTOMER") return json(response, 404, { code: "ERR_NOT_FOUND", message: "User not found" });
      if ([...customerDirectoryRecords.values()].some((record) => record.userId === payload.userId)) return json(response, 409, { code: "ERR_CONFLICT", message: "Customer already exists" });
      if (linkedUser.username === "directory-missing") return json(response, 404, { code: "ERR_NOT_FOUND", message: "User not found" });
      if (linkedUser.username === "directory-conflict") return json(response, 409, { code: "ERR_CONFLICT", message: "Customer already exists" });
      if (linkedUser.username === "directory-invalid") return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid customer details", errors: { dateOfBirth: "must be a valid date" } });
      if (!payload.firstName?.trim() || !payload.lastName?.trim() || !payload.email?.includes("@") || !payload.phone?.trim()
        || !["MALE", "FEMALE", "OTHER"].includes(payload.gender) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth)
        || !["ACTIVE", "INACTIVE", "PENDING", "RESIGNED"].includes(payload.status)) {
        return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid customer details" });
      }
      const saved = { ...payload, customerId: randomUUID(), username: linkedUser.username, createdAt: new Date().toISOString() };
      customerDirectoryRecords.set(`created-${payload.userId}`, saved);
      return json(response, 201, saved);
    }
    if (path === "customers" && request.method === "PUT") {
      const payload = await new Response(await body(request)).json().catch(() => null);
      const entry = [...customerDirectoryRecords.entries()].find(([, record]) => record.userId === payload?.userId);
      if (!entry) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Customer not found" });
      const [key, current] = entry;
      const saved = { ...current, ...payload, customerId: current.customerId, username: current.username };
      customerDirectoryRecords.set(key, saved);
      return json(response, 200, saved);
    }
    const detailMatch = /^customers\/([\da-f-]{36})$/.exec(path);
    if (detailMatch && request.method === "GET") {
      const record = [...customerDirectoryRecords.values()].find((candidate) => candidate.customerId === detailMatch[1]);
      return record ? json(response, 200, record) : json(response, 404, { code: "ERR_NOT_FOUND", message: "Customer not found" });
    }
    if (detailMatch && request.method === "DELETE") {
      if (user.role !== "ADMIN") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Admin role required" });
      customerDeletionAttempts.push({ actor: user.username, customerId: detailMatch[1] });
      const entry = [...customerDirectoryRecords.entries()].find(([, record]) => record.customerId === detailMatch[1]);
      if (!entry) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Customer not found" });
      if (user.username === "admin-customer-delete-conflict") {
        return json(response, 409, { code: "ERR_CONFLICT", message: "Customer has dependent records and cannot be deleted" });
      }
      if (user.username === "admin-customer-delete-timeout-persisted") {
        customerDirectoryRecords.delete(entry[0]);
        request.socket.destroy();
        return;
      }
      if (user.username === "admin-customer-delete-timeout-present") {
        // Leave the upstream response open until the Next.js deadline expires.
        return;
      }
      customerDirectoryRecords.delete(entry[0]);
      response.writeHead(204);
      return response.end();
    }
  }
  if (path === "branches" && request.method === "GET") {
    if (user.username === "opening-branches-unavailable") return json(response, 503, { message: "Branches unavailable" });
    return json(response, 200, branches);
  }
  const tellerOpeningMatch = /^accounts\/([\da-f-]{36})$/.exec(path);
  if (tellerOpeningMatch && request.method === "POST") {
    if (user.role !== "TELLER") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "teller-opening-expired") return json(response, 401, { code: "AUTH", message: "Expired" }, { "X-Bank-Auth-Expired": "1" });
    if (user.username === "teller-opening-forbidden") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    const payload = await new Response(await body(request)).json().catch(() => null);
    const userId = tellerOpeningMatch[1];
    tellerOpeningRequests.push({
      userId, accountType: payload?.accountType ?? null, initialDeposit: payload?.initialDeposit ?? null,
      branchId: payload?.branchId ?? null, idempotencyKey: request.headers["idempotency-key"] ?? null
    });
    const customer = [...customerDirectoryRecords.values()].find((record) => record.userId === userId);
    if (!customer) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Customer not found" });
    if (user.username === "teller-opening-validation") return json(response, 422, { code: "ERR_MIN_DEPOSIT", message: "Minimum initial deposit for SAVINGS is 1000.00" });
    const minimums = { SAVINGS: 1000n, CHECKING: 0n, FIXED_DEPOSIT: 5000n };
    if (!payload || !Object.hasOwn(minimums, payload.accountType) || typeof payload.initialDeposit !== "string"
      || !/^\d+(?:\.\d+)?$/.test(payload.initialDeposit)) {
      return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid account request" });
    }
    if (!Number.isInteger(payload.branchId) || !branches.some((branch) => branch.branchId === payload.branchId)) {
      return json(response, 404, { code: "ERR_NOT_FOUND", message: "Branch not found" });
    }
    const [whole, fraction = ""] = payload.initialDeposit.split(".");
    if (BigInt(whole) < minimums[payload.accountType]) return json(response, 422, { code: "ERR_MIN_DEPOSIT", message: `Minimum initial deposit for ${payload.accountType}` });
    if (!/^0+(?:\.0+)?$/.test(payload.initialDeposit) && fraction.length > 2) {
      return json(response, 422, { code: "ERR_DEPOSIT_INVALID", message: "Initial deposit supports at most two fractional digits" });
    }
    const zero = /^0+(?:\.0+)?$/.test(payload.initialDeposit);
    const account = {
      accountId: randomUUID(), accountNumber: String(8000000000 + tellerOpenedAccounts.size + 1),
      accountType: payload.accountType, accountStatus: "ACTIVE",
      balance: zero ? "0.0000" : `${BigInt(whole)}.${fraction.padEnd(4, "0")}`
    };
    tellerOpenedAccounts.set(account.accountId, { account, customer, initialDeposit: payload.initialDeposit });
    if (user.username === "teller-opening-timeout") {
      request.socket.destroy();
      return;
    }
    return json(response, 201, account);
  }
  if (path === "accounts" && request.method === "GET") {
    if (!["ADMIN", "MANAGER", "TELLER"].includes(user.role)) return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "account-directory-expired") return json(response, 401, { code: "AUTH", message: "Expired" }, { "X-Bank-Auth-Expired": "1" });
    if (user.username === "account-directory-forbidden") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "account-directory-network") {
      request.socket.destroy();
      return;
    }
    return json(response, 200, [...staffAccountRecords.values()]);
  }
  const staffAccountPath = /^accounts\/([\da-f-]{36})(\/transactions)?$/.exec(path);
  const staffAccountId = staffAccountPath?.[1];
  if (staffAccountId && request.method === "GET" && staffAccountRecords.has(staffAccountId)) {
    if (!["ADMIN", "MANAGER", "TELLER"].includes(user.role)) return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    return staffAccountPath[2]
      ? json(response, 200, staffAccountHistories.get(staffAccountId) ?? [])
      : json(response, 200, staffAccountRecords.get(staffAccountId));
  }
  if (staffAccountId && !staffAccountPath[2] && request.method === "PUT") {
    if (!["ADMIN", "MANAGER", "TELLER"].includes(user.role)) return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "account-update-forbidden") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "account-update-conflict") return json(response, 409, { code: "ERR_CONFLICT", message: "Account changed" });
    if (user.username === "account-update-validation") return json(response, 422, { code: "ERR_VALIDATION", message: "Invalid account update", errors: { branchId: "Unknown branch" } });
    const payload = await new Response(await body(request)).json().catch(() => null);
    const current = staffAccountRecords.get(staffAccountId);
    if (!current) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Account not found" });
    const accountTypes = ["SAVINGS", "CHECKING", "FIXED_DEPOSIT"];
    const validAmount = typeof payload?.initialDeposit === "string" && /^\d+(?:\.\d+)?$/.test(payload.initialDeposit);
    if (!payload || !accountTypes.includes(payload.accountType) || !validAmount || !Number.isInteger(payload.branchId)
      || !branches.some((branch) => branch.branchId === payload.branchId)) {
      return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid account update" });
    }
    staffAccountUpdates.push({ accountId: staffAccountId, accountType: payload.accountType, initialDeposit: payload.initialDeposit, branchId: payload.branchId, idempotencyKey: request.headers["idempotency-key"] ?? null });
    const updated = { ...current, accountType: payload.accountType, updatedAt: "2026-02-01T00:00:00" };
    staffAccountRecords.set(staffAccountId, updated);
    if (user.username === "account-update-timeout") {
      request.socket.destroy();
      return;
    }
    return json(response, 200, updated);
  }
  if (staffAccountId && !staffAccountPath[2] && request.method === "DELETE") {
    if (!["ADMIN", "MANAGER", "TELLER"].includes(user.role)) return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "account-close-forbidden") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "account-close-conflict") return json(response, 409, { code: "ERR_CONFLICT", message: "Account changed" });
    const current = staffAccountRecords.get(staffAccountId);
    if (!current) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Account not found" });
    staffAccountClosures.push({ accountId: staffAccountId, balanceBefore: current.balance });
    staffAccountRecords.set(staffAccountId, { ...current, accountStatus: "CLOSED", updatedAt: "2026-02-02T00:00:00" });
    if (user.username === "account-close-timeout") {
      request.socket.destroy();
      return;
    }
    response.writeHead(204);
    return response.end();
  }
  if (path === "accounts" && request.method === "POST") {
    if (user.role !== "CUSTOMER" || user.username === "opening-auth") return json(response, 403, { code: "ERR_FORBIDDEN", message: "Access denied" });
    if (user.username === "opening-expired") return json(response, 401, { code: "AUTH", message: "Expired" });
    if (["opening-record-gone", "opening-missing"].includes(user.username)) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Customer not found" });
    const payload = await new Response(await body(request)).json().catch(() => null);
    const idempotencyKey = request.headers["idempotency-key"];
    if (user.username === "opening-invalid-key") {
      return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid idempotency key" });
    }
    if (user.username === "opening-kyc-rejected") {
      return json(response, 422, { code: "ERR_KYC_NOT_APPROVED", message: "KYC must be APPROVED before self-service account opening" });
    }
    if (!payload || !Object.hasOwn(openingMinimum, payload.accountType) || typeof payload.initialDeposit !== "string"
      || !/^\d+(\.\d+)?$/.test(payload.initialDeposit)
      || typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
      return json(response, 400, { code: "ERR_VALIDATION", message: "Invalid account request" });
    }
    const claimId = `${user.username}:${idempotencyKey.toLowerCase()}`;
    const fingerprint = JSON.stringify([payload.accountType, payload.branchId, payload.initialDeposit]);
    const previousClaim = accountOpeningClaims.get(claimId);
    if (previousClaim) {
      if (previousClaim.fingerprint !== fingerprint) {
        return json(response, 409, { code: "ERR_IDEMPOTENCY_CONFLICT", message: "Idempotency key was used with a different account-opening request" });
      }
      return json(response, 201, previousClaim.account);
    }
    if (user.username === "opening-network-validation" && (accountOpeningAttempts.get(user.username) ?? 0) === 1) {
      return json(response, 422, { code: "ERR_MIN_DEPOSIT", message: "Opening deposit below minimum" });
    }
    if (!branches.some(({ branchId }) => branchId === payload.branchId)
      || (user.username === "opening-branch" && payload.branchId === branches[1].branchId)) {
      return json(response, 404, { code: "ERR_NOT_FOUND", message: "Branch not found" });
    }
    const [whole, fraction = ""] = payload.initialDeposit.split(".");
    if (BigInt(whole) < openingMinimum[payload.accountType]) return json(response, 422, { code: "ERR_MIN_DEPOSIT", message: "Opening deposit below minimum" });
    const zero = /^0+(\.0+)?$/.test(payload.initialDeposit);
    if (!zero && fraction.length > 2) return json(response, 422, { code: "ERR_DEPOSIT_INVALID", message: "Too many fractional digits" });
    if (user.username === "opening-vault") return json(response, 422, { code: "ERR_VAULT_ACCOUNT_NOT_FOUND", message: "Missing internal ledger fixture" });
    const attempts = (accountOpeningAttempts.get(user.username) ?? 0) + 1;
    accountOpeningAttempts.set(user.username, attempts);
    if (["opening-network", "opening-network-validation"].includes(user.username) && attempts === 1) {
      request.socket.destroy();
      return;
    }
    const previous = openedAccounts.get(user.username) ?? [];
    const saved = {
      accountId: randomUUID(), accountNumber: String(1000000000 + users.indexOf(user) * 10 + previous.length),
      accountType: payload.accountType, accountStatus: "ACTIVE", balance: zero ? "0.0000" : `${BigInt(whole)}.${fraction.padEnd(4, "0")}`
    };
    openedAccounts.set(user.username, [...previous, saved]);
    accountOpeningClaims.set(claimId, { fingerprint, account: saved });
    accountOpeningCreations.set(user.username, (accountOpeningCreations.get(user.username) ?? 0) + 1);
    if (user.username === "opening-timeout") {
      setTimeout(() => {
        if (!response.destroyed) json(response, 201, saved);
      }, 4_000).unref();
      return;
    }
    return json(response, 201, saved);
  }
  if (path === "accounts/my" && request.method === "GET") {
    if (user.username === "accounts-error") return json(response, 503, { message: "Accounts service unavailable" });
    if (openingCustomer) return json(response, 200, openedAccounts.get(user.username) ?? []);
    return json(response, 200, user.username === "new-customer" ? [] : [account]);
  }
  if (path === "accounts/account-1" && request.method === "GET") return json(response, 200, account);
  if (path === "accounts/account-1/transactions" && request.method === "GET") return json(response, 200, []);
  const accountRead = /^accounts\/([\da-f-]{36})(\/transactions)?$/.exec(path);
  if (accountRead && request.method === "GET") {
    const tellerOpening = tellerOpenedAccounts.get(accountRead[1]);
    if (tellerOpening) {
      if (!accountRead[2]) return json(response, 200, tellerOpening.account);
      const openingDeposit = { transactionId: "50000000-0000-4000-8000-000000000011", accountId: tellerOpening.account.accountId, type: "DEPOSIT", amount: tellerOpening.initialDeposit, balanceAfter: tellerOpening.account.balance, description: "Opening deposit", createdAt: "2026-01-08T09:10:11" };
      return json(response, 200, /^0+(?:\.0+)?$/.test(tellerOpening.initialDeposit) ? [] : [openingDeposit]);
    }
    const saved = openedAccounts.get(user.username)?.find(({ accountId }) => accountId === accountRead[1]);
    if (!saved) return json(response, 404, { code: "ERR_NOT_FOUND", message: "Account not found" });
    if (!accountRead[2]) return json(response, 200, saved);
    const openingDeposit = { transactionId: "50000000-0000-4000-8000-000000000012", accountId: saved.accountId, type: "DEPOSIT", amount: saved.balance, balanceAfter: saved.balance, description: "Opening deposit", createdAt: "2026-01-08T09:10:11" };
    return json(response, 200, saved.balance === "0.0000" ? [] : [openingDeposit]);
  }
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

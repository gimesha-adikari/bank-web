# bank-web

The standalone Next.js web application for the Banking Platform, using
`bank-core` as its authoritative Spring backend.

## Runtime contract

The browser calls same-origin Next.js BFF routes. The server contains the bank-core JWT in an HttpOnly session cookie, translates it to an upstream Bearer header, and never returns the JWT to browser JavaScript. bank-core remains the authority for credential verification, Sessions, roles, ownership, balances, transactions, reversals, and idempotency.

Production cookies are `__Host-bank-web-auth` and `__Host-bank-web-csrf`; local development uses `bank-web-auth-dev` and `bank-web-csrf-dev`. They are host-only, HttpOnly, SameSite=Strict, Path=/, and session-only; production requires HTTPS and Secure cookies. Unsafe browser requests require the in-memory CSRF echo. Authenticated 401 ends the web browser Session and requires sign-in again. There is no reactive GET refresh and the browser refresh-token route is blocked. Active XSS can still act as the current user while it executes.

The password-reset page reads the token from the emailed link. It submits the token and new password through the CSRF-protected, URL-encoded POST body. Core checks expiry and prior use when it processes the POST.

Registration requires email verification before sign-in. Users can resend a verification email from the registration confirmation, sign-in page, or an unsuccessful registration verification result. The resend request uses an email-only JSON body and the normal CSRF check.

Core builds registration links from `APP_FRONTEND_URL` plus `/api/v1/auth/verify-email?token=…` and email-change links from `APP_BASE_URL` plus `/api/v1/users/me/email/verify?token=…`. Serve these exact public paths through bank-web to display its result page. If `APP_BASE_URL` points at the public core origin, route just the email-change verification path at that ingress to bank-web while keeping `BANKING_API_BASE_URL` pointed at bank-core directly. This keeps the emailed origin and avoids sending the BFF back through itself. Direct requests to Spring still receive Spring's API response.

Browser navigation to either verification path is handled server-side and redirected to `/verification-result` with only the flow and outcome. The verification response uses `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. HEAD and marked preview or prefetch requests skip verification. An email scanner that sends an ordinary GET can still consume a one-time link under the existing backend contract.

Use `npm run dev` for verification testing. It suppresses Next.js 16.3.8 development trace spans, which otherwise record full request URLs even with request logging filtered. Redact query strings for these paths in deployment access logs, tracing, and email link tracking because the initial request and the upstream core request carry the token.

After sign-in, bank-web resumes a recognized page only if the user's role can access it. The staff workspace and its account history allow Admin, Manager, and Teller. Staff account opening is Teller-only. Employee and Banned roles land on the public access-denied page. These checks guide browser navigation. Bank-core authorizes every banking request.

Financial amounts remain decimal strings and deposit, withdrawal, and transfer requests use one client-generated `Idempotency-Key` per logical operation. Reversal sends `{ reason }` and no idempotency header. Android remains a direct Bearer client of bank-core.

The money forms accept positive decimal text with up to two fractional digits. If the result of a submission is uncertain, the open form keeps the original request and key for a manual retry. Check account history before starting a different transaction or leaving the form. After a confirmed receipt, bank-web fetches balances and account-scoped history from core.

### KYC transport

The browser uses `/api/kyc` for upload, protected files, submission, and case reads, and `/api/admin/kyc` for review. The BFF maps these specific operations to bank-core's unversioned `/kyc` and `/admin/kyc` paths, preserving any deployment prefix before `/api/v1` in `BANKING_API_BASE_URL`. Core enforces case ownership and Admin access. Protected file responses are non-cacheable.

Uploads carry multipart `file` and `type` fields. Core accepts JPEG, PNG, and WebP for `DOC_FRONT`, `DOC_BACK`, `SELFIE`, and `ADDRESS_PROOF`. The BFF preserves the browser's boundary and bytes and caps the total KYC request body at 11 MiB. The checked-in bank-core configuration uses Spring Boot 3.4.8 defaults of **1 MiB per file and 10 MiB per multipart request**. These limits apply before the controller's 10 MiB file check. Confirm deployment overrides and ingress limits before offering larger uploads.

The KYC BFF uses `BANKING_API_TIMEOUT_MS` (15 seconds by default) for reading the request body and contacting core. The browser client also defaults to 15 seconds, and upload and submit accept a `timeoutMs` override. Core can persist a case before its synchronous ML review finishes, and its default ML read timeout is 180 seconds. After an uncertain submit, check `kycApi.me()` before retrying. The typed client supports an optional `X-Idempotency-Key` on submit and returns `null` when the self-case endpoint returns 404.

### Customer onboarding

The customer dashboard redirects to `/customer/onboarding` when bank-core explicitly reports a missing customer record. Account lookup failures and empty account lists are handled independently. The onboarding page reads case status and checks from bank-core and enables customer details only after `APPROVED`. The self-service PUT includes the UUID from `/api/v1/users/me` and the required customer DTO fields. New records use `ACTIVE`, and updates preserve the status returned by bank-core. The server still derives the owner from the authenticated session.

Upload one JPEG, PNG, or WebP image per document type, with a limit of 1 MiB each. The page keeps the draft and its submission key in memory while it is open. If the submission result is uncertain, the page checks for a case before allowing a deliberate retry with the same request and key. Bank-core currently saves the case and its idempotency record separately. Opening a new page loses the in-memory retry details. Use Refresh status to check the latest case before preparing another request.

`NEEDS_MORE_INFO` currently returns the active case from the submit endpoint without replacing documents. The page explains that restriction. A rejected case can start a new verification. Live review depends on bank-core, configured file storage, and either the ML service or a bank reviewer.

### Customer account opening

The web form requires an existing customer record and approved KYC. Bank-core's customer endpoint requires the CUSTOMER role and checks the customer record, branch, account type, and deposit. The three opening minimums are 1,000.00 LKR for savings, 0.00 LKR for checking, and 5,000.00 LKR for fixed deposit. The form submits decimal text and the selected integer branch ID. Bank-core posts funded openings through its configured LKR system vault.

The account-opening endpoint has no client idempotency key. After an uncertain result the page reloads the account list and offers read-only refreshes. An empty list can precede completion of the original request. Check the bank-core account list before initiating another opening. Confirmed openings show the server's opening balance and refresh the account by ID.

### Admin customer deletion

Admins can delete a customer record from its staff detail page by typing the exact customer UUID. The page fetches the record from bank-core before submitting DELETE. If the record has changed, review the refreshed record and confirm again. The read and the DELETE are separate requests. Bank-core keeps the linked login and KYC records and enforces dependency constraints during deletion. Any account, including a closed account with zero balance, or other protected dependent record blocks deletion.

If the DELETE outcome is uncertain, the page reads the customer record once. An authoritative missing-record response returns the Admin to the directory. If the record is still present or the read fails, the detail page shows the uncertainty and disables deletion for that visit. A present record can precede completion of the original request. Check the current record before starting a new operation. The web app sends no automatic DELETE retry.

## Development

The [PayHere routing inventory](docs/payhere-routing.md) records which requests use the bank-core origin, which wallet APIs use the BFF, and the backend checks required before enabling wallet features.

Copy `.env.example` to `.env.local` and set the server-only backend URL:

```text
BANKING_API_BASE_URL=http://127.0.0.1:8080
BANKING_API_TIMEOUT_MS=15000
```

`BANKING_API_BASE_URL` must never be prefixed with `NEXT_PUBLIC_`.

```bash
npm ci
npm run dev
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The Playwright suite runs the Next.js BFF against a test-only local bank-core mock. It does not seed browser auth storage or intercept the core `/api/v1/*` flows. A separate optional contract smoke can run against a controlled local bank-core environment.

## Related repositories

- [bank-core](https://github.com/gimesha-adikari/bank-core) — Spring Boot banking authority
- [bank-service](https://github.com/gimesha-adikari/bank-service) — FastAPI AI/KYC service used by the backend
- [bank-app](https://github.com/gimesha-adikari/bank-app) — Android client

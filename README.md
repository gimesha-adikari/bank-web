# bank-web

The standalone Next.js web application for the Banking Platform, using
`bank-core` as its authoritative Spring backend.

## Runtime contract

The browser calls same-origin Next.js BFF routes. The server contains the bank-core JWT in an HttpOnly session cookie, translates it to an upstream Bearer header, and never returns the JWT to browser JavaScript. bank-core remains the authority for credential verification, Sessions, roles, ownership, balances, transactions, reversals, and idempotency.

Production cookies are `__Host-bank-web-auth` and `__Host-bank-web-csrf`; local development uses `bank-web-auth-dev` and `bank-web-csrf-dev`. They are host-only, HttpOnly, SameSite=Strict, Path=/, and session-only; production requires HTTPS and Secure cookies. Unsafe browser requests require the in-memory CSRF echo. Authenticated 401 ends the web browser Session and requires sign-in again. There is no reactive GET refresh and the browser refresh-token route is blocked. Active XSS can still act as the current user while it executes.

Financial amounts remain decimal strings and deposit, withdrawal, and transfer requests use one client-generated `Idempotency-Key` per logical operation. Reversal sends `{ reason }` and no idempotency header. Android remains a direct Bearer client of bank-core.

## Development

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

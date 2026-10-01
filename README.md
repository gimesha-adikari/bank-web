# bank-web

The standalone Next.js web application for the Banking Platform, using
`bank-core` as its authoritative Spring backend.

## Runtime contract

The browser calls the thin same-origin `/api/v1/*` transport route. The route forwards requests to `BANKING_API_BASE_URL`; it does not implement authentication, account ownership, balance, transaction, reversal, or idempotency rules. bank-core remains the authority for those decisions.

The approved compatibility model stores the JWT in browser `localStorage` and sends it as `Authorization: Bearer ...`. This rebuild intentionally does not migrate authentication to cookies. Financial amounts remain decimal strings and deposit, withdrawal, and transfer requests use one client-generated `Idempotency-Key` per logical operation. Reversal sends `{ reason }` and no idempotency header.

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

The Playwright suite mocks `/api/v1/*` for deterministic UI checks. A separate optional contract smoke can run against a controlled local bank-core environment.

## Related repositories

- [bank-core](https://github.com/gimesha-adikari/bank-core) — Spring Boot banking authority
- [bank-service](https://github.com/gimesha-adikari/bank-service) — FastAPI AI/KYC service used by the backend
- [bank-app](https://github.com/gimesha-adikari/bank-app) — Android client

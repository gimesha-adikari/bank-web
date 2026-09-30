# bank-web

React and Vite web client for the BankingSystem core banking API.

## Requirements

- Node.js with npm
- A reachable BankingSystem HTTP API for authenticated application flows

The client reads its API origin from `VITE_API_BASE_URL`. Copy `.env.example` to
`.env` when a local override is needed. The browser client communicates with the
backend over HTTP; it does not require the backend repository to be present as a
filesystem sibling.

## Local development

```bash
npm ci
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

There is no separate test script in the current package manifest.

## Related repositories

- [BankingSystem](https://github.com/gimesha-adikari/BankingSystem) — Spring Boot core banking API
- [banking-service](https://github.com/gimesha-adikari/banking-service) — FastAPI AI/KYC service
- [BankApp](https://github.com/gimesha-adikari/BankApp) — Android client

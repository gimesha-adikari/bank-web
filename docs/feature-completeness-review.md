# Banking Platform — Feature Completeness Review

> **Canonical record:** This is the single review document for Parts 00–16. Update only this file on the dedicated documentation branch. This record is an implementation-completeness inventory, **not** a defect investigation or a product readiness certification.

## 1. Project overview and review purpose

Identify **every actual feature** across the Banking Platform's web, Spring Boot, FastAPI and Android repositories, and record which complete user journeys can be supported by the implementation. Review frontend-to-backend-to-persistence-to-integration paths, where applicable. Work incrementally, one part per separate ChatGPT conversation, preserving all previous findings in this document.

The area names in this plan are **review boundaries, not findings that any feature exists**.

## 2. Explicit non-goals

- No bug finding, debugging, application development, refactoring, fixes, test creation or broad test runs.
- No commits to application source, no pushes of unrelated changes, no changes to bank-core, bank-service or bank-app, no merges.
- No false inference of functional coverage from filenames, UI routes, endpoints, README prose, or mock-only tests.
- No invented percentages, unverified features or invented live-stack outcomes.
- Do not delegate the review to Codex or ask the user to perform local command-line work.

## 3. GitHub repository inventory, branches and inspected SHAs

Verified via connected GitHub on **2026-11-23**. Only repository-level directory structure was inspected during Part 00; detailed implementation reviews remain pending.

| Repository | Responsibility / scope | GitHub URL | Default branch at Part 00 | Verified default-branch HEAD |
|---|---|---|---|---|
| bank-web | Next.js web frontend and Backend-for-Frontend | https://github.com/gimesha-adikari/bank-web | main | [012fbc6ff2687d126c67c85ce54cfc8d16f79f27](https://github.com/gimesha-adikari/bank-web/commit/012fbc6ff2687d126c67c85ce54cfc8d16f79f27) |
| bank-core | Spring Boot services, domain logic, MySQL and banking ledger | https://github.com/gimesha-adikari/bank-core | main | [9f58e595a653db9d8aa59b70a35af8e2b0e725d3](https://github.com/gimesha-adikari/bank-core/commit/9f58e595a653db9d8aa59b70a35af8e2b0e725d3) |
| bank-service | FastAPI KYC/ML service | https://github.com/gimesha-adikari/bank-service | main | [cabdd323b4aa394910cb192ead6d233e9a12d9d3](https://github.com/gimesha-adikari/bank-service/commit/cabdd323b4aa394910cb192ead6d233e9a12d9d3) |
| bank-app | Android banking application | https://github.com/gimesha-adikari/bank-app | main | [9d98ba24cb754b8295bd58770cd502438d3b7b38](https://github.com/gimesha-adikari/bank-app/commit/9d98ba24cb754b8295bd58770cd502438d3b7b38) |

At Part 00, branch search identified `main` for each repository; the dedicated `docs/feature-completeness-review` branch did not exist in bank-web before it was created. The branch was created from the verified bank-web main commit `012fbc6ff2687d126c67c85ce54cfc8d16f79f27`. Documentation commits on that branch do **not** change the application source snapshot on `main`.

**Repository-level structure observed:**
- **bank-web:** `app`, `components`, `lib`, `docs`, `e2e`, `tests`, `public`, `package.json`, `next.config.ts`.
- **bank-core:** `src`, `docs`, `scripts`, `build.gradle`, `settings.gradle`.
- **bank-service:** `app`, `models`, `scripts`, `tests`, `requirements.txt`, `environment.yml`.
- **bank-app:** `app`, `gradle`, `build.gradle.kts`, `settings.gradle.kts`.

This high-level directory inventory is evidence of structure only, not feature completeness.

## 4. GitHub source-freshness status

Three prior local verification commit prefixes were provided. GitHub contains each matching full commit, and **each is exactly the default `main` HEAD as of Part 00**:

| Repository | Previously reported local commit | GitHub `main` head | Outcome |
|---|---|---|---|
| bank-web | `012fbc6` | `012fbc6ff2687d126c67c85ce54cfc8d16f79f27` | **Exact match** |
| bank-core | `9f58e59` | `9f58e595a653db9d8aa59b70a35af8e2b0e725d3` | **Exact match** |
| bank-service | `cabdd32` | `cabdd323b4aa394910cb192ead6d233e9a12d9d3` | **Exact match** |

For bank-app, no prior local commit baseline was supplied; GitHub main was observed at `9d98ba24cb754b8295bd58770cd502438d3b7b38`.

**Boundary:** This establishes parity only with the **three named commit IDs**, not with any subsequently uncommitted/unpushed local changes. Future parts must check source freshness again if a changed baseline is reported. Do not attribute missing GitHub code to the user's current local implementation without evidence.

## 5. Mandatory review methodology

Review each actual feature from user intent to visible result. Apply, where relevant:

1. **User and role:** identify who performs the workflow and why.
2. **Complete user journey:** trace entry, decisions, action, result, rejection, and recovery.
3. **Frontend / Android:** identify actual routes, screens, components, forms and actions.
4. **Transport:** trace browser/mobile API clients, Next.js BFF routes, requests and responses.
5. **Backend:** trace Spring controllers, services, validations and security rules.
6. **Persistence:** trace entities, tables, migrations, journal/ledger entries and writes.
7. **Integrations:** trace FastAPI KYC/ML, messaging and third-party services where present.
8. **Outcomes:** trace loading, success, failure, rejected and recovery states visible to users.
9. **Evidence:** distinguish source code, automated tests, and actual integrated-stack verification.
10. **Scope and gaps:** document what is supported, incomplete, missing, disabled or deferred.

Use exact repository paths, commit-pinned GitHub source links, contracts and evidence references. Link steps through the stack rather than producing unrelated inventories of pages and endpoints. Separate implemented workflow from possible future work. If a layer is not applicable, say so explicitly.

For each future part: inspect relevant code across all four repos where the workflow touches them; record individual feature entries; update the master inventory and dependencies; note evidence and freshness limitations; and modify only this canonical Markdown file. Stop after the assigned part.

## 6. Completeness levels, independent statuses and evidence confidence

**Completeness level (defined workflow and reviewed scope, not a blanket product score):**

| Level | Classification | Decision rule |
|---|---|---|
| 0 | **Not implemented** | No functional implementation found in the reviewed scope. |
| 1 | **Stub / placeholder** | Only a route, endpoint, screen or contract without a usable feature. |
| 2 | **One-sided** | Implemented on only one side (frontend or backend), not connected end-to-end. |
| 3 | **Partially functional** | Important workflow steps work but the intended workflow remains incomplete. |
| 4 | **Functionally implemented** | Defined workflow is implemented end-to-end with supporting verification, but relevant live real-stack acceptance may be absent. |
| 5 | **Verified end-to-end** | Defined workflow is evidenced on the actual integrated stack. This is not equivalent to production-readiness. |

**Independent statuses:** Intentionally disabled; Deferred; Blocked by dependency; Not applicable; Not reviewed; Insufficient evidence. A status is **not** a substitute for a numerical level when evidence supports one.

**Evidence confidence classifications (separate from completeness):**
- **Live real-stack verified:** relevant observation from the actual integrated stack, with traceable report/evidence.
- **Automated-test verified:** appropriate tests exercise the supported behavior; identify test types and mocked boundaries.
- **Source-confirmed:** implementation is directly traceable in code, without claiming it has run in the real stack.
- **Documentation-only evidence:** described in documents or reports, not independently source-verified.
- **Unverified / unknown:** no reliable confirming evidence found.

Do not award Level 5 from code or mocked tests alone. A Level 5 result has a **specific tested workflow scope** and does not certify production readiness. Do not invent completion percentages.

## 7. Master feature inventory

At Part 00 this table was deliberately **unscored**. Part 01 now contains source-inspected authentication features; future parts add their own actual discoveries, not assumed endpoints.

| Feature ID | Feature | Review part | Roles | Workflow scope | Completeness | Independent status | Evidence confidence | Detailed record |
|---|---|---|---|---|---|---|---|---|
| [AUTH-001](#auth-001--public-loginidentity-registration-and-username-availability) | Public login-identity registration and username availability | 01 | Unauthenticated prospective CUSTOMER (web and Android) | Create a login identity, not yet a KYC case, customer record or bank account | **L4** | None | Source-confirmed | [Part 01 record](#auth-001--public-loginidentity-registration-and-username-availability) |
| [AUTH-002](#auth-002--registration-email-confirmation-and-resend) | Registration email confirmation and resend | 01 | Unauthenticated newly registered user | Activate email-verified identity so credentials become eligible for login | **L4** | None | Source-confirmed | [Part 01 record](#auth-002--registration-email-confirmation-and-resend) |
| [AUTH-003](#auth-003--credentials-login-and-eligibility-enforcement) | Credentials login and eligibility enforcement | 01 | CUSTOMER, TELLER, MANAGER, ADMIN | Sign in and obtain role-scoped authorization identity | **L4** | None | Source-confirmed | [Part 01 record](#auth-003--credentials-login-and-eligibility-enforcement) |
| [AUTH-004](#auth-004--browser-cookiebacked-session-bootstrap-protected-transport-and-csrf) | Browser cookie-backed session bootstrap, protected transport and CSRF | 01 | Authenticated web users across roles | Restore secure browser state and send authorized requests without exposing bearer token to client JS | **L4** | None | Source-confirmed | [Part 01 record](#auth-004--browser-cookiebacked-session-bootstrap-protected-transport-and-csrf) |
| [AUTH-005](#auth-005--logout-and-serversession-termination) | Logout and server-session termination | 01 | Authenticated browser and Android users | End a login session and prevent bearer reuse | **L4** | None | Source-confirmed | [Part 01 record](#auth-005--logout-and-serversession-termination) |
| [AUTH-006](#auth-006--forgottenpassword-email-recovery-and-reset) | Forgotten-password email recovery and reset | 01 | Unauthenticated user with previously registered email (web | Recover access after forgetting credentials | **L4** | None | Source-confirmed | [Part 01 record](#auth-006--forgottenpassword-email-recovery-and-reset) |
| [AUTH-007](#auth-007--authenticated-password-change-and-forced-reauthentication) | Authenticated password change and forced reauthentication | 01 | Authenticated users, web profile and Android profile | Change a known password and terminate existing sessions | **L3** | None | Source-confirmed | [Part 01 record](#auth-007--authenticated-password-change-and-forced-reauthentication) |
| [AUTH-008](#auth-008--rolebased-access-and-authorizationstate-revocation) | Role-based access and authorization-state revocation | 01 | CUSTOMER, TELLER, MANAGER, ADMIN | Restrict accessible features to current permissions and prevent stale JWT privilege reuse | **L4** | None | Source-confirmed | [Part 01 record](#auth-008--rolebased-access-and-authorizationstate-revocation) |
| [AUTH-009](#auth-009--verified-emailaddress-change) | Verified email-address change | 01 | Authenticated account holder requesting change | Change login contact email only after confirmation of the new address | **L3** | Blocked by dependency (link base-URL configuration for intended web result) | Source-confirmed | [Part 01 record](#auth-009--verified-emailaddress-change) |
| [AUTH-010](#auth-010--currentuser-identity-and-profile-read) | Current-user identity and profile read | 01 | Authenticated users, web and Android | Discover current username, role and user profile after login | **L4** | None | Source-confirmed | [Part 01 record](#auth-010--currentuser-identity-and-profile-read) |
| [AUTH-011](#auth-011--android-encrypted-bearertoken-persistence-and-session-restoration) | Android encrypted bearer-token persistence and session restoration | 01 | Android banking user | Stay signed in across app restarts and authenticate direct API requests | **L4** | None | Source-confirmed | [Part 01 record](#auth-011--android-encrypted-bearertoken-persistence-and-session-restoration) |
| [AUTH-012](#auth-012--android-local-pinbiometric-app-lock) | Android local PIN/biometric app lock | 01 | Android user who has enabled app lock | Gate app opening locally after a server-authenticated session is restored | **L4** | None | Source-confirmed | [Part 01 record](#auth-012--android-local-pinbiometric-app-lock) |
| [AUTH-013](#auth-013--backendonly-jwtsession-rotation-endpoint) | Backend-only JWT/session rotation endpoint | 01 | Authenticated direct API clients with currently valid bearer | Exchange a still-valid bearer for another signed JWT and rotate server session | **L2** | Intentionally disabled (browser route); backend-only | Source-confirmed | [Part 01 record](#auth-013--backendonly-jwtsession-rotation-endpoint) |
| [AUTH-014](#auth-014--account-username-change-with-android-relogin) | Account username change with Android re-login | 01 | Authenticated account holders on Android | Change login username while retaining identity | **L3** | None | Source-confirmed | [Part 01 record](#auth-014--account-username-change-with-android-relogin) |
| [AUTH-015](#auth-015--springtofastapi-internal-service-authentication) | Spring-to-FastAPI internal service authentication | 01 | Trusted bank-core service caller (not an end-user) | Restrict KYC/ML API routes to authenticated internal core requests | **L4** | None | Source-confirmed | [Part 01 record](#auth-015--springtofastapi-internal-service-authentication) |
| [AUTH-016](#auth-016--layered-login-attempt-throttling) | Layered login attempt throttling | 01 | Unauthenticated login actors | Bound credential-guessing attempts without creating account-enumeration responses | **L4** | None | Source-confirmed | [Part 01 record](#auth-016--layered-login-attempt-throttling) |
| [AUTH-017](#auth-017--backend-credential-recheck-endpoint) | Backend credential recheck endpoint | 01 | Authenticated direct API client | Confirm an existing password for an additional sensitive action | **L2** | Backend-only | Source-confirmed | [Part 01 record](#auth-017--backend-credential-recheck-endpoint) |

Use stable feature IDs e.g. `AUTH-001`, `KYC-001`. Do not equate review area names with discovered features. On future edits, replace the placeholder row with evidenced records.

## 8. Part 00–16 progress tracker

| Part | Area | State | Review outcome |
|---|---|---|---|
| 00 | Review framework and GitHub repository inventory | **COMPLETE** | Framework, repository discovery and expected-commit verification only |
| 01 | Authentication, identity, and session management | **COMPLETE** | 17 authentication/identity capabilities source-reviewed; real-stack acceptance not verified |
| 02 | Customer KYC and onboarding | **NOT REVIEWED** | Pending source-based feature review |
| 03 | Customer dashboard and profile | **NOT REVIEWED** | Pending source-based feature review |
| 04 | Customer account lifecycle | **NOT REVIEWED** | Pending source-based feature review |
| 05 | Banking transactions and double-entry ledger | **NOT REVIEWED** | Pending source-based feature review |
| 06 | Internal Pay and receipt recovery | **NOT REVIEWED** | Pending source-based feature review |
| 07 | Staff customer management | **NOT REVIEWED** | Pending source-based feature review |
| 08 | Teller-assisted opening and staff account operations | **NOT REVIEWED** | Pending source-based feature review |
| 09 | Manager Teller lifecycle | **NOT REVIEWED** | Pending source-based feature review |
| 10 | Admin KYC management | **NOT REVIEWED** | Pending source-based feature review |
| 11 | Admin users, employees, roles, and customer management | **NOT REVIEWED** | Pending source-based feature review |
| 12 | Financial administration and backend-only financial capabilities | **NOT REVIEWED** | Pending source-based feature review |
| 13 | External payments, wallet capabilities, and deferred features | **NOT REVIEWED** | Pending source-based feature review |
| 14 | Android bank-app | **NOT REVIEWED** | Pending source-based feature review |
| 15 | Cross-cutting platform capabilities and remaining API inventory | **NOT REVIEWED** | Pending source-based feature review |
| 16 | Final completeness map and future development planning | **NOT REVIEWED** | Pending source-based feature review |

## 9. Individual part sections

### Part 00 — Review framework and GitHub repository inventory

**Status:** COMPLETE.

Part 00 established the review rules, the four verified GitHub repositories, observed default-branch SHAs, known-commit parity, and the canonical documentation workflow. **No detailed feature was inspected or scored.**

### Part 01 — Authentication, identity, and session management

**Status:** COMPLETE (source-based Part 01 review, **not** an assertion of real-stack acceptance).

**Pinned application sources reviewed:** bank-web `012fbc6ff2687d126c67c85ce54cfc8d16f79f27`; bank-core `9f58e595a653db9d8aa59b70a35af8e2b0e725d3`; bank-service `cabdd323b4aa394910cb192ead6d233e9a12d9d3`; bank-app `9d98ba24cb754b8295bd58770cd502438d3b7b38`. Main HEAD refs were rechecked on 2026-11-23; docs review is restricted to branch `docs/feature-completeness-review`.

**Scope and rating policy.** Features are classified by their stated workflow boundary. Multiple client channels may differ; a Level 4 web journey does not certify the Android completion path. **No Level 5 is assigned** because no attributable actual integrated-stack authentication acceptance artifacts were accessible in the four GitHub repositories. Playwright tests launch `[web/e2e/mock-bank-core.mjs](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/e2e/mock-bank-core.mjs)`, as configured in [web/playwright.config.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/playwright.config.ts); those are simulated-backend browser tests, not bank-core live integration. Spring integration-test source exists but this review ran no tests. Evidence confidence is conservatively **Source-confirmed**.

**Architecture summary:** Browser → CSRF-protected Next.js BFF → JWT bearer forwarded to Spring Boot; browser stores HttpOnly auth+CSRF cookies and never receives the upstream JWT in JavaScript. Android → direct Retrofit + encrypted token DataStore → bearer requests to Spring Boot. Spring validates signature, issuer/audience, expiry, persisted fingerprint session and current user/role/employee state. Registration produces login identity only; KYC and banking Customer creation are separate downstream processes.

**Cross-client distinctions:** Registration verification and password reset complete in the web UI; Android initiates registration and forgot-password but has no native verification/result/reset completion screen. The web refresh route is intentionally blocked; direct-core refresh rotates a valid session but there is no independent refresh-token credential. Android has a local PIN/biometric app lock, **not** MFA. Email-change links require attention to the distinction between `app.baseUrl` and `app.frontendUrl` if the intended web result page is to be reached.

**Missing or unsupported enhancements—not invented implemented features:** no source-confirmed MFA/social login, user-managed active-session list or remote per-device termination UI, native Android reset/verification completion, or frontend-supported refresh-token rotation. Database `devices`/notification structures alone do not prove a user-facing device-session or security-notification feature.

#### AUTH-001 — Public login-identity registration and username availability

- **Review part:** 01
- **User roles:** Unauthenticated prospective CUSTOMER (web and Android).
- **User objective:** Create a login identity, not yet a KYC case, customer record or bank account.
- **Workflow boundary and complete steps:** Web /register collects username, email, password and optional name; username availability GET on blur; POST /auth/register with CSRF; core checks username/email uniqueness and password strength; saves inactive CUSTOMER user and verification token; sends email; web displays verification and resend instructions. Android checks availability then submits username/email/password and returns to login.
- **Frontend / Android:** Web [web/components/auth/RegisterForm.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/RegisterForm.tsx), [web/app/(public)/register/page.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/(public)/register/page.tsx); Android [app/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/RegisterScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/RegisterScreen.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/RegisterViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/RegisterViewModel.kt). Web uses HTML required fields and server errors; Android validates email, confirmation and strength.
- **Next.js BFF / API integration:** [web/lib/api/auth.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/auth.ts) -> [web/app/api/v1/[...path]/route.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/api/v1/%5B...path%5D/route.ts) -> [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts); public POST and GET; unsafe POST requires CSRF cookie/header; Android Retrofit goes directly to core without BFF.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java) register / available -> [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java); username case-insensitive availability, email against current and pending reservations; BCrypt, required >=8 chars + uppercase + number + selected special character; default CUSTOMER, isActive=false.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java); [core/src/main/java/com/bankingsystem/core/features/auth/domain/VerificationToken.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/VerificationToken.java); [core/src/main/resources/db/migration/V1__baseline.sql](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/resources/db/migration/V1__baseline.sql); user row and one-to-one verification token, separate from Customer.
- **External dependencies:** [core/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java) via JavaMailSender; development SMTP/Mailpit-compatible configuration in [core/src/main/resources/application-dev.example.yml](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/resources/application-dev.example.yml).
- **Authorization:** Public registration; default role CUSTOMER, cannot log in until activated by email verification.
- **Success, failure and recovery behavior:** 201 and web verification prompt; availability message; backend conflict for duplicate username/email; password validation errors; Android generic registration failure; no automatic login.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/UserEmailUniquenessIntegrationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/UserEmailUniquenessIntegrationTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/AuthRegistrationEmailConflictMvcTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/AuthRegistrationEmailConflictMvcTest.java); [web/e2e/email-verification.spec.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/e2e/email-verification.spec.ts); [web/tests/auth.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth.test.ts)
- **Available live verification:** No attributable integrated-stack registration evidence available; Playwright uses a mock core.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Web identity creation, available-name check, inactive default role and email handoff are wired end-to-end in source; Android has a registration call and UI.
- **Unsupported / incomplete behavior:** Android does not expose a native verification landing/resend journey; no bank Customer or Account created by this operation. Actual SMTP and database execution not observed.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Consider Android verification handoff/resend UI and a verified-stack registration acceptance check.


#### AUTH-002 — Registration email confirmation and resend

- **Review part:** 01
- **User roles:** Unauthenticated newly registered user.
- **User objective:** Activate email-verified identity so credentials become eligible for login.
- **Workflow boundary and complete steps:** Registration sends UUID token; email contains frontend /api/v1/auth/verify-email?token=...; browser GET performs one core verification and navigates with 303 to token-free result; expired/invalid/reused links display retry guidance; resend form submits email and refreshes the stored token.
- **Frontend / Android:** [web/components/auth/ResendVerificationForm.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/ResendVerificationForm.tsx), [web/app/(public)/verification-result/page.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/(public)/verification-result/page.tsx), [web/components/auth/RegisterForm.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/RegisterForm.tsx); no equivalent native Android email result or resend screen found.
- **Next.js BFF / API integration:** [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts) handles public GET verification, suppresses prefetch and HEAD/other methods, strips navigation token via redirect and maps 200/403/other to result; public resend POST CSRF-protected.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java) -> [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java): token expiry from app.token.expirationHours; on valid token sets isActive/emailVerified true and deletes token; resend replaces token for inactive unverified user and returns non-enumerating response.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/VerificationToken.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/VerificationToken.java), [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java); [core/src/main/resources/db/migration/V1__baseline.sql](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/resources/db/migration/V1__baseline.sql).
- **External dependencies:** [core/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java) creates HTML verification link and submits via JavaMailSender.
- **Authorization:** Public one-time bearer-in-link verification; inactive users cannot authenticate beforehand.
- **Success, failure and recovery behavior:** Verified / invalid-or-expired / unavailable web result; resend non-enumerating success, error and loading indicators; no auth cookie created by registration itself.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/AuthVerificationTokenTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/AuthVerificationTokenTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/ResendVerificationSecurityTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/ResendVerificationSecurityTest.java); [web/tests/email-verification-bff.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/email-verification-bff.test.ts); [web/e2e/email-verification.spec.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/e2e/email-verification.spec.ts)
- **Available live verification:** Playwright browser-to-mock-core link flow exists; no readable actual core + SMTP + browser acceptance report.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Source-connected web activation, token consumption, resend and recoverable link navigation; token expiry handling is implemented.
- **Unsupported / incomplete behavior:** No native Android completion/resend screen; live mail delivery unconfirmed.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Optional Android deep-link support and real Mailpit-based acceptance evidence.


#### AUTH-003 — Credentials login and eligibility enforcement

- **Review part:** 01
- **User roles:** CUSTOMER, TELLER, MANAGER, ADMIN; ineligible roles/accounts rejected.
- **User objective:** Sign in and obtain role-scoped authorization identity.
- **Workflow boundary and complete steps:** Login form collects credentials -> /auth/login; dedicated BFF forwards -> Spring DAO provider with BCrypt and role lookup -> login limiter and User.canAuthenticate check -> JWT and session row -> browser receives identity JSON + HttpOnly cookie -> role-aware redirect. Android logs in directly to core and saves JWT.
- **Frontend / Android:** [web/components/auth/LoginForm.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/LoginForm.tsx), [web/components/auth/AuthProvider.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/AuthProvider.tsx), [web/lib/auth/navigation.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/auth/navigation.ts); Android [app/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginScreen.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginViewModel.kt).
- **Next.js BFF / API integration:** [web/app/api/v1/auth/login/route.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/api/v1/auth/login/route.ts) enforces CSRF, validates upstream token/role/username, sets auth+CSRF cookies and removes JWT from response body; [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts); Android [app/app/src/main/java/com/bankingsystem/mobile/features/auth/integration/remote/api/AuthApi.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/integration/remote/api/AuthApi.kt).
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java), [core/src/main/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationService.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationService.java), [core/src/main/java/com/bankingsystem/core/modules/common/security/SecurityConfig.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/SecurityConfig.java), [core/src/main/java/com/bankingsystem/core/modules/common/security/UserDetailsServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/UserDetailsServiceImpl.java): rejects inactive, BANNED and inactive employee; generic credential failures 401; 429 Retry-After throttling.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java), [core/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java), [core/src/main/java/com/bankingsystem/core/features/accesscontrol/domain/Role.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/accesscontrol/domain/Role.java); BCrypt password hash and role; session persisted as fingerprint.
- **External dependencies:** No ML integration required for login; web requires configured Spring API endpoint.
- **Authorization:** JWT role comes from current user on issue; authenticated requests separately re-check authoritative user/employee state.
- **Success, failure and recovery behavior:** Web pending/error, correct role home or allowed returnTo; Android login spinner/snackbar; ineligible/invalid credentials 401, throttling 429, service failures remain errors.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/interfaces/LoginControllerContractTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/interfaces/LoginControllerContractTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationServiceTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationServiceTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java); [web/tests/bff-routes.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/bff-routes.test.ts); [web/tests/auth-provider.test.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth-provider.test.tsx)
- **Available live verification:** No attributable actual web+core+database live login result; Playwright role scenarios use mock core.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Connected credential authentication and role-aware web and mobile login with server-backed sessions.
- **Unsupported / incomplete behavior:** No observed production/real-stack login acceptance; Android supports login rather than the full web verification UX.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Capture integrated login acceptance for each defined role and inactive/disabled case.


#### AUTH-004 — Browser cookie-backed session bootstrap, protected transport and CSRF

- **Review part:** 01
- **User roles:** Authenticated web users across roles.
- **User objective:** Restore secure browser state and send authorized requests without exposing bearer token to client JS.
- **Workflow boundary and complete steps:** Login BFF establishes HttpOnly SameSite=Strict auth cookie + rotating CSRF comparison cookie; AuthProvider calls GET /auth/validate-token on mount; GET/unsafe API requests pass same-origin BFF, which injects cookie JWT as Authorization for upstream; unsafe methods validate CSRF; a protected 401 clears both cookies and notifies provider; transient bootstrap failures display retry rather than signing out.
- **Frontend / Android:** [web/components/auth/AuthProvider.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/AuthProvider.tsx), [web/components/auth/AuthGuard.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/AuthGuard.tsx), [web/lib/api/http.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/http.ts), [web/app/layout.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/layout.tsx).
- **Next.js BFF / API integration:** [web/lib/server/auth-cookie.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/auth-cookie.ts), [web/lib/server/csrf.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/csrf.ts), [web/app/api/auth/csrf/route.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/api/auth/csrf/route.ts), [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts), [web/app/api/v1/[...path]/route.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/api/v1/%5B...path%5D/route.ts).
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java) validate-token, [core/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java) and [core/src/main/java/com/bankingsystem/core/modules/common/security/JwtUtils.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/JwtUtils.java); Spring itself is stateless and disables CSRF for non-cookie bearer API.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java) fingerprint, expiry, active and IP, read through [core/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java); no web localStorage token.
- **External dependencies:** Next.js BFF -> Spring Boot over configured banking upstream; no FastAPI interaction.
- **Authorization:** Cookie belongs to browser BFF; real JWT authorization remains Spring's responsibility. BFF filters forwarded request/response headers and blocks direct refresh-token route.
- **Success, failure and recovery behavior:** Booting / authenticated / anonymous / boot-error with manual retry; protected 401 terminal, non-401 transport errors do not automatically invalidate session.
- **Existing automated tests:** [web/tests/cookie-csrf.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/cookie-csrf.test.ts); [web/tests/auth-provider.test.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth-provider.test.tsx); [web/tests/proxy.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/proxy.test.ts); [web/tests/bff-routes.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/bff-routes.test.ts); [core/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java)
- **Available live verification:** Browser/mock backend tests exist; actual integrated-stack browser session behavior not observed.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Source traces cookie issuance, CSRF acquisition/check, session bootstrap, protected proxy, expiry and uncertainty behavior.
- **Unsupported / incomplete behavior:** Browser automatically does **not** refresh JWT or server session; server session is 2 hours while example JWT default is 24 hours, so effective session validation ends at first expiry. No active-session UI.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Decide whether session length, explicit reauthentication and browser refresh policy match desired UX.


#### AUTH-005 — Logout and server-session termination

- **Review part:** 01
- **User roles:** Authenticated browser and Android users.
- **User objective:** End a login session and prevent bearer reuse.
- **Workflow boundary and complete steps:** Browser header sign-out -> dedicated BFF POST /auth/logout -> Spring logout finds hashed-token session and marks it inactive -> BFF deletes auth and CSRF cookies on terminal success/400/401 -> provider clears identity and routes to login; uncertain transport failures retain signed-in state. Android calls logout then clears encrypted local token.
- **Frontend / Android:** [web/components/layout/AppHeader.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/layout/AppHeader.tsx), [web/components/auth/AuthProvider.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/AuthProvider.tsx); Android [app/app/src/main/java/com/bankingsystem/mobile/features/settings/interfaces/ui/SettingsScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/settings/interfaces/ui/SettingsScreen.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/auth/integration/repository/UserRepositoryImpl.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/integration/repository/UserRepositoryImpl.kt).
- **Next.js BFF / API integration:** [web/app/api/v1/auth/logout/route.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/api/v1/auth/logout/route.ts) and [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts); Android Retrofit directly sends bearer logout.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java) POST /logout; [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java) marks session inactive/logged-out.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java), [core/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java); session fingerprint-based lookup and deactivation.
- **External dependencies:** No additional service dependency.
- **Authorization:** Authenticated bearer required; BFF avoids treating unconfirmed revocation as successful logout.
- **Success, failure and recovery behavior:** Web confirms termination or preserves state on 5xx/transport uncertainty; Android always clears local token even if server logout request fails (revocation not guaranteed in that case).
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/AuthServiceSessionFingerprintTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/AuthServiceSessionFingerprintTest.java); [web/tests/auth-provider.test.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth-provider.test.tsx); [web/tests/bff-routes.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/bff-routes.test.ts)
- **Available live verification:** No live-stack logout/reuse proof readable.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Server-side invalidation and browser terminal cleanup are connected; Android local sign-out supported.
- **Unsupported / incomplete behavior:** Android server revocation may be unconfirmed when request fails; no UI listing and terminating other sessions.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Optional mobile logout retry/uncertainty policy and active-device session management.


#### AUTH-006 — Forgotten-password email recovery and reset

- **Review part:** 01
- **User roles:** Unauthenticated user with previously registered email (web; Android request initiation).
- **User objective:** Recover access after forgetting credentials.
- **Workflow boundary and complete steps:** Web forgot form POST /auth/forgot-password -> core avoids account enumeration, creates/replaces one-hour reset token and sends frontend reset link -> /reset-password?token shows password+confirmation -> CSRF-protected form POST with token/newPassword -> core validates not used/expired, hashes password, marks token used, revokes all sessions -> UI shows login action. Android only starts forgot email request; email link opens web reset page.
- **Frontend / Android:** [web/components/auth/ForgotPasswordForm.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/ForgotPasswordForm.tsx), [web/components/auth/ResetPasswordView.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/ResetPasswordView.tsx), [web/app/(public)/reset-password/page.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/(public)/reset-password/page.tsx); Android forgot dialog in [app/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginScreen.kt).
- **Next.js BFF / API integration:** [web/lib/api/auth.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/auth.ts) uses urlencoded POST form body, not URL query secrets; [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts) blocks reset POST query fields and applies CSRF; public endpoint.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java) POST forgot/reset plus GET token check; [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/PasswordResetServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/PasswordResetServiceImpl.java) one-hour, used flag, BCrypt, revokes sessions.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/PasswordResetToken.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/PasswordResetToken.java), [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java), [core/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java); [core/src/main/resources/db/migration/V1__baseline.sql](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/resources/db/migration/V1__baseline.sql).
- **External dependencies:** [core/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java) reset-link HTML mail to configured frontend.
- **Authorization:** Public reset by possession of emailed token, with expiry and one-time use; separate from authenticated password change.
- **Success, failure and recovery behavior:** Non-enumerating email response; frontend mismatch validation, success and new-link recovery; expired/reused/invalid token rejected by backend. Public GET token check exists but web deliberately does not call it before POST.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/PasswordSessionRevocationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/PasswordSessionRevocationTest.java); [web/tests/reset-password.test.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/reset-password.test.tsx); [web/tests/auth.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth.test.ts); [web/tests/bff-routes.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/bff-routes.test.ts)
- **Available live verification:** No actual SMTP+browser+Spring password-recovery acceptance evidence.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Web full recovery and server invalidation wired; Android requests recovery email.
- **Unsupported / incomplete behavior:** No native Android reset completion UI; backend GET token check tests existence only rather than expiry/used, but web doesn't rely on GET.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Consider native Android reset handoff and consistent reset-token status contract.


#### AUTH-007 — Authenticated password change and forced reauthentication

- **Review part:** 01
- **User roles:** Authenticated users, web profile and Android profile.
- **User objective:** Change a known password and terminate existing sessions.
- **Workflow boundary and complete steps:** Web profile form collects current, new, confirm -> BFF PUT -> core verifies current BCrypt, validates strength/matching/difference, hashes new password, deletes all user sessions -> BFF deletes cookies -> frontend clears identity and sends to login. Android profile dialog invokes same core endpoint.
- **Frontend / Android:** [web/components/banking/PasswordChangeForm.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/banking/PasswordChangeForm.tsx), [web/components/banking/ProfileView.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/banking/ProfileView.tsx); Android [app/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ChangePasswordDialog.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ChangePasswordDialog.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt).
- **Next.js BFF / API integration:** [web/app/api/v1/auth/change-password/route.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/api/v1/auth/change-password/route.ts) dedicated authenticated, CSRF and cookie deletion on success; Android [app/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/remote/api/ProfileApi.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/remote/api/ProfileApi.kt) direct bearer.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java) PUT /change-password -> [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java).
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java) password_hash update; [core/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java) deletes all user sessions.
- **External dependencies:** None outside configured Spring API.
- **Authorization:** Requires current logged-in identity and proof of current password; all previously issued sessions are invalidated.
- **Success, failure and recovery behavior:** Web navigates to login on successful change; errors leave form editable. Android displays success but does not immediately clear local token or route to login; next 401 eventually clears token via network interceptor.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/PasswordSessionRevocationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/PasswordSessionRevocationTest.java); [web/tests/bff-routes.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/bff-routes.test.ts); [web/tests/auth-provider.test.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth-provider.test.tsx)
- **Available live verification:** No actual real-stack password-change acceptance evidence.
- **Completeness level:** **Level 3 — Partially functional**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Backend change, revoke-all and web forced sign-in path connected; Android submits same request.
- **Unsupported / incomplete behavior:** Cross-channel UX incomplete: Android reports success while its token becomes revoked, with no immediate explicit reauthentication flow. Web-defined flow alone merits L4, combined web+Android scope merits L3.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Align Android post-change sign-out and new-login experience with server revocation.


#### AUTH-008 — Role-based access and authorization-state revocation

- **Review part:** 01
- **User roles:** CUSTOMER, TELLER, MANAGER, ADMIN; BANNED/EMPLOYEE and inactive states restricted.
- **User objective:** Restrict accessible features to current permissions and prevent stale JWT privilege reuse.
- **Workflow boundary and complete steps:** User signs in -> role-bearing JWT issued -> each request JwtAuthFilter validates signature/issuer/audience/expiry + fingerprint session + current role, active status and employment status -> Spring URL/method security enforces permissions; web AuthGuard/roleHome hides disallowed UI and handles unauthorized. Admin role and Manager Teller lifecycle changes take user lock and revoke sessions; old token cannot be elevated by subsequent promotion.
- **Frontend / Android:** [web/lib/auth/navigation.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/auth/navigation.ts), [web/components/auth/AuthGuard.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/AuthGuard.tsx), [web/components/layout/AppHeader.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/layout/AppHeader.tsx), [web/app/(staff)/staff/layout.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/(staff)/staff/layout.tsx), [web/app/(admin)/admin/layout.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/(admin)/admin/layout.tsx).
- **Next.js BFF / API integration:** [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts) forwards bearer and maps terminal auth 401; frontend guards are UX hints rather than sole enforcement.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java), [core/src/main/java/com/bankingsystem/core/modules/common/security/SecurityConfig.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/SecurityConfig.java), [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java), [core/src/main/java/com/bankingsystem/core/features/accesscontrol/application/impl/AccessControlServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/accesscontrol/application/impl/AccessControlServiceImpl.java), [core/src/main/java/com/bankingsystem/core/features/employee/application/impl/EmployeeServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/employee/application/impl/EmployeeServiceImpl.java).
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/accesscontrol/domain/Role.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/accesscontrol/domain/Role.java), [core/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java), [core/src/main/java/com/bankingsystem/core/features/employee/domain/Employee.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/employee/domain/Employee.java); role/employee status and session deletion.
- **External dependencies:** No ML dependency for authorization; customer/KYC/employee business workflow reviews deferred to Parts 02/09/11.
- **Authorization:** Authoritative current user/role/employee state; JWT role must match. BANNED disallowed by canAuthenticate regardless of token, user inactivity and inactive staff also rejected.
- **Success, failure and recovery behavior:** Web protected routes redirect anonymous to login and wrong-role to unauthorized; core returns unauthorized/restrictions; stale sessions revoked on role/employment changes.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/security/JwtAuthorizationStateIntegrationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/security/JwtAuthorizationStateIntegrationTest.java); [core/src/test/java/com/bankingsystem/core/features/employee/EmployeeServiceLifecycleIntegrationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/employee/EmployeeServiceLifecycleIntegrationTest.java); [web/tests/auth-provider.test.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth-provider.test.tsx); [web/e2e/role-navigation.spec.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/e2e/role-navigation.spec.ts)
- **Available live verification:** Spring MockMvc/integration and browser-to-mock-core tests inspected as source, not evidence of actual deployed four-service acceptance.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Current-authority request checks and session revocation on privilege or employment changes are traced.
- **Unsupported / incomplete behavior:** No proof all business endpoints have been exhaustively authorized (belongs to later parts); Android app nav does not implement complete staff role-specific workspaces.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Capture role-transition live-stack acceptance and role-change reauthentication UX.


#### AUTH-009 — Verified email-address change

- **Review part:** 01
- **User roles:** Authenticated account holder requesting change; public verification link recipient.
- **User objective:** Change login contact email only after confirmation of the new address.
- **Workflow boundary and complete steps:** Web customer profile loads /users/me -> PUT /users/me/email with newEmail -> core checks current and pending email uniqueness, stores pending email/verification token/time and sends link -> public GET verification confirms within 24 hours, moves pending address to current, clears token -> browser offers token-free result page where the link goes through web BFF.
- **Frontend / Android:** [web/components/banking/ProfileView.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/banking/ProfileView.tsx), [web/app/(public)/verification-result/page.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/(public)/verification-result/page.tsx); Android generic profile editor can PUT email through [app/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt), but lacks a dedicated confirmation landing view.
- **Next.js BFF / API integration:** [web/lib/api/users.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/users.ts), [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts): authenticated PUT with CSRF and public GET /users/me/email/verify with safe 303 when routed through BFF.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java), [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java), [core/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java).
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java) new_email, email_verification_token, created timestamp, is_email_verified; [core/src/main/resources/db/migration/V1__baseline.sql](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/resources/db/migration/V1__baseline.sql).
- **External dependencies:** JavaMailSender; link is built with app.baseUrl for email change (distinct from registration's frontendUrl), so configured URL determines whether the user lands in web BFF result flow or directly at core's text endpoint.
- **Authorization:** Request requires authenticated user through Spring's default anyRequest auth; confirmation token is publicly redeemable; replay and 24-hour expiry rejected.
- **Success, failure and recovery behavior:** Web pending confirmation message, email conflict/invalid result; token-based verification shows success/invalid/conflict/unavailable when passing via BFF.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/UserEmailChangeServiceTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/UserEmailChangeServiceTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/UserEmailChangeMvcTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/UserEmailChangeMvcTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/UserEmailUniquenessIntegrationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/UserEmailUniquenessIntegrationTest.java); [web/tests/email-verification-bff.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/email-verification-bff.test.ts); [web/e2e/email-verification.spec.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/e2e/email-verification.spec.ts)
- **Available live verification:** No real configured mail link/SMTP/browser acceptance observed; Playwright email-change link uses mock core.
- **Completeness level:** **Level 3 — Partially functional**, for the specific scope described.
- **Independent status:** Blocked by dependency (link base-URL configuration for intended web result).
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Backend pending-email confirmation and web request/verification BFF paths are implemented.
- **Unsupported / incomplete behavior:** Default example app.baseUrl targets Spring API rather than web BFF, so intended web result navigation is configuration-dependent; Android has no dedicated confirmation UX.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Standardize email-change links on the intended frontend/BFF URL, then verify browser mail delivery and Android handoff.


#### AUTH-010 — Current-user identity and profile read

- **Review part:** 01
- **User roles:** Authenticated users, web and Android.
- **User objective:** Discover current username, role and user profile after login.
- **Workflow boundary and complete steps:** Web AuthProvider calls /auth/validate-token on bootstrap to restore username/role; customer profile fetches /users/me to show identity/email, and Android profile loads equivalent endpoint; backend resolves user from Spring Security principal and returns profile DTO. /auth/available supplies public username availability.
- **Frontend / Android:** [web/components/auth/AuthProvider.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/AuthProvider.tsx), [web/components/banking/ProfileView.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/banking/ProfileView.tsx); Android [app/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/remote/api/ProfileApi.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/remote/api/ProfileApi.kt).
- **Next.js BFF / API integration:** [web/lib/api/auth.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/auth.ts), [web/lib/api/users.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/users.ts), [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts) authenticated bearer forwarding; Android direct Retrofit.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java) /validate-token; [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java) /users/me; [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java).
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java), [core/src/main/java/com/bankingsystem/core/features/accesscontrol/domain/Role.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/accesscontrol/domain/Role.java); current stored identity and role.
- **External dependencies:** No mail or ML needed for read.
- **Authorization:** Auth-filter validates live user/session before identity is returned; /users/me requires isAuthenticated.
- **Success, failure and recovery behavior:** Web profile load or error; boot-error vs anonymous; Android loading/failure and profile data.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java); [web/tests/auth-provider.test.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth-provider.test.tsx); [web/tests/auth.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/auth.test.ts)
- **Available live verification:** No real-stack authenticated profile restoration evidence found.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Read-only identity restoration and profile exposure on web/Android are connected.
- **Unsupported / incomplete behavior:** Full profile-edit breadth belongs to Part 03; no active session inventory endpoint included here.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Keep principal/role displayed values consistent after identity changes and reauthentication.


#### AUTH-011 — Android encrypted bearer-token persistence and session restoration

- **Review part:** 01
- **User roles:** Android banking user.
- **User objective:** Stay signed in across app restarts and authenticate direct API requests.
- **Workflow boundary and complete steps:** Android login Retrofit obtains token -> UserRepositoryImpl stores encrypted token via Android Keystore key + DataStore -> DI HTTP interceptor attaches Bearer to requests -> MainActivity LoginViewModel.autoLogin uses validate-token on tokenFlow -> authenticated navigation; HTTP 401 clears persisted token and returns to login state.
- **Frontend / Android:** [app/app/src/main/java/com/bankingsystem/mobile/MainActivity.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/MainActivity.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginViewModel.kt), [app/app/src/main/java/com/bankingsystem/mobile/app/navigation/AppNavHost.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/app/navigation/AppNavHost.kt).
- **Next.js BFF / API integration:** Not applicable: Android calls Spring Boot directly, not Next.js BFF.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java), [core/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java); tokens are bound to server sessions, with active status and current-user checks.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java) backend fingerprint; mobile [app/app/src/main/java/com/bankingsystem/mobile/core/modules/common/storage/TokenManager.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/core/modules/common/storage/TokenManager.kt) encrypted DataStore storage.
- **External dependencies:** [app/app/src/main/java/com/bankingsystem/mobile/core/modules/common/security/KeyStoreManager.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/core/modules/common/security/KeyStoreManager.kt), [app/app/src/main/java/com/bankingsystem/mobile/app/di/NetworkModule.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/app/di/NetworkModule.kt) HTTP client configured for base URL.
- **Authorization:** Direct Bearer; server JWT+session authorization; network interceptor handles 401 clearing. Separate from browser HttpOnly/CSRF scheme.
- **Success, failure and recovery behavior:** Auto-login on validated token; invalid/expired tokens clear local state; errors propagate through mobile login state.
- **Existing automated tests:** [app/app/src/main/java/com/bankingsystem/mobile/core/modules/common/network/AuthInterceptor.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/core/modules/common/network/AuthInterceptor.kt); [app/app/src/test/java/com/bankingsystem/mobile/Auth007PolicyTest.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/test/java/com/bankingsystem/mobile/Auth007PolicyTest.kt)
- **Available live verification:** No emulator/device integrated-stack auth acceptance or instrumented token-restoration proof supplied.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Encrypted token storage, bearer injection and validation-on-restore are wired.
- **Unsupported / incomplete behavior:** No mobile token-refresh API; validation/network errors during auto-login may clear token and call logout; no device-session listing.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Consider offline/temporary-error session-restoration policy and explicit reauthentication UX.


#### AUTH-012 — Android local PIN/biometric app lock

- **Review part:** 01
- **User roles:** Android user who has enabled app lock.
- **User objective:** Gate app opening locally after a server-authenticated session is restored.
- **Workflow boundary and complete steps:** Settings toggles App Lock -> setup PIN with minimum four digits -> SharedPreferences save -> MainActivity when login succeeds/auto-login reloads preference -> AppLocker requests biometric via device prompt with PIN fallback -> on success shows authenticated app; settings permit PIN change or disable.
- **Frontend / Android:** [app/app/src/main/java/com/bankingsystem/mobile/features/settings/interfaces/ui/SettingsScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/settings/interfaces/ui/SettingsScreen.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/LockSetupScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/LockSetupScreen.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/AppLocker.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/AppLocker.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/LockScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/LockScreen.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/PinUnlockScreen.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/lock/interfaces/ui/PinUnlockScreen.kt).
- **Next.js BFF / API integration:** Not applicable: local device lock, no server API or browser equivalent.
- **Spring Boot implementation:** Not applicable for local unlock; Spring authentication remains required before gate is displayed.
- **Database / ledger:** [app/app/src/main/java/com/bankingsystem/mobile/core/modules/common/storage/LockPreferences.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/core/modules/common/storage/LockPreferences.kt) app SharedPreferences, distinct from encrypted auth-token DataStore; no server biometric/PIN records.
- **External dependencies:** Android device biometric APIs via app helper, no external identity provider.
- **Authorization:** Local device UX gate; **not** server-backed MFA or a second factor for API authentication.
- **Success, failure and recovery behavior:** PIN mismatch shows incorrect PIN; biometric fallback to PIN; settings enable/disable and change PIN.
- **Existing automated tests:** No dedicated app-lock runtime test identified in inspected paths; Android Auth007PolicyTest covers backup/network policy, not PIN/biometric correctness.
- **Available live verification:** No device/emulator runtime verification supplied.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Connected settings/setup/unlock startup UI in source.
- **Unsupported / incomplete behavior:** Local PIN is stored as a SharedPreferences string and does not authenticate to core; lock is shown in MainActivity's post-login path, not proved as a universal background-resume lock.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Decide whether app lock should cover resume from background and whether PIN storage policy should be strengthened; separate from MFA planning.


#### AUTH-013 — Backend-only JWT/session rotation endpoint

- **Review part:** 01
- **User roles:** Authenticated direct API clients with currently valid bearer.
- **User objective:** Exchange a still-valid bearer for another signed JWT and rotate server session.
- **Workflow boundary and complete steps:** POST /auth/refresh-token with Authorization Bearer and matching username body -> core verifies token claims/subject, generates new unique-JTI JWT -> rotateSession locks user + old fingerprint, disables old session and saves new fingerprint -> responds {token}.
- **Frontend / Android:** No browser/client refresh workflow: ${W('lib/server/banking-upstream.ts')} explicitly blocks browser /auth/refresh-token; ${W('lib/api/auth.ts')} has no refresh call; Android ${A('features/auth/integration/remote/api/AuthApi.kt')} has none.
- **Next.js BFF / API integration:** Browser public proxy explicitly returns 404 for refresh-token and does not call core. No dedicated BFF refresh route.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java), [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java), [core/src/main/java/com/bankingsystem/core/modules/common/security/JwtUtils.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/JwtUtils.java).
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/Session.java) and [core/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/repository/SessionRepository.java); old fingerprint inactive, new fingerprint active.
- **External dependencies:** None.
- **Authorization:** Requires currently valid JWT (filter rejects expired bearer before controller) and matching authoritative current role/user state; this is **not** an independent long-lived refresh token scheme.
- **Success, failure and recovery behavior:** Core returns new token or 401 invalid session; browser users have no refresh UX.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/RefreshSessionTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/RefreshSessionTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/AuthLoginRefreshFingerprintTest.java); [core/src/test/java/com/bankingsystem/core/features/security/JwtAuthorizationStateIntegrationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/security/JwtAuthorizationStateIntegrationTest.java); [web/tests/proxy.test.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/tests/proxy.test.ts)
- **Available live verification:** No actual real-stack refresh caller observed.
- **Completeness level:** **Level 2 — One-sided**, for the specific scope described.
- **Independent status:** Intentionally disabled (browser route); backend-only.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Direct core token replacement and rotation contract implemented.
- **Unsupported / incomplete behavior:** No browser or Android consumer and no separate refresh credential; after JWT/server expiry it cannot renew a dead session.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Decide whether to keep backend rotation for direct clients, build a safe refresh UX, or retire the unused public surface.


#### AUTH-014 — Account username change with Android re-login

- **Review part:** 01
- **User roles:** Authenticated account holders on Android; backend generic profile endpoint.
- **User objective:** Change login username while retaining identity.
- **Workflow boundary and complete steps:** Android profile editor checks new username availability, asks for current password, PUT /users/me with username and currentPassword, then calls login(newUsername,password) and stores replacement token; backend profile update saves username. Web profile shows username read-only without rename form.
- **Frontend / Android:** [app/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/ProfileViewModel.kt), [app/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/PasswordVerificationDialog.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/interfaces/ui/PasswordVerificationDialog.kt); [web/components/banking/ProfileView.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/banking/ProfileView.tsx) read-only username.
- **Next.js BFF / API integration:** [web/lib/api/users.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/users.ts) exposes read/profile + email change only; generic web authenticated /users/me PUT could proxy but is not linked to web username editor. Android direct ProfileApi.updateMe.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java) PUT /me; [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java) updateProfile uses username uniqueness and sets username; the currentPassword field supplied by Android is not checked in this update method.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java); existing JWTs retain old subject and fail authoritative username match until replacement login.
- **External dependencies:** None.
- **Authorization:** Requires session for PUT; Android prompts for password and reauthenticates after update. Backend's independent /users/verify-password is not invoked by this Android flow.
- **Success, failure and recovery behavior:** Android success snackbar after new login; update/relogin errors; no equivalent web rename.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/UserEmailUniquenessIntegrationTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/UserEmailUniquenessIntegrationTest.java); [app/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/repository/ProfileRepositoryImpl.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/repository/ProfileRepositoryImpl.kt)
- **Available live verification:** No actual username-change device / core integration evidence.
- **Completeness level:** **Level 3 — Partially functional**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Backend update and Android rename/re-login workflow exist.
- **Unsupported / incomplete behavior:** Not available in web UI; Android password prompt isn't a server-side pre-update verification; failure between rename and re-login has limited recovery UX.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Define credential re-verification policy and add a recoverable username-change journey where desired.


#### AUTH-015 — Spring-to-FastAPI internal service authentication

- **Review part:** 01
- **User roles:** Trusted bank-core service caller (not an end-user).
- **User objective:** Restrict KYC/ML API routes to authenticated internal core requests.
- **Workflow boundary and complete steps:** Spring MlWebClientConfig requires configured 32+ byte service secret -> adds X-Bank-Core-Auth on ML requests -> FastAPI KYC router dependency validates header with constant-time comparison against configured secret -> absent/incorrect requests return 401; health remains public.
- **Frontend / Android:** Not applicable: no browser/mobile direct access intended.
- **Next.js BFF / API integration:** Not applicable: internal core-to-service HTTP channel.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/kyc/integration/MlWebClientConfig.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/kyc/integration/MlWebClientConfig.java), [core/src/main/java/com/bankingsystem/core/features/kyc/integration/MlKycClient.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/kyc/integration/MlKycClient.java).
- **Database / ledger:** No token/session DB for internal static shared credential; configured by environment; KYC persistence belongs to Part 02.
- **External dependencies:** [service/app/core/internal_auth.py](https://github.com/gimesha-adikari/bank-service/blob/cabdd323b4aa394910cb192ead6d233e9a12d9d3/app/core/internal_auth.py), [service/app/api/v1/kyc.py](https://github.com/gimesha-adikari/bank-service/blob/cabdd323b4aa394910cb192ead6d233e9a12d9d3/app/api/v1/kyc.py), [service/app/core/config.py](https://github.com/gimesha-adikari/bank-service/blob/cabdd323b4aa394910cb192ead6d233e9a12d9d3/app/core/config.py); FastAPI router dependency.
- **Authorization:** Configured shared secret, not customer JWT or OAuth. Health not guarded; KYC endpoints guarded.
- **Success, failure and recovery behavior:** FastAPI 401 for missing/wrong header; valid header proceeds to route validation/business processing.
- **Existing automated tests:** [service/tests/test_internal_auth.py](https://github.com/gimesha-adikari/bank-service/blob/cabdd323b4aa394910cb192ead6d233e9a12d9d3/tests/test_internal_auth.py); [core/src/test/java/com/bankingsystem/core/features/kyc/integration/MlKycClientTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/kyc/integration/MlKycClientTest.java)
- **Available live verification:** No actual deployed Spring-to-FastAPI authenticated request trace/readable real-stack evidence.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Both producer and consumer of shared service authentication implemented.
- **Unsupported / incomplete behavior:** No observed real-stack integration run; secret rotation/stronger workload identity scheme not covered here.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Plan credential rotation and internal channel acceptance tests as part of cross-cutting platform work (Part 15).


#### AUTH-016 — Layered login attempt throttling

- **Review part:** 01
- **User roles:** Unauthenticated login actors; all accounts protected.
- **User objective:** Bound credential-guessing attempts without creating account-enumeration responses.
- **Workflow boundary and complete steps:** Before DAO authentication, identity resolver maps username to account ID or normalized unknown identity; LoginRateLimiter consumes IP, identity and IP+identity token buckets; when limited, controller returns generic 429 and capped Retry-After; on success account/pair buckets reset (IP history retained).
- **Frontend / Android:** [web/components/auth/LoginForm.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/LoginForm.tsx) shows backend error; Android [app/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginViewModel.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/auth/interfaces/ui/LoginViewModel.kt) displays login failure. Browser doesn't implement a separate lockout countdown.
- **Next.js BFF / API integration:** [web/app/api/v1/auth/login/route.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/app/api/v1/auth/login/route.ts) preserves upstream error statuses/headers; [web/lib/server/banking-upstream.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/server/banking-upstream.ts) forwards Retry-After in selected headers.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationService.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationService.java), [core/src/main/java/com/bankingsystem/core/features/auth/application/LoginRateLimiter.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/LoginRateLimiter.java), [core/src/main/java/com/bankingsystem/core/features/auth/application/LoginRateLimitIdentityResolver.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/LoginRateLimitIdentityResolver.java), [core/src/main/java/com/bankingsystem/core/modules/common/config/LoginRateLimitProperties.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/config/LoginRateLimitProperties.java).
- **Database / ledger:** In-memory bounded Caffeine counters, not persisted across process restarts or shared between instances.
- **External dependencies:** None.
- **Authorization:** Public login admission protection; default enabled and configurable through application.yml.
- **Success, failure and recovery behavior:** 429 generic message + Retry-After, or 503 when limiter fails; credential response remains generic 401. No durable account-lock record.
- **Existing automated tests:** [core/src/test/java/com/bankingsystem/core/features/auth/application/LoginRateLimiterTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/application/LoginRateLimiterTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/interfaces/LoginControllerContractTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/interfaces/LoginControllerContractTest.java); [core/src/test/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationServiceTest.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/test/java/com/bankingsystem/core/features/auth/application/LoginAuthenticationServiceTest.java)
- **Available live verification:** No production or distributed real-stack throttle evidence.
- **Completeness level:** **Level 4 — Functionally implemented**, for the specific scope described.
- **Independent status:** None.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Server limiter and client-visible login responses implemented with unit/controller tests in repository.
- **Unsupported / incomplete behavior:** Process-local counters are not multi-instance shared; no account lock or 2FA step-up; browser lacks explicit countdown.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Evaluate distributed limiter and user-friendly Retry-After messaging if deployment scales beyond one instance.


#### AUTH-017 — Backend credential recheck endpoint

- **Review part:** 01
- **User roles:** Authenticated direct API client.
- **User objective:** Confirm an existing password for an additional sensitive action.
- **Workflow boundary and complete steps:** POST /users/verify-password sends password, controller resolves authenticated username and compares BCrypt hash; returns boolean true or 401. No web component uses this endpoint and the Android username-change prompt uses profile PUT followed by login instead.
- **Frontend / Android:** No connected client found in [web/lib/api/users.ts](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/lib/api/users.ts) or [app/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/remote/api/ProfileApi.kt](https://github.com/gimesha-adikari/bank-app/blob/9d98ba24cb754b8295bd58770cd502438d3b7b38/app/src/main/java/com/bankingsystem/mobile/features/profile/integration/remote/api/ProfileApi.kt).
- **Next.js BFF / API integration:** Authenticated generic web proxy could route the endpoint but no UI/client method uses it.
- **Spring Boot implementation:** [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/UserController.java) /verify-password; passwordEncoder.matches against stored hash; Spring default anyRequest authenticated.
- **Database / ledger:** [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java) password_hash.
- **External dependencies:** None.
- **Authorization:** Existing JWT/session required; not a login endpoint.
- **Success, failure and recovery behavior:** Backend 200 true or 401 invalid password; no user-visible flow directly connected.
- **Existing automated tests:** No dedicated endpoint contract test identified in inspected authentication test list.
- **Available live verification:** None.
- **Completeness level:** **Level 2 — One-sided**, for the specific scope described.
- **Independent status:** Backend-only.
- **Evidence confidence:** **Source-confirmed** (existing automated-test code inspected but not run in Part 01).
- **Supported behavior:** Independent direct API password comparison method is implemented.
- **Unsupported / incomplete behavior:** No frontend or mobile API call wired to make it an end-user capability.
- **Source references:** See the commit-pinned implementation and test links in the layer fields above.
- **Future implementation opportunities:** Decide whether to integrate for sensitive account actions or keep it as a direct API utility.

### Part 02 — Customer KYC and onboarding

**Status:** NOT REVIEWED.

**Review boundary:** Customer KYC and onboarding. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 03 — Customer dashboard and profile

**Status:** NOT REVIEWED.

**Review boundary:** Customer dashboard and profile. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 04 — Customer account lifecycle

**Status:** NOT REVIEWED.

**Review boundary:** Customer account lifecycle. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 05 — Banking transactions and double-entry ledger

**Status:** NOT REVIEWED.

**Review boundary:** Banking transactions and double-entry ledger. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 06 — Internal Pay and receipt recovery

**Status:** NOT REVIEWED.

**Review boundary:** Internal Pay and receipt recovery. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 07 — Staff customer management

**Status:** NOT REVIEWED.

**Review boundary:** Staff customer management. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 08 — Teller-assisted opening and staff account operations

**Status:** NOT REVIEWED.

**Review boundary:** Teller-assisted opening and staff account operations. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 09 — Manager Teller lifecycle

**Status:** NOT REVIEWED.

**Review boundary:** Manager Teller lifecycle. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 10 — Admin KYC management

**Status:** NOT REVIEWED.

**Review boundary:** Admin KYC management. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 11 — Admin users, employees, roles, and customer management

**Status:** NOT REVIEWED.

**Review boundary:** Admin users, employees, roles, and customer management. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 12 — Financial administration and backend-only financial capabilities

**Status:** NOT REVIEWED.

**Review boundary:** Financial administration and backend-only financial capabilities. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 13 — External payments, wallet capabilities, and deferred features

**Status:** NOT REVIEWED.

**Review boundary:** External payments, wallet capabilities, and deferred features. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 14 — Android bank-app

**Status:** NOT REVIEWED.

**Review boundary:** Android bank-app. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 15 — Cross-cutting platform capabilities and remaining API inventory

**Status:** NOT REVIEWED.

**Review boundary:** Cross-cutting platform capabilities and remaining API inventory. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**

### Part 16 — Final completeness map and future development planning

**Status:** NOT REVIEWED.

**Review boundary:** Final completeness map and future development planning. Future reviewer must discover the actual features, trace relevant user journeys end-to-end, link repository evidence, and record individual feature classifications. **No findings or scores recorded yet.**


## 10. Standard feature record template

Copy this structure into the appropriate part when a feature is actually reviewed; replace placeholders only with observed evidence:

```md
#### [FEATURE-ID] — [Feature name]

- **Review part:** [00–16]
- **User roles:** [roles and permissions]
- **User objective:** [reason this feature is used]
- **Workflow boundary:** [entry condition through observable outcome]
- **Complete workflow steps:** [ordered stages and branch conditions]
- **Frontend / Android:** [routes/screens/components/action links, or N/A]
- **Next.js BFF / API integration:** [client, endpoint, method, payload, response, error handling, or N/A]
- **Spring Boot implementation:** [controllers/services/validation, or N/A]
- **Database / ledger:** [entities, tables, migrations, journal effects, or N/A]
- **External dependencies:** [FastAPI, provider, mail, etc., or N/A]
- **Authorization:** [authn/authz, role/ownership checks]
- **Success, failure and recovery behavior:** [actual user-visible states]
- **Existing automated tests:** [file paths, scope, mock boundaries]
- **Available live verification:** [dated evidence, environment and scope, or none]
- **Completeness level:** [0–5, or unscored when insufficient evidence]
- **Independent status:** [status, if applicable]
- **Evidence confidence:** [one of the five evidence labels]
- **Supported behavior:** [precisely what works from inspected evidence]
- **Unsupported / incomplete behavior:** [precise missing portions]
- **Source references:** [commit-pinned repo links and file paths]
- **Future implementation opportunities:** [possible follow-ups, not defects]
```

## 11. Cross-feature dependencies

**Part 01-authentication prerequisites identified from source.** Later business workflows remain NOT REVIEWED; these are only confirmed authentication touchpoints.

| Dependent feature ID | Prerequisite / service | Current evidence | Consequence for completeness |
|---|---|---|---|
| AUTH-001 → AUTH-002 | Verification-token mail + inactive CUSTOMER identity | [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java) | New registration cannot authenticate until verified |
| AUTH-002 → AUTH-003 | Active verified user status | [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java) | Login eligibility gates unverified registrations via isActive=false |
| AUTH-003 → AUTH-004/011 | JWT + session fingerprint + role state | [core/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/interfaces/AuthController.java); [core/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/JwtAuthFilter.java) | Web and Android depend on valid persisted session and live user state |
| AUTH-004 → AUTH-008 | Web role guard and backend role enforcement | [web/components/auth/AuthGuard.tsx](https://github.com/gimesha-adikari/bank-web/blob/012fbc6ff2687d126c67c85ce54cfc8d16f79f27/components/auth/AuthGuard.tsx); [core/src/main/java/com/bankingsystem/core/modules/common/security/SecurityConfig.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/modules/common/security/SecurityConfig.java) | Client navigation cannot substitute for Spring authorization |
| AUTH-007/008 → AUTH-005/011 | Password/role/employee state change -> revoke all sessions | [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/AuthServiceImpl.java); [core/src/main/java/com/bankingsystem/core/features/employee/application/impl/EmployeeServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/employee/application/impl/EmployeeServiceImpl.java) | Clients must reauthenticate after revocation; Android needs explicit UX |
| AUTH-009 → AUTH-010 | Current user profile + pending email reservation + mail link | [core/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/application/impl/UserServiceImpl.java); [core/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/system/application/impl/EmailServiceImpl.java) | Confirmation depends on configured link origin and valid token |
| AUTH-001/010 → Part 02 | Login user identity precedes KYC/customer onboarding | [core/src/main/java/com/bankingsystem/core/features/auth/domain/User.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/auth/domain/User.java); [core/src/main/resources/db/migration/V1__baseline.sql](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/resources/db/migration/V1__baseline.sql) | User creation is not equivalent to customer or KYC completion (not reviewed here) |
| AUTH-008 → Parts 09 and 11 | Manager Teller and Admin role changes | [core/src/main/java/com/bankingsystem/core/features/accesscontrol/application/impl/AccessControlServiceImpl.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/accesscontrol/application/impl/AccessControlServiceImpl.java) | Business workflows not reviewed; auth impact is session revocation |
| AUTH-015 → Part 02/15 | Core-to-FastAPI shared credential | [core/src/main/java/com/bankingsystem/core/features/kyc/integration/MlWebClientConfig.java](https://github.com/gimesha-adikari/bank-core/blob/9f58e595a653db9d8aa59b70a35af8e2b0e725d3/src/main/java/com/bankingsystem/core/features/kyc/integration/MlWebClientConfig.java); [service/app/core/internal_auth.py](https://github.com/gimesha-adikari/bank-service/blob/cabdd323b4aa394910cb192ead6d233e9a12d9d3/app/core/internal_auth.py) | Only service authentication reviewed; KYC workflow deferred |

## 12. Future implementation candidates

**Part 01 candidates based on traced auth implementation.** Ideas only; no work authorized. Do not implement these during review or treat an opportunity as a proven defect.

| Candidate | Related feature ID | Evidence for opportunity | Priority / decision |
|---|---|---|---|
| Native Android email-verification, resend and reset completion | AUTH-001, AUTH-002, AUTH-006 | Android AuthApi / screens lack verification/resend and reset-completion flows despite web support | Undecided |
| Align Android password-change reauthentication | AUTH-007, AUTH-011 | Core revokes all sessions on change while Android profile retains success state until a later 401 | Undecided |
| Standardize verified email-change link target | AUTH-009 | Email-change mail uses app.baseUrl; web result BFF expects its own origin | Undecided |
| Define intentional refresh/session-expiry experience | AUTH-004, AUTH-013 | Web blocks backend rotation; backend session expires at two hours and Android does not rotate | Undecided |
| Active-device/session listing and selective revocation | AUTH-005, AUTH-011 | Persisted sessions exist without user session-management UI/API | Undecided |
| Decide on secure multi-factor authentication separately from app lock | AUTH-012 | Android local PIN/biometric gate does not protect Spring API with MFA | Undecided |
| Assess distributed login-throttling operation | AUTH-016 | Limiter is in-process Caffeine buckets rather than shared across nodes | Undecided |
| Confirm per-channel username-change and recheck requirements | AUTH-014, AUTH-017 | Android change flow submits currentPassword but updateProfile does not evaluate it; web has no editor | Undecided |
| Core–FastAPI internal-identity lifecycle | AUTH-015 | Static shared secret authenticates KYC service requests without managed rotation workflow | Undecided |

## 13. Known evidence limitations

- Part 00 inspected GitHub repository metadata, the default-branch refs, three known commits and root-level directories **only**.
- No frontend-to-backend workflow tracing, test inspection, API verification or live-stack acceptance was performed during Part 00.
- Matching the named local commits to GitHub main does not establish the absence of subsequent unpublished changes.
- No expected local commit was provided for bank-app, so local-vs-GitHub parity for the Android app is unknown.
- Future parts should provide source links pinned to inspected commits, distinguish documentation from independent verification, and disclose relevant access or version gaps.

- Part 01 inspected GitHub source only at the four pinned SHAs above, including web BFF, Spring security/services/entities, Android auth/storage/lock, and FastAPI internal authorization. No code was executed, no credentials tested, and no commits modified application sources.
- The committed Playwright tests run a mock core via `e2e/mock-bank-core.mjs`; they do not establish a real Spring/MySQL/Mailpit workflow. The Spring integration and unit tests were read as code, not executed in this review.
- No historical F1–F8 real-stack reports were found as readable evidence within the four GitHub trees. Their contents may exist outside these repositories; none were used to claim live verification.
- Android device/emulator runtime and email SMTP delivery were not observed. Hence all Part 01 evidence confidence is Source-confirmed and no Level 5 is asserted.
- Config-dependent email-change link destination and cross-platform difference in password-change sign-out are identified as completeness boundaries, not established live defects.
- Features not found in inspected source (MFA, social login, device-session management, etc.) are catalogued only as unsupported possibilities, not falsely scored as implemented.

## 14. Final planning summary

**Reserved for Part 16.** Synthesize evidenced feature coverage, actual supported workflows, incomplete and deferred functions, dependencies, future development options and explicit limitations. Do not prefill it from conversation summaries.

## 15. Review-document change log

| Date | Part | Change | GitHub ref |
|---|---|---|---|
| 2026-11-23 | 00 | Established canonical 17-part review framework, repository inventory, source-freshness verification, classifications, tracker, standard record template and empty future-review sections. No feature assessments. | `docs/feature-completeness-review` (this documentation branch) |
| 2026-11-23 | 01 | Source-reviewed 17 authentication/identity capabilities across four pinned repositories; added individual records, master inventory, dependencies, planning candidates and verification limitations; no live-stack claims. | `docs/feature-completeness-review` (this documentation branch) |

---

**Next review:** Part 02 — Customer KYC and onboarding, only in a separate ChatGPT conversation when specifically requested. **Do not start Part 02 automatically.**

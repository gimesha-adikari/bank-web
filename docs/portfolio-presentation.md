# Banking Platform portfolio copy

## Headline

**Banking Platform — internal payments backed by a double-entry ledger**

I built a role-based banking web app where customers can open an account, send an internal LKR payment, and recover its committed receipt after a network interruption. The same system gives Tellers a customer and account workspace, Managers a Teller lifecycle, and Admins KYC and access-management tools. The web app runs through a Next.js BFF, with Spring Boot enforcing authorization and owning every ledger write.

[Current portfolio entry](https://www.gimesha.com/projects/banking-platform) · [Screenshot gallery](screenshots.md) · [Architecture](architecture.md)

## Product walkthrough by role

| Role | What the application supports |
| --- | --- |
| **Customer** | Register and verify email, manage the profile and password, upload KYC documents, complete onboarding after approval, open accounts, and view balances and history. Deposit, withdraw, transfer, or use Pay with a reviewed recipient and a committed receipt. |
| **Teller** | Search, inspect, create and edit customer records. Open an account for the linked customer login. Inspect account history and close only accounts that pass the exact-zero balance check. |
| **Manager** | Use the shared staff workspace and manage Teller assignments for eligible users. Supported changes revoke affected sessions and require the user to sign in again. |
| **Admin** | Review KYC queues and evidence, record supported decisions, and manage roles through the Users and Employees directories. Delete eligible customer records subject to backend dependency checks. |

## How the system fits together

**Next.js and React** provide the web UI and same-origin BFF. The browser sends session cookies and a CSRF header for mutations. The BFF reads the HttpOnly session and sends the Bearer token to **Spring Boot**. Core checks ownership, roles, and session status. It persists account and ledger changes in **MySQL**, using **Flyway** for schema changes.

**FastAPI** supplies identity checks to Core over a separate authenticated connection. Core retains responsibility for KYC cases and supported Admin decisions. **Mailpit** captures verification and reset email during local development. A separately versioned Android client also exists. This case study covers the web workflows and their server dependencies.

## Engineering challenges

| Challenge | What I implemented |
| --- | --- |
| Prevent duplicate posting when the network fails | Pay reuses the transfer engine. Each logical request carries an idempotency key scoped to the payer. Core commits both account balance changes, the balanced journal, history rows, and the receipt together. |
| Distinguish a missing response from a failed payment | The UI first reads the receipt with the original key. A temporary 404 indicates that no receipt is visible yet. A later recheck can recover the original receipt without posting again. A deliberate retry retains the original key and request. |
| Preserve exact amounts across the stack | The web app sends decimal strings and preserves exact server amounts. Core uses Java `BigDecimal` and MySQL `DECIMAL`. The receipt shows the amount and payer balance recorded at posting. |
| Change permissions during an active session | Core revokes affected sessions transactionally for supported role and staff changes. A subsequent revoked request returns 401 and the web session ends. Valid sessions with insufficient permission receive 403. |
| Prevent unsupported operations at the boundary | Account closure checks both stored and ledger balances under lock. KYC files are protected by case ownership or Admin access. The reversal UI remains blocked until an Admin can select and verify an authoritative journal entry. |

## Testing and evidence

| Verification | What it established |
| --- | --- |
| **F1 real stack** · web `4ff1880`, core `9f58e59`, service `cabdd32` | Chromium exercised the production Next.js build with local Spring, MySQL 8.4.11, Mailpit, and the portable KYC service. F1 observed verification email, Admin KYC approval, account opening, exact ledger postings, receipt lookup after timeouts, ownership and CSRF rejection, and session revocation. Core's main suite recorded 404 passed and one conditional skip. A separate KYC contract run against the service passed all three fixtures. |
| **F2 live follow-up** · web `47a69f0` | Corrected the two F1 UI failures. Manager and Admin guidance now matches session revocation, and the Admin editor accepts a former Teller with an inactive, unlinked employee record while protecting links to other users. |
| **F3 real-stack UX audit** · web `47a69f0` | Audited the role workspaces. An LKR 25.75 payment produced one debit and one credit of the same amount. A delayed LKR 2.35 payment stayed unresolved on the initial receipt 404 and was recovered by rechecking. |
| **F4/F5 web verification** · web `9f03a28` and `bee0143` | Verified the home contrast, mobile staff directory, Admin KYC entry, keyboard tabs, and narrow role editor. The F5 suite passed 382 unit tests, 128 mock-backed Chromium tests, lint, typecheck, and the production build. The browser suite used the real Next.js BFF with mock bank-core. |

The local evidence covers tested workflows and failure cases. PayHere is disabled by default. External payment settlement, production security certification, and model-backed KYC accuracy are outside the tested scope. The Admin journal reversal UI awaits an authorized lookup and readback contract. Recovery details remain in memory on the open payment page.

## Demo walkthrough

Use the [local synthetic setup](local-development.md). Prepare separate browser contexts for Customer, Teller, Manager, and Admin. Set up two approved customers with active LKR accounts, fund the payer through a supported opening deposit, and keep a third synthetic applicant ready for KYC. Prepare an eligible existing login for Teller assignment and a separate user for the Admin role change. Keep passwords, cookies, and email verification links off screen.

| Segment | What to show |
| --- | --- |
| **1. Introduce the product** · 20 seconds | Open the public home page. Explain the four roles and show the Browser → Next.js BFF → Spring Boot → MySQL path. Explain that the demo uses synthetic internal LKR transfers. |
| **2. Send an internal Pay** · 60 seconds | Sign in as the payer. In Pay, explicitly select the funded account. Enter the recipient account UUID from its history and a small test amount. Review, confirm, and show the payment reference, journal UUID, payer balance, and matching history. |
| **3. Recover a receipt** · 45 seconds | Explain how a timeout can hide a commit. In a controlled loopback harness, delay the transfer response after commit and let receipt reads through. To show a temporary 404, delay forwarding the original transfer instead so the first lookup reaches Core before the write. Keep the tab open, recheck with the original key, and show the committed receipt without sending a new payment. |
| **4. Show KYC and approval** · 60 seconds | Switch to the synthetic applicant, show the four upload types and case status, then use Admin's **Review KYC** action. Inspect a watermarked sample and the checks. Approve an eligible case and refresh the customer's onboarding screen. |
| **5. Show the staff workspace** · 45 seconds | Find a customer as Teller and distinguish the customer record UUID from the linked user UUID used for assisted opening. Show account history and the closure rule on a funded and a zero-balance fixture. |
| **6. Change a Teller assignment** · 45 seconds | Use the Manager directory to assign an eligible login, show the resulting role, and remove the assignment. Demonstrate this on the dedicated test login. |
| **7. Show Admin access and session revocation** · 45 seconds | Navigate Users and Employees by keyboard. Review and confirm a role change for the separate synthetic user. In that user's existing context, request a protected page and show the sign-in prompt. Sign in again to show the current role. |
| **8. Close with evidence** · 30 seconds | Return to the architecture and show the evidence for the balanced journal, same-key replay, receipt recovery, and role revocation. Distinguish local real-stack acceptance from the mock-backed regression suite. |

Rehearse KYC and payment recovery on the disposable stack before recording. Use the documented recovery sequence or screenshots if a controlled delay is unavailable during the demo.

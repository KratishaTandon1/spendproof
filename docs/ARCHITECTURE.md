# Architecture

SpendProof separates proposal generation, purchase authority, and provider confirmation. The browser presents decisions; a Cloudflare Worker enforces the workflow and persists its state in D1.

## Authority boundaries

| Component        | Responsibility                                                                     |
| ---------------- | ---------------------------------------------------------------------------------- |
| AI planner       | Draft constraints or propose an offer with evidence from the controlled catalogue. |
| Policy evaluator | Recompute the exact amount and evaluate deterministic rules.                       |
| Human reviewer   | Approve the exact proposal, policy version, and approval period.                   |
| PayPal buyer     | Grant buyer consent within PayPal sandbox.                                         |
| Payment service  | Verify canonical provider state and update application accounting.                 |
| Report assistant | Inspect session-scoped data and edit report layout through bounded Studio tools.   |

Source quotes and tool results are treated as data. Neither a model explanation nor a browser return URL establishes payment completion. Report tools expose no payment, approval, or policy mutation operations.

## Purchase lifecycle

1. A signed browser session identifies an isolated workspace with a $150 application allowance.
2. The server records a purchase request and a manually selected or AI-generated proposal. Prices and quoted terms come from the server catalogue.
3. Evaluation records ALLOW, REVIEW, or BLOCK with individual check results. Proposal versions preserve the decision context.
4. Approval binds the proposal fingerprint, policy version, and expiry. Changes require a new review.
5. Checkout obtains a durable allowance reservation before creating an order with a persistent operation key.
6. Buyer consent is completed in PayPal. Capture is separately verified against the expected amount, currency, and payee before accounting is finalized.
7. Reconciliation reads existing provider references. Completed refunds credit the application allowance after provider confirmation.
8. Signed webhook deliveries are deduplicated and associated with their purchase evidence.

## Accounting invariants

Amounts are integer minor units. Database constraints and reservation transitions enforce:

```text
allocated = available + reserved + spent
```

A held reservation moves available allowance to reserved allowance. A verified capture moves it to spent. A completed full refund restores available allowance. Repeat notifications do not create additional financial entries.

An unknown capture outcome remains reserved until reconciled. If an order-creation or refund response is lost before its provider identifier is known, the record remains unresolved for investigation; the application does not create a replacement operation key automatically. Closing an idle checkout releases the application reservation but does not claim to cancel the PayPal order. Policy changes cannot recall a capture already in flight.

## Persistence and source layout

| Area                                                        | Location                               |
| ----------------------------------------------------------- | -------------------------------------- |
| API, provider adapters, and workflow enforcement            | `src/server/`                          |
| Policy, money calculations, analytics, and chat translation | `src/shared/`                          |
| Purchase interface and native Studio integration            | `src/ui/`                              |
| Redacted historical playback fixture                        | `src/data/recorded-run.json`           |
| Schema, accounting triggers, proposal history, and receipts | `migrations/` (versions `0001`–`0006`) |
| Handler, domain, provider, and report-tool tests            | `tests/`                               |

D1 stores workspaces, purchases, reservations, refunds, proposal versions, audit events, webhook receipts, rate limits, and report layouts. Layout editing operates on report state; it does not modify the underlying purchase rows.

## Session and service boundaries

Workspace cookies are signed, HttpOnly, SameSite Strict, and Secure over HTTPS. Session-scoped queries restrict purchase and receipt access. The API checks supplied request origins, limits request sizes, and rate-limits workspace mutations. These controls provide isolation for the prototype; they are not an enterprise identity or role-management system.

PayPal secrets, model keys, and session signing material remain on the backend. The PayPal Client ID and Studio browser licence are intentionally exposed to their client integrations. [Configuration](CONFIGURATION.md) describes these distinctions.

The proof ledger is an application record linked to provider references and verified receipts. It is not an independently certified or tamper-proof audit system.

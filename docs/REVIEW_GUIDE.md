# Evaluation guide

Use the [live application](https://spendproof.spendproof.workers.dev/) to review purchase decisions, analytical tools, and their relationship to payment evidence. All payment operations use PayPal sandbox.

## Recorded provider walkthrough

Open [Recorded example](https://spendproof.spendproof.workers.dev/?view=replay). The eleven-step playback follows an earlier hosted run: a blocked monthly proposal, an allowed AI alternative, exact approval, a $54 capture, a full refund, and repeated signed notifications.

At the refund step, the recorded totals are **$54 captured, $54 refunded, and $0 net**. Playback is labelled throughout, makes no provider calls, and does not change the current workspace. The redacted source record is in [recorded-run.json](../src/data/recorded-run.json).

## Interactive decision review

1. Create a request for three design licences, a $60 maximum, and one-time billing.
2. Check **Studio Plus** manually. Its $36 monthly proposal is BLOCK because recurring billing violates the request.
3. Check **Studio Pro**. The $75 total exceeds the cap.
4. Use **Find a fit with AI**, or select **Studio Kit** manually. Three licences total $54. Manual proposals remain explicitly labelled.
5. Inspect failed checks, passed-check evidence, source quotes, and proposal history. ALLOW means the current proposal is eligible for approval, not that payment occurred.
6. Approve the exact proposal if evaluating approval behavior. Approval itself creates no order; checkout is a separate action.

## Reports, scenarios, and evidence

From **Overview → Explore in Studio**, run **Explain my decisions** or **Explore rule failures**. The assistant can inspect records, add native tables and charts, and arrange widgets. Save the layout, reopen it, and use a table's proof column to inspect its purchase. A provider error does not establish that a requested edit succeeded.

Review the scenario lab's nine policy fixtures and five separately labelled recovery simulations. Compare recurring base costs with a one-time offer, noting the projection assumptions. In Policies, preview a $50 cap and inspect how a $54 proposal changes without editing the active policy or historical record.

The proof ledger connects the request, decision, approval, payment state, and verified receipts. Inspect the redacted JSON export and print view. A workspace without a completed payment should not present its proposal as payment proof.

## Optional sandbox buyer test

Use a configured sandbox Business merchant and a separate sandbox Personal buyer. The operator enters buyer credentials directly on PayPal.

From an approved proposal, prepare checkout and continue to PayPal. If embedded initialization times out, choose **Use hosted sandbox checkout**. Confirm the merchant, USD currency, and $54 total before granting buyer consent. Return to SpendProof and choose **Verify approval and complete**; renew an expired, unchanged approval explicitly if necessary.

Verify the canonical capture, refresh and reconcile the same provider references, then explicitly request and confirm a full refund. The allowance should be restored only after PayPal confirms completion. Signed repeat deliveries should increase receipt delivery counts without adding another payment or refund. Investigate unresolved outcomes before creating another operation.

## Suggested demonstration sequence

| Time      | Focus                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| 0:00–0:20 | Purchase brief and the difference between sticker price and commitment.           |
| 0:20–0:55 | Blocked subscription, AI alternative, and source-backed checks.                   |
| 0:55–1:20 | Proposal history and exact approval.                                              |
| 1:20–1:55 | Previously recorded sandbox buyer consent and verified capture, clearly labelled. |
| 1:55–2:30 | Native Studio analysis and a saved report change.                                 |
| 2:30–2:50 | Connected proof, one recovery example, and verified refund evidence.              |

Identify recorded payment evidence, live AI responses, manual proposals, and simulations explicitly. These demonstrate different parts of the implementation.

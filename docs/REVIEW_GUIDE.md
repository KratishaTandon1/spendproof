# SpendProof review journey

## Review without opening PayPal

Start with **Recorded example** (or `/?view=replay`) for an eleven-step walkthrough of the actual hosted run. It includes the blocked monthly proposal, allowed AI alternative, exact approval, $54 capture, full refund and repeated signed notifications. The recording is clearly labelled, makes no provider calls and never changes the current workspace. Its references can be inspected after any step; the final figures restore the $150 application allowance.

1. Create a purchase request for three design licences under $60, one-time only.
2. Select Studio Plus and check it manually. The $36 proposal is blocked because it renews monthly.
3. Select Studio Pro. Its $75 total exceeds the spending cap.
4. Use **Find a fit with AI**, or select Studio Kit manually. The latter is explicitly labelled manual. Three licences cost $54.
5. Inspect each policy reason and its source quote. Open **The proposal story** to compare versions and inspect an earlier recorded evaluation.
6. Approve the exact $54 proposal. Stop here to avoid loading or opening PayPal. Approval does not create an order or make a payment.
7. Open the proof ledger and export the record. It includes recorded proposal versions and approval evidence, with no payment-completion claim.
8. Open Overview → Explore in Studio. Use **Explore rule failures** to create a count chart and rule-check table. Select a chart category to filter related rows; include the `proof` column in a grid to open its purchase. Ask the assistant to inspect and arrange the widgets, then save the report. Unsaved edits can be discarded. The assistant requires the configured model's free quota; quota errors do not prove a report edit succeeded.
9. Run the scenario lab. ALLOW, BLOCK, and missing-terms REVIEW cases use labelled fixtures and make no payments. Its separate **Local simulation** section illustrates five recovery controls; these model traces are distinguished from actual handler tests and the recorded payment.
10. Compare one-time and monthly base prices over 1–24 months in a purchase workspace. The projection states its assumptions and does not claim realized savings.
11. In Policies, change the preview cap to $50. A $54 proposal should become BLOCK in the preview while the active policy, historical decisions and allowance remain unchanged.
12. In Proof ledger, expand the connected evidence stages and notification receipts. **Print proof** uses a print-specific audit layout; **Export** returns a redacted JSON record.

## Owner-run sandbox test, when ready

Use the sandbox business merchant's REST app, and approve as a different sandbox personal buyer. Credentials are entered privately by the owner on PayPal's page. These steps are never run automatically by the project.

1. From an approved proposal, choose **Prepare sandbox checkout**, then **Continue with PayPal**. If the embedded SDK times out, choose **Use hosted sandbox checkout**, then **Open PayPal sandbox approval**. The hosted flow opens a separate tab and inherits the browser window's incognito mode.
2. Verify the merchant, USD currency and $54 total in the sandbox buyer flow. Approve there.
3. For hosted checkout, return to the purchase and choose **Verify approval and complete**. If approval expired during login, explicitly renew the same exact approval first. Confirm that verified capture moves $54 from reserved to spent once.
4. Refresh the app and reconcile. Confirm the same order and capture references remain, without another payment.
5. Request and explicitly confirm a full refund. The allowance should return only after PayPal confirms completion.
6. Try closing a separate idle checkout. Confirm its reservation is released and it remains distinct from a paid record.
7. After HTTPS deployment, test genuine signed webhook delivery, a duplicate delivery, and processing recovery after a transient provider failure.

Capture or refund results that remain unknown are not a successful demo outcome. Preserve their records, reconcile known references, and investigate missing references without starting another payment operation.

## Three-minute demo outline

| Time      | Evidence                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------ |
| 0:00–0:20 | The problem: an agent's cheap-looking proposal can hide a subscription or exceed a limit.              |
| 0:20–0:55 | Brief → blocked subscription → AI alternative → source-backed server checks.                           |
| 0:55–1:20 | Version comparison and exact approval. Explain that AI cannot change the rules or approve itself.      |
| 1:20–1:55 | Owner-recorded real sandbox buyer approval and verified capture. Show actual order/capture references. |
| 1:55–2:30 | AG Studio custom widgets and a live dashboard-agent report change.                                     |
| 2:30–2:55 | Proof export, one recovery case, and a verified refund if time allows.                                 |

Use visible **recorded** labels for earlier runs. Never present a simulated provider response, policy fixture, or manual proposal as a live payment or live AI result.

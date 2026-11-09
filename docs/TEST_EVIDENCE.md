# Test evidence

Recorded on 1 November 2026. Local application at `http://127.0.0.1:5173/`, API at `http://127.0.0.1:8787/`, Chrome incognito. External payment calls used PayPal sandbox only.

## Actual provider verification

The purchase **US sandbox payment verification** used an actual Groq AI proposal for three Studio Kit licences at $18 each. Server checks allowed the $54 total within the $60 request limit. The exact proposal was approved before the application created the sandbox order.

| Check                      | Observed result                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| AI planning                | Actual model response; source evidence and totals validated by the server                                |
| Hosted PayPal checkout     | Sandbox buyer review and return to SpendProof succeeded                                                  |
| Capture                    | Explicit **Verify approval and complete** action produced a verified $54 capture                         |
| Reconciliation             | Existing capture confirmed without a second payment event                                                |
| Persistence                | Reload retained the paid state                                                                           |
| Full refund                | Explicit confirmation produced a completed $54 refund                                                    |
| Application allowance      | $150 available, $0 spent, $0 reserved after refund                                                       |
| Proof export endpoint      | Valid redacted JSON with one payment event and one refund event                                          |
| Native AG Studio assistant | Actual AI read workspace data, created a four-column grid, and saved it; reload rendered the correct row |
| AG Studio licence          | Vendor validator accepted an AG Studio Pro with AI trial, not expired, with expiry on 16 December 2026   |

Sandbox references, retained to make the test traceable:

- Purchase: `840e89a6-7825-4860-b24f-f4950bb2d924`
- Order: `7FG63476P4288551D`
- Capture: `9PC19134RE773932A` at `2026-11-01T06:22:16.780Z`
- Refund: `51C82618GV4444820` at `2026-11-01T06:24:10.857Z`

The completed capture and refund used simulated funds. The initial India sandbox merchant rejected USD; the completed cycle used a US sandbox merchant app, without changing the owner's real PayPal account country.

Local evidence is stored in ignored `test-results/`: `sandbox-capture-verified.png`, `sandbox-refund-verified.png`, `paypal-live-proof.json`, and `studio-license-check.json`. These files contain sandbox references, application audit data, and licence validation metadata, not API secrets, licence keys, or buyer passwords. The audit is an application record, not external certification.

After restarting the API with the accepted Studio key, the incognito dashboard rendered its saved report, the incompatible-licence notice disappeared, and no new licence warnings were logged. `studio-licence-verified.png` records this browser state.

## Automated and policy checks

- 48 Node tests exercise real handlers and SQLite migrations with explicitly simulated external provider responses.
- Twelve Python tests cover the private configuration wizard, atomic credential updates, deployment target checks, credential selection, output redaction, and cleanup of temporary deployment secrets.
- Fourteen local HTTP checks cover isolation, input validation, policy decisions, and other application behaviour without external provider calls.
- Nine browser scenario fixtures passed for allowed, blocked, and review decisions.

Automated tests complement the actual provider cycle above; mocked responses alone do not establish a completed payment.

## Hosted provider cycle

The published baseline at <https://spendproof.spendproof.workers.dev/> completed a separate actual cycle on 1 November 2026. Its purchase **Hosted sandbox and webhook verification** used an actual AI proposal for three Studio Kit licences, with a $54 capture and full refund.

- Purchase: `2ac2e11a-64f9-4ed2-b20d-0ab17b851298`
- Order: `9HA6735921320153E`
- Capture: `1C7766410J529832S` at `2026-11-01T09:08:37Z`
- Refund: `3G6248067G379515N` at `2026-11-01T09:09:49Z`
- Actual capture event: `WH-4RE71878CM877720E-031123918D465564K`
- Actual refund event: `WH-6X51711496146410J-20K764474K124860K`

PayPal signature verification succeeded for both event types. Each received event was resent through PayPal's sandbox API; after delivery counting was added, D1 recorded two deliveries per event and processed each event once. Financial records still contained one payment and one refund, with $150 available, $0 reserved and $0 net spent. A native Studio report also saved and reloaded over HTTPS.

Ignored evidence artifacts include `hosted-capture-verified.png`, `hosted-studio-verified.png`, `hosted-paypal-proof.json`, `hosted-webhook-resend.json`, and `hosted-ledger-check.json`. The public-source replay snapshot is a selected, redacted record of this earlier run. It contains sandbox transaction references and fictional purchase data, with no credentials, private operation keys or live approval URLs.

## Local feature upgrade checks

The upgrades and migration `0006` are local only; the published baseline has not been updated during this feature work.

- The policy preview changed two recorded $54 ALLOW outcomes to BLOCK with a hypothetical $50 cap, while the active policy stayed at $60 and version 1.
- A six-month projection showed $216 for three recurring licences versus a $54 one-time base charge; unknown billing terms remained unprojected.
- The eleven-step recorded example showed $54 gross after capture, $54 refunded and $0 net after refund, with the original transaction references and final $150 allowance. Next, previous and restart controls were exercised.
- All five recovery-model cases rendered their expected traces in Chrome incognito. These are labelled local simulations, with no provider calls or live financial mutations.
- The actual native Studio assistant inspected failed checks and created a count chart and evidence table. A later request encountered the free model's quota limit; the UI displayed the provider error rather than claiming a completed edit.
- A fresh, focused conversation successfully inspected the report layout and atomically arranged the chart and table side by side. Save and reload retained the new visuals; hiding and reopening Studio retained the latest saved report. A native grid's proof button opened the correct purchase audit. Duplicating then discarding a widget removed the unsaved duplicate.
- The proof ledger rendered all six evidence stages and distinguished the local record's verified canonical capture/refund from its absent linked notifications. Signed notification details are covered by handler and export tests; no live receipts were fabricated for this local workspace.
- The automated suite covers purchase-scoped receipt visibility, cross-workspace isolation, JSON receipt export, pending-capture exclusion, exact-cent projections, preview immutability, summary totals, native chart filters and atomic layout changes.

## UI refinement verification — 9 November 2026

The local UI now has a next-action overview, explicit purchase progress, grouped navigation, compact recorded playback, and a shared theme applied through AG Studio's native theme API. Failed or unknown checks appear first; passed checks and their source evidence remain expandable. Setup instructions are collapsed under connection details, and stale webhook setup wording was removed.

Chrome incognito checks covered:

- A fresh workspace and request dialog; a manually checked subscription was BLOCK, followed by a $54 one-time proposal that was ALLOW. The refinement did not create or capture a PayPal order.
- Expanding all eight passed checks on the blocked proposal, then seeing nine passed checks and the exact approval control on the allowed proposal. Manual results remained labelled manual.
- Dynamic overview actions, purchase navigation, search, a distinct no-matches state, and clearing the search to restore the purchase row.
- Phone viewports at 390 and 360 pixels and a tablet viewport at 820 pixels. The checked overview, purchase, policy, proof, scenario, recorded-example and connection screens stayed within the page width. The mobile drawer opened, closed on navigation and Escape, and returned focus appropriately.
- The native AG Studio theme rendered the custom widgets and assistant. The starter comparison widget's full content fit without an internal scrollbar. Saving, hiding and reopening the report retained its state.
- At 390 pixels, the advanced report editor used a contained 700-pixel scrollable canvas inside a 352-pixel surface; the page remained 390 pixels wide. The UI explains this horizontal canvas interaction.

The 48 application tests passed again. Screenshots are saved in ignored `test-results/` with the `ui-refinement-` prefix. These changes are local and have not been deployed.

## Windows handoff — 9 November 2026

The source package includes a portable Node local launcher, an explicit-filename test runner that avoids Windows shell glob expansion, a `START-WINDOWS.cmd` wrapper, and a Windows 11 guide for the existing Cloudflare deployment. Source packaging uses an allowlist, excludes private/local/runtime files, rejects embedded configured credential values and symlinks, and writes per-file and whole-ZIP SHA-256 checksums.

The portable command ran all 48 application tests successfully. All 16 Python checks passed, including four archive tests for local-data exclusion, embedded-secret rejection, hidden-file rejection and symlink exclusion. The Node launcher passed its no-I/O dependency/path check. Windows native execution remains the receiving PC's first verification step; no GitHub push or remote deployment was performed while preparing the handoff.

## Remaining verification and submission gates

- Deploy the local upgrades and apply migration `0006` when the owner resumes deployment. Existing historical receipts receive purchase links on a genuine verified redelivery; no historical proof is fabricated by migration.
- Check browser print preview and exported PDF pagination on the owner's machine; print-specific styles and expandable-evidence handling are implemented, but a final printed PDF has not been inspected.
- Keep the accepted AG Studio Pro with AI trial valid through judging. Its verified expiry is 16 December 2026; the published judging period ends 15 December 2026 at 08:00 Pacific Time.
- Verify hosted access and free provider quotas remain available through judging.
- Publish the source with its licence and prepare the required public demo video and submission.

The embedded PayPal v6 SDK stalled in the tested incognito session; the hosted sandbox checkout path completed the cycle. Chrome's automated download observer timed out, so automatic file saving through the browser is not claimed as verified. The export response was inspected as JSON and saved separately as the local evidence artifact.

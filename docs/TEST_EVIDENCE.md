# Verification record

**Status date: 9 November 2026.** This record distinguishes automated tests, actual provider interactions, and recorded playback. The public deployment includes the refined UI, migration `0006`, and the report-assistant reliability update.

## Automated verification

| Check                           | Result and scope                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application tests               | **52 passed.** Domain logic, actual HTTP handlers, SQLite migrations, provider error handling, and report tools; external provider responses are simulated. |
| Setup and packaging tests       | **16 passed.** Private setup, atomic updates, deployment target checks, credential selection/redaction, archive exclusions, and integrity safeguards.       |
| TypeScript and production build | Passed for the application and the source audited from the public repository.                                                                               |
| Cloudflare deployment dry run   | Passed; Worker bundling and static-asset configuration checked without publication.                                                                         |
| Local HTTP smoke suite          | Fourteen checks previously passed for isolation, input validation, decision rules, report persistence, and allowance behavior without provider calls.       |

Reproduce the main checks from the repository root:

```sh
npm ci
npm test
npm run typecheck
npm run build
python3 -m unittest discover -s tests -p 'test_*.py'
```

With the local application running, `python3 scripts/test_http.py` runs the separate HTTP smoke suite. Windows commands are documented in [the Windows guide](../START-HERE-WINDOWS.md).

## Actual provider verification

On **1 November 2026**, local and hosted sandbox cycles completed with actual Groq proposals and PayPal sandbox responses. The hosted cycle verified a $54 capture, reconciliation without a duplicate capture, persistence after reload, and a completed $54 full refund. Accounting returned to $150 available, $0 reserved, and $0 net spent.

Capture and refund webhook signatures were verified. Repeated delivery retained one financial entry for each operation while increasing notification delivery counts. A native Studio report was also saved and reloaded over HTTPS.

The [public replay fixture](../src/data/recorded-run.json) retains selected, redacted references from that hosted run. Playback presents those historical events; it is not a new payment or independent certification. Private evidence artifacts remain outside the public source tree.

## Deployment and browser verification

The maintainer completed the Windows 11 build, remote migration, and deployment on **9 November 2026**. Subsequent Chrome Incognito checks directly verified the public dashboard, a live $54 AI proposal with nine passing checks, Studio rendering, capture/refund playback, and a successful live **Explain my decisions** response after the report-assistant update.

Local responsive checks covered 360- and 390-pixel phone viewports and an 820-pixel tablet viewport. Navigation, focus handling, search states, decision evidence, and the Studio theme were exercised. The wide report canvas remains contained within a horizontal scroll surface on phones.

Additional local checks exercised policy previews, recurring-cost assumptions, native report charts and cross-filtering, layout arrangement, save/reload, proof drilldown, and recovery simulations. These checks do not represent additional provider payments.

## Coverage limits

Automated provider simulations do not establish live transaction completion. Actual sandbox completion was verified separately as described above. No real-money payment or fulfilment was tested.

The embedded PayPal SDK stalled in an evaluated Incognito session; hosted sandbox checkout completed the tested buyer flow. The export response was inspected as redacted JSON; automated browser download observation was inconclusive. Final exported-PDF pagination has not been visually verified.

Free service quota and Studio licence coverage must remain available for later review. An isolated browser session may have no live purchase history even though the recorded walkthrough contains earlier verified evidence.

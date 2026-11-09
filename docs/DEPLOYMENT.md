# Hosted sandbox demo

The deployment uses a Cloudflare Worker, static assets, one D1 database, and a `workers.dev` HTTPS address. Keep the account on Workers Free. Creating this deployment does not require a domain purchase. Free quotas can interrupt service; they are not a promise of unlimited availability. Check current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Local development continues to use `wrangler.jsonc`. Hosted deployment uses **`wrangler.production.json`** so its real database ID does not replace the local database configuration or its saved test records. All payment endpoints remain PayPal sandbox endpoints.

For the planned move to Windows 11, follow [the Windows handoff](../START-HERE-WINDOWS.md). Its normal Wrangler code-deploy path reuses the existing Worker secrets and database without exporting credentials to the new PC. The Python hosting helper below remains available for the original environment.

The baseline is already published at <https://spendproof.spendproof.workers.dev/>. Its real D1 database, AI connection, Studio licence, sandbox payments and signed webhook retries passed on 1 November 2026. The latest feature upgrades and migration `0006` are local only. Do not publish them until the owner resumes deployment. The account and database instructions below document setup; an update should reuse the existing resources.

## Account and database

1. Create and verify a Cloudflare account. The owner completes password, email verification, and account terms privately.
2. Authenticate the installed Wrangler CLI. `npx wrangler login --device --browser=false --scopes account:read user:read workers_scripts:write d1:write` supports completing authorization on another PC. Review the permissions on Cloudflare; the CLI receives and stores the token without displaying it.
3. Create one D1 database using `npx wrangler d1 create spendproof-db`. Record the account ID and returned database ID in `wrangler.production.json`. These IDs are configuration, not API secrets.
4. Apply the schema to that new database:

```sh
npx wrangler d1 migrations apply spendproof-db --remote --config wrangler.production.json
```

## Check and publish

Run private setup first if `.dev.vars` does not exist. It must contain the owner's sandbox app, Groq key, valid AG Studio Pro with AI licence, and generated session secret.

```sh
python3 scripts/host.py
python3 scripts/host.py --dry-run
```

The first command checks configuration without uploading. The dry run builds the current source and bundles the Worker without publishing. Both reject the placeholder account or database ID.

After reviewing the demo and its target account, publish explicitly:

```sh
python3 scripts/host.py --publish
```

This uploads the app and an allowlist of service credentials into Cloudflare Worker secrets. Credentials are never placed in command-line arguments or public source. A temporary owner-readable JSON file is removed after the command. The script prints secret names, hides known values in command output, and does not upload other local configuration. It does not purchase or upgrade a plan.

Verify `/api/health`, create an isolated purchase, and test actual AI planning and the saved Studio report over HTTPS. A fresh hosted workspace starts with its own $150 application allowance; local payment proof is not imported as a new hosted payment.

## Actual PayPal webhook delivery

1. Register `https://<your-worker-address>/api/webhooks/paypal` on the same **sandbox REST app**. `python3 scripts/register_webhook.py --url https://<your-worker-address>/api/webhooks/paypal --register` creates or reuses this listener, subscribes to capture-completed, capture-pending and capture-refunded events, and saves its ID privately. It never creates a payment.
2. If registering manually in PayPal Developer, add its webhook ID privately with `python3 scripts/configure.py`. Press Enter to retain other fields.
3. Run `python3 scripts/host.py --upload-webhook` to update only that identifier on the existing hosted Worker. This does not resend the provider credentials.
4. Complete an actual hosted sandbox capture and refund. Verify canonical provider state, signed webhook processing, and the allowance totals.
5. Resend a received event through PayPal's sandbox webhook dashboard and verify that it does not duplicate payment or refund accounting. A simulator-only test does not establish real-event delivery.

Keep the site, AI free quota, and licence available through judging. The trial verified on 1 November 2026 expires on 16 December 2026. Publish the source and demo video separately; hosting alone does not submit a Devpost entry.

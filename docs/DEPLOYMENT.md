# Deployment

The public application runs at [spendproof.spendproof.workers.dev](https://spendproof.spendproof.workers.dev/) on Cloudflare Workers with static assets and a D1 database. The latest UI and report-assistant fix are deployed. Migrations `0001` through `0006` are applied to the maintained database as of **9 November 2026**.

The commands below maintain that existing instance. The repository's resource IDs identify its deployment; authorization still requires the owning Cloudflare account. For an independent instance, use the separate setup notes below.

On Windows PowerShell, use `npm.cmd` and `npx.cmd`. Other supported shells can use `npm` and `npx`. Install from the lockfile before running Wrangler so the project uses its pinned toolchain. See [Wrangler prerequisites](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

## 1. Confirm the target

```sh
npx wrangler login --scopes account:read user:read workers_scripts:write d1:write
npx wrangler whoami
npx wrangler secret list --config wrangler.production.json
npx wrangler d1 migrations list spendproof-db --remote --config wrangler.production.json
```

Check the account against `wrangler.production.json`. The maintained Worker is `spendproof`; its database is `spendproof-db`. All required service settings are listed in [Configuration](CONFIGURATION.md). No pending migration is expected for the current release.

## 2. Validate the release

```sh
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run --config wrangler.production.json --autoconfig=false
```

A dry run bundles the Worker and checks its asset configuration without publishing. Resolve errors before proceeding.

## 3. Apply schema changes when required

Review genuinely pending migrations before applying them:

```sh
npx wrangler d1 migrations apply spendproof-db --remote --config wrangler.production.json
```

Migration `0006_purchase_webhook_receipts.sql` links verified notifications to purchases and adds an index. It is already applied to the maintained instance. It does not fabricate historical receipt associations; those links are populated by genuine verified deliveries. See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## 4. Publish and verify

```sh
npx wrangler deploy --config wrangler.production.json --autoconfig=false
```

Normal code deployment preserves existing Worker secrets. Updating this instance does not require exporting credentials or uploading a replacement session secret. See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

In Chrome Incognito, verify the dashboard, an allowed $54 AI proposal, Studio's **Explain my decisions** response, and the recorded capture/refund walkthrough. `/api/health` reports configuration status; it does not test every provider. A fresh browser session has its own workspace and may contain no purchases.

## Independent deployment

Authenticate to your own account, create a D1 database with `npx wrangler d1 create spendproof-db`, and update a deployment configuration with your account, database, and Worker identifiers. Apply all migrations to that new database, provision the service settings, build, inspect the dry run, and deploy using that configuration.

The optional `scripts/host.py` helper supports configuration checks, `--dry-run`, and explicit `--publish` with an allowlist of private settings. Use it only after configuring the intended account and database.

Register the HTTPS `/api/webhooks/paypal` endpoint on the matching sandbox REST app. `python3 scripts/register_webhook.py --url <HTTPS-WEBHOOK-URL> --register` creates or reuses that listener; its identifier must also be stored on the Worker. `python3 scripts/host.py --upload-webhook` updates that identifier for an existing deployment.

Keep hosting quota, AI access, and Studio licence coverage available during evaluation. The demonstrated deployment uses free service plans; provider quotas and licence terms still apply.

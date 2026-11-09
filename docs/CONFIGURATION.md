# Configuration

Local development reads private settings from `.dev.vars`. The deployed Worker uses Cloudflare secrets. Neither setup requires placing credentials in application source.

## Service settings

| Setting                | Purpose                                                     | Browser visibility                           |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `PAYPAL_CLIENT_ID`     | Sandbox REST app identifier.                                | Intentionally visible to PayPal integration. |
| `PAYPAL_CLIENT_SECRET` | Backend authentication for the sandbox merchant app.        | Backend only.                                |
| `PAYPAL_WEBHOOK_ID`    | Signature verification for the registered sandbox listener. | Backend only.                                |
| `GROQ_API_KEY`         | Purchase planning and report-assistant requests.            | Backend only.                                |
| `GROQ_MODEL`           | Model selection; current default: `qwen/qwen3.8-27b`.       | Returned as configuration metadata.          |
| `AG_STUDIO_LICENSE`    | AG Studio Pro with AI product coverage.                     | Intentionally visible to Studio.             |
| `SESSION_SECRET`       | Signing material for workspace session cookies.             | Backend only.                                |

`DB` and `ASSETS` are Wrangler bindings. Local configuration is in `wrangler.jsonc`; the maintained hosted instance uses `wrangler.production.json`.

## Private local setup

With Python 3 installed, run from the repository root:

```sh
python3 scripts/configure.py
```

On Windows, use `py -3 scripts/configure.py`. Inputs are hidden; Enter retains an existing value or skips an optional field. The wizard generates session signing material and writes the ignored `.dev.vars` file atomically. POSIX file permissions are restricted to the owner; Windows access follows the containing folder's NTFS permissions. Restart the local API after changing settings.

Targeted updates are available with `--paypal-only` and `--studio-only`. Replacing a PayPal app clears the previous app's webhook identifier. `--check` performs sandbox authentication when credentials exist; it does not establish payment completion.

## Feature availability

Manual offer checks, policy previews, scenario fixtures, and recorded playback work without provider keys. Live AI requires model access and available quota. New sandbox payments require a matching merchant Client ID and Secret; buyer consent uses a separate sandbox Personal account. Webhook verification also requires a listener registered on that same REST app.

The demonstrated USD payment cycle used a US sandbox Business merchant. Other merchant configurations must support the selected settlement currency. This application continues to enforce USD regardless of account settings.

Use an AG Studio Pro with AI licence. AG Grid or AG Charts keys alone do not cover Studio. Studio checks product coverage and expiry when analytics opens; a configured key alone does not establish validity.

## Hosted settings

For the existing deployment, check names with:

```sh
npx wrangler secret list --config wrangler.production.json
```

Routine code deployment reuses existing settings. Preserve the session signing secret when maintaining the same workspace store. For a new deployment, provision each required value using Wrangler's interactive secret prompts or the documented hosting helper. See [Deployment](DEPLOYMENT.md) and [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

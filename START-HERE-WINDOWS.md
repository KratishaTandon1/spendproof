# SpendProof — Windows 11 handoff

This package contains the latest source, UI refinement, tests, six database migrations, a portable local launcher, and the MIT licence. It is prepared for **your existing Cloudflare account, Worker and D1 database**.

The ZIP excludes API keys, licence keys, login tokens, `.dev.vars`, local databases, `node_modules`, build output and private test artifacts. The application's labelled recorded-demo fixture is included; it contains selected historical sandbox references, not credentials or a new payment.

## 1. Install the two required tools

- [Node.js](https://nodejs.org/en/download): select the latest **22.x LTS Windows installer**, or a newer supported LTS. The project requires at least Node 22.13; its verification environment uses Node 22. Node 20 is too old for this build.
- [Git for Windows](https://git-scm.com/download/win): use the normal installer options and allow Git from Command Prompt.

Wrangler currently officially supports Windows 11. Python is **optional**, needed only if you choose to run the private local configuration wizard below. No Python installation is needed for the main install/test/start/push/deploy sequence in this guide.

## 2. Extract and open the project folder

1. Transfer the ZIP to Windows and use **Extract All**. Run the project from the extracted folder, not inside the ZIP.
2. Open its `spendproof` folder. This folder must contain `package.json`, `src`, and `START-WINDOWS.cmd`.
3. Click File Explorer's address bar, type `cmd`, and press Enter. Command Prompt opens in the correct folder. The commands below also work in PowerShell; `.cmd` avoids PowerShell's npm script-policy issue without changing your security settings.

Run:

```bat
node --version
git --version
npm.cmd ci
npm.cmd test
npm.cmd run build
```

`npm ci` installs the dependencies using the included lockfile. The Mac's dependencies are deliberately not copied. Stop at an installation, test or build error and share only its error text, without keys.

### Updated package: Windows Application Control build fix

If the earlier package failed with `An Application Control policy has blocked this file` for `rollup.win32-x64-msvc.node`, extract this updated ZIP into a fresh folder and run the commands above. Vite now uses Rollup's official **WebAssembly distribution**, pinned in the lockfile, instead of that native Rollup library. `npm ci` is required; do not reuse or copy the old `node_modules` folder. Leave Windows security settings enabled.

This change addresses the reported Rollup loading error. A successful build and Wrangler dry run below are still required before deploying the updated source. See [Rollup's official migration guide](https://rollupjs.org/migration/) for its platform-independent `@rollup/wasm-node` replacement.

## 3. Optional local preview

```bat
npm.cmd start
```

Alternatively, after installing dependencies, double-click `START-WINDOWS.cmd`. Both use the same Node launcher. It applies **local** migrations, starts the API and frontend, and opens no browser or PayPal page. Press Ctrl+C in that console to stop both servers.

Open Chrome Incognito yourself and visit:

- Dashboard: <http://127.0.0.1:5173/>
- Recorded sandbox walkthrough: <http://127.0.0.1:5173/?view=replay>

A new Windows browser starts a new local workspace. Manual catalogue checks, policy previews and the recorded example work without provider keys. AI planning, native AI report assistance, the accepted Studio licence and new sandbox payments require local configuration. The existing hosted app already has its own service secrets; this local setup is not required just to update it.

If you want the full provider integrations **locally**, install Python 3 from [python.org](https://www.python.org/downloads/windows/), then run:

```bat
py -3 scripts\configure.py
```

Enter your saved sandbox Client ID/Secret, Groq Free key and **AG Studio Pro with AI** trial licence at the hidden prompts. Use the successful **US sandbox merchant app**, not the earlier India sandbox app that rejected USD. The wizard creates `.dev.vars`, which Git ignores. Restart the local app after configuration. Enter does not display typed characters; that is expected. Leave keys out of chat, source files and the public repository.

## 4. Push the source to your GitHub account

On GitHub, create a **new public repository** named `spendproof`. Leave its README, licence and `.gitignore` options unchecked: those files already exist in this package.

In the extracted project folder:

```bat
git init -b main
git add .
git status --short
```

The staged files should be source, documentation and configuration. `.dev.vars`, `.env`, `node_modules`, `.wrangler` and `dist` must not appear. The Cloudflare account/database IDs in `wrangler.production.json` are resource identifiers, not authentication credentials.

Then run the commands below, replacing `YOUR-GITHUB-USERNAME` with your actual username:

```bat
git commit -m "Build SpendProof AI purchase controls and payment proof"
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/spendproof.git
git push -u origin main
```

Complete GitHub's browser sign-in privately if prompted. If Git asks for an author identity, set your own name and preferred GitHub commit email **for this repository**, then retry the commit:

```bat
git config user.name "Your Name"
git config user.email "YOUR-VERIFIED-OR-GITHUB-NOREPLY-EMAIL"
```

Keep this a standalone extracted folder; do not initialize it inside another project's Git checkout. Confirm that the public repository displays the README and recognises the top-level MIT `LICENSE` file.

## 5. Connect Windows to the existing Cloudflare account

Stop the local preview first if it is still running. In the same project folder:

```bat
npx.cmd wrangler login --scopes account:read user:read workers_scripts:write d1:write
npx.cmd wrangler whoami
npx.cmd wrangler secret list --config wrangler.production.json
npx.cmd wrangler d1 migrations list spendproof-db --remote --config wrangler.production.json
```

Sign in to the **same Cloudflare account used for the currently hosted SpendProof** and review its permissions. These commands use the project-installed Wrangler version from `package-lock.json`.

The supplied production configuration points to:

- Worker: `spendproof`
- D1 database: `spendproof-db`
- Hosted address: <https://spendproof.spendproof.workers.dev/>

Reuse these resources. Do not create a replacement database, rename the Worker, or change the stored resource IDs for this update.

The secret list shows **names only**. Expected existing settings are `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `GROQ_API_KEY`, `AG_STUDIO_LICENSE`, `SESSION_SECRET`, and `PAYPAL_WEBHOOK_ID`. If a required secret is missing, resolve that before publishing. In particular, preserve the deployed session signing secret; the optional local wizard generates a separate local secret.

The recorded baseline already applied migrations `0001`–`0005`; `0006_purchase_webhook_receipts.sql` is the expected pending upgrade. If the migration list unexpectedly shows the whole schema as new, stop and check the account/database target.

## 6. Check the bundle, then deploy the update

First bundle without publishing:

```bat
npm.cmd run build
npx.cmd wrangler deploy --dry-run --config wrangler.production.json --autoconfig=false
```

When that succeeds and the target above is correct, apply the pending schema upgrade and publish:

```bat
npx.cmd wrangler d1 migrations apply spendproof-db --remote --config wrangler.production.json
npx.cmd wrangler deploy --config wrangler.production.json --autoconfig=false
```

Review and confirm Wrangler's migration prompt. Migration `0006` adds a purchase link/index for verified notifications; it does not recreate the database or erase existing purchases. Stop if the migration fails; do not continue to deployment.

This update uses the existing Worker secrets. **No `--secrets-file`, credential export, or secret re-upload is needed.** Wrangler preserves existing secret bindings during a normal code deployment. The existing PayPal sandbox webhook URL remains the same, so it does not need a new registration for this update.

## 7. Verify the public result

Open Chrome Incognito and check <https://spendproof.spendproof.workers.dev/>:

1. The refined overview and next-action card appear.
2. `/?view=replay` opens the recorded walkthrough and shows $54 captured, $54 refunded and $0 net at the refund step. This is labelled playback, not a new live payment.
3. A fresh request can block the monthly offer and allow the $54 one-time offer.
4. AI planning responds, and AG Studio renders without a licence warning. Keep report requests focused if the free AI quota is busy.
5. Report saving/reopening, purchase proof, and policy preview work.

A fresh incognito session can have an empty live workspace; earlier payment proof is not automatically shared between sessions. Existing historical webhook receipts obtain purchase links only on a genuine signature-verified redelivery. Do not manufacture new payments or receipt records to populate a screen.

The private configurations remain on Cloudflare and, if you created one, in Windows's ignored `.dev.vars`. No deployment or GitHub push is performed merely by extracting the ZIP or running the local launcher.

## 8. Submission work after deployment

Prepare the public YouTube demo under three minutes, complete the Devpost description and tool explanations, add the public repository/demo/video URLs, and submit the entry. Deployment and a GitHub push alone do not enter the hackathon. Keep the accepted AG Studio trial and free service quotas available through judging.

## Verification notes

The corrected package passed a clean dependency install, production build, 48 application tests, 16 setup/packaging tests, formatting checks and a Cloudflare deployment dry run in the current Mac environment. Vite was verified to load `@rollup/wasm-node` version `4.67.3`; the lockfile contains no native Rollup packages. The dry run published nothing.

The launcher avoids Mac shell shims, uses direct Node CLI entry points, supports paths with spaces and has a Windows process-tree shutdown path. The corrected package has not been executed on Windows here; run the install/test/build commands above as your first Windows check.

`RELEASE-MANIFEST.json` records each bundled file's SHA-256. The separate `.zip.sha256` file checks the whole ZIP. Neither contains credentials.

Official references: [Wrangler prerequisites](https://developers.cloudflare.com/workers/wrangler/install-and-update/), [Cloudflare secret preservation](https://developers.cloudflare.com/workers/configuration/secrets/), [GitHub's Windows import instructions](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github?platform=windows).

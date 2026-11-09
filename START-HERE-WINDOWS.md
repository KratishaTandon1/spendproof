# Windows 11 setup and maintenance

This guide covers the project on Windows 11 using PowerShell or Command Prompt. The public application is already deployed; local setup creates a separate development environment.

## Prerequisites

Install [Node.js](https://nodejs.org/en/download) and [Git for Windows](https://git-scm.com/download/win). The project requires Node.js 22.13 or newer and was verified with Node.js 22. Python 3 is optional for the private configuration wizard and setup/packaging tests.

The `.cmd` command names below work in PowerShell without changing its script execution policy.

## Install and verify

From a new checkout:

```powershell
git clone https://github.com/KratishaTandon1/spendproof.git
Set-Location spendproof
node --version
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Use the committed lockfile. Vite resolves Rollup to the official `@rollup/wasm-node` distribution, addressing the reported Windows native Rollup loading failure. See [Rollup's migration guide](https://rollupjs.org/migration/).

## Run locally

```powershell
npm.cmd start
```

The launcher applies local migrations and starts the API and frontend. Open [the local dashboard](http://127.0.0.1:5173/) in Chrome Incognito. Ctrl+C stops both processes. `START-WINDOWS.cmd` invokes the same launcher.

Manual decisions and recorded playback work without service credentials. To configure provider integrations locally with Python installed:

```powershell
py -3 scripts\configure.py
```

The wizard writes the ignored `.dev.vars` file. Follow [Configuration](docs/CONFIGURATION.md) for required products and account types. Existing hosted settings remain on Cloudflare and are not required just to edit source locally.

## Maintain the hosted instance

Use [the deployment runbook](docs/DEPLOYMENT.md), substituting `npm.cmd` and `npx.cmd` for its npm/npx commands. Confirm the existing account, Worker, and database before making changes. Migrations through `0006` are already applied to the maintained instance.

For a code update that introduces no new migration:

```powershell
npm.cmd test
npm.cmd run build
npx.cmd wrangler deploy --dry-run --config wrangler.production.json --autoconfig=false
npx.cmd wrangler deploy --config wrangler.production.json --autoconfig=false
```

Run each command successfully before advancing to the next.

## Review and publish documentation changes

```powershell
git diff --check
git diff --stat
git add README.md START-HERE-WINDOWS.md docs RELEASE-MANIFEST.json
git commit -m "docs: refine project and operational documentation"
git push
```

Inspect the staged changes before committing. The documentation patch also refreshes `RELEASE-MANIFEST.json` to match the updated source snapshot. Documentation changes do not require an application rebuild or Worker deployment. `.dev.vars`, `.env`, dependencies, build output, local databases, and private screenshots remain excluded by `.gitignore`.

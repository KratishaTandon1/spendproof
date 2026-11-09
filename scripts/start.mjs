import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const vite = join(root, "node_modules/vite/bin/vite.js");
const tsc = join(root, "node_modules/typescript/bin/tsc");
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
const windows = process.platform === "win32";
const children = [];
let stopping = false;

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Setup stopped (exit ${result.status ?? "unknown"}). Resolve the error above, then retry.`,
    );
}

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use or unavailable. Stop the older local server, then retry.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (windows) {
      // Stop only the process tree created by this launcher, including workerd.
      const systemRoot = process.env.SystemRoot || "C:\\Windows";
      spawnSync(
        join(systemRoot, "System32/taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true, shell: false },
      );
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already stopped. */
      }
    }
  }
  process.exit(code);
}

try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw new Error("Install Node.js 22.13 or newer, then retry.");
  if (![wrangler, vite, tsc].every(existsSync))
    throw new Error(
      "Dependencies are missing. Run npm ci from the project folder first.",
    );
  if (process.argv.includes("--check")) {
    console.log(
      "PASS: Node version, portable CLI entry points, and project paths. No servers, migrations or provider calls were started.",
    );
  } else {
    if (process.argv.length > 2)
      throw new Error("Usage: npm start (or node scripts/start.mjs --check).");
    await Promise.all([checkPort(5173), checkPort(8787)]);
    if (!existsSync(join(root, "dist/index.html"))) {
      run(tsc, ["--noEmit"]);
      run(vite, ["build"]);
    }
    run(wrangler, ["d1", "migrations", "apply", "spendproof-db", "--local"]);
    process.on("SIGINT", () => stop(0));
    process.on("SIGTERM", () => stop(0));
    for (const [script, args] of [
      [wrangler, ["dev", "--port", "8787", "--ip", "127.0.0.1"]],
      [vite, ["--host", "127.0.0.1", "--port", "5173", "--strictPort"]],
    ]) {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: root,
        env,
        stdio: "inherit",
        shell: false,
        detached: !windows,
      });
      children.push(child);
      child.once("error", (error) => {
        console.error(error.message);
        stop(1);
      });
      child.once("exit", (code) => {
        if (!stopping) stop(code || 1);
      });
    }
    console.log(
      "\nSpendProof: http://127.0.0.1:5173/\nOpen Chrome Incognito yourself. No browser opens automatically. Ctrl+C stops both servers.\n",
    );
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}

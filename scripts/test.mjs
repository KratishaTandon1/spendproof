import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = readdirSync(new URL("../tests/", import.meta.url))
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => `tests/${name}`);
if (!files.length) throw new Error("No application tests were found.");
// Expand filenames here because Windows Command Prompt does not expand globs.
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  {
    cwd: root,
    stdio: "inherit",
    shell: false,
  },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);

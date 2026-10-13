// Runs every check in order and prints a summary. The app itself needs none of this.
// Usage: node tests/run-all.mjs            (all suites)
//        node tests/run-all.mjs unit sims  (only the named suites)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const SUITES = [
  { id: "tokens", what: "colour system: WCAG 2.2 contrast, colour-blind separation, token files", file: "tools/palette.mjs", args: ["--check"], browser: false },
  { id: "world", what: "synthetic world, scenarios, reference cases, simulation scripts", file: "tools/check_world.mjs", browser: false },
  { id: "unit", what: "streaming client, retries, cost maths", file: "tests/unit.mjs", browser: false },
  { id: "smoke", what: "main flows and loading failures", file: "tests/smoke.mjs", browser: true },
  { id: "sims", what: "all six simulations, four decision patterns", file: "tests/sims.mjs", browser: true },
  { id: "live", what: "live agent against the scripted API stand-in", file: "tests/live.mjs", browser: true },
  { id: "accept", what: "M6 acceptance: key, Diagnostics, Abort/Reset, offline", file: "tests/accept.mjs", browser: true },
  { id: "layout", what: "viewports and touch targets", file: "tests/layout.mjs", browser: true },
  { id: "design", what: "colour grammar in the app, projector and colour-blind captures", file: "tests/design.mjs", browser: true }
];

const only = process.argv.slice(2);
const chosen = SUITES.filter((s) => !only.length || only.includes(s.id));
const summary = [];
for (const s of chosen) {
  console.log(`\n=== ${s.id}: ${s.what} ===`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, s.file), ...(s.args || [])], { cwd: APP_ROOT, stdio: "inherit", env: process.env });
  summary.push({ ...s, ok: r.status === 0, code: r.status, seconds: Math.round((Date.now() - started) / 1000) });
  if (r.status === 2) {
    console.log("Playwright is missing; browser suites are skipped. See tests/README.md.");
    break;
  }
}

console.log("\n=== Summary ===");
for (const s of summary) console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.id.padEnd(7)} ${String(s.seconds).padStart(4)} s  ${s.what}`);
const skipped = chosen.length - summary.length;
if (skipped) console.log(`(${skipped} suite${skipped === 1 ? "" : "s"} not run)`);
process.exit(summary.length === chosen.length && summary.every((s) => s.ok) ? 0 : 1);

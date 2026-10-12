// Developer check (optional; the app itself needs no Node): validates the synthetic world,
// the scenarios, the reference cases and the simulation scripts.
// Usage from the repository root:  node tools/check_world.mjs
// The same checks run in the browser via Diagnostics → "World integrity".

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["data/world.js", "data/scenarios.js", "data/reference_cases.js", "data/sim_runs.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const { checkWorld } = await import(pathToFileURL(path.join(root, "js/world_check.js")).href);
const { WORLD, SCENARIOS, REFERENCE_CASES, SIM_RUNS } = sandbox.window;
const result = checkWorld(WORLD, SCENARIOS, REFERENCE_CASES, SIM_RUNS || {});

for (const c of result.checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  —  ${c.detail}` : ""}`);
}
console.log(`\n${result.checks.filter((c) => c.ok).length}/${result.checks.length} checks passed.`);
process.exit(result.ok ? 0 : 1);

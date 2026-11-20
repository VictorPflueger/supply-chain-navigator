// Runs every suite in order and prints a summary. The showcase itself needs none of this.
// Usage: node tests/run-all.mjs               (all suites)
//        node tests/run-all.mjs figures vici   (only the named suites)
// Options after the suite names are passed to every suite, e.g. --require-vici on GitHub Actions.
// On GitHub Actions a failing suite's FAIL lines also become error annotations on the check run.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const SUITES = [
  { id: "figures", what: "every figure on the page, in the guide and in the docs equals the engine's, for all six scenarios", file: "tests/figures.mjs", browser: false },
  { id: "files", what: "the page's files, the modules' imports, a portable shell, vici/ unchanged", file: "tests/files.mjs", browser: false, vici: true },
  { id: "lean", what: "how small the app stays: modules, lines, one host to connect to, short docs", file: "tests/lean.mjs", browser: false },
  { id: "vici", what: "Vici's own guide, byline, writing and AI-notice checks on the page and every sentence it writes", file: "tests/vici.mjs", browser: false, vici: true },
  { id: "showcase", what: "the five steps by click, key and link, the scenarios, the first screen, the key figures, four window sizes, both themes", file: "tests/showcase.mjs", browser: true },
  { id: "guide", what: "Vici's guide behaviour check over http, and every chapter fits 1280 × 720 and 1366 × 768", file: "tests/guide.mjs", browser: true, vici: true },
  { id: "live", what: "a live run on a session key against a stand-in API: approvals, nothing sent, cost measured", file: "tests/live.mjs", browser: true },
  { id: "contrast", what: "every visible text in the five steps and the guide meets WCAG 2.2 AA, light and dark", file: "tests/contrast.mjs", browser: true },
  { id: "hexagon", what: "nothing round in the app's files or the rendered page, light and dark", file: "tests/hexagon.mjs", browser: true }
];

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("-"));
const pass = args.filter((a) => a.startsWith("-"));
const unknown = only.filter((id) => !SUITES.some((s) => s.id === id));
if (unknown.length) {
  console.error(`Unknown suite${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Available: ${SUITES.map((s) => s.id).join(", ")}.`);
  process.exit(1);
}
const chosen = SUITES.filter((s) => !only.length || only.includes(s.id));
const summary = [];
const ci = process.env.GITHUB_ACTIONS === "true";
for (const s of chosen) {
  console.log(`\n=== ${s.id}: ${s.what} ===`);
  const started = Date.now();
  const extra = s.vici ? pass : pass.filter((a) => a !== "--require-vici");
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, s.file), ...extra], { cwd: APP_ROOT, stdio: ci ? ["inherit", "pipe", "inherit"] : "inherit", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  if (ci) {
    const text = String(r.stdout || "");
    process.stdout.write(text);
    if (r.status !== 0) for (const line of text.split("\n").filter((l) => /^FAIL\b/.test(l)).slice(0, 10)) console.log(`::error title=${s.id}::${line.slice(0, 3000).replace(/%/g, "%25")}`);
  }
  summary.push({ ...s, ok: r.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
  if (r.status === 2) { console.log("Playwright is missing; the browser suites are skipped. See tests/README.md."); break; }
}

console.log("\n=== Summary ===");
for (const s of summary) console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.id.padEnd(8)} ${String(s.seconds).padStart(4)} s  ${s.what}`);
const ok = summary.length === chosen.length && summary.every((s) => s.ok);
if (!ok) { console.log(`\n${summary.filter((s) => !s.ok).length || chosen.length - summary.length} suite(s) failed or did not run.`); process.exit(1); }
console.log(`\nAll ${chosen.length} suites passed.${chosen.length === SUITES.length ? "\nALL SUITES PASSED" : ""}`);

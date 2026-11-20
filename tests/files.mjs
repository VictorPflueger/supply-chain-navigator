// The files: everything the page, the modules, the tests and the workflow name is there, the shell
// is portable, and vici/ is Vici unchanged. Node.js only.
//   shell      the shell modules (js/shell.js, claude.js, cost.js, format.js, theme.js) import only each
//              other and read none of Navigator's data, so Rebate Hunter and Timetable Translator can
//              take them as they are (prints SHELL PORTABLE)
//   page       every local file index.html loads exists
//   modules    every import resolves to a file that exports the imported names, and every module is
//              loaded by the page or imported by one that is
//   tests      every suite the runner lists and every script the workflow runs exists
//   vici       vici/ holds exactly the files vici/README.md lists, each byte for byte as in ViciDesign at
//              the commit the README names, a commit on ViciDesign's main branch that CI checks out too
//              (with a ViciDesign checkout at ../ViciDesign or VICI_DIR; without one it says so and
//              passes, unless --require-vici is given)
// Usage: node tests/files.mjs [shell] [--require-vici]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT, ONLY, REQUIRE_VICI, viciDir } from "./lib/harness.mjs";

const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const exists = (f) => existsSync(path.join(APP_ROOT, f));
const modules = readdirSync(path.join(APP_ROOT, "js")).filter((f) => f.endsWith(".js"));

// ---- the shell -------------------------------------------------------------------------------------
const SHELL = ["shell.js", "claude.js", "cost.js", "format.js", "theme.js"];
const CASE_DATA = /\b(WORLD|SCENARIOS|SIM_RUNS|REFERENCE_CASES|OFFLINE_BASEMAP)\b|Nordwerk|Leipzig|Tangier|supplier/;
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
/** Problems with one shell module: an import from outside the shell, or Navigator's data or words in its code. */
function shellProblems(name, src) {
  const out = [];
  for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s*"\.\/([^"]+)"/g)) if (!SHELL.includes(m[1])) out.push(`${name} imports ${m[1]}, which is Navigator's own`);
  const hit = code(src).match(CASE_DATA);
  if (hit) out.push(`${name} names Navigator's ${hit[0]} in its code`);
  return out;
}
function shellChecks() {
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  check(shellProblems("planted.js", 'import { STEPS } from "./story.js";').length === 1 && shellProblems("planted.js", "const n = globalThis.SCENARIOS.length;").length === 1 && !shellProblems("planted.js", '// Rebate Hunter and Timetable Translator take this, unlike the Tangier story.\nimport { clock } from "./format.js";').length, "control: a shell module that imports the story or reads the scenarios is caught; a comment is not");
  const missing = SHELL.filter((f) => !modules.includes(f));
  check(!missing.length, `shell: the ${SHELL.length} shell modules exist${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
  const problems = SHELL.filter((f) => modules.includes(f)).flatMap((f) => shellProblems(f, read(`js/${f}`)));
  check(!problems.length, `shell: ${SHELL.join(", ")} import only each other and name none of Navigator's data${problems.length ? `; ${problems.join("; ")}` : ""}`);
  const users = modules.filter((f) => !SHELL.includes(f) && /from\s*"\.\/shell\.js"/.test(read(`js/${f}`)));
  check(users.join() === "main.js", `shell: only js/main.js wires the shell to the case (${users.join(", ")})`);
  return results;
}

// ---- the rest ----------------------------------------------------------------------------------------
function fileChecks() {
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  const html = read("index.html");
  const local = [...html.matchAll(/\b(?:href|src)="([^"#?]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:)/.test(u));
  const missingPage = local.filter((f) => !exists(f));
  check(local.length >= 10 && !missingPage.length, `page: the ${local.length} local files index.html loads exist${missingPage.length ? `; missing: ${missingPage.join(", ")}` : ""}`);

  const exportsOf = (src) => {
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(",")) names.add(part.trim().split(/\s+as\s+/).pop());
    return names;
  };
  const broken = [];
  let imports = 0;
  for (const f of modules) {
    for (const m of read(`js/${f}`).matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
      imports += 1;
      const target = path.join("js", m[2]);
      if (!exists(target)) { broken.push(`${f} imports ${m[2]}, which is missing`); continue; }
      const have = exportsOf(read(target));
      for (const name of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!have.has(name)) broken.push(`${f} imports ${name} from ${m[2]}, which doesn't export it`);
    }
  }
  check(imports > 20 && !broken.length, `modules: the ${imports} imports of ${modules.length} modules resolve${broken.length ? `; ${broken.join("; ")}` : ""}`);
  const loaded = local.filter((f) => f.startsWith("js/")).map((f) => f.slice(3));
  const reachable = new Set();
  const walk = (f) => { if (reachable.has(f) || !exists(`js/${f}`)) return; reachable.add(f); for (const m of read(`js/${f}`).matchAll(/from\s*"\.\/([^"]+)"/g)) walk(m[1]); };
  for (const f of loaded) walk(f);
  const orphans = modules.filter((f) => !reachable.has(f));
  check(!orphans.length, `modules: every module is loaded by the page or imported by one that is${orphans.length ? `; unused: ${orphans.join(", ")}` : ""}`);
  const dataFiles = readdirSync(path.join(APP_ROOT, "data")).filter((f) => !local.includes(`data/${f}`));
  check(!dataFiles.length, `data: the page loads every file in data/${dataFiles.length ? `; unused: ${dataFiles.join(", ")}` : ""}`);

  const runner = read("tests/run-all.mjs");
  const suites = [...runner.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
  check(suites.length >= 9 && suites.every(exists), `tests: the ${suites.length} suites the runner lists exist${suites.filter((f) => !exists(f)).map((f) => `; missing ${f}`).join("")}`);
  const workflow = read(".github/workflows/tests.yml");
  const named = [...workflow.matchAll(/\bnode\s+(tests\/[\w./-]+\.mjs)/g)].map((m) => m[1]);
  check(named.length >= 1 && named.every(exists), `workflow: the scripts it runs exist (${named.join(", ")})`);

  // vici/
  const readme = read("vici/README.md");
  const commit = (readme.match(/commit \*\*`([0-9a-f]{7,40})`\*\*/) || [])[1];
  const listed = [...readme.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
  const all = (dir) => readdirSync(path.join(APP_ROOT, dir)).flatMap((e) => (statSync(path.join(APP_ROOT, dir, e)).isDirectory() ? all(`${dir}/${e}`) : [`${dir}/${e}`]));
  const present = all("vici").map((f) => f.slice("vici/".length)).filter((f) => f !== "README.md").sort();
  const matches = (pattern, f) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`).test(f);
  const unlisted = present.filter((f) => !listed.some((p) => matches(p, f)));
  const unmatched = listed.filter((p) => !present.some((f) => matches(p, f)));
  check(!!commit && !unlisted.length && !unmatched.length, `vici: its README names the commit (${commit}) and lists exactly the ${present.length} files${unlisted.length ? `; not listed: ${unlisted.join(", ")}` : ""}${unmatched.length ? `; listed, not present: ${unmatched.join(", ")}` : ""}`);
  const dir = viciDir();
  if (!dir) {
    check(!REQUIRE_VICI, `vici: ${REQUIRE_VICI ? "no" : "(skipped) no"} ViciDesign checkout at ../ViciDesign or in VICI_DIR to compare with`);
  } else {
    const show = (f) => { try { return execFileSync("git", ["-C", dir, "show", `${commit}:${f}`], { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
    const differ = present.filter((f) => { const theirs = show(f); return !theirs || !theirs.equals(readFileSync(path.join(APP_ROOT, "vici", f))); });
    check(!differ.length, `vici: all ${present.length} files are byte for byte ViciDesign's at ${commit}${differ.length ? `; differ: ${differ.join(", ")}` : ""}`);
    // The copy comes from Vici's main branch, not from a branch that may never be merged.
    const onMain = ["origin/main", "main"].some((ref) => { try { execFileSync("git", ["-C", dir, "merge-base", "--is-ancestor", commit, ref], { stdio: "ignore" }); return true; } catch { return false; } });
    check(onMain, `vici: commit ${commit} is on ViciDesign's main branch`);
    const workflowRef = (workflow.match(/repository:\s*VictorPflueger\/ViciDesign[\s\S]*?ref:\s*([0-9a-f]{40})/) || [])[1];
    check(!!workflowRef && workflowRef.startsWith(commit), `vici: CI checks ViciDesign out at the same commit (${workflowRef ? workflowRef.slice(0, 7) : "none"})`);
  }
  return results;
}

const groups = [[shellChecks(), "SHELL PORTABLE"]];
if (!ONLY.includes("shell")) groups.push([fileChecks(), "FILES OK"]);
let failed = 0;
const tokens = [];
for (const [results, token] of groups) {
  for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  const f = results.filter(([ok]) => !ok).length;
  failed += f;
  if (!f) tokens.push(token);
}
if (failed) { console.log(`\n${failed} checks failed.`); process.exit(1); }
console.log(`\nAll checks passed.\n${tokens.join("\n")}`);

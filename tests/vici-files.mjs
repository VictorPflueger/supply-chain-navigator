// vici/ holds exactly the files vici/README.md lists: every file there matches a row of the README's
// table (or is the README itself), every row matches at least one file, and every file Vici's
// stylesheet loads (its fonts) is there. The files are Vici's, copied unchanged from the release the
// README names: when a checkout of Vici at that release sits next to this repository, every file is
// compared with it byte for byte (otherwise that part is skipped and says so). A fix belongs in Vici,
// not in this copy.
// The same file in all four prototypes.
// Usage: node tests/vici-files.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const VICI = path.join(APP_ROOT, "vici");
const results = [];
const check = (ok, what) => results.push([ok, what]);

function files(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

const readme = readFileSync(path.join(VICI, "README.md"), "utf8");
// The table's first column: `dist/vici.min.css`, `assets/fonts/*.woff2`, …
const listed = [...readme.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
const pattern = (glob) => new RegExp(`^${glob.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
const present = files(VICI).sort();

check(listed.length > 0, `vici/README.md lists ${listed.length} entries`);
const release = readme.match(/\bv(\d+\.\d+\.\d+)\b[^\n]*?`([0-9a-f]{7,40})`/);
check(!!release, `vici/README.md names the release and its commit${release ? ` (v${release[1]}, ${release[2]})` : ""}`);
const unlisted = present.filter((f) => f !== "README.md" && !listed.some((g) => pattern(g).test(f)));
check(!unlisted.length, `every file in vici/ is listed in its README${unlisted.length ? `; not listed: ${unlisted.join(", ")}` : ` (${present.length} files)`}`);
const missing = listed.filter((g) => !present.some((f) => pattern(g).test(f)));
check(!missing.length, `every entry of the README is in vici/${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
check(present.includes("LICENSE"), "Vici's licence (vici/LICENSE) is there");

// Everything the stylesheet loads by url() is there (the fonts, at ../assets/fonts/ from dist/).
const css = readFileSync(path.join(VICI, "dist/vici.min.css"), "utf8");
const urls = [...new Set([...css.matchAll(/url\(\s*['"]?(?!data:)([^'")]+)['"]?\s*\)/g)].map((m) => m[1]))];
const unresolved = urls.filter((u) => !existsSync(path.join(VICI, "dist", u)));
check(!unresolved.length, `every file Vici's stylesheet loads is in vici/ (${urls.length} files${unresolved.length ? `; missing: ${unresolved.join(", ")}` : ""})`);

// Unchanged: when a checkout of Vici at the same release sits next to this repository, every file here
// is byte for byte the file at the same place in it.
let skipped = null;
const checkout = ["ViciDesign", "vicidesign"].map((d) => path.resolve(APP_ROOT, "..", d)).find((d) => existsSync(path.join(d, "package.json")));
const version = checkout ? JSON.parse(readFileSync(path.join(checkout, "package.json"), "utf8")).version : null;
if (checkout && release && version === release[1]) {
  const changed = present.filter((f) => f !== "README.md").filter((f) => {
    const theirs = path.join(checkout, f);
    return !existsSync(theirs) || !readFileSync(theirs).equals(readFileSync(path.join(VICI, f)));
  });
  check(!changed.length, `every file is unchanged from Vici v${version} (${path.relative(APP_ROOT, checkout)})${changed.length ? `; changed or not in Vici: ${changed.join(", ")}` : ""}`);
} else {
  skipped = checkout ? `the Vici checkout next to this repository is v${version}, not v${release?.[1]}: files not compared` : "no checkout of Vici next to this repository: files not compared with the release";
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (skipped) console.log(`SKIP  ${skipped}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) {
  console.error(`\n${failed} check(s) of vici/ failed.`);
  process.exit(1);
}
console.log("\nvici/ holds exactly the files its README lists.");

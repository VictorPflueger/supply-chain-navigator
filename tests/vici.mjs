// Vici's own rules, checked with Vici's own functions: the How it works guide and its key figures
// (guideProblems), the byline (bylineProblems), the Writing guideline's checkable patterns
// (writingProblems: no eyebrow, no numbered middle-dot heading, no bold-label list item, no em dash as
// punctuation, no stock word) and the AI notice of a page that can start a live run (aiNoticeProblems),
// on the page, on every sentence the steps write for all six scenarios and on the docs. Node.js only.
//
// Each imported check first fails on a planted control: a page without its guide, a key figure the
// guide never explains, a byline without the website, an em dash and a stock word, a live page that
// never says it is an AI. Prints VICI CONTROLS OK and VICI STANDARDS OK.
//
// The functions come from a checkout of ViciDesign next to this repository (../ViciDesign, or the
// folder in VICI_DIR). Without one the suite says so and passes, unless --require-vici is given, as on
// GitHub Actions, which checks ViciDesign out at the commit vici/ was copied from.
// Usage: node tests/vici.mjs [--require-vici]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, REQUIRE_VICI, viciDir, loadApp, KPI_NAMES } from "./lib/harness.mjs";

const dir = viciDir();
if (!dir) {
  console.log(`${REQUIRE_VICI ? "FAIL" : "SKIP"}  no ViciDesign checkout next to this repository (../ViciDesign) or in VICI_DIR`);
  process.exit(REQUIRE_VICI ? 1 : 0);
}
const lib = async (file) => import(pathToFileURL(path.join(dir, "scripts", "lib", file)).href);
const { guideProblems } = await lib("guide.mjs");
const { bylineProblems } = await lib("byline.mjs");
const { writingProblems } = await lib("writing.mjs");
const { aiNoticeProblems, canRunLive, AI_NOTICE } = await lib("ai.mjs");

const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const html = read("index.html");
const page = (paragraphs) => `<html lang="en-GB"><body>${paragraphs.map((t) => `<p>${String(t).replace(/</g, "&lt;")}</p>`).join("")}</body></html>`;
const controls = [];
const standards = [];
const control = (ok, what) => controls.push([!!ok, what]);
const check = (ok, what) => standards.push([!!ok, what]);

// ---- the checks can fail ----------------------------------------------------------------------------
control(guideProblems(html.replace(/<dialog\b[^>]*vc-guide[\s\S]*?<\/dialog>/, "")).length > 0, "control: guideProblems catches a page without the guide");
control(guideProblems(html.replace("<div class=\"kpis\"", "<p class=\"vc-stat\" data-vc-kpi=\"Pallets per hour\">48</p><div class=\"kpis\"")).some((p) => /Pallets per hour/.test(p)), "control: guideProblems catches a key figure the How it works chapter never explains");
control(bylineProblems(html.replace(/href="https:\/\/victorpflueger\.github\.io\/VIP\/index\.html"/, 'href="#"')).length > 0, "control: bylineProblems catches a byline without the website link");
control(writingProblems(page(["Leipzig stops — soon."])).length > 0 && writingProblems(page(["A seamless decision."])).length > 0, "control: writingProblems catches an em dash and a stock word");
control(aiNoticeProblems(html.split(AI_NOTICE.en).join("An assistant")).length > 0 && !aiNoticeProblems('<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"><p>Replay</p>').length, "control: aiNoticeProblems catches a live page that never says it is an AI, and leaves a page that cannot run live alone");

// ---- the page ---------------------------------------------------------------------------------------
const g = guideProblems(html);
check(!g.length, `the guide follows Vici's standard, a row in How it works for each key figure included${g.length ? `: ${g.join("; ")}` : ""}`);
check(/<h2 class="vc-dialog__title" id="guide-title">How the showcase works<\/h2>/.test(html), "the guide is titled How the showcase works");
const kpis = [...html.matchAll(/\bdata-vc-kpi="([^"]+)"/g)].map((m) => m[1]);
check(kpis.join("|") === KPI_NAMES.join("|"), `the header marks its four key figures (${kpis.join(", ")})`);
const b = bylineProblems(html);
check(!b.length, `the byline follows Vici's standard${b.length ? `: ${b.join("; ")}` : ""}`);
const w = writingProblems(html);
check(!w.length, `index.html keeps Vici's writing rules${w.length ? `: ${w.join("; ")}` : ""}`);
const a = aiNoticeProblems(html);
check(canRunLive(html) && !a.length, `the page can start a live run and says "${AI_NOTICE.en}"${a.length ? `: ${a.join("; ")}` : ""}`);
check(/<html lang="en-GB">/.test(html), 'the page is marked lang="en-GB"');

// ---- every sentence the steps write, for all six scenarios and every decision ------------------------
const { story, view } = await loadApp();
const today = new Date();
const said = new Set(story.STEPS.flatMap((s) => [s.label, s.hint, s.lead]));
const fromEvents = (r) => {
  for (const e of Object.values(r.events).flat()) {
    for (const k of ["text", "line", "title", "summary", "subject", "body", "recipient", "markdown", "label", "description", "residual_risk"]) if (typeof e[k] === "string") said.add(e[k]);
    for (const o of e.options || []) for (const k of ["title", "description", "residual_risk"]) if (o[k]) said.add(o[k]);
    for (const s of e.sources || []) said.add(s.title);
  }
};
for (const s of story.scenarioList()) {
  said.add(s.title);
  said.add(s.seed);
  const base = story.scriptedRun(s.id, today);
  for (const id of [...base.options.options.map((o) => o.id), "baseline"]) {
    for (const decision of id === "baseline" ? ["approved"] : ["approved", "rejected"]) {
      const r = Object.assign(story.scriptedRun(s.id, today), { drafts: new Map(), rejected: new Set(), decision: null });
      story.decideScripted(r, id, decision);
      if (decision === "approved") r.decision = { id };
      for (const e of r.events.prepare) if (e.type === "action_draft") r.drafts.set(e.action_id, { ...e });
      fromEvents(r);
      for (const step of story.STEPS) said.add(view.heading(r, step.id));
      for (const d of r.drafts.values()) d.status = "approved";
      said.add(view.heading(r, "prepare"));
      view.renderKpis(r, (name, v) => { said.add(v.value); said.add(v.note); });
    }
  }
}
// The words the modules write themselves: every string and template in the view, the shell and main.
const literals = ["js/view.js", "js/shell.js", "js/main.js", "js/agent.js", "js/tools.js"].flatMap((f) => [...read(f).replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").matchAll(/"((?:[^"\\\n]|\\.){12,})"|`((?:[^`\\\n]|\\.){12,})`/g)]
  .map((m) => (m[1] || m[2]).replace(/\$\{[^}]*\}/g, "x").replace(/\\n/g, " ").replace(/\\(.)/g, "$1")).filter((t) => / [a-z]/.test(t) && !/^[\w.-]+$/.test(t)));
for (const t of literals) said.add(t);
const written = writingProblems(page([...said].filter(Boolean)));
check(said.size > 400 && !written.length, `the ${said.size} sentences, labels and figures the steps write for six scenarios, and the modules' own words, keep the writing rules${written.length ? `: ${written.join("; ")}` : ""}`);

// ---- the docs, as text --------------------------------------------------------------------------------
for (const doc of ["README.md", "DEMO_SCRIPT.md", "DESIGN.md", "DATA_SOURCES.md", "tests/README.md"]) {
  const there = existsSync(path.join(APP_ROOT, doc));
  const p = there ? writingProblems(page([read(doc).replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "")])) : ["missing"];
  check(!p.length, `${doc} keeps the writing rules${p.length ? `: ${p.join("; ")}` : ""}`);
}

let failed = 0;
const report = (results, token) => {
  const f = results.filter(([ok]) => !ok).length;
  for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  failed += f;
  return f ? null : token;
};
const tokens = [report(controls, "VICI CONTROLS OK"), report(standards, "VICI STANDARDS OK")].filter(Boolean);
console.log(`(Vici's checks from ${path.relative(APP_ROOT, dir) || dir})`);
if (failed) { console.log(`\n${failed} checks failed.`); process.exit(1); }
console.log(`\nAll ${controls.length + standards.length} checks passed.\n${tokens.join("\n")}`);

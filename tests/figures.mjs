// The figures: the app computes every one, and none is typed in. Node.js only.
//   page   every [data-fig] figure written in index.html (the key figures, the guide, the live-run
//          dialog) equals the one the app computes for the Tangier demo; the talk track has five
//          one-minute steps named as the page's; for all six scenarios every placeholder of every
//          branch is filled from the engine, the options and key figures are the engine's, and no
//          euro amount is typed into a script or the page; the replay's cost estimate stays within
//          10 % of the measured live run (Styria, €0.20 on Sonnet 5.5, DATA_SOURCES.md)
//   docs   README.md and DEMO_SCRIPT.md name the five steps and the four key figures, and every euro
//          amount, line-stop day and approved option in them is the one the app computes
// Each rule is first tried on a planted example that must break it.
// Usage: node tests/figures.mjs [page] [docs]
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT, wanted, loadApp, STEP_IDS, KPI_NAMES } from "./lib/harness.mjs";

const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const norm = (s) => String(s).replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const { story, view, cost, format } = await loadApp();
const today = new Date();
const html = read("index.html");
const demo = story.scriptedRun(story.DEMO_ID, today);
const LABELS = story.STEPS.map((s) => s.label);

/** The demo's figures as the page writes them: story.figures() plus the talk track's minutes and the model. */
function expected(page) {
  const figs = story.figures(demo);
  const minutes = [...page.matchAll(/class="vc-guide__time"[^>]*>([^<]*)</g)].map((m) => parseFloat(m[1]));
  figs["decision-min"] = `${minutes.slice(0, STEP_IDS.indexOf("propose") + 1).reduce((a, b) => a + b, 0)} min`;
  figs.model = cost.MODEL.label;
  return figs;
}

/** Every element marked data-fig in a page whose text differs from the computed figure. */
function figureProblems(page) {
  const figs = expected(page);
  const out = [];
  let n = 0;
  for (const m of page.matchAll(/<(\w+)\b[^>]*\bdata-fig="([^"]+)"[^>]*>([^<]*)<\/\1>/g)) {
    n += 1;
    const [, , name, text] = m;
    if (!(name in figs)) out.push(`data-fig="${name}" names no computed figure`);
    else if (norm(text) !== norm(figs[name])) out.push(`data-fig="${name}" reads "${norm(text)}", the app computes "${norm(figs[name])}"`);
  }
  return { n, out };
}

/** Euro amounts typed into the page outside the elements the app writes. */
const typedEuros = (page) => (page.replace(/<(\w+)\b[^>]*\bdata-fig="[^"]+"[^>]*>[^<]*<\/\1>/g, "").replace(/<!--[\s\S]*?-->/g, "").match(/€(?:\s|&nbsp;)?\d[\d.,]*[kMB]?/g) || []);

function pageChecks() {
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);

  // The rules catch what they are for.
  check(figureProblems(html.replace(/(data-fig="var"[^>]*>)€19\.1M/, "$1€19.2M")).out.length > 0, "control: a figure in the page that differs from the engine's is caught");
  check(typedEuros(html.replace("</main>", "<p>Costs €45k.</p></main>")).length === 1, "control: a euro amount typed into the page is caught");

  const { n, out } = figureProblems(html);
  check(n >= 20 && !out.length, `page: the ${n} figures written in index.html equal the app's${out.length ? `; ${out.join("; ")}` : ""}`);
  const typed = typedEuros(html);
  check(!typed.length, `page: no euro amount is typed into index.html outside the figures the app writes${typed.length ? `; found ${typed.join(", ")}` : ""}`);
  const scripts = read("data/sim_runs.js");
  const typedScript = scripts.match(/€\s?\d[\d.,]*[kMB]?/g) || [];
  check(!typedScript.length, `scripts: data/sim_runs.js types no euro amount; placeholders carry them${typedScript.length ? `; found ${typedScript.join(", ")}` : ""}`);

  // The talk track: five steps of one minute, in the page's order.
  const pathHtml = (html.match(/<ol class="vc-guide__path">([\s\S]*?)<\/ol>/) || [])[1] || "";
  const items = [...pathHtml.matchAll(/<li>\s*<strong>([^<.:]+)/g)].map((m) => norm(m[1]));
  const times = [...pathHtml.matchAll(/class="vc-guide__time">([^<]*)</g)].map((m) => norm(m[1]));
  check(items.join("|") === LABELS.join("|") && times.every((t) => t === "1 min") && times.length === 5, `talk track: five steps named ${items.join(", ")}, ${times.join(", ")}`);
  const steps = [...html.matchAll(/<li class="vc-step" data-step="([^"]+)">[\s\S]*?<span class="vc-step__label">([^<]+)</g)].map((m) => `${m[1]}:${m[2]}`);
  check(steps.join("|") === STEP_IDS.map((id, i) => `${id}:${LABELS[i]}`).join("|"), `page: the steps under the header are ${steps.join(", ")}`);

  // The key figures as written equal what the app shows before anything happens.
  const shown = {};
  view.renderKpis({ ...demo, drafts: new Map(), decision: null }, (name, v) => { shown[name] = v; });
  shown["Session cost"] = { value: `≈ ${format.eurCents(demo.estimateEur)}`, note: "estimated for a live run" };
  const tiles = Object.fromEntries([...html.matchAll(/data-vc-kpi="([^"]+)"[\s\S]*?class="[^"]*kpi-value[^"]*"[^>]*>([\s\S]*?)<\/p>\s*<p class="[^"]*kpi-note[^"]*">([\s\S]*?)<\/p>/g)]
    .map((m) => [m[1], { value: norm(m[2].replace(/<[^>]+>/g, "")), note: norm(m[3].replace(/<[^>]+>/g, "")) }]));
  check(Object.keys(tiles).join("|") === KPI_NAMES.join("|"), `key figures: the page has ${Object.keys(tiles).join(", ")}`);
  for (const name of ["Value at risk", "First line stop in", "Session cost"]) {
    const a = tiles[name], b = shown[name];
    check(a && b && a.value === norm(b.value) && a.note === norm(b.note), `key figures: "${name}" reads "${a?.value}, ${a?.note}" as the app shows it ("${b?.value}, ${b?.note}")`);
  }

  // All six scenarios, every branch.
  const leftover = (text) => text.match(/\{\{(?!actions\.)[^}]+\}\}/g) || [];
  for (const s of story.scenarioList()) {
    const run = story.scriptedRun(s.id, today);
    const branches = [...run.options.options.map((o) => o.id), "baseline"];
    const problems = [];
    for (const id of branches) {
      for (const decision of id === "baseline" ? ["approved"] : ["approved", "rejected"]) {
        const r = story.scriptedRun(s.id, today);
        story.decideScripted(r, id, decision);
        const text = JSON.stringify(r.events);
        const left = leftover(text);
        if (left.length) problems.push(`${id} ${decision}: unfilled ${[...new Set(left)].slice(0, 3).join(", ")}`);
        if (/NaN|undefined|Infinity/.test(text)) problems.push(`${id} ${decision}: NaN or undefined in a step`);
      }
    }
    const res = run.results.disruption;
    for (const o of run.options.options) {
      const v = res.variants.find((x) => x.variant_id === o.id);
      if (!v || o.mitigation_cost_eur !== v.mitigation_cost_eur || o.residual_var_eur !== v.residual_var_eur || o.time_days !== v.time_to_effect_days) problems.push(`option ${o.letter} is not the engine's ${o.id}`);
    }
    const k = view.impacts({ ...run, events: run.events }).last;
    if (k.value_at_risk_eur !== res.baseline.value_at_risk_eur || k.first_stop_day !== res.baseline.first_stop_day) problems.push("the key figures are not the engine's baseline");
    const figs = story.figures(run);
    for (const [name, value] of Object.entries(figs)) if (!value || /NaN|undefined/.test(value)) problems.push(`figure ${name} is "${value}"`);
    check(!problems.length, `${s.slug}: ${branches.length * 2 - 1} branches filled from the engine; ${figs.var} at risk, first stop in ${figs["stop-days"]}, option ${figs.rec} leaves ${figs["rec-left"]}, a live run ≈ ${figs.estimate}${problems.length ? `; ${problems.join("; ")}` : ""}`);
  }

  // The replay's estimate against the measured live run.
  const styria = story.scriptedRun("SC-STYRIA-FLOOD", today).estimateEur;
  check(Math.abs(styria - 0.2) / 0.2 <= 0.1, `cost: the replay estimates the Styria run at ${format.eurCents(styria)} (€${styria.toFixed(3)}), within 10 % of the €0.20 measured live`);
  return results;
}

function docsChecks() {
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  const figs = expected(html);
  const euros = new Set([figs.var, figs["hyp-var"], figs["rec-cost"], figs["rec-left"], figs.estimate].map(norm));

  /** Problems with one Markdown document against the page and the engine. */
  const docProblems = (text) => {
    const out = [];
    const plain = text.replace(/```[\s\S]*?```/g, " ");
    for (const label of LABELS) if (!new RegExp(`\\b${label}\\b`).test(plain)) out.push(`never names the step ${label}`);
    for (const name of KPI_NAMES) if (!plain.includes(name)) out.push(`never names the key figure ${name}`);
    for (const m of plain.matchAll(/€\s?\d+(?:[.,]\d+)*(?:\s?[kMB]\b)?/g)) if (!euros.has(norm(m[0]))) out.push(`${m[0]} is not a figure the app computes (${[...euros].join(", ")})`);
    for (const m of plain.matchAll(/stops (?:on day|in) (\d+)/g)) if (m[1] !== figs["stop-day"]) out.push(`"${m[0]}": the engine says day ${figs["stop-day"]}`);
    for (const m of plain.matchAll(/[Aa]pprove (?:on )?option ([ABC])\b/g)) if (m[1] !== figs.rec) out.push(`"${m[0]}": the agent recommends option ${figs.rec}`);
    return out;
  };

  const readme = read("README.md");
  check(docProblems(readme.replace(figs.var, "€19.2M")).length > 0, "control: a figure in a document that differs from the engine's is caught");
  for (const doc of ["README.md", "DEMO_SCRIPT.md"]) {
    const p = docProblems(read(doc));
    check(!p.length, `${doc}: names the five steps and four key figures, and its figures are the app's${p.length ? `; ${p.join("; ")}` : ""}`);
  }
  return results;
}

const groups = [];
if (wanted("page")) groups.push([pageChecks(), "FIGURES OK"]);
if (wanted("docs")) groups.push([docsChecks(), "DOCS MATCH"]);
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

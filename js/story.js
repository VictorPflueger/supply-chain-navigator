// Navigator's case for the presenter: the six scenarios, the agent's five steps, and a scenario's
// scripted run turned into the events a live run emits, with every euro and day from the engine.
// The scripts (data/sim_runs.js) hold words and placeholders; this module fills the placeholders
// from the engine and the ERP queries when the page builds the run, so no figure is typed in.

import { getModel } from "./world.js";
import { simulateImpact, compactForModel } from "./impact.js";
import { erpOverview, erpListSuppliers, erpGetSupplier, erpGetPart, erpGetOpenPOs, erpGetAlternatives, erpGetRoutes } from "./erp.js";
import { optionFigures, baselineFigures, decisionEffects, toolLine, toolDefinitions } from "./tools.js";
import { buildSystemPrompt, buildOpeningMessage } from "./prompt.js";
import { estimateEur } from "./cost.js";
import { eurCompact, eurCents, eurExact, shortDate, days, pct, words } from "./format.js";

export const STEPS = [
  { id: "spot", label: "Spot", hint: "the report", lead: "An unverified report reaches the agent. It checks our suppliers and routes to see whether we are exposed." },
  { id: "check", label: "Check", hint: "a second source", lead: "One report is not enough. The agent looks for a second, independent source before it raises an alert." },
  { id: "calculate", label: "Calculate", hint: "the impact", lead: "A deterministic engine, not the AI, works out when each plant runs short and what a stopped line costs. The agent tests its first estimate against the evidence." },
  { id: "propose", label: "Propose", hint: "your decision", lead: "The engine prices three responses next to doing nothing. The agent recommends one; you decide." },
  { id: "prepare", label: "Prepare", hint: "the drafts", lead: "The agent drafts the emails and bookings for the option you approved. Each waits for your approval, and nothing is sent." }
];

export const DEMO_ID = "SC-TNG-FIRE";
const SLUGS = { "SC-TNG-FIRE": "tangier", "SC-RTM-STRIKE": "rotterdam", "SC-RHINE-LOW": "rhine", "SC-HSC-QUAKE": "hsinchu", "SC-STYRIA-FLOOD": "styria", "SC-REDSEA": "red-sea" };
const LETTERS = ["A", "B", "C"];

/** The six scenarios, the demo's first, each with the slug its link uses (?scenario=rhine). */
export function scenarioList() {
  const all = (globalThis.SCENARIOS || []).map((s) => ({ ...s, slug: SLUGS[s.id] }));
  return [...all.filter((s) => s.id === DEMO_ID), ...all.filter((s) => s.id !== DEMO_ID)];
}
export const findScenario = (slugOrId) => scenarioList().find((s) => s.slug === slugOrId || s.id === slugOrId) || scenarioList()[0];

/** The step a live run's phase belongs to. A run only moves forward, so a late check stays in Calculate. */
export function stepForPhase(phase, current = "spot") {
  const at = { scanning: "spot", diagnosing: "spot", verifying: "check", simulating: "calculate", options: "propose", awaiting_approval: "propose", executing: "prepare" }[phase];
  const i = (id) => STEPS.findIndex((s) => s.id === id);
  if (!at) return current;
  if (phase === "awaiting_approval" && i(current) >= i("prepare")) return current;
  return i(at) > i(current) ? at : current;
}

const ERP = {
  erp_get_overview: (m) => erpOverview(m),
  erp_list_suppliers: (m, i) => erpListSuppliers(m, i),
  erp_get_supplier: (m, i) => erpGetSupplier(m, i.supplier_id),
  erp_get_part: (m, i) => erpGetPart(m, i.part_id),
  erp_get_open_pos: (m, i) => erpGetOpenPOs(m, i),
  erp_get_alternatives: (m, i) => erpGetAlternatives(m, i.part_id),
  erp_get_routes: (m, i) => erpGetRoutes(m, i.node_or_supplier ?? "")
};

// ---- placeholders ---------------------------------------------------------------------------------------

/** Prices from Nordwerk's records that the scripts quote: {{part.P-DSP.air}}, {{alt.A-KEN-HAR.qualification}} … */
function recordVars(model) {
  const v = {};
  for (const p of model.parts.values()) {
    if (p.air?.premium_eur_per_unit) v[`part.${p.id}.air`] = eurExact(p.air.premium_eur_per_unit);
    if (p.build_shy?.rework_eur_per_vehicle) v[`part.${p.id}.rework`] = eurExact(p.build_shy.rework_eur_per_vehicle);
  }
  for (const a of model.alternatives.values()) if (a.qualification_cost_eur) v[`alt.${a.id}.qualification`] = eurExact(a.qualification_cost_eur);
  return v;
}

/** The values one engine result gives the script: {{var}}, {{first_stop_day}}, {{V2.mit}} … */
export function impactVars(model, which, res, today) {
  const v = {};
  const pre = which === "hypothesis" ? "hyp." : "";
  const b = res.baseline;
  v[`${pre}var`] = eurCompact(b.value_at_risk_eur);
  v[`${pre}first_stop_day`] = b.first_stop_day === null ? "none" : String(b.first_stop_day);
  v[`${pre}first_stop_date`] = b.first_stop_day === null ? "no date" : shortDate(b.first_stop_day, today);
  v[`${pre}first_stop_plant`] = b.first_stop_plant ? model.plants.get(b.first_stop_plant)?.short || b.first_stop_plant : "no plant";
  for (const p of b.parts || []) {
    const key = `${pre}part.${p.part_id}${p.at_supplier ? `@${p.at_supplier}` : ""}`;
    if (`${key}.shortage_day` in v) continue;
    v[`${key}.shortage_day`] = p.shortage_day === null ? "none" : String(p.shortage_day);
    v[`${key}.shortage_date`] = p.shortage_day === null ? "no date" : shortDate(p.shortage_day, today);
  }
  for (const pl of b.plants) {
    v[`${pre}plant.${pl.plant_id}.stop_days`] = String(pl.stop_days);
    v[`${pre}plant.${pl.plant_id}.first_stop_day`] = pl.first_stop_day === null ? "none" : String(pl.first_stop_day);
    v[`${pre}plant.${pl.plant_id}.exposure`] = eurCompact(pl.exposure_eur);
  }
  for (const x of res.variants || []) {
    v[`${x.variant_id}.mit`] = eurCompact(x.mitigation_cost_eur);
    v[`${x.variant_id}.res`] = eurCompact(x.residual_var_eur);
    v[`${x.variant_id}.total`] = eurCompact(x.total_cost_eur);
    v[`${x.variant_id}.save`] = eurCompact(x.savings_vs_baseline_eur);
    v[`${x.variant_id}.time`] = String(x.time_to_effect_days);
    v[`${x.variant_id}.first_stop_day`] = x.first_stop_day === null ? "none" : String(x.first_stop_day);
  }
  return v;
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Fills {{key}} from vars; {{date:+N}} becomes the short date N days from today. */
export function fill(vars, text, today = new Date()) {
  return String(text ?? "").replace(PLACEHOLDER, (m, key) => {
    const d = /^date:\+?(-?\d+)$/.exec(key);
    if (d) return shortDate(Number(d[1]), today);
    return key in vars ? vars[key] : m;
  });
}
const fillAll = (vars, obj, today) => JSON.parse(JSON.stringify(obj), (k, v) => (typeof v === "string" ? fill(vars, v, today) : v));

// ---- the scripted run -------------------------------------------------------------------------------------

/**
 * A scenario's scripted run as the page shows it: the events of each step up to the decision, the
 * options, the branches for each decision, and the estimate of what the same run costs live.
 */
export function scriptedRun(scenarioId, today = new Date()) {
  const model = getModel();
  const scenario = findScenario(scenarioId);
  const script = globalThis.SIM_RUNS[scenario.id];
  const run = {
    mode: "simulation", model, scenario, today, vars: recordVars(model), results: {}, options: null, branches: null,
    events: Object.fromEntries(STEPS.map((s) => [s.id, []])), n: 0,
    turns: [{ sent: buildOpeningMessage({ today: "today", seed: scenario.seed, scenarioTitle: scenario.title }), wrote: "", searches: 0 }]
  };
  const marks = script.steps.map((s, i) => [s.state, i]).filter(([s]) => s);
  const check = marks.find(([s]) => s === "verifying")?.[1] ?? Infinity;
  const calc = marks.find(([s, i]) => s === "diagnosing" && i > check)?.[1] ?? Infinity;
  const propose = [...marks].reverse().find(([s]) => s === "diagnosing")?.[1] ?? Infinity;
  const stepAt = (i) => (i >= propose ? "propose" : i >= calc ? "calculate" : i >= check ? "check" : "spot");
  script.steps.forEach((entry, i) => play(run, entry, stepAt(i)));
  // The estimate follows the presenter's path: the recommended option, every draft approved.
  const shadow = { ...run, events: Object.fromEntries(STEPS.map((s) => [s.id, []])), turns: run.turns.map((t) => ({ ...t })) };
  for (const entry of run.branches?.approved?.[run.options?.recommended] || []) play(shadow, entry, "prepare");
  shadow.turns.push({ sent: JSON.stringify({ ok: true }), wrote: "Done.", searches: 0 });
  run.recDrafts = shadow.events.prepare.filter((e) => e.type === "action_draft");
  const prefix = buildSystemPrompt({ model, today: "today", webSearch: true }) + JSON.stringify(toolDefinitions());
  run.estimateEur = estimateEur({ prefix, turns: shadow.turns });
  return run;
}

/** Plays a person's decision on an option into the run: a rejection's words, or the approved branch. */
export function decideScripted(run, optionId, decision) {
  if (decision === "rejected") {
    const text = run.branches?.rejected?.[optionId];
    if (text) push(run, "propose", "narration", { text: fill(run.vars, text, run.today) });
    return;
  }
  for (const [type, payload] of decisionEffects(run.options, optionId)) push(run, "propose", type, payload);
  for (const entry of run.branches?.approved?.[optionId] || []) play(run, entry, "prepare");
}

function push(run, step, type, payload) {
  const ev = { ...payload, type, step, id: `${step}-${++run.n}` };
  run.events[step].push(ev);
  return ev;
}

/** One client tool call as the live agent would make it: a turn ends, its result opens the next one. */
function turn(run, name, input, result) {
  const t = run.turns[run.turns.length - 1];
  t.wrote += JSON.stringify({ name, input });
  run.turns.push({ sent: JSON.stringify(result), wrote: "", searches: 0 });
}

function play(run, entry, step) {
  const { model, vars, today } = run;
  if (entry.say) {
    const text = fill(vars, entry.say, today);
    run.turns[run.turns.length - 1].wrote += text;
    push(run, step, "narration", { text });
  } else if (entry.tool) {
    const result = ERP[entry.tool](model, entry.input || {});
    push(run, step, "tool", { name: entry.tool, line: toolLine(entry.tool, entry.input, result, model) });
    turn(run, entry.tool, entry.input, result);
  } else if (entry.web) {
    const results = entry.web.results || [];
    run.turns[run.turns.length - 1].searches += 1;
    push(run, step, "tool", { name: "web_search", line: toolLine("web_search", { query: entry.web.query }, { results }), sources: results.map((r) => ({ title: r.title, source: r.source, representative: true })) });
  } else if (entry.impact) {
    const spec = globalThis.REFERENCE_CASES[run.scenario.id][entry.impact];
    const res = simulateImpact(model, spec, { now: today });
    run.results[entry.impact] = res;
    Object.assign(vars, impactVars(model, entry.impact, res, today));
    const b = res.baseline;
    push(run, step, "tool", { name: "sim_impact", line: toolLine("sim_impact", spec, res) });
    push(run, step, "kpi_update", {
      which: entry.impact, label: spec.label, value_at_risk_eur: b.value_at_risk_eur, first_stop_day: b.first_stop_day,
      first_stop_plant_name: b.first_stop_plant ? model.plants.get(b.first_stop_plant)?.short : null,
      min_output_pct: baselineFigures(model, b).min_output_pct, series: res.ui
    });
    turn(run, "sim_impact", spec, compactForModel(res));
  } else if (entry.alert) {
    const a = fillAll(vars, entry.alert, today);
    push(run, step, "alert", { ...a, basis: "verified" });
    turn(run, "ui_report_alert", a, { ok: true });
  } else if (entry.map) {
    push(run, step, "map_update", entry.map);
    turn(run, "ui_mark_map", entry.map, { ok: true });
  } else if (entry.options) {
    const src = run.results.disruption;
    const o = entry.options;
    run.options = {
      recommended: o.recommended,
      options: src.variants.map((v, k) => ({
        id: v.variant_id, letter: LETTERS[k], recommended: v.variant_id === o.recommended,
        ...fillAll(vars, o.texts[v.variant_id], today), ...optionFigures(model, v)
      })),
      baseline: baselineFigures(model, src.baseline, fill(vars, o.baseline_description, today))
    };
    push(run, step, "options", run.options);
    turn(run, "ui_propose_options", o.texts, { decision: "approved", option_id: o.recommended });
  } else if (entry.awaitOption) {
    run.branches = entry.awaitOption;
  } else if (entry.draft) {
    const d = fillAll(vars, entry.draft, today);
    const { type: kind, ...rest } = d;
    push(run, step, "action_draft", { ...rest, kind, action_id: `act-${run.events.prepare.filter((e) => e.type === "action_draft").length + 1}`, status: "pending" });
    turn(run, "ui_draft_action", d, { status: "pending_approval" });
  } else if (entry.awaitActions) {
    turn(run, "ui_await_approvals", {}, { all_decided: true });
  } else if (entry.report) {
    const markdown = fill(vars, entry.report, today);
    push(run, step, "report", { markdown });
    turn(run, "ui_final_report", { markdown }, { ok: true });
  }
}

// ---- the figures the guide and the key figures state --------------------------------------------------------

const COUNTED = { email: ["email", "emails"], booking: ["booking", "bookings"], replan: ["note to the plant", "notes to the plant"] };

/** Every figure the page writes into [data-fig], computed from a scripted run: data-fig name → text. */
export function figures(run) {
  const model = run.model;
  const k = Object.values(run.events).flat().filter((e) => e.type === "kpi_update");
  const first = k[0], last = k[k.length - 1];
  const rec = run.options.options.find((o) => o.recommended);
  const supplier = run.scenario.exposure_check?.supplier_ids?.[0];
  const plantId = [...model.plants.values()].find((p) => p.short === last.first_stop_plant_name)?.id;
  const share = supplier ? Math.max(0, ...(model.flowsFrom.get(supplier) || []).filter((f) => f.to === plantId).map((f) => f.share)) : 0;
  const types = Object.keys(COUNTED).map((t) => [t, run.recDrafts.filter((d) => d.kind === t).length]).filter(([, n]) => n);
  const parts = types.map(([t, n]) => `${words(n)} ${COUNTED[t][n === 1 ? 0 : 1]}`);
  const drafts = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join("");
  return {
    var: eurCompact(last.value_at_risk_eur),
    "hyp-var": eurCompact(first.value_at_risk_eur),
    "stop-day": String(last.first_stop_day),
    "stop-days": days(last.first_stop_day),
    "stop-plant": last.first_stop_plant_name,
    share: pct(Math.round(share * 100)),
    rec: rec.letter,
    "rec-cost": eurCompact(rec.mitigation_cost_eur),
    "rec-left": eurCompact(rec.residual_var_eur),
    estimate: eurCents(run.estimateEur),
    drafts: drafts.charAt(0).toUpperCase() + drafts.slice(1)
  };
}

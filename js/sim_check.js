// Integrity checks for simulation scripts (data/sim_runs.js), run in Diagnostics and in
// tools/check_world.mjs. They make sure a scripted replay can never show an invented number or a
// broken path on stage:
//   - every step is a known type; tools, ids and impact specifications are valid;
//   - every {{placeholder}} resolves from an engine result at that point of the script;
//   - the verification pattern is present (hypothesis, two pieces of evidence before a verified
//     alert, a visible "Revised:" self-correction) with at least 8 visible tool calls;
//   - options have texts for exactly the engine's three variants, and every approval path drafts,
//     waits for the outbox decisions, reports and ends; drafts carry the AI footer;
//   - reports are marked as simulated or recorded, never as live.

import { simulateImpact } from "./impact.js";
import { impactVars, unresolvedKeys } from "./sim_vars.js";
import { erpOverview, erpListSuppliers, erpGetSupplier, erpGetPart, erpGetOpenPOs, erpGetAlternatives, erpGetRoutes } from "./erp.js";

const ERP = {
  erp_get_overview: (m) => erpOverview(m),
  erp_list_suppliers: (m, i) => erpListSuppliers(m, i),
  erp_get_supplier: (m, i) => erpGetSupplier(m, i.supplier_id),
  erp_get_part: (m, i) => erpGetPart(m, i.part_id),
  erp_get_open_pos: (m, i) => erpGetOpenPOs(m, i),
  erp_get_alternatives: (m, i) => erpGetAlternatives(m, i.part_id),
  erp_get_routes: (m, i) => erpGetRoutes(m, i.node_or_supplier ?? i.query ?? "")
};
const GEO = new Set(["geo_weather", "geo_earthquakes", "geo_natural_events", "geo_rhine_level"]);
const KINDS = ["state", "say", "think", "tool", "web", "geo", "recordedTool", "impact", "alert", "map", "options", "awaitOption", "draft", "awaitActions", "report", "notice", "end"];
const STATES = new Set(["scanning", "diagnosing", "verifying", "simulating", "options", "awaiting_approval", "executing"]);
const MAP_STATES = new Set(["affected", "at_risk", "resolved", "neutral"]);
const FOOTER = "Requires human approval before sending";

/** Checks for every preset scenario's script. Returns [{name, ok, detail}]. */
export function checkSimRuns(model, simRuns = {}, scenarios = [], referenceCases = {}) {
  const checks = [];
  for (const sc of scenarios) {
    const def = simRuns[sc.id];
    if (!def) {
      checks.push({ name: `Simulation ${sc.number}: script present`, ok: false, detail: `no script for ${sc.id}` });
      continue;
    }
    const r = checkSimRun(model, sc.id, def, referenceCases[sc.id] || {});
    checks.push({
      name: `Simulation ${sc.number}: script valid (${def.source === "recorded" ? "recorded live run" : "authored"})`,
      ok: r.errors.length === 0,
      detail: r.errors.length ? r.errors.slice(0, 3).join(" | ") : r.summary
    });
  }
  return checks;
}

/** Validates one script. Returns { errors: string[], summary }. */
export function checkSimRun(model, scenarioId, def, rc = {}) {
  const errors = [];
  const recorded = def.source === "recorded";
  const stats = { visibleCalls: 0, evidenceBeforeAlert: 0, alerts: 0, hypothesis: false, revised: false, branches: 0, drafts: 0 };
  if (!def || !Array.isArray(def.steps) || !def.steps.length) {
    return { errors: ["the script has no steps"], summary: "" };
  }

  const knownId = (id) => model.suppliers.has(id) || model.plants.has(id) || model.nodes.has(id) || model.routes.has(id) ||
    model.alternatives.has(id) || [...model.routes.values()].some((r) => (r.alternatives || []).some((a) => a.id === id));

  walk(def.steps, { vars: {}, results: {}, lastWithVariants: null, options: null }, "main", true);

  if (!recorded) {
    if (stats.visibleCalls < 8) errors.push(`only ${stats.visibleCalls} visible tool calls before the decision (at least 8 expected)`);
    if (!stats.hypothesis) errors.push("no \"Hypothesis:\" narration");
    if (!stats.revised) errors.push("no visible \"Revised:\" self-correction");
    if (stats.alerts && stats.evidenceBeforeAlert < 2) errors.push("the verified alert is raised on fewer than two pieces of evidence");
  }
  if (!stats.branches) errors.push("no approval path");
  const summary = `${stats.visibleCalls} tool calls before the decision, ${stats.branches} approval paths, ${stats.drafts} drafts`;
  return { errors, summary };

  function walk(steps, st, path, main) {
    for (const [i, step] of steps.entries()) {
      const where = `${path}[${i}]`;
      const kinds = KINDS.filter((k) => k in step);
      if (kinds.length !== 1) {
        errors.push(`${where}: expected one step type, found ${kinds.join(", ") || "none"}`);
        continue;
      }
      const kind = kinds[0];
      const text = (t, label) => {
        const u = unresolvedKeys(st.vars, t);
        if (u.length) errors.push(`${where} ${label}: {{${u[0]}}} does not resolve here`);
      };
      switch (kind) {
        case "state":
          if (!STATES.has(step.state)) errors.push(`${where}: unknown state "${step.state}"`);
          break;
        case "say":
          text(step.say, "narration");
          if (main && /(^|\n)\s*Hypothesis:/i.test(step.say)) stats.hypothesis = true;
          if (/(^|\n)\s*Revised:/i.test(step.say)) stats.revised = true;
          break;
        case "think":
          text(step.think, "reasoning");
          break;
        case "tool": {
          const fn = ERP[step.tool];
          if (!fn) { errors.push(`${where}: unknown ERP tool "${step.tool}"`); break; }
          const res = fn(model, step.input || {});
          if (res?.error && !recorded) errors.push(`${where}: ${step.tool} returns an error (${res.error})`);
          if (main) stats.visibleCalls += 1;
          break;
        }
        case "web":
          if (!String(step.web?.query || "").trim()) errors.push(`${where}: web search without a query`);
          if (!recorded && step.web?.ok !== false && !(step.web?.results || []).length) errors.push(`${where}: web search without results`);
          if (main) { stats.visibleCalls += 1; if (!stats.alerts) stats.evidenceBeforeAlert += 1; }
          break;
        case "geo":
          if (!GEO.has(step.geo)) errors.push(`${where}: unknown open-data tool "${step.geo}"`);
          text(step.summary, "geo summary");
          if (main) { stats.visibleCalls += 1; if (!stats.alerts && step.ok !== false) stats.evidenceBeforeAlert += 1; }
          break;
        case "recordedTool":
          if (!step.recordedTool?.name) errors.push(`${where}: recorded tool without a name`);
          if (main) stats.visibleCalls += 1;
          break;
        case "impact": {
          const isRef = typeof step.impact === "string";
          const name = isRef ? step.impact : step.impact?.name;
          const spec = isRef ? rc[step.impact] : step.impact?.spec;
          if (!name || !spec) { errors.push(`${where}: impact "${name}" has no specification`); break; }
          const res = simulateImpact(model, spec);
          if (!res.ok) { errors.push(`${where}: the engine rejects "${name}": ${res.errors[0]}`); break; }
          st.results[name] = res;
          if (res.variants?.length) st.lastWithVariants = name;
          Object.assign(st.vars, impactVars(model, name, res));
          if (main) stats.visibleCalls += 1;
          break;
        }
        case "alert": {
          const a = step.alert || {};
          if (!a.title || !a.summary) errors.push(`${where}: alert needs a title and a summary`);
          if (a.basis !== "what_if" && (a.sources || []).length < 2) errors.push(`${where}: a verified alert needs two sources`);
          for (const id of [...(a.supplier_ids || []), ...(a.route_ids || []), ...(a.node_ids || [])]) if (!knownId(id)) errors.push(`${where}: unknown id ${id}`);
          text(a.title, "alert title");
          text(a.summary, "alert summary");
          if (main) stats.alerts += 1;
          break;
        }
        case "map": {
          const m = step.map || {};
          if (!MAP_STATES.has(m.state)) errors.push(`${where}: unknown map state "${m.state}"`);
          for (const id of [...(m.supplier_ids || []), ...(m.route_ids || []), ...(m.node_ids || []), ...(m.plant_ids || []), ...(Array.isArray(m.fit) ? m.fit : [])]) {
            if (!knownId(id)) errors.push(`${where}: unknown id ${id}`);
          }
          break;
        }
        case "options": {
          const o = step.options || {};
          const from = o.from || (st.results.disruption ? "disruption" : st.lastWithVariants);
          const res = st.results[from];
          if (!res || !res.variants?.length) { errors.push(`${where}: options before a costed impact result`); break; }
          const ids = Array.isArray(o.order) && o.order.length ? o.order : res.variants.slice(0, 3).map((v) => v.variant_id);
          if (!recorded && res.variants.length !== 3) errors.push(`${where}: the impact result has ${res.variants.length} variants, not 3`);
          if (ids.length !== 3) errors.push(`${where}: ${ids.length} options instead of 3`);
          for (const id of ids) if (!res.variants.some((v) => v.variant_id === id)) errors.push(`${where}: option ${id} is not a costed variant`);
          for (const id of ids) {
            const t = o.texts?.[id];
            if (!t?.title || !t?.description) errors.push(`${where}: option ${id} needs a title and a description`);
            text(t?.title, `option ${id} title`);
            text(t?.description, `option ${id} description`);
            text(t?.residual_risk, `option ${id} residual risk`);
          }
          if (!ids.includes(o.recommended)) errors.push(`${where}: recommended "${o.recommended}" is not one of ${ids.join(", ")}`);
          text(o.baseline_description, "baseline description");
          st.options = ids;
          break;
        }
        case "awaitOption": {
          const a = step.awaitOption || {};
          if (!st.options) { errors.push(`${where}: waiting for a decision before options are shown`); break; }
          const approved = a.approved || {};
          if (!recorded) {
            for (const id of [...st.options, "baseline"]) if (!approved[id] && !approved.default) errors.push(`${where}: no path for approving ${id}`);
            for (const id of st.options) if (!a.rejected?.[id]) errors.push(`${where}: no line for rejecting ${id}`);
          }
          for (const [id, line] of Object.entries(a.rejected || {})) text(line, `rejection line ${id}`);
          for (const [id, branch] of Object.entries(approved)) {
            if (!Array.isArray(branch)) { errors.push(`${where}: approved.${id} is not a step list`); continue; }
            const letter = Math.max(0, st.options.indexOf(id));
            const vars = { ...st.vars, "option.letter": id === "baseline" ? "–" : "ABC"[letter], "option.title": id };
            const sub = { vars, results: { ...st.results }, lastWithVariants: st.lastWithVariants, options: st.options };
            walk(branch, sub, `${where}.approved.${id}`, false);
            checkBranch(branch, `${where}.approved.${id}`, id === "default");
          }
          stats.branches += Object.keys(approved).filter((k) => k !== "default").length;
          if (i < steps.length - 1) errors.push(`${where}: steps after the decision belong inside the approval paths`);
          return;
        }
        case "draft": {
          const d = step.draft || {};
          if (!["email", "booking", "replan"].includes(d.type)) errors.push(`${where}: draft type "${d.type}"`);
          if (!d.recipient || !d.subject) errors.push(`${where}: draft needs a recipient and a subject`);
          if (d.type === "booking" && !/Mock booking/i.test(d.body || "")) errors.push(`${where}: booking draft must say it is a mock booking`);
          if (d.type !== "booking" && !String(d.body || "").includes(FOOTER)) errors.push(`${where}: draft lacks the AI footer`);
          text(d.subject, "draft subject");
          text(d.body, "draft body");
          stats.drafts += 1;
          break;
        }
        case "awaitActions":
          Object.assign(st.vars, { "actions.total": "n", "actions.approved": "n", "actions.rejected": "n" });
          break;
        case "report":
          text(step.report, "report");
          if (/Live agent run/i.test(step.report)) errors.push(`${where}: a simulated report must not call itself a live run`);
          if (!/Simulated run|Recorded live run/i.test(step.report)) errors.push(`${where}: report lacks the simulation marker`);
          break;
        case "notice":
          text(step.notice?.text, "notice");
          break;
        case "end":
          if (!["done", "no_findings"].includes(step.end)) errors.push(`${where}: end must be "done" or "no_findings"`);
          break;
        default:
          break;
      }
    }
  }

  function checkBranch(branch, where, isDefault) {
    const last = branch[branch.length - 1];
    if (!last || !("end" in last)) errors.push(`${where}: the path must end with an end step`);
    if (isDefault) return;
    const kinds = branch.map((s) => KINDS.find((k) => k in s));
    if (!kinds.includes("report")) errors.push(`${where}: the path publishes no report`);
    if (kinds.includes("draft") && kinds.indexOf("awaitActions") < kinds.lastIndexOf("draft")) errors.push(`${where}: drafts after the outbox wait`);
    if (kinds.includes("report") && kinds.includes("draft") && kinds.indexOf("report") < kinds.indexOf("awaitActions")) errors.push(`${where}: report before the outbox decisions`);
  }
}

// Simulation player: replays an authored run (data/sim_runs.js) through the same run-event bus the
// live agent uses. ERP results come from the real ERP queries and every € figure from the real
// impact engine, so a simulated run shows exactly what the live agent would compute for the same
// assumptions. Only external evidence (web search, open data) is representative and labelled so.

import { bus } from "./events.js";
import { getModel } from "./world.js";
import { simulateImpact, compactForModel } from "./impact.js";
import { erpOverview, erpListSuppliers, erpGetSupplier, erpGetPart, erpGetOpenPOs, erpGetAlternatives, erpGetRoutes } from "./erp.js";
import { summarizeToolResult } from "./summaries.js";
import { eurCompact, shortDate } from "./format.js";

const ABORT = Symbol("abort");
const ERP = {
  erp_get_overview: (m) => erpOverview(m),
  erp_list_suppliers: (m, i) => erpListSuppliers(m, i),
  erp_get_supplier: (m, i) => erpGetSupplier(m, i.supplier_id),
  erp_get_part: (m, i) => erpGetPart(m, i.part_id),
  erp_get_open_pos: (m, i) => erpGetOpenPOs(m, i),
  erp_get_alternatives: (m, i) => erpGetAlternatives(m, i.part_id),
  erp_get_routes: (m, i) => erpGetRoutes(m, i.query)
};
const LETTERS = ["A", "B", "C"];
const REPRESENTATIVE = "Representative result recorded for this simulation; not a live reading.";

export function createSimulationPlayer({ getSpeed }) {
  let ctx = null;

  async function play(runDef, { scenario }) {
    const run = {
      model: getModel(), scenario, vars: {}, results: {}, cancelled: false, ended: false,
      msg: 0, call: 0, waiters: new Set(), drafts: new Map(), optionsCallId: null,
      decisions: [], poke: null
    };
    ctx = run;
    // Human decisions are captured from the start of the run, so none is lost while the player is
    // busy narrating (for example when "Approve all" sends five decisions in one go).
    const offs = ["option_decision", "action_decision"].map((type) => bus.on(type, (ev) => receiveDecision(run, ev)));
    try {
      bus.emit("cost_update", { simulated: true, eur: 0, usd: 0, input_tokens: 0, output_tokens: 0, web_searches: 0 });
      await runSteps(run, runDef.steps);
      if (!run.ended && !run.cancelled) end(run, "done");
    } catch (e) {
      if (e === ABORT) return;
      console.error(e);
      bus.emit("notice", { level: "error", text: `Simulation stopped: ${e.message}` });
      end(run, "error", e.message);
    } finally {
      offs.forEach((off) => off());
      if (ctx === run) ctx = null;
    }
  }

  function abort(reason = "Stopped by the user.") {
    if (!ctx || ctx.ended) return;
    const run = ctx;
    run.cancelled = true;
    for (const w of run.waiters) w(ABORT);
    run.waiters.clear();
    end(run, "aborted", reason);
  }

  return { play, abort, isActive: () => !!ctx && !ctx.ended };

  // -------------------------------------------------------------------------------------------

  function end(run, status, reason) {
    if (run.ended) return;
    run.ended = true;
    bus.emit("state_change", { state: status === "done" ? "done" : status === "aborted" ? "aborted" : status === "error" ? "error" : "done" });
    bus.emit("run_end", { status, reason });
  }

  function wait(run, ms) {
    if (run.cancelled) return Promise.reject(ABORT);
    const speed = Math.max(0.25, Number(getSpeed()) || 1);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { run.waiters.delete(cancel); resolve(); }, ms / speed);
      const cancel = () => { clearTimeout(t); reject(ABORT); };
      run.waiters.add(cancel);
    });
  }

  function receiveDecision(run, ev) {
    if (run.ended) return;
    if (ev.type === "action_decision") {
      const id = ev.payload.action_id;
      if (run.drafts.get(id) === "pending") run.drafts.set(id, ev.payload.decision);
    } else {
      run.decisions.push(ev);
    }
    run.poke?.();
  }

  /** Takes the oldest queued option decision that matches, or null. */
  function takeOptionDecision(run, predicate = () => true) {
    const i = run.decisions.findIndex((ev) => predicate(ev));
    return i >= 0 ? run.decisions.splice(i, 1)[0] : null;
  }

  /** Resolves with the first truthy value of test(), re-checked whenever a decision arrives. */
  function waitUntil(run, test) {
    if (run.cancelled) return Promise.reject(ABORT);
    const now = test();
    if (now) return Promise.resolve(now);
    return new Promise((resolve, reject) => {
      const check = () => {
        const v = test();
        if (!v) return;
        if (run.poke === check) run.poke = null;
        run.waiters.delete(cancel);
        resolve(v);
      };
      const cancel = () => {
        if (run.poke === check) run.poke = null;
        reject(ABORT);
      };
      run.poke = check;
      run.waiters.add(cancel);
    });
  }

  async function runSteps(run, steps = []) {
    for (const step of steps) {
      if (run.cancelled) throw ABORT;
      if (run.ended) return;
      await runStep(run, step);
    }
  }

  async function runStep(run, step) {
    if (step.pause) await wait(run, step.pause);

    if (step.state) {
      bus.emit("state_change", { state: step.state });
      await wait(run, 250);
    } else if (step.say) {
      await say(run, fill(run, step.say));
    } else if (step.think) {
      bus.emit("reasoning", { msg_id: `sim-r${++run.msg}`, text: fill(run, step.think), done: true });
      await wait(run, 300);
    } else if (step.tool) {
      await erpTool(run, step.tool, step.input || {});
    } else if (step.web) {
      await webSearch(run, step.web);
    } else if (step.geo) {
      await geoTool(run, step);
    } else if (step.impact) {
      await impact(run, step.impact);
    } else if (step.alert) {
      await uiTool(run, "ui_report_alert", step.alert, () => bus.emit("alert", resolveObj(run, step.alert)));
    } else if (step.map) {
      const p = resolveObj(run, step.map);
      await uiTool(run, "ui_mark_map", p, () => bus.emit("map_update", p), 250);
    } else if (step.options) {
      await proposeOptions(run, step.options);
    } else if (step.awaitOption) {
      await awaitOption(run, step.awaitOption);
    } else if (step.draft) {
      await draft(run, step.draft);
    } else if (step.awaitActions) {
      await awaitActions(run);
    } else if (step.report) {
      const markdown = fill(run, step.report);
      await uiTool(run, "ui_final_report", { markdown_chars: markdown.length }, () => bus.emit("report", { markdown }), 600);
    } else if (step.end) {
      end(run, step.end);
    }
  }

  async function say(run, text) {
    const id = `sim-n${++run.msg}`;
    await wait(run, 350);
    const words = text.split(/(\s+)/);
    const chunk = 6;
    let out = "";
    for (let i = 0; i < words.length; i += chunk) {
      out += words.slice(i, i + chunk).join("");
      bus.emit("narration", { msg_id: id, text: out, done: false });
      await wait(run, Math.max(40, (words.slice(i, i + chunk).join("").length / 70) * 1000));
    }
    bus.emit("narration", { msg_id: id, text, done: true });
    await wait(run, 300);
  }

  async function erpTool(run, name, input) {
    const call_id = `sim-c${++run.call}`;
    bus.emit("tool_call", { call_id, name, input, server: false });
    await wait(run, 700);
    const fn = ERP[name];
    const result = fn ? fn(run.model, input) : { error: `Unknown tool ${name}` };
    bus.emit("tool_result", { call_id, name, ok: !result?.error, summary: summarizeToolResult(name, result), result, server: false });
    await wait(run, 350);
  }

  async function webSearch(run, w) {
    const call_id = `sim-c${++run.call}`;
    bus.emit("tool_call", { call_id, name: "web_search", input: { query: w.query }, server: true });
    await wait(run, 1600);
    const results = (w.results || []).map((r) => ({ title: r.title, source: r.source, page_age: r.page_age || null, url: null }));
    bus.emit("tool_result", {
      call_id, name: "web_search", ok: true, server: true,
      summary: w.summary || `${results.length} result${results.length === 1 ? "" : "s"} (representative)`,
      sources: results.map((r) => ({ title: `${r.title} — ${r.source}`, url: null, page_age: r.page_age, representative: true })),
      result: { note: REPRESENTATIVE, query: w.query, results }
    });
    await wait(run, 400);
  }

  async function geoTool(run, step) {
    const call_id = `sim-c${++run.call}`;
    bus.emit("tool_call", { call_id, name: step.geo, input: step.input || {}, server: false });
    await wait(run, 900);
    const result = { ...(step.result || {}), note: REPRESENTATIVE };
    bus.emit("tool_result", { call_id, name: step.geo, ok: true, summary: fill(run, step.summary || "Data received (representative)"), result, server: false });
    await wait(run, 350);
  }

  async function impact(run, which) {
    const rc = globalThis.REFERENCE_CASES?.[run.scenario];
    const spec = rc?.[which];
    if (!spec) throw new Error(`No reference case "${which}" for ${run.scenario}`);
    const call_id = `sim-c${++run.call}`;
    bus.emit("state_change", { state: "simulating" });
    bus.emit("tool_call", { call_id, name: "sim_impact", input: spec, server: false });
    await wait(run, 1200);
    const res = simulateImpact(run.model, spec);
    if (!res.ok) throw new Error(`Engine rejected the reference case: ${res.errors.join("; ")}`);
    run.results[which] = res;
    setImpactVars(run, which, res);
    bus.emit("tool_result", { call_id, name: "sim_impact", ok: true, summary: summarizeToolResult("sim_impact", res), result: compactForModel(res), server: false });
    const b = res.baseline;
    bus.emit("kpi_update", {
      value_at_risk_eur: b.value_at_risk_eur, horizon_days: res.horizon_days,
      first_stop_day: b.first_stop_day, first_stop_plant: b.first_stop_plant,
      first_stop_plant_name: b.first_stop_plant ? run.model.plants.get(b.first_stop_plant).short : null,
      search_days: 60, label: which === "hypothesis" ? "initial estimate" : "after verification",
      series: res.ui
    });
    await wait(run, 400);
  }

  async function proposeOptions(run, def) {
    const res = run.results.disruption;
    if (!res) throw new Error("Options need the verified impact first");
    const call_id = `sim-c${++run.call}`;
    run.optionsCallId = call_id;
    const options = res.variants.map((v, i) => {
      const t = def.texts?.[v.variant_id] || {};
      return {
        id: v.variant_id, letter: LETTERS[i],
        title: fill(run, t.title || v.name), description: fill(run, t.description || v.mitigations.join("; ")),
        mitigation_cost_eur: v.mitigation_cost_eur, residual_var_eur: v.residual_var_eur, total_cost_eur: v.total_cost_eur,
        savings_eur: v.savings_vs_baseline_eur, time_days: v.time_to_effect_days,
        residual_risk: fill(run, t.residual_risk || ""), recommended: v.variant_id === def.recommended
      };
    });
    run.options = options;
    const b = res.baseline;
    const payload = {
      call_id, horizon_days: res.horizon_days, recommended: def.recommended, options,
      baseline: {
        value_at_risk_eur: b.value_at_risk_eur, first_stop_day: b.first_stop_day, first_stop_plant: b.first_stop_plant,
        first_stop_plant_name: b.first_stop_plant ? run.model.plants.get(b.first_stop_plant).short : null,
        description: fill(run, def.baseline_description || "")
      }
    };
    bus.emit("state_change", { state: "options" });
    bus.emit("tool_call", { call_id, name: "ui_propose_options", input: { options: options.map((o) => ({ variant_id: o.id, title: o.title })), baseline_cost_eur: b.value_at_risk_eur }, server: false });
    await wait(run, 300);
    bus.emit("options", payload);
    await wait(run, 300);
  }

  async function awaitOption(run, def) {
    const rejected = new Set();
    for (;;) {
      bus.emit("state_change", { state: "awaiting_approval" });
      const ev = await waitUntil(run, () => takeOptionDecision(run));
      const { option_id: id, decision } = ev.payload;
      bus.emit("tool_result", { call_id: run.optionsCallId, name: "ui_propose_options", ok: true, server: false, summary: `Human decision: ${decision} ${id}`, result: { decision, option_id: id, decided_by: "user" } });
      if (decision === "approved") {
        const opt = run.options.find((o) => o.id === id);
        run.vars["option.letter"] = opt ? opt.letter : "–";
        run.vars["option.title"] = opt ? opt.title : "Do nothing";
        if (opt) bus.emit("kpi_update", { residual_eur: opt.residual_var_eur, option_label: `Option ${opt.letter}` });
        await runSteps(run, def.approved?.[id] || def.approved?.default || []);
        return;
      }
      rejected.add(id);
      const line = def.rejected?.[id];
      if (line) await say(run, fill(run, line));
      if (rejected.size >= run.options.length) {
        await runSteps(run, def.allRejected || [
          { say: "All three options were rejected. I am not taking any action; the do-nothing exposure stands. You can accept the risk or reset and run a different analysis." }
        ]);
        if (!def.allRejected) {
          await waitUntil(run, () => takeOptionDecision(run, (e) => e.payload.option_id === "baseline" && e.payload.decision === "approved"));
          await runSteps(run, def.approved?.baseline || []);
        }
        return;
      }
    }
  }

  async function draft(run, d) {
    const action_id = `sim-a${run.drafts.size + 1}`;
    const p = { action_id, type: d.type || "email", recipient: fill(run, d.recipient), subject: fill(run, d.subject), body: fill(run, d.body || ""), payload: d.payload ? resolveObj(run, d.payload) : undefined, status: "pending" };
    run.drafts.set(action_id, "pending");
    await uiTool(run, "ui_draft_action", { type: p.type, recipient: p.recipient, subject: p.subject }, () => bus.emit("action_draft", p), 500);
  }

  async function awaitActions(run) {
    const pending = () => [...run.drafts.values()].filter((s) => s === "pending").length;
    if (pending()) bus.emit("notice", { level: "info", text: `Waiting for your approval of ${pending()} draft${pending() === 1 ? "" : "s"} in the Outbox.` });
    await waitUntil(run, () => pending() === 0);
    const all = [...run.drafts.values()];
    run.vars["actions.total"] = String(all.length);
    run.vars["actions.approved"] = String(all.filter((s) => s === "approved").length);
    run.vars["actions.rejected"] = String(all.filter((s) => s === "rejected").length);
    await wait(run, 300);
  }

  async function uiTool(run, name, input, effect, delay = 450) {
    const call_id = `sim-c${++run.call}`;
    bus.emit("tool_call", { call_id, name, input: resolveObj(run, input), server: false });
    await wait(run, delay);
    effect();
    bus.emit("tool_result", { call_id, name, ok: true, server: false, summary: "Done", result: { ok: true } });
    await wait(run, 250);
  }

  // ---- placeholders ---------------------------------------------------------------------------

  function setImpactVars(run, which, res) {
    const v = run.vars;
    const pre = which === "hypothesis" ? "hyp." : "";
    const b = res.baseline;
    v[`${pre}var`] = eurCompact(b.value_at_risk_eur);
    v[`${pre}first_stop_day`] = b.first_stop_day === null ? "none" : String(b.first_stop_day);
    v[`${pre}first_stop_date`] = b.first_stop_day === null ? "—" : shortDate(b.first_stop_day);
    v[`${pre}first_stop_plant`] = b.first_stop_plant ? run.model.plants.get(b.first_stop_plant).short : "—";
    for (const p of b.parts || []) {
      const key = `${pre}part.${p.part_id}${p.at_supplier ? `@${p.at_supplier}` : ""}`;
      if (!(`${key}.shortage_day` in v)) {
        v[`${key}.shortage_day`] = p.shortage_day === null ? "none" : String(p.shortage_day);
        v[`${key}.shortage_date`] = p.shortage_day === null ? "—" : shortDate(p.shortage_day);
      }
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
    }
  }

  function fill(run, text) {
    return String(text ?? "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, key) => {
      const dm = /^date:\+?(-?\d+)$/.exec(key);
      if (dm) return shortDate(Number(dm[1]));
      return key in run.vars ? run.vars[key] : m;
    });
  }

  function resolveObj(run, obj) {
    if (typeof obj === "string") return fill(run, obj);
    if (Array.isArray(obj)) return obj.map((x) => resolveObj(run, x));
    if (obj && typeof obj === "object") return Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, resolveObj(run, x)]));
    return obj;
  }
}

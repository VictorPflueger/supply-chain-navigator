// Run recorder: turns a completed live run (its audit event stream) into a simulation script in the
// data/sim_runs.js format, so authored scripts can be replaced by captured real runs.
//
// What is kept: the agent's narration and reasoning summaries, every tool call in order, the
// impact specifications it chose (the player re-runs them through the engine, so € figures are
// recomputed, never copied), the recorded web-search and open-data results (labelled "recorded"),
// alerts, map marks, the options it proposed, its drafts and its report. The human decisions are
// not baked in: the replay waits for new ones. Options the live run did not take end the replay
// gracefully with a note.

import { auditEvents, auditRunInfo } from "./audit.js";
import { redactSecrets } from "./keystore.js";
import { APP } from "./config.js";
import { getModel } from "./world.js";
import { checkSimRun } from "./sim_check.js";
import { downloadText } from "./dom.js";

const PHASES = new Set(["scanning", "diagnosing", "verifying", "simulating", "options", "awaiting_approval", "executing"]);
const REPLAY_FOOTER = "*Recorded live run, replayed in Simulation mode. Nordwerk and its suppliers are fictional; figures come from the deterministic impact engine.*";

/** Can the current run be saved as a simulation? → { ok, reason } */
export function canRecord() {
  const run = auditRunInfo();
  if (!run) return { ok: false, reason: "No run yet. Complete a live run of a preset scenario first." };
  if (run.mode !== "live") return { ok: false, reason: "Only live runs can be saved as a simulation." };
  if (run.entry !== "scenario" || !run.scenario_id) return { ok: false, reason: "Only runs of a preset scenario can replace its simulation." };
  if (run.status !== "done") return { ok: false, reason: run.status === "running" ? "Available when the run has completed." : "Only completed runs can be saved as a simulation." };
  if (!auditEvents().some((e) => e.type === "report")) return { ok: false, reason: "The run ended without a management summary." };
  return { ok: true, reason: "" };
}

/** Builds { key, def } from the audit stream of the last run. */
export function buildRecordedRun() {
  const run = auditRunInfo();
  const events = auditEvents();
  const cost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const steps = toSteps(events);
  const def = {
    title: run.title,
    source: "recorded",
    recorded: {
      at: run.started_at,
      model: run.model,
      app_version: APP.version,
      run_id: run.run_id,
      cost_eur: cost ? Math.round(cost.eur * 100) / 100 : null
    },
    steps
  };
  return { key: run.scenario_id, def };
}

/**
 * Builds, validates and downloads the script of the last run.
 * Returns { ok, message } for the caller to show.
 */
export function saveRunAsSimulation() {
  const can = canRecord();
  if (!can.ok) return { ok: false, message: can.reason };
  const rec = buildRecordedRun();
  const check = checkSimRun(getModel(), rec.key, rec.def, {});
  if (check.errors.length) return { ok: false, message: `The recording is not a valid simulation script (${check.errors[0]}).` };
  const name = recordedRunFileName(rec);
  downloadText(name, recordedRunScript(rec), "text/javascript");
  return { ok: true, message: `Saved ${name}. Append it to data/sim_runs.js to replace the scripted replay of this scenario with this run.` };
}

/** The downloadable script: append it to data/sim_runs.js to replace the authored run. */
export function recordedRunScript({ key, def }) {
  const when = def.recorded.at ? def.recorded.at.replace("T", " ").slice(0, 16) + " UTC" : "unknown time";
  const header = [
    "/*",
    " * NAVIGATOR: recorded live run, exported with \"Save run as simulation\".",
    ` * Scenario: ${key} (${def.title})`,
    ` * Recorded: ${when} on ${def.recorded.model || "unknown model"}, Navigator ${def.recorded.app_version}`,
    " * To use it, append this file's content to the end of data/sim_runs.js. It then replaces the",
    " * authored simulation for this scenario; delete it again to restore the authored one.",
    " */"
  ].join("\n");
  const body = `window.SIM_RUNS = window.SIM_RUNS || {};\nwindow.SIM_RUNS[${JSON.stringify(key)}] = ${JSON.stringify(def, null, 2)};\n`;
  return redactSecrets(`${header}\n${body}`);
}

export function recordedRunFileName({ key, def }) {
  const d = (def.recorded.at || new Date().toISOString()).slice(0, 10).replace(/-/g, "");
  return `sim-run-${key}-recorded-${d}.js`;
}

// ---------------------------------------------------------------------------------------------

function toSteps(events) {
  const main = [];
  let cursor = main;
  const calls = new Map();
  const byMsg = new Map();     // msg_id → step: a retried stream repeats ids, keep the last text
  let impactN = 0;
  let lastWithVariants = null;
  let pendingAwait = null;     // the awaitOption step of the options on screen
  let waiting = false;         // between the options and the approval: the player waits by itself
  let inApprovals = false;     // inside ui_await_approvals: the player handles those states itself
  let rejectionFor = null;     // narration after a rejection becomes that option's rejection line
  let lastState = null;

  const push = (step) => { cursor.push(step); return step; };

  for (const ev of events) {
    const p = ev.payload || {};
    switch (ev.type) {
      case "state_change":
        if (waiting || inApprovals) break;
        if (PHASES.has(p.state) && p.state !== lastState) push({ state: p.state });
        if (PHASES.has(p.state)) lastState = p.state;
        break;
      case "narration": {
        const text = String(p.text || "");
        if (!p.done || !text.trim()) break;
        if (waiting) {
          if (rejectionFor) {
            const prev = pendingAwait.awaitOption.rejected[rejectionFor];
            pendingAwait.awaitOption.rejected[rejectionFor] = prev ? `${prev}\n\n${text}` : text;
          }
          break;
        }
        const seen = p.msg_id && byMsg.get(`n:${p.msg_id}`);
        if (seen) seen.say = text;
        else byMsg.set(`n:${p.msg_id}`, push({ say: text }));
        break;
      }
      case "reasoning": {
        const text = String(p.text || "");
        if (!p.done || !text.trim() || waiting) break;
        const seen = p.msg_id && byMsg.get(`r:${p.msg_id}`);
        if (seen) seen.think = text;
        else byMsg.set(`r:${p.msg_id}`, push({ think: text }));
        break;
      }
      case "tool_call":
        calls.set(p.call_id, p);
        if (p.name === "ui_await_approvals" && !waiting) {
          push({ awaitActions: true });
          inApprovals = true;
        }
        break;
      case "tool_result": {
        const call = calls.get(p.call_id) || { name: p.name, input: {} };
        const name = p.name || call.name;
        const input = call.input || {};
        if (name === "ui_await_approvals") { inApprovals = false; break; }
        // The agent's own view of a decision (when it consumed it), not the click, drives the
        // branch: a rejection acknowledged after a quick second click stays a rejection line.
        if ((name === "ui_propose_options" || name === "ui_await_decision") && pendingAwait && p.result?.decision) {
          const { decision, option_id: id } = p.result;
          if (decision === "approved") {
            const branch = [];
            pendingAwait.awaitOption.approved[id] = branch;
            pendingAwait.awaitOption.approved.default = [
              { say: `This replay contains only the path recorded in the live run, where ${p.result.option || id} was approved. The replay ends here; approve that option to see the recorded execution.` },
              { end: "done" }
            ];
            cursor = branch;
            waiting = false;
            rejectionFor = null;
            lastState = null;
          } else {
            rejectionFor = id;
          }
          break;
        }
        if (waiting) break; // lookups between a rejection and the next decision are not replayed
        if (name.startsWith("erp_")) {
          push({ tool: name, input });
        } else if (name.startsWith("geo_")) {
          push({ geo: name, input, ok: p.ok !== false, summary: p.summary || "", result: stripNote(p.result) });
        } else if (name === "web_search") {
          const results = (p.sources || p.result?.results || []).map((x) => ({ title: x.title || x.url || "Untitled", url: x.url || null, page_age: x.page_age || null }));
          push({ web: { query: input.query || "", ok: p.ok !== false, summary: p.summary || "", results } });
        } else if (name === "sim_impact") {
          if (p.ok !== false) {
            const stepName = `impact${++impactN}`;
            push({ impact: { name: stepName, spec: input, label: impactN === 1 ? "first estimate" : "latest estimate" } });
            if (Array.isArray(input.variants) && input.variants.length) lastWithVariants = stepName;
          } else {
            push({ recordedTool: { name, input, ok: false, summary: p.summary || "Rejected by the engine", result: p.result ?? null } });
          }
        }
        // Other ui_* tools are represented by the events they caused (alert, map, options, drafts, report).
        break;
      }
      case "alert":
        push({ alert: p });
        break;
      case "map_update":
        if (p.source !== "decision" && !waiting) push({ map: p });   // decision payoffs are re-created by the player
        break;
      case "options": {
        const texts = {};
        for (const o of p.options || []) texts[o.id] = { title: o.title, description: o.description, residual_risk: o.residual_risk };
        push({ options: { from: lastWithVariants, order: (p.options || []).map((o) => o.id), recommended: p.recommended, baseline_description: p.baseline?.description || "", texts } });
        pendingAwait = push({ awaitOption: { rejected: {}, approved: {} } });
        waiting = true;
        rejectionFor = null;
        break;
      }
      case "action_draft":
        push({ draft: { type: p.type, recipient: p.recipient, subject: p.subject, body: p.body || "" } });
        break;
      case "report":
        push({ report: replayReport(p.markdown), ...(p.outcome ? { outcome: p.outcome } : {}) });
        break;
      case "run_end":
        push({ end: p.status === "no_findings" ? "no_findings" : "done" });
        break;
      default:
        break; // run_start, option_decision, notice, kpi_update, cost_update, action_decision: not part of the script
    }
  }
  return main;
}

/** The live report, re-labelled: every "Live agent run" line is replaced by the replay marker. */
function replayReport(markdown) {
  const lines = String(markdown || "").split("\n").filter((line) => !/live agent run/i.test(line));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return `${lines.join("\n")}\n\n${REPLAY_FOOTER}`;
}

function stripNote(result) {
  if (!result || typeof result !== "object") return result ?? null;
  const { note, ...rest } = result;
  return rest;
}

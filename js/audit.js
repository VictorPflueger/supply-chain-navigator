// Audit trail: every run event plus every model request/response, exportable as JSON.
// Secrets never enter it: API keys are not part of any event, and the export is redacted again.
//
// Two lists are kept: `events` (the run-event stream exactly as the UI saw it) and
// `apiExchanges` (one record per model call: what was sent, what came back, usage and timing).
// The Audit tab shows both in one chronological view; each model call appears as a "model_call" row.

import { bus } from "./events.js";
import { APP } from "./config.js";
import { redactSecrets } from "./keystore.js";
import { computeRunFacts } from "./run_facts.js";

const events = [];
const apiExchanges = [];
const rows = [];
const listeners = new Set();
let run = null;

bus.onAny((ev) => {
  // Streaming narration arrives as many partial updates; the audit keeps only final texts.
  if ((ev.type === "narration" || ev.type === "reasoning") && !ev.payload?.done) return;
  const copy = safeClone(ev);
  events.push(copy);
  if (ev.type === "run_start") {
    run = {
      run_id: ev.payload.run_id, mode: ev.payload.mode, entry: ev.payload.entry,
      scenario_id: ev.payload.scenario_id || null, title: ev.payload.title, model: ev.payload.model || null,
      sim_source: ev.payload.sim_source || null,
      started_at: ev.ts, ended_at: null, status: "running"
    };
  }
  if (ev.type === "run_end" && run) {
    run.ended_at = ev.ts;
    run.status = ev.payload.status;
  }
  addRow(copy);
});

function addRow(row) {
  rows.push(row);
  for (const fn of listeners) fn(row);
}

/** Subscribe to new audit rows (events and model calls). */
export function onAuditEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The run-event stream of the current (or last) run. */
export function auditEvents() {
  return events.slice();
}

/** Events and model calls in the order they happened, for the Audit tab. */
export function auditRows() {
  return rows.slice();
}

/** Summary of the current (or last) run: id, mode, entry, scenario, model, status, times. */
export function auditRunInfo() {
  return run ? { ...run } : null;
}

/** Record one model request/response (from the live agent). Never pass headers. */
export function recordApiExchange(entry) {
  const ts = new Date().toISOString();
  const record = safeClone({ ts, ...entry });
  apiExchanges.push(record);
  const current = bus.currentRun();
  const r = record.response || {};
  const q = record.request || {};
  addRow({
    type: "model_call",
    ts,
    t: current ? Math.round(performance.now() - current.t0) : null,
    payload: {
      step: record.step,
      request_id: record.request_id || null,
      duration_ms: record.duration_ms ?? null,
      model: q.model || r.model || null,
      messages_total: q.messages_total ?? null,
      max_tokens: q.max_tokens ?? null,
      stop_reason: r.stop_reason || null,
      input_tokens: r.usage?.input_tokens ?? 0,
      output_tokens: r.usage?.output_tokens ?? 0,
      cache_read_tokens: r.usage?.cache_read_input_tokens ?? 0,
      web_searches: r.usage?.server_tool_use?.web_search_requests ?? 0,
      blocks: Array.isArray(r.content) ? r.content.map((b) => b.type) : []
    }
  });
}

export function resetAudit() {
  events.length = 0;
  apiExchanges.length = 0;
  rows.length = 0;
  run = null;
}

/** Builds the JSON export for the current run. */
export function buildAuditExport() {
  const world = globalThis.WORLD?.meta || {};
  const lastCost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const mode = run?.mode || null;
  const recorded = run?.sim_source === "recorded";
  const doc = {
    app: `${APP.name} — ${APP.fullName}`,
    app_version: APP.version,
    exported_at: new Date().toISOString(),
    mode,
    mode_statement: mode === "simulation"
      ? recorded
        ? "SIMULATION: replay of a recorded live run. No model was called during this replay; the evidence shown was recorded earlier and is not live."
        : "SIMULATION: scripted replay of a representative run. No model was called; external data shown is representative, not live."
      : mode === "live"
        ? "LIVE: real model reasoning and real tool calls made from the presenter's browser."
        : "No run recorded.",
    ai_disclosure: "This log documents an AI system. All outbound actions are drafts in an in-app outbox; nothing was sent to any external party.",
    company_note: "Nordwerk Automotive GmbH and all suppliers are fictional (see DATA_SOURCES.md).",
    world_version: world.world_version || null,
    run,
    run_facts: run && run.status !== "running" ? safeFacts() : null,
    cost: lastCost,
    counts: { ...countBy(events.map((e) => e.type)), model_calls: apiExchanges.length },
    events,
    api_exchanges: apiExchanges
  };
  return redactSecrets(JSON.stringify(doc, null, 2));
}

export function auditFileName() {
  const id = run?.run_id || `navigator-${Date.now()}`;
  return `${id}${run?.mode === "simulation" ? "-SIMULATION" : run?.mode === "live" ? "-LIVE" : ""}-audit.json`;
}

function safeFacts() {
  try { return computeRunFacts(rows); } catch { return null; }
}

function countBy(list) {
  const out = {};
  for (const x of list) out[x] = (out[x] || 0) + 1;
  return out;
}

function safeClone(obj) {
  try {
    return JSON.parse(redactSecrets(JSON.stringify(obj)));
  } catch {
    return { unserializable: true };
  }
}

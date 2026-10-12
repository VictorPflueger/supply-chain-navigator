// Audit trail: every run event plus every model request/response summary, exportable as JSON.
// Secrets never enter it: API keys are not part of any event, and the export is redacted again.

import { bus } from "./events.js";
import { APP } from "./config.js";
import { redactSecrets } from "./keystore.js";

const events = [];
const apiExchanges = [];
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
      started_at: ev.ts, ended_at: null, status: "running"
    };
  }
  if (ev.type === "run_end" && run) {
    run.ended_at = ev.ts;
    run.status = ev.payload.status;
  }
  for (const fn of listeners) fn(copy);
});

/** Subscribe to new audit rows. */
export function onAuditEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function auditEvents() {
  return events.slice();
}

/** Record a model request/response summary (from the live agent, M3). Never pass headers. */
export function recordApiExchange(entry) {
  apiExchanges.push(safeClone({ ts: new Date().toISOString(), ...entry }));
}

export function resetAudit() {
  events.length = 0;
  apiExchanges.length = 0;
  run = null;
}

/** Builds the JSON export for the current run. */
export function buildAuditExport() {
  const world = globalThis.WORLD?.meta || {};
  const lastCost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const mode = run?.mode || null;
  const doc = {
    app: `${APP.name} — ${APP.fullName}`,
    app_version: APP.version,
    exported_at: new Date().toISOString(),
    mode,
    mode_statement: mode === "simulation"
      ? "SIMULATION: scripted replay of a representative run. No model was called; external data shown is representative, not live."
      : mode === "live"
        ? "LIVE: real model reasoning and real tool calls made from the presenter's browser."
        : "No run recorded.",
    ai_disclosure: "This log documents an AI system. All outbound actions are drafts in an in-app outbox; nothing was sent to any external party.",
    company_note: "Nordwerk Automotive GmbH and all suppliers are fictional (see DATA_SOURCES.md).",
    world_version: world.world_version || null,
    run,
    cost: lastCost,
    counts: countBy(events.map((e) => e.type)),
    events,
    api_exchanges: apiExchanges
  };
  return redactSecrets(JSON.stringify(doc, null, 2));
}

export function auditFileName() {
  const id = run?.run_id || `navigator-${Date.now()}`;
  return `${id}${run?.mode === "simulation" ? "-SIMULATION" : run?.mode === "live" ? "-LIVE" : ""}-audit.json`;
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

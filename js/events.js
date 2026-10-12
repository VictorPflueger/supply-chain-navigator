// The run-event bus. Every UI effect flows through here, whether a live agent or the simulation
// player produced it. The UI subscribes to event types and never asks which producer is running;
// only the mode badge, the console watermark and the audit export read the envelope's `mode`.
//
// Envelope: { id, seq, type, ts (ISO), t (ms since run start or null), run_id, mode, payload }
//
// Event types and payloads
//   run_start        { run_id, mode: "live"|"simulation", entry: "scenario"|"scan"|"custom", scenario_id?, title, seed?, model? }
//   state_change     { state, note? }   states: see RUN_STATES
//   narration        { msg_id, text, done }            streamed upsert: same msg_id replaces text
//   reasoning        { msg_id, text, done }            summarised model thinking (shown collapsed)
//   tool_call        { call_id, name, input, server }  server=true for Anthropic-hosted tools (web_search)
//   tool_result      { call_id, name, ok, summary, result, server, sources? }
//   alert            { title, severity, summary, sources:[{title,url}], supplier_ids?, route_ids?, node_ids? }
//   map_update       { supplier_ids?, route_ids?, node_ids?, plant_ids?, state, label? }
//   kpi_update       { value_at_risk_eur?, first_stop_day?, first_stop_plant?, first_stop_date?, horizon_days?, series? }
//   options          { call_id, baseline:{cost_eur, first_stop_day, ...}, options:[...], recommended? }
//   option_decision  { option_id, decision: "approved"|"rejected", by: "user", note? }
//   action_draft     { action_id, type: "email"|"booking"|"replan", recipient, subject, body, payload?, status: "pending" }
//   action_decision  { action_id, decision: "approved"|"rejected", by: "user" }
//   report           { markdown }
//   cost_update      { eur, usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, simulated }
//   notice           { level: "info"|"warn"|"error", text }
//   run_end          { status: "done"|"aborted"|"error"|"no_findings", reason? }

export const RUN_STATES = {
  idle: "Idle",
  scanning: "Scanning",
  diagnosing: "Diagnosing",
  verifying: "Verifying",
  simulating: "Simulating",
  options: "Options",
  awaiting_approval: "Awaiting approval",
  executing: "Executing",
  done: "Done",
  aborted: "Aborted",
  error: "Error"
};

class RunEventBus {
  constructor() {
    this.handlers = new Map();
    this.anyHandlers = new Set();
    this.seq = 0;
    this.run = null; // { run_id, mode, t0 }
  }

  /** Subscribe to one event type. Returns an unsubscribe function. */
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  /** Subscribe to every event. Returns an unsubscribe function. */
  onAny(fn) {
    this.anyHandlers.add(fn);
    return () => this.anyHandlers.delete(fn);
  }

  /** Marks the start of a run so events carry run id, mode and relative time. */
  beginRun({ run_id, mode }) {
    this.run = { run_id, mode, t0: performance.now() };
  }

  endRun() {
    this.run = null;
  }

  currentRun() {
    return this.run ? { ...this.run } : null;
  }

  emit(type, payload = {}) {
    const envelope = {
      id: `ev-${Date.now().toString(36)}-${(++this.seq).toString(36)}`,
      seq: this.seq,
      type,
      ts: new Date().toISOString(),
      t: this.run ? Math.round(performance.now() - this.run.t0) : null,
      run_id: this.run?.run_id ?? null,
      mode: this.run?.mode ?? null,
      payload
    };
    for (const fn of this.handlers.get(type) || []) safeCall(fn, envelope);
    for (const fn of this.anyHandlers) safeCall(fn, envelope);
    return envelope;
  }
}

function safeCall(fn, envelope) {
  try {
    fn(envelope);
  } catch (err) {
    // A failing subscriber must never break the run; surface it in the browser console only.
    console.error(`[Navigator] event handler failed for ${envelope.type}:`, err);
  }
}

export const bus = new RunEventBus();

/** New run id, e.g. run-20261012-1556-k3f9. */
export function newRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `run-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${Math.random().toString(36).slice(2, 6)}`;
}

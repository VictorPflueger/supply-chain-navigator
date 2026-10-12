// Run facts: a short, factual summary of a finished run, shown on the console's last line and
// included in the audit export. It doubles as the acceptance self-check for a run: time,
// at least 8 visible tool calls, at least one visible verification step, and cost.

const VERIFY = /^(?:\*\*)?(check|checking|verifying|verification|confirmed|verified|not confirmed|unconfirmed)(?:\*\*)?\s*:/i;
const REVISED = /^(?:\*\*)?(revised|revision|correction|self-correction)(?:\*\*)?\s*:/i;

/**
 * rows: audit rows of the run (events and model_call rows) in order.
 * end: the run_end envelope (its `t` is the run time in ms).
 */
export function computeRunFacts(rows, end = null) {
  const events = rows.filter((r) => r.type !== "model_call");
  const start = events.find((e) => e.type === "run_start");
  const mode = start?.payload?.mode || null;
  const finish = end || [...events].reverse().find((e) => e.type === "run_end") || null;
  const totalMs = Math.max(0, finish?.t ?? events[events.length - 1]?.t ?? 0);

  // Visible tool calls: everything the console lists (ui_* tools show as their effects).
  const calls = events.filter((e) => e.type === "tool_call" && !String(e.payload?.name || "").startsWith("ui_"));
  const byKind = { erp: 0, open_data: 0, web_search: 0, impact: 0 };
  for (const c of calls) {
    const n = String(c.payload.name);
    if (n.startsWith("erp_")) byKind.erp += 1;
    else if (n.startsWith("geo_")) byKind.open_data += 1;
    else if (n === "web_search") byKind.web_search += 1;
    else if (n === "sim_impact") byKind.impact += 1;
  }

  // Narration paragraphs, once per message (a retried stream repeats a message id).
  const finalText = new Map();
  for (const e of events) if (e.type === "narration" && e.payload?.done) finalText.set(e.payload.msg_id || e.id, String(e.payload.text || ""));
  const paragraphs = [...finalText.values()].flatMap((t) => t
    .split(/\n{2,}|\n(?=\s*(?:\*\*)?(?:hypothesis|check|confirmed|not confirmed|unconfirmed|revised|finding|recommendation|impact)\s*:)/i)
    .map((p) => p.trim()).filter(Boolean));
  const verificationSteps = paragraphs.filter((p) => VERIFY.test(p)).length;
  const revisions = paragraphs.filter((p) => REVISED.test(p)).length;

  // Evidence gathered before the alert (or in the whole run if there was none).
  const alertIdx = events.findIndex((e) => e.type === "alert");
  const evidence = events.filter((e, i) => (alertIdx < 0 || i < alertIdx) && e.type === "tool_result" && e.payload?.ok !== false &&
    (e.payload?.name === "web_search" || String(e.payload?.name || "").startsWith("geo_"))).length;
  const alert = alertIdx >= 0 ? events[alertIdx].payload : null;

  // Time spent waiting for the human (status "Awaiting approval") is not agent time.
  let waitingMs = 0;
  let waitStart = null;
  for (const e of events) {
    if (e.type !== "state_change" && e.type !== "run_end") continue;
    const awaiting = e.type === "state_change" && e.payload?.state === "awaiting_approval";
    if (awaiting && waitStart === null) waitStart = e.t ?? 0;
    else if (!awaiting && waitStart !== null) { waitingMs += Math.max(0, (e.t ?? 0) - waitStart); waitStart = null; }
  }
  if (waitStart !== null) waitingMs += Math.max(0, totalMs - waitStart);
  const agentMs = Math.max(0, totalMs - waitingMs);

  const approved = events.find((e) => e.type === "option_decision" && e.payload?.decision === "approved");
  const drafts = events.filter((e) => e.type === "action_draft").length;
  const decisions = events.filter((e) => e.type === "action_decision");
  const cost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;

  return {
    mode,
    status: finish?.payload?.status || "running",
    run_time_s: Math.round(totalMs / 1000),
    agent_time_s: Math.round(agentMs / 1000),
    waiting_time_s: Math.round(waitingMs / 1000),
    model_calls: rows.filter((r) => r.type === "model_call").length,
    tool_calls: calls.length,
    tool_calls_by_kind: byKind,
    verification_steps: verificationSteps,
    revisions,
    evidence_before_alert: evidence,
    alert_basis: alert ? (alert.basis || "verified") : null,
    approved_option: approved?.payload?.option_id || null,
    drafts,
    drafts_approved: decisions.filter((e) => e.payload?.decision === "approved").length,
    drafts_rejected: decisions.filter((e) => e.payload?.decision === "rejected").length,
    cost_eur: cost && !cost.simulated ? Math.round((Number(cost.eur) || 0) * 100) / 100 : 0,
    checks: {
      agent_time_under_4_min: agentMs < 240000,
      at_least_8_tool_calls: calls.length >= 8,
      verification_visible: verificationSteps >= 1 && evidence >= 1
    }
  };
}

/** One readable sentence for the console. */
export function describeRunFacts(f) {
  const mins = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
  const kinds = [
    f.tool_calls_by_kind.erp ? `${f.tool_calls_by_kind.erp} ERP` : null,
    f.tool_calls_by_kind.open_data ? `${f.tool_calls_by_kind.open_data} open data` : null,
    f.tool_calls_by_kind.web_search ? `${f.tool_calls_by_kind.web_search} web search${f.tool_calls_by_kind.web_search === 1 ? "" : "es"}` : null,
    f.tool_calls_by_kind.impact ? `${f.tool_calls_by_kind.impact} impact run${f.tool_calls_by_kind.impact === 1 ? "" : "s"}` : null
  ].filter(Boolean).join(", ");
  const time = f.mode === "simulation"
    ? `${mins(f.run_time_s)} replay`
    : `${mins(f.agent_time_s)} agent time${f.waiting_time_s ? ` plus ${mins(f.waiting_time_s)} waiting for your decisions` : ""}`;
  const verify = `${f.verification_steps} verification step${f.verification_steps === 1 ? "" : "s"}, ${f.revisions} revision${f.revisions === 1 ? "" : "s"}`;
  const cost = f.mode === "simulation" ? "no cost (simulated)" : `cost €${f.cost_eur.toFixed(2)}`;
  return `${time}; ${f.tool_calls} tool call${f.tool_calls === 1 ? "" : "s"}${kinds ? ` (${kinds})` : ""}; ${verify}; ${cost}.`;
}

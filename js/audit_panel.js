// Audit tab: chronological log of every event and every model call, with filters, JSON export and
// "Save run as simulation" (enabled after a completed live run of a preset scenario).

import { h, clear, downloadText, setDisabled } from "./dom.js";
import { icon } from "./icons.js";
import { clock, timeOfDay, int } from "./format.js";
import { auditRows, onAuditEvent, buildAuditExport, auditFileName } from "./audit.js";
import { canRecord, saveRunAsSimulation } from "./recorder.js";

const GROUPS = {
  all: { label: "All", types: null },
  agent: { label: "Agent", types: ["narration", "reasoning", "alert", "options", "action_draft", "report"] },
  tools: { label: "Tools", types: ["tool_call", "tool_result"] },
  model: { label: "Model calls", types: ["model_call"] },
  human: { label: "Human decisions", types: ["option_decision", "action_decision"] },
  system: { label: "System", types: ["run_start", "run_end", "state_change", "notice", "map_update", "kpi_update", "cost_update"] }
};

export function createAuditPanel(panel, { onCount } = {}) {
  let filter = "all";
  const filterBtns = new Map();
  const tbody = h("tbody");
  const status = h("div", { class: "vc-alert vc-alert--success audit-status", role: "status", hidden: true });
  const saveBtn = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", on: { click: saveSimulation } }, icon("download", 16), "Save run as simulation");
  const head = h("div", { class: "audit-head" },
    h("div", { class: "audit-filters", role: "group", "aria-label": "Filter audit events" },
      Object.entries(GROUPS).map(([id, g]) => {
        // Toggles the app owns (aria-pressed), in Vici's pressed look.
        const b = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", "aria-pressed": String(id === filter) }, g.label);
        b.addEventListener("click", () => { filter = id; for (const [fid, fb] of filterBtns) fb.setAttribute("aria-pressed", String(fid === id)); renderAll(); });
        filterBtns.set(id, b);
        return b;
      })),
    h("div", { class: "audit-actions" },
      saveBtn,
      h("button", { class: "vc-button button-compact", type: "button", on: { click: exportJson } }, icon("download", 16), "Export JSON")));
  // Vici's table; its wrapper clips without scrolling, so the header row sticks while the drawer scrolls.
  const table = h("div", { class: "vc-table-wrap audit-wrap" },
    h("table", { class: "vc-table vc-table--compact audit-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Run time"), h("th", {}, "Clock"), h("th", {}, "Event"), h("th", {}, "Details"))),
      tbody));
  panel.append(head, status, table);

  function matches(ev) {
    const g = GROUPS[filter];
    return !g.types || g.types.includes(ev.type);
  }

  function row(ev) {
    return h("tr", { dataset: { type: ev.type } },
      h("td", { class: "t" }, ev.t !== null && ev.t !== undefined ? clock(ev.t) : "—"),
      h("td", { class: "t" }, timeOfDay(ev.ts)),
      h("td", { class: "k" }, h("span", { class: "audit-kind" }, ev.type)),
      h("td", { class: "s" }, summarize(ev)));
  }

  function updateSave() {
    const can = canRecord();
    setDisabled(saveBtn, !can.ok, can.reason);
  }

  function renderAll() {
    clear(tbody);
    const rows = auditRows();
    for (const ev of rows) if (matches(ev)) tbody.appendChild(row(ev));
    onCount?.(rows.length);
    updateSave();
  }

  onAuditEvent((ev) => {
    if (matches(ev)) tbody.appendChild(row(ev));
    onCount?.(auditRows().length);
    if (ev.type === "run_end" || ev.type === "run_start") {
      updateSave();
      if (ev.type === "run_start") setStatus("");
    }
  });

  function exportJson() {
    downloadText(auditFileName(), buildAuditExport());
  }

  function saveSimulation() {
    if (saveBtn.getAttribute("aria-disabled") === "true") return;
    const r = saveRunAsSimulation();
    setStatus(r.message, r.ok ? "ok" : "error");
  }

  function setStatus(text, tone = "ok") {
    status.textContent = text || "";
    status.dataset.tone = tone;
    status.className = `vc-alert ${tone === "error" ? "vc-alert--danger" : "vc-alert--success"} audit-status`;
    status.hidden = !text;
  }

  renderAll();
  return {
    refresh: () => { setStatus(""); renderAll(); },
    saveSimulation: () => { const r = saveRunAsSimulation(); setStatus(r.message, r.ok ? "ok" : "error"); return r; }
  };
}

function summarize(ev) {
  const p = ev.payload || {};
  switch (ev.type) {
    case "run_start": return `${p.mode?.toUpperCase()} run "${p.title}"${p.model ? ` on ${p.model}` : ""}${p.sim_source === "recorded" ? " (replay of a recorded live run)" : ""}`;
    case "run_end": return `${p.status}${p.reason ? `: ${p.reason}` : ""}`;
    case "state_change": return p.state;
    case "narration": return p.done ? trim(p.text, 220) : `(streaming) ${trim(p.text, 120)}`;
    case "reasoning": return trim(p.text, 200);
    case "tool_call": return `${p.name} ${trim(JSON.stringify(p.input || {}), 200)}`;
    case "tool_result": return `${p.name}: ${p.ok === false ? "ERROR " : ""}${trim(p.summary || "", 200)}`;
    case "model_call": return `Step ${p.step}: ${p.messages_total ?? "?"} messages sent, stop reason ${p.stop_reason || "?"}, ${int(p.input_tokens)} in / ${int(p.output_tokens)} out tokens${p.cache_read_tokens ? ` (${int(p.cache_read_tokens)} from cache)` : ""}${p.web_searches ? `, ${p.web_searches} web search${p.web_searches === 1 ? "" : "es"}` : ""}${p.duration_ms ? `, ${(p.duration_ms / 1000).toFixed(1)} s` : ""}${p.request_id ? `, request ${p.request_id}` : ""}`;
    case "alert": return `[${p.severity}${p.basis === "what_if" ? ", what-if" : ""}] ${p.title}`;
    case "map_update": return `${p.state}: ${[...(p.supplier_ids || []), ...(p.route_ids || []), ...(p.node_ids || []), ...(p.plant_ids || [])].join(", ")}`;
    case "kpi_update": return p.decided
      ? `decision payoff: ${p.accepted ? "risk accepted" : `remaining exposure ${p.residual_eur ?? "—"} with ${p.option_label}`}`
      : `value at risk ${p.value_at_risk_eur ?? "—"}, first stop day ${p.first_stop_day ?? "—"}`;
    case "options": return `${(p.options || []).length} options, baseline ${p.baseline?.value_at_risk_eur}`;
    case "option_decision": return `${p.decision}: ${p.option_label || p.option_id}`;
    case "action_draft": return `${p.type} to ${p.recipient}: ${p.subject}`;
    case "action_decision": return `${p.decision}: ${p.label || p.action_id}`;
    case "report": return trim(p.markdown, 200);
    case "cost_update": return p.simulated ? "simulated (no cost)" : `€${Number(p.eur || 0).toFixed(4)} (${p.input_tokens || 0} in / ${p.output_tokens || 0} out tokens, ${p.web_searches || 0} searches)`;
    case "notice": return `[${p.level}] ${p.text}`;
    default: return trim(JSON.stringify(p), 200);
  }
}

function trim(s, n) {
  s = String(s ?? "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

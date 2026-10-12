// Audit tab: chronological log of every event with filters and JSON export.

import { h, clear, downloadText } from "./dom.js";
import { icon } from "./icons.js";
import { clock, timeOfDay } from "./format.js";
import { auditEvents, onAuditEvent, buildAuditExport, auditFileName } from "./audit.js";

const GROUPS = {
  all: { label: "All", types: null },
  agent: { label: "Agent", types: ["narration", "reasoning", "alert", "options", "action_draft", "report"] },
  tools: { label: "Tools", types: ["tool_call", "tool_result"] },
  human: { label: "Human decisions", types: ["option_decision", "action_decision"] },
  system: { label: "System", types: ["run_start", "run_end", "state_change", "notice", "map_update", "kpi_update", "cost_update"] }
};

export function createAuditPanel(panel, { onCount } = {}) {
  let filter = "all";
  const filterBtns = new Map();
  const tbody = h("tbody");
  const head = h("div", { class: "audit-head" },
    h("div", { class: "audit-filters", role: "group", "aria-label": "Filter audit events" },
      Object.entries(GROUPS).map(([id, g]) => {
        const b = h("button", { class: "btn btn-sm", type: "button", "aria-pressed": String(id === filter) }, g.label);
        b.addEventListener("click", () => { filter = id; for (const [fid, fb] of filterBtns) fb.setAttribute("aria-pressed", String(fid === id)); renderAll(); });
        filterBtns.set(id, b);
        return b;
      })),
    h("button", { class: "btn btn-sm btn-primary", type: "button", on: { click: exportJson } }, icon("download", 16), "Export JSON"));
  const table = h("table", { class: "audit-table" },
    h("thead", {}, h("tr", {}, h("th", {}, "Run time"), h("th", {}, "Clock"), h("th", {}, "Event"), h("th", {}, "Details"))),
    tbody);
  panel.append(head, table);

  function matches(ev) {
    const g = GROUPS[filter];
    return !g.types || g.types.includes(ev.type);
  }

  function row(ev) {
    return h("tr", {},
      h("td", { class: "t" }, ev.t !== null && ev.t !== undefined ? clock(ev.t) : "—"),
      h("td", { class: "t" }, timeOfDay(ev.ts)),
      h("td", { class: "k" }, h("span", { class: "audit-kind" }, ev.type)),
      h("td", { class: "s" }, summarize(ev)));
  }

  function renderAll() {
    clear(tbody);
    for (const ev of auditEvents()) if (matches(ev)) tbody.appendChild(row(ev));
    onCount?.(auditEvents().length);
  }

  onAuditEvent((ev) => {
    if (matches(ev)) tbody.appendChild(row(ev));
    onCount?.(auditEvents().length);
  });

  function exportJson() {
    downloadText(auditFileName(), buildAuditExport());
  }

  renderAll();
  return { refresh: renderAll };
}

function summarize(ev) {
  const p = ev.payload || {};
  switch (ev.type) {
    case "run_start": return `${p.mode?.toUpperCase()} run "${p.title}"${p.model ? ` on ${p.model}` : ""}`;
    case "run_end": return `${p.status}${p.reason ? `: ${p.reason}` : ""}`;
    case "state_change": return p.state;
    case "narration": return p.done ? trim(p.text, 220) : `(streaming) ${trim(p.text, 120)}`;
    case "reasoning": return trim(p.text, 200);
    case "tool_call": return `${p.name} ${trim(JSON.stringify(p.input || {}), 200)}`;
    case "tool_result": return `${p.name}: ${p.ok === false ? "ERROR " : ""}${trim(p.summary || "", 200)}`;
    case "alert": return `[${p.severity}] ${p.title}`;
    case "map_update": return `${p.state}: ${[...(p.supplier_ids || []), ...(p.route_ids || []), ...(p.node_ids || []), ...(p.plant_ids || [])].join(", ")}`;
    case "kpi_update": return `value at risk ${p.value_at_risk_eur ?? "—"}, first stop day ${p.first_stop_day ?? "—"}`;
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

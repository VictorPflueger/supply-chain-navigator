// Agent console: renders the run-event stream as a logbook (time · mark · entry).
// Narration paragraphs that start with a label (Hypothesis:, Check:, Confirmed:, Not confirmed:,
// Revised:, Finding:, Recommendation:) get distinct styling; "Revised: old → new" is rendered as an
// amended entry with the superseded part struck through.

import { bus } from "./events.js";
import { h, clear, prefersReducedMotion } from "./dom.js";
import { icon } from "./icons.js";
import { renderInline, renderMarkdown } from "./md.js";
import { clock } from "./format.js";
import { auditRows } from "./audit.js";
import { computeRunFacts, describeRunFacts } from "./run_facts.js";
import { createProgressRail } from "./progress.js";
import { aiLabel } from "./ai_label.js";
import { runStateLabel } from "./handover.js";

const LABELS = [
  { re: /^(hypothesis)\s*:\s*/i, kind: "hypothesis" },
  { re: /^(check|checking|verifying|verification)\s*:\s*/i, kind: "check" },
  { re: /^(confirmed|verified)\s*:\s*/i, kind: "confirmed" },
  { re: /^(not confirmed|unconfirmed|unverified|uncertain)\s*:\s*/i, kind: "unconfirmed" },
  { re: /^(revised|revision|correction|self-correction)\s*:\s*/i, kind: "revised" },
  { re: /^(finding|impact|hidden dependency)\s*:\s*/i, kind: "finding" },
  { re: /^(recommendation)\s*:\s*/i, kind: "recommendation" }
];

const PHASES = new Set(["diagnosing", "verifying", "simulating", "options", "awaiting_approval", "executing"]);
const TEXT_SIZE_KEY = "nav.consoleText";

export function createConsole(panel, { onOpenOptions, onOpenOutbox, onOpenReport, onSaveSimulation } = {}) {
  const count = h("span", { class: "count vc-tabular" }, "");
  const jumpBtn = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", hidden: true }, icon("chevronDown", 16), "Jump to latest");
  // Larger text for projectors, remembered per browser (a convenience; storage may be unavailable).
  // A toggle the app owns (aria-pressed): Vici shows any pressed vc-button in its pressed look.
  const sizeBtn = h("button", { class: "vc-button vc-button--ghost button-compact text-size", type: "button", "aria-pressed": "false", title: "Larger console text for projectors" }, "Larger text");
  const applySize = (large) => {
    panel.dataset.text = large ? "large" : "standard";
    sizeBtn.setAttribute("aria-pressed", String(large));
    pin();
  };
  sizeBtn.addEventListener("click", () => {
    const large = panel.dataset.text !== "large";
    applySize(large);
    try { localStorage.setItem(TEXT_SIZE_KEY, large ? "large" : "standard"); } catch { /* storage unavailable */ }
  });
  const SCRIPTED = "Scripted replay of a representative run. Not live data, no model calls.";
  const watermarkText = h("span", {}, SCRIPTED);
  const watermark = h("div", { class: "sim-watermark", hidden: true, role: "note" }, "SIMULATION", watermarkText);
  const log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  // The agent's plan and progress, above the log (agentic UX: show the plan, show the hand-over).
  const rail = createProgressRail();
  rail.reset();

  panel.append(
    h("div", { class: "console-head" },
      h("div", { class: "console-title" }, h("h2", {}, "Agent console"), count),
      h("div", { class: "console-head-actions" }, jumpBtn, sizeBtn)),
    rail.el,
    watermark,
    log
  );

  const byMsg = new Map();
  const byCall = new Map();
  let entries = 0;
  let lastPhase = null;
  let runMeta = null;
  let sawReport = false;
  // Auto-follow: the log stays pinned to the newest entry until the presenter scrolls up. Only
  // user input (wheel, touch, keys, scrollbar drag) can unpin it, so programmatic scrolling and
  // layout changes (the drawer opening) never stop the follow.
  let follow = true;
  let userIntentUntil = 0;
  const noteIntent = () => { userIntentUntil = performance.now() + 900; };
  for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) log.addEventListener(type, noteIntent, { passive: true });
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const pin = () => { if (follow) log.scrollTop = log.scrollHeight; };

  log.addEventListener("scroll", () => {
    if (atBottom()) {
      follow = true;
      jumpBtn.hidden = true;
    } else if (performance.now() < userIntentUntil) {
      follow = false;
      if (entries > 0) jumpBtn.hidden = false;
    }
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(pin).observe(log);
  jumpBtn.addEventListener("click", () => {
    follow = true;
    jumpBtn.hidden = true;
    log.scrollTo({ top: log.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });

  function showEmpty() {
    clear(log);
    log.appendChild(h("div", { class: "log-empty" },
      h("h3", {}, "Pick a scenario, then start the agent"),
      h("p", {}, "The five steps above are the agent's plan. It spots the disruption and checks whether we are exposed, confirms it with a second source, calculates which plant stops when and what it costs, then proposes three costed options."),
      h("p", {}, "When it needs you, the step turns merlot. Nothing is sent without your approval. You choose between a free simulation and the live agent on your own API key.")));
    count.textContent = "";
  }

  function add(el) {
    if (entries === 0) clear(log);
    log.appendChild(el);
    entries++;
    count.textContent = `${entries} ${entries === 1 ? "entry" : "entries"}`;
    if (follow) pin();
    else jumpBtn.hidden = false;
    return el;
  }

  function entry(type, t, mark, body, data = {}) {
    return h("div", { class: "entry", dataset: { type, ...data } },
      h("div", { class: "entry-time" }, t !== null && t !== undefined ? clock(t) : ""),
      h("div", { class: "entry-mark" }, mark ? icon(mark, 18) : null),
      h("div", { class: "entry-body" }, body));
  }

  // ---- event handlers ---------------------------------------------------------------------------

  bus.on("run_start", (ev) => {
    const p = ev.payload;
    reset(false);
    runMeta = p;
    const recorded = p.mode === "simulation" && p.sim_source === "recorded";
    watermark.hidden = p.mode !== "simulation";
    watermarkText.textContent = recorded
      ? `Replay of a live run recorded${p.recorded_on ? ` on ${p.recorded_on}` : ""}${p.recorded_model ? ` (${p.recorded_model})` : ""}. Not live data, no model calls.`
      : SCRIPTED;
    log.dataset.sim = String(p.mode === "simulation");
    const meta = p.mode === "simulation"
      ? recorded ? "Simulation: replay of a recorded live run, no API key, no cost." : "Simulation: scripted replay, no API key, no cost."
      : `Live agent on ${p.model_label || p.model || "Claude"}. Real model reasoning and real tool calls.`;
    add(entry("run", ev.t, "play", [
      h("div", { class: "run-title" }, p.title || "Agent run"),
      h("div", {}, meta),
      p.seed ? h("div", { class: "seed" }, renderInline(p.seed, h("span"))) : null
    ]));
  });

  bus.on("state_change", (ev) => {
    const s = ev.payload.state;
    rail.update(s);
    if (!PHASES.has(s) || s === lastPhase) return;
    lastPhase = s;
    add(entry("phase", ev.t, null, h("span", { class: "phase" }, `Phase: ${runStateLabel(s)}`)));
  });

  bus.on("narration", (ev) => {
    const { msg_id: id, text, done } = ev.payload;
    let el = byMsg.get(id);
    if (!el) {
      el = add(entry("narration", ev.t, "pulse", h("div", { class: "narration" })));
      byMsg.set(id, el);
    }
    const body = el.querySelector(".narration");
    clear(body);
    for (const para of splitParagraphs(text)) body.appendChild(renderParagraph(para));
    el.classList.toggle("streaming", !done);
    pin();
  });

  bus.on("reasoning", (ev) => {
    const { msg_id: id, text } = ev.payload;
    let el = byMsg.get(`r:${id}`);
    if (!el) {
      const details = h("details", { class: "reasoning" },
        h("summary", {}, icon("chevronRight", 14), "Reasoning summary"),
        h("div", { class: "reasoning-text" }));
      el = add(entry("reasoning", ev.t, null, details));
      byMsg.set(`r:${id}`, el);
    }
    el.querySelector(".reasoning-text").textContent = text || "";
  });

  bus.on("tool_call", (ev) => {
    const p = ev.payload;
    if (isUiTool(p.name)) return; // ui_* tools are shown by their effect (alert, map, options, outbox)
    const line = p.name === "web_search"
      ? h("div", { class: "tool-line" }, h("strong", {}, "Web search"), h("span", { class: "tool-query" }, p.input?.query || ""))
      : h("div", { class: "tool-line" }, h("span", { class: "tool-name" }, p.name), h("span", { class: "tool-args" }, argsSummary(p.name, p.input)));
    const el = add(entry("tool_call", ev.t, p.server ? "globe" : "gear", line, { server: String(!!p.server) }));
    byCall.set(p.call_id, el);
  });

  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    if (isUiTool(p.name)) return;
    let el = byCall.get(p.call_id);
    if (!el) el = add(entry("tool_call", ev.t, p.server ? "globe" : "gear", h("div", { class: "tool-line" }, h("span", { class: "tool-name" }, p.name))));
    const body = el.querySelector(".entry-body");
    const result = h("div", { class: "result", dataset: { open: "false" } });
    const toggle = h("button", { class: "result-toggle", type: "button", "aria-expanded": "false" },
      icon("chevronRight", 14),
      h("span", { class: "result-summary", dataset: { ok: String(p.ok !== false) } }, p.summary || (p.ok === false ? "Tool error" : "Result")));
    const pre = h("pre", { class: "result-body" }, formatJson(p.result));
    toggle.addEventListener("click", () => {
      const open = result.dataset.open !== "true";
      result.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    result.append(toggle);
    if (Array.isArray(p.sources) && p.sources.length) {
      result.append(h("div", { class: "result-sources" }, p.sources.slice(0, 5).map((s) => {
        const tag = s.representative ? " (representative)" : s.recorded ? ` (recorded${s.recorded_on ? ` ${s.recorded_on}` : ""})` : "";
        const label = `${s.title || s.url}${s.page_age ? `, ${s.page_age}` : ""}${tag}`;
        return s.url ? h("a", { href: safeUrl(s.url), target: "_blank", rel: "noopener noreferrer" }, label) : h("span", {}, label);
      })));
    }
    result.append(pre);
    body.appendChild(result);
    pin();
  });

  bus.on("alert", (ev) => {
    const p = ev.payload;
    const sev = String(p.severity || "high").toLowerCase();
    const whatIf = p.basis === "what_if";
    // A Vici alert: danger for a verified finding of high severity, warning below that, lilac (the
    // AI's tone) for a what-if exercise.
    const tone = whatIf ? "vc-alert--feature" : sev === "medium" || sev === "low" ? "vc-alert--warning" : "vc-alert--danger";
    const card = h("div", { class: ["vc-alert", tone, "alert-card"], dataset: { severity: sev, basis: whatIf ? "what_if" : "verified" } }, h("div", { class: "vc-alert__body" },
      h("div", { class: "alert-sev" }, whatIf ? `What-if exercise (not a verified event), severity ${sev}` : `Alert, severity ${sev}`),
      h("h3", {}, p.title || "Disruption alert"),
      p.summary ? renderInline(p.summary, h("div")) : null,
      Array.isArray(p.sources) && p.sources.length
        ? h("ul", {}, p.sources.slice(0, 6).map((s) => h("li", {}, s.url ? h("a", { href: safeUrl(s.url), target: "_blank", rel: "noopener noreferrer" }, s.title || s.url) : (s.title || String(s)))))
        : null));
    add(entry("alert", ev.t, "alert", card));
  });

  bus.on("options", (ev) => {
    const n = ev.payload.options?.length || 0;
    add(entry("narration", ev.t, "list", h("div", {},
      h("p", {}, `${n} costed options and the do-nothing baseline are ready for your decision.`),
      h("button", { class: "vc-button button-compact", type: "button", on: { click: () => onOpenOptions?.() } }, "Review options"))));
  });

  bus.on("option_decision", (ev) => {
    const p = ev.payload;
    const approved = p.decision === "approved";
    add(entry("decision", ev.t, "user", h("p", {},
      h("strong", {}, approved ? "You approved " : "You rejected "), p.option_label || p.option_id, p.note ? `. ${p.note}` : "."),
    { decision: p.decision }));
  });

  bus.on("action_draft", (ev) => {
    const p = ev.payload;
    const verb = p.type === "booking" ? "Drafted booking" : p.type === "replan" ? "Drafted production re-plan" : "Drafted email";
    add(entry("narration", ev.t, p.type === "booking" ? "truck" : p.type === "replan" ? "calendar" : "mail", h("div", {},
      h("p", {}, `${verb} for ${p.recipient}: “${p.subject}”. Waiting for your approval in the Outbox.`),
      h("button", { class: "vc-button vc-button--outline button-compact", type: "button", on: { click: () => onOpenOutbox?.() } }, "Open outbox"))));
  });

  bus.on("action_decision", (ev) => {
    const p = ev.payload;
    add(entry("decision", ev.t, "user", h("p", {},
      h("strong", {}, p.decision === "approved" ? "You approved " : "You rejected "),
      p.label || p.action_id, p.decision === "approved" ? " (draft only; nothing was sent)." : "."), { decision: p.decision }));
  });

  bus.on("report", (ev) => {
    sawReport = true;
    const card = h("div", { class: "vc-card report-card" },
      aiLabel("report"),
      renderMarkdown(ev.payload.markdown),
      h("div", { class: "report-actions" },
        h("button", { class: "vc-button button-compact", type: "button", on: { click: () => onOpenReport?.(ev.payload.markdown) } }, icon("external", 16), "Open management summary")));
    add(entry("report", ev.t, "check", card));
  });

  bus.on("notice", (ev) => {
    const { level = "info", text } = ev.payload;
    add(entry("notice", ev.t, level === "error" ? "alert" : level === "warn" ? "alert" : "info", renderInline(text, h("span")), { level }));
  });

  bus.on("run_end", (ev) => {
    const { status, reason } = ev.payload;
    rail.finish(status);
    const text = {
      done: "Run complete.",
      aborted: "Run aborted.",
      error: "Run stopped because of an error.",
      no_findings: "Run complete: no material disruption found.",
      incomplete: "Run stopped before the workflow was complete."
    }[status] || "Run ended.";
    const canSave = status === "done" && sawReport && runMeta?.mode === "live" && runMeta?.entry === "scenario";
    // Facts for completed runs (the audit has every event up to this one).
    let facts = null;
    if (["done", "no_findings", "incomplete"].includes(status)) {
      try { facts = describeRunFacts(computeRunFacts(auditRows(), ev)); } catch (e) { console.error("[Navigator] run facts failed:", e); }
    }
    add(entry("notice", ev.t, status === "done" || status === "no_findings" ? "check" : "stop", h("div", {},
      h("span", {}, h("strong", {}, text), reason ? ` ${reason}` : ""),
      facts ? h("div", { class: "run-facts" }, h("strong", {}, runMeta?.mode === "simulation" ? "Replay facts: " : "Run facts: "), facts) : null,
      canSave ? h("div", { class: "entry-actions" },
        h("button", { class: "vc-button vc-button--outline button-compact", type: "button", title: "Download this run as a simulation script that can replace the scripted replay of this scenario", on: { click: () => onSaveSimulation?.() } }, icon("download", 16), "Save run as simulation")) : null),
    { level: status === "error" ? "error" : "info" }));
    for (const el of byMsg.values()) el.classList.remove("streaming");
  });

  function reset(empty = true) {
    byMsg.clear();
    byCall.clear();
    entries = 0;
    lastPhase = null;
    runMeta = null;
    sawReport = false;
    follow = true;
    jumpBtn.hidden = true;
    watermark.hidden = true;
    log.dataset.sim = "false";
    rail.reset();
    if (empty) showEmpty(); else clear(log);
  }

  let storedSize = null;
  try { storedSize = localStorage.getItem(TEXT_SIZE_KEY); } catch { /* storage unavailable */ }
  applySize(storedSize === "large");
  showEmpty();
  return { reset };
}

// ---------------------------------------------------------------------------------------------

function splitParagraphs(text) {
  return String(text || "").split(/\n{2,}|\n(?=\s*(?:\*\*)?(?:hypothesis|check|confirmed|not confirmed|unconfirmed|revised|finding|recommendation|impact)\s*:)/i)
    .map((p) => p.trim()).filter(Boolean);
}

function renderParagraph(raw) {
  let text = raw.replace(/^\*\*([^*]+?:)\*\*\s*/, "$1 ");
  for (const rule of LABELS) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const rest = text.slice(m[0].length);
    const label = m[1][0].toUpperCase() + m[1].slice(1);
    const p = h("p", { class: "para", dataset: { kind: rule.kind } }, h("span", { class: "tag" }, `${label}:`));
    if (rule.kind === "revised") {
      const arrow = rest.search(/\s(→|->)\s/);
      if (arrow > 0) {
        const old = rest.slice(0, arrow);
        const after = rest.slice(arrow).replace(/^\s(→|->)\s/, "");
        p.append(renderInline(old, h("span", { class: "struck" })), h("span", { class: "arrow", "aria-label": "replaced by" }, "→"), renderInline(after, h("span", { class: "amended" })));
        return p;
      }
    }
    renderInline(rest, p);
    return p;
  }
  return renderInline(text, h("p", { class: "para" }));
}

function argsSummary(name, input) {
  if (!input || typeof input !== "object") return "";
  if (name === "sim_impact") {
    const o = (input.supplier_outages || []).length;
    const r = (input.route_disruptions || []).length;
    const v = (input.variants || []).length;
    return [input.label ? `"${trim(input.label, 48)}"` : null, o ? `${o} outage${o > 1 ? "s" : ""}` : null, r ? `${r} route disruption${r > 1 ? "s" : ""}` : null, v ? `${v} variant${v > 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
  }
  const parts = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === "") continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${trim(s, 56)}`);
  }
  return parts.join(", ");
}

function trim(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatJson(value) {
  if (value === undefined) return "";
  let s;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    s = String(value);
  }
  return s.length > 9000 ? `${s.slice(0, 9000)}\n… (truncated for display; full result is in the audit log)` : s;
}

function isUiTool(name) {
  return String(name || "").startsWith("ui_");
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
  } catch {
    return "#";
  }
}

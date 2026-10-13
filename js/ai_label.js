// AI label, after IBM's Carbon for AI: a small "AI" mark on content an AI system wrote, which opens a
// short explanation on click (a toggletip that stays open until you click elsewhere or press Escape).
// Used where the agent's words reach a decision: the options, each draft and the management summary.
// Violet is the AI's colour throughout Navigator; burgundy stays with the human's decisions.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";

let run = { mode: null, model: null, recorded: false };
bus.on("run_start", (ev) => {
  const p = ev.payload || {};
  run = { mode: p.mode, model: p.model_label || p.model || null, recorded: p.sim_source === "recorded", recordedModel: p.recorded_model || null };
});

const ENGINE = "Every euro figure, stop day and date comes from the deterministic impact engine, not from the model.";

function author() {
  if (run.mode === "live") return `Written by the live agent${run.model ? ` (Claude ${run.model})` : ""} during this run.`;
  if (run.recorded) return `Recorded from an earlier live run${run.recordedModel ? ` (Claude ${run.recordedModel})` : ""} and replayed. No model was called now.`;
  return "Scripted replay: written in advance for the simulation. No model was called.";
}

const KINDS = {
  options: () => ({
    heading: "AI-proposed options",
    lines: [author(), "The agent chose the three options and wrote their descriptions.", ENGINE, "Nothing happens until you approve an option."]
  }),
  draft: () => ({
    heading: "AI-drafted message",
    lines: [author(), "Check names, quantities and dates before you approve.", "Approving only marks the draft as cleared: Navigator has no email or booking connection, so nothing is sent."]
  }),
  report: () => ({
    heading: "AI-written summary",
    lines: [author(), ENGINE, "The sources are named under How we know, and the audit export holds every model call and tool result."]
  })
};

let openTip = null;
function closeOpen() { openTip?.close(); }
document.addEventListener("pointerdown", (e) => { if (openTip && !openTip.contains(e.target)) closeOpen(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openTip) { const btn = openTip.button; closeOpen(); btn?.focus(); } });
// Close when the presenter moves the page (not when the log scrolls itself as entries arrive).
window.addEventListener("resize", closeOpen);
for (const type of ["wheel", "touchmove"]) document.addEventListener(type, closeOpen, { capture: true, passive: true });

let counter = 0;

/** An AI label for `kind` ("options" | "draft" | "report"). The explanation reflects the current run. */
export function aiLabel(kind) {
  const id = `ai-tip-${++counter}`;
  const button = h("button", {
    class: "ai-label", type: "button", "aria-expanded": "false", "aria-controls": id,
    "aria-label": `AI-generated content: what this means`, title: "AI-generated: click for details"
  }, h("span", { class: "ai-label-chip", "aria-hidden": "true" }, icon("spark", 14), "AI"));
  const tip = h("div", { class: "ai-tip", id, role: "note", hidden: true });
  const wrap = h("span", { class: "ai-label-wrap" }, button, tip);
  wrap.button = button;

  wrap.close = () => {
    tip.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (openTip === wrap) openTip = null;
  };

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!tip.hidden) return wrap.close();
    closeOpen();
    const { heading, lines } = KINDS[kind]();
    tip.replaceChildren(h("strong", {}, heading), ...lines.map((l) => h("p", {}, l)));
    tip.hidden = false;
    // Fixed position next to the label, kept on screen; no clipping inside scrolling panels.
    const r = button.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 24);
    tip.style.width = `${w}px`;
    tip.style.left = `${Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12))}px`;
    const below = r.bottom + 6;
    const height = tip.offsetHeight;
    tip.style.top = `${below + height > window.innerHeight - 12 ? Math.max(12, r.top - height - 6) : below}px`;
    button.setAttribute("aria-expanded", "true");
    openTip = wrap;
  });
  return wrap;
}

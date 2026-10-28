// Control bar: start, scenario picker, live scan, model, replay speed, status, abort, reset, diagnostics.

import { h, setDisabled, isDisabled, withTooltip } from "./dom.js";
import { icon } from "./icons.js";
import { MODELS } from "./config.js";
import { isRunning, isFinished } from "./state.js";
import { runStateLabel, onAwaitedChange } from "./handover.js";

const STATE_TONE = {
  idle: "", scanning: "active", diagnosing: "active", verifying: "active", simulating: "active",
  options: "waiting", awaiting_approval: "waiting", executing: "active", done: "done", stopped: "stopped", aborted: "stopped", error: "stopped"
};
// The status pill is a Vici tag in its tone, with a mark of its own and its words: ink while the
// agent works (a pulsing hexagon), merlot when it waits for you, success when done, danger when stopped.
const TONE_TAG = { "": "", active: "", waiting: "vc-tag--accent", done: "vc-tag--success", stopped: "vc-tag--danger" };

/**
 * handlers: { onStart, onLiveScan, onSelectScenario(id), onSelectCustom(), onSelectModel(id), onSpeed(n), onAbort, onReset, onDiagnostics }
 */
export function createControls(root, scenarios, handlers) {
  const startBtn = h("button", { class: "vc-button", type: "button", id: "btn-start" }, icon("play", 18), h("span", {}, "Start agent"));
  startBtn.addEventListener("click", () => { if (!isDisabled(startBtn)) handlers.onStart(); });

  const scenarioDd = dropdown({
    id: "scenario",
    caption: "Scenario",
    width: 330,
    items: [
      ...scenarios.map((s) => ({ id: s.id, badge: String(s.number), title: s.title, hint: s.category })),
      { sep: true },
      { id: "custom", badge: "+", title: "Custom what-if…", hint: "Describe any disruption in your own words", liveOnly: true }
    ],
    onSelect: (id) => (id === "custom" ? handlers.onSelectCustom() : handlers.onSelectScenario(id))
  });

  const scanBtn = h("button", { class: "vc-button vc-button--outline", type: "button", id: "btn-scan" }, icon("radar", 18), "Live scan");
  scanBtn.addEventListener("click", () => { if (!isDisabled(scanBtn)) handlers.onLiveScan(); });

  const modelDd = dropdown({
    id: "model",
    caption: "Model",
    width: 210,
    items: MODELS.map((m) => ({ id: m.id, title: m.label, hint: m.hint })),
    onSelect: (id) => handlers.onSelectModel(id)
  });

  const speedBtns = [1, 2, 4].map((n) => {
    const b = h("button", { type: "button", "aria-pressed": "false", "aria-label": `Replay speed ×${n}` }, `×${n}`);
    b.addEventListener("click", () => { if (!isDisabled(speedGroup)) handlers.onSpeed(n); });
    return b;
  });
  const speedGroup = h("div", { class: "segmented", role: "group", "aria-label": "Simulation replay speed" }, speedBtns);

  const pill = h("div", { class: "vc-tag status-pill", role: "status", "aria-live": "polite" }, h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "text" }, "Idle"));

  const abortBtn = h("button", { class: "vc-button vc-button--danger", type: "button", id: "btn-abort" }, icon("stop", 18), "Abort");
  abortBtn.addEventListener("click", () => { if (!isDisabled(abortBtn)) handlers.onAbort(); });
  // Reset and Diagnostics lose their words on laptop screens: their tooltips name them then.
  const resetBtn = h("button", { class: "vc-button vc-button--outline", type: "button", id: "btn-reset", title: "Clear the workspace" }, icon("reset", 18), h("span", { class: "btn-text" }, "Reset"));
  resetBtn.addEventListener("click", () => handlers.onReset());
  const diagBtn = h("button", { class: "vc-button vc-button--ghost", type: "button", id: "btn-diagnostics", title: "Test every external service from this browser" }, icon("pulse", 18), h("span", { class: "btn-text" }, "Diagnostics"));
  diagBtn.addEventListener("click", () => handlers.onDiagnostics());

  root.append(
    startBtn,
    scenarioDd.el,
    scanBtn,
    h("span", { class: "control-group" }, modelDd.el),
    h("span", { class: "control-group" }, h("span", { class: "control-label" }, "Replay"), speedGroup),
    h("span", { class: "spacer" }),
    pill,
    abortBtn,
    withTooltip(resetBtn, "Reset", { below: true }),
    withTooltip(diagBtn, "Diagnostics", { below: true })
  );

  // The pill names the step the run waits for ("Awaiting your decision", then "Awaiting your
  // approval"); that can change without a new run state, right after an option is approved.
  let shownState = "idle";
  onAwaitedChange(() => { pill.querySelector(".text").textContent = runStateLabel(shownState); });

  function update(s, { scenarioLabel } = {}) {
    const running = isRunning(s);
    const finished = isFinished(s);
    const sim = s.mode === "simulation";
    const live = s.mode === "live";

    startBtn.lastChild.textContent = finished ? "New run" : "Start agent";
    setDisabled(startBtn, running, "A run is in progress. Abort it or wait until it finishes.");

    scenarioDd.setValue(s.entry === "custom" ? "custom" : s.scenarioId, s.entry === "custom" ? `Custom: ${shorten(s.customText, 34)}` : scenarioLabel);
    scenarioDd.setDisabled(running, "Locked while the agent runs.");
    scenarioDd.setItemDisabled("custom", sim && !finished, "Requires Live mode. Reset to switch modes.");

    const noSearch = s.webSearch === "unavailable";
    setDisabled(scanBtn, running || (sim && !finished) || noSearch,
      running ? "Locked while the agent runs."
        : noSearch ? "Live scan needs web search, which is switched off for this API key. Run a preset scenario instead."
          : "Requires Live mode. Reset to switch modes.");

    const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
    modelDd.setValue(model.id, model.label);
    modelDd.setDisabled(running || (sim && !finished), running ? "Locked while the agent runs." : "Requires Live mode.");

    speedGroup.setAttribute("aria-disabled", String(live));
    speedGroup.title = live ? "Replay speed applies to Simulation only." : "Replay speed for Simulation mode";
    for (const [i, b] of speedBtns.entries()) b.setAttribute("aria-pressed", String([1, 2, 4][i] === s.speed));

    setDisabled(abortBtn, !running, "Nothing to abort: no run in progress.");

    pill.dataset.tone = STATE_TONE[s.runState] || "";
    pill.className = ["vc-tag", TONE_TAG[pill.dataset.tone], "status-pill"].filter(Boolean).join(" ");
    pill.querySelector(".text").textContent = runStateLabel(s.runState);
    shownState = s.runState;
  }

  return { update, focusStart: () => startBtn.focus() };
}

function shorten(text, n) {
  const t = String(text || "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ---- dropdown ----------------------------------------------------------------------------------

function dropdown({ id, caption, items, onSelect, width }) {
  const valueEl = h("span", { class: "value" }, "");
  const toggle = h("button", {
    class: "vc-button vc-button--outline dropdown-toggle", type: "button", id: `dd-${id}`,
    "aria-haspopup": "menu", "aria-expanded": "false", style: width ? { minWidth: `${Math.min(width, 360)}px` } : undefined
  }, h("span", { class: "caption" }, `${caption}:`), valueEl, icon("chevronDown", 16));
  // Vici's menu, opened and closed by this module (no popover attribute: vici.js leaves it alone).
  const menu = h("div", { class: "vc-menu dropdown-menu", role: "menu", "aria-labelledby": `dd-${id}`, hidden: true });
  const itemEls = new Map();

  for (const it of items) {
    if (it.sep) { menu.appendChild(h("hr", { class: "vc-menu__divider", role: "separator" })); continue; }
    const el = h("button", { class: "vc-menu__item", type: "button", role: "menuitemradio", "aria-checked": "false", dataset: { id: it.id } },
      it.badge ? h("span", { class: "num-badge" }, it.badge) : h("span"),
      h("span", { class: "menu-text" }, h("span", { class: "menu-title" }, it.title), it.hint ? h("span", { class: "menu-hint" }, it.hint) : null),
      it.liveOnly ? h("span", { class: "vc-tag" }, "Live only") : h("span"));
    el.addEventListener("click", () => {
      if (isDisabled(el)) return;
      close();
      onSelect(it.id);
      toggle.focus();
    });
    itemEls.set(it.id, el);
    menu.appendChild(el);
  }

  const wrap = h("div", { class: "dropdown" }, toggle, menu);

  function open() {
    if (isDisabled(toggle)) return;
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    const current = menu.querySelector('[aria-checked="true"]') || menu.querySelector(".vc-menu__item");
    current?.focus();
    document.addEventListener("mousedown", outside, true);
  }
  function close() {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", outside, true);
  }
  function outside(e) {
    if (!wrap.contains(e.target)) close();
  }

  toggle.addEventListener("click", () => (menu.hidden ? open() : close()));
  toggle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); open(); }
  });
  menu.addEventListener("keydown", (e) => {
    const els = [...menu.querySelectorAll(".vc-menu__item")];
    const i = els.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); toggle.focus(); }
    else if (e.key === "Tab") close();
  });

  return {
    el: wrap,
    setValue(idVal, label) {
      valueEl.textContent = label || "";
      for (const [iid, el] of itemEls) el.setAttribute("aria-checked", String(iid === idVal));
    },
    setDisabled(disabled, reason) {
      setDisabled(toggle, disabled, reason);
      if (disabled) close();
    },
    setItemDisabled(itemId, disabled, reason) {
      const el = itemEls.get(itemId);
      if (el) setDisabled(el, disabled, reason);
    }
  };
}

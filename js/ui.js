// UI orchestrator: builds the components, wires controls and dialogs, starts run producers and
// translates run events into map, drawer and state changes. The UI never branches on which
// producer is running; only the mode badge reads the mode.

import { bus, newRunId } from "./events.js";
import { getState, setState, subscribe, isRunning, isFinished } from "./state.js";
import { createMap } from "./map.js";
import { createConsole } from "./console.js";
import { createKpis } from "./kpi.js";
import { createDrawer } from "./drawer.js";
import { createOptionsPanel } from "./options_panel.js";
import { createOutbox } from "./outbox.js";
import { createAuditPanel } from "./audit_panel.js";
import { resetAudit } from "./audit.js";
import { createControls } from "./controls.js";
import { chooseMode, askApiKey, askCustomScenario, showReport } from "./dialogs.js";
import { openDiagnostics } from "./diagnostics_view.js";
import { openIntro, introSeen } from "./intro.js";
import { createSimulationPlayer } from "./simulation.js";
import { createLiveAgent } from "./agent.js";
import { hasKey, forgetKey } from "./keystore.js";
import { MODELS } from "./config.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { dateWithYear } from "./format.js";

const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label || id || null;

export function initUI() {
  const scenarios = window.SCENARIOS || [];
  const byId = (id) => scenarios.find((s) => s.id === id);
  setState({ keyPresent: hasKey() });

  // ---- components ------------------------------------------------------------------------------
  const badge = document.getElementById("mode-badge");
  const map = createMap(document.getElementById("map"), {});
  const consoleUI = createConsole(document.getElementById("console"), {
    onOpenOptions: () => drawer.show("options"),
    onOpenOutbox: () => drawer.show("outbox"),
    onOpenReport: (md) => showReport(md, { mode: getState().mode }),
    onSaveSimulation: () => {
      const r = auditPanel.saveSimulation();
      showBanner({ level: r.ok ? "info" : "warn", title: r.ok ? "Run saved as simulation" : "Could not save the run", text: r.message, timeout: r.ok ? 9000 : 0 });
    }
  });
  const kpis = createKpis(document.getElementById("kpis"));
  const drawer = createDrawer(document.getElementById("drawer"), {
    onToggle: () => setTimeout(() => map.invalidate(), 260)
  });
  const optionsPanel = createOptionsPanel(drawer.panel("options"), {
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to take a decision.");
      bus.emit("option_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("options", n, attention)
  });
  const outbox = createOutbox(drawer.panel("outbox"), {
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to approve drafts.");
      bus.emit("action_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("outbox", n, attention)
  });
  const auditPanel = createAuditPanel(drawer.panel("audit"), { onCount: (n) => drawer.setCount("audit", n) });
  const player = createSimulationPlayer({ getSpeed: () => getState().speed });
  const agent = createLiveAgent({
    getWebSearchState: () => getState().webSearch,
    onKeyRejected: () => {
      forgetKey();
      setState({ keyPresent: false });
    },
    onWebSearchUnavailable: () => {
      setState({ webSearch: "unavailable" });
      showBanner({
        level: "warn",
        title: "Web search is switched off for this API key",
        text: "An organisation admin has disabled Claude's web search. The live agent continues with the open-data tools; preset scenarios and Simulation mode still work."
      });
    }
  });

  const controls = createControls(document.getElementById("controls"), scenarios, {
    onStart: () => start(getState().entry === "custom" ? "custom" : "scenario"),
    onLiveScan: () => start("scan"),
    onSelectScenario: (id) => {
      setState({ scenarioId: id, entry: "scenario" });
      if (!isRunning(getState())) map.focus(byId(id)?.map_focus);
    },
    onSelectCustom: async () => {
      const text = await askCustomScenario(getState().customText);
      if (text) setState({ entry: "custom", customText: text });
    },
    onSelectModel: (id) => setState({ model: id }),
    onSpeed: (n) => setState({ speed: n }),
    onAbort: () => abort("Stopped by the user."),
    onReset: () => resetWorkspace(),
    onDiagnostics: () => openDiagnostics({
      onWebSearchResult: (available) => setState({ webSearch: available === true ? "available" : available === false ? "unavailable" : "unknown" }),
      onCost: (eur) => kpis.addSessionCost(eur)
    })
  });

  // ---- intro window: "How it works" in the header, and once by itself on a first visit -----------
  const aboutBtn = h("button", {
    class: "about-btn", type: "button", id: "btn-about",
    "aria-label": "How it works", title: "What Navigator does, how it works and why it pays off"
  }, icon("info", 18), h("span", { class: "btn-text" }, "How it works"));
  aboutBtn.addEventListener("click", () => showIntro());
  document.querySelector(".header-badges")?.appendChild(aboutBtn);

  function showIntro() {
    const s = getState();
    // During a run the window only explains; it never starts or interrupts anything.
    if (isRunning(s)) return openIntro({});
    return openIntro({
      startLabel: isFinished(s) ? "New run" : "Start agent",
      onStart: () => start(getState().entry === "custom" ? "custom" : "scenario")
    });
  }

  // ---- state → view ----------------------------------------------------------------------------
  const render = (s) => {
    controls.update(s, { scenarioLabel: byId(s.scenarioId)?.short || "Choose" });
    badge.dataset.mode = s.mode || "none";
    badge.replaceChildren(...(s.mode === "live"
      ? [h("span", { class: "mode-dot", "aria-hidden": "true" }), "LIVE"]
      : s.mode === "simulation" ? ["SIMULATION"] : ["No run active"]));
    badge.title = s.mode === "live" ? "Live agent: real model calls on your API key"
      : s.mode === "simulation" ? "Simulation: scripted replay, not live data" : "Choose a mode with Start agent";
  };
  subscribe(render);
  render(getState());

  // ---- run events → UI effects --------------------------------------------------------------------
  bus.on("state_change", (ev) => setState({ runState: ev.payload.state }));
  bus.on("run_end", (ev) => {
    const st = ev.payload.status;
    setState({ runState: st === "done" || st === "no_findings" ? "done" : st === "incomplete" ? "stopped" : st });
  });
  bus.on("map_update", (ev) => {
    const p = ev.payload;
    map.mark(p);
    if (p.focus) map.focus(p.focus);
    if (Array.isArray(p.fit)) map.fitIds(p.fit);
  });
  bus.on("alert", (ev) => {
    const p = ev.payload;
    map.mark({ supplier_ids: p.supplier_ids || [], route_ids: p.route_ids || [], node_ids: p.node_ids || [], state: "affected" });
  });
  bus.on("options", () => drawer.show("options"));
  bus.on("action_draft", () => drawer.show("outbox"));

  // ---- run control ---------------------------------------------------------------------------------
  async function start(entry) {
    const s = getState();
    if (isRunning(s)) return;
    if (isFinished(s)) resetWorkspace();

    const scenario = byId(getState().scenarioId);
    const runLabel = entry === "scan" ? "Live scan: real news and open data, no injected scenario"
      : entry === "custom" ? `Custom what-if: ${getState().customText}`
        : `Scenario ${scenario?.number}: ${scenario?.title}`;

    let mode = "live";
    if (entry !== "scan") {
      mode = await chooseMode({
        runLabel,
        simBlocked: entry === "custom" ? "Custom what-ifs need the live agent: free text has no scripted replay." : null
      });
      if (!mode) return;
    }
    if (mode === "key") {
      // "Change or forget key": the key dialog shows the stored key masked, with Forget key.
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
      mode = "live";
    }
    if (mode === "live" && !hasKey()) {
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
    }
    begin(mode, entry, scenario);
  }

  function begin(mode, entry, scenario) {
    const s = getState();
    const run_id = newRunId();
    const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
    resetWorkspace({ keepMode: true, silent: true });
    setState({ mode, runState: "scanning", runId: run_id });
    bus.beginRun({ run_id, mode });
    const title = entry === "scan" ? "Live scan for disruptions" : entry === "custom" ? "Custom what-if" : `Scenario ${scenario.number}: ${scenario.title}`;
    const def = mode === "simulation" ? window.SIM_RUNS?.[scenario?.id] : null;
    const recorded = def?.source === "recorded";
    bus.emit("run_start", {
      run_id, mode, entry, title,
      scenario_id: entry === "scenario" ? scenario.id : null,
      seed: entry === "scenario" ? scenario.seed : entry === "custom" ? s.customText : null,
      model: mode === "live" ? model.id : null,
      model_label: mode === "live" ? model.label : null,
      ...(mode === "simulation" ? {
        sim_source: recorded ? "recorded" : "authored",
        ...(recorded ? { recorded_on: def.recorded?.at ? dateWithYear(def.recorded.at) : null, recorded_model: modelLabel(def.recorded?.model) } : {})
      } : {})
    });
    if (entry === "scenario" && scenario?.map_focus) map.focus(scenario.map_focus);

    if (mode === "simulation") {
      if (!def) {
        bus.emit("notice", { level: "error", text: `No simulation script found for “${scenario?.title}”. Check that data/sim_runs.js is complete, or run Diagnostics.` });
        bus.emit("run_end", { status: "error", reason: "No simulation script for this scenario." });
        return;
      }
      player.play(def, { scenario: scenario.id });
      return;
    }

    agent.run({ entry, scenario, customText: s.customText, modelId: model.id });
  }

  function abort(reason) {
    if (player.isActive()) player.abort(reason);
    if (agent.isActive()) agent.abort(reason);
  }

  function resetWorkspace({ keepMode = false, silent = false } = {}) {
    if (player.isActive()) player.abort("Reset by the user.");
    if (agent.isActive()) agent.abort("Reset by the user.");
    bus.endRun();
    consoleUI.reset();
    map.clearStates();
    if (!silent) map.showNetwork();
    kpis.reset();
    optionsPanel.reset();
    outbox.reset();
    resetAudit();
    auditPanel.refresh();
    drawer.setOpen(false);
    setState({ runState: "idle", runId: null, ...(keepMode ? {} : { mode: null }) });
  }

  function notice(level, text) {
    showBanner({ level, title: level === "warn" ? "Heads-up" : "Note", text, timeout: 6000 });
  }

  /** Opens the intro once per browser: called by main.js after the boot screen is gone. */
  function introOnFirstVisit() {
    if (!introSeen() && !document.querySelector(".modal-backdrop")) showIntro();
  }

  return { map, start, resetWorkspace, showIntro, introOnFirstVisit };
}

/** Transient banner under the header (also used for file:// and library warnings). */
export function showBanner({ level = "info", title = "", text = "", timeout = 0 } = {}) {
  const stack = document.getElementById("banners");
  if (!stack) return null;
  const close = h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "Dismiss" }, icon("x", 18));
  const el = h("div", { class: "banner", dataset: { level }, role: level === "error" ? "alert" : "status" },
    icon(level === "info" ? "info" : "alert", 22),
    h("div", { class: "banner-text" }, title ? h("strong", {}, title) : null, text),
    close);
  close.addEventListener("click", () => el.remove());
  stack.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

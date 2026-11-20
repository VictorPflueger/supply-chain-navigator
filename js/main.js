// Starts Navigator: builds the scripted run of the scenario in the address (the Tangier fire by
// default), shows the step the address names, and follows clicks, keys, decisions and a live run.
// A replay and a live run fill the same run record, so every step looks the same in both.

import { getModel } from "./world.js";
import { STEPS, DEMO_ID, scenarioList, findScenario, scriptedRun, decideScripted, stepForPhase, figures } from "./story.js";
import { renderStory, renderKpis, heading } from "./view.js";
import { createMap, placesOf } from "./map.js";
import { createShell, getParam, setParam } from "./shell.js";
import { createLiveAgent } from "./agent.js";
import { forgetKey } from "./claude.js";
import { toolLine } from "./tools.js";
import { MODEL } from "./cost.js";
import { eurCents } from "./format.js";

const $ = (id) => document.getElementById(id);
const ORDER = STEPS.map((s) => s.id);

try {
  start();
} catch (err) {
  console.error("[Navigator] start-up failed:", err);
  $("boot").dataset.state = "failed";
  $("boot-status").textContent = "Navigator could not start.";
  $("boot-detail").textContent = String(err?.message || err);
  $("boot-detail").hidden = false;
}

function start() {
  for (const name of ["WORLD", "SCENARIOS", "REFERENCE_CASES", "SIM_RUNS", "OFFLINE_BASEMAP"]) {
    if (!globalThis[name]) throw new Error(`A data file did not load (${name}). Deploy data/ next to index.html and reload.`);
  }
  const model = getModel();
  const map = createMap($("map"), model);
  const guide = $("guide");
  let run = null;
  let places = null;
  let step = ORDER[0];
  let clockStarted = false;

  const shell = createShell({
    steps: STEPS,
    onStep(id, how) {
      step = id;
      draw();
      $("story").scrollTop = 0;
      if (how !== "code") shell.announce(`Step ${ORDER.indexOf(id) + 1}, ${STEPS[ORDER.indexOf(id)].label}: ${heading(run, id)}`);
      startClock();
    },
    onNext: () => shell.go(ORDER[ORDER.indexOf(step) + 1], "click"),
    onStart: (mode) => (mode === "live" ? startLive() : load(run.scenario.slug, ORDER[0])),
    onRestart: () => load(run.scenario.slug, ORDER[0]),
    onCase: (slug) => load(slug, ORDER[0]),
    onStop: () => agent.abort("You stopped the live run.")
  });

  // Detection → decision: from the report on screen to the person's approval, measured on this page.
  const clock = shell.createClock((text, running) => shell.setKpi("Detection → decision", {
    value: text,
    note: running ? "running since the report" : run?.decision ? "from the report to your decision" : "starts with the report",
    tone: run?.decision ? "decided" : ""
  }));
  /** The clock starts with the report on screen, once the guide is out of the way. */
  function startClock() {
    if (clockStarted || guide.open || run?.decision) return;
    clockStarted = true;
    clock.start();
  }
  guide.addEventListener("vc:guideclose", () => {
    startClock();
    if (document.activeElement === document.body) $("next").focus();
  });

  // ---- a scenario's replay ---------------------------------------------------------------------------------
  /** Loads a scenario's scripted run and shows one of its steps. */
  function load(slug, at) {
    if (agent.isActive()) agent.abort("Back to the simulation.");
    const scenario = findScenario(slug);
    run = Object.assign(scriptedRun(scenario.id, new Date()), { rejected: new Set(), drafts: new Map(), report: null, decision: null, log: [] });
    // Frame the map once on every place the replay can reach, so it does not jump between steps.
    const branchMaps = Object.values(run.branches?.approved || {}).flat().filter((e) => e.map).map((e) => e.map);
    places = placesOf(model, [...Object.values(run.events).flat(), ...branchMaps]);
    setParam("scenario", scenario.id === DEMO_ID ? null : scenario.slug);
    shell.setMode("simulation");
    shell.setReached(ORDER[ORDER.length - 1]);
    shell.setCases(scenarioList().map((s) => ({ slug: s.slug, title: s.title, short: s.short, hint: s.category })), scenario.slug);
    $("map-title").textContent = scenario.short;
    for (const el of document.querySelectorAll('.start-card [data-fig="estimate"]')) el.textContent = eurCents(run.estimateEur);
    shell.setKpi("Session cost", { value: `≈ ${eurCents(run.estimateEur)}`, note: "estimated for a live run", tone: "" });
    clock.reset();
    clockStarted = false;
    shell.go(at, "code");
  }

  function draw() {
    if (!run) return;
    renderStory(run, step, { decide, decideDraft, approveAll, goto: (id) => shell.go(id, "click") });
    renderKpis(run, shell.setKpi);
    if (run.mode === "live") places = placesOf(model, ORDER.flatMap((id) => run.events[id]));
    map.draw(places, mapStates(run, step));
  }

  /** Each place's state as the story stands at a step: the alert marks it affected, the map events after. */
  function mapStates(r, at) {
    const states = new Map();
    for (const id of ORDER.slice(0, ORDER.indexOf(at) + 1)) {
      for (const e of r.events[id]) {
        const s = e.type === "alert" ? "affected" : e.type === "map_update" ? e.state : null;
        if (!s) continue;
        for (const k of ["supplier_ids", "node_ids", "plant_ids", "route_ids"]) {
          for (const x of e[k] || []) if (s === "neutral") states.delete(x); else states.set(x, s);
        }
      }
    }
    return states;
  }

  // ---- decisions --------------------------------------------------------------------------------------------
  function decide(optionId, decision) {
    if (run.decision || (run.mode === "live" && !agent.isActive())) return;
    const opt = run.options?.options.find((o) => o.id === optionId);
    run.log.push({ at: new Date(), who: "You", what: optionId === "baseline" ? "accepted the risk and chose to do nothing" : `${decision} option ${opt?.letter}: ${opt?.title}` });
    if (decision === "rejected") run.rejected.add(optionId);
    else {
      run.decision = { id: optionId };
      clock.stop();
    }
    if (run.mode === "live") agent.decide(optionId, decision);
    else {
      decideScripted(run, optionId, decision);
      for (const e of run.events.prepare) if (e.type === "action_draft" && !run.drafts.has(e.action_id)) run.drafts.set(e.action_id, { ...e });
      run.report = run.events.prepare.find((e) => e.type === "report")?.markdown || null;
    }
    shell.announce(decision === "rejected" ? `You rejected option ${opt?.letter}.` : optionId === "baseline" ? "You accepted the risk." : `You approved option ${opt?.letter}. Next: Prepare.`);
    draw();
    if (decision === "approved") $("next").focus();
  }
  function decideDraft(id, decision, quiet = false) {
    const d = run.drafts.get(id);
    if (!d || d.status !== "pending") return;
    d.status = decision;
    run.log.push({ at: new Date(), who: "You", what: `${decision} the ${d.kind === "booking" ? "mock booking" : d.kind === "replan" ? "note" : "email"} to ${d.recipient}` });
    if (run.mode === "live") agent.decideDraft(id, decision);
    if (!quiet) draw();
  }
  function approveAll() {
    for (const [id, d] of run.drafts) if (d.status === "pending") decideDraft(id, "approved", true);
    draw();
    shell.announce("You approved every draft. Nothing was sent.");
  }

  // ---- a live run on the visitor's key -----------------------------------------------------------------------
  const agent = createLiveAgent({ emit: onLive, onKeyRejected: () => forgetKey() });
  const inputs = new Map();
  let queued = false;
  const redraw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; draw(); });
  };

  function startLive() {
    if (agent.isActive()) return;
    const scenario = run.scenario;
    run = { mode: "live", scenario, events: Object.fromEntries(ORDER.map((id) => [id, []])), options: null, decision: null, rejected: new Set(), drafts: new Map(), report: null, log: [], n: 0, live: { busy: true, step: ORDER[0], reached: ORDER[0] } };
    inputs.clear();
    shell.setMode("live");
    shell.setReached(ORDER[0]);
    shell.setLiveRunning(true);
    shell.setKpi("Session cost", { value: eurCents(0), note: `measured, Claude ${MODEL.label}`, tone: "" });
    clock.reset();
    clockStarted = true;
    clock.start();
    shell.go(ORDER[0], "code");
    shell.announce("The live run started. You are interacting with an AI system.");
    agent.run({ scenario });
  }

  function onLive(type, p) {
    if (run?.mode !== "live") return;
    const live = run.live;
    const add = (ev) => run.events[live.step].push({ id: `live-${++run.n}`, step: live.step, ...ev });
    switch (type) {
      case "state_change": {
        const next = stepForPhase(p.state, live.step);
        if (next === live.step) return;
        const follow = step === live.step;
        live.step = next;
        if (ORDER.indexOf(next) > ORDER.indexOf(live.reached)) {
          live.reached = next;
          shell.setReached(next);
        }
        if (follow) shell.go(next, "code");
        else redraw();
        return;
      }
      case "narration": {
        const same = ORDER.flatMap((id) => run.events[id]).find((e) => e.msg_id === p.msg_id);
        if (same) same.text = p.text;
        else add({ type: "narration", msg_id: p.msg_id, text: p.text });
        break;
      }
      case "tool_call":
        inputs.set(p.call_id, p.input || {});
        return;
      case "tool_result": {
        const input = inputs.get(p.call_id) || {};
        const line = p.server ? toolLine(p.name, input, p.result || {}) : p.summary;
        add({ type: "tool_result", name: p.name, line, sources: (p.sources || []).map((s) => ({ title: s.title, source: hostOf(s.url) })) });
        break;
      }
      case "alert":
      case "map_update":
      case "kpi_update":
      case "notice":
        add({ type, ...p });
        break;
      case "options":
        run.options = p;
        add({ type, ...p });
        break;
      case "action_draft":
        run.drafts.set(p.action_id, { ...p });
        break;
      case "report":
        run.report = p.markdown;
        break;
      case "cost_update":
        shell.setKpi("Session cost", { value: eurCents(p.eur || 0), note: `measured, Claude ${MODEL.label}` });
        return;
      case "run_end":
        live.busy = false;
        shell.setLiveRunning(false);
        if (p.status !== "done") add({ type: "notice", level: p.status === "error" ? "error" : "info", text: `${p.reason || "The live run ended."} Start agent runs it again; Start over replays the simulation.` });
        break;
      default:
        return;
    }
    redraw();
  }

  // ---- go -------------------------------------------------------------------------------------------------
  const asked = getParam("step");
  load(getParam("scenario") || DEMO_ID, ORDER.includes(asked) ? asked : ORDER[0]);
  fillGuide(figures(run.scenario.id === DEMO_ID ? run : scriptedRun(DEMO_ID, new Date())));
  document.documentElement.dataset.boot = "ready";
  $("boot").dataset.state = "done";
  setTimeout(() => $("boot")?.remove(), 400);
}

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
};

/** Writes the demo's computed figures into the guide, which tells the Tangier story. */
function fillGuide(figs) {
  const minutes = [...document.querySelectorAll("#guide .vc-guide__path .vc-guide__time")].map((t) => parseFloat(t.textContent));
  figs["decision-min"] = `${minutes.slice(0, ORDER.indexOf("propose") + 1).reduce((a, b) => a + b, 0)} min`;
  figs.model = MODEL.label;
  for (const el of document.querySelectorAll("#guide [data-fig], .start-card [data-fig='model']")) {
    if (figs[el.dataset.fig] !== undefined) el.textContent = figs[el.dataset.fig];
  }
}

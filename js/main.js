// Starts Navigator: builds the scripted run of the scenario in the address (the Tangier fire by
// default) and plays it. Step 1 runs by itself once the guide is closed; after that a bar right under
// what just happened says what to do next and holds that one action: run the next step, approve an
// option, approve the drafts. A running step plays out event by event, as the agent works, and the
// guide holds it while it is open. A click on a step, a number key or ?step= shows a step at once. A
// replay and a live run fill the same run record, so every step looks the same in both.

import { getModel } from "./world.js";
import { STEPS, DEMO_ID, scenarioList, findScenario, scriptedRun, decideScripted, stepForPhase, figures } from "./story.js";
import { renderStory, renderKpis, heading } from "./view.js";
import { createMap, placesOf } from "./map.js";
import { createShell, getParam, setParam } from "./shell.js";
import { createLiveAgent } from "./agent.js";
import { forgetKey } from "./claude.js";
import { toolLine } from "./tools.js";
import { MODEL } from "./cost.js";
import { eurCents, eurCompact, clock as mss, words } from "./format.js";

const $ = (id) => document.getElementById(id);
const ORDER = STEPS.map((s) => s.id);
// How long the agent takes over each kind of event when a step runs, in milliseconds.
const PACE = { narration: 1300, tool: 750, kpi_update: 900, alert: 900, options: 700, action_draft: 650, report: 600, map_update: 250 };

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
  // The step being played, its timer, whether it is paused (by the presenter or by the guide), and a
  // step about to start.
  const player = { step: null, timer: null, paused: false, held: false, queued: null, qtimer: null, heldQueue: null };

  const shell = createShell({
    steps: STEPS,
    onStep(id, how) {
      if (how !== "run") { unqueue(); finish(); reveal(id); }
      step = id;
      draw();
      $("story").scrollTop = 0;
      if (how !== "code" && how !== "run") shell.announce(`Step ${ORDER.indexOf(id) + 1}, ${STEPS[ORDER.indexOf(id)].label}: ${heading(visible(), id)}`);
      startClock();
    },
    onForward: forward,
    onSpace: space,
    onStart: (mode) => (mode === "live" ? startLive() : load(run.scenario.slug, null)),
    onRestart: () => load(run.scenario.slug, null),
    onCase: (slug) => load(slug, null)
  });

  // Detection → decision: from the report on screen to the person's approval, measured on this page.
  const clock = shell.createClock((text, running) => shell.setKpi("Detection → decision", {
    value: text,
    note: running ? "running since the report" : run?.decision ? "until your decision" : "starts with the report",
    tone: run?.decision ? "decided" : ""
  }));
  /** The clock starts with the report on screen, once the guide is out of the way. */
  function startClock() {
    if (clockStarted || guide.open || run?.decision) return;
    clockStarted = true;
    clock.start();
  }
  // The guide holds the replay: nothing plays out behind it, and it goes on when the guide closes.
  guide.addEventListener("vc:guidechange", () => {
    if (player.step && !player.paused) { pause(); player.held = true; }
    if (player.queued) { player.heldQueue = player.queued; unqueue(); draw(); }
  });
  guide.addEventListener("vc:guideclose", () => {
    startClock();
    if (player.held) { player.held = false; resume(); }
    else if (player.heldQueue) queue(player.heldQueue, 400);
    else if (run.mode !== "live" && step === ORDER[0] && !shown(ORDER[0]) && !player.step) queue(ORDER[0], 400);
    player.heldQueue = null;
    if (document.activeElement === document.body) $("story").focus({ preventScroll: true });
  });

  // ---- a scenario's replay ---------------------------------------------------------------------------------
  /** Loads a scenario's scripted run. at: the step a link asked for, shown at once; null runs step 1. */
  function load(slug, at) {
    if (agent.isActive()) agent.abort("Back to the simulation.");
    stopPlayer();
    const scenario = findScenario(slug);
    run = Object.assign(scriptedRun(scenario.id, new Date()), { rejected: new Set(), drafts: new Map(), report: null, decision: null, log: [] });
    run.shown = Object.fromEntries(ORDER.map((id) => [id, 0]));
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
    if (at) { shell.go(at, "code"); return; }
    if (!guide.open) queue(ORDER[0], 500);
    shell.go(ORDER[0], "run");
  }

  // ---- the player: a step plays out event by event -------------------------------------------------------
  const shown = (id) => run.mode === "live" || run.shown[id] >= run.events[id].length;
  /** Shows every step up to id in full. */
  function reveal(id) {
    if (run.mode === "live") return;
    for (const s of ORDER.slice(0, ORDER.indexOf(id) + 1)) run.shown[s] = run.events[s].length;
  }
  function stopPlayer() {
    clearTimeout(player.timer);
    unqueue();
    Object.assign(player, { step: null, timer: null, paused: false, held: false, heldQueue: null });
  }
  /** A step that starts by itself in a moment: step 1 once the guide is closed, step 5 after your approval. */
  function queue(id, ms) {
    unqueue();
    player.queued = id;
    player.qtimer = setTimeout(() => { player.queued = null; runStep(id); }, ms);
    draw();
  }
  function unqueue() {
    clearTimeout(player.qtimer);
    player.queued = null;
  }
  /** Ends a running step at once, everything in it shown. */
  function finish() {
    if (!player.step) return;
    reveal(player.step);
    stopPlayer();
  }
  /** Runs a step: the steps before it shown in full, then its own events one after another. */
  function runStep(id) {
    if (run.mode === "live") return;
    unqueue();
    finish();
    const at = ORDER.indexOf(id);
    if (at > 0) reveal(ORDER[at - 1]);
    run.shown[id] = 0;
    player.step = id;
    if (step !== id) shell.go(id, "run");
    else draw();
    tick();
  }
  function tick() {
    const id = player.step;
    if (!id || player.paused) return;
    const events = run.events[id];
    if (run.shown[id] >= events.length) {
      stopPlayer();
      draw();
      toResult();
      return;
    }
    const e = events[run.shown[id]];
    run.shown[id] += 1;
    draw();
    player.timer = setTimeout(tick, PACE[e.type] ?? 600);
  }
  /** A finished step shows its result: the story goes back up to its heading and the one thing to look at. */
  function toResult() {
    const story = $("story");
    if (story.scrollTop > 0) story.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function pause() { if (player.step && !player.paused) { player.paused = true; clearTimeout(player.timer); draw(); } }
  function resume() { if (player.step && player.paused) { player.paused = false; draw(); tick(); } }

  /** The right arrow: show a step about to start or finish a running one, else run the next step, or
   * show it if it already ran. */
  function forward() {
    if (player.queued) { const id = player.queued; unqueue(); shell.go(id, "key"); return; }
    if (player.step) { finish(); draw(); toResult(); return; }
    const next = ORDER[ORDER.indexOf(step) + 1];
    if (!next) return;
    if (run.mode !== "live" && !shown(next) && !(next === "prepare" && !run.decision)) runStep(next);
    else shell.go(next, "key");
  }
  /** Space: pause or continue a running step, or run the next one when the page waits for it. */
  function space() {
    if (player.step) return player.paused ? resume() : pause();
    const a = moveFor().actions.find((x) => x.id === "run");
    if (a) a.onClick();
  }

  /** The run as the page shows it now: the events that have happened, and what follows from them. */
  function visible() {
    if (run.mode === "live") return { ...run, working: run.live.busy && !awaiting(run) ? run.live.step : null };
    const events = Object.fromEntries(ORDER.map((id) => [id, run.events[id].slice(0, run.shown[id])]));
    const flat = ORDER.flatMap((id) => events[id]);
    const drafted = new Set(flat.filter((e) => e.type === "action_draft").map((e) => e.action_id));
    return {
      ...run, events, working: player.step,
      options: flat.some((e) => e.type === "options") ? run.options : null,
      drafts: new Map([...run.drafts].filter(([id]) => drafted.has(id))),
      report: flat.some((e) => e.type === "report") ? run.report : null
    };
  }

  function draw() {
    if (!run) return;
    const vis = visible();
    renderStory(vis, step, { decide, decideDraft });
    renderKpis(run, shell.setKpi);
    if (run.mode === "live") places = placesOf(model, ORDER.flatMap((id) => run.events[id]));
    map.draw(places, mapStates(vis, step));
    shell.setMove(moveFor(vis));
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

  // ---- the request for interaction ------------------------------------------------------------------------
  /** What the bar under the story says and offers, for the run as it stands. */
  function moveFor(vis = visible()) {
    const at = ORDER.indexOf(step);
    const here = STEPS[at];
    const next = STEPS[at + 1];
    const live = run.mode === "live";
    const goTo = (s, label) => ({ id: "go", label, icon: "chevron-right", kind: "secondary", onClick: () => shell.go(s.id, "click") });
    // A live run: Claude works, or waits for you in step 4 or 5.
    if (live && !run.live.ended) {
      const wait = awaiting(vis);
      if (wait && wait !== step) {
        const n = ORDER.indexOf(wait) + 1;
        return { tone: "decide", lead: "Claude waits for you.", text: `Your ${wait === "propose" ? "decision" : "approval"} is needed in step ${n}.`, actions: [{ id: "go", label: `Go to step ${n}`, icon: "chevron-right", attention: true, onClick: () => shell.go(wait, "click") }] };
      }
      if (!wait && run.live.busy) {
        const now = STEPS[ORDER.indexOf(run.live.step)];
        const stop = { id: "stop", label: "Stop the live run", icon: "stop", kind: "danger", onClick: () => agent.abort("You stopped the live run.") };
        return { tone: "working", lead: "Claude is working.", text: `Step ${ORDER.indexOf(now.id) + 1}, ${now.label}: ${now.doing}. You are interacting with an AI system.`, actions: now.id === step ? [stop] : [goTo(now, `Go to step ${ORDER.indexOf(now.id) + 1}`), stop] };
      }
    }
    if (player.queued) {
      const soon = STEPS[ORDER.indexOf(player.queued)];
      return { tone: "working", lead: player.queued === ORDER[0] ? "Starting." : "Approved.", text: soon.next, actions: [] };
    }
    if (player.step) {
      const now = STEPS[ORDER.indexOf(player.step)];
      return player.paused
        ? { tone: "move", lead: "Paused.", text: `Step ${ORDER.indexOf(now.id) + 1}, ${now.label}: the agent waits for you.`, actions: [{ id: "resume", label: "Continue", icon: "play", attention: true, onClick: resume }] }
        : { tone: "working", lead: "The agent is working.", text: `Step ${ORDER.indexOf(now.id) + 1}, ${now.label}: ${now.doing}.`, actions: [{ id: "pause", label: "Pause", icon: "pause", kind: "secondary", onClick: pause }] };
    }
    if (live && run.live.ended) return ended();
    // This step hasn't run yet: step 1 starts once the guide is closed.
    if (!live && !shown(step)) return guide.open
      ? { tone: "working", lead: "Ready.", text: "The agent starts when you close the guide.", actions: [] }
      : { tone: "move", lead: "Your move.", text: here.next, actions: [{ id: "run", label: `Run step ${at + 1}: ${here.label}`, icon: "play", attention: true, onClick: () => runStep(step) }] };
    // Your decision on the options.
    if (step === "propose" && vis.options && !run.decision) {
      const rec = vis.options.options.find((o) => o.recommended);
      const open = rec && !run.rejected.has(rec.id);
      return {
        tone: "decide", lead: "Your decision.",
        text: open ? `The agent recommends option ${rec.letter}: ${eurCompact(rec.mitigation_cost_eur)} cuts the risk to ${eurCompact(rec.residual_var_eur)}. Approve it, or choose another option above.` : "Approve one of the other options above, or accept the risk.",
        actions: open ? [{ id: "approve-rec", label: `Approve option ${rec.letter}`, icon: "check", attention: true, onClick: () => decide(rec.id, "approved") }] : []
      };
    }
    if (step === "prepare") {
      if (!run.decision) return { tone: "decide", lead: "Your decision first.", text: "The agent drafts only for an option you approve.", actions: [{ id: "go", label: "Back to Propose", icon: "chevron-left", kind: "secondary", onClick: () => shell.go("propose", "click") }] };
      const drafts = [...vis.drafts.values()];
      const open = drafts.filter((d) => d.status === "pending");
      if (open.length) return { tone: "decide", lead: "Your approval.", text: `${cap(words(open.length))} draft${open.length === 1 ? " waits" : "s wait"} for you. Approving sends nothing.`, actions: [{ id: "approve-all", label: open.length === drafts.length ? "Approve all" : `Approve the other ${words(open.length)}`, icon: "check", attention: true, onClick: approveAll }] };
      if (drafts.length) return done();
    }
    if (next) {
      const runnable = !live && !shown(next.id);
      return { tone: "move", lead: "Your move.", text: next.next, actions: [runnable
        ? { id: "run", label: `Run step ${at + 2}: ${next.label}`, icon: "play", attention: true, onClick: () => runStep(next.id) }
        : { ...goTo(next, `Step ${at + 2}: ${next.label}`), kind: "primary", attention: !live }] };
    }
    return done();
  }
  /** Where a run waits for a person: options without a decision (propose), drafts to approve (prepare). */
  function awaiting(r) {
    if (r.options && !r.decision) return "propose";
    return [...r.drafts.values()].some((d) => d.status === "pending") ? "prepare" : null;
  }
  function done() {
    const elapsed = run.decision ? mss(clock.elapsedMs()) : null;
    return {
      tone: "done", lead: "Done.",
      text: `${elapsed ? `From the report to your decision in ${elapsed}. ` : ""}Nothing was sent. Start over, or try another scenario.`,
      actions: [{ id: "again", label: "Start over", icon: "refresh", kind: "secondary", onClick: () => load(run.scenario.slug, null) }, { id: "cases", label: "Another scenario", icon: "chevron-down", kind: "ghost", onClick: () => shell.openCases() }]
    };
  }
  function ended() {
    const reason = run.live.reason;
    return {
      tone: "done", lead: run.live.status === "done" ? "Done." : "The live run stopped.",
      text: run.live.status === "done" ? "Nothing was sent. Start over to replay the simulation." : `${reason || "It ended early."} Start agent runs it again; Start over replays the simulation.`,
      actions: [{ id: "again", label: "Start over", icon: "refresh", kind: "secondary", onClick: () => load(run.scenario.slug, null) }]
    };
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
      run.shown.propose = run.events.propose.length;
      for (const e of run.events.prepare) if (e.type === "action_draft" && !run.drafts.has(e.action_id)) run.drafts.set(e.action_id, { ...e });
      run.report = run.events.prepare.find((e) => e.type === "report")?.markdown || null;
    }
    shell.announce(decision === "rejected" ? `You rejected option ${opt?.letter}.` : optionId === "baseline" ? "You accepted the risk." : `You approved option ${opt?.letter}. The agent drafts the requests.`);
    draw();
    // After your approval the agent goes on by itself: it drafts the actions in step 5.
    if (decision === "approved" && run.mode !== "live") { queue("prepare", 1100); draw(); }
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
    if (player.step === "prepare") finish();
    for (const [id, d] of visible().drafts) if (d.status === "pending") decideDraft(id, "approved", true);
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
    stopPlayer();
    const scenario = run.scenario;
    run = { mode: "live", scenario, events: Object.fromEntries(ORDER.map((id) => [id, []])), options: null, decision: null, rejected: new Set(), drafts: new Map(), report: null, log: [], n: 0, live: { busy: true, step: ORDER[0], reached: ORDER[0], ended: false } };
    inputs.clear();
    shell.setMode("live");
    shell.setReached(ORDER[0]);
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
        Object.assign(live, { busy: false, ended: true, status: p.status, reason: p.reason });
        if (p.status !== "done") add({ type: "notice", level: p.status === "error" ? "error" : "info", text: p.reason || "The live run ended." });
        break;
      default:
        return;
    }
    redraw();
  }

  // ---- go -------------------------------------------------------------------------------------------------
  const asked = getParam("step");
  load(getParam("scenario") || DEMO_ID, ORDER.includes(asked) ? asked : null);
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

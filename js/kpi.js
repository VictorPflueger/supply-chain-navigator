// Header KPI strip: value at risk, first line stop, detection → decision stopwatch, session cost.
// After a decision the first two tiles show what remains with the approved option, so the payoff
// of the decision is visible at a glance.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { eurCompact, eurCents, clock, shortDate, int } from "./format.js";

const SESSION_COST_KEY = "nav.sessionCostEur";

// What the stopwatch is waiting on while it runs.
const WATCH_STATE = {
  scanning: "scanning sources",
  diagnosing: "mapping the exposure",
  verifying: "verifying the signal",
  simulating: "calculating the impact",
  options: "options ready",
  awaiting_approval: "waiting for your decision",
  executing: "drafting actions"
};

export function createKpis(container) {
  // Vici's stat card; a tile that shows a state takes that state's tone (css/style.css).
  const make = (id, label, sub) => {
    const value = h("div", { class: "vc-stat__value kpi-value", id: `kpi-${id}-value` }, "—");
    const subEl = h("div", { class: "vc-stat__note kpi-sub", id: `kpi-${id}-sub` }, sub);
    const el = h("div", { class: "vc-stat kpi", dataset: { tone: "muted" }, role: "group", "aria-label": label },
      h("div", { class: "vc-stat__label kpi-label" }, label), value, subEl);
    container.appendChild(el);
    return { el, value, sub: subEl };
  };

  const var30 = make("var", "Value at risk", "30-day line-stop exposure");
  const stop = make("stop", "First line stop in", "no run yet");
  const watch = make("watch", "Detection → decision", "starts with the run");
  const cost = make("cost", "Session cost", "no model calls yet");

  let sessionBase = readSessionCost();
  let runCost = 0;
  let lastRunCost = null;
  let mode = null;
  let running = false;
  let timer = null;
  let t0 = 0;
  let frozenAt = null;
  let lastVar = null;

  const set = (tile, text, tone, sub) => {
    if (tile.value.textContent !== text) {
      tile.value.textContent = text;
      tile.value.classList.remove("flip");
      void tile.value.offsetWidth;
      tile.value.classList.add("flip");
    }
    if (tone !== undefined) tile.el.dataset.tone = tone;
    if (sub !== undefined) {
      tile.sub.textContent = sub;
      tile.sub.title = sub; // full text on hover when the tile truncates it
    }
  };

  const renderCost = () => {
    if (mode === "simulation") {
      set(cost, "€0.00", "muted", "simulated: no model calls");
      return;
    }
    const total = sessionBase + runCost;
    let sub;
    if (mode === "live" && running) sub = `this run ${eurCents(runCost)}`;
    else if (lastRunCost !== null) sub = `last run ${eurCents(lastRunCost)}`;
    else sub = total > 0 ? "earlier live runs in this tab" : "no model calls yet";
    set(cost, eurCents(total), total > 0 ? "" : "muted", sub);
  };

  function startWatch() {
    stopWatch();
    t0 = performance.now();
    frozenAt = null;
    set(watch, "00:00", "", "running");
    timer = setInterval(() => {
      watch.value.textContent = clock(performance.now() - t0);
    }, 250);
  }

  function stopWatch(sub) {
    if (timer) clearInterval(timer);
    timer = null;
    if (sub && frozenAt === null) {
      frozenAt = performance.now() - t0;
      watch.value.textContent = clock(frozenAt);
      watch.sub.textContent = sub;
    }
  }

  bus.on("run_start", (ev) => {
    mode = ev.payload.mode;
    running = true;
    runCost = 0;
    lastVar = null;
    set(var30, "—", "muted", "calculating once the impact is known");
    set(stop, "—", "muted", "calculating");
    startWatch();
    renderCost();
  });

  bus.on("state_change", (ev) => {
    const label = WATCH_STATE[ev.payload.state];
    if (timer && frozenAt === null && label) watch.sub.textContent = label;
  });

  bus.on("kpi_update", (ev) => {
    const p = ev.payload;
    if (p.decided) return showDecision(p);
    if (typeof p.value_at_risk_eur === "number") {
      lastVar = p.value_at_risk_eur;
      set(var30, eurCompact(p.value_at_risk_eur), p.value_at_risk_eur > 0 ? "affected" : "resolved",
        `${p.horizon_days || 30}-day exposure${p.label ? `, ${p.label}` : ""}`);
    }
    if ("first_stop_day" in p) {
      if (p.first_stop_day === null) {
        set(stop, "None", "resolved", `no line stop within ${p.search_days || 60} days`);
      } else {
        const plant = p.first_stop_plant_name || p.first_stop_plant || "";
        set(stop, dayCount(p.first_stop_day), p.first_stop_day <= 14 ? "affected" : "at-risk",
          `${plant}${plant ? ", " : ""}${shortDate(p.first_stop_day)}`);
      }
    }
  });

  /** After the human decision: what remains with the approved option, compared with before. */
  function showDecision(p) {
    const before = typeof p.before_eur === "number" ? p.before_eur : lastVar;
    if (p.accepted) {
      var30.sub.textContent = "risk accepted, no mitigation";
      stop.sub.textContent = `${stop.sub.textContent.replace(/, risk accepted$/, "")}, risk accepted`;
      return;
    }
    if (typeof p.residual_eur === "number") {
      set(var30, eurCompact(p.residual_eur), p.residual_eur > 0 ? "at-risk" : "resolved",
        `left with ${p.option_label}${typeof before === "number" ? ` (was ${eurCompact(before)})` : ""}`);
    }
    if ("first_stop_day_after" in p) {
      if (p.first_stop_day_after === null) {
        set(stop, "None", "resolved", `no line stop with ${p.option_label}`);
      } else {
        const plant = p.first_stop_plant_name_after || "";
        set(stop, dayCount(p.first_stop_day_after), "at-risk", `${plant}${plant ? ", " : ""}partial, with ${p.option_label}`);
      }
    }
  }

  bus.on("option_decision", (ev) => {
    if (ev.payload.decision === "approved") stopWatch("to the approved decision");
  });

  bus.on("report", () => stopWatch("to the management summary"));

  bus.on("cost_update", (ev) => {
    if (ev.payload.simulated) return;
    runCost = Number(ev.payload.eur) || 0;
    renderCost();
  });

  bus.on("run_end", (ev) => {
    const status = ev.payload.status;
    running = false;
    stopWatch(status === "done" || status === "no_findings" ? "run complete" : status === "aborted" ? "stopped (aborted)" : "stopped");
    if (mode === "live") {
      sessionBase += runCost;
      lastRunCost = runCost;
      runCost = 0;
      writeSessionCost(sessionBase);
    }
    renderCost();
  });

  function reset() {
    stopWatch();
    mode = null;
    running = false;
    runCost = 0;
    frozenAt = null;
    lastVar = null;
    set(var30, "—", "muted", "30-day line-stop exposure");
    set(stop, "—", "muted", "no run yet");
    set(watch, "00:00", "muted", "starts with the run");
    renderCost();
  }

  /** Adds a cost outside a run (e.g. the optional web-search probe in Diagnostics). */
  function addSessionCost(eur) {
    sessionBase += Number(eur) || 0;
    writeSessionCost(sessionBase);
    renderCost();
  }

  reset();
  return { reset, addSessionCost };
}

function dayCount(n) {
  return `${int(n)} ${n === 1 ? "day" : "days"}`;
}

function readSessionCost() {
  try { return Number(sessionStorage.getItem(SESSION_COST_KEY)) || 0; } catch { return 0; }
}

function writeSessionCost(v) {
  try { sessionStorage.setItem(SESSION_COST_KEY, String(v)); } catch { /* ignore */ }
}


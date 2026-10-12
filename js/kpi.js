// Header KPI strip: value at risk, first line stop, detection → decision stopwatch, session cost.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { eurCompact, eurCents, clock, shortDate, int } from "./format.js";

const SESSION_COST_KEY = "nav.sessionCostEur";

export function createKpis(container) {
  const make = (id, label, sub) => {
    const value = h("div", { class: "kpi-value", id: `kpi-${id}-value` }, "—");
    const subEl = h("div", { class: "kpi-sub", id: `kpi-${id}-sub` }, sub);
    const el = h("div", { class: "kpi", dataset: { tone: "muted" }, role: "group", "aria-label": label },
      h("div", { class: "kpi-label" }, label), value, subEl);
    container.appendChild(el);
    return { el, value, sub: subEl };
  };

  const var30 = make("var", "Value at risk", "30-day line-stop exposure");
  const stop = make("stop", "First line stop in", "no run yet");
  const watch = make("watch", "Detection → decision", "starts with the run");
  const cost = make("cost", "Session cost", "no model calls yet");

  let sessionBase = readSessionCost();
  let runCost = 0;
  let mode = null;
  let timer = null;
  let t0 = 0;
  let frozenAt = null;

  const set = (tile, text, tone, sub) => {
    if (tile.value.textContent !== text) {
      tile.value.textContent = text;
      tile.value.classList.remove("flip");
      void tile.value.offsetWidth;
      tile.value.classList.add("flip");
    }
    if (tone) tile.el.dataset.tone = tone;
    if (sub !== undefined) tile.sub.textContent = sub;
  };

  const renderCost = () => {
    if (mode === "simulation") {
      set(cost, "€0.00", "muted", "simulated: no model calls");
      return;
    }
    const total = sessionBase + runCost;
    set(cost, eurCents(total), total > 0 ? undefined : "muted",
      mode === "live" ? `this run ${eurCents(runCost)}` : total > 0 ? "previous live runs" : "no model calls yet");
  };

  function startWatch() {
    stopWatch();
    t0 = performance.now();
    frozenAt = null;
    set(watch, "00:00", undefined, "running");
    watch.el.dataset.tone = "";
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
    runCost = 0;
    set(var30, "—", "muted", "calculating once the impact is known");
    set(stop, "—", "muted", "calculating");
    startWatch();
    renderCost();
  });

  bus.on("kpi_update", (ev) => {
    const p = ev.payload;
    if (typeof p.value_at_risk_eur === "number") {
      set(var30, eurCompact(p.value_at_risk_eur), p.value_at_risk_eur > 0 ? "affected" : "resolved",
        `${p.horizon_days || 30}-day line-stop exposure${p.label ? `, ${p.label}` : ""}`);
    }
    if (p.residual_eur !== undefined) {
      var30.sub.textContent = `${p.option_label || "Approved option"} leaves ${eurCompact(p.residual_eur)} at risk`;
    }
    if ("first_stop_day" in p) {
      if (p.first_stop_day === null) {
        set(stop, "None", "resolved", `no line stop within ${p.search_days || 60} days`);
      } else {
        const plant = p.first_stop_plant_name || p.first_stop_plant || "";
        set(stop, `${int(p.first_stop_day)} ${p.first_stop_day === 1 ? "day" : "days"}`, p.first_stop_day <= 14 ? "affected" : "at-risk",
          `${plant}${plant ? ", " : ""}${shortDate(p.first_stop_day)}`);
      }
    }
  });

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
    stopWatch(status === "done" || status === "no_findings" ? "run complete" : status === "aborted" ? "stopped (aborted)" : "stopped");
    if (mode === "live") {
      sessionBase += runCost;
      runCost = 0;
      writeSessionCost(sessionBase);
    }
    renderCost();
  });

  function reset() {
    stopWatch();
    mode = null;
    runCost = 0;
    frozenAt = null;
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

function readSessionCost() {
  try { return Number(sessionStorage.getItem(SESSION_COST_KEY)) || 0; } catch { return 0; }
}

function writeSessionCost(v) {
  try { sessionStorage.setItem(SESSION_COST_KEY, String(v)); } catch { /* ignore */ }
}

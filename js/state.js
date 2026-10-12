// Small observable application state (mode, run state, selections). UI modules subscribe to it.

import { DEFAULT_MODEL, STORAGE, UI } from "./config.js";

const listeners = new Set();

const state = {
  mode: null,              // null | "simulation" | "live"   (chosen per run; cleared by Reset)
  runState: "idle",        // see RUN_STATES in events.js
  runId: null,
  entry: "scenario",       // "scenario" | "scan" | "custom"
  scenarioId: UI.defaultScenario,
  customText: "",
  model: readSession(STORAGE.model) || DEFAULT_MODEL,
  speed: Number(readSession(STORAGE.speed)) || 1,
  keyPresent: false,
  webSearch: "unknown",    // "unknown" | "available" | "unavailable"
  drawerOpen: false
};

export function getState() {
  return { ...state };
}

export function setState(patch) {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (state[k] !== v) {
      state[k] = v;
      changed = true;
    }
  }
  if (patch.model) writeSession(STORAGE.model, patch.model);
  if (patch.speed) writeSession(STORAGE.speed, String(patch.speed));
  if (changed) for (const fn of listeners) fn(getState());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True while a run is in progress (anything except idle and terminal states). */
export function isRunning(s = state) {
  return !["idle", "done", "aborted", "error"].includes(s.runState);
}

function readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSession(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* storage unavailable: keep in memory only */ }
}

// Which human step a run is waiting for. The run state "awaiting_approval" covers two moments:
// choosing an option, and approving the drafts that follow. The decision events tell them apart.
// The status pill, the console's phase line and the progress rail all name the moment through
// this module, so the words match everywhere: "Your decision", then "Your approval".

import { bus, RUN_STATES } from "./events.js";

let deciding = false; // options are on the table and none has been approved yet
const listeners = new Set();

function set(value) {
  if (deciding === value) return;
  deciding = value;
  for (const fn of listeners) fn();
}

bus.on("run_start", () => set(false));
bus.on("options", () => set(true));
bus.on("option_decision", (ev) => { if (ev.payload?.decision === "approved") set(false); });
// Drafts only follow a decision, and drafting ("executing") means the decision is made. This also
// covers the do-nothing path that follows three rejections, which has no approval event.
bus.on("action_draft", () => set(false));
bus.on("state_change", (ev) => { if (ev.payload?.state === "executing") set(false); });

/** "decision" while the options wait for a choice, otherwise "approval". */
export function awaitedStep() {
  return deciding ? "decision" : "approval";
}

/** Display label for a run state; names the human step when the run waits for one. */
export function runStateLabel(state) {
  if (state === "awaiting_approval") return deciding ? "Awaiting your decision" : "Awaiting your approval";
  return RUN_STATES[state] || state;
}

/** Call `fn` whenever the awaited step changes (for example right after an option is approved). */
export function onAwaitedChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

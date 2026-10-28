// Progress rail: the agent's plan as five steps (the same five as the intro window), on Vici's
// stepper, shown above the console. Before a run it previews the plan; during a run it shows where
// the agent is (ink, its hexagon pulsing); when the agent hands over to the human, the step turns
// merlot with "Your decision" (choose an option) or "Your approval" (clear the drafts). A tick marks
// a step done, a stop mark where a run ended early, a dashed hexagon a step the run did not need.
//
// Run states map onto steps monotonically: once the agent has reached a step, a later return to an
// earlier phase (it often maps exposure again after verifying) does not move the rail backwards.

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { awaitedStep, onAwaitedChange } from "./handover.js";

const STEPS = [
  { id: "spot", label: "Spot" },
  { id: "check", label: "Check" },
  { id: "calculate", label: "Calculate" },
  { id: "propose", label: "Propose" },
  { id: "prepare", label: "Prepare" }
];

const STATE_STEP = { scanning: 0, diagnosing: 0, verifying: 1, simulating: 2, options: 3, awaiting_approval: 4, executing: 4 };
const STATE_TEXT = {
  todo: "not started", active: "in progress", done: "completed", yours: "waiting for you",
  stopped: "stopped here", skipped: "not needed"
};

export function createProgressRail() {
  const el = h("ol", { class: "vc-stepper rail", "aria-label": "Agent progress" });
  let reached = -1;     // furthest step reached in this run
  let ended = null;     // null while running; otherwise the run_end status
  let lastState = null; // the run state last shown

  // "Awaiting approval" covers both the option decision (step 4) and the drafts (step 5).
  const stepOf = (runState) => (runState === "awaiting_approval" && awaitedStep() === "decision" ? 3 : STATE_STEP[runState]);
  const turnOf = (runState) => {
    if (runState === "options") return "Your decision";
    if (runState === "awaiting_approval") return awaitedStep() === "decision" ? "Your decision" : "Your approval";
    return null;
  };
  // Right after an approval, the step stops waiting for you even before the next state arrives.
  onAwaitedChange(() => { if (!ended && reached >= 0) render(lastState); });

  function render(runState) {
    lastState = runState;
    clear(el);
    STEPS.forEach((step, i) => {
      let state = "todo";
      if (ended) {
        if (ended === "done" || ended === "no_findings") state = i <= reached ? "done" : reached >= 0 ? "skipped" : "todo";
        else state = i < reached ? "done" : i === reached ? "stopped" : "todo";
      } else if (reached >= 0) {
        if (i < reached) state = "done";
        else if (i === reached) state = turnOf(runState) ? "yours" : "active";
      }
      const current = !ended && reached >= 0 && i === reached;
      // A done step shows Vici's tick (drawn by the stepper), so its marker keeps just the number.
      const mark = state === "yours" ? icon("user", 16)
        : state === "stopped" ? icon("stop", 14)
          : h("span", { class: "rail-num" }, String(i + 1));
      el.appendChild(h("li", {
        class: ["vc-step", "rail-step", state === "done" ? "vc-step--done" : "", current ? "vc-step--current" : ""],
        dataset: { state, step: step.id },
        ...(current ? { "aria-current": "step" } : {})
      },
      h("span", { class: "vc-step__marker rail-dot", "aria-hidden": "true" }, mark),
      h("span", { class: "vc-step__label rail-label" }, step.label),
      state === "yours" ? h("span", { class: "vc-tag vc-tag--solid rail-turn" }, turnOf(runState)) : null,
      h("span", { class: "vc-visually-hidden" }, `: ${state === "yours" ? `${turnOf(runState).toLowerCase()} needed` : STATE_TEXT[state]}`)));
    });
  }

  return {
    el,
    /** Follow a run state (state_change). */
    update(runState) {
      if (ended) return;
      if (runState in STATE_STEP) reached = Math.max(reached, stepOf(runState));
      render(runState);
    },
    /** The run has ended with this status (done, no_findings, incomplete, aborted, error). */
    finish(status) {
      ended = status || "done";
      render(null);
    },
    /** Back to the plan preview (Reset, or a new run). */
    reset() {
      reached = -1;
      ended = null;
      render(null);
    }
  };
}

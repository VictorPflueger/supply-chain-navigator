// Intro window: what Navigator does, how it works and why it pays off, readable in about a minute.
// It opens by itself on a visitor's first visit (remembered in this browser's local storage) and
// any time from the "How it works" button in the header.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { STORAGE } from "./config.js";

// The five steps are the same as the progress rail above the console, on Vici's stepper. Their
// hexagons use the tones the app uses for the same moments: danger for a disruption, fjord (info) for
// verification, warning for risk, ink for your decision (merlot never sits among the state colours)
// and success for a resolved state.
const STEPS = [
  { tone: "spot", title: "Spot", text: "Picks up a warning from live news and open data, and checks whether we are exposed." },
  { tone: "check", title: "Check", text: "Confirms it with a second, independent source." },
  { tone: "calculate", title: "Calculate", text: "Works out which factory stops when, and what it costs." },
  { tone: "propose", title: "Propose", text: "Offers three costed options next to doing nothing. You decide." },
  { tone: "prepare", title: "Prepare", text: "Drafts the emails and bookings for your approval. Nothing is sent." }
];

const VALUE = [
  { title: "Minutes, not days", text: "From the first warning to a decision while there is still time to act." },
  { title: "The cheapest fix", text: "Every option is priced against the cost of a stopped production line." },
  { title: "People stay in charge", text: "The agent prepares, you approve, and every step is logged." }
];

/** True once this browser has seen the intro (closed it at least once). */
export function introSeen() {
  try { return localStorage.getItem(STORAGE.introSeen) === "1"; } catch { return false; }
}

function markIntroSeen() {
  try { localStorage.setItem(STORAGE.introSeen, "1"); } catch { /* storage blocked: it opens again next time */ }
}

/**
 * Opens the intro window. With `onStart`, its main button starts the usual run flow (mode choice
 * first) under `startLabel`; without it (a run is in progress) there is only Close.
 * Resolves "start" or null.
 */
export function openIntro({ startLabel = "Start agent", onStart = null } = {}) {
  return new Promise((resolve) => {
    let modal;
    const steps = h("ol", { class: "vc-stepper intro-steps" }, STEPS.map((s, i) =>
      h("li", { class: "vc-step intro-step", dataset: { tone: s.tone } },
        h("span", { class: "vc-step__marker intro-num", "aria-hidden": "true" }, String(i + 1)),
        h("strong", { class: "vc-step__label intro-step-title" }, s.title),
        h("span", { class: "vc-step__hint intro-step-text" }, s.text))));
    const value = h("ul", { class: "intro-value" }, VALUE.map((v) =>
      h("li", {}, h("strong", {}, v.title), h("span", {}, v.text))));

    const footer = onStart
      ? [
        h("span", { class: "dialog-note" }, "Try it for free: press ", h("strong", {}, startLabel), " and choose ", h("strong", {}, "Simulation"), ". No key needed."),
        h("button", { class: "vc-button vc-button--ghost", type: "button", on: { click: () => modal.close(null) } }, "Close"),
        h("button", { class: "vc-button", type: "button", autofocus: true, on: { click: () => modal.close("start") } }, icon("play", 18), startLabel)
      ]
      : [h("button", { class: "vc-button", type: "button", autofocus: true, on: { click: () => modal.close(null) } }, "Close")];

    modal = openModal({
      title: "How Navigator works",
      intro: "Navigator is an AI agent for supply chain disruptions. It works out which factory will stop, when, what that costs, and the cheapest way to keep production running.",
      className: "intro-modal",
      size: "intro",
      body: [
        h("h3", {}, "How it works"),
        steps,
        h("h3", {}, "Why it pays off"),
        value,
        h("p", { class: "intro-note" }, "Nordwerk Automotive is a fictional company. Places, routes and live data are real.")
      ],
      footer,
      onClose: (result) => {
        markIntroSeen();
        resolve(result || null);
        if (result === "start") onStart?.();
      }
    });
  });
}

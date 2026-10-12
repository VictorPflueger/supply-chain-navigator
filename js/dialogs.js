// Dialogs: run-mode choice, API key, custom what-if, management summary.

import { h, copyText, downloadText } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { renderMarkdown } from "./md.js";
import { ANTHROPIC } from "./config.js";
import { getKey, setKey, forgetKey, hasKey, looksLikeKey, maskKey } from "./keystore.js";
import { checkKey } from "./anthropic.js";

/**
 * Ask which mode to run in. Resolves "simulation" | "live" | null.
 * runLabel: what will run (scenario title or "Live scan"); simBlocked: reason Simulation is unavailable.
 */
export function chooseMode({ runLabel, simBlocked = null }) {
  return new Promise((resolve) => {
    let modal;
    const pick = (mode) => modal.close(mode);
    const simCard = h("section", { class: "mode-card", dataset: { mode: "simulation" }, "aria-disabled": simBlocked ? "true" : "false" },
      h("h3", {}, icon("play", 22), "Simulation"),
      h("span", { class: "badge-sim" }, "SIMULATION"),
      h("ul", {},
        h("li", {}, "Scripted replay of a representative agent run, through the same interface."),
        h("li", {}, "No API key, no cost, no model calls. Works offline apart from map tiles."),
        h("li", {}, "Every € figure is still calculated by the impact engine from the world data."),
        h("li", {}, "Labelled SIMULATION throughout, including the audit export.")),
      simBlocked ? h("p", { class: "why-disabled" }, simBlocked) : null,
      h("div", { class: "mode-cta" },
        h("button", { class: "btn", type: "button", "aria-disabled": simBlocked ? "true" : "false", on: { click: () => { if (!simBlocked) pick("simulation"); } } }, icon("play", 18), "Run simulation")));
    const liveCard = h("section", { class: "mode-card", dataset: { mode: "live" } },
      h("h3", {}, icon("spark", 22), "Live agent"),
      h("span", { class: "badge-live" }, "LIVE"),
      h("ul", {},
        h("li", {}, "Real Claude reasoning with real tool calls: live web search and open data."),
        h("li", {}, "Runs on your own Anthropic API key, kept in this tab only."),
        h("li", {}, "A typical run costs a few tens of euro cents on Sonnet; the cost meter shows it live."),
        h("li", {}, "If it finds nothing material, it says so.")),
      h("div", { class: "mode-cta" },
        h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => pick("live") } }, icon("key", 18), hasKey() ? `Use my key (${maskKey()})` : "Continue with my API key")));

    modal = openModal({
      title: "How should the agent run?",
      intro: "Live is the real thing. Simulation is for rehearsal, offline fallback and exploring without a key.",
      body: [
        h("div", { class: "run-summary" }, h("span", { class: "label" }, "Will run:"), h("strong", {}, runLabel)),
        h("div", { class: "mode-cards" }, simCard, liveCard)
      ],
      onClose: (result) => resolve(result || null)
    });
  });
}

/** Ask for (or confirm) the API key. Resolves true when a key is stored and accepted. */
export function askApiKey({ reason = "" } = {}) {
  return new Promise((resolve) => {
    let modal;
    let accepted = false;
    const input = h("input", {
      class: "input mono", id: "api-key-input", type: "password", autocomplete: "off", spellcheck: "false",
      placeholder: "sk-ant-…", "aria-describedby": "api-key-help api-key-msg", autofocus: true
    });
    const showBtn = h("button", { class: "btn btn-icon", type: "button", "aria-label": "Show key", title: "Show or hide the key" }, icon("eye", 20));
    showBtn.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      showBtn.replaceChildren(icon(hidden ? "eyeOff" : "eye", 20));
      showBtn.setAttribute("aria-label", hidden ? "Hide key" : "Show key");
    });
    const msg = h("div", { class: "field-error", id: "api-key-msg", role: "status" }, reason);
    const saveBtn = h("button", { class: "btn btn-primary", type: "button" }, icon("check", 18), "Check key and continue");
    const forgetBtn = h("button", { class: "btn btn-danger", type: "button", hidden: !hasKey() }, "Forget key");

    const current = hasKey()
      ? h("div", { class: "key-current" }, icon("key", 18), "A key is stored for this tab:", h("code", {}, maskKey()))
      : null;

    async function save() {
      if (saveBtn.getAttribute("aria-disabled") === "true") return;
      const raw = input.value.trim() || getKey() || "";
      if (!raw) { msg.className = "field-error"; msg.textContent = "Paste your Anthropic API key (it starts with sk-ant-)."; input.focus(); return; }
      if (!looksLikeKey(raw)) { msg.className = "field-error"; msg.textContent = "That does not look like an Anthropic API key. It should start with sk-ant-."; input.focus(); return; }
      saveBtn.setAttribute("aria-disabled", "true");
      msg.className = "field-ok";
      msg.replaceChildren(h("span", { class: "spinner" }), " Checking the key with Anthropic (free, no tokens used)…");
      const r = await checkKey(raw);
      saveBtn.setAttribute("aria-disabled", "false");
      if (r.ok) {
        setKey(raw);
        accepted = true;
        modal.close(true);
        return;
      }
      if (r.status === 0) {
        // Network or CORS problem: store the key anyway so the presenter can retry; say so clearly.
        setKey(raw);
        msg.className = "field-error";
        msg.textContent = `Could not reach api.anthropic.com to check the key (${r.error?.message}). The key is stored for this tab; run Diagnostics to investigate.`;
        forgetBtn.hidden = false;
        return;
      }
      msg.className = "field-error";
      msg.textContent = r.status === 401
        ? "Anthropic rejected this key (401). Check that it is active and copied completely."
        : `Anthropic answered ${r.status}: ${r.error?.message || r.error?.type}.`;
    }

    saveBtn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    forgetBtn.addEventListener("click", () => {
      forgetKey();
      input.value = "";
      forgetBtn.hidden = true;
      if (current) current.remove();
      msg.className = "field-ok";
      msg.textContent = "Key removed from this tab.";
    });

    modal = openModal({
      title: "Your Anthropic API key",
      intro: "Live mode runs on your own key. Billing goes to your Anthropic account.",
      size: "narrow",
      body: [
        h("div", { class: "key-advice" }, icon("alert", 22), h("div", {},
          h("p", {}, h("strong", {}, "Use a dedicated key with a low monthly spend limit"), " (for example €10)."),
          h("p", {}, "Create one at ", h("a", { href: ANTHROPIC.consoleKeysUrl, target: "_blank", rel: "noopener noreferrer" }, "platform.claude.com"),
            " and set its limit under ", h("a", { href: ANTHROPIC.consoleLimitsUrl, target: "_blank", rel: "noopener noreferrer" }, "Limits"), "."))),
        current,
        h("div", { class: "field" },
          h("label", { for: "api-key-input" }, "API key"),
          h("div", { class: "input-row" }, input, showBtn),
          h("span", { class: "help", id: "api-key-help" }, "Masked while you type. Checked with a free call that uses no tokens."),
          msg),
        h("ul", { class: "key-facts" },
          h("li", {}, icon("check", 16), "Kept in this tab's session storage only; gone when you close the tab."),
          h("li", {}, icon("check", 16), "Sent only to api.anthropic.com, never to any other host."),
          h("li", {}, icon("check", 16), "Never written to the console, logs or the audit export."))
      ],
      footer: [forgetBtn, saveBtn],
      onClose: () => resolve(accepted)
    });
  });
}

/** Ask for a free-text what-if scenario (Live only). Resolves the text or null. */
export function askCustomScenario(initial = "") {
  return new Promise((resolve) => {
    let modal;
    const area = h("textarea", { class: "textarea", id: "custom-scenario", maxlength: "800", autofocus: true,
      placeholder: "Example: A cyberattack has stopped the IT systems of a major Hungarian logistics provider for three days." }, initial);
    const err = h("div", { class: "field-error", role: "status" });
    const ok = h("button", { class: "btn btn-primary", type: "button" }, icon("check", 18), "Use this scenario");
    ok.addEventListener("click", () => {
      const text = area.value.trim();
      if (text.length < 20) { err.textContent = "Describe the event in at least one sentence (20 characters or more)."; area.focus(); return; }
      modal.close(text);
    });
    modal = openModal({
      title: "Custom what-if",
      intro: "Describe any disruption in plain language. The live agent treats it as an unverified trigger: it checks live sources, maps it onto the network and quantifies it like any other scenario.",
      size: "narrow",
      body: [h("div", { class: "field" }, h("label", { for: "custom-scenario" }, "What happened?"), area, err)],
      footer: [ok],
      onClose: (r) => resolve(typeof r === "string" ? r : null)
    });
  });
}

/** Full-screen management summary with copy and download. */
export function showReport(markdown, { mode } = {}) {
  const status = h("span", { class: "left", role: "status" }, mode === "simulation" ? "Simulated run: figures are engine-calculated, events are scripted." : "");
  const copyBtn = h("button", { class: "btn", type: "button" }, icon("copy", 18), "Copy text");
  copyBtn.addEventListener("click", async () => {
    status.textContent = (await copyText(markdown)) ? "Copied to the clipboard." : "Copy failed; use Download instead.";
  });
  const dlBtn = h("button", { class: "btn btn-primary", type: "button" }, icon("download", 18), "Download .md");
  dlBtn.addEventListener("click", () => {
    const prefix = mode === "simulation" ? "SIMULATION-" : "";
    downloadText(`${prefix}navigator-management-summary.md`, mode === "simulation" ? `> SIMULATION — scripted replay, not a live analysis.\n\n${markdown}` : markdown, "text/markdown");
  });
  return openModal({
    title: "Management summary",
    className: "report-modal",
    size: "wide",
    body: [renderMarkdown(markdown)],
    footer: [status, copyBtn, dlBtn]
  });
}


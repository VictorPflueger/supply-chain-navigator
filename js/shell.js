// The presenter's shell: the talk track under the header (steps by click, the arrow keys, 1 to 5,
// Home, Space and ?step=), the key figures top right, the mode tag, the Start agent dialog with its
// session key, the case menu, the decision clock, and the bar under the story that asks
// for every interaction in words. It knows nothing about supply chains, so Rebate Hunter and
// Timetable Translator can take it with their own steps, figures and cases.
//
// The page's markup holds the fixed words; this module wires it. It expects #steps (li[data-step]
// with a .vc-step__button), tiles marked data-vc-kpi, #start, #restart, #move with #move-text and
// #move-actions, #announce, #mode-tag, #scenario-button and #scenario-menu, and the #start-dialog
// with #start-sim and #key-form.

import { getKey, setKey, forgetKey, looksLikeKey, checkKey, maskKey } from "./claude.js";
import { clock } from "./format.js";

const $ = (id) => document.getElementById(id);

/**
 * options: { steps: [{ id, label }], onStep(id, how), onStart(mode), onRestart(), onCase(slug),
 *            onForward(), onSpace() }. Without onForward the right arrow shows the next step.
 */
export function createShell(o) {
  const ids = o.steps.map((s) => s.id);
  const items = new Map([...document.querySelectorAll("#steps [data-step]")].map((li) => [li.dataset.step, li]));
  let current = ids[0];
  let reached = ids[ids.length - 1];

  // ---- steps -------------------------------------------------------------------------------------
  for (const [id, li] of items) li.querySelector("button").addEventListener("click", () => go(id, "click"));

  /** Shows a step: stepper state, the address, and the caller's view. */
  function go(id, how = "code") {
    if (!ids.includes(id) || ids.indexOf(id) > ids.indexOf(reached)) return false;
    current = id;
    const at = ids.indexOf(id);
    for (const [sid, li] of items) {
      const k = ids.indexOf(sid);
      li.classList.toggle("vc-step--done", k < at);
      li.classList.toggle("vc-step--current", k === at);
      const b = li.querySelector("button");
      if (k === at) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.disabled = k > ids.indexOf(reached);
    }
    setParam("step", id === ids[0] ? null : id);
    o.onStep(id, how);
    return true;
  }

  /** In a live run the agent decides how far the steps go; a replay opens them all. */
  function setReached(id) {
    reached = id;
    for (const [sid, li] of items) li.querySelector("button").disabled = ids.indexOf(sid) > ids.indexOf(reached);
  }

  const step = (delta) => go(ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(current) + delta))], "key");

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable], dialog[open], .vc-menu")) return;
    if (document.querySelector("dialog[open]")) return;
    const n = Number(e.key);
    if (e.key === " " && o.onSpace && !e.target.closest?.("button, a")) o.onSpace();
    else if (e.key === "ArrowRight") (o.onForward ? o.onForward() : step(1));
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Home") go(ids[0], "key");
    else if (Number.isInteger(n) && n >= 1 && n <= ids.length) go(ids[n - 1], "key");
    else return;
    e.preventDefault();
  });

  $("restart")?.addEventListener("click", () => o.onRestart());

  // ---- the request for interaction ------------------------------------------------------------
  let shownMove = "";
  /**
   * Fills the bar under the story: what happens or what to do next, in words, and the
   * actions for it. tone: "move" or "decide" (the visitor's turn), "working" (the agent's) or "done".
   * actions: [{ id, label, icon, kind: "primary" | "secondary" | "ghost" | "danger", attention, onClick }];
   * attention marks the one action the page is waiting for.
   */
  function setMove({ tone = "move", lead = "", text = "", actions = [] } = {}) {
    const key = JSON.stringify([tone, lead, text, actions.map((a) => [a.id, a.label, a.kind, !!a.attention])]);
    if (key === shownMove) return;
    shownMove = key;
    const box = $("move");
    const hadFocus = box.contains(document.activeElement);
    box.dataset.tone = tone;
    const p = $("move-text");
    p.replaceChildren();
    if (lead) {
      const b = document.createElement("strong");
      b.textContent = lead;
      p.append(b, " ");
    }
    p.append(text);
    $("move-actions").replaceChildren(...actions.map((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `vc-button${a.kind && a.kind !== "primary" ? ` vc-button--${a.kind}` : ""}`;
      if (a.id) b.id = a.id;
      if (a.attention) b.dataset.attention = "";
      if (a.icon) {
        const i = document.createElement("span");
        i.className = `vc-icon vc-icon--${a.icon}`;
        i.setAttribute("aria-hidden", "true");
        b.append(i);
      }
      b.append(a.label);
      b.addEventListener("click", a.onClick);
      return b;
    }));
    // Restart the bar's entrance, so a new request is seen arriving.
    box.classList.remove("move--new");
    void box.offsetWidth;
    box.classList.add("move--new");
    if (hadFocus) (box.querySelector("[data-attention]") || box.querySelector("button"))?.focus({ preventScroll: true });
    if (tone !== "working") announce(p.textContent);
  }

  // ---- the case menu ------------------------------------------------------------------------------
  const menuButton = $("scenario-button");
  const menu = $("scenario-menu");
  const closeMenu = () => { menu.hidden = true; menuButton.setAttribute("aria-expanded", "false"); };
  const openMenu = () => {
    menu.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector("button"))?.focus();
  };
  menuButton.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener("keydown", (e) => {
    const all = [...menu.querySelectorAll("button")];
    const i = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown") all[(i + 1) % all.length].focus();
    else if (e.key === "ArrowUp") all[(i - 1 + all.length) % all.length].focus();
    else if (e.key === "Escape") { closeMenu(); menuButton.focus(); } else return;
    e.preventDefault();
  });
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !e.target.closest(".scenario")) closeMenu(); });

  /** Fills the case menu: [{ slug, title, hint }], the current one checked. */
  function setCases(list, slug) {
    menu.replaceChildren(...list.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "vc-menu__item";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(c.slug === slug));
      const t = document.createElement("span");
      t.textContent = c.title;
      const h = document.createElement("span");
      h.className = "menu-hint";
      h.textContent = c.hint;
      b.append(t, h);
      b.addEventListener("click", () => { closeMenu(); menuButton.focus(); o.onCase(c.slug); });
      return b;
    }));
    $("scenario-name").textContent = list.find((c) => c.slug === slug)?.short || "";
  }

  // ---- key figures ------------------------------------------------------------------------------
  /** Sets the tile marked data-vc-kpi="name": its value, note and tone. */
  function setKpi(name, { value, was, note, tone } = {}) {
    const tile = document.querySelector(`[data-vc-kpi="${name}"]`);
    if (!tile) return;
    if (value !== undefined) {
      // A decision that moves a figure keeps its old value in view, struck through (Vici's vc-stat__was).
      const el = tile.querySelector(".kpi-value");
      if (!was) el.textContent = value;
      else {
        const old = document.createElement("s");
        old.className = "vc-stat__was";
        old.textContent = was;
        el.replaceChildren(old, value);
      }
    }
    if (note !== undefined) tile.querySelector(".kpi-note").textContent = note;
    if (tone !== undefined) { if (tone) tile.dataset.tone = tone; else delete tile.dataset.tone; }
  }

  /** The decision clock: runs from start() to stop(); onTick gets the elapsed time as m:ss. */
  function createClock(onTick) {
    let t0 = null, t1 = null, timer = null;
    const tick = () => onTick(clock((t1 ?? performance.now()) - (t0 ?? performance.now())), t0 !== null && t1 === null);
    return {
      start() { if (t0 !== null) return; t0 = performance.now(); t1 = null; timer = setInterval(tick, 500); tick(); },
      stop() { if (t0 === null || t1 !== null) return; t1 = performance.now(); clearInterval(timer); tick(); },
      reset() { clearInterval(timer); t0 = t1 = null; tick(); },
      running: () => t0 !== null && t1 === null,
      elapsedMs: () => (t0 === null ? 0 : (t1 ?? performance.now()) - t0)
    };
  }

  // ---- mode, notices -------------------------------------------------------------------------------
  function setMode(mode) {
    $("mode-tag").dataset.mode = mode;
    $("mode-text").textContent = mode === "live" ? "LIVE" : "SIMULATION";
  }
  function announce(text) {
    const a = $("announce");
    a.textContent = "";
    setTimeout(() => { a.textContent = text; }, 30);
  }

  // ---- Start agent: the simulation, or a live run on the visitor's key ------------------------------
  const dialog = $("start-dialog");
  const keyInput = $("key-input");
  const keyError = $("key-error");
  const forget = $("key-forget");
  const showKeyState = () => {
    const key = getKey();
    forget.hidden = !key;
    keyInput.placeholder = key ? `${maskKey(key)} is in this tab` : "sk-ant-…";
  };
  $("start").addEventListener("click", () => {
    keyError.hidden = true;
    keyInput.value = "";
    showKeyState();
    dialog.showModal();
    $("start-sim").focus();
  });
  $("start-sim").addEventListener("click", () => { dialog.close(); o.onStart("simulation"); });
  forget.addEventListener("click", () => { forgetKey(); showKeyState(); keyInput.focus(); });
  $("key-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const typed = keyInput.value.trim();
    const key = typed || getKey();
    const fail = (text) => { keyError.textContent = text; keyError.hidden = false; keyInput.focus(); };
    if (!key) return fail("Paste your Anthropic API key first. It starts with sk-ant-.");
    if (!looksLikeKey(key)) return fail("That doesn't look like an Anthropic API key, which starts with sk-ant-.");
    const button = $("start-live");
    button.disabled = true;
    const checked = await checkKey(key);
    button.disabled = false;
    if (!checked.ok) return fail(checked.error);
    setKey(key);
    dialog.close();
    o.onStart("live");
  });

  return { go, setReached, current: () => current, setCases, setKpi, createClock, setMode, setMove, announce, openCases: openMenu };
}

/** Reads or writes one address parameter without reloading the page. */
export function getParam(name) {
  return new URL(location.href).searchParams.get(name);
}
export function setParam(name, value) {
  const u = new URL(location.href);
  if (value === null || value === undefined) u.searchParams.delete(name); else u.searchParams.set(name, value);
  history.replaceState(null, "", u);
}

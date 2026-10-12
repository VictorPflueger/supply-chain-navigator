// Tiny DOM helpers. All dynamic text goes through textContent — never innerHTML.

/**
 * Create an element.
 * attrs: class, text, title, dataset {}, style {}, on {event: fn}, aria-*, and any other attribute.
 * children: strings (as text nodes), nodes, arrays, null/false (skipped).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
    else if (k === "text") el.textContent = keepTogether(v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style") Object.assign(el.style, v);
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "svg") el.innerHTML = v; // only for static icon markup from icons.js
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(keepTogether(c)));
  }
}

/** A no-break space before "%" keeps "55 %" on one line wherever text is shown. */
function keepTogether(text) {
  return String(text).replace(/(\d) %/g, "$1\u00a0%");
}

export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

/** Escapes text for the rare places that need an HTML string (Leaflet tooltips). */
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Sets aria-disabled + a reason tooltip without using the `disabled` attribute (keeps tooltips working). */
export function setDisabled(el, disabled, reason = "") {
  if (!el) return;
  el.setAttribute("aria-disabled", disabled ? "true" : "false");
  if (disabled && reason) el.title = reason;
  else if (!disabled) el.removeAttribute("title");
}

export function isDisabled(el) {
  return el?.getAttribute("aria-disabled") === "true";
}

/** Trigger a browser download of a text payload. */
export function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/** Copy text to the clipboard; resolves to true on success. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

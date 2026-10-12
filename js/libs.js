// Loads Leaflet with fallbacks: unpkg, then jsDelivr, then the byte-identical local copy in vendor/.
// Every source is checked against the same Subresource Integrity hashes, so a tampered file never runs.

import { LIBS } from "./config.js";

const info = { ok: false, jsSource: null, cssSource: null, attempts: [] };

/** What loaded from where (shown by Diagnostics and logged at boot). */
export function leafletInfo() {
  return { ...info, attempts: info.attempts.map((a) => ({ ...a })) };
}

/** Resolves { ok, jsSource, cssSource, attempts } and never rejects. */
export async function loadLeaflet() {
  const cfg = LIBS.leaflet;
  let jsOk = Boolean(window.L);
  let cssOk = false;
  if (jsOk) info.jsSource = "preloaded";

  for (const src of cfg.sources) {
    if (jsOk && cssOk) break;
    const [js, css] = await Promise.all([
      jsOk ? null : loadScript(`${src.base}leaflet.js`, cfg.integrity.js, cfg.timeoutMs),
      cssOk ? null : loadStyle(`${src.base}leaflet.css`, cfg.integrity.css, cfg.timeoutMs)
    ]);
    info.attempts.push({ source: src.label, js, css });
    if (js && js.ok) { jsOk = true; info.jsSource = src.label; }
    if (css && css.ok) { cssOk = true; info.cssSource = src.label; }
  }

  info.ok = jsOk && Boolean(window.L);
  return leafletInfo();
}

function loadScript(url, integrity, timeoutMs) {
  return new Promise((resolve) => {
    const el = document.createElement("script");
    let settled = false;
    const done = (ok, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, reason });
    };
    const timer = setTimeout(() => done(false, "timed out"), timeoutMs);
    el.onload = () => done(Boolean(window.L), window.L ? "" : "loaded, but Leaflet did not initialise");
    el.onerror = () => { el.remove(); done(false, "blocked, unreachable or failed the integrity check"); };
    el.src = url;
    el.integrity = integrity;
    el.crossOrigin = "anonymous";
    el.referrerPolicy = "no-referrer";
    document.head.appendChild(el);
  });
}

function loadStyle(url, integrity, timeoutMs) {
  return new Promise((resolve) => {
    const el = document.createElement("link");
    let settled = false;
    const done = (ok, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!ok) el.remove();
      resolve({ ok, reason });
    };
    const timer = setTimeout(() => done(false, "timed out"), timeoutMs);
    el.onload = () => done(true, "");
    el.onerror = () => done(false, "blocked, unreachable or failed the integrity check");
    el.rel = "stylesheet";
    el.href = url;
    el.integrity = integrity;
    el.crossOrigin = "anonymous";
    el.referrerPolicy = "no-referrer";
    el.dataset.lib = "leaflet";
    // Leaflet's defaults go first, so Navigator's own map styles override them.
    const firstOwn = document.querySelector('link[rel="stylesheet"]:not([data-lib])');
    document.head.insertBefore(el, firstOwn);
  });
}

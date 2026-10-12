// Endpoint self-tests run from the presenter's browser, plus a memory of failures so the agent's
// geo_* tools can skip a blocked endpoint and fall back to web search immediately.

import { OPEN_DATA, BASEMAP, STORAGE, LIBS } from "./config.js";
import { leafletInfo } from "./libs.js";
import { checkKey, probeEndpoint, networkMessage } from "./anthropic.js";
import { getKey } from "./keystore.js";
import { checkWorld } from "./world_check.js";

export const TESTS = [
  { id: "anthropic", label: "Anthropic API", host: "api.anthropic.com", purpose: "Live agent (Claude) and web search" },
  { id: "openMeteo", label: OPEN_DATA.openMeteo.label, host: "api.open-meteo.com", purpose: "Weather at suppliers and corridor nodes" },
  { id: "usgs", label: OPEN_DATA.usgs.label, host: "earthquake.usgs.gov", purpose: "Earthquakes near supplier clusters" },
  { id: "eonet", label: OPEN_DATA.eonet.label, host: "eonet.gsfc.nasa.gov", purpose: "Storms, floods, wildfires, volcanoes" },
  { id: "pegel", label: OPEN_DATA.pegel.label, host: "www.pegelonline.wsv.de", purpose: "Rhine water level at Kaub" },
  { id: "tiles", label: "Map tiles (OpenStreetMap)", host: "tile.openstreetmap.org", purpose: "Basemap (offline coastline fallback exists)" },
  { id: "leaflet", label: "Map library (Leaflet)", host: "unpkg.com, cdn.jsdelivr.net or vendor/", purpose: "Map rendering; loaded once at start-up" },
  { id: "world", label: "World data integrity", host: "local", purpose: "Synthetic world, scenarios, reference cases, simulation scripts" }
];

// ---- failure memory (sessionStorage) -----------------------------------------------------------

function readMemory() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE.diagnostics) || "{}"); } catch { return {}; }
}
function writeMemory(m) {
  try { sessionStorage.setItem(STORAGE.diagnostics, JSON.stringify(m)); } catch { /* ignore */ }
}

/** Remember an endpoint result (status: "pass" | "fail" | "warn"). */
export function remember(id, status, detail = "") {
  const m = readMemory();
  m[id] = { status, detail, at: new Date().toISOString() };
  writeMemory(m);
}

/** True if Diagnostics (or a tool) recorded this endpoint as failing in this session. */
export function isKnownFailed(id) {
  return readMemory()[id]?.status === "fail";
}

export function memory() {
  return readMemory();
}

// ---- individual probes --------------------------------------------------------------------------

async function fetchJson(url, validate, describe, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", credentials: "omit" });
    const ms = Math.round(performance.now() - started);
    if (!res.ok) return { status: "fail", ms, detail: `HTTP ${res.status}` };
    const json = await res.json();
    if (!validate(json)) return { status: "warn", ms, detail: "Reachable, but the response format was unexpected." };
    return { status: "pass", ms, detail: describe(json) };
  } catch (e) {
    return { status: "fail", ms: null, detail: networkMessage(e) };
  } finally {
    clearTimeout(timer);
  }
}

function imageProbe(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const img = new Image();
    const started = performance.now();
    const timer = setTimeout(() => { img.src = ""; resolve({ status: "fail", ms: null, detail: "Timed out." }); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve({ status: "pass", ms: Math.round(performance.now() - started), detail: "Tile loaded." }); };
    img.onerror = () => { clearTimeout(timer); resolve({ status: "fail", ms: null, detail: "Tile request blocked or unreachable; the offline coastline map will be shown." }); };
    img.src = `${url}?nav=${Date.now()}`;
  });
}

const RUNNERS = {
  async anthropic() {
    const key = getKey();
    if (!key) {
      const r = await probeEndpoint();
      return { status: r.ok ? "pass" : "fail", ms: r.ms, detail: r.ok ? `${r.detail} Add your key in Live mode to check it.` : r.detail };
    }
    const r = await checkKey(key);
    if (!r.ok) {
      const msg = r.status === 401 ? "Key rejected (401). Check that it is active and copied completely." : `${r.error?.type || "error"}: ${r.error?.message || ""}`;
      return { status: "fail", ms: r.ms, detail: msg };
    }
    const missing = r.missing.length ? ` Missing for this key: ${r.missing.join(", ")}.` : " All three Navigator models are available.";
    return { status: r.missing.length ? "warn" : "pass", ms: r.ms, detail: `Key valid (free check, no tokens used).${missing}` };
  },
  openMeteo: () => fetchJson(OPEN_DATA.openMeteo.probe, (j) => !!j?.daily, (j) => `Forecast received (${j.daily?.time?.[0] || "today"}).`),
  usgs: () => fetchJson(OPEN_DATA.usgs.probe, (j) => j?.type === "FeatureCollection", (j) => `Feed received: ${j.features?.length ?? 0} significant earthquakes in the last day.`),
  eonet: () => fetchJson(OPEN_DATA.eonet.probe, (j) => Array.isArray(j?.events), (j) => `Feed received${j.events?.[0] ? `; latest: ${j.events[0].title}` : ""}.`),
  pegel: () => fetchJson(OPEN_DATA.pegel.probe, (j) => typeof j?.value === "number", (j) => `Kaub reads ${j.value} cm (${new Date(j.timestamp).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}).`),
  tiles: () => imageProbe(BASEMAP.osm.probeTile),
  async leaflet() {
    const info = leafletInfo();
    if (!info.ok) return { status: "fail", ms: null, detail: "Not loaded from any source. The map is replaced by a notice; everything else works." };
    const tried = info.attempts.filter((a) => a.js && !a.js.ok).map((a) => a.source);
    const fallback = info.jsSource !== "unpkg" && info.jsSource !== "preloaded";
    const css = info.cssSource ? "" : " Its stylesheet is missing, so the map may look broken.";
    return {
      status: fallback || !info.cssSource ? "warn" : "pass", ms: null,
      detail: `Leaflet ${LIBS.leaflet.version} from ${info.jsSource}${tried.length ? ` (${tried.join(", ")} unreachable)` : ""}, integrity verified.${css}`
    };
  },
  async world() {
    const started = performance.now();
    const res = checkWorld(globalThis.WORLD, globalThis.SCENARIOS || [], globalThis.REFERENCE_CASES || {}, globalThis.SIM_RUNS || {});
    const passed = res.checks.filter((c) => c.ok).length;
    return { status: res.ok ? "pass" : "fail", ms: Math.round(performance.now() - started), detail: `${passed}/${res.checks.length} integrity checks passed.`, checks: res.checks };
  }
};

/** Run one test; result is remembered for tool fallbacks. */
export async function runTest(id) {
  const fn = RUNNERS[id];
  if (!fn) return { status: "skip", detail: "Unknown test." };
  const r = await fn();
  if (id !== "world" && id !== "leaflet") remember(id, r.status, r.detail);
  return r;
}

/** Run all tests in parallel, reporting each result as it arrives. */
export async function runAll(onResult) {
  const results = {};
  await Promise.all(TESTS.map(async (t) => {
    onResult?.(t.id, { status: "running" });
    const r = await runTest(t.id);
    results[t.id] = r;
    onResult?.(t.id, r);
  }));
  return results;
}

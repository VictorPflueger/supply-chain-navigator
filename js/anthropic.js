// Anthropic API access from the browser. M2 provides key checks and diagnostics probes;
// the streaming Messages client for the agent loop is added in M3.
// Security: the key is only ever attached to requests to api.anthropic.com and never logged.

import { ANTHROPIC, MODELS } from "./config.js";

function headers(key) {
  const h = {
    "anthropic-version": ANTHROPIC.apiVersion,
    "content-type": "application/json",
    [ANTHROPIC.browserHeader]: "true"
  };
  if (key) h["x-api-key"] = key;
  return h;
}

async function timedFetch(url, init = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: init.signal || ctrl.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    return { res, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(t);
  }
}

async function readError(res) {
  try {
    const j = await res.json();
    return { type: j?.error?.type || `http_${res.status}`, message: j?.error?.message || res.statusText, requestId: j?.request_id || res.headers.get("request-id") || null };
  } catch {
    return { type: `http_${res.status}`, message: res.statusText || "Request failed", requestId: res.headers.get("request-id") || null };
  }
}

/**
 * Free key check: GET /v1/models. Returns { ok, status, ms, models, missing, webSearchByModel, error }.
 */
export async function checkKey(key) {
  try {
    const { res, ms } = await timedFetch(ANTHROPIC.modelsUrl, { method: "GET", headers: headers(key) });
    if (!res.ok) {
      const err = await readError(res);
      return { ok: false, status: res.status, ms, error: err };
    }
    const json = await res.json();
    const ids = new Set((json.data || []).map((m) => m.id));
    const webSearchByModel = {};
    for (const m of json.data || []) webSearchByModel[m.id] = m?.capabilities?.server_tools?.web_search?.supported ?? null;
    const missing = MODELS.map((m) => m.id).filter((id) => !ids.has(id));
    return { ok: true, status: res.status, ms, models: [...ids], missing, webSearchByModel };
  } catch (e) {
    return { ok: false, status: 0, ms: null, error: { type: "network", message: networkMessage(e) } };
  }
}

/**
 * Reachability probe without a key: the API should answer 401 with a JSON error that the browser
 * may read (CORS enabled by the direct-browser-access header).
 */
export async function probeEndpoint() {
  try {
    const { res, ms } = await timedFetch(ANTHROPIC.messagesUrl, {
      method: "POST",
      headers: headers(null),
      body: JSON.stringify({ model: MODELS[1].id, max_tokens: 1, messages: [{ role: "user", content: "ping" }] })
    }, 10000);
    const err = await readError(res);
    return { ok: res.status === 401 || res.ok, status: res.status, ms, detail: res.status === 401 ? "Reachable; CORS accepted (no key sent)." : `${res.status} ${err.message}` };
  } catch (e) {
    return { ok: false, status: 0, ms: null, detail: networkMessage(e) };
  }
}

/**
 * Optional paid probe (≈ €0.0001): is the server-side web search tool enabled for this key's
 * organisation? Uses Haiku with thinking disabled and a one-word reply.
 * Returns { available, detail, usage }.
 */
export async function probeWebSearch(key) {
  const body = {
    model: "claude-haiku-5-5",
    max_tokens: 16,
    thinking: { type: "disabled" },
    tools: [{ ...ANTHROPIC.webSearchTool, max_uses: 1 }],
    messages: [{ role: "user", content: "Reply with the single word OK. Do not use any tool." }]
  };
  try {
    const { res, ms } = await timedFetch(ANTHROPIC.messagesUrl, { method: "POST", headers: headers(key), body: JSON.stringify(body) }, 20000);
    if (res.ok) {
      const j = await res.json();
      return { available: true, ms, detail: "Web search tool accepted for this key.", usage: j.usage || null };
    }
    const err = await readError(res);
    const disabled = res.status === 400 && /web.?search/i.test(err.message || "");
    return { available: disabled ? false : null, ms, detail: disabled ? `Web search is disabled for this organisation: ${err.message}` : `${res.status} ${err.type}: ${err.message}`, usage: null };
  } catch (e) {
    return { available: null, ms: null, detail: networkMessage(e), usage: null };
  }
}

export function networkMessage(e) {
  if (e?.name === "AbortError") return "Timed out.";
  return "Blocked or unreachable from this browser (network, firewall or CORS).";
}

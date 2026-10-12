// Anthropic API access from the browser: key check, diagnostics probes and the streaming Messages
// client used by the agent loop (TECH_NOTES §3).
// Security: the key is only ever attached to requests to api.anthropic.com and never logged.

import { ANTHROPIC, MODELS } from "./config.js";
import { readSse } from "./sse.js";

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
    return {
      type: j?.error?.type || `http_${res.status}`,
      message: j?.error?.message || res.statusText,
      details: j?.error?.details || null,
      requestId: j?.request_id || res.headers.get("request-id") || null
    };
  } catch {
    return { type: `http_${res.status}`, message: res.statusText || "Request failed", details: null, requestId: res.headers.get("request-id") || null };
  }
}

/** An API error with everything the agent needs to decide on retry, fallback or stop. */
export class ApiError extends Error {
  constructor({ status = 0, type = "api_error", message = "Request failed", requestId = null, retryAfter = null, details = null, midStream = false }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.type = type;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
    this.details = details;
    this.midStream = midStream;
  }

  /** Spend-limit 429s carry no retry-after and must not be retried. */
  get spendLimit() {
    return this.details?.error_code === "enforced_spend_limit_reached" || /spend limit|credit balance/i.test(this.message || "");
  }

  get retryable() {
    if (this.spendLimit) return false;
    if (this.status === 429) return true;
    if ([500, 502, 503, 504, 529].includes(this.status)) return true;
    return ["overloaded_error", "api_error", "timeout_error", "rate_limit_error"].includes(this.type);
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
    const disabled = isWebSearchDisabled({ status: res.status, message: err.message });
    return { available: disabled ? false : null, ms, detail: disabled ? `Web search is disabled for this organisation: ${err.message}` : `${res.status} ${err.type}: ${err.message}`, usage: null };
  } catch (e) {
    return { available: null, ms: null, detail: networkMessage(e), usage: null };
  }
}

/** True for the 400 an organisation returns when an admin has switched web search off. */
export function isWebSearchDisabled(err) {
  return err?.status === 400 && /web.?search/i.test(err?.message || "");
}

export function networkMessage(e) {
  if (e?.name === "AbortError") return "Timed out.";
  return "Blocked or unreachable from this browser (network, firewall or CORS).";
}

// ---- streaming Messages client ---------------------------------------------------------------

/**
 * Streams one POST /v1/messages call and rebuilds the assistant message from the SSE events.
 * Content blocks are reconstructed exactly as the API sent them, so they can be passed back
 * unchanged (thinking signatures included).
 *
 * hooks: onBlockStart(index, block), onText(index, textSoFar), onThinking(index, textSoFar),
 *        onBlockStop(index, block)
 * Resolves { message: {id, model, role, content, stop_reason, stop_sequence, usage}, requestId,
 *            incomplete: Set<index> } — `incomplete` lists tool_use blocks cut off mid-input.
 */
export async function streamMessage({ key, body, signal, hooks = {}, idleMs = 90000 }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) throw abortError();
    signal.addEventListener("abort", onAbort, { once: true });
  }
  let idleTimedOut = false;
  // The idle limit also covers the wait for the response headers, not only gaps in the stream.
  const headerTimer = setTimeout(() => { idleTimedOut = true; ctrl.abort(); }, idleMs);
  try {
    let res;
    try {
      res = await fetch(ANTHROPIC.messagesUrl, {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify({ ...body, stream: true }),
        signal: ctrl.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });
    } catch (e) {
      if (signal?.aborted) throw abortError();
      if (idleTimedOut) throw new ApiError({ status: 0, type: "timeout_error", message: `No response from the API within ${Math.round(idleMs / 1000)} s.` });
      throw new ApiError({ status: 0, type: "network_error", message: networkMessage(e) });
    } finally {
      clearTimeout(headerTimer);
    }
    const requestId = res.headers.get("request-id");
    if (!res.ok) {
      const err = await readError(res);
      throw new ApiError({
        status: res.status, type: err.type, message: err.message, details: err.details,
        requestId: err.requestId || requestId, retryAfter: res.headers.get("retry-after")
      });
    }

    const message = { id: null, model: null, role: "assistant", content: [], stop_reason: null, stop_sequence: null, usage: {} };
    const partialJson = new Map();
    const incomplete = new Set();
    let startUsage = {};
    let deltaUsage = {};
    let streamError = null;

    const onRecord = ({ event, data }) => {
      if (streamError) return;
      let payload;
      try { payload = JSON.parse(data); } catch { return; }
      const type = payload.type || event;
      switch (type) {
        case "message_start": {
          const m = payload.message || {};
          message.id = m.id || null;
          message.model = m.model || null;
          startUsage = m.usage || {};
          break;
        }
        case "content_block_start": {
          const i = payload.index;
          const block = JSON.parse(JSON.stringify(payload.content_block || {}));
          if (block.type === "text" && typeof block.text !== "string") block.text = "";
          if (block.type === "thinking" && typeof block.thinking !== "string") block.thinking = "";
          if (block.type === "tool_use" || block.type === "server_tool_use") partialJson.set(i, "");
          message.content[i] = block;
          safeHook(hooks.onBlockStart, i, block);
          break;
        }
        case "content_block_delta": {
          const i = payload.index;
          const block = message.content[i];
          const d = payload.delta || {};
          if (!block) break;
          if (d.type === "text_delta") {
            block.text += d.text || "";
            safeHook(hooks.onText, i, block.text);
          } else if (d.type === "input_json_delta") {
            partialJson.set(i, (partialJson.get(i) || "") + (d.partial_json || ""));
          } else if (d.type === "thinking_delta") {
            block.thinking += d.thinking || "";
            safeHook(hooks.onThinking, i, block.thinking);
          } else if (d.type === "signature_delta") {
            block.signature = d.signature;
          } else if (d.type === "citations_delta" && d.citation) {
            (block.citations ||= []).push(d.citation);
          }
          break;
        }
        case "content_block_stop": {
          const i = payload.index;
          const block = message.content[i];
          if (!block) break;
          if (partialJson.has(i)) {
            const raw = partialJson.get(i);
            partialJson.delete(i);
            if (raw && raw.trim()) {
              try { block.input = JSON.parse(raw); } catch { block.input = {}; incomplete.add(i); }
            } else if (!block.input || typeof block.input !== "object") {
              block.input = {};
            }
          }
          if (block.type === "text" && Array.isArray(block.citations) && block.citations.length === 0) delete block.citations;
          safeHook(hooks.onBlockStop, i, block);
          break;
        }
        case "message_delta": {
          if (payload.delta) {
            if (payload.delta.stop_reason !== undefined) message.stop_reason = payload.delta.stop_reason;
            if (payload.delta.stop_sequence !== undefined) message.stop_sequence = payload.delta.stop_sequence;
          }
          if (payload.usage) deltaUsage = payload.usage;
          break;
        }
        case "error": {
          const e = payload.error || {};
          streamError = new ApiError({ status: 0, type: e.type || "api_error", message: e.message || "Stream error", requestId, midStream: true });
          ctrl.abort();
          break;
        }
        default:
          break; // message_stop, ping and unknown event types
      }
    };

    try {
      await readSse(res.body, onRecord, { idleMs, onIdle: () => { idleTimedOut = true; ctrl.abort(); } });
    } catch (e) {
      if (streamError) throw streamError;
      if (signal?.aborted) throw abortError();
      if (idleTimedOut) throw new ApiError({ status: 0, type: "timeout_error", message: `No data from the API for ${Math.round(idleMs / 1000)} s.`, requestId, midStream: true });
      throw new ApiError({ status: 0, type: "network_error", message: "The connection to the API was interrupted.", requestId, midStream: true });
    }
    if (streamError) throw streamError;
    if (signal?.aborted) throw abortError();
    if (message.stop_reason === null) {
      // The body ended without a stop reason: a cut connection or a proxy that is not passing the
      // event stream through. Treat it like an interrupted connection (retryable).
      throw new ApiError({ status: 0, type: "network_error", message: "The response ended before the message was complete.", requestId, midStream: true });
    }

    message.content = message.content.filter(Boolean);
    message.usage = mergeUsage(startUsage, deltaUsage);
    return { message, requestId, incomplete };
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/** message_delta.usage is cumulative; its fields win over message_start's. */
function mergeUsage(start = {}, delta = {}) {
  const out = { ...start };
  for (const [k, v] of Object.entries(delta || {})) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/** UI hooks must never break the stream. */
function safeHook(fn, ...args) {
  if (!fn) return;
  try { fn(...args); } catch (e) { console.error("[Navigator] stream hook failed:", e); }
}

function abortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

/**
 * Runs fn() with retries for transient API errors: honours retry-after on 429 (max 20 s) and
 * backs off 1.5 s, then 4 s, on 5xx/overloaded/network errors. Never retries spend-limit errors.
 */
export async function withRetry(fn, { retries = 2, signal, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (e) {
      const transient = e instanceof ApiError && (e.retryable || e.type === "network_error");
      if (!transient || attempt >= retries || signal?.aborted) throw e;
      const ra = Number(e.retryAfter);
      const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(20000, ra * 1000) : [1500, 4000, 8000][attempt] || 8000;
      onRetry?.({ attempt: attempt + 1, waitMs, error: e });
      await sleep(waitMs, signal);
      attempt += 1;
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

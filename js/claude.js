// Claude from the browser, on the visitor's own key: the key in this tab's session storage only, a
// free key check, and a streaming Messages client with retries. The key is attached to requests to
// api.anthropic.com and nowhere else, and the page's security policy allows no other host.
// Part of the shell: nothing here knows about supply chains.

const API = "https://api.anthropic.com/v1";
const STORE = "showcase.anthropic.key";
const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
let memoryKey = null;

// ---- the key ---------------------------------------------------------------------------------------

export function getKey() {
  try { return sessionStorage.getItem(STORE) || memoryKey; } catch { return memoryKey; }
}
export function setKey(raw) {
  const key = String(raw || "").trim();
  try { sessionStorage.setItem(STORE, key); memoryKey = null; } catch { memoryKey = key; }
  return key;
}
export function forgetKey() {
  try { sessionStorage.removeItem(STORE); } catch { /* storage blocked */ }
  memoryKey = null;
}
export const looksLikeKey = (raw) => KEY_PATTERN.test(String(raw || "").trim());
export const maskKey = (key = getKey()) => (key ? `${key.slice(0, 7)}…${key.slice(-4)}` : "");

function headers(key) {
  return {
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    "anthropic-dangerous-direct-browser-access": "true",
    ...(key ? { "x-api-key": key } : {})
  };
}
const FETCH = { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" };

/** An API error with what the caller needs to retry, explain or stop. */
export class ApiError extends Error {
  constructor({ status = 0, type = "api_error", message = "Request failed", requestId = null, retryAfter = null, details = null }) {
    super(message);
    Object.assign(this, { name: "ApiError", status, type, requestId, retryAfter, details });
  }
  get spendLimit() { return this.details?.error_code === "enforced_spend_limit_reached" || /spend limit|credit balance/i.test(this.message); }
  get retryable() {
    if (this.spendLimit) return false;
    return [429, 500, 502, 503, 504, 529].includes(this.status) || ["overloaded_error", "api_error", "timeout_error", "rate_limit_error", "network_error"].includes(this.type);
  }
}

async function readError(res) {
  try {
    const j = await res.json();
    return { type: j?.error?.type || `http_${res.status}`, message: j?.error?.message || res.statusText, details: j?.error?.details || null, requestId: j?.request_id || res.headers.get("request-id") };
  } catch {
    return { type: `http_${res.status}`, message: res.statusText || "Request failed", details: null, requestId: res.headers.get("request-id") };
  }
}

/** Free key check: GET /v1/models uses no tokens. Resolves { ok, error? }. */
export async function checkKey(key) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${API}/models?limit=100`, { headers: headers(key), signal: ctrl.signal, ...FETCH });
    if (res.ok) return { ok: true };
    const e = await readError(res);
    return { ok: false, error: res.status === 401 ? "Anthropic did not accept this key." : `${res.status}: ${e.message}` };
  } catch {
    return { ok: false, error: "api.anthropic.com could not be reached from this browser: a network, proxy or browser extension blocks it." };
  } finally {
    clearTimeout(t);
  }
}

// ---- streaming ----------------------------------------------------------------------------------------

/** Splits a fetch body into server-sent events; calls onEvent(type, data) for each. */
async function readEvents(body, onEvent, idleMs, onIdle) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "", timer = null;
  const arm = () => { clearTimeout(timer); timer = setTimeout(onIdle, idleMs); };
  const flush = (raw) => {
    let event = "message";
    const data = [];
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const c = line.indexOf(":");
      const field = c < 0 ? line : line.slice(0, c);
      const value = c < 0 ? "" : line.slice(c + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) onEvent(event, data.join("\n"));
  };
  arm();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      arm();
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n?/g, "\n");
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) { flush(buf.slice(0, cut)); buf = buf.slice(cut + 2); }
    }
    if (buf.trim()) flush(buf.trim());
  } finally {
    clearTimeout(timer);
  }
}

const abortError = () => Object.assign(new Error("Aborted"), { name: "AbortError" });

/**
 * One streaming POST /v1/messages. Rebuilds the assistant message block by block, exactly as sent,
 * so it can go back unchanged (thinking signatures included). hooks: onText(i, text),
 * onBlockStop(i, block). Resolves { message, requestId, incomplete }: incomplete lists tool calls
 * cut off mid-input.
 */
export async function streamMessage({ key, body, signal, hooks = {}, idleMs = 90000 }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) throw abortError();
  signal?.addEventListener("abort", onAbort, { once: true });
  let idle = false;
  const timeout = setTimeout(() => { idle = true; ctrl.abort(); }, idleMs);
  try {
    let res;
    try {
      res = await fetch(`${API}/messages`, { method: "POST", headers: headers(key), body: JSON.stringify({ ...body, stream: true }), signal: ctrl.signal, ...FETCH });
    } catch {
      if (signal?.aborted) throw abortError();
      throw new ApiError({ type: idle ? "timeout_error" : "network_error", message: idle ? "No answer from the API in time." : "api.anthropic.com could not be reached from this browser." });
    } finally {
      clearTimeout(timeout);
    }
    const requestId = res.headers.get("request-id");
    if (!res.ok) {
      const e = await readError(res);
      throw new ApiError({ status: res.status, ...e, requestId: e.requestId || requestId, retryAfter: res.headers.get("retry-after") });
    }
    const message = { id: null, model: null, role: "assistant", content: [], stop_reason: null, usage: {} };
    const json = new Map();
    const incomplete = new Set();
    let streamError = null;
    const hook = (fn, ...a) => { try { fn?.(...a); } catch (e) { console.error("[showcase] stream hook failed:", e); } };
    const onEvent = (event, data) => {
      let p;
      try { p = JSON.parse(data); } catch { return; }
      const i = p.index;
      const block = message.content[i];
      switch (p.type || event) {
        case "message_start":
          Object.assign(message, { id: p.message?.id, model: p.message?.model, usage: { ...(p.message?.usage || {}) } });
          break;
        case "content_block_start": {
          const b = JSON.parse(JSON.stringify(p.content_block || {}));
          if (b.type === "text") b.text ||= "";
          if (b.type === "thinking") b.thinking ||= "";
          if (b.type === "tool_use" || b.type === "server_tool_use") json.set(i, "");
          message.content[i] = b;
          break;
        }
        case "content_block_delta": {
          const d = p.delta || {};
          if (!block) break;
          if (d.type === "text_delta") { block.text += d.text || ""; hook(hooks.onText, i, block.text); }
          else if (d.type === "input_json_delta") json.set(i, (json.get(i) || "") + (d.partial_json || ""));
          else if (d.type === "thinking_delta") block.thinking += d.thinking || "";
          else if (d.type === "signature_delta") block.signature = d.signature;
          else if (d.type === "citations_delta" && d.citation) (block.citations ||= []).push(d.citation);
          break;
        }
        case "content_block_stop":
          if (!block) break;
          if (json.has(i)) {
            const raw = json.get(i);
            json.delete(i);
            try { block.input = raw.trim() ? JSON.parse(raw) : block.input || {}; } catch { block.input = {}; incomplete.add(i); }
          }
          if (Array.isArray(block.citations) && !block.citations.length) delete block.citations;
          hook(hooks.onBlockStop, i, block);
          break;
        case "message_delta":
          if (p.delta?.stop_reason !== undefined) message.stop_reason = p.delta.stop_reason;
          for (const [k, v] of Object.entries(p.usage || {})) if (v !== null && v !== undefined) message.usage[k] = v;
          break;
        case "error":
          streamError = new ApiError({ type: p.error?.type || "api_error", message: p.error?.message || "Stream error", requestId });
          ctrl.abort();
          break;
        default:
          break;
      }
    };
    try {
      await readEvents(res.body, onEvent, idleMs, () => { idle = true; ctrl.abort(); });
    } catch {
      if (streamError) throw streamError;
      if (signal?.aborted) throw abortError();
      throw new ApiError({ type: idle ? "timeout_error" : "network_error", message: idle ? "The API went quiet for too long." : "The connection to the API was interrupted.", requestId });
    }
    if (streamError) throw streamError;
    if (signal?.aborted) throw abortError();
    if (message.stop_reason === null) throw new ApiError({ type: "network_error", message: "The answer ended before it was complete.", requestId });
    message.content = message.content.filter(Boolean);
    return { message, requestId, incomplete };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Retries transient errors: retry-after on 429 (at most 20 s), else 1.5 s, then 4 s. */
export async function withRetry(fn, { retries = 2, signal, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ApiError) || !e.retryable || attempt >= retries || signal?.aborted) throw e;
      const ra = Number(e.retryAfter);
      const ms = Number.isFinite(ra) && ra > 0 ? Math.min(20000, ra * 1000) : [1500, 4000][attempt] || 4000;
      onRetry?.({ attempt: attempt + 1, ms, error: e });
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
      });
    }
  }
}

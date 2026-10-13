// Unit tests for the streaming client and the cost maths (Node.js 20 or later; no browser needed):
// SSE parsing and message reconstruction in js/anthropic.js with a mocked fetch, retries, aborts,
// truncated streams, and the price table in js/cost.js.
// Usage: node tests/unit.mjs
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const { streamMessage, ApiError, withRetry } = await mod("js/anthropic.js");
const { usageCostUsd, createCostTracker } = await mod("js/cost.js");

function sse(events, { crlf = false } = {}) {
  const nl = crlf ? "\r\n" : "\n";
  return events.map(([ev, data]) => `event: ${ev}${nl}data: ${JSON.stringify(data)}${nl}${nl}`).join("");
}
function chunked(text, sizes) {
  const enc = new TextEncoder().encode(text);
  const parts = [];
  let i = 0, k = 0;
  while (i < enc.length) { const n = sizes[k++ % sizes.length]; parts.push(enc.slice(i, i + n)); i += n; }
  return new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } });
}
const events = [
  ["message_start", { type: "message_start", message: { id: "msg_1", model: "claude-sonnet-5-5", role: "assistant", content: [], usage: { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0, output_tokens: 3 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Check exposure " } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "first." } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "SIG==abc" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["ping", { type: "ping" }],
  ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hypothesis: the plant is " } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "our supplier — Győr ✓" } }],
  ["content_block_stop", { type: "content_block_stop", index: 1 }],
  ["content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "erp_get_supplier", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"supplier_" } }],
  ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "id\": \"S-TNG-HAR\"}" } }],
  ["content_block_stop", { type: "content_block_stop", index: 2 }],
  ["content_block_start", { type: "content_block_start", index: 3, content_block: { type: "tool_use", id: "toolu_2", name: "erp_get_overview", input: {} } }],
  ["content_block_stop", { type: "content_block_stop", index: 3 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 240, server_tool_use: { web_search_requests: 0 } } }],
  ["message_stop", { type: "message_stop" }]
];
for (const [label, crlf, sizes] of [["lf small chunks", false, [7, 13, 1, 50]], ["crlf odd chunks", true, [3, 1, 2, 97, 5]], ["one chunk", false, [100000]]]) {
  globalThis.fetch = async () => new Response(chunked(sse(events, { crlf }), sizes), { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_123" } });
  const texts = [];
  const r = await streamMessage({ key: "k", body: { model: "claude-sonnet-5-5", messages: [] }, hooks: { onText: (i, t) => texts.push(t) } });
  const m = r.message;
  assert.equal(m.stop_reason, "tool_use", label);
  assert.equal(m.content.length, 4, label);
  assert.deepEqual(m.content[0], { type: "thinking", thinking: "Check exposure first.", signature: "SIG==abc" }, label);
  assert.equal(m.content[1].text, "Hypothesis: the plant is our supplier — Győr ✓", label);
  assert.deepEqual(m.content[2].input, { supplier_id: "S-TNG-HAR" }, label);
  assert.deepEqual(m.content[3].input, {}, label);
  assert.equal(m.usage.output_tokens, 240, label);
  assert.equal(m.usage.cache_creation_input_tokens, 3000, label);
  assert.equal(r.requestId, "req_123");
  assert.ok(texts.length >= 2);
  console.log("ok:", label);
}
// Mid-stream error
globalThis.fetch = async () => new Response(chunked(sse([events[0], ["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]]), [11]), { status: 200 });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "overloaded_error" && e.retryable && e.midStream);
console.log("ok: mid-stream error");
// HTTP error with retry-after
globalThis.fetch = async () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" }, request_id: "req_9" }), { status: 429, headers: { "retry-after": "1" } });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e.status === 429 && e.retryAfter === "1" && e.retryable);
console.log("ok: 429");
// spend limit not retryable
const spend = new ApiError({ status: 429, type: "rate_limit_error", message: "x", details: { error_code: "enforced_spend_limit_reached" } });
assert.equal(spend.retryable, false);
// withRetry: succeeds on third attempt
let n = 0;
const v = await withRetry(async () => { n++; if (n < 3) throw new ApiError({ status: 529, type: "overloaded_error", message: "o" }); return 42; }, { retries: 2 });
assert.equal(v, 42); assert.equal(n, 3);
console.log("ok: withRetry");
// Incomplete tool input (max_tokens)
const cut = [events[0], ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_x", name: "ui_draft_action", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"subject\": \"Urg" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 16000 } }]];
globalThis.fetch = async () => new Response(chunked(sse(cut), [64]), { status: 200 });
const rc = await streamMessage({ key: "k", body: {} });
assert.equal(rc.message.stop_reason, "max_tokens"); assert.ok(rc.incomplete.has(0));
console.log("ok: incomplete tool input flagged");
// Abort
const ac = new AbortController();
globalThis.fetch = async (url, init) => new Promise((res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
setTimeout(() => ac.abort(), 20);
await assert.rejects(() => streamMessage({ key: "k", body: {}, signal: ac.signal }), (e) => e.name === "AbortError");
console.log("ok: abort");
// Cost maths
const usd = usageCostUsd("claude-sonnet-5-5", { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 10000, output_tokens: 240, server_tool_use: { web_search_requests: 2 } });
const expected = 1200 * 2 / 1e6 + 3000 * 2.5 / 1e6 + 10000 * 0.1 / 1e6 + 240 * 10 / 1e6 + 2 * 0.01;
assert.ok(Math.abs(usd - expected) < 1e-12, `${usd} vs ${expected}`);
const haikuLong = usageCostUsd("claude-haiku-5-5", { input_tokens: 90000, cache_read_input_tokens: 20000, output_tokens: 1000 });
assert.ok(Math.abs(haikuLong - (90000 * 0.5 / 1e6 + 20000 * 0.05 / 1e6 + 1000 * 2.5 / 1e6)) < 1e-12);
const t = createCostTracker("claude-opus-5-5"); t.add({ input_tokens: 1e6 }); const snap = t.add({ output_tokens: 1e6 });
assert.ok(Math.abs(snap.usd - 24) < 1e-9 && Math.abs(snap.eur - 24 * 0.894) < 1e-9 && snap.requests === 2);
console.log("ok: cost maths");
// A body that ends without a stop reason (cut connection, or a proxy that is not passing the
// event stream through) is an interrupted connection, not an empty answer.
globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "network_error" && e.midStream);
globalThis.fetch = async () => new Response(chunked(sse(events.slice(0, 6)), [40]), { status: 200 });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "network_error");
console.log("ok: truncated stream rejected");
console.log("\nAll unit tests passed.");

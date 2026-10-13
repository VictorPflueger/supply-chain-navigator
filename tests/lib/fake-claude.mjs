// A scripted stand-in for POST /v1/messages that streams realistic SSE and checks every request
// against the protocol rules the live agent must follow (TECH_NOTES §3).
import { isDeepStrictEqual } from "node:util";

export function sseFor({ id, model = "claude-sonnet-5-5", blocks, stop, usage = {}, cut = null }) {
  const ev = [];
  const push = (event, data) => ev.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  push("message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, usage: { input_tokens: usage.input_tokens ?? 1500, cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0, cache_read_input_tokens: usage.cache_read_input_tokens ?? 0, output_tokens: 1 } } });
  blocks.forEach((b, i) => {
    if (b.type === "text") {
      push("content_block_start", { type: "content_block_start", index: i, content_block: { type: "text", text: "" } });
      for (const piece of chunks(b.text, 17)) push("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "text_delta", text: piece } });
    } else if (b.type === "thinking") {
      push("content_block_start", { type: "content_block_start", index: i, content_block: { type: "thinking", thinking: "", signature: "" } });
      for (const piece of chunks(b.thinking, 23)) push("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "thinking_delta", thinking: piece } });
      push("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "signature_delta", signature: b.signature } });
    } else if (b.type === "tool_use" || b.type === "server_tool_use") {
      push("content_block_start", { type: "content_block_start", index: i, content_block: { type: b.type, id: b.id, name: b.name, input: {} } });
      const json = cut === i ? JSON.stringify(b.input).slice(0, 25) : JSON.stringify(b.input);
      for (const piece of chunks(json, 29)) push("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: piece } });
    } else if (b.type === "web_search_tool_result") {
      push("content_block_start", { type: "content_block_start", index: i, content_block: b });
    }
    push("content_block_stop", { type: "content_block_stop", index: i });
  });
  push("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: usage.output_tokens ?? 600, server_tool_use: { web_search_requests: usage.web_search_requests ?? 0 } } });
  push("message_stop", { type: "message_stop" });
  return ev.join("");
}

function chunks(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.length ? out : [""];
}

/** What the agent should have sent back for each earlier assistant turn. */
function stripForEcho(blocks) {
  return blocks.map((b) => {
    if (b.type === "web_search_tool_result") return b;
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "thinking") return { type: "thinking", thinking: b.thinking, signature: b.signature };
    return { type: b.type, id: b.id, name: b.name, input: b.input };
  });
}

/**
 * script: array of steps. Each step is either a response {blocks, stop, usage, expect?(req, ctx)}
 * or an error {error: {status, type, message, headers?}} that is returned once.
 */
export function createFakeClaude(script, { model = "claude-sonnet-5-5" } = {}) {
  const violations = [];
  const requests = [];
  const sent = [];        // assistant turns as sent, in order (only kept turns)
  let i = 0;

  function check(cond, msg) { if (!cond) violations.push(`request ${requests.length}: ${msg}`); }

  function validate(req, headers) {
    check(headers["x-api-key"] && headers["x-api-key"].startsWith("sk-ant-"), "x-api-key missing");
    check(headers["anthropic-version"] === "2023-06-01", "anthropic-version wrong");
    check(headers["anthropic-dangerous-direct-browser-access"] === "true", "direct browser access header missing");
    check(req.stream === true, "stream must be true");
    check(typeof req.max_tokens === "number" && req.max_tokens > 0, "max_tokens missing");
    check(req.tool_choice?.type === "auto", "tool_choice must be auto");
    check(Array.isArray(req.tools) && req.tools.length >= 18, "tools missing");
    check(typeof req.system === "string" && req.system.includes("Nordwerk"), "system prompt missing");
    // Every assistant turn must be echoed exactly; every tool_use must be answered next.
    const msgs = req.messages || [];
    let a = 0;
    msgs.forEach((m, k) => {
      if (m.role !== "assistant") return;
      const expected = sent[a];
      check(expected && isDeepStrictEqual(m.content, expected), `assistant turn ${a + 1} was not passed back unchanged`);
      a += 1;
      const uses = m.content.filter((b) => b.type === "tool_use");
      const next = msgs[k + 1];
      if (uses.length) {
        check(next && next.role === "user", "tool_use not followed by a user message");
        if (next) {
          const results = (Array.isArray(next.content) ? next.content : []).filter((b) => b.type === "tool_result");
          for (const u of uses) check(results.some((r) => r.tool_use_id === u.id), `tool_use ${u.id} has no tool_result`);
          check(Array.isArray(next.content) && next.content.every((b) => b.type === "tool_result"), "tool_result blocks must come first and alone");
        }
      }
    });
  }

  return {
    violations, requests, sent,
    remaining: () => script.length - i,
    handle(raw, headers) {
      const req = JSON.parse(raw);
      requests.push({ req, headers });
      validate(req, headers);
      const step = script[i++];
      if (!step) {
        violations.push(`unexpected request ${requests.length} (script exhausted)`);
        return { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "error", error: { type: "api_error", message: "script exhausted" } }) };
      }
      try { step.expect?.(req, { check }); } catch (e) { violations.push(`request ${requests.length}: expectation threw ${e.message}`); }
      if (step.error) {
        return { status: step.error.status, headers: { "content-type": "application/json", ...(step.error.headers || {}) }, body: JSON.stringify({ type: "error", error: { type: step.error.type, message: step.error.message } }) };
      }
      const id = `msg_${requests.length}`;
      const body = sseFor({ id, model, blocks: step.blocks, stop: step.stop, usage: step.usage, cut: step.cut ?? null });
      if (!step.discard) sent.push(stripForEcho(step.cut === undefined || step.cut === null ? step.blocks : step.blocks.filter((_, k) => k !== step.cut)));
      return { status: 200, headers: { "content-type": "text/event-stream", "request-id": `req_${requests.length}` }, body, delayMs: step.delayMs || 0 };
    }
  };
}

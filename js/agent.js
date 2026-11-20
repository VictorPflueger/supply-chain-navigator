// Live agent: the Claude tool-use loop, run entirely in the visitor's browser on their own key.
//
// One run = repeated streaming calls to POST /v1/messages. Every response is appended to the
// conversation unchanged (thinking blocks and signatures included). stop_reason drives the loop:
//   tool_use   → execute client tools (independent ERP lookups in parallel), send tool_result blocks
//   pause_turn → resend the conversation as is (a server tool loop paused)
//   max_tokens → retry once with more room if a tool call was cut off, otherwise continue
//   end_turn   → the run ends
// Everything on screen goes out through emit(), the same events the scripted run produces. A run
// stops at 40 model calls or €3, whichever comes first.

import { getModel } from "./world.js";
import { streamMessage, withRetry, ApiError, getKey } from "./claude.js";
import { toolDefinitions, createToolbox, UI_BLOCKING_TOOLS } from "./tools.js";
import { buildSystemPrompt, buildOpeningMessage } from "./prompt.js";
import { MODEL, createMeter } from "./cost.js";
import { eurCents } from "./format.js";

const ABORT = Symbol("abort");
const ORDER_FREE = (name) => name.startsWith("erp_");
const AGENT = { maxSteps: 40, budgetEur: 3, idleTimeoutMs: 90000, maxOutputTokens: 128000 };

/** hooks: { emit(type, payload), onKeyRejected() } */
export function createLiveAgent(hooks) {
  let current = null;
  const emitAs = (r) => (type, payload) => { if (!r.ended || type === "run_end" || type === "state_change") hooks.emit(type, payload); };

  async function run({ scenario }) {
    const model = getModel();
    const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const r = {
      model, modelDef: MODEL, today,
      ended: false, cancelled: false,
      ac: new AbortController(),
      waiters: new Set(), poke: null,
      decisions: [], drafts: new Map(),
      phase: null, step: 0,
      webSearch: true,
      compat: { effort: true, display: true, thinking: true, cache: true },
      maxTokens: MODEL.maxTokens,
      cost: createMeter()
    };
    current = r;
    const bus = { emit: emitAs(r) };
    r.bus = bus;

    const toolbox = createToolbox({
      model,
      // Nothing a tool emits after the run has ended (abort, reset) may reach the next run's UI.
      emit: (type, payload) => { if (!r.ended) bus.emit(type, payload); },
      waitUntil: (test) => waitUntil(r, test),
      takeOptionDecision: (pred) => takeDecision(r, pred),
      drafts: r.drafts,
      onPhase: (s) => setPhase(r, s)
    });

    bus.emit("cost_update", r.cost.get());
    setPhase(r, "scanning");

    let system = buildSystemPrompt({ model, today, webSearch: r.webSearch });
    const opening = buildOpeningMessage({ today, seed: scenario.seed, scenarioTitle: scenario.title });
    const messages = [{ role: "user", content: opening }];
    let sentUpTo = 0;
    let maxTokensRetried = false;
    let nudges = 0;

    try {
      for (;;) {
        if (r.cancelled) throw ABORT;
        if (r.step >= AGENT.maxSteps) {
          return finish(r, "error", `Step limit reached (${AGENT.maxSteps} model calls). The run stops here to protect time and cost.`);
        }
        r.step += 1;

        const call = await callModel(r, {
          getSystem: () => system,
          messages,
          onSystemChange: () => { system = buildSystemPrompt({ model, today, webSearch: r.webSearch }); }
        });
        const { message, incomplete } = call;
        const snap = r.cost.add(message.usage);
        bus.emit("cost_update", snap);
        sentUpTo = messages.length;

        if (snap.eur > AGENT.budgetEur) {
          messages.push({ role: "assistant", content: message.content });
          return finish(r, "aborted", `Cost cap reached: this run has used ${eurCents(snap.eur)}, above the ${eurCents(AGENT.budgetEur)} safety limit per run.`);
        }

        const stop = message.stop_reason;
        if (stop === "max_tokens" && incomplete.size && !maxTokensRetried) {
          // A tool call was cut off mid-input: discard this turn and retry once with more room.
          maxTokensRetried = true;
          r.maxTokens = Math.min(AGENT.maxOutputTokens, Math.round(r.maxTokens * 1.5));
          bus.emit("notice", { level: "info", text: "The response hit the output limit in the middle of a tool call; retrying it with more room." });
          continue;
        }

        const kept = cleanContent(message.content, incomplete);
        if (kept.length) messages.push({ role: "assistant", content: kept });

        if (stop === "pause_turn") continue;

        const uses = message.content.filter((b, i) => b.type === "tool_use" && !incomplete.has(i));
        if (stop === "tool_use" || (stop === "max_tokens" && uses.length)) {
          if (!uses.length) continue; // only a paused server tool: resend
          const results = await runTools(r, uses, toolbox);
          messages.push({ role: "user", content: results });
          continue;
        }
        if (stop === "max_tokens") {
          sentUpTo = Math.min(sentUpTo, pushUserText(messages, "Continue from where you stopped."));
          continue;
        }
        if (stop === "refusal") {
          return finish(r, "error", "The model declined to continue this request. Try another scenario or model.");
        }
        if (stop === "model_context_window_exceeded") {
          return finish(r, "error", "The conversation exceeded the model's context window.");
        }
        // end_turn (or anything else): the agent is done, unless it stopped before the workflow
        // was complete (for example to ask the presenter a question). Then it is asked, at most
        // twice and visibly, to carry on: nobody can answer its questions on screen.
        const st = toolbox.state();
        if (st.outcome === "no_material_disruption") return finish(r, "no_findings");
        if (!st.reported && nudges < 2) {
          nudges += 1;
          bus.emit("notice", { level: "info", text: "The agent paused before finishing the workflow. Navigator asked it to continue on its own." });
          sentUpTo = Math.min(sentUpTo, pushUserText(messages, continueInstruction(st)));
          continue;
        }
        if (!st.reported) {
          return finish(r, "incomplete", st.approvedOption
            ? "The agent ended without a management summary. The drafts stay on screen; nothing was sent."
            : "The agent ended its turn twice without completing the workflow. Start a new run or try another model.");
        }
        return finish(r, "done");
      }
    } catch (e) {
      if (e === ABORT || e?.name === "AbortError") {
        if (!r.ended) finish(r, "aborted", r.abortReason || "Stopped by the user.");
        return;
      }
      handleError(r, e);
    } finally {
      for (const w of r.waiters) w();
      r.waiters.clear();
      if (current === r) current = null;
    }
  }

  // ---- model calls ------------------------------------------------------------------------------

  async function callModel(r, { getSystem, messages, onSystemChange }) {
    const bus = r.bus;
    const stream = makeStreamHooks(r);
    let downgraded = 0;
    for (;;) {
      const body = requestBody(r, getSystem(), messages);
      try {
        const out = await withRetry(
          () => streamMessage({ key: getKey(), body, signal: r.ac.signal, hooks: stream.hooks, idleMs: AGENT.idleTimeoutMs }),
          {
            retries: 2,
            signal: r.ac.signal,
            onRetry: ({ attempt, ms, error }) => bus.emit("notice", {
              level: "warn",
              text: `The API reported ${describeTransient(error)}. Retrying in ${Math.round(ms / 1000)} s (attempt ${attempt} of 2).`
            })
          }
        );
        return { ...out, attemptBody: body };
      } catch (e) {
        if (r.cancelled) throw ABORT;
        if (!(e instanceof ApiError) || e.status !== 400 || downgraded >= 4) throw e;
        // Graceful degradation for optional request features (TECH_NOTES §2–3).
        if (/web.?search/i.test(e.message || "") && r.webSearch) {
          r.webSearch = false;
          onSystemChange();
          bus.emit("notice", { level: "warn", text: "Web search is switched off for this API key's organisation, so the agent cannot check the report and treats it as a what-if." });
        } else if (/output_config|effort/i.test(e.message) && r.compat.effort) {
          r.compat.effort = false;
        } else if (/display/i.test(e.message) && r.compat.display) {
          r.compat.display = false;
        } else if (/thinking/i.test(e.message) && r.compat.thinking) {
          r.compat.thinking = false;
        } else if (/cache_control/i.test(e.message) && r.compat.cache) {
          r.compat.cache = false;
        } else {
          throw e;
        }
        downgraded += 1;
      } finally {
        // Throttled narration of a finished, failed or cancelled attempt never surfaces later.
        stream.flush();
      }
    }
  }

  function requestBody(r, system, messages) {
    const body = {
      model: r.modelDef.id,
      max_tokens: r.maxTokens,
      system,
      tools: toolDefinitions({ webSearch: r.webSearch }),
      tool_choice: { type: "auto" },
      messages
    };
    if (r.compat.cache) body.cache_control = { type: "ephemeral" };
    if (r.compat.thinking) body.thinking = r.compat.display ? { type: "adaptive", display: "summarized" } : { type: "adaptive" };
    if (r.compat.effort) body.output_config = { effort: r.modelDef.effort };
    return body;
  }

  /** Streams the agent's words to the screen while a response arrives. */
  function makeStreamHooks(r) {
    const bus = r.bus;
    const pending = new Map();
    let timer = null;
    const flushPending = () => {
      timer = null;
      if (!r.ended) for (const [id, ev] of pending) bus.emit(ev.type, { msg_id: id, text: ev.text, done: false });
      pending.clear();
    };
    const queue = (type, id, text) => {
      if (r.ended) return;
      pending.set(id, { type, text });
      if (!timer) timer = setTimeout(flushPending, 45);
    };
    const nid = (i) => `n-${r.step}-${i}`;
    return {
      hooks: {
        onText: (i, text) => { if (text.trim()) queue("narration", nid(i), text); },
        onBlockStop: (i, block) => {
          if (r.ended) return;
          if (block.type === "text" && block.text.trim()) {
            pending.delete(nid(i));
            bus.emit("narration", { msg_id: nid(i), text: block.text, done: true });
          } else if (block.type === "server_tool_use") {
            setPhase(r, phaseForTool(r, block.name));
            bus.emit("tool_call", { call_id: block.id, name: block.name, input: block.input || {}, server: true });
          } else if (block.type === "web_search_tool_result") {
            bus.emit("tool_result", searchResultEvent(block));
          }
        }
      },
      flush: () => {
        clearTimeout(timer);
        timer = null;
        pending.clear();
      }
    };
  }

  // ---- tools ----------------------------------------------------------------------------------------

  async function runTools(r, uses, toolbox) {
    const results = new Array(uses.length);
    let i = 0;
    while (i < uses.length) {
      if (r.cancelled) throw ABORT;
      if (ORDER_FREE(uses[i].name)) {
        // A run of independent data lookups executes in parallel.
        let j = i;
        while (j < uses.length && ORDER_FREE(uses[j].name)) j++;
        const batch = uses.slice(i, j);
        const outs = await Promise.all(batch.map((b) => execOne(r, b, toolbox)));
        outs.forEach((o, k) => { results[i + k] = o; });
        i = j;
      } else {
        results[i] = await execOne(r, uses[i], toolbox);
        i += 1;
      }
    }
    return results;
  }

  async function execOne(r, block, toolbox) {
    const bus = r.bus;
    const name = block.name;
    if (!UI_BLOCKING_TOOLS.has(name)) setPhase(r, phaseForTool(r, name));
    bus.emit("tool_call", { call_id: block.id, name, input: block.input || {}, server: false });
    let out;
    try {
      out = await toolbox.execute(name, block.input || {});
    } catch (e) {
      if (e === ABORT || typeof e === "symbol" || e?.name === "AbortError") throw ABORT;
      const why = String(e?.message || "unknown error");
      out = { content: JSON.stringify({ error: why }), isError: true, result: { error: why }, summary: "Tool error" };
    }
    // A slow lookup that returns after Abort or Reset is dropped, never shown in the next run.
    if (r.ended || r.cancelled) throw ABORT;
    bus.emit("tool_result", { call_id: block.id, name, ok: !out.isError, summary: out.summary, result: out.result, server: false });
    return { type: "tool_result", tool_use_id: block.id, content: out.content, ...(out.isError ? { is_error: true } : {}) };
  }

  // ---- phases ---------------------------------------------------------------------------------------

  function phaseForTool(r, name) {
    const late = ["options", "awaiting_approval", "executing"].includes(r.phase);
    if (late) return r.phase;
    if (name === "web_search") return "verifying";
    if (name.startsWith("erp_")) return "diagnosing";
    if (name === "sim_impact") return "simulating";
    return r.phase;
  }

  function setPhase(r, state) {
    if (!state || state === r.phase || r.ended) return;
    r.phase = state;
    r.bus.emit("state_change", { state });
  }

  // ---- waits (human decisions) ------------------------------------------------------------------------

  function takeDecision(r, predicate) {
    const i = r.decisions.findIndex((ev) => predicate(ev));
    return i >= 0 ? r.decisions.splice(i, 1)[0] : null;
  }

  function waitUntil(r, test) {
    if (r.cancelled) return Promise.reject(ABORT);
    const now = test();
    if (now) return Promise.resolve(now);
    return new Promise((resolve, reject) => {
      const check = () => {
        const v = test();
        if (!v) return;
        if (r.poke === check) r.poke = null;
        r.waiters.delete(cancel);
        resolve(v);
      };
      const cancel = () => {
        if (r.poke === check) r.poke = null;
        reject(ABORT);
      };
      r.poke = check;
      r.waiters.add(cancel);
    });
  }

  // ---- ending ----------------------------------------------------------------------------------------

  function finish(r, status, reason) {
    if (r.ended) return;
    r.ended = true;
    const st = status === "done" || status === "no_findings" ? "done" : status === "incomplete" ? "stopped" : status;
    r.bus.emit("state_change", { state: st });
    r.bus.emit("run_end", { status, ...(reason ? { reason } : {}) });
  }

  function handleError(r, e) {
    console.error("[showcase] live run failed:", e);
    let text;
    if (e instanceof ApiError) {
      if (e.status === 401) {
        text = "Anthropic rejected the API key (401). It has been removed from this tab; start again and enter a valid key.";
        hooks.onKeyRejected?.();
      } else if (e.spendLimit || e.status === 402) {
        text = "The API key has reached its spend limit or has no credit. Raise the workspace's spend limit at platform.claude.com (Settings, Workspaces), or go back to the simulation.";
      } else if ((e.status === 400 || e.status === 403) && /workspace/i.test(e.message || "")) {
        text = `Anthropic refused the request because of this key's workspace (${e.message}). If the key works in several workspaces, create one scoped to a single workspace at platform.claude.com (Settings, API keys) and enter that key.`;
      } else if (e.status === 404) {
        text = `The model ${r.modelDef.label} is not available to this API key.`;
      } else if (e.status === 0 && e.type === "network_error") {
        text = `Could not reach api.anthropic.com from this browser (${e.message}). Try another network; the simulation works offline.`;
      } else if (e.retryable) {
        text = `The API is busy right now (${describeTransient(e)}), even after two retries. Try again in a minute, or go back to the simulation.`;
      } else {
        text = `The API returned an error (${e.status || ""} ${e.type}): ${e.message}`;
      }
      if (e.requestId) text += ` Request id: ${e.requestId}.`;
    } else {
      text = `The run stopped because of an unexpected error: ${e?.message || e}`;
    }
    r.bus.emit("notice", { level: "error", text });
    finish(r, "error", "See the message above.");
  }

  function abort(reason = "Stopped by the user.") {
    const r = current;
    if (!r || r.ended) return;
    r.cancelled = true;
    r.abortReason = reason;
    r.ac.abort();
    for (const w of r.waiters) w();
    r.waiters.clear();
    finish(r, "aborted", reason);
  }

  /** A person's decision on an option ("approved" or "rejected"); the toolbox waits for it. */
  function decide(option_id, decision) {
    const r = current;
    if (!r || r.ended) return;
    r.decisions.push({ payload: { option_id, decision } });
    r.poke?.();
  }

  /** A person's decision on one draft. */
  function decideDraft(action_id, decision) {
    const r = current;
    if (!r || r.ended) return;
    const d = r.drafts.get(action_id);
    if (d && d.status === "pending") d.status = decision;
    r.poke?.();
  }

  return { run, abort, decide, decideDraft, isActive: () => !!current && !current.ended };
}

// ---------------------------------------------------------------------------------------------------

/** Drops tool_use blocks that were cut off by max_tokens (they cannot be answered). */
function cleanContent(content, incomplete) {
  if (!incomplete?.size) return content;
  return content.filter((_, i) => !incomplete.has(i));
}

/**
 * Adds a text instruction as the next user turn, merging into a trailing user turn if needed.
 * Returns the index of the message it changed.
 */
function pushUserText(messages, text) {
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    const content = Array.isArray(last.content) ? last.content : [{ type: "text", text: String(last.content) }];
    last.content = [...content, { type: "text", text }];
    return messages.length - 1;
  }
  messages.push({ role: "user", content: text });
  return messages.length - 1;
}

/** What the agent is told when it ends its turn before ui_final_report. */
function continueInstruction(st) {
  const base = "Nobody can answer questions on screen, so do not wait for a reply. Decide yourself and continue the workflow with your tools.";
  if (st.approvedOption) {
    return `${base} The human approved ${st.approvedOption.label}. Draft its actions with ui_draft_action, call ui_await_approvals, then publish the management summary with ui_final_report.`;
  }
  if (st.options) {
    return `${base} The options are on screen. Call ui_await_decision to wait for the human decision.`;
  }
  return `${base} Complete the steps: verify, quantify with sim_impact, raise the alert, cost exactly three options and present them with ui_propose_options. End your turn only after ui_final_report.`;
}

function searchResultEvent(block) {
  const c = block.content;
  if (!Array.isArray(c)) {
    const code = c?.error_code || "unavailable";
    return { call_id: block.tool_use_id, name: "web_search", server: true, ok: false, summary: `Search failed (${code})`, result: { error: code } };
  }
  const results = c.filter((x) => x?.type === "web_search_result").map((x) => ({ title: x.title, url: x.url, page_age: x.page_age || null }));
  return {
    call_id: block.tool_use_id, name: "web_search", server: true, ok: true,
    summary: results.length ? `${results.length} result${results.length === 1 ? "" : "s"}` : "No results",
    sources: results.map((x) => ({ title: x.title, url: x.url, page_age: x.page_age })),
    result: { results }
  };
}

function describeTransient(e) {
  if (e.status === 429) return "a rate limit (429)";
  if (e.status === 529 || e.type === "overloaded_error") return "overload (529)";
  if (e.type === "timeout_error") return "a timeout";
  if (e.type === "network_error") return "a network interruption";
  return `${e.status || ""} ${e.type}`.trim();
}

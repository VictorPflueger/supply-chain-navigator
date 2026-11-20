// A live run on a session key against a scripted stand-in for the Anthropic Messages API
// (lib/fake-claude.mjs), which streams realistic SSE and checks every request: headers, assistant
// turns passed back unchanged, every tool call answered.
//   full     Tangier end to end: two sources before the alert, a draft tried before any decision and
//            refused, an overloaded API retried, option A rejected and B approved, one draft approved
//            and one rejected, the summary; the page says it is an AI, follows the agent's steps, sends
//            nothing, keeps the key in the tab and measures the cost from the API's usage
//   badkey   a key the API rejects: the dialog says so, and nothing is sent to the model
//   stop     Stop the live run while the model answers: the run ends and says so, nothing arrives later
// Usage: NODE_PATH="$(npm root -g)" node tests/live.mjs [case…]
import path from "node:path";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { launchBrowser, serveStatic, outDir, wanted, loadApp, CORS, MOCK_KEY, NETWORK_NOISE } from "./lib/harness.mjs";

const { story, cost, format } = await loadApp();
const DEMO = story.figures(story.scriptedRun(story.DEMO_ID, new Date()));
const REF = globalThis.REFERENCE_CASES["SC-TNG-FIRE"];
const OUT = await outDir("live");
const server = await serveStatic();
const browser = await launchBrowser();
const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const NOTICE = "You are interacting with an AI system";

/** A page whose only way out is the stand-in API; every other host is refused and recorded. */
async function open(fake, { models = "ok" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const calls = { messages: 0, models: 0, other: [] };
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host !== "api.anthropic.com") { calls.other.push(req.url()); return route.abort("blockedbyclient"); }
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
    if (u.pathname === "/v1/models") {
      calls.models += 1;
      if (models === "reject") return route.fulfill({ status: 401, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
      return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: cost.MODEL.id }] }) });
    }
    if (u.pathname === "/v1/messages") {
      calls.messages += 1;
      const out = fake.handle(req.postData() || "{}", req.headers());
      if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
      return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
    }
    calls.other.push(req.url());
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text()) && !/\[showcase\] live run failed/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.base}?guide=0`);
  await page.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 15000 });
  return { context, page, errors, calls };
}
async function startLive(page) {
  await page.click("#start");
  await page.fill("#key-input", MOCK_KEY);
  await page.click("#start-live");
}
const kpi = (page, name) => page.evaluate((n) => { const t = document.querySelector(`[data-vc-kpi="${n}"]`); return { value: t.querySelector(".kpi-value").textContent.replace(/ /g, " ").trim(), note: t.querySelector(".kpi-note").textContent.trim(), tone: t.dataset.tone || "" }; }, name);
const words = (page) => page.evaluate(() => document.getElementById("agent-words").innerText);
const usage = (o = {}) => ({ input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 420, ...o });
const lastResults = (req) => { const last = req.messages[req.messages.length - 1]; return (Array.isArray(last.content) ? last.content : []).filter((b) => b.type === "tool_result"); };
const parsed = (block) => { try { return JSON.parse(block.content); } catch { return {}; } };

try {
  if (wanted("full")) {
    const sources = [
      { type: "web_search_result", url: "https://news.example.org/tanger-fire", title: "Fire at automotive supplier in Tanger Automotive City", encrypted_content: "ENC1", page_age: "2 hours ago" },
      { type: "web_search_result", url: "https://business.example.com/harness-maker-halts", title: "Harness maker confirms production halt after fire", encrypted_content: "ENC2", page_age: "1 hour ago" }
    ];
    const script = [
      { usage: usage({ input_tokens: 3400, cache_creation_input_tokens: 6100, cache_read_input_tokens: 0, output_tokens: 380 }), stop: "tool_use", blocks: [
        { type: "thinking", thinking: "The report is unverified. First: are we exposed in Morocco?", signature: "SIG-1==" },
        { type: "text", text: "Signal received: an unverified report of a fire at a wiring-harness plant in Tanger Automotive City. First question: are we exposed there?" },
        { type: "tool_use", id: "toolu_01", name: "erp_list_suppliers", input: { region: "MA" } }
      ], expect: (req, { check: c }) => {
        c(typeof req.messages[0].content === "string" && req.messages[0].content.includes("Tanger Automotive City"), "the opening message carries the report");
        c(req.model === cost.MODEL.id && req.thinking?.type === "adaptive" && req.cache_control?.type === "ephemeral", "model, adaptive thinking and caching");
        c(req.tools[0].type?.startsWith("web_search") && req.tools.every((t) => !/^geo_/.test(t.name || "")), "web search first, no open-data tools");
      } },
      { usage: usage({ web_search_requests: 2 }), stop: "tool_use", blocks: [
        { type: "text", text: "Hypothesis: the plant is our tier-1 supplier Tanger Harness Systems (S-TNG-HAR), which ships 55 % of Leipzig's main harnesses." },
        { type: "server_tool_use", id: "srvtoolu_01", name: "web_search", input: { query: "fire wiring harness plant Tanger Automotive City" } },
        { type: "web_search_tool_result", tool_use_id: "srvtoolu_01", content: [sources[0]] },
        { type: "text", text: "Check: the report names no company. I look for a second, independent source." },
        { type: "server_tool_use", id: "srvtoolu_02", name: "web_search", input: { query: "Tanger Harness Systems fire production halted" } },
        { type: "web_search_tool_result", tool_use_id: "srvtoolu_02", content: [sources[1]] },
        { type: "text", text: "Confirmed: a business outlet quotes the company. Production is halted." },
        { type: "tool_use", id: "toolu_02", name: "ui_report_alert", input: { title: "Fire halts our tier-1 harness supplier in Tangier", severity: "critical", basis: "verified", summary: "Tanger Harness Systems (S-TNG-HAR) stopped production after a fire. It supplies 55 % of Leipzig's main harnesses.", sources: sources.map((s) => ({ title: s.title, url: s.url })), supplier_ids: ["S-TNG-HAR"], route_ids: ["R-RD-TNG-LEJ"] } },
        { type: "tool_use", id: "toolu_03", name: "erp_get_supplier", input: { supplier_id: "S-TNG-HAR" } }
      ], expect: (req, { check: c }) => { const r = lastResults(req); c(r.length === 1 && parsed(r[0]).count >= 1, "the supplier search answered"); } },
      { error: { status: 529, type: "overloaded_error", message: "Overloaded" } },
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Finding: the same plant builds the seat harnesses for our single-source seat supplier. First estimate from the report: one week of lost production." },
        { type: "tool_use", id: "toolu_04", name: "sim_impact", input: REF.hypothesis },
        { type: "tool_use", id: "toolu_05", name: "ui_draft_action", input: { type: "email", recipient: "Banat Cable Systems SRL", subject: "Capacity request", body: "Dear team, please raise volume." } }
      ], expect: (req, { check: c }) => { const r = lastResults(req); c(r.length === 2 && parsed(r[0]).ok === true, "the alert with two sources is accepted"); } },
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Revised: the cutting hall is damaged, so five weeks, not one." },
        { type: "tool_use", id: "toolu_06", name: "erp_get_alternatives", input: { part_id: "P-HAR" } },
        { type: "tool_use", id: "toolu_07", name: "sim_impact", input: REF.disruption }
      ], expect: (req, { check: c }) => {
        const r = lastResults(req);
        c(r.length === 2 && r[1].is_error === true && /Drafts follow a human decision/.test(r[1].content), "a draft before any decision is refused");
        c(!("ui" in parsed(r[0])), "the engine's chart series stay out of the model's context");
      } },
      { usage: usage({ output_tokens: 900 }), stop: "tool_use", blocks: [
        { type: "text", text: "Recommendation: option B has the best expected total and covers the weeks after the surge runs out." },
        { type: "tool_use", id: "toolu_08", name: "ui_propose_options", input: {
          recommended_variant_id: "V2",
          baseline_description: "Let Leipzig run until harnesses run out; wait five weeks for Tangier.",
          options: [
            { variant_id: "V1", title: "Surge Timișoara and Sousse", description: "Extra volume from both sister plants; re-source the seat harness.", residual_risk: "About a quarter of demand stays uncovered." },
            { variant_id: "V2", title: "Surge plus Kénitra tooling transfer", description: "Option A plus a 14-day fast-track qualification in Kénitra.", residual_risk: "A short gap remains until Kénitra delivers." },
            { variant_id: "V3", title: "Kénitra transfer only", description: "No surge premiums; seat harness re-sourced.", residual_risk: "Leipzig runs short for more than a week." }
          ] } }
      ], expect: (req, { check: c }) => { const r = lastResults(req); c(parsed(r[1]).variants?.length === 3, "the engine costed three variants"); } },
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Option A rejected. Options B and C remain open." },
        { type: "tool_use", id: "toolu_09", name: "ui_await_decision", input: {} }
      ], expect: (req, { check: c }) => { const r = parsed(lastResults(req)[0]); c(r.decision === "rejected" && r.option_id === "V1", "the rejection comes back as the tool's result"); } },
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Option B approved. Drafting the supplier request and the extra transport; each waits for your approval." },
        { type: "tool_use", id: "toolu_10", name: "ui_draft_action", input: { type: "email", recipient: "Banat Cable Systems SRL, Timișoara (key account)", subject: "Urgent capacity request: +20 % main harness volume for Leipzig", body: "Dear Banat Cable Systems team,\n\nPlease raise main-harness deliveries to Leipzig by 20 % for four weeks.\n\nKind regards\nPurchasing, Nordwerk Automotive GmbH" } },
        { type: "tool_use", id: "toolu_11", name: "ui_draft_action", input: { type: "booking", recipient: "Contracted road carrier (framework agreement)", subject: "Mock booking: 2 trucks per day Timișoara to Leipzig", body: "Lane: Timișoara to Leipzig\nFrequency: 2 trucks per day" } },
        { type: "tool_use", id: "toolu_12", name: "ui_mark_map", input: { supplier_ids: ["S-TSR-HAR", "S-SOU-HAR"], state: "resolved" } }
      ], expect: (req, { check: c }) => { const r = parsed(lastResults(req)[0]); c(r.decision === "approved" && r.option_id === "V2", "the approval comes back as the tool's result"); } },
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "tool_use", id: "toolu_13", name: "ui_await_approvals", input: {} }
      ] },
      { usage: usage({ output_tokens: 700 }), stop: "tool_use", blocks: [
        { type: "tool_use", id: "toolu_14", name: "ui_final_report", input: { outcome: "response_decided", markdown: "## Tangier harness plant fire: response decision\n\n**What happened.** A fire halted Tanger Harness Systems.\n\n**Decision.** Option B approved; one draft approved, one rejected, nothing sent." } }
      ], expect: (req, { check: c }) => { const r = parsed(lastResults(req)[0]); c(r.approved === 1 && r.rejected === 1, `each draft decision comes back (${r.approved} approved, ${r.rejected} rejected)`); } },
      { usage: usage({ output_tokens: 40 }), stop: "end_turn", blocks: [
        { type: "text", text: "The management summary is published. Nothing was sent." }
      ] }
    ];
    const fake = createFakeClaude(script);
    const t = await open(fake);
    const { page } = t;
    try {
      await startLive(page);
      await page.waitForFunction(() => document.getElementById("mode-text").textContent === "LIVE", null, { timeout: 10000 });
      const live = await page.evaluate((n) => ({ note: document.getElementById("agent-note").textContent, stop: !document.getElementById("stop").hidden, key: sessionStorage.getItem("showcase.anthropic.key"), stored: Object.keys(localStorage).filter((k) => /key/i.test(k)), says: document.body.innerText.includes(n) }), NOTICE);
      check(live.note.includes(NOTICE) && live.says && live.stop, `live: the mode reads Live, the agent's panel says "${NOTICE}", and Stop is on screen`);
      check(live.key === MOCK_KEY && !live.stored.length, "live: the key sits in the tab's session storage only");
      const early = await kpi(page, "Value at risk");
      check(early.value === "Step 3", `live: Value at risk waits for the engine ("${early.value}", ${early.note})`);
      await page.waitForSelector('.option[data-option="V1"] [data-action="reject"]', { timeout: 30000 });
      await page.screenshot({ path: path.join(OUT, "live-options.png") });
      const atOptions = await page.evaluate(() => ({ step: document.querySelector('#steps [aria-current="step"]')?.closest("li")?.dataset.step, alert: [...document.querySelectorAll("#steps li")].map((li) => li.querySelector("button").disabled) }));
      const v = await kpi(page, "Value at risk");
      check(atOptions.step === "propose" && v.value === DEMO.var, `live: the page follows the agent to Propose, and Value at risk is the engine's ${v.value}`);
      await page.click('#steps [data-step="check"] button');
      const checkStep = await page.evaluate(() => ({ title: document.getElementById("story-title").textContent, card: document.getElementById("story-card").innerText }));
      check(/Fire halts our tier-1 harness supplier/.test(checkStep.title) && /2 sources found|Two sources found/i.test(checkStep.card) && /confirmed by two sources/i.test(checkStep.card), `live: Check shows both sources and the alert ("${checkStep.title}")`);
      await page.click('#steps [data-step="propose"] button');
      await page.click('.option[data-option="V1"] [data-action="reject"]');
      await page.waitForFunction(() => /Option A rejected/.test(document.getElementById("agent-words").innerText), null, { timeout: 15000 });
      await page.click('.option[data-option="V2"] [data-action="approve"]');
      await page.waitForSelector('.draft [data-action="approve"]', { timeout: 20000 });
      await page.waitForFunction(() => document.querySelectorAll('.draft [data-action="approve"]').length === 2, null, { timeout: 10000 });
      const decided = await kpi(page, "Value at risk");
      const clock = await kpi(page, "Detection → decision");
      check(decided.value === DEMO["rec-left"] && clock.tone === "decided", `live: the approval moves Value at risk to ${decided.value} and stops the clock at ${clock.value}`);
      const drafts = await page.$$eval(".draft", (els) => els.map((e) => e.querySelector(".draft-to").textContent));
      check(drafts.length === 2, `live: only the two drafts after the approval reach the page (${drafts.join("; ")})`);
      await page.screenshot({ path: path.join(OUT, "live-drafts.png") });
      await page.click('.draft >> nth=0 >> [data-action="approve"]');
      await page.click('.draft >> nth=1 >> [data-action="reject"]');
      await page.waitForSelector("details.summary", { timeout: 20000 });
      await page.waitForFunction(() => document.getElementById("stop").hidden, null, { timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, "live-done.png") });
      const done = await page.evaluate(() => ({ summary: document.querySelector("details.summary").innerText, statuses: [...document.querySelectorAll(".draft")].map((d) => d.dataset.status), retry: document.getElementById("agent-words").innerText }));
      check(/Live agent run/.test(done.summary) && done.statuses.join() === "approved,rejected", `live: the summary follows the decisions (${done.statuses.join(", ")}) and says it is a live run`);
      let usd = 0;
      for (const s of script) if (s.usage) usd += cost.usageEur({ ...s.usage, server_tool_use: { web_search_requests: s.usage.web_search_requests || 0 } });
      const spent = await kpi(page, "Session cost");
      check(spent.value === format.eurCents(usd) && /^measured/.test(spent.note), `live: Session cost is measured from the API's usage: ${spent.value} (${spent.note}), expected ${format.eurCents(usd)}`);
      check(fake.violations.length === 0 && fake.remaining() === 0, `live: every request keeps the protocol and the script ran to its end${fake.violations.length ? `; ${fake.violations.join("; ")}` : ""}${fake.remaining() ? `; ${fake.remaining()} responses unused` : ""}`);
      const csp = await page.evaluate(() => window.__csp);
      check(!t.calls.other.length && !csp.length && t.calls.models === 1, `live: the page talks to api.anthropic.com only (${t.calls.models} key check, ${t.calls.messages} messages)${t.calls.other.length ? `; also ${t.calls.other.join(", ")}` : ""}${csp.length ? `; CSP: ${csp.join(", ")}` : ""}`);
      check(!t.errors.length, `live: no page errors${t.errors.length ? `: ${t.errors.join(" | ")}` : ""}`);
    } catch (e) {
      await page.screenshot({ path: path.join(OUT, "live-failed.png") }).catch(() => {});
      check(false, `live: stopped with ${String(e.message || e).split("\n")[0]}; protocol: ${fake.violations.join("; ") || "clean"}; ${fake.remaining()} responses unused`);
    }
    await t.context.close();
  }

  if (wanted("badkey")) {
    const fake = createFakeClaude([]);
    const t = await open(fake, { models: "reject" });
    await startLive(t.page);
    await t.page.waitForSelector("#key-error:not([hidden])", { timeout: 10000 });
    const s = await t.page.evaluate(() => ({ open: document.getElementById("start-dialog").open, error: document.getElementById("key-error").textContent, mode: document.getElementById("mode-text").textContent, key: sessionStorage.getItem("showcase.anthropic.key") }));
    check(s.open && s.error.length > 10 && s.mode === "SIMULATION" && t.calls.messages === 0 && !s.key, `badkey: a rejected key keeps the dialog open ("${s.error}"), stores nothing and sends nothing to the model`);
    await t.context.close();
  }

  if (wanted("stop")) {
    const fake = createFakeClaude([
      { delayMs: 2500, usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Signal received: a report of a fire in Tanger Automotive City." },
        { type: "tool_use", id: "toolu_s1", name: "erp_list_suppliers", input: { region: "MA" } }
      ] }
    ]);
    const t = await open(fake);
    await startLive(t.page);
    await t.page.waitForFunction(() => document.getElementById("mode-text").textContent === "LIVE", null, { timeout: 10000 });
    await t.page.waitForTimeout(600);
    await t.page.click("#stop");
    await t.page.waitForTimeout(3500);
    const s = await t.page.evaluate(() => ({ words: document.getElementById("agent-words").innerText, stop: document.getElementById("stop").hidden }));
    check(s.stop && /You stopped the live run/.test(s.words) && !/Signal received/.test(s.words) && t.calls.messages === 1, `stop: the run ends on Stop and says so, and the answer that comes later never reaches the page`);
    await t.page.click("#start");
    const reopened = await t.page.evaluate(() => document.getElementById("start-dialog").open);
    check(reopened, "stop: Start agent opens again afterwards");
    await t.context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

let failed = 0;
for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
console.log(`(screenshots in ${OUT})`);
if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nLIVE OK`);

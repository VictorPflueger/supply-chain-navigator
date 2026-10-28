// The live agent against a scripted stand-in for the Anthropic Messages API (lib/fake-claude.mjs).
// The fake streams realistic SSE and checks every request against the protocol rules in
// TECH_NOTES §3: assistant turns echoed unchanged with signatures, every tool_use answered, headers.
//   full      Tangier end to end: parallel tools, pause_turn, a 529 retry, two-source alert,
//             rejection then approval, max_tokens retry, drafts, report, audit, cost maths,
//             Save run as simulation and replay of the recording
//   nows      web search disabled for the organisation → fallback, nudge, Live scan disabled
//   geofail   an open-data API answers 503 → console note and web-search fallback
//   race      a second decision while the model still answers the first; recording branches
//   abort     Abort while a model call is in flight: nothing appears afterwards
//   badkey    the key is rejected mid-run (401) → removed from the tab
//   scan      Live scan with nothing material → honest end
// Usage: node tests/live.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, fulfilLeaflet, CORS, MOCK_KEY, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const ROOT = APP_ROOT;
const OUT = await outDir("live");
const { base: BASE, close } = await serveStatic(ROOT, 8767);
const browser = await launchBrowser();
const REF = await loadRef();
const results = [];
const run = wanted;
const KEY = MOCK_KEY;

async function loadRef() {
  const src = await readFile(path.join(ROOT, "data/reference_cases.js"), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  return sandbox.window.REFERENCE_CASES;
}

// ---- open-data fixtures --------------------------------------------------------------------------
function openData(url) {
  const u = new URL(url);
  if (u.host === "api.open-meteo.com") {
    const days = ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    return { timezone: "Africa/Casablanca", daily: { time: days, weather_code: days.map((_, i) => (i === 2 ? 63 : 1)), precipitation_sum: days.map((_, i) => (i === 2 ? 12.4 : 0)), rain_sum: days.map(() => 0), snowfall_sum: days.map(() => 0), wind_speed_10m_max: days.map(() => 22), wind_gusts_10m_max: days.map(() => 41), temperature_2m_max: days.map(() => 24), temperature_2m_min: days.map(() => 15) } };
  }
  if (u.host === "www.pegelonline.wsv.de") {
    if (u.pathname.endsWith("currentmeasurement.json")) return { timestamp: "2026-10-12T19:15:00+02:00", value: 14, stateMnwMhw: "low", stateNswHsw: "normal" };
    return Array.from({ length: 96 }, (_, i) => ({ timestamp: `t${i}`, value: 24 - Math.round(i / 10) }));
  }
  if (u.host === "earthquake.usgs.gov") {
    return { type: "FeatureCollection", features: [
      { properties: { mag: 5.1, place: "40 km SE of Hualien City, Taiwan", time: Date.now() - 86400000, url: "https://earthquake.usgs.gov/earthquakes/eventpage/mock1", alert: null, tsunami: 0 }, geometry: { coordinates: [121.9, 23.7, 20] } },
      { properties: { mag: 6.0, place: "South Sandwich Islands region", time: Date.now() - 2 * 86400000, url: "https://earthquake.usgs.gov/earthquakes/eventpage/mock2", alert: "green", tsunami: 0 }, geometry: { coordinates: [-26.5, -58.1, 35] } }
    ] };
  }
  if (u.host === "eonet.gsfc.nasa.gov") return { events: [] };
  return null;
}

const served = new Map(); // extra same-origin files for a test (e.g. a recorded simulation script)
async function newPage(fake, { models = "ok", failHosts = [] } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  await context.route(/^http:\/\/127\.0\.0\.1:8767\/test\//, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (served.has(p)) return route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: served.get(p) });
    return route.fulfill({ status: 404, body: "" });
  });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (await fulfilLeaflet(route)) return;
    if (u.host === "api.anthropic.com") {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") {
        if (models === "reject") return route.fulfill({ status: 401, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
        return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
      }
      if (u.pathname === "/v1/messages") {
        const out = fake.handle(req.postData() || "{}", req.headers());
        if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
        return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
      }
    }
    if (failHosts.includes(u.host)) return route.fulfill({ status: 503, headers: { ...CORS, "content-type": "text/plain" }, body: "Service unavailable (test)" });
    const fixture = openData(req.url());
    if (fixture) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(fixture) });
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const log = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) log.consoleErrors.push(m.text()); });
  return { context, page, log };
}

async function startLive(page, { scan = false } = {}) {
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  if (scan) await page.click("#btn-scan");
  else {
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
  }
  await page.waitForSelector("#api-key-input");
  await page.fill("#api-key-input", KEY);
  await page.click('button:has-text("Check key and continue")');
}

async function finish(name, t, fake, checks) {
  const csp = await t.page.evaluate(() => window.__csp || []).catch(() => []);
  results.push({ name, checks, violations: fake?.violations || [], remainingScript: fake?.remaining?.() ?? null, pageErrors: t.log.pageErrors, consoleErrors: t.log.consoleErrors.filter((x) => !x.includes("[Navigator] live run failed")), csp });
  await t.context.close();
}

const usage = (o = {}) => ({ input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 420, ...o });

// ---- case: full Tangier run ------------------------------------------------------------------------
if (run("full")) {
  const ref = REF["SC-TNG-FIRE"];
  const script = [
    { usage: usage({ input_tokens: 3400, cache_creation_input_tokens: 6100, cache_read_input_tokens: 0, output_tokens: 380 }), stop: "tool_use", blocks: [
      { type: "thinking", thinking: "The signal is unverified. First check whether we have suppliers in Morocco, and look at the weather there in parallel.", signature: "SIG-THINK-1==" },
      { type: "text", text: "Signal received: an unverified report of a fire at a wiring-harness plant in Tanger Automotive City. First question: are we exposed there? I check our Moroccan suppliers and the local weather in parallel." },
      { type: "tool_use", id: "toolu_01", name: "erp_list_suppliers", input: { region: "MA" } },
      { type: "tool_use", id: "toolu_02", name: "geo_weather", input: { lat: 35.75, lon: -5.6, days: 7 } }
    ], expect: (req, { check }) => { check(req.messages.length === 1 && typeof req.messages[0].content === "string" && req.messages[0].content.includes("Tanger Automotive City"), "opening message must carry the seed"); check(req.thinking?.type === "adaptive" && req.thinking?.display === "summarized", "thinking params"); check(req.output_config?.effort === "medium", "effort"); check(req.cache_control?.type === "ephemeral", "cache_control"); check(req.tools[0].type === "web_search_20250305" && req.tools[0].max_uses === 5, "web search tool first"); } },
    { usage: usage({ web_search_requests: 1 }), stop: "pause_turn", blocks: [
      { type: "text", text: "Hypothesis: the plant is our tier-1 supplier Tanger Harness Systems (S-TNG-HAR), which ships 55 % of Leipzig's main harnesses. The weather is calm, so a weather cause is unlikely." },
      { type: "server_tool_use", id: "srvtoolu_01", name: "web_search", input: { query: "fire wiring harness plant Tanger Automotive City" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_01", content: [
        { type: "web_search_result", url: "https://news.example.org/tanger-fire", title: "Fire at automotive supplier in Tanger Automotive City", encrypted_content: "ENC1", page_age: "2 hours ago" },
        { type: "web_search_result", url: "https://social.example.net/post/123", title: "Smoke over Melloussa industrial zone", encrypted_content: "ENC2", page_age: "3 hours ago" }
      ] },
      { type: "text", text: "Check: neither source names the company. I look for a second, independent source." }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; check(last.role === "user" && Array.isArray(last.content) && last.content.length === 2, "two tool results expected"); check(JSON.parse(last.content[1].content).source?.includes("Open-Meteo"), "weather tool result from Open-Meteo"); } },
    { usage: usage({ web_search_requests: 1 }), stop: "tool_use", blocks: [
      { type: "server_tool_use", id: "srvtoolu_02", name: "web_search", input: { query: "Tanger Harness Systems fire production halted" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_02", content: [
        { type: "web_search_result", url: "https://business.example.com/harness-maker-halts", title: "Harness maker confirms production halt after fire", encrypted_content: "ENC3", page_age: "1 hour ago" }
      ] },
      { type: "text", text: "Confirmed: a business outlet quotes the company directly. Production is halted; damage is still being assessed." },
      { type: "tool_use", id: "toolu_03", name: "ui_report_alert", input: { title: "Fire halts our tier-1 harness supplier in Tangier", severity: "critical", basis: "verified", summary: "Tanger Harness Systems (S-TNG-HAR) stopped production after a fire. It supplies 55 % of Leipzig's main harnesses.", sources: [{ title: "Business outlet quoting the company", url: "https://business.example.com/harness-maker-halts" }, { title: "Regional news report", url: "https://news.example.org/tanger-fire" }], supplier_ids: ["S-TNG-HAR"], route_ids: ["R-RD-TNG-LEJ"] } },
      { type: "tool_use", id: "toolu_04", name: "erp_get_supplier", input: { supplier_id: "S-TNG-HAR" } }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; check(last.role === "assistant", "pause_turn must be resent with the assistant turn last"); } },
    { error: { status: 529, type: "overloaded_error", message: "Overloaded" } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Finding: the same plant builds all seat harnesses for our single-source seat supplier (S-MBO-SEAT). First estimate from the initial report: one week of lost production." },
      { type: "tool_use", id: "toolu_05", name: "sim_impact", input: ref.hypothesis }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; const alert = JSON.parse(last.content[0].content); check(alert.ok === true, "alert accepted"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Revised: one week of lost production → about five weeks. The plant manager says the cutting hall is damaged." },
      { type: "tool_use", id: "toolu_06", name: "erp_get_alternatives", input: { part_id: "P-HAR" } }
    ] },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_07", name: "sim_impact", input: ref.disruption }
    ] },
    { usage: usage({ output_tokens: 900 }), stop: "tool_use", blocks: [
      { type: "text", text: "Recommendation: option B gives the best expected total and covers the weeks after the surge runs out." },
      { type: "tool_use", id: "toolu_08", name: "ui_propose_options", input: {
        recommended_variant_id: "V2",
        baseline_description: "Let Leipzig run until harnesses and seats run out; wait five weeks for Tangier.",
        options: [
          { variant_id: "V1", title: "Surge Timișoara and Sousse", description: "Ask both sister plants for extra volume; re-source the seat harness.", residual_risk: "About a quarter of demand stays uncovered." },
          { variant_id: "V2", title: "Surge plus Kénitra tooling transfer", description: "Option A plus a 14-day fast-track qualification in Kénitra.", residual_risk: "A short gap remains until Kénitra delivers." },
          { variant_id: "V3", title: "Kénitra transfer only", description: "No surge premiums; seat harness re-sourced.", residual_risk: "Leipzig runs short for more than a week." }
        ] } }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; const r = JSON.parse(last.content[0].content); check(r.ok === true && r.variants?.length === 3, "sim_impact with three variants"); check(!("ui" in r), "ui series must not be sent to the model"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Option A rejected. Options B and C remain open." },
      { type: "tool_use", id: "toolu_09", name: "ui_await_decision", input: {} }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; const r = JSON.parse(last.content[0].content); check(r.decision === "rejected" && r.option_id === "V1", "rejection returned as tool result"); } },
    { usage: usage({ output_tokens: 16000 }), stop: "max_tokens", cut: 1, discard: true, blocks: [
      { type: "text", text: "Option B approved. Drafting the supplier requests." },
      { type: "tool_use", id: "toolu_10x", name: "ui_draft_action", input: { type: "email", recipient: "Banat Cable Systems SRL, Timișoara (key account)", subject: "Urgent capacity request", body: "Dear team, …" } }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; const r = JSON.parse(last.content[0].content); check(r.decision === "approved" && r.option_id === "V2", "approval returned as tool result"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Option B approved. Drafting the supplier requests and the extra transport; each draft waits for your approval." },
      { type: "tool_use", id: "toolu_10", name: "ui_draft_action", input: { type: "email", recipient: "Banat Cable Systems SRL, Timișoara (key account)", subject: "Urgent capacity request: +20 % main harness volume for Leipzig", body: "Dear Banat Cable Systems team,\n\nPlease raise main-harness deliveries to Leipzig by 20 % of demand for four weeks.\n\nKind regards\nPurchasing, Nordwerk Automotive GmbH" } },
      { type: "tool_use", id: "toolu_11", name: "ui_draft_action", input: { type: "booking", recipient: "Contracted road carrier (framework agreement)", subject: "Mock booking: 2 trucks per day Timișoara → Leipzig", body: "Lane: Timișoara → Leipzig\nFrequency: 2 trucks per day\nMock booking for demonstration; no carrier system is connected." } },
      { type: "tool_use", id: "toolu_12", name: "ui_mark_map", input: { supplier_ids: ["S-TSR-HAR", "S-SOU-HAR", "A-KEN-HAR"], state: "resolved" } }
    ], expect: (req, { check }) => { check(req.max_tokens === 24000, `max_tokens raised after cut-off (got ${req.max_tokens})`); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_13", name: "ui_await_approvals", input: {} }
    ] },
    { usage: usage({ output_tokens: 700 }), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_14", name: "ui_final_report", input: { outcome: "response_decided", markdown: "## Tangier harness plant fire: response decision\n\n**What happened.** A fire halted Tanger Harness Systems.\n\n**Decision.** Option B approved.\n\n*Live agent run. Nordwerk and its suppliers are fictional; figures come from the deterministic impact engine.*" } }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; const r = JSON.parse(last.content[0].content); check(r.approved === 1 && r.rejected === 1, `draft decisions returned (got ${JSON.stringify({ a: r.approved, r: r.rejected })})`); } },
    { usage: usage({ output_tokens: 40 }), stop: "end_turn", blocks: [
      { type: "text", text: "The management summary is published. Two drafts were decided; nothing was sent." }
    ] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
    checks.badge = (await page.textContent("#mode-badge")).trim();
    await page.waitForSelector(".alert-card", { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "L1-live-alert.png") });
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "L2-live-options.png") });
    checks.optionTotals = await page.$$eval(".option-card", (els) => els.map((e) => e.querySelector(".option-total .value")?.textContent));
    // Reject option A first, then approve the recommended option B.
    await page.click('.option-card:nth-child(1) [data-action="reject"]');
    await page.waitForFunction(() => document.querySelector('.option-card:nth-child(1)')?.dataset.status === "rejected", null, { timeout: 5000 });
    await page.waitForFunction(() => [...document.querySelectorAll("#console .entry")].some((e) => /Option A rejected/.test(e.textContent)), null, { timeout: 15000 });
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForTimeout(400);
    checks.payoffVar = await page.$eval('#kpi-var-value', (e) => `${e.closest(".kpi").dataset.tone}|${e.textContent}|${e.nextElementSibling.textContent}`);
    checks.payoffStop = await page.$eval('#kpi-stop-value', (e) => `${e.closest(".kpi").dataset.tone}|${e.textContent}|${e.nextElementSibling.textContent}`);
    checks.plantStates = await page.$$eval(".plant-marker", (els) => els.map((e) => `${e.querySelector(".plant-label")?.textContent}:${e.dataset.state}`));
    await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "L3-live-outbox.png") });
    checks.draftFooter = await page.$$eval(".action-body", (els) => els.every((e) => e.textContent.includes("Requires human approval before sending")));
    // Approve the email, reject the booking.
    const approveButtons = await page.$$('.action-card .action-buttons [data-action="approve"]');
    await approveButtons[0].click();
    await page.waitForTimeout(200);
    const rejectButtons = await page.$$('.action-card .action-buttons [data-action="reject"]');
    await rejectButtons[rejectButtons.length - 1].click();
    await page.waitForSelector('button:has-text("Open management summary")', { timeout: 30000 });
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "L4-live-done.png") });
    checks.status = (await page.textContent(".status-pill .text")).trim();
    checks.costKpi = (await page.textContent("#kpi-cost-value")).trim();
    checks.costSub = (await page.textContent("#kpi-cost-sub")).trim();
    checks.varKpi = (await page.textContent("#kpi-var-value")).trim();
    checks.retryNotice = await page.evaluate(() => [...document.querySelectorAll("#console .entry")].some((e) => /Retrying in/.test(e.textContent)));
    checks.reasoning = await page.$$eval(".reasoning-text", (els) => els.map((e) => e.textContent).join(" | ").slice(0, 120));
    checks.webSources = await page.$$eval(".result-sources a", (els) => els.map((e) => e.href));
    checks.consoleWatermarkHidden = !(await page.isVisible(".sim-watermark"));
    await page.click("#tab-audit");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export JSON")')]);
    const file = path.join(OUT, download.suggestedFilename());
    await download.saveAs(file);
    const audit = JSON.parse(await readFile(file, "utf8"));
    checks.auditFile = download.suggestedFilename();
    checks.auditMode = audit.mode;
    checks.auditExchanges = audit.api_exchanges.length;
    checks.auditFirstHasSystem = typeof audit.api_exchanges[0]?.request?.system === "string";
    checks.auditNoKey = !JSON.stringify(audit).includes("MOCKKEY");
    checks.auditNoSignature = !JSON.stringify(audit).includes("SIG-THINK-1");
    checks.auditCostEur = audit.cost?.eur;
    // Expected cost from the script's usage (Sonnet prices, web search $10/1000, FX 0.894).
    let usd = 0;
    for (const s of script) {
      if (!s.usage) continue;
      const u = s.usage;
      usd += u.input_tokens * 2 / 1e6 + u.cache_creation_input_tokens * 2.5 / 1e6 + u.cache_read_input_tokens * 0.1 / 1e6 + u.output_tokens * 10 / 1e6 + (u.web_search_requests || 0) * 0.01;
    }
    checks.expectedCostEur = Math.round(usd * 0.894 * 10000) / 10000;
    checks.costMatches = Math.abs((audit.cost?.eur || 0) - usd * 0.894) < 1e-9;
    checks.modelCallRows = await page.$$eval('.audit-table tr[data-type="model_call"]', (els) => els.length);

    // ---- Save run as simulation, then replay it -------------------------------------------------
    const [simDl] = await Promise.all([page.waitForEvent("download"), page.click('#console button:has-text("Save run as simulation")')]);
    checks.simFile = simDl.suggestedFilename();
    const simText = await readFile(await simDl.path(), "utf8");
    await writeFile(path.join(OUT, simDl.suggestedFilename()), simText);
    checks.simNoKey = !simText.includes("MOCKKEY") && !simText.includes("SIG-THINK");
    checks.simHasRecordedSource = simText.includes('"source": "recorded"');
    checks.simReportRewritten = !simText.includes("*Live agent run.") && simText.includes("Recorded live run, replayed in Simulation mode");
    served.set("/test/recorded.js", simText);
    await page.addScriptTag({ url: "/test/recorded.js" });
    checks.simLoaded = await page.evaluate(() => window.SIM_RUNS?.["SC-TNG-FIRE"]?.source);
    await page.click("#btn-reset");
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 60000 });
    checks.replayWatermark = (await page.textContent(".sim-watermark")).replace(/\s+/g, " ").trim();
    checks.replayBadge = (await page.textContent("#mode-badge")).trim();
    checks.replayOptions = await page.$$eval(".option-card", (els) => els.map((e) => `${e.querySelector(".option-letter")?.textContent}:${e.querySelector(".option-title")?.textContent}:${e.querySelector(".option-total .value")?.textContent}`));
    checks.replaySources = await page.$$eval(".result-sources a, .result-sources span", (els) => els.map((e) => e.textContent).slice(0, 3));
    await page.screenshot({ path: path.join(OUT, "L7-replay-options.png") });
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 60000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 60000 });
    await page.click('button:has-text("Approve all")');
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "L8-replay-done.png") });
    checks.replayReport = await page.$eval(".report-card", (e) => e.innerText.split("\n").filter(Boolean).slice(-2).join(" | "));
    checks.replayCost = (await page.textContent("#kpi-cost-sub")).trim();
    await page.click("#tab-audit").catch(() => {});
    const [rdl] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export JSON")')]);
    const raudit = JSON.parse(await readFile(await rdl.path(), "utf8"));
    checks.replayAudit = `${raudit.mode}|${raudit.run?.sim_source}|${raudit.mode_statement.slice(0, 50)}`;
    // a different decision than the recorded one ends gracefully
    await page.click("#btn-reset");
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 60000 });
    await page.click('.option-card[aria-label^="Option C:"] [data-action="approve"]');
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    checks.replayOtherPath = await page.evaluate(() => [...document.querySelectorAll("#console .entry")].map((e) => e.innerText).find((x) => /only the path recorded/.test(x))?.replace(/\s+/g, " ").slice(0, 120) || null);
  } catch (e) {
    checks.FAILED = String(e.message).split("\n")[0];
    await page.screenshot({ path: path.join(OUT, "L-fail.png") });
    checks.consoleTail = await page.$$eval("#console .entry", (els) => els.slice(-6).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 240)));
  }
  await finish("live: full Tangier run (mock API)", t, fake, checks);
}

// ---- case: web search disabled for the organisation --------------------------------------------------
if (run("nows")) {
  const script = [
    { error: { status: 400, type: "invalid_request_error", message: "Web search is not enabled for this organization. An admin can enable it in the Claude Console." } },
    { usage: usage(), stop: "end_turn", blocks: [{ type: "text", text: "Not confirmed: without web search I cannot verify the signal. Should I continue as a what-if exercise?" }],
      expect: (req, { check }) => { check(!req.tools.some((t) => t.type?.startsWith("web_search")), "web_search tool must be removed after the 400"); check(req.system.includes("Web search is switched off"), "system prompt must mention missing web search"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Continuing on my own: I record the signal as unverified and keep monitoring." },
      { type: "tool_use", id: "toolu_n1", name: "ui_final_report", input: { outcome: "monitoring", markdown: "## Tangier signal: monitoring\n\nThe signal could not be verified without web search. No action is proposed yet.\n\n*Live agent run.*" } }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; check(last.role === "user" && typeof last.content === "string" && last.content.includes("Nobody can answer questions"), "nudge sent as a user turn after the early end_turn"); } },
    { usage: usage({ output_tokens: 20 }), stop: "end_turn", blocks: [{ type: "text", text: "Monitoring note published." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const checks = {};
  try {
    await startLive(t.page);
    await t.page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.banner = await t.page.evaluate(() => document.querySelector(".banner")?.innerText.replace(/\s+/g, " ").slice(0, 140) || null);
    checks.notice = await t.page.evaluate(() => [...document.querySelectorAll("#console .entry")].some((e) => /Web search is switched off/.test(e.textContent)));
    checks.nudgeNotice = await t.page.evaluate(() => [...document.querySelectorAll("#console .entry")].some((e) => /asked it to continue/.test(e.textContent)));
    checks.scanDisabled = await t.page.$eval("#btn-scan", (b) => `${b.getAttribute("aria-disabled")}|${b.title}`);
    await t.page.screenshot({ path: path.join(OUT, "L5-no-websearch.png") });
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  await finish("live: web search disabled → fallback", t, fake, checks);
}

// ---- case: an open-data API fails → console note and web-search fallback ------------------------------
if (run("geofail")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Check: I read the Rhine gauge at Kaub." },
      { type: "tool_use", id: "toolu_g1", name: "geo_rhine_level", input: { station: "KAUB" } }
    ] },
    { usage: usage({ web_search_requests: 1 }), stop: "tool_use", blocks: [
      { type: "text", text: "The gauge service is unreachable from this browser, so I use web search instead." },
      { type: "server_tool_use", id: "srvtoolu_g1", name: "web_search", input: { query: "Rhine Kaub water level today" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_g1", content: [{ type: "web_search_result", url: "https://news.example.org/rhine", title: "Rhine level at Kaub", encrypted_content: "E", page_age: "today" }] },
      { type: "tool_use", id: "toolu_g2", name: "ui_final_report", input: { outcome: "monitoring", markdown: "## Rhine check\n\nThe gauge service failed; web search was used instead. Nothing material.\n\n*Live agent run.*" } }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; const r = JSON.parse(last.content[0].content); check(last.content[0].is_error === true && r.fallback_hint === "use web_search", `geo failure returned with fallback_hint (got ${JSON.stringify(r).slice(0, 160)})`); } },
    { usage: usage({ output_tokens: 20 }), stop: "end_turn", blocks: [{ type: "text", text: "Done." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake, { failHosts: ["www.pegelonline.wsv.de"] });
  const checks = {};
  try {
    await startLive(t.page);
    await t.page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.fallbackNotice = await t.page.evaluate(() => [...document.querySelectorAll("#console .entry")].map((e) => e.innerText).find((x) => /falls back to web search/.test(x))?.replace(/\s+/g, " ").slice(0, 160) || null);
    checks.toolError = await t.page.evaluate(() => [...document.querySelectorAll('.result-summary[data-ok="false"]')].map((e) => e.textContent).join(" | ").slice(0, 160));
    await t.page.screenshot({ path: path.join(OUT, "L9-geo-fallback.png") });
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  await finish("live: open-data failure → web-search fallback", t, fake, checks);
}

// ---- case: quick second decision while the model answers the first; then Save run as simulation -------
if (run("race")) {
  const ref = REF["SC-TNG-FIRE"];
  const opts = [
    { variant_id: "V1", title: "Surge Timișoara and Sousse", description: "Ask both sister plants for extra volume.", residual_risk: "About a quarter of demand stays uncovered." },
    { variant_id: "V2", title: "Surge plus Kénitra tooling transfer", description: "Option A plus a fast-track qualification in Kénitra.", residual_risk: "A short gap remains." },
    { variant_id: "V3", title: "Kénitra transfer only", description: "No surge premiums.", residual_risk: "Leipzig runs short for more than a week." }
  ];
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Hypothesis: the plant is our supplier Tanger Harness Systems (S-TNG-HAR)." },
      { type: "tool_use", id: "toolu_r1", name: "sim_impact", input: ref.disruption }
    ] },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Recommendation: option B." },
      { type: "tool_use", id: "toolu_r2", name: "ui_propose_options", input: { recommended_variant_id: "V2", baseline_description: "Wait for Tangier.", options: opts } }
    ] },
    { usage: usage(), stop: "tool_use", delayMs: 1500, blocks: [
      { type: "text", text: "Option A rejected. Options B and C remain open." },
      { type: "tool_use", id: "toolu_r3", name: "ui_await_decision", input: {} }
    ], expect: (req, { check }) => { const r = JSON.parse(req.messages[req.messages.length - 1].content[0].content); check(r.decision === "rejected" && r.option_id === "V1", "first decision is the rejection"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Option B approved. Drafting the capacity request." },
      { type: "tool_use", id: "toolu_r4", name: "ui_draft_action", input: { type: "email", recipient: "Banat Cable Systems SRL, Timișoara (key account)", subject: "Capacity request", body: "Dear team,\n\nPlease raise deliveries by 20 %.\n\nKind regards\nPurchasing, Nordwerk Automotive GmbH" } },
      { type: "tool_use", id: "toolu_r5", name: "ui_draft_action", input: { type: "booking", recipient: "Contracted road carrier (framework agreement)", subject: "Trucks Timișoara → Leipzig", body: "Lane: Timișoara → Leipzig\nFrequency: 2 trucks per day" } },
      { type: "tool_use", id: "toolu_r6", name: "ui_await_approvals", input: {} }
    ], expect: (req, { check }) => { const r = JSON.parse(req.messages[req.messages.length - 1].content[0].content); check(r.decision === "approved" && r.option_id === "V2", "queued approval consumed by ui_await_decision"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_r7", name: "ui_final_report", input: { markdown: "## Tangier fire: response decision\n\n**Decision.** Option B approved.\n\n_Live agent run. Figures from the engine._" } }
    ] },
    { usage: usage({ output_tokens: 20 }), stop: "end_turn", blocks: [{ type: "text", text: "Done." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 20000 });
    await page.click('.option-card:nth-child(1) [data-action="reject"]');
    await page.waitForTimeout(150);
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 20000 });
    checks.bookingHasMockLine = await page.$$eval(".action-card .action-body", (els) => els.map((e) => e.textContent).some((x) => /Mock booking for demonstration/.test(x)));
    await page.click('button:has-text("Approve all")');
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#console button:has-text("Save run as simulation")')]);
    const text = await readFile(await dl.path(), "utf8");
    const def = JSON.parse(text.slice(text.indexOf("= {") + 2, text.lastIndexOf("};") + 1));
    const aw = def.steps.find((s) => s.awaitOption).awaitOption;
    checks.rejectedLine = aw.rejected.V1 || null;
    checks.branchStart = (aw.approved.V2 || []).slice(0, 3).map((s) => Object.keys(s)[0] + ":" + JSON.stringify(Object.values(s)[0]).slice(0, 50));
    checks.branchStates = (aw.approved.V2 || []).filter((s) => s.state).map((s) => s.state);
    checks.reportFooter = (aw.approved.V2 || []).find((s) => s.report)?.report.split("\n").slice(-1)[0];
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; await page.screenshot({ path: path.join(OUT, "L-race-fail.png") }); }
  await finish("live: quick second decision + recording", t, fake, checks);
}

// ---- case: Abort while a model call is in flight: nothing from the old run appears afterwards ------------
if (run("abort")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Check: I read the weather at Tangier." },
      { type: "tool_use", id: "toolu_a1", name: "geo_weather", input: { lat: 35.75, lon: -5.6 } }
    ] },
    { usage: usage(), stop: "end_turn", delayMs: 2500, blocks: [{ type: "text", text: "This late answer must never appear." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await page.waitForFunction(() => /Open-Meteo|weather|Data/.test(document.querySelector("#console").innerText) && document.querySelectorAll(".result-summary").length > 0, null, { timeout: 15000 });
    await page.click("#btn-abort");
    await page.waitForFunction(() => /Aborted/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 5000 });
    const before = await page.$$eval("#console .entry", (els) => els.length);
    await page.waitForTimeout(3500);
    const after = await page.$$eval("#console .entry", (els) => els.length);
    checks.entriesStable = before === after;
    checks.lateTextShown = await page.evaluate(() => /must never appear/.test(document.querySelector("#console").innerText));
    checks.status = (await page.textContent(".status-pill .text")).trim();
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  await finish("live: abort during a model call", t, null, checks);
}

// ---- case: key rejected mid-run (401) ------------------------------------------------------------------
if (run("badkey")) {
  const script = [{ error: { status: 401, type: "authentication_error", message: "invalid x-api-key" } }];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const checks = {};
  try {
    await startLive(t.page);
    await t.page.waitForFunction(() => /Error/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.keyForgotten = await t.page.evaluate(() => !sessionStorage.getItem("nav.anthropic.key"));
    checks.message = await t.page.evaluate(() => [...document.querySelectorAll("#console .entry")].map((e) => e.innerText).find((x) => /401/.test(x))?.replace(/\s+/g, " ").slice(0, 160) || null);
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  await finish("live: key rejected (401)", t, fake, checks);
}

// ---- case: live scan, nothing material ------------------------------------------------------------------
if (run("scan")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Live scan: I check the Rhine gauge, recent earthquakes near our clusters and open natural events in parallel." },
      { type: "tool_use", id: "toolu_s1", name: "geo_rhine_level", input: { station: "KAUB" } },
      { type: "tool_use", id: "toolu_s2", name: "geo_earthquakes", input: { min_magnitude: 4.5, days: 7 } },
      { type: "tool_use", id: "toolu_s3", name: "geo_natural_events", input: { days: 14 } }
    ], expect: (req, { check }) => { check(req.messages[0].content.includes("Supplier footprint"), "scan opener carries the footprint"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "No material disruption intersects our network today." },
      { type: "tool_use", id: "toolu_s4", name: "ui_final_report", input: { outcome: "no_material_disruption", markdown: "## Live scan: no material disruption\n\nChecked the Rhine gauge, earthquakes and natural events near Nordwerk's clusters. Nothing material.\n\n*Live agent run.*" } }
    ], expect: (req, { check }) => {
      const last = req.messages[req.messages.length - 1];
      const rhine = JSON.parse(last.content[0].content);
      check(rhine.gauge_cm === 14 && typeof rhine.estimated_barge_capacity_pct === "number", `rhine tool result (got ${JSON.stringify(rhine).slice(0, 120)})`);
      check(rhine.last_7_days?.trend === "falling", "rhine trend falling");
      const eq = JSON.parse(last.content[1].content);
      check(eq.within_300_km_of_nordwerk.length === 1 && eq.within_300_km_of_nordwerk[0].near_nordwerk.some((n) => n.id.startsWith("S-HSC") || n.id.startsWith("S-TAO") || n.id.startsWith("S-KHH") || n.id.startsWith("N-KHH") || n.id.startsWith("N-TPE")), `quake near Taiwan sites (got ${JSON.stringify(eq.within_300_km_of_nordwerk).slice(0, 200)})`);
    } },
    { usage: usage({ output_tokens: 30 }), stop: "end_turn", blocks: [{ type: "text", text: "Scan complete." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const checks = {};
  try {
    await startLive(t.page, { scan: true });
    await t.page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.endLine = await t.page.evaluate(() => [...document.querySelectorAll("#console .entry")].map((e) => e.innerText).slice(-1)[0]?.replace(/\s+/g, " "));
    await t.page.screenshot({ path: path.join(OUT, "L6-scan-nothing.png") });
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  await finish("live: scan with no findings", t, fake, checks);
}

await browser.close();
await close();

// What each case must show, beyond zero protocol violations and zero page, console or CSP errors.
const EXPECT = {
  "live: full Tangier run (mock API)": (c) => [
    [c.badge === "LIVE", "LIVE badge"],
    [c.optionTotals?.length === 4, "three options plus do nothing"],
    [/left with option B/.test(c.payoffVar || ""), "value-at-risk tile shows the payoff of the approved option"],
    [c.draftFooter, "every draft carries the approval footer"],
    [c.status === "Done" && c.retryNotice, "run ends Done after a visible retry"],
    [c.auditMode === "live" && c.auditNoKey && c.auditNoSignature && c.auditFirstHasSystem, "audit export: live, no key, no signatures, system prompt logged"],
    [c.costMatches, "cost meter equals the usage maths"],
    [c.simNoKey && c.simHasRecordedSource && c.simReportRewritten, "recording is valid and carries no secrets"],
    [c.replayBadge === "SIMULATION" && /recorded on/.test(c.replayWatermark || ""), "replay labelled as a recorded run"],
    [/Recorded live run/.test(c.replayReport || "") && /simulation\|recorded/.test(c.replayAudit || ""), "replay report and audit marked"],
    [!!c.replayOtherPath, "a decision the live run did not take ends the replay gracefully"]
  ],
  "live: web search disabled → fallback": (c) => [
    [c.notice && c.nudgeNotice, "fallback notice and nudge note in the console"],
    [/^true\|/.test(c.scanDisabled || ""), "Live scan disabled"]
  ],
  "live: open-data failure → web-search fallback": (c) => [
    [!!c.fallbackNotice && /503/.test(c.toolError || ""), "console names the failure and the fallback"]
  ],
  "live: quick second decision + recording": (c) => [
    [c.bookingHasMockLine, "booking carries the mock line"],
    [c.rejectedLine === "Option A rejected. Options B and C remain open.", "rejection line recorded"],
    [/Recorded live run/.test(c.reportFooter || ""), "report footer rewritten for replay"]
  ],
  "live: abort during a model call": (c) => [[c.entriesStable && c.lateTextShown === false && c.status === "Aborted", "nothing appears after Abort"]],
  "live: key rejected (401)": (c) => [[c.keyForgotten && /401/.test(c.message || ""), "key removed and 401 explained"]],
  "live: scan with no findings": (c) => [[/no material disruption/.test(c.endLine || "") && /Run facts:/.test(c.endLine || ""), "honest end with run facts"]]
};

await writeFile(path.join(OUT, "live-results.json"), JSON.stringify(results, null, 2));
let passed = 0;
for (const r of results) {
  const problems = [
    ...(r.checks.FAILED ? [`exception: ${r.checks.FAILED}`] : []),
    ...(EXPECT[r.name]?.(r.checks) || []).filter(([ok]) => !ok).map(([, msg]) => msg),
    ...r.violations.map((v) => `protocol: ${v}`),
    ...(r.remainingScript ? [`${r.remainingScript} scripted responses were never requested`] : []),
    ...r.pageErrors.map((e) => `page error: ${e}`),
    ...r.consoleErrors.map((e) => `console error: ${e}`),
    ...r.csp.map((e) => `CSP: ${e}`)
  ];
  if (!problems.length) passed += 1;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${r.name}`);
  for (const p of problems) console.log(`      - ${String(p).slice(0, 300)}`);
}
console.log(`\n${passed}/${results.length} live cases passed. Screenshots and downloads: ${OUT}`);
process.exit(passed === results.length ? 0 : 1);

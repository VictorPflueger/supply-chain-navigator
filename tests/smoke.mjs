// Smoke tests of the main flows and the failure modes of loading:
//   sim          a full Simulation run (Tangier) with options, outbox, summary and audit export
//   live         key check (401, then accepted), a model that keeps ending its turn early
//   diag         Diagnostics dialog, custom what-if blocks Simulation
//   intro        first visit opens the intro window; "How it works" reopens it; Start agent leads to the mode choice
//   byline       Vici's byline in the drawer bar: Built by, the portrait, LinkedIn's logo and the
//                website as 44 px links in new tabs; no link to the source code anywhere in the app
//   cdn-down     both CDNs unreachable: Leaflet loads from vendor/
//   no-leaflet   no Leaflet anywhere: map notice, the rest still works
//   file         opened from file://: the page explains how to start a server
//   missing-data a data file is missing: the boot screen names it
// Usage: node tests/smoke.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, fulfilLeaflet, NETWORK_NOISE, MOCK_KEY, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("smoke");
const { base: BASE, blockLocal, close } = await serveStatic(APP_ROOT, 8765);
const browser = await launchBrowser();
const results = [];

async function newPage({ cdn = "ok", anthropic = null, intro = false, viewport = { width: 1920, height: 1080 } } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  if (!intro) await context.addInitScript(SKIP_INTRO);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample || ""}`.trim()));
  });
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = new URL(route.request().url());
    if (cdn === "ok" && await fulfilLeaflet(route)) return;
    if (u.host === "api.anthropic.com" && anthropic) return anthropic(route);
    external.push(`${route.request().method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const log = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") log.consoleErrors.push(m.text()); });
  return { context, page, log, external };
}

/** expectations: [[condition, message], …]; allowConsole: console errors that are part of the case. */
async function finish(name, { context, page, log }, checks, expectations, allowConsole = null) {
  const csp = await page.evaluate(() => window.__csp || []).catch(() => ["<page gone>"]);
  const consoleErrors = log.consoleErrors.filter((t) => !NETWORK_NOISE.test(t) && !(allowConsole && allowConsole.test(t)));
  const problems = expectations.filter(([ok]) => !ok).map(([, msg]) => msg);
  if (checks.FAILED) problems.unshift(`exception: ${checks.FAILED}`);
  const ok = !problems.length && !log.pageErrors.length && !consoleErrors.length && !csp.length;
  results.push({ name, ok, problems, checks, pageErrors: log.pageErrors, consoleErrors, csp });
  await context.close();
}

const shot = (page, file) => page.screenshot({ path: path.join(OUT, file) });
const boot = async (page) => { await page.goto(BASE); await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 }); };

// ---- sim: full Tangier simulation ---------------------------------------------------------------
if (wanted("sim")) {
  const t = await newPage({ cdn: "ok" });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForTimeout(800);
    checks.bootRemoved = (await page.$("#boot")) === null;
    checks.badgeIdle = (await page.textContent("#mode-badge")).trim();
    checks.disclosure = (await page.textContent(".ai-disclosure")).replace(/\s+/g, " ").trim();
    checks.fontsLoaded = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").length; });
    await shot(page, "01-idle.png");
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await shot(page, "02-mode-choice.png");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForTimeout(2500);
    checks.badgeSim = (await page.textContent("#mode-badge")).trim();
    checks.watermarkVisible = await page.isVisible(".sim-watermark");
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 180000 });
    await page.waitForTimeout(800);
    await shot(page, "03-options.png");
    checks.optionCards = await page.$$eval(".option-card", (els) => els.map((e) => `${e.dataset.kind}:${e.querySelector(".option-total .value")?.textContent}`));
    checks.approveButtonsVisibleWithoutScroll = await page.evaluate(() => {
      const body = document.querySelector(".drawer-body").getBoundingClientRect();
      return [...document.querySelectorAll(".option-actions button")].every((b) => { const r = b.getBoundingClientRect(); return r.top >= body.top && r.bottom <= body.bottom; });
    });
    checks.legendInsideMap = await page.evaluate(() => {
      const m = document.querySelector(".map-panel").getBoundingClientRect();
      const l = document.querySelector(".legend").getBoundingClientRect();
      return l.top >= m.top - 1 && l.bottom <= m.bottom + 1;
    });
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 120000 });
    await page.waitForTimeout(600);
    await shot(page, "04-outbox.png");
    checks.drafts = await page.$$eval(".action-card", (els) => els.length);
    await page.click('button:has-text("Approve all")');
    await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 120000 });
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    checks.statusEnd = (await page.textContent(".status-pill .text")).trim();
    checks.startLabel = (await page.textContent("#btn-start")).trim();
    checks.lastEntryInView = await page.evaluate(() => {
      const log = document.querySelector("#console .log");
      const last = log.lastElementChild.getBoundingClientRect();
      const box = log.getBoundingClientRect();
      return last.bottom <= box.bottom + 2 && last.top >= box.top - 2;
    });
    checks.replayFacts = await page.$$eval("#console .entry", (els) => /Replay facts:/.test(els.slice(-1)[0]?.textContent || ""));
    await shot(page, "05-done.png");
    await page.click('button:has-text("Open management summary")');
    await page.waitForSelector(".report-modal", { timeout: 5000 });
    checks.reportHasSimNote = (await page.textContent(".report-modal")).includes("Simulated run");
    await shot(page, "06-report.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.click("#tab-audit");
    await page.waitForTimeout(400);
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export JSON")')]);
    const audit = JSON.parse(await readFile(await download.path(), "utf8"));
    checks.auditFile = download.suggestedFilename();
    checks.auditMode = audit.mode;
    checks.auditRunFacts = !!audit.run_facts;
    checks.auditNoKey = !JSON.stringify(audit).includes("sk-ant");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "sim-fail.png");
  }
  await finish("sim: full Simulation run", t, checks, [
    [checks.bootRemoved, "boot screen should be removed"],
    [checks.badgeIdle === "No run active", "idle badge"],
    [/You are interacting with an AI system/.test(checks.disclosure || ""), "AI disclosure must be visible"],
    [checks.badgeSim === "SIMULATION" && checks.watermarkVisible, "SIMULATION badge and watermark"],
    [checks.optionCards?.length === 4 && checks.optionCards.some((c) => c.startsWith("baseline:")), "three options plus do nothing"],
    [checks.approveButtonsVisibleWithoutScroll && checks.legendInsideMap, "options and legend fit at 1080p"],
    [checks.drafts > 0, "approval must produce drafts"],
    [checks.statusEnd === "Done" && checks.startLabel === "New run", "run ends Done"],
    [checks.lastEntryInView && checks.replayFacts, "console ends on the Replay facts line"],
    [checks.reportHasSimNote, "summary marked as simulated"],
    [checks.auditMode === "simulation" && checks.auditRunFacts && checks.auditNoKey, "audit export: simulation mode, run facts, no key"]
  ]);
}

// ---- live: key check and a model that ends its turn early -----------------------------------------
if (wanted("live")) {
  let models = 0;
  let messageCalls = 0;
  const t = await newPage({
    cdn: "ok",
    anthropic: async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
      if (req.method() === "POST" && new URL(req.url()).pathname === "/v1/messages") {
        // Ends its turn without finishing the workflow: Navigator nudges it twice, then stops.
        messageCalls += 1;
        const ev = (e, d) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
        const body = [
          ev("message_start", { type: "message_start", message: { id: `msg_${messageCalls}`, model: "claude-sonnet-5-5", role: "assistant", content: [], usage: { input_tokens: 900, output_tokens: 1 } } }),
          ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
          ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Shall I continue with the analysis?" } }),
          ev("content_block_stop", { type: "content_block_stop", index: 0 }),
          ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } }),
          ev("message_stop", { type: "message_stop" })
        ].join("");
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body });
      }
      models += 1;
      if (models === 1) return route.fulfill({ status: 401, headers: cors, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
    }
  });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    await page.fill("#api-key-input", MOCK_KEY);
    checks.inputMasked = (await page.getAttribute("#api-key-input", "type")) === "password";
    await shot(page, "10-key-dialog.png");
    await page.click('button:has-text("Check key and continue")');
    await page.waitForFunction(() => /401/.test(document.getElementById("api-key-msg")?.textContent || ""), null, { timeout: 8000 });
    checks.rejectMessage = (await page.textContent("#api-key-msg")).trim();
    await page.click('button:has-text("Check key and continue")');
    await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
    await page.waitForFunction(() => /Stopped|Done|Error/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.messageCalls = messageCalls;
    checks.nudges = await page.evaluate(() => [...document.querySelectorAll("#console .entry")].filter((e) => /asked it to continue/.test(e.textContent)).length);
    checks.badgeLive = (await page.textContent("#mode-badge")).trim();
    checks.keyInSession = await page.evaluate(() => Boolean(sessionStorage.getItem("nav.anthropic.key")));
    checks.localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    checks.statusEnd = (await page.textContent(".status-pill .text")).trim();
    checks.keyNotInDom = !(await page.content()).includes("MOCKKEY");
    await shot(page, "11-live-stopped.png");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "live-fail.png");
  }
  await finish("live: key check and early end", t, checks, [
    [checks.inputMasked, "key input must be masked"],
    [/401/.test(checks.rejectMessage || ""), "a rejected key must say 401"],
    [checks.messageCalls === 3 && checks.nudges === 2, "two nudges, then stop"],
    [checks.statusEnd === "Stopped" && checks.badgeLive === "LIVE", "run ends Stopped in Live mode"],
    [checks.keyInSession && !(checks.localStorageKeys || []).some((k) => /key/i.test(k)) && checks.keyNotInDom, "key in session storage only"]
  ]);
}

// ---- diag: Diagnostics and custom what-if --------------------------------------------------------
if (wanted("diag")) {
  const t = await newPage({ cdn: "ok" });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.click("#btn-diagnostics");
    await page.waitForFunction(() => document.querySelectorAll('.diag-status[data-s="pass"]').length >= 3, null, { timeout: 10000 });
    await shot(page, "12-diagnostics.png");
    checks.localRows = await page.$$eval(".diag-table tbody tr", (rows) => rows.map((r) => `${r.querySelector("strong")?.textContent}:${r.querySelector(".diag-status")?.dataset.s}`).filter((x) => /World|privacy|Leaflet/.test(x)));
    checks.footer = await page.$eval(".vc-dialog__footer .dialog-note", (e) => e.textContent.trim());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.click("#dd-scenario");
    await page.click('.vc-menu__item[data-id="custom"]');
    await page.waitForSelector("#custom-scenario");
    await page.fill("#custom-scenario", "A cyberattack has stopped the IT systems of a major Hungarian logistics provider for three days.");
    await page.click('button:has-text("Use this scenario")');
    await page.waitForTimeout(300);
    checks.scenarioLabel = (await page.textContent("#dd-scenario")).replace(/\s+/g, " ").trim();
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    checks.simBlocked = await page.getAttribute('.mode-card[data-mode="simulation"]', "aria-disabled");
    await shot(page, "13-custom-mode.png");
    await page.keyboard.press("Escape");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
  }
  await finish("diag: Diagnostics and custom what-if", t, checks, [
    [(checks.localRows || []).length === 3 && checks.localRows.every((x) => x.endsWith(":pass")), "world, Leaflet and privacy rows pass"],
    [/^Navigator \d+\.\d+\.\d+/.test(checks.footer || ""), "Diagnostics footer shows the version"],
    [/Custom/.test(checks.scenarioLabel || ""), "custom what-if selected"],
    [checks.simBlocked === "true", "custom what-ifs cannot run as Simulation"]
  ]);
}

// ---- intro: first visit opens the intro window; "How it works" reopens it ----------------------------
if (wanted("intro")) {
  const t = await newPage({ cdn: "ok", intro: true });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForSelector(".intro-modal", { timeout: 5000 });
    checks.autoOpened = true;
    checks.title = (await page.textContent(".intro-modal h2")).trim();
    checks.steps = await page.$$eval(".intro-step-title", (els) => els.map((e) => e.textContent));
    checks.values = await page.$$eval(".intro-value strong", (els) => els.map((e) => e.textContent));
    checks.words = await page.$eval(".intro-modal", (e) => e.innerText.split(/\s+/).filter(Boolean).length);
    checks.fits = await page.$eval(".intro-modal", (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    await page.waitForTimeout(200);
    checks.focus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await shot(page, "20-intro.png");
    await page.click('.intro-modal .vc-dialog__footer button:has-text("Close")');
    await page.waitForSelector(".intro-modal", { state: "detached", timeout: 3000 });
    checks.flag = await page.evaluate(() => localStorage.getItem("nav.introSeen"));
    await page.reload();
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await page.waitForTimeout(800);
    checks.reopenedOnReload = await page.isVisible(".intro-modal");
    checks.buttonLabel = (await page.textContent("#btn-about")).trim();
    await page.click("#btn-about");
    await page.waitForSelector(".intro-modal", { timeout: 3000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector(".intro-modal", { state: "detached", timeout: 3000 });
    await page.click("#btn-about");
    await page.click('.intro-modal .vc-dialog__footer button:has-text("Start agent")');
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.startOpensModeChoice = await page.$$eval(".mode-card", (els) => els.map((e) => e.dataset.mode).join(","));
    // During a run the window only explains: Close is its only button and the run carries on.
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForTimeout(1200);
    await page.click("#btn-about");
    await page.waitForSelector(".intro-modal", { timeout: 3000 });
    checks.duringRunButtons = await page.$$eval(".intro-modal .vc-dialog__footer button", (els) => els.map((e) => e.textContent.trim()));
    await page.keyboard.press("Escape");
    checks.statusAfterClose = (await page.textContent(".status-pill .text")).trim();
    await page.click("#btn-abort");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "intro-fail.png");
  }
  await finish("intro: first visit, reopen, start", t, checks, [
    [checks.autoOpened && checks.title === "How Navigator works", "the intro opens by itself on the first visit"],
    [checks.steps?.join(",") === "Spot,Check,Calculate,Propose,Prepare" && checks.values?.length === 3, "five steps and three value points"],
    [checks.words <= 200, `the intro stays brief (${checks.words} words)`],
    [checks.fits, "the intro fits the screen"],
    [checks.focus === "Start agent", "the main button has focus"],
    [checks.flag === "1" && checks.reopenedOnReload === false, "once closed, it does not open again on reload"],
    [checks.buttonLabel === "How it works", "header button labelled How it works"],
    [checks.startOpensModeChoice === "simulation,live", "Start agent in the intro opens the mode choice"],
    [JSON.stringify(checks.duringRunButtons) === '["Close"]' && /Scanning|Diagnosing|Verifying|Simulating|Options/.test(checks.statusAfterClose || ""), "during a run: Close only, and the run carries on"]
  ]);
}

// ---- byline: Vici's byline in the drawer bar ---------------------------------------------------------
if (wanted("byline")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForFunction(() => [...document.querySelectorAll(".drawer-tabs .vc-byline img")].every((i) => i.complete), null, { timeout: 5000 });
    checks.byline = await page.evaluate(() => {
      const b = document.querySelector(".drawer-tabs .vc-byline");
      if (!b) return null;
      const img = (sel) => b.querySelector(sel);
      return {
        label: b.querySelector(".vc-byline__label")?.textContent,
        name: b.querySelector(".vc-byline__person .vc-byline__name")?.textContent,
        portrait: img(".vc-byline__person .vc-avatar.vc-avatar--xs > img")?.getAttribute("src"),
        portraitShown: img(".vc-avatar > img")?.naturalWidth || 0,
        mark: img(".vc-byline__links a .vc-platform-mark")?.getAttribute("src"),
        markShown: img(".vc-byline__links a .vc-platform-mark")?.naturalWidth || 0,
        globe: !!b.querySelector('.vc-byline__links a .vc-icon.vc-icon--globe-hex[aria-hidden="true"]'),
        links: [...b.querySelectorAll("a")].map((a) => {
          const r = a.getBoundingClientRect();
          return { href: a.getAttribute("href"), target: a.target, rel: a.rel, label: a.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height) };
        })
      };
    });
    // The app links to its author, never to its own source code.
    checks.sourceLinks = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((href) => /github\.com/i.test(href)));
    await shot(page, "18-byline.png");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "byline-fail.png");
  }
  const b = checks.byline || {};
  const links = b.links || [];
  await finish("byline: Vici's byline in the drawer bar", t, checks, [
    [b.label === "Built by" && b.name === "Victor Pflüger", "Built by, then Victor's name"],
    [b.portrait === "vici/assets/brand/portrait-96.jpg" && b.portraitShown > 0, "his hexagon portrait, Vici's file"],
    [b.mark === "vici/assets/marks/linkedin.png" && b.markShown > 0 && b.globe, "LinkedIn's own logo file and the website's globe"],
    [links.length === 2 && links[0].href === "https://www.linkedin.com/in/victorpflueger" && links[1].href === "https://victorpflueger.github.io/VIP/index.html"
      && links.every((l) => l.target === "_blank" && l.rel === "author noopener" && /\(opens in a new tab\)$/.test(l.label || "")), "LinkedIn and the website, each in a new tab and named for screen readers"],
    [links.length === 2 && links.every((l) => l.w >= 44 && l.h >= 44), `both links are 44 px targets (${links.map((l) => `${l.w}×${l.h}`).join(", ")})`],
    [Array.isArray(checks.sourceLinks) && !checks.sourceLinks.length, `no link to the source code in the app (${checks.sourceLinks})`]
  ]);
}

// ---- cdn-down: both CDNs unreachable → local copy ---------------------------------------------------
if (wanted("cdn-down")) {
  const t = await newPage({ cdn: "down" });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForTimeout(800);
    checks.leafletPresent = await page.evaluate(() => Boolean(window.L));
    checks.mapReady = await page.isVisible(".leaflet-container");
    await shot(page, "14-cdn-down.png");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  await finish("cdn-down: Leaflet from vendor/", t, checks, [[checks.leafletPresent && checks.mapReady, "map must load from the local copy"]]);
}

// ---- no-leaflet: no Leaflet at all → map notice, app still works ----------------------------------------
if (wanted("no-leaflet")) {
  blockLocal.add("/vendor/");
  const t = await newPage({ cdn: "down" });
  const { page } = t;
  const checks = {};
  try {
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 40000 });
    checks.fallbackShown = await page.isVisible(".map-fallback");
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForTimeout(5000);
    checks.consoleEntries = await page.$$eval("#console .entry", (els) => els.length);
    await shot(page, "15-no-leaflet.png");
    await page.click("#btn-abort");
    await page.waitForTimeout(500);
    checks.statusAfterAbort = (await page.textContent(".status-pill .text")).trim();
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  blockLocal.delete("/vendor/");
  await finish("no-leaflet: map notice, app still runs", t, checks, [
    [checks.fallbackShown, "map notice shown"],
    [checks.consoleEntries > 3, "simulation runs without a map"],
    [checks.statusAfterAbort === "Aborted", "Abort works"]
  ]);
}

// ---- file: opened from disk ---------------------------------------------------------------------------
if (wanted("file")) {
  const t = await newPage({ cdn: "down" });
  const { page } = t;
  const checks = {};
  try {
    await page.goto(`file://${APP_ROOT}/index.html`);
    await page.waitForTimeout(7000);
    checks.bootPresent = (await page.$("#boot")) !== null;
    checks.helpVisible = await page.evaluate(() => getComputedStyle(document.querySelector(".boot-help")).visibility === "visible");
    await shot(page, "16-file-protocol.png");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  await finish("file: page explains how to start a server", t, checks, [[checks.bootPresent && checks.helpVisible, "boot help visible"]], /blocked by CORS policy|Cross origin requests/);
}

// ---- missing-data: a data file did not deploy ------------------------------------------------------------
if (wanted("missing-data")) {
  blockLocal.add("/data/sim_runs.js");
  const t = await newPage({ cdn: "ok" });
  const { page } = t;
  const checks = {};
  try {
    await page.goto(BASE);
    await page.waitForSelector('#boot[data-state="failed"]', { timeout: 15000 });
    checks.detail = (await page.textContent("#boot-detail")).trim();
    await shot(page, "17-missing-data.png");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  blockLocal.delete("/data/sim_runs.js");
  await finish("missing-data: boot screen names the file", t, checks, [[/data\/sim_runs\.js/.test(checks.detail || ""), "missing file named"]], /Start-up failed/);
}

await browser.close();
await close();
await writeFile(path.join(OUT, "smoke-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
  if (r.pageErrors.length || r.consoleErrors.length || r.csp.length) console.log(`      errors: ${JSON.stringify({ page: r.pageErrors, console: r.consoleErrors, csp: r.csp }).slice(0, 400)}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} smoke cases passed. Screenshots: ${OUT}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);

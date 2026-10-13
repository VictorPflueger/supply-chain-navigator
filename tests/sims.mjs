// Plays all six simulation scripts in the browser with different decision paths and checks the
// integrity rules: no unresolved placeholders, SIMULATION markings, no network beyond map tiles,
// KPI and map payoff after the decision, audit export marked as simulation.
// Usage: node tests/sims.mjs [scenarioId…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { APP_ROOT, ONLY, outDir, launchBrowser, serveStatic, fulfilLeaflet, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("sims");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8768);
const browser = await launchBrowser();

// Decision plans: options to reject (in order) before the final decision, and draft decisions.
const PLANS = {
  "SC-RTM-STRIKE": { reject: ["V3"], approve: "V1", drafts: "reject-last" },
  "SC-RHINE-LOW": { reject: [], approve: "V1", drafts: "approve-all" },
  "SC-HSC-QUAKE": { reject: ["V1"], approve: "V2", drafts: "approve-all" },
  "SC-STYRIA-FLOOD": { reject: [], approve: "baseline", drafts: "approve-all" },
  "SC-REDSEA": { reject: ["V1", "V2", "V3"], approve: "baseline", drafts: "approve-all" },
  "SC-TNG-FIRE": { reject: ["V2"], approve: "V1", drafts: "reject-last" }
};
const AFFECTED_PLANTS = { "SC-HSC-QUAKE": ["PL-GYR", "PL-LEJ"] };

const results = [];
for (const [id, plan] of Object.entries(PLANS)) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  results.push(await playScenario(id, plan));
}
await writeFile(path.join(OUT, "sims-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`\n# ${r.id}: ${r.ok ? "PASS" : "FAIL"}`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  if (r.problems.length) console.log("  PROBLEMS:", r.problems);
  console.log(`  pageErrors: ${JSON.stringify(r.pageErrors)} consoleErrors: ${JSON.stringify(r.consoleErrors)} csp: ${JSON.stringify(r.csp)} network: ${JSON.stringify(r.network)}`);
}
await browser.close();
await close();
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} simulations passed. Screenshots: ${OUT}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);

async function playScenario(id, plan) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const network = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = new URL(route.request().url());
    if (await fulfilLeaflet(route)) return;
    if (!/tile\.openstreetmap\.org|basemaps\.cartocdn\.com/.test(u.host)) network.push(`${route.request().method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) consoleErrors.push(m.text()); });
  const checks = {};
  const problems = [];
  const short = id.replace("SC-", "").toLowerCase();
  try {
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await page.click('button[aria-label="Replay speed ×4"]');
    // pick the scenario
    await page.click("#dd-scenario");
    await page.click(`.menu-item[data-id="${id}"]`);
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForTimeout(1500);
    checks.badge = (await page.textContent("#mode-badge")).trim();
    checks.watermark = await page.isVisible(".sim-watermark");
    const t0 = Date.now();
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 240000 });
    checks.secondsToOptions = Math.round((Date.now() - t0) / 1000);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${short}-1-options.png`) });
    checks.options = await page.$$eval(".option-card", (els) => els.map((e) => `${e.querySelector(".option-letter")?.textContent}:${e.querySelector(".option-total .value")?.textContent}`));
    checks.kpiBefore = await page.$$eval(".kpi", (els) => els.slice(0, 2).map((e) => `${e.dataset.tone}|${e.innerText.replace(/\s+/g, " ").trim()}`));
    const letterOf = (v) => ({ V1: "A", V2: "B", V3: "C" }[v]);
    for (const v of plan.reject) {
      const n0 = await page.$$eval(".entry", (els) => els.length);
      await page.click(`.option-card[aria-label^="Option ${letterOf(v)}:"] .btn-reject`);
      await page.waitForFunction((n) => document.querySelectorAll(".entry").length > n + 1, n0, { timeout: 30000 });
      await page.waitForTimeout(400);
    }
    if (plan.approve === "baseline") {
      await page.click('.option-card[data-kind="baseline"] .option-actions .btn');
    } else {
      await page.click(`.option-card[aria-label^="Option ${letterOf(plan.approve)}:"] .btn-approve`);
    }
    await page.waitForTimeout(1500);
    checks.kpiAfter = await page.$$eval(".kpi", (els) => els.slice(0, 3).map((e) => `${e.dataset.tone}|${e.innerText.replace(/\s+/g, " ").trim()}`));
    checks.plants = await page.$$eval(".plant-marker", (els) => els.map((e) => `${e.querySelector(".plant-label")?.textContent}:${e.dataset.state}`));
    // drafts
    await page.waitForSelector(".action-card[data-status='pending']", { timeout: 120000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
    await page.screenshot({ path: path.join(OUT, `${short}-2-outbox.png`) });
    const pending = await page.$$(".action-card[data-status='pending']");
    checks.drafts = pending.length;
    for (let i = 0; i < pending.length; i++) {
      const cards = await page.$$(".action-card[data-status='pending']");
      const last = i === pending.length - 1;
      const btn = await cards[0].$(plan.drafts === "reject-last" && last && pending.length > 1 ? ".btn-reject" : ".btn-approve");
      await btn.click();
      await page.waitForTimeout(150);
    }
    await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 120000 });
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `${short}-3-done.png`) });
    checks.status = (await page.textContent(".status-pill .text")).trim();
    checks.kpiEnd = await page.$$eval(".kpi", (els) => els.map((e) => `${e.dataset.tone}|${e.innerText.replace(/\s+/g, " ").trim()}`));
    const consoleText = await page.innerText("#console");
    checks.labels = ["Hypothesis:", "Check:", "Confirmed:", "Revised:", "Impact:", "Recommendation:"].filter((l) => consoleText.includes(l));
    checks.phases = [...consoleText.matchAll(/Phase: ([A-Za-z ]+)/g)].map((m) => m[1].trim());
    checks.representativeSources = (consoleText.match(/\(representative\)/g) || []).length;
    // report modal
    await page.click('button:has-text("Open management summary")');
    await page.waitForSelector(".report-modal", { timeout: 5000 });
    const reportText = await page.innerText(".report-modal");
    checks.reportHead = reportText.split("\n").filter(Boolean).slice(0, 2).join(" | ");
    checks.reportMarked = /Simulated run/.test(reportText);
    await page.screenshot({ path: path.join(OUT, `${short}-4-report.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // outbox text
    const outboxText = await page.$eval("#panel-outbox", (el) => el.textContent);
    // unresolved placeholders anywhere
    const all = `${consoleText}\n${reportText}\n${outboxText}\n${await page.innerText("header")}`;
    const unresolved = all.match(/\{\{[^}]*\}\}/g);
    if (unresolved) problems.push(`unresolved placeholders: ${[...new Set(unresolved)].join(", ")}`);
    if (/Live agent run/.test(all)) problems.push("text claims a live run");
    // audit export
    await page.click("#tab-audit");
    await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click('button:has-text("Export JSON")')]);
    const audit = JSON.parse(await readFile(await dl.path(), "utf8"));
    checks.auditMode = audit.mode;
    checks.auditSaveDisabled = await page.$eval('button:has-text("Save run as simulation")', (b) => b.getAttribute("aria-disabled"));
    checks.optionDecisions = audit.events.filter((e) => e.type === "option_decision").map((e) => `${e.payload.decision} ${e.payload.option_id}`);
    checks.actionDecisions = audit.events.filter((e) => e.type === "action_decision").map((e) => e.payload.decision).join(",");
    // expectations
    if (checks.badge !== "SIMULATION") problems.push("badge");
    if (!checks.watermark) problems.push("watermark hidden");
    if (checks.status !== "Done") problems.push(`status ${checks.status}`);
    if (checks.auditMode !== "simulation") problems.push("audit mode");
    if (!checks.reportMarked) problems.push("report not marked as simulated");
    for (const l of ["Hypothesis:", "Confirmed:", "Revised:", "Recommendation:"]) if (!checks.labels.includes(l)) problems.push(`missing ${l}`);
    if (network.length) problems.push(`network beyond tiles: ${network.join(", ")}`);
    const expectRejected = plan.reject.length;
    if (checks.optionDecisions.filter((d) => d.startsWith("rejected")).length !== expectRejected) problems.push("rejections not recorded");
    if (plan.approve !== "baseline" && !/resolved|at-risk/.test(checks.kpiAfter[0])) problems.push(`VaR tile did not show the payoff: ${checks.kpiAfter[0]}`);
  } catch (e) {
    problems.push(`exception: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, `${short}-fail.png`) }).catch(() => {});
  }
  const csp = await page.evaluate(() => window.__csp || []).catch(() => []);
  await context.close();
  const ok = !problems.length && !pageErrors.length && !consoleErrors.length && !csp.length;
  return { id, ok, checks, problems, pageErrors, consoleErrors, csp, network: [...new Set(network)] };
}

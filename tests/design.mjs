// Design checks and review captures (DESIGN.md §8):
//   states   the colour grammar in the running app: map strokes and legend use the state tokens, the
//            status pill and the progress rail name the human step ("Your decision", then "Your
//            approval"), the rail ends with every step done, and the AI labels open and close
//   review   screenshots for a design review: the options at 1920×1080 as rendered and under a
//            simulated projector washout, and the finished run as seen with protanopia,
//            deuteranopia and tritanopia (Machado et al. 2009 matrices, applied in linear RGB)
// Usage: node tests/design.mjs [case…]
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, fulfilLeaflet, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("design");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8770);
const browser = await launchBrowser();
const results = [];

// Severity 1.0 (dichromacy). The same matrices as the palette check in tools/palette.mjs.
const CVD = {
  "Normal vision": null,
  Protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  Deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  Tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
// A projector in a lit room: lower contrast, brighter, less saturated.
const WASHOUT = "contrast(0.62) brightness(1.18) saturate(0.8)";

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(SKIP_INTRO);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    if (await fulfilLeaflet(route)) return;
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  return { context, page, errors };
}

const pillText = (page) => page.$eval(".status-pill .text", (e) => e.textContent.trim());
const waitPill = (page, re, timeout = 30000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.querySelector(".status-pill .text")?.textContent || ""), re.source, { timeout });
const railNow = (page) => page.evaluate(() => {
  const cur = document.querySelector('.rail-step[aria-current="step"]');
  return {
    step: cur?.dataset.step || null,
    state: cur?.dataset.state || null,
    turn: cur?.querySelector(".rail-turn")?.textContent.trim() || null,
    states: [...document.querySelectorAll(".rail-step")].map((s) => s.dataset.state)
  };
});

async function toOptions(page) {
  await page.click('button[aria-label="Replay speed ×4"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card");
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
}
async function toDrafts(page) {
  await page.click('.option-card[data-recommended="true"] .btn-approve');
  await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
}
async function toDone(page) {
  await page.click('button:has-text("Approve all")');
  await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 60000 });
}

if (wanted("states")) {
  const { context, page, errors } = await newPage();
  const problems = [];
  try {
    await toOptions(page);
    await waitPill(page, /^Awaiting your decision$/);
    let rail = await railNow(page);
    if (rail.step !== "propose" || rail.state !== "yours" || rail.turn !== "Your decision") problems.push(`options: rail shows ${JSON.stringify(rail)}`);

    // The map draws states with the state tokens, and the legend shows the same colours.
    const colours = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const token = (n) => cs.getPropertyValue(n).trim().toLowerCase();
      const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
      const out = { mismatches: [], counted: {} };
      for (const [st, name] of [["affected", "--affected"], ["at_risk", "--at-risk"], ["resolved", "--resolved"]]) {
        const want = token(name);
        const paths = [...document.querySelectorAll(`.leaflet-interactive.state-${st}`)];
        out.counted[st] = paths.length;
        for (const p of paths) if ((p.getAttribute("stroke") || "").toLowerCase() !== want) out.mismatches.push(`${st} path stroke ${p.getAttribute("stroke")} ≠ ${want}`);
      }
      const legend = [...document.querySelectorAll(".legend-group")].find((g) => /Status/.test(g.textContent));
      const rows = legend ? [...legend.querySelectorAll(".legend-row")] : [];
      for (const [label, name] of [["Affected", "--affected"], ["At risk", "--at-risk"], ["Resolved", "--resolved"]]) {
        const row = rows.find((r) => r.textContent.trim().startsWith(label));
        const got = row ? getComputedStyle(row.querySelector(".legend-swatch-line")).borderTopColor : "missing";
        if (got !== rgb(token(name))) out.mismatches.push(`legend "${label}" ${got} ≠ ${rgb(token(name))}`);
      }
      return out;
    });
    problems.push(...colours.mismatches);
    if (!colours.counted.affected) problems.push("no affected path on the map at the options stage");

    // AI label: opens a note on click, closes on Escape and gives focus back.
    await page.click(".options-summary-head .ai-label");
    const tip = await page.$eval(".options-summary-head .ai-tip", (t) => ({ hidden: t.hidden, text: t.textContent }));
    if (tip.hidden || !/AI-proposed options/.test(tip.text) || !/Scripted replay/.test(tip.text)) problems.push(`options AI label: ${JSON.stringify(tip).slice(0, 160)}`);
    await page.keyboard.press("Escape");
    const after = await page.evaluate(() => ({
      hidden: document.querySelector(".options-summary-head .ai-tip").hidden,
      focus: document.activeElement?.classList.contains("ai-label")
    }));
    if (!after.hidden || !after.focus) problems.push(`AI label after Escape: ${JSON.stringify(after)}`);

    // Approving the option hands the next step to the drafts.
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() !== "Awaiting your decision", null, { timeout: 5000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
    await waitPill(page, /^Awaiting your approval$/);
    rail = await railNow(page);
    if (rail.step !== "prepare" || rail.state !== "yours" || rail.turn !== "Your approval") problems.push(`drafts: rail shows ${JSON.stringify(rail)}`);
    const draftLabels = await page.$$eval(".action-card .ai-label", (l) => l.length);
    const drafts = await page.$$eval(".action-card", (c) => c.length);
    if (!drafts || draftLabels !== drafts) problems.push(`${draftLabels} AI labels on ${drafts} drafts`);
    const phases = await page.$$eval("#console .phase", (p) => p.map((e) => e.textContent.trim()));
    for (const want of ["Phase: Awaiting your decision", "Phase: Awaiting your approval"]) if (!phases.includes(want)) problems.push(`console lacks "${want}"`);

    await toDone(page);
    await waitPill(page, /^Done$/);
    rail = await railNow(page);
    if (rail.states.some((s) => s !== "done")) problems.push(`done: rail states ${rail.states.join(", ")}`);
    if ((await pillText(page)) !== "Done") problems.push(`done: pill reads ${await pillText(page)}`);
    if (!(await page.$(".report-card .ai-label"))) problems.push("no AI label on the summary card");
    await page.screenshot({ path: path.join(OUT, "states-done.png") });
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: "colour grammar, handover labels, AI labels", ok: !problems.length, problems });
  await context.close();
}

if (wanted("review")) {
  const { context, page, errors } = await newPage();
  const problems = [];
  const files = [];
  try {
    await toOptions(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, "review-options.png") });
    await page.evaluate((f) => { document.documentElement.style.filter = f; }, WASHOUT);
    await page.screenshot({ path: path.join(OUT, "review-options-washout.png") });
    await page.evaluate(() => { document.documentElement.style.filter = ""; });
    files.push("review-options.png", "review-options-washout.png");

    await toDrafts(page);
    await toDone(page);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.position = "absolute";
      // Filter primitives work in linear RGB by default, which is where the matrices apply.
      svg.innerHTML = '<filter id="cvd-sim" color-interpolation-filters="linearRGB"><feColorMatrix id="cvd-matrix" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>';
      document.body.appendChild(svg);
    });
    const shots = { full: [], map: [] };
    const mapBox = await page.$eval("#map", (m) => { const r = m.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    for (const [name, m] of Object.entries(CVD)) {
      await page.evaluate((mat) => {
        const values = mat ? `${mat[0].join(" ")} 0 0 ${mat[1].join(" ")} 0 0 ${mat[2].join(" ")} 0 0 0 0 0 1 0` : "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0";
        document.getElementById("cvd-matrix").setAttribute("values", values);
        document.body.style.filter = mat ? "url(#cvd-sim)" : "";
      }, m);
      await page.waitForTimeout(300);
      shots.full.push([name, (await page.screenshot()).toString("base64")]);
      shots.map.push([name, (await page.screenshot({ clip: mapBox })).toString("base64")]);
    }
    await page.evaluate(() => { document.body.style.filter = ""; });

    const sheet = await context.newPage();
    for (const [kind, list] of Object.entries(shots)) {
      await sheet.setViewportSize({ width: 1920, height: 200 }); // the full-page capture grows to fit
      await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font:600 20px Arial,sans-serif;color:#2c1f21">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px">${list.map(([n, b]) =>
          `<figure style="margin:0"><figcaption style="padding:2px 2px 6px">${n}</figcaption><img style="width:100%;display:block;border:1px solid #e5d9db" src="data:image/png;base64,${b}"></figure>`).join("")}</div></body></html>`);
      await sheet.waitForTimeout(200);
      const file = `review-cvd-${kind}.png`;
      await sheet.screenshot({ path: path.join(OUT, file), fullPage: true });
      files.push(file);
    }
    await sheet.close();
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: `review captures (${files.length} files)`, ok: !problems.length && files.length === 4, problems });
  await context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "design-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} design checks passed. Screenshots: ${OUT}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);

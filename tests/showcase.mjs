// The showcase in Chromium, as a presenter drives it:
//   steps         the five steps Spot, Check, Calculate, Propose and Prepare under the header, moved by
//                 click, Next, the arrow keys, 1 to 5, Home and ?step=; the talk track's five minutes
//   scenarios     the Tangier fire carries the demo; the other five wait behind one menu, and every
//                 figure follows the scenario chosen, in the address too (?scenario=)
//   first-screen  no lab control on the first screen; Start agent offers the simulation first and a
//                 live run on the visitor's key, says it is an AI, and the replay connects nowhere
//   kpis          four key figures top right, marked data-vc-kpi, with values before anything happens;
//                 the clock waits for the guide; the decision moves the figures
//   layout        at 1920 × 1080, 1366 × 768 and 1280 × 720 in both themes every step fits the window,
//                 Next stays in view and clickable, and the story shows names, not record ids; a 375 px
//                 phone scrolls only down
// Usage: NODE_PATH="$(npm root -g)" node tests/showcase.mjs [case…]
import path from "node:path";
import { launchBrowser, serveStatic, offlineContext, outDir, wanted, loadApp, NETWORK_NOISE, STEP_IDS, KPI_NAMES, VIEWPORTS } from "./lib/harness.mjs";

const { story, format } = await loadApp();
const today = new Date();
const figsOf = (id) => story.figures(story.scriptedRun(id, today));
const DEMO = figsOf(story.DEMO_ID);
const LABELS = story.STEPS.map((s) => s.label);
const OUT = await outDir("showcase");
const server = await serveStatic();
const browser = await launchBrowser();
const groups = [];
const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

async function open(query = "?guide=0", { width = 1920, height = 1080, theme = "light" } = {}) {
  const { context, external } = await offlineContext(browser, { viewport: { width, height }, colorScheme: theme });
  await context.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  await page.goto(server.base + query);
  await page.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 15000 });
  await page.waitForTimeout(150);
  return { context, page, errors, external };
}
const at = (page) => page.evaluate(() => ({
  step: document.querySelector('#steps [aria-current="step"]')?.closest("li")?.dataset.step || null,
  query: location.search,
  title: document.getElementById("story-title").textContent.trim()
}));
const kpis = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-vc-kpi]")].map((t) => [t.dataset.vcKpi, { value: t.querySelector(".kpi-value").textContent.replace(/ /g, " ").trim(), note: t.querySelector(".kpi-note").textContent.replace(/ /g, " ").trim(), tone: t.dataset.tone || "" }])));
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(120); };
async function run(name, token, fn) {
  if (!wanted(name)) return;
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  try { await fn(check); } catch (e) { check(false, `${name}: stopped with ${String(e.message || e).split("\n")[0]}`); }
  groups.push([results, token]);
}

try {
  await run("steps", "STEPS OK", async (check) => {
    const { context, page, errors } = await open();
    const steps = await page.$$eval("#steps li", (els) => els.map((li) => `${li.dataset.step}:${li.querySelector(".vc-step__label").firstChild.textContent.trim()}`));
    check(steps.join("|") === STEP_IDS.map((id, i) => `${id}:${LABELS[i]}`).join("|"), `the steps under the header read ${steps.join(", ")}`);
    const below = await page.evaluate(() => document.getElementById("steps").getBoundingClientRect().top >= document.querySelector(".app-header").getBoundingClientRect().bottom - 1);
    check(below, "the steps sit under the header");
    let s = await at(page);
    check(s.step === "spot" && !/step=/.test(s.query), `the page opens on Spot with a clean address (${s.step}, "${s.query}")`);
    await page.click('#steps [data-step="calculate"] button');
    s = await at(page);
    check(s.step === "calculate" && /step=calculate/.test(s.query) && s.title === `${DEMO["stop-plant"]} stops on day ${DEMO["stop-day"]}: ${DEMO.var} at risk`, `a click shows Calculate and writes ?step=calculate ("${s.title}")`);
    await press(page, "ArrowRight");
    const right = (await at(page)).step;
    await press(page, "ArrowLeft");
    const left = (await at(page)).step;
    await press(page, "5");
    const five = (await at(page)).step;
    await press(page, "Home");
    s = await at(page);
    check(right === "propose" && left === "calculate" && five === "prepare" && s.step === "spot" && !/step=/.test(s.query), `the arrow keys, 5 and Home move the steps (${right}, ${left}, ${five}, ${s.step})`);
    await page.click("#next");
    await page.waitForTimeout(120);
    check((await at(page)).step === "check", "Next moves to Check");
    await page.click('[data-vc-guide-open="guide"]');
    await page.waitForTimeout(150);
    await press(page, "ArrowRight");
    const inGuide = (await page.evaluate(() => document.getElementById("guide").open)) && (await at(page)).step === "check";
    await press(page, "Escape");
    check(inGuide, "the arrow keys leave the steps alone while the guide is open");
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();

    const linked = await open("?step=propose&guide=0");
    s = await at(linked.page);
    check(s.step === "propose" && s.title.startsWith(`Option ${DEMO.rec} for ${DEMO["rec-cost"]}`), `?step=propose opens at Propose ("${s.title}")`);
    await linked.context.close();

    const talk = await open("?guide=present");
    const track = await talk.page.evaluate(() => {
      const ch = document.querySelector('[data-vc-chapter="present"]');
      return { shown: !ch.hidden, items: [...ch.querySelectorAll(".vc-guide__path > li")].map((li) => ({ name: li.querySelector("strong").textContent.split(/[:.]/)[0].trim(), time: li.querySelector(".vc-guide__time").textContent.trim(), say: li.querySelector(".vc-guide__say").textContent.trim() })) };
    });
    check(track.shown && track.items.map((i) => i.name).join("|") === LABELS.join("|") && track.items.every((i) => i.time === "1 min" && i.say.length > 20), `the talk track opens at ?guide=present: ${track.items.map((i) => `${i.name} ${i.time}`).join(", ")}`);
    await talk.context.close();
  });

  await run("scenarios", "SCENARIOS OK", async (check) => {
    const { context, page, errors } = await open();
    const tangier = story.findScenario("tangier");
    const first = await page.evaluate(() => ({ name: document.getElementById("scenario-name").textContent, map: document.getElementById("map-title").textContent, hidden: document.getElementById("scenario-menu").hidden, text: document.body.innerText }));
    const others = story.scenarioList().slice(1);
    check(first.name === tangier.short && first.map === tangier.short && (await at(page)).title === tangier.title, `the Tangier fire carries the demo ("${first.name}")`);
    check(first.hidden && others.every((o) => !first.text.includes(o.short)), "the other five scenarios are not on the first screen");
    await page.click("#scenario-button");
    const items = await page.$$eval("#scenario-menu .vc-menu__item", (els) => els.map((b) => `${b.getAttribute("aria-checked") === "true" ? "*" : ""}${b.firstChild.textContent}`));
    check(items.length === 6 && items[0] === `*${tangier.title}` && items.slice(1).join("|") === others.map((o) => o.title).join("|"), `one menu holds all six, Tangier first and chosen (${items.length})`);
    const rhine = story.findScenario("rhine");
    await page.click(`#scenario-menu .vc-menu__item:has-text("${rhine.title}")`);
    await page.waitForTimeout(150);
    const k = await kpis(page);
    const r = figsOf(rhine.id);
    const s = await at(page);
    check(/scenario=rhine/.test(s.query) && s.step === "spot" && s.title === rhine.title && k["Value at risk"].value === r.var && k["First line stop in"].value === norm(r["stop-days"]), `choosing the Rhine writes ?scenario=rhine and its figures (${k["Value at risk"].value}, ${k["First line stop in"].value})`);
    await page.click("#scenario-button");
    await page.click(`#scenario-menu .vc-menu__item:has-text("${tangier.title}")`);
    await page.waitForTimeout(150);
    check(!/scenario=/.test((await at(page)).query), "choosing Tangier again clears the address");
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
    const linked = await open("?scenario=hsinchu&step=calculate&guide=0");
    const h = figsOf("SC-HSC-QUAKE");
    const ls = await at(linked.page);
    check(ls.step === "calculate" && ls.title === `${h["stop-plant"]} stops on day ${h["stop-day"]}: ${h.var} at risk`, `?scenario=hsinchu&step=calculate opens there ("${ls.title}")`);
    await linked.context.close();
  });

  await run("first-screen", "FIRST SCREEN OK", async (check) => {
    const { context, page, errors, external } = await open();
    const controls = await page.evaluate(() => {
      const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility === "visible" && !e.closest("dialog, [hidden]"); };
      return [...document.querySelectorAll("button, a[href], select, input, [tabindex='0']")].filter(visible).map((e) => (e.getAttribute("aria-label") || e.textContent || (e.getAttribute("aria-labelledby") || "").split(" ").map((id) => document.getElementById(id)?.textContent || "").join(" ")).replace(/\s+/g, " ").trim());
    });
    const lab = controls.filter((c) => /\b(model|live scan|abort|diagnostics|options|outbox|audit|speed)\b|×\s?[124]\b/i.test(c));
    check(!lab.length && !(await page.$("select")), `no Model, replay speed, Live scan, Abort or Diagnostics control on the first screen${lab.length ? `; found ${lab.join(", ")}` : ""}`);
    check(controls.length <= 16, `${controls.length} controls on the first screen: ${controls.join(" · ")}`);
    const notice = await page.evaluate(() => document.body.innerText.includes("You are interacting with an AI system"));
    check(notice, "the first screen says \"You are interacting with an AI system\" beside Start agent");
    await page.click("#start");
    await page.waitForTimeout(150);
    const dialog = await page.evaluate(() => {
      const d = document.getElementById("start-dialog");
      const cards = [...d.querySelectorAll(".start-card h3")].map((h) => h.textContent.trim());
      return { open: d.open, cards, focus: document.activeElement?.id, notice: d.querySelector(".start-card--live").innerText.includes("You are interacting with an AI system"), key: d.querySelector("#key-input")?.type, estimate: d.querySelector('.start-card [data-fig="estimate"]').textContent };
    });
    check(dialog.open && dialog.cards.join("|") === "Simulation|Live run" && dialog.focus === "start-sim", `Start agent offers the simulation first, focused, then a live run (${dialog.cards.join(", ")}; focus on ${dialog.focus})`);
    check(dialog.notice && dialog.key === "password" && dialog.estimate === DEMO.estimate, `the live run asks for the visitor's own key, says it is an AI and costs about ${dialog.estimate}`);
    await page.click("#start-sim");
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ open: document.getElementById("start-dialog").open, mode: document.getElementById("mode-text").textContent }));
    check(!after.open && after.mode === "SIMULATION" && (await at(page)).step === "spot", "Run the simulation replays from Spot in the simulated mode");
    for (const id of STEP_IDS.slice(1)) await page.click(`#steps [data-step="${id}"] button`);
    await page.click('#steps [data-step="propose"] button');
    await page.click('.option[data-recommended="true"] [data-action="approve"]');
    await page.click('#steps [data-step="prepare"] button');
    await page.click("#approve-all");
    await page.waitForTimeout(150);
    check(!external.length, `the whole replay connects to no other site${external.length ? `; it asked for ${external.slice(0, 3).join(", ")}` : ""}`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
  });

  await run("kpis", "KPIS OK", async (check) => {
    const { context, page, errors } = await open();
    const tiles = await page.evaluate(() => {
      const header = document.querySelector(".app-header").getBoundingClientRect();
      return [...document.querySelectorAll("[data-vc-kpi]")].map((t) => { const r = t.getBoundingClientRect(); return { name: t.dataset.vcKpi, inHeader: !!t.closest(".app-header"), right: r.left > innerWidth / 2, top: r.bottom <= header.bottom + 1 }; });
    });
    check(tiles.map((t) => t.name).join("|") === KPI_NAMES.join("|") && tiles.every((t) => t.inHeader && t.right && t.top), `four key figures top right, marked data-vc-kpi: ${tiles.map((t) => t.name).join(", ")}`);
    let k = await kpis(page);
    const before = Object.values(k).every((v) => v.value && !/^(—|-|€0\.00)$/.test(v.value) && v.note);
    check(before && k["Value at risk"].value === DEMO.var && k["First line stop in"].value === norm(DEMO["stop-days"]) && /^\d+:\d\d$/.test(k["Detection → decision"].value), `before anything happens: ${KPI_NAMES.map((n) => `${n} ${k[n].value} (${k[n].note})`).join("; ")}`);
    check(k["Session cost"].value === `≈ ${DEMO.estimate}` && k["Session cost"].note === "estimated for a live run", `the simulation estimates the session cost (${k["Session cost"].value}, ${k["Session cost"].note})`);
    await page.click('#steps [data-step="propose"] button');
    await page.click('.option[data-recommended="true"] [data-action="approve"]');
    await page.waitForTimeout(200);
    k = await kpis(page);
    const stopped = k["Detection → decision"].value;
    await page.waitForTimeout(1300);
    const later = (await kpis(page))["Detection → decision"].value;
    check(k["Value at risk"].value === DEMO["rec-left"] && k["Value at risk"].note === `left with option ${DEMO.rec}, was ${DEMO.var}` && k["Value at risk"].tone === "at_risk", `the approval moves Value at risk to ${k["Value at risk"].value} (${k["Value at risk"].note})`);
    check(k["Detection → decision"].tone === "decided" && stopped === later && k["Detection → decision"].note === "from the report to your decision", `the approval stops the clock at ${stopped} (${k["Detection → decision"].note})`);
    check(k["First line stop in"].value !== norm(DEMO["stop-days"]) || /slows/.test(k["First line stop in"].note), `First line stop in follows the option (${k["First line stop in"].value}, ${k["First line stop in"].note})`);
    await page.click("#restart");
    await page.waitForTimeout(150);
    k = await kpis(page);
    check(k["Value at risk"].value === DEMO.var && k["Detection → decision"].tone === "", "Start over puts the figures back");
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();

    // With the guide open, the clock waits; it starts when the guide closes.
    const guided = await open("");
    await guided.page.waitForTimeout(1300);
    const waiting = (await kpis(guided.page))["Detection → decision"].value;
    await guided.page.keyboard.press("Escape");
    await guided.page.waitForTimeout(1300);
    const running = await kpis(guided.page);
    check(waiting === "0:00" && running["Detection → decision"].value !== "0:00" && running["Detection → decision"].note === "running since the report", `the clock waits for the guide (${waiting}), then runs (${running["Detection → decision"].value})`);
    await guided.context.close();
  });

  await run("layout", "LAYOUT OK", async (check) => {
    for (const [width, height] of VIEWPORTS) {
      for (const theme of ["light", "dark"]) {
        const { context, page, errors } = await open("?guide=0", { width, height, theme });
        const problems = [];
        for (const id of STEP_IDS) {
          await page.click(`#steps [data-step="${id}"] button`);
          if (id === "propose") await page.click('.option[data-recommended="true"] [data-action="approve"]');
          if (id === "prepare") await page.click("#approve-all");
          await page.waitForTimeout(120);
          const m = await page.evaluate((last) => {
            const inView = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return true; const r = e.getBoundingClientRect(); return r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; };
            const next = document.getElementById("next");
            let clickable = true;
            if (!last) { const r = next.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); clickable = !!hit && next.contains(hit); }
            const parts = [".app-header", ".intro", ".talk-track", "#map", "#story-title", ...(last ? [] : ["#next"])].filter((s) => !inView(s));
            const ids = (document.getElementById("story").innerText.match(/\b(?:S|A|N|PL|P|R|ALT)-[A-Z]{2,}[A-Z0-9-]*\b/g) || []);
            return { wide: document.documentElement.scrollWidth - innerWidth, tall: document.documentElement.scrollHeight - innerHeight, parts, clickable, ids };
          }, id === "prepare");
          if (m.wide > 0 || m.tall > 0) problems.push(`${id}: the page scrolls (${m.wide} px wide, ${m.tall} px tall)`);
          if (m.parts.length) problems.push(`${id}: out of view: ${m.parts.join(", ")}`);
          if (!m.clickable) problems.push(`${id}: Next is covered`);
          if (m.ids.length) problems.push(`${id}: record ids on screen (${[...new Set(m.ids)].join(", ")})`);
          if (id === "spot" || id === "propose") await page.screenshot({ path: path.join(OUT, `${width}x${height}-${theme}-${id}.png`) });
        }
        check(!problems.length && !errors.length, `${width} × ${height} ${theme}: every step fits the window and Next stays clickable${problems.length ? `; ${problems.join("; ")}` : ""}${errors.length ? `; errors: ${errors.join(" | ")}` : ""}`);
        await context.close();
      }
    }
    const phone = await open("?guide=0", { width: 375, height: 760 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await phone.page.click('#steps [data-step="propose"] button');
    await phone.page.screenshot({ path: path.join(OUT, "375-propose.png"), fullPage: true });
    check(wide <= 0 && !phone.errors.length, `375 px: the page scrolls only down (${wide} px too wide)`);
    await phone.context.close();
  });
} finally {
  await browser.close();
  await server.close();
}

let failed = 0;
const tokens = [];
for (const [results, token] of groups) {
  for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  const f = results.filter(([ok]) => !ok).length;
  failed += f;
  if (!f) tokens.push(token);
}
console.log(`(screenshots in ${OUT})`);
if (failed) { console.log(`\n${failed} checks failed.`); process.exit(1); }
console.log(`\nAll checks passed.\n${tokens.join("\n")}`);

// The showcase in Chromium, as a presenter drives it:
//   steps         the five steps Spot, Check, Calculate, Propose and Prepare under the header, moved by
//                 click, the bar's button, the arrow keys, 1 to 5, Home and ?step=; the talk track's five minutes
//   run           the prototype runs: step 1 plays by itself once the guide closes, Run plays a step out
//                 over time, Space pauses and continues, the guide holds it, an approval runs Prepare by
//                 itself, and a click or a link shows a step at once
//   move          at every point where the page waits, the bar under the story says in words what
//                 to do, sits in view uncovered and holds the page's one primary action, which draws the
//                 eye with Vici's vc-attention
//   scenarios     the Tangier fire carries the demo; the other five wait behind one menu, and every
//                 figure follows the scenario chosen, in the address too (?scenario=)
//   first-screen  no lab control on the first screen; while step 1 plays, the talk track starts with the
//                 steps and Run it live stands after them, the AI notice beside it; it asks for a live run
//                 on the visitor's key or the simulation again, and the replay connects nowhere
//   kpis          four key figures top right, marked data-vc-kpi, with values before anything happens;
//                 the clock waits for the guide; the decision moves the figures and stops the clock, which
//                 says so
//   layout        at 1920 × 1080, 1366 × 768 and 1280 × 720 in both themes every step fits the window,
//                 the bar stays in view and clickable, every option and Do nothing show in full above it
//                 at the decision, every map label reads clear of the others and of the marks, and the
//                 story shows names, not record ids; the header keeps one line and every key figure reads
//                 in full, and the decision shows every option, in all six scenarios; a 375 px phone
//                 scrolls only down
//   ids           Vici's recordIdProblems over every screen of all six scenarios, both ways a decision can
//                 go, the drafts opened, the guide and the live-run dialog (needs ViciDesign, as vici does)
// Usage: NODE_PATH="$(npm root -g)" node tests/showcase.mjs [case…]
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser, serveStatic, offlineContext, outDir, wanted, loadApp, viciDir, REQUIRE_VICI, NETWORK_NOISE, STEP_IDS, KPI_NAMES, VIEWPORTS } from "./lib/harness.mjs";

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
// Each key figure: its value, the old value a decision struck through (vc-stat__was), its note and tone.
const kpis = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-vc-kpi]")].map((t) => {
  const v = t.querySelector(".kpi-value");
  const was = v.querySelector(".vc-stat__was");
  const text = (n) => n.textContent.replace(/ /g, " ").trim();
  return [t.dataset.vcKpi, { value: [...v.childNodes].filter((c) => c !== was).map(text).join("").trim(), was: was ? text(was) : null, struck: was ? getComputedStyle(was).textDecorationLine.includes("line-through") : false, note: text(t.querySelector(".kpi-note")), tone: t.dataset.tone || "" }];
})));
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
    const label = await page.$eval("#move-actions button[data-attention]", (b) => b.textContent.trim());
    await page.click("#move-actions button[data-attention]");
    await page.waitForTimeout(120);
    check((await at(page)).step === "check", `the bar's button "${label}" moves to Check`);
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

  // ---- the prototype runs, and the bar asks ----------------------------------------------------------------
  // What the page shows now: the agent's words and drafts for the step on screen, and the bar under the
  // story.
  const now = (page) => page.evaluate(() => ({
    step: document.querySelector('#steps [aria-current="step"]')?.closest("li")?.dataset.step || null,
    n: document.querySelectorAll("#agent-words > p:not(.working):not(.empty), #story-card .draft").length,
    tone: document.getElementById("move").dataset.tone,
    text: document.getElementById("move-text").textContent.replace(/\s+/g, " ").trim(),
    buttons: [...document.querySelectorAll("#move-actions button")].map((b) => b.id)
  }));
  /** Samples the page every 150 ms until until(state) holds or ms pass. */
  async function watch(page, until, ms = 20000) {
    const seen = [];
    const t0 = Date.now();
    for (;;) {
      const s = await now(page);
      seen.push({ t: Date.now() - t0, ...s });
      if (until(s) || Date.now() - t0 > ms) return seen;
      await page.waitForTimeout(150);
    }
  }
  /** A step plays out over time: its words appear in at least three counts, never fewer, over a second or more. */
  const playsOut = (seen) => {
    const ns = seen.map((s) => s.n);
    const grows = ns.every((n, i) => i === 0 || n >= ns[i - 1]);
    const firstFull = seen.find((s) => s.n === ns[ns.length - 1]);
    return grows && new Set(ns).size >= 3 && ns[ns.length - 1] > ns[0] && firstFull.t >= 1000;
  };
  const story_ = (seen) => `${seen.map((s) => s.n).filter((n, i, a) => i === 0 || n !== a[i - 1]).join(" → ")} entries over ${(seen[seen.length - 1].t / 1000).toFixed(1)} s`;

  await run("run", "RUN OK", async (check) => {
    // Step 1 plays by itself once the guide closes, and not before.
    const { context, page, errors } = await open("");
    await page.waitForTimeout(1200);
    const held = await now(page);
    const guideOpen = await page.evaluate(() => document.getElementById("guide").open);
    await page.keyboard.press("Escape");
    const ran = (id) => (s) => s.step === id && s.n > 0 && s.tone !== "working";
    let seen = await watch(page, ran("spot"));
    const spotWorking = seen.some((s) => s.tone === "working" && s.buttons.includes("pause"));
    check(guideOpen && held.n === 0 && seen[seen.length - 1].step === "spot" && spotWorking && playsOut(seen), `step 1 waits for the guide (${held.n} entries while it is open), then plays by itself: ${story_(seen)}`);
    const last = seen[seen.length - 1];
    check(/^Your move\./.test(last.text) && last.buttons.join() === "run", `then the bar asks: "${last.text}" (${last.buttons.join(", ")})`);

    // Run plays the next step out over time.
    await page.click("#run");
    seen = await watch(page, ran("check"));
    check(seen[0].step === "check" && playsOut(seen), `Run step 2 plays Check out: ${story_(seen)}`);

    // Space pauses and continues; the guide holds a running step too.
    await page.click("#run");
    await page.waitForTimeout(900);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press(" ");
    await page.waitForTimeout(200);
    const paused = await now(page);
    await page.waitForTimeout(1600);
    const still = await now(page);
    await page.keyboard.press(" ");
    const resumed = (await watch(page, (x) => x.n > still.n, 6000)).pop();
    check(paused.step === "calculate" && /^Paused\./.test(paused.text) && paused.buttons.join() === "resume" && still.n === paused.n && resumed.n > paused.n && resumed.tone === "working", `Space pauses Calculate at ${paused.n} entries ("${paused.text}"), holds it ${still.n === paused.n ? "still" : "moving"}, and continues to ${resumed.n}`);
    await page.click('[data-vc-guide-open="guide"]');
    await page.waitForTimeout(200);
    const inGuide = await now(page);
    await page.waitForTimeout(1600);
    const underGuide = await now(page);
    await page.keyboard.press("Escape");
    const afterGuide = (await watch(page, (x) => x.n > underGuide.n, 6000)).pop();
    check(underGuide.n === inGuide.n && /^Paused\./.test(inGuide.text) && afterGuide.n > underGuide.n, `opening the guide holds the step at ${inGuide.n} entries; closing it goes on (${afterGuide.n})`);

    // The right arrow finishes a running step; an approval then runs Prepare by itself.
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    await page.click("#run");
    seen = await watch(page, (s) => s.buttons.includes("approve-rec"));
    const ask = seen[seen.length - 1];
    check(ask.step === "propose" && /^Your decision\. The agent recommends option [A-D]/.test(ask.text), `after Propose the bar asks for the decision: "${ask.text}"`);
    await page.click("#approve-rec");
    seen = await watch(page, (s) => s.step === "prepare" && s.buttons.includes("approve-all"));
    const queued = seen.find((s) => s.step === "propose" && /^Approved\./.test(s.text));
    const prep = seen.filter((s) => s.step === "prepare");
    check(!!queued && prep.length && playsOut(prep) && /^Your approval\./.test(prep[prep.length - 1].text), `Approve option ${DEMO.rec} runs Prepare by itself: "${queued?.text || "no Approved."}", then ${story_(prep)}, then "${prep[prep.length - 1]?.text}"`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();

    // A link or a click on a step shows it at once. The control: the same measure on a click must not
    // read as playing out.
    const linked = await open("?step=calculate&guide=0");
    const at0 = await now(linked.page);
    seen = await watch(linked.page, () => false, 1500);
    check(at0.step === "calculate" && at0.n > 0 && seen.every((s) => s.n === at0.n && s.tone !== "working"), `?step=calculate shows Calculate in full at once (${at0.n} entries, still after 1.5 s): "${at0.text}"`);
    await linked.page.click('#steps [data-step="propose"] button');
    const clicked = await watch(linked.page, () => false, 1500);
    check(clicked[0].step === "propose" && clicked[0].n > 0 && !playsOut(clicked) && !playsOut(seen), `a click shows Propose at once (${story_(clicked)}), and neither reads as playing out`);
    await linked.context.close();
  });

  await run("move", "MOVE OK", async (check) => {
    // Runs in the page: what keeps the bar from asking. The page's one primary button must sit in the bar,
    // in view and uncovered, and draw attention; the bar's words must say whose move it is.
    const barProblems = (plant = null) => {
      const undo = [];
      if (plant === "static") { const f = document.querySelector(".story-foot"); f.style.position = "static"; document.getElementById("story").scrollTop = 0; undo.push(() => { f.style.position = ""; }); }
      if (plant === "calm") { const b = document.querySelector("#move [data-attention]"); b.classList.remove("vc-attention"); undo.push(() => b.classList.add("vc-attention")); }
      if (plant === "two") { const c = document.querySelector("#move [data-attention]").cloneNode(true); c.removeAttribute("id"); document.getElementById("story-card").prepend(c); undo.push(() => c.remove()); }
      const out = [];
      const bar = document.getElementById("move");
      const r = bar.getBoundingClientRect();
      if (!(r.height > 10 && r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1)) out.push("the bar is out of view");
      const text = document.getElementById("move-text").textContent.replace(/\s+/g, " ").trim();
      if (!/^(Your move|Your decision|Your approval|Paused)\. \S/.test(text)) out.push(`the bar does not say what to do ("${text}")`);
      const shown = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility === "visible"; };
      const primary = [...document.querySelectorAll(".vc-button")].filter((b) => shown(b) && !/vc-button--(secondary|ghost|danger|link)\b/.test(b.className));
      if (primary.length !== 1 || !bar.contains(primary[0])) out.push(`${primary.length} primary buttons (${primary.map((b) => b.textContent.trim()).join(", ")}), not one in the bar`);
      for (const b of primary.filter((x) => bar.contains(x))) {
        const box = b.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (!hit || !b.contains(hit)) out.push(`"${b.textContent.trim()}" is covered`);
        if (!b.classList.contains("vc-attention") || getComputedStyle(b).animationName !== "vc-attention") out.push(`"${b.textContent.trim()}" does not draw attention`);
      }
      if (document.getElementById("next")) out.push("the old Next button is still there");
      for (const u of undo) u();
      return out;
    };
    const asks = (page, plant = null) => page.evaluate(barProblems, plant);
    for (const [width, height] of VIEWPORTS) {
      const { context, page, errors } = await open("?guide=0", { width, height });
      const points = [];
      const visit = async (name) => { const s = await now(page); points.push([name, s.text, await asks(page), await page.$eval("#move-actions button[data-attention]", (b) => b.textContent.trim()).catch(() => "")]); };
      await watch(page, (s) => s.buttons.includes("pause"));
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(150);
      await visit("Spot done");
      for (const n of [2, 3, 4]) {
        await page.click("#run");
        await page.waitForTimeout(700);
        if (n === 3) {
          await page.evaluate(() => document.activeElement?.blur());
          await page.keyboard.press(" ");
          await page.waitForTimeout(150);
          await visit("Calculate paused");
          await page.keyboard.press(" ");
        }
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(150);
        await visit(`step ${n} done`);
      }
      // The controls: each break must be caught where the story is long and the bar is needed most.
      if (width === 1280) {
        await page.click('#steps [data-step="calculate"] button');
        await page.waitForTimeout(150);
        const planted = { static: await asks(page, "static"), calm: await asks(page, "calm"), two: await asks(page, "two") };
        const clean = await asks(page);
        check(planted.static.some((p) => /out of view/.test(p)) && planted.calm.some((p) => /draw attention/.test(p)) && planted.two.some((p) => /2 primary buttons/.test(p)) && !clean.length, `the controls fail as they must: a bar that scrolls away (${planted.static.join("; ") || "passed"}), a button that does not draw attention (${planted.calm.join("; ") || "passed"}), a second dark button (${planted.two.join("; ") || "passed"}), while the page itself passes (${clean.join("; ") || "no problem"})`);
        await page.click('#steps [data-step="propose"] button');
        await page.waitForTimeout(150);
      }
      await page.click("#approve-rec");
      await watch(page, (s) => s.step === "prepare" && s.tone === "working");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(150);
      await visit("Prepare done");
      await page.screenshot({ path: path.join(OUT, `${width}x${height}-asks.png`) });
      await page.click("#approve-all");
      await page.waitForTimeout(150);
      const end = await now(page);
      const failed = points.filter(([, , p]) => p.length);
      check(points.length === 6 && !failed.length && !errors.length, `${width} × ${height}: the bar asks at all ${points.length} waiting points (${points.map(([n, t]) => `${n}: "${t.split(". ")[0]}."`).join(", ")})${failed.length ? `; ${failed.map(([n, , p]) => `${n}: ${p.join(", ")}`).join("; ")}` : ""}${errors.length ? `; errors: ${errors.join(" | ")}` : ""}`);
      check(/^Done\. From the report to your decision in \d+:\d\d\. Nothing was sent\./.test(end.text) && end.buttons.join() === "again,cases", `${width} × ${height}: at the end it says "${end.text}" and offers ${end.buttons.join(", ")}`);
      if (width === VIEWPORTS[0][0]) {
        // The talk track tells the presenter what to press, in the bar's own words. The control: the step
        // names alone must not pass.
        const track = await page.$$eval('#guide [data-vc-chapter="present"] .vc-guide__path > li strong', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
        const labelAt = (name) => points.find(([n]) => n === name)?.[3] || "(none)";
        const short = (l) => l.split(":")[0];
        const want = [["Spot", "by itself"], ["Check", labelAt("Spot done")], ["Calculate", labelAt("step 2 done")], ["Propose", labelAt("step 3 done")], ["Propose", labelAt("step 4 done")], ["Prepare", "by itself"], ["Prepare", labelAt("Prepare done")]];
        const missing = (lines) => want.filter(([step, l]) => !(lines[LABELS.indexOf(step)] || "").includes(short(l)));
        const control = missing(track.map((t) => t.split(":")[0]));
        check(track.length === 5 && !missing(track).length && control.length === want.length, `the talk track names what to press, in the bar's words: ${want.map(([st, l]) => `${st} "${short(l)}"`).join(", ")}${missing(track).length ? `; missing ${missing(track).map(([st, l]) => `${st} "${short(l)}"`).join(", ")}` : ""} (the step names alone miss ${control.length} of ${want.length})`);
      }
      await context.close();
    }
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
    // While the simulation plays, nothing invites a press to begin: the talk track starts with the steps,
    // and the live run's button says live and stands after them, the AI notice beside it. The control: the
    // same button moved before the steps is caught.
    const liveProblems = (plant) => page.evaluate((plant) => {
      const talk = document.querySelector(".talk-track");
      const live = document.getElementById("start");
      if (plant) talk.prepend(live);
      const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const first = [...talk.querySelectorAll("button")].filter(shown).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
      const notice = talk.querySelector(".ai-notice").getBoundingClientRect();
      const r = live.getBoundingClientRect();
      const out = [];
      if (!first.closest("#steps")) out.push(`the talk track starts with "${first.textContent.trim()}"`);
      if (!/\blive\b/i.test(live.textContent) || /^\s*start\b/i.test(live.textContent) || live.querySelector(".vc-icon--play")) out.push(`the live button reads "${live.textContent.trim()}"`);
      if (r.left < document.getElementById("steps").getBoundingClientRect().right) out.push("the live button stands before the end of the steps");
      if (Math.max(notice.left - r.right, r.left - notice.right) > 16 || Math.abs(notice.top + notice.height / 2 - r.top - r.height / 2) > 12) out.push("the AI notice is not beside the live button");
      if (!/You are interacting with an AI system/.test(talk.querySelector(".ai-notice").textContent)) out.push("the AI notice lost its words");
      if (plant) talk.append(live);
      return out;
    }, plant);
    const planted = await liveProblems(true);
    const clean = await liveProblems(false);
    const playing = await page.evaluate(() => document.getElementById("move").dataset.tone);
    check(planted.length > 0 && !clean.length && playing === "working", `while step 1 plays, the talk track starts with the steps and Run it live stands after them, the AI notice beside it${clean.length ? `; ${clean.join("; ")}` : ""} (a button moved before the steps is caught: ${planted.join("; ") || "missed"})`);
    await page.click("#start");
    await page.waitForTimeout(150);
    const dialog = await page.evaluate(() => {
      const d = document.getElementById("start-dialog");
      const cards = [...d.querySelectorAll(".start-card h3")].map((h) => h.textContent.trim());
      return { open: d.open, title: d.querySelector(".vc-dialog__title").textContent.trim(), cards, focus: document.activeElement?.id, notice: d.querySelector(".start-card--live").innerText.includes("You are interacting with an AI system"), key: d.querySelector("#key-input")?.type, estimate: d.querySelector('.start-card [data-fig="estimate"]').textContent };
    });
    check(dialog.open && dialog.title === "Simulation or live run" && dialog.cards.join("|") === "Simulation|Live run" && dialog.focus === "key-input", `Run it live asks "${dialog.title}": ${dialog.cards.join(", ")}, the focus on the key field (${dialog.focus})`);
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
    check(k["Value at risk"].value === DEMO["rec-left"] && k["Value at risk"].was === DEMO.var && k["Value at risk"].struck && k["Value at risk"].note === `option ${DEMO.rec} approved` && k["Value at risk"].tone === "at_risk", `the approval moves Value at risk from ${k["Value at risk"].was}, struck through, to ${k["Value at risk"].value} (${k["Value at risk"].note})`);
    check(k["Detection → decision"].tone === "decided" && stopped === later && k["Detection → decision"].note === "stopped at your decision", `the approval stops the clock at ${stopped}, and it says so (${k["Detection → decision"].note})`);
    check((k["First line stop in"].value !== norm(DEMO["stop-days"]) && k["First line stop in"].was === norm(DEMO["stop-days"])) || /slows/.test(k["First line stop in"].note), `First line stop in follows the option (${k["First line stop in"].was ? `${k["First line stop in"].was} struck through, then ` : ""}${k["First line stop in"].value}, ${k["First line stop in"].note})`);
    await page.click("#restart");
    await page.waitForTimeout(150);
    k = await kpis(page);
    check(k["Value at risk"].value === DEMO.var && !k["Value at risk"].was && k["Detection → decision"].tone === "", "Start over puts the figures back");
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

  // The header: its height, and the key figures that do not read in full (a cut note or a tile too narrow).
  const headerNow = (page) => page.evaluate(() => ({
    height: Math.round(document.querySelector(".app-header").getBoundingClientRect().height),
    cut: [...document.querySelectorAll("[data-vc-kpi]")].filter((t) => [t, ...t.querySelectorAll("p")].some((e) => e.scrollWidth > e.clientWidth + 1)).map((t) => `${t.dataset.vcKpi} (${t.querySelector(".kpi-note").textContent.trim()})`)
  }));
  // The map's labels: any that overlaps another label or another site's mark, and any the map hid. plant
  // moves one label onto another first, as a control.
  const mapProblems = (page, plant = false) => page.evaluate((plant) => {
    const sites = [...document.querySelectorAll("#map .map-site")].map((g) => ({ g, text: g.querySelector("text"), mark: g.querySelector("polygon") }));
    if (plant && sites.length > 1) for (const k of ["x", "y"]) sites[1].text.setAttribute(k, sites[0].text.getAttribute(k));
    const shown = sites.filter((s) => s.text.getAttribute("visibility") !== "hidden").map((s) => ({ name: s.text.textContent, text: s.text.getBoundingClientRect(), mark: s.mark.getBoundingClientRect() }));
    const cut = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const out = sites.filter((s) => s.text.getAttribute("visibility") === "hidden").map((s) => `${s.text.textContent} is hidden`);
    for (const a of shown) for (const b of shown) {
      if (a !== b && a.name < b.name && cut(a.text, b.text)) out.push(`${a.name} overlaps ${b.name}`);
      if (a !== b && cut(a.text, b.mark)) out.push(`${a.name} covers the mark of ${b.name}`);
    }
    return out;
  }, plant);
  // The decision: where the bar asks for it, every option, Do nothing included, shows in full above the bar.
  // plant puts the columns back as they were before 2.1.1, which hid Do nothing at 1280 × 720: a control.
  const decisionProblems = (page, plant = false) => page.evaluate((plant) => {
    const ws = document.querySelector(".workspace");
    if (plant) ws.style.gridTemplateColumns = "minmax(0, 52fr) minmax(0, 48fr)";
    const out = [];
    const asks = document.getElementById("move-text").textContent.replace(/\s+/g, " ").trim();
    if (!/^Your decision\./.test(asks)) out.push(`the bar does not ask for the decision ("${asks.slice(0, 40)}")`);
    const story = document.getElementById("story").getBoundingClientRect();
    for (const o of document.querySelectorAll(".option")) {
      const name = o.dataset.option === "baseline" ? "Do nothing" : `option ${o.querySelector(".option-letter").textContent}`;
      for (const el of [o.querySelector(".option-title"), o.querySelector(".option-figs"), ...o.querySelectorAll("button")]) {
        const r = el.getBoundingClientRect();
        const corners = [[r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
        if (r.top < story.top || r.bottom > story.bottom || corners.some(([x, y]) => { const hit = document.elementFromPoint(x, y); return !hit || !el.contains(hit); })) {
          out.push(`${name}: "${el.textContent.trim().slice(0, 24)}" is covered or out of view`);
          break;
        }
      }
    }
    if (plant) ws.style.gridTemplateColumns = "";
    return out;
  }, plant);
  await run("layout", "LAYOUT OK", async (check) => {
    for (const [width, height] of VIEWPORTS) {
      for (const theme of ["light", "dark"]) {
        const { context, page, errors } = await open("?guide=0", { width, height, theme });
        const problems = [];
        const first = await headerNow(page);
        for (const id of STEP_IDS) {
          await page.click(`#steps [data-step="${id}"] button`);
          if (id === "propose") {
            await page.waitForTimeout(120);
            const d = await decisionProblems(page);
            if (d.length) problems.push(`the decision: ${d.join("; ")}`);
            if (width === 1280 && theme === "light") {
              const planted = await decisionProblems(page, true);
              check(planted.some((p) => /^Do nothing/.test(p)), `the decision check catches Do nothing hidden by the bar under the old columns (${planted.join("; ") || "nothing caught"})`);
            }
            await page.click('.option[data-recommended="true"] [data-action="approve"]');
          }
          if (id === "prepare") await page.click("#approve-all");
          await page.waitForTimeout(120);
          const m = await page.evaluate(() => {
            const inView = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return true; const r = e.getBoundingClientRect(); return r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; };
            const covered = [...document.querySelectorAll("#move-actions button")].filter((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !hit || !b.contains(hit); }).map((b) => b.textContent.trim());
            const parts = [".app-header", ".intro", ".talk-track", "#map", "#story-title", "#move"].filter((s) => !inView(s));
            const ids = (document.getElementById("story").innerText.match(/\b(?:S|A|N|PL|P|R|ALT)-[A-Z]{2,}[A-Z0-9-]*\b/g) || []);
            return { wide: document.documentElement.scrollWidth - innerWidth, tall: document.documentElement.scrollHeight - innerHeight, parts, covered, ids };
          });
          const head = await headerNow(page);
          if (m.wide > 0 || m.tall > 0) problems.push(`${id}: the page scrolls (${m.wide} px wide, ${m.tall} px tall)`);
          if (m.parts.length) problems.push(`${id}: out of view: ${m.parts.join(", ")}`);
          if (m.covered.length) problems.push(`${id}: the bar's ${m.covered.join(", ")} is covered`);
          if (m.ids.length) problems.push(`${id}: record ids on screen (${[...new Set(m.ids)].join(", ")})`);
          if (head.height !== first.height) problems.push(`${id}: the header grew from ${first.height} to ${head.height} px`);
          if (head.cut.length) problems.push(`${id}: key figures cut: ${head.cut.join(", ")}`);
          const labels = await mapProblems(page);
          if (labels.length) problems.push(`${id}: map labels: ${labels.join("; ")}`);
          if (id === "spot" || id === "propose") await page.screenshot({ path: path.join(OUT, `${width}x${height}-${theme}-${id}.png`) });
        }
        if (width === 1280 && theme === "light") {
          const planted = await mapProblems(page, true);
          check(planted.some((p) => /overlaps/.test(p)), `the map check catches a label moved onto another (${planted.join("; ") || "nothing caught"})`);
        }
        check(!problems.length && !errors.length, `${width} × ${height} ${theme}: every step fits the window, the bar stays clickable, the header keeps one line and every map label reads clear${problems.length ? `; ${problems.join("; ")}` : ""}${errors.length ? `; errors: ${errors.join(" | ")}` : ""}`);
        await context.close();
      }
    }
    // Every scenario, both ways a decision can go, at the narrowest desktop window: the key figures
    // change their notes, and the header must still keep one line with every figure in full.
    const sweep = [];
    for (const sc of story.scenarioList()) {
      for (const choice of ["recommended", "baseline"]) {
        const { context, page, errors } = await open(`?scenario=${sc.slug}&step=propose&guide=0`, { width: 1280, height: 720 });
        const first = await headerNow(page);
        const decision = await decisionProblems(page);
        await page.click(choice === "recommended" ? '.option[data-recommended="true"] [data-action="approve"]' : '.option[data-option="baseline"] [data-action="approve"]');
        await page.waitForTimeout(150);
        const head = await headerNow(page);
        if (decision.length || head.height !== first.height || head.cut.length || errors.length) sweep.push(`${sc.slug} ${choice}: ${decision.length ? `the decision: ${decision.join("; ")}` : ""}${head.height !== first.height ? ` the header grew from ${first.height} to ${head.height} px` : ""}${head.cut.length ? ` cut: ${head.cut.join(", ")}` : ""}${errors.length ? ` errors: ${errors.join(" | ")}` : ""}`);
        else sweep.push(null);
        await context.close();
      }
    }
    const bad = sweep.filter(Boolean);
    check(sweep.length === 12 && !bad.length, `at 1280 × 720, in ${sweep.length / 2} scenarios, every option and Do nothing show in full above the bar at the decision, and the header keeps one line with every key figure in full after an approval and after accepting the risk${bad.length ? `; ${bad.join("; ")}` : ""}`);
    const phone = await open("?guide=0", { width: 375, height: 760 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await phone.page.click('#steps [data-step="propose"] button');
    await phone.page.screenshot({ path: path.join(OUT, "375-propose.png"), fullPage: true });
    check(wide <= 0 && !phone.errors.length, `375 px: the page scrolls only down (${wide} px too wide)`);
    await phone.context.close();
  });

  // Names, not record ids (Vici #16): Vici's recordIdProblems over every screen of every scenario, both ways
  // a decision can go, the drafts opened, the guide and the live-run dialog, with every id of Navigator's data.
  await run("ids", "NAMES OK", async (check) => {
    const dir = viciDir();
    if (!dir) { check(!REQUIRE_VICI, `ids: ${REQUIRE_VICI ? "no" : "(skipped) no"} ViciDesign checkout for recordIdProblems`); return; }
    const { recordIdProblems } = await import(pathToFileURL(path.join(dir, "scripts", "lib", "ids.mjs")).href);
    const ids = new Set();
    const REF = new Set(["id", "supplier", "to", "from", "part", "plant", "route", "parts", "plants"]);
    const collect = (v, key = "") => {
      if (Array.isArray(v)) v.forEach((x) => collect(x, key));
      else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => collect(x, k));
      else if (typeof v === "string" && (REF.has(key) || key.endsWith("_id") || key.endsWith("_ids"))) ids.add(v);
    };
    collect(globalThis.WORLD);
    for (const s of globalThis.SCENARIOS) ids.add(s.id);
    const text = (page) => page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll("#map text")].map((t) => t.textContent)].join("\n"));
    const hits = new Set();
    let screens = 0;
    const look = async (page, where) => { screens += 1; for (const p of recordIdProblems(await text(page), ids)) hits.add(`${where}: ${p}`); };
    for (const sc of story.scenarioList()) {
      for (const choice of ["recommended", "baseline"]) {
        const { context, page } = await open(`?scenario=${sc.slug}&guide=0`, { width: 1280, height: 720 });
        for (const id of STEP_IDS) {
          await page.click(`#steps [data-step="${id}"] button`);
          await page.waitForTimeout(80);
          await look(page, `${sc.slug} ${id}`);
          if (id === "propose") {
            await page.click(choice === "recommended" ? '.option[data-recommended="true"] [data-action="approve"]' : '.option[data-option="baseline"] [data-action="approve"]');
            await page.waitForTimeout(80);
            await look(page, `${sc.slug} ${choice} decided`);
          }
        }
        await page.evaluate(() => document.querySelectorAll("#story details").forEach((d) => { d.open = true; }));
        await look(page, `${sc.slug} ${choice} drafts open`);
        if (await page.$("#approve-all")) {
          await page.click("#approve-all");
          await page.waitForTimeout(80);
          await look(page, `${sc.slug} ${choice} all approved`);
        }
        if (sc.slug === "tangier" && choice === "recommended") {
          // The control: an id planted on the screen is caught by the same path.
          const title = await page.evaluate(() => { const t = document.getElementById("story-title"); const was = t.textContent; t.textContent += " (S-TNG-HAR)"; return was; });
          check(recordIdProblems(await text(page), ids).length > 0, "control: an id planted in the story's title is caught");
          await page.evaluate((was) => { document.getElementById("story-title").textContent = was; }, title);
          await page.click('[data-vc-guide-open="guide"]');
          await page.waitForTimeout(120);
          for (const b of await page.$$("#guide .vc-guide__rail .vc-step__button")) { await b.click(); await page.waitForTimeout(60); await look(page, "the guide"); }
          await page.keyboard.press("Escape");
          await page.click("#start");
          await page.waitForTimeout(120);
          await look(page, "the live-run dialog");
        }
        await context.close();
      }
    }
    check(ids.size > 200 && !hits.size, `${screens} screens in ${story.scenarioList().length} scenarios show names, not any of the ${ids.size} record ids of Navigator's data${hits.size ? `; ${[...hits].slice(0, 4).join("; ")}` : ""}`);
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

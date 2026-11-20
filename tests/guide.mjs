// The How it works guide in Chromium:
//   behaviour  ViciDesign's own scripts/check-guide-render.mjs, run against the page served over http:
//              it opens once per tab, focus and keys behave, ?guide=0 and ?guide=present work, full
//              screen on a phone (it prints GUIDE BEHAVIOUR OK)
//   fit        every chapter fits a 1280 × 720 and a 1366 × 768 window without scrolling, in both
//              themes, the guide's footer in view
// The fit check first proves itself on a planted chapter that does scroll.
// Usage: NODE_PATH="$(npm root -g)" node tests/guide.mjs [--require-vici]
import { spawn } from "node:child_process";
import path from "node:path";
import { APP_ROOT, REQUIRE_VICI, viciDir, launchBrowser, serveStatic, outDir, checks, NETWORK_NOISE } from "./lib/harness.mjs";

const dir = viciDir();
if (!dir) {
  console.log(`${REQUIRE_VICI ? "FAIL" : "SKIP"}  no ViciDesign checkout next to this repository (../ViciDesign) or in VICI_DIR`);
  process.exit(REQUIRE_VICI ? 1 : 0);
}
const { check, end } = checks();
const OUT = await outDir("guide");
const server = await serveStatic();
const browser = await launchBrowser();

/** Every chapter of the open guide: does its text scroll, and is the footer in the window? */
const chapterFit = (page) => page.evaluate(async () => {
  const d = document.getElementById("guide");
  const box = d.querySelector(".vc-guide__chapters");
  const out = [];
  const rail = [...d.querySelectorAll(".vc-guide__rail .vc-step__button")];
  for (const [i, b] of rail.entries()) {
    b.click();
    await new Promise((r) => setTimeout(r, 60));
    const foot = d.querySelector(".vc-guide__footer").getBoundingClientRect();
    out.push({ chapter: d.querySelectorAll(".vc-guide__chapter")[i].dataset.vcChapter, over: box.scrollHeight - box.clientHeight, footer: foot.bottom <= innerHeight + 1 && foot.top >= 0 });
  }
  return out;
});

try {
  // Vici's own behaviour check, against the page over http.
  // It runs as its own process while this one serves the page, so it must not block this one.
  const r = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(dir, "scripts", "check-guide-render.mjs"), server.base, OUT], { cwd: APP_ROOT, env: process.env });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (status) => resolve({ status, out }));
  });
  const said = r.out.trim();
  check(r.status === 0 && /GUIDE BEHAVIOUR OK/.test(said), `behaviour: Vici's check-guide-render.mjs passes over http${r.status === 0 ? "" : `: ${said.split("\n").slice(-6).join(" | ")}`}`);

  // The fit check catches a chapter that scrolls.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${server.base}?guide=what`);
    await page.waitForFunction(() => document.getElementById("guide").open);
    await page.evaluate(() => { const lead = document.querySelector('[data-vc-chapter="what"] .vc-guide__lead'); lead.textContent = lead.textContent.repeat(14); });
    const planted = await chapterFit(page);
    check(planted[0].over > 0, `control: a chapter whose text overflows is caught (${planted[0].over} px)`);
    await page.close();
  }

  for (const [width, height] of [[1280, 720], [1366, 768]]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
      await context.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message || e)));
      page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
      await page.goto(`${server.base}?guide=what`);
      await page.waitForFunction(() => document.documentElement.dataset.boot === "ready" && document.getElementById("guide").open, null, { timeout: 15000 });
      await page.waitForTimeout(200);
      const fit = await chapterFit(page);
      const bad = fit.filter((c) => c.over > 1 || !c.footer);
      check(fit.length === 4 && !bad.length && !errors.length, `fit: ${width} × ${height} ${theme}: ${fit.map((c) => c.chapter).join(", ")} fit without scrolling${bad.length ? `; ${bad.map((c) => `${c.chapter} scrolls ${c.over} px${c.footer ? "" : ", footer out of view"}`).join("; ")}` : ""}${errors.length ? `; errors: ${errors.join(" | ")}` : ""}`);
      if (theme === "light") {
        for (const [i, id] of ["what", "how", "present"].entries()) {
          await page.click(`.vc-guide__rail .vc-step__button >> nth=${[0, 1, 3][i]}`);
          await page.waitForTimeout(100);
          await page.screenshot({ path: path.join(OUT, `${width}x${height}-${id}.png`) });
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`(Vici's check from ${path.relative(APP_ROOT, dir) || dir}; screenshots in ${OUT})`);
end("GUIDE OK");

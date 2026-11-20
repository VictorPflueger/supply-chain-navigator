// Contrast: every visible text meets WCAG 2.2 AA (4.5:1, large text 3:1) against what is painted
// behind it, in the light and the dark theme, at 1920 × 1080 and 1280 × 720: the guide's first and last
// chapters, the five steps (the decision unanswered and answered, the drafts open and approved), the
// scenario menu and the Start agent dialog. The measure is tests/lib/contrast.mjs; it first proves
// itself on a planted page.
// Usage: NODE_PATH="$(npm root -g)" node tests/contrast.mjs
import { launchBrowser, serveStatic, checks, STEP_IDS } from "./lib/harness.mjs";
import { contrastShortfalls, settle } from "./lib/contrast.mjs";

const server = await serveStatic();
const browser = await launchBrowser();
const { check, end } = checks();

try {
  // The measure catches a grey on grey and passes ink on paper.
  {
    const page = await browser.newPage();
    await page.setContent('<body style="background:#fff"><p style="color:#bbb">Faint text</p><p style="color:#222">Ink</p></body>');
    const r = await contrastShortfalls(page);
    check(r.measured === 2 && r.below.length === 1 && r.below[0].text === "Faint text", "control: the measure catches #bbb on white and passes #222");
    await page.close();
  }
  for (const [width, height] of [[1920, 1080], [1280, 720]]) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
      await ctx.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
      const page = await ctx.newPage();
      await page.goto(server.base);
      await page.waitForFunction(() => document.documentElement.dataset.boot === "ready");
      const below = [];
      let measured = 0;
      let states = 0;
      const measure = async (state) => {
        await page.waitForTimeout(120);
        await settle(page);
        const r = await contrastShortfalls(page);
        measured += r.measured;
        states += 1;
        for (const b of r.below) below.push(`${state}: "${b.text}" ${b.ratio}:1 < ${b.need}:1 (${b.color} on ${b.bg})`);
      };
      await measure("guide, chapter 1");
      await page.click(".vc-guide__rail .vc-step__button >> nth=-1");
      await measure("guide, the talk track");
      await page.keyboard.press("Escape");
      for (const id of STEP_IDS) {
        await page.click(`#steps [data-step="${id}"] button`);
        if (id === "prepare") await measure("prepare, before a decision");
        await measure(id);
        if (id === "propose") { await page.click('.option[data-recommended="true"] [data-action="approve"]'); await measure("propose, approved"); }
      }
      await page.click("#approve-all");
      await measure("prepare, approved");
      await page.click("#scenario-button");
      await measure("the scenario menu");
      await page.keyboard.press("Escape");
      await page.click("#start");
      await measure("Start agent");
      await page.keyboard.press("Escape");
      check(measured > 400 && !below.length, `${width} × ${height} ${theme}: ${measured} texts measured in ${states} states${below.length ? `; below AA: ${[...new Set(below)].slice(0, 8).join(" | ")}` : ", all at AA or better"}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
end("CONTRAST OK");

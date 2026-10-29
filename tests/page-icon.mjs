// The page icon: a prototype's mark is the icon its card shows on Victor's website, a Vici icon in a
// hexagon cell in the colour of the card's kind (lilac for a prototype, teal for a tech-showcase).
//   favicon   favicon.svg is exactly the card's cell drawn for small sizes (byte for byte);
//   page      the header and the loading screen show that cell with Vici's classes (the loading
//             screen's at vc-cell--xl), and the former logo is gone;
//   website   when a checkout of the website (VictorPflueger/VIP) sits next to this repository, its
//             data/prototypes.js still gives this prototype the same icon and kind. Without one,
//             that part is skipped and says so. If the card changes, the page icon changes with it.
// The same file in all four prototypes; the values are in tests/lib/prototype.mjs.
// Usage: node tests/page-icon.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { APP_ROOT } from "./lib/harness.mjs";
import { NAME, PAGE_ICON } from "./lib/prototype.mjs";

const results = [];
const check = (ok, what) => results.push([ok, what]);
const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");

// favicon.svg, byte for byte.
const favicon = read("favicon.svg");
check(favicon === PAGE_ICON.favicon, `favicon.svg is exactly the ${PAGE_ICON.tone} cell with the ${PAGE_ICON.icon} icon${favicon === PAGE_ICON.favicon ? "" : ` (${favicon.length} bytes, expected ${PAGE_ICON.favicon.length})`}`);
const html = read("index.html");
check(/<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/.test(html), "index.html names favicon.svg as the page's icon");

/** The page's hexagon cells in a stretch of markup: [{ classes, icon }]. */
function cells(markup) {
  const out = [];
  for (const m of markup.matchAll(/<span\b([^>]*)>\s*<span class="vc-icon vc-icon--([a-z0-9-]+)"><\/span>\s*<\/span>/g)) {
    const attrs = m[1];
    const classes = ((attrs.match(/\bclass="([^"]*)"/) || [])[1] || "").split(/\s+/).filter(Boolean);
    if (classes.includes("vc-cell")) out.push({ classes, icon: m[2], hidden: /\baria-hidden="true"/.test(attrs) });
  }
  return out;
}
const section = (re) => (html.match(re) || [])[0] || "";
const header = section(/<header\b[\s\S]*?<\/header>/);
const boot = section(/<div id="boot"[\s\S]*?<\/noscript>/);
const brand = section(/<div class="brand">[\s\S]*?<\/div>\s*<\/div>/);
const want = (c, extra = []) => c.icon === PAGE_ICON.icon && c.hidden && c.classes.includes(`vc-cell--${PAGE_ICON.tone}`) && extra.every((x) => c.classes.includes(x))
  && c.classes.every((x) => ["vc-cell", `vc-cell--${PAGE_ICON.tone}`, ...extra].includes(x));
const inHeader = cells(brand || header);
check(inHeader.length === 1 && want(inHeader[0]), `the header's brand shows the cell: vc-cell vc-cell--${PAGE_ICON.tone} with vc-icon--${PAGE_ICON.icon}, hidden from screen readers (${JSON.stringify(inHeader)})`);
check(/class="brand-name">[^<]+</.test(brand) && brand.includes(NAME), `the header keeps the name "${NAME}" beside the cell`);
const inBoot = cells(boot);
check(inBoot.length === 1 && want(inBoot[0], ["vc-cell--xl"]), `the loading screen shows the cell at vc-cell--xl next to the name (${JSON.stringify(inBoot)})`);
check(!/class="brand-mark"/.test(html), "the former logo (brand-mark) is gone from the page");

// The website's card, when its checkout sits next to this repository.
const site = ["VIP", "vip"].map((d) => path.resolve(APP_ROOT, "..", d, "data", "prototypes.js")).find((f) => existsSync(f));
let skipped = null;
if (site) {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(site, "utf8"), context, { filename: site });
  const card = (context.window.PROTOTYPES || []).find((p) => p.name === NAME);
  const kind = (card?.kind || "prototype").trim().toLowerCase();
  check(!!card, `the website lists ${NAME} (${path.relative(APP_ROOT, site)})`);
  check(card?.icon === PAGE_ICON.icon, `the website's card shows the icon "${PAGE_ICON.icon}" (it shows "${card?.icon}")`);
  check(kind === PAGE_ICON.kind, `the website's card is a ${PAGE_ICON.kind} (it is a ${kind})`);
} else {
  skipped = "no checkout of the website (VIP) next to this repository: its card was not compared";
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (skipped) console.log(`SKIP  ${skipped}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) {
  console.error(`\n${failed} page-icon check(s) failed.`);
  process.exit(1);
}
console.log(`\nThe page icon matches ${NAME}'s card${skipped ? " (the website itself not compared)" : " on the website"}.`);

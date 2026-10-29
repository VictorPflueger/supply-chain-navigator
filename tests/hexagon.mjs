// The hexagon rule of Vici (its hexagon guideline): nothing in the app is round. What would be a
// circle is a flat-top hexagon, what would be a pill a hex capsule with pointed ends. Modelled on
// Vici's scripts/check-hex.mjs, in three parts:
//   1. round CSS in the app's own files: a border-radius of 25 % or more, 40 px or more or 2.5 rem or
//      more, viewport units in a radius, circle() or ellipse() in a clip path, a radial gradient in a
//      background or a mask;
//   2. round drawing code in its HTML, CSS and JavaScript: <circle>, <ellipse>, a <rect> whose rx is
//      at least half its height, "circle" or "ellipse" handed to anything that creates elements,
//      L.circle and L.circleMarker, arc( and ellipse( on a canvas, and SVG path data with arc commands;
//   3. the rendered app at the main states of a simulation run, in both themes: any element (or
//      ::before and ::after) whose corner radius is at least half its height or width, round clip
//      paths and radial gradients in the computed styles, and circle, ellipse, pill-shaped rect and
//      arc-command path elements.
// Each part first proves on planted examples that it catches every kind, and the test fails if one
// slips through. vici/ is Vici's own (Vici checks it) and vendor/ holds other people's libraries; tests/
// and tools/ are not part of the app. An exception needs its reason, written in EXCEPTIONS below.
// The same file in all four prototypes; the states to visit are in tests/lib/prototype.mjs.
// Usage: node tests/hexagon.mjs             (all three parts)
//        node tests/hexagon.mjs files       (parts 1 and 2 only, no browser)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT, ONLY, launchBrowser, serveStatic, NETWORK_NOISE } from "./lib/harness.mjs";
import { NAME, hexagonTour } from "./lib/prototype.mjs";

/**
 * Allowed round things, each with its reason: { file or state, match (a substring of the finding),
 * reason }. Empty: nothing in the app is round.
 */
const EXCEPTIONS = [];

const SKIP_DIRS = new Set(["vici", "vendor", "tests", "tools", "node_modules", ".git", ".github"]);
const KINDS = { ".css": "css", ".html": "html", ".svg": "svg", ".js": "js", ".mjs": "js" };

// ------------------------------------------------------------------------------- 1. round CSS
const RADIUS = /border-(?:[a-z]+-)*radius\s*:\s*([^;}"'`]+)/gi;
function roundRadii(text) {
  const hits = [];
  for (const m of text.matchAll(RADIUS)) {
    const value = m[1].trim();
    const round = value.split(/[\s/]+/).some((part) => {
      const n = parseFloat(part);
      if (/^calc\(|^var\(|^min\(|^max\(|^clamp\(/.test(part)) return false;
      if (Number.isNaN(n)) return false;
      if (/%$/.test(part)) return n >= 25;
      if (/px$/.test(part)) return n >= 40;
      if (/r?em$/.test(part)) return n >= 2.5;
      if (/(vmax|vmin|vh|vw|dvh|svh|lvh|dvw|svw|lvw|vi|vb)$/.test(part)) return true;
      return false;
    });
    if (round) hits.push(`border-radius: ${value}`);
  }
  // The same in JavaScript: style.borderRadius = "50%", setProperty("border-radius", "999px").
  for (const m of text.matchAll(/borderRadius\s*=\s*["'`]([^"'`]+)["'`]|setProperty\(\s*["'`]border-(?:[a-z]+-)*radius["'`]\s*,\s*["'`]([^"'`]+)["'`]/g)) {
    const v = (m[1] || m[2]).trim();
    if (roundRadii(`border-radius: ${v};`).length) hits.push(`border-radius set from code: ${v}`);
  }
  return hits;
}
function roundPaint(text) {
  const hits = [];
  for (const m of text.matchAll(/(clip-path|shape-outside|offset-path)\s*:\s*[^;}]*\b(circle|ellipse)\(/gi)) hits.push(m[0].slice(0, 80));
  for (const m of text.matchAll(/(?:background(?:-image)?|(?:-webkit-)?mask(?:-image)?)\s*:\s*[^;}]*\b(?:repeating-)?radial-gradient\(/gi)) hits.push(m[0].slice(0, 80));
  return hits;
}

// ---------------------------------------------------------------------- 2. round drawing code
function roundDrawing(text) {
  const hits = [];
  for (const m of text.matchAll(/<(circle|ellipse)\b/gi)) hits.push(`<${m[1]}>`);
  // A rounded rectangle that is really a pill or a circle: rx at least half the height or width.
  for (const m of text.matchAll(/<rect\b[^>]*>/gi)) {
    const tag = m[0];
    const num = (a) => parseFloat((tag.match(new RegExp(`\\b${a}=["']([\\d.]+)`)) || [])[1]);
    const rx = num("rx") || num("ry");
    const h = num("height");
    const w = num("width");
    if (rx && ((h && rx >= h / 2 - 0.01) || (w && rx >= w / 2 - 0.01))) hits.push(tag.slice(0, 80));
  }
  // "circle" or "ellipse" handed to something that creates elements: createElementNS(ns, "circle"),
  // the apps' helpers svg("circle", …) and s("ellipse", …), document.createElement("circle").
  for (const m of text.matchAll(/createElement(?:NS)?\(\s*(?:[^,()]+,\s*)?["'`](circle|ellipse)["'`]/g)) hits.push(m[0]);
  for (const m of text.matchAll(/\b(?!createElement)[A-Za-z_$][\w$]*\(\s*["'`](circle|ellipse)["'`]/g)) hits.push(m[0]);
  for (const m of text.matchAll(/\bL\.(circle|circleMarker)\s*\(/g)) hits.push(m[0]);
  for (const m of text.matchAll(/\.(arc|arcTo|ellipse)\s*\(/g)) hits.push(`canvas ${m[0]}`);
  // Path data with arc commands, in markup (d="…") and in code that sets it (setAttribute("d", …)).
  for (const m of text.matchAll(/\bd\s*=\s*(["'])([^"']*)\1/g)) if (/[Aa]\s*[-+.\d$]/.test(m[2]) && /^[\sMmLlHhVvCcSsQqTtAaZz\d.,+\-e${}]*$/.test(m[2])) hits.push(`path with an arc: d="${m[2].slice(0, 40)}"`);
  for (const m of text.matchAll(/setAttribute\(\s*["'`]d["'`]\s*,\s*(["'`])([\s\S]*?)\1\s*\)/g)) if (/(^|[\s\d}])[Aa]\s*[-+.\d$]/.test(m[2])) hits.push(`path with an arc: ${m[0].slice(0, 60)}`);
  return hits;
}

/** Everything round in one file's text. CSS data URIs are decoded first, so icons drawn in them count. */
function scan(name, text, kind) {
  const plain = kind === "css" ? text + "\n" + decodeURIComponent(text.replace(/%(?![0-9a-f]{2})/gi, "%25")) : text;
  const hits = [];
  if (kind === "css" || kind === "html" || kind === "js") hits.push(...roundRadii(plain), ...roundPaint(plain));
  hits.push(...roundDrawing(plain));
  return [...new Set(hits)].map((h) => `${name}: ${h}`);
}

// Planted examples: each one must be caught, or the scanner is broken.
const FIXTURES = [
  [".a { border-radius: 50%; }", "css"],
  [".a { border-radius: 9999px; }", "css"],
  [".a { border-top-left-radius: 3rem; }", "css"],
  [".a { border-radius: 2vw; }", "css"],
  [".a { clip-path: circle(40%); }", "css"],
  [".a { clip-path: ellipse(40% 30%); }", "css"],
  [".a { mask-image: radial-gradient(circle, #000 60%, transparent 61%); }", "css"],
  [".a { background-image: radial-gradient(circle at 1px 1px, #000 1px, transparent 1.4px); }", "css"],
  [".a { background: url(\"data:image/svg+xml,%3Csvg%3E%3Ccircle r='2'/%3E%3C/svg%3E\"); }", "css"],
  ['<span style="border-radius: 999px">pill</span>', "html"],
  ['<svg><circle cx="5" cy="5" r="4"/></svg>', "svg"],
  ['<svg><ellipse cx="5" cy="5" rx="4" ry="2"/></svg>', "svg"],
  ['<svg><rect width="20" height="10" rx="5"/></svg>', "svg"],
  ['<svg><path d="M2 12 A10 10 0 0 1 22 12"/></svg>', "svg"],
  ['const c = document.createElementNS(SVG, "circle");', "js"],
  ['const c = svg("circle", { r: 4 });', "js"],
  ["const e = s('ellipse', {});", "js"],
  ["L.circleMarker([52, 13], { radius: 6 }).addTo(map);", "js"],
  ["L.circle([52, 13], { radius: 600 });", "js"],
  ["ctx.beginPath(); ctx.arc(10, 10, 5, 0, Math.PI * 2);", "js"],
  ["ctx.ellipse(10, 10, 5, 3, 0, 0, Math.PI * 2);", "js"],
  ["path.setAttribute(\"d\", `M ${x} ${y} A ${r} ${r} 0 0 1 ${x2} ${y}`);", "js"],
  ["el.style.borderRadius = \"50%\";", "js"],
  ["el.style.setProperty(\"border-radius\", \"999px\");", "js"],
  ["const icon = '<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9\"/></svg>';", "js"]
];
const CLEAN = [
  [".a { border-radius: var(--vc-radius-md); clip-path: var(--vc-hex); border-radius: 6px; }", "css"],
  ['<svg><rect width="20" height="10" rx="2"/><polygon points="0,5 3,0 9,0 12,5 9,10 3,10"/><path d="M3 12 L7.5 4.21 H16.5"/></svg>', "svg"],
  ["const p = svg(\"polygon\", { points }); el.style.setProperty(\"--x\", \"4px\"); const label = 'Ascending order';", "js"]
];

function checkFixtures(fixtures, clean, run) {
  const missed = fixtures.filter(([text, kind]) => !run("fixture", text, kind).length).map(([text]) => text);
  const flagged = clean.filter(([text, kind]) => run("clean", text, kind).length).map(([text, kind]) => `${text} → ${run("clean", text, kind).join("; ")}`);
  return { missed, flagged };
}

function appFiles(dir = APP_ROOT) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...appFiles(path.join(dir, e.name))); continue; }
    if (KINDS[path.extname(e.name)]) out.push(path.join(dir, e.name));
  }
  return out;
}

const excepted = (where, finding) => EXCEPTIONS.find((x) => (where === x.file || where === x.state || !x.file && !x.state) && finding.includes(x.match));

const failures = [];
const report = [];

// Parts 1 and 2 ----------------------------------------------------------------------------------
{
  const { missed, flagged } = checkFixtures(FIXTURES, CLEAN, scan);
  for (const m of missed) failures.push(`self-test: the file scan missed a planted example: ${m}`);
  for (const f of flagged) failures.push(`self-test: the file scan flagged a legitimate rule: ${f}`);
  const files = appFiles();
  let found = 0;
  for (const f of files) {
    const rel = path.relative(APP_ROOT, f).split(path.sep).join("/");
    for (const hit of scan(rel, readFileSync(f, "utf8"), KINDS[path.extname(f)])) {
      const x = excepted(rel, hit);
      if (x) report.push(`  allowed: ${hit} (${x.reason})`);
      else { failures.push(hit); found += 1; }
    }
  }
  report.push(`${missed.length ? "FAIL" : "PASS"}  files: the scan caught ${FIXTURES.length - missed.length}/${FIXTURES.length} planted examples and scanned ${files.length} of ${NAME}'s files: ${found ? `${found} round thing(s)` : "nothing round"}`);
}

// Part 3: the rendered app -------------------------------------------------------------------------
/** Runs in the page: everything round that is drawn. Returns findings as strings. */
function roundInPage() {
  const out = [];
  const name = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const c = (el.getAttribute("class") || "").trim();
    const cls = c ? `.${c.split(/\s+/).slice(0, 3).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const px = (v, size) => (/%$/.test(v) ? (parseFloat(v) / 100) * size : parseFloat(v));
  const CORNERS = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
  const look = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    if (cs.display === "none") return;
    if (pseudo && (cs.content === "none" || cs.content === "normal")) return;
    let w;
    let h;
    if (pseudo) { w = parseFloat(cs.width); h = parseFloat(cs.height); }
    else if (el instanceof HTMLElement) { w = el.offsetWidth; h = el.offsetHeight; }
    else { const r = el.getBoundingClientRect(); w = r.width; h = r.height; }
    const what = `${name(el)}${pseudo || ""}`;
    if (w > 0 && h > 0) {
      for (const c of CORNERS) {
        const [a, b = a] = cs.getPropertyValue(c).trim().split(/\s+/);
        const rh = px(a, w);
        const rv = px(b, h);
        if ((rh > 0 && rh >= w / 2 - 0.5) || (rv > 0 && rv >= h / 2 - 0.5)) { out.push(`${what}: corner radius ${cs.getPropertyValue(c)} on ${Math.round(w)}×${Math.round(h)} px`); break; }
      }
    }
    const clip = cs.clipPath || "";
    if (/\b(circle|ellipse)\(/.test(clip)) out.push(`${what}: clip-path ${clip.slice(0, 40)}`);
    for (const prop of ["background-image", "mask-image", "-webkit-mask-image"]) {
      const v = cs.getPropertyValue(prop) || "";
      if (/radial-gradient\(/.test(v)) out.push(`${what}: ${prop} with a radial gradient`);
    }
  };
  for (const el of document.querySelectorAll("*")) {
    look(el, null);
    if (el instanceof HTMLElement) { look(el, "::before"); look(el, "::after"); }
  }
  for (const el of document.querySelectorAll("circle, ellipse")) out.push(`<${el.tagName.toLowerCase()}> in ${name(el.ownerSVGElement || el)}`);
  for (const el of document.querySelectorAll("rect")) {
    const r = el.getBoundingClientRect();
    const rx = parseFloat(el.getAttribute("rx") || el.getAttribute("ry") || "0");
    const hh = parseFloat(el.getAttribute("height") || "0") || r.height;
    const ww = parseFloat(el.getAttribute("width") || "0") || r.width;
    if (rx > 0 && (rx >= hh / 2 - 0.01 || rx >= ww / 2 - 0.01)) out.push(`<rect rx="${rx}"> in ${name(el.ownerSVGElement || el)}`);
  }
  for (const el of document.querySelectorAll("path")) if (/[Aa]/.test(el.getAttribute("d") || "")) out.push(`<path> with an arc in ${name(el.ownerSVGElement || el)}`);
  return [...new Set(out)];
}

const PLANTED_PAGE = `<!doctype html><html><head><style>
  .round { width: 40px; height: 40px; border-radius: 50%; background: #333; }
  .pill { width: 120px; height: 24px; border-radius: 12px; background: #333; }
  .bracket { width: 60px; height: 6px; border-radius: 0 0 4px 4px; border: 2px solid #333; border-top: 0; }
  .ring::after { content: ""; display: block; width: 30px; height: 30px; border-radius: 999px; border: 2px solid #333; }
  .clip { width: 40px; height: 40px; clip-path: circle(50%); background: #333; }
  .dots { width: 80px; height: 40px; background-image: radial-gradient(circle at 1px 1px, #333 1px, transparent 1.4px); }
  .fine { width: 80px; height: 40px; border-radius: 6px; background: #ccc; clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); }
</style></head><body>
  <div class="round"></div><div class="pill"></div><div class="bracket"></div><div class="ring"></div>
  <div class="clip"></div><div class="dots"></div><div class="fine"></div>
  <svg width="200" height="60"><circle cx="10" cy="10" r="8"/><ellipse cx="40" cy="10" rx="8" ry="4"/>
    <rect x="60" y="0" width="40" height="20" rx="10"/><path d="M110 20 A10 10 0 0 1 130 20"/>
    <polygon points="140,10 145,1 155,1 160,10 155,19 145,19"/></svg>
</body></html>`;
const PLANTED_KINDS = [".round", ".pill", ".bracket", ".ring::after", ".clip", ".dots", "<circle>", "<ellipse>", "<rect rx", "<path> with an arc"];

const filesOnly = ONLY.includes("files");
if (!filesOnly) {
  const browser = await launchBrowser();
  try {
    // The inspector proves itself on a planted page first.
    {
      const page = await browser.newPage();
      await page.setContent(PLANTED_PAGE);
      const found = await page.evaluate(roundInPage);
      const missed = PLANTED_KINDS.filter((k) => !found.some((f) => f.includes(k)));
      const wrong = found.filter((f) => f.includes(".fine") || f.includes("polygon"));
      for (const m of missed) failures.push(`self-test: the page check missed a planted example: ${m}`);
      for (const w of wrong) failures.push(`self-test: the page check flagged a hexagon: ${w}`);
      report.push(`${missed.length || wrong.length ? "FAIL" : "PASS"}  page check: caught ${PLANTED_KINDS.length - missed.length}/${PLANTED_KINDS.length} planted examples`);
      await page.close();
    }
    const port = 8790 + Math.floor(Math.random() * 300);
    const server = await serveStatic(APP_ROOT, port);
    try {
      for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, colorScheme: theme });
        await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
        await context.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked storage */ } }, theme);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e.message || e)));
        page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
        const states = [];
        const visit = async (state, { settle = 250 } = {}) => {
          await page.waitForTimeout(settle);
          const found = await page.evaluate(roundInPage);
          let bad = 0;
          for (const f of found) {
            const x = excepted(state, f);
            if (x) report.push(`  allowed (${theme}, ${state}): ${f} (${x.reason})`);
            else { failures.push(`${theme}, ${state}: ${f}`); bad += 1; }
          }
          states.push(`${state}${bad ? ` (${bad})` : ""}`);
        };
        try {
          await page.goto(server.base);
          await hexagonTour(page, visit);
        } catch (e) {
          failures.push(`${theme}: the tour stopped: ${String(e.message || e).split("\n")[0]}`);
        }
        for (const e of errors) failures.push(`${theme}: page error: ${e}`);
        report.push(`${failures.some((f) => f.startsWith(`${theme},`) || f.startsWith(`${theme}:`)) ? "FAIL" : "PASS"}  rendered, ${theme} theme: ${states.join("; ")}`);
        await context.close();
      }
    } finally {
      await server.close();
    }
  } finally {
    await browser.close();
  }
}

console.log(report.join("\n"));
if (failures.length) {
  console.error(`\n${failures.map((f) => `✗ ${f}`).join("\n")}\n\n${failures.length} round thing(s) or failed self-test(s). Make them hexagons (Vici's --vc-hex, vc-hex, vc-capsule, vc-cell), or add an exception with its reason.`);
  process.exit(1);
}
console.log(`\nNothing round in ${NAME}.`);

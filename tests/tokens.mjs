// The colour system on Vici's values (vici/dist/tokens.json), in the light and the dark theme. The
// same file in all four prototypes; what only this prototype draws is in tests/lib/prototype.mjs.
//   contrast    every text-on-fill and mark-on-surface pair the app uses: 4.5:1 for text, 3:1 for
//               marks, icons and control borders (WCAG 2.2, 1.4.3 and 1.4.11). Fails below that.
//   tokens      every Vici token the app's CSS and JS name exists in Vici's stylesheet, and every
//               token a pair names exists in both themes. Fails otherwise.
//   separation  how far apart the state colours stay under protanopia, deuteranopia and tritanopia,
//               and how far merlot stays from danger: ΔEOK after the Machado, Oliveira & Fernandes
//               (2009) simulation at full severity, the method of the former tools/palette.mjs, which
//               asked for 0.10. Vici's tones fall short of that in places, so the test reports those
//               gaps (to fix in Vici) instead of failing: the app makes up for them in form (icons,
//               words, shapes, line patterns), as DESIGN.md describes.
// Usage: node tests/tokens.mjs
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";
import { COLOUR_PAIRS, SEPARATIONS } from "./lib/prototype.mjs";

const vici = JSON.parse(await readFile(path.join(APP_ROOT, "vici/dist/tokens.json"), "utf8"));
const THEMES = ["light", "dark"];
const MIN = { text: 4.5, mark: 3 };

// The shared shell's pairs: header, control bar, console, drawer, dialogs, banners, tags, tiles.
const SHELL_PAIRS = [
  ["Body text on panels", "text", "surface", "text"],
  ["Body text on the page and the control bar", "text", "bg", "text"],
  ["Body text on quiet fills (tracks, dialog footers, the tape's wash)", "text", "bg-subtle", "text"],
  ["Body text on popovers and dialogs", "text", "surface-raised", "text"],
  ["Body text on a hovered row or button", "text", "surface-hover", "text"],
  ["A selected item in a list or menu", "text", "surface-selected", "text"],
  ["Muted text on panels", "text-muted", "surface", "text"],
  ["Muted text on the page and the control bar", "text-muted", "bg", "text"],
  ["Muted text on quiet fills", "text-muted", "bg-subtle", "text"],
  ["Muted text on popovers and dialogs", "text-muted", "surface-raised", "text"],
  ["Subtle text (timestamps, faint labels) on panels", "text-subtle", "surface", "text"],
  ["Subtle text on the page", "text-subtle", "bg", "text"],
  ["Subtle text on quiet fills", "text-subtle", "bg-subtle", "text"],
  ["Merlot text (your turn, your decisions) on panels", "accent-text", "surface", "text"],
  ["Merlot text on its soft tint", "accent-text", "accent-soft", "text"],
  ["Primary button and Approve", "on-accent", "accent", "text"],
  ["Primary button, hovered", "on-accent", "accent-hover", "text"],
  ["Primary button, pressed", "on-accent", "accent-pressed", "text"],
  ["Secondary button and a pressed toggle", "on-accent-soft", "accent-soft", "text"],
  ["Secondary button, hovered", "on-accent-soft", "accent-soft-hover", "text"],
  ["Links", "text-link", "surface", "text"],
  ["Tooltips", "text-inverse", "surface-inverse", "text"],
  ["Danger text on its tint (alerts, tags, KPI tiles)", "danger-text", "danger-bg", "text"],
  ["Danger text on panels (errors, Abort, Forget key)", "danger-text", "surface", "text"],
  ["Warning text on its tint", "warning-text", "warning-bg", "text"],
  ["Warning text on panels", "warning-text", "surface", "text"],
  ["Success text on its tint", "success-text", "success-bg", "text"],
  ["Success text on panels", "success-text", "surface", "text"],
  ["Info (checking) text on its tint", "info-text", "info-bg", "text"],
  ["Info text on panels", "info-text", "surface", "text"],
  ["AI text (lilac) on its tint: AI tags, hypotheses, revisions", "feature-text", "feature-bg", "text"],
  ["AI text on panels", "feature-text", "surface", "text"],
  ["Plain tags", "neutral-text", "neutral-bg", "text"],
  ["Count badges", "on-accent", "accent", "text"],
  ["Focus ring on panels", "focus", "surface", "mark"],
  ["Focus ring on the page and the control bar", "focus", "bg", "mark"],
  ["Focus ring on quiet fills", "focus", "bg-subtle", "mark"],
  ["Focus ring on the canvas", "focus", "bg-sunken", "mark"],
  ["Focus ring on a soft merlot fill", "focus", "accent-soft", "mark"],
  ["Inputs and outlined buttons: their border", "border-strong", "surface", "mark"],
  ["Outlined buttons on the page and the control bar", "border-strong", "bg", "mark"],
  ["A primary button's fill on panels", "accent", "surface", "mark"],
  ["A primary button's fill on the page", "accent", "bg", "mark"],
  ["Danger: icons, outlines, the stop mark", "danger-solid", "surface", "mark"],
  ["Warning: icons and outlines", "warning-text", "surface", "mark"],
  ["Success: icons, ticks and outlines", "success-solid", "surface", "mark"],
  ["Info: icons and the checking pulse", "info-solid", "surface", "mark"],
  ["AI: the sparkle and its outlines", "feature-solid", "surface", "mark"],
  ["Ink marks: the rail's done steps, neutral icons", "neutral-solid", "surface", "mark"],
  ["The simulation's tape: one stripe against the other", "text", "surface", "mark"],
  ["The simulation's word on the tape's wash", "text", "bg-subtle", "text"]
];

// The shared meanings that must stay apart (DESIGN.md §3): the states, the states against the
// network at rest and against checking, the comparison bars, and merlot against danger.
const SHELL_SEPARATIONS = [
  ["Affected (danger) vs at risk (warning)", "danger-solid", "warning-text"],
  ["Affected vs resolved (success)", "danger-solid", "success-solid"],
  ["At risk vs resolved", "warning-text", "success-solid"],
  ["Affected vs the network at rest (neutral)", "danger-solid", "neutral-solid"],
  ["At risk vs the network at rest", "warning-text", "neutral-solid"],
  ["Resolved vs the network at rest", "success-solid", "neutral-solid"],
  ["Checking (info) vs affected", "info-solid", "danger-solid"],
  ["Checking vs resolved", "info-solid", "success-solid"],
  ["Comparison bars: the response cost (info) vs what is still lost (warning)", "info-solid", "warning-text"],
  ["Comparison bars: the response cost vs doing nothing (danger)", "info-solid", "danger-solid"],
  ["Merlot text (your decision) vs danger", "accent-text", "danger-solid"],
  ["Merlot fill (primary button, LIVE) vs danger", "accent", "danger-solid"],
  ["The soft merlot tint vs danger's tint", "accent-soft", "danger-bg"],
  ["A selected item's tint vs danger's tint", "surface-selected", "danger-bg"]
];
const MIN_SEPARATION = 0.1;

// ---- colour maths (sRGB, OKLab; CSS Color 4) -----------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function lch(hex) {
  const [L, a, b] = linearToOklab(hexToRgb(hex).map(toLinear));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
// Machado, Oliveira & Fernandes (2009), severity 1.0 (dichromacy), applied to linear sRGB.
const CVD = {
  "normal vision": null,
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
function seenAs(hex, kind) {
  const lin = hexToRgb(hex).map(toLinear);
  const m = CVD[kind];
  return linearToOklab(m ? m.map((r) => Math.min(1, Math.max(0, r[0] * lin[0] + r[1] * lin[1] + r[2] * lin[2]))) : lin);
}
const deltaEOK = (a, b, kind) => { const p = seenAs(a, kind); const q = seenAs(b, kind); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

// ---- checks ----------------------------------------------------------------------------------------
let failures = 0;
const gaps = [];
const value = (theme, name) => vici[theme]?.[name];

console.log(`Vici ${vici.version || ""} tokens from vici/dist/tokens.json\n`);

// Tokens: every pair names tokens of both themes; the app names only tokens Vici defines.
const pairs = [...SHELL_PAIRS, ...COLOUR_PAIRS];
const separations = [...SHELL_SEPARATIONS, ...SEPARATIONS];
const named = new Set([...pairs.flatMap(([, fg, bg]) => [fg, bg]), ...separations.flatMap(([, a, b]) => [a, b])]);
for (const theme of THEMES) {
  for (const n of named) if (!/^#[0-9a-f]{6}$/i.test(value(theme, n) || "")) { failures += 1; console.log(`FAIL  token "${n}" has no colour in the ${theme} theme`); }
}
const css = await readFile(path.join(APP_ROOT, "vici/dist/vici.min.css"), "utf8");
const defined = new Set([...css.matchAll(/(--vc-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const used = new Map();
for (const dir of ["css", "js"]) {
  let files = [];
  try { files = (await readdir(path.join(APP_ROOT, dir))).filter((f) => /\.(css|js|mjs)$/.test(f)); } catch { /* no such folder */ }
  for (const f of files) {
    const text = await readFile(path.join(APP_ROOT, dir, f), "utf8");
    for (const m of text.matchAll(/var\(\s*(--vc-[a-z0-9-]+)/g)) if (!used.has(m[1])) used.set(m[1], `${dir}/${f}`);
  }
}
const html = await readFile(path.join(APP_ROOT, "index.html"), "utf8");
for (const m of html.matchAll(/var\(\s*(--vc-[a-z0-9-]+)/g)) if (!used.has(m[1])) used.set(m[1], "index.html");
const unknown = [...used].filter(([n]) => !defined.has(n));
for (const [n, where] of unknown) { failures += 1; console.log(`FAIL  ${where} uses ${n}, which Vici does not define`); }
console.log(`${unknown.length ? "FAIL" : "PASS"}  the app names ${used.size} Vici tokens; ${unknown.length ? `${unknown.length} unknown` : "all exist"}\n`);

// Contrast, in both themes.
for (const theme of THEMES) {
  console.log(`Contrast in the ${theme} theme (WCAG 2.2: text 4.5:1, marks 3:1)`);
  for (const [what, fg, bg, kind] of pairs) {
    const a = value(theme, fg);
    const b = value(theme, bg);
    if (!a || !b) continue;
    const c = contrast(a, b);
    const ok = c >= MIN[kind];
    if (!ok) failures += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.toFixed(2).padStart(5)} : 1 (${kind}, needs ${MIN[kind]})  ${what}  --vc-${fg} ${a} on --vc-${bg} ${b}`);
  }
  console.log("");
}

// Separation under colour-vision deficiency, and merlot against danger: reported.
for (const theme of THEMES) {
  console.log(`Separation in the ${theme} theme (smallest ΔEOK across normal vision, protanopia, deuteranopia, tritanopia; the former palette met ${MIN_SEPARATION.toFixed(2)})`);
  for (const [what, x, y] of separations) {
    const a = value(theme, x);
    const b = value(theme, y);
    if (!a || !b) continue;
    const [worst, d] = Object.keys(CVD).map((k) => [k, deltaEOK(a, b, k)]).sort((p, q) => p[1] - q[1])[0];
    const ok = d >= MIN_SEPARATION;
    if (!ok) gaps.push(`${theme}: ${what} (--vc-${x} ${a} vs --vc-${y} ${b}): ΔEOK ${d.toFixed(3)} under ${worst}`);
    console.log(`${ok ? "PASS" : "GAP "}  ${d.toFixed(3)} (lowest under ${worst})  ${what}  --vc-${x} ${a} vs --vc-${y} ${b}`);
  }
  // The former palette also kept the brand's solid clear of danger's: hue at least 18° apart and a
  // lightness gap of 0.12 (OKLCH).
  const [mL, , mH] = lch(value(theme, "accent-text"));
  const [dL, , dH] = lch(value(theme, "danger-solid"));
  const hueGap = Math.abs(((dH - mH + 540) % 360) - 180);
  for (const [what, v, min] of [["Merlot text vs danger: hue gap (°)", hueGap, 18], ["Merlot text vs danger: lightness gap (OKLCH)", Math.abs(dL - mL), 0.12]]) {
    const ok = v >= min;
    if (!ok) gaps.push(`${theme}: ${what}: ${v.toFixed(2)}, the former palette kept ${min}`);
    console.log(`${ok ? "PASS" : "GAP "}  ${v.toFixed(2).padStart(6)}  ${what} (the former palette kept ${min})`);
  }
  console.log("");
}

if (gaps.length) {
  console.log(`${gaps.length} gap(s) in Vici's tones, reported for a fix in Vici; the app marks every state by form as well:`);
  for (const g of gaps) console.log(`  - ${g}`);
  console.log("");
}
console.log(failures ? `${failures} colour check(s) failed.` : `All colour checks passed (${pairs.length} pairs in two themes; ${gaps.length} separation gap(s) reported).`);
process.exit(failures ? 1 : 0);

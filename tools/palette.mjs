// Navigator colour system generator: every colour in the app is derived from one source colour,
// the brand burgundy, in the perceptual OKLCH space (CSS Color 4).
//
//   node tools/palette.mjs           regenerate css/tokens.css and design/tokens.json
//   node tools/palette.mjs --check   verify contrast, colour-blind separation and that both files
//                                    are up to date (no writes)
//
// Method (DESIGN.md §4 and §5):
//   1. Convert the source colour to OKLCH and build 12-step scales with an even perceptual lightness
//      ladder (functional steps as in Radix Colors: 1–2 backgrounds, 3–5 component backgrounds,
//      6–8 borders, 9–10 solid colours, 11–12 text).
//   2. Neutrals ("ink") carry the burgundy hue at very low chroma, so every grey belongs to the brand.
//   3. Where colour is atmosphere (slate, info, violet), hues are harmonised towards the brand the way
//      Material's Blend.harmonize does it: rotate by half the hue distance, at most 15°.
//      Where colour is meaning (danger, warning, success: the network states), hues are fixed and
//      chosen so the three stay apart for colour-blind viewers. Harmonising them would pull green
//      towards yellow and red towards burgundy, which is exactly what makes states hard to tell apart.
//   4. Every colour is gamut-mapped into sRGB by reducing chroma only (lightness and hue are kept).
//   5. WCAG 2.2 contrast is checked for every text and state pairing the UI uses.
//   6. Colour-vision deficiency: the state colours, the cost bars and brand vs danger are simulated for
//      protanopia, deuteranopia and tritanopia (Machado, Oliveira & Fernandes 2009, full severity) and
//      must stay at least ΔEOK 0.10 apart (five times the 0.02 just-noticeable difference CSS Color 4
//      uses). The run fails if any check fails.
// Output: css/tokens.css (custom properties, sRGB hex with the OKLCH source in a comment) and
// design/tokens.json (W3C Design Tokens format 2025.10, colours in OKLCH with a hex fallback).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

// ---- the one input -----------------------------------------------------------------------------------
const SOURCE = "#7a1e3a"; // Navigator burgundy

// ---- colour maths: sRGB ↔ OKLab ↔ OKLCH (Björn Ottosson's OKLab, CSS Color 4 matrices) -------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}
function rgbToHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}
function hexToOklch(hex) {
  const [L, a, b] = linearToOklab(hexToRgb(hex).map(toLinear));
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}
function oklchToLinear([L, C, h]) {
  const r = (h * Math.PI) / 180;
  return oklabToLinear([L, C * Math.cos(r), C * Math.sin(r)]);
}
const inGamut = (lin) => lin.every((v) => v >= -1e-5 && v <= 1 + 1e-5);

/** Reduce chroma (only) until the colour fits sRGB. */
function fit([L, C, h]) {
  if (inGamut(oklchToLinear([L, C, h]))) return [L, C, h];
  let lo = 0, hi = C;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear([L, mid, h]))) lo = mid; else hi = mid;
  }
  return [L, lo, h];
}
const oklchToHex = (lch) => rgbToHex(oklchToLinear(fit(lch)).map(toGamma));

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Material-style harmonisation: rotate hue towards the brand by half the distance, at most 15°. */
function harmonize(hue, towards) {
  const diff = ((towards - hue + 540) % 360) - 180; // signed shortest distance
  const rotation = Math.sign(diff) * Math.min(Math.abs(diff) * 0.5, 15);
  return (hue + rotation + 360) % 360;
}

// ---- scales ---------------------------------------------------------------------------------------------
const [srcL, srcC, srcH] = hexToOklch(SOURCE);

// Steps 1–8: one perceptual lightness ladder for every family (backgrounds → borders).
const LIGHT = [0.993, 0.981, 0.962, 0.941, 0.917, 0.886, 0.842, 0.772];
// Share of each family's peak chroma used by steps 1–8 (tints get gentler towards white).
const TINT = [0.04, 0.08, 0.16, 0.24, 0.32, 0.42, 0.55, 0.72];

/**
 * family: { hue, peak (chroma of the solid step), solid: [L9, L10], text: [L11, L12], chroma11/12 factors }
 * Steps 9–12 are set per family so that solids and text meet their contrast duties.
 */
function scale({ hue, peak, solid, text, textChroma = [1.0, 0.55], neutral = false, tint = 1 }) {
  const steps = [];
  for (let i = 0; i < 8; i++) steps.push([LIGHT[i], neutral ? peak * (0.25 + 0.75 * (i / 7)) : peak * TINT[i] * tint, hue]);
  steps.push([solid[0], peak, hue]);
  steps.push([solid[1], peak * 0.94, hue]);
  steps.push([text[0], peak * textChroma[0], hue]);
  steps.push([text[1], peak * textChroma[1], hue]);
  return steps.map(fit);
}

const FAMILIES = {
  // Brand: step 9 is the source colour itself. Its tints are kept dusty (75 % chroma), so the light
  // steps read as rosewood rather than candy pink.
  wine: scale({ hue: srcH, peak: srcC, solid: [srcL, srcL - 0.06], text: [srcL + 0.05, 0.27], textChroma: [1.05, 0.6], tint: 0.75 }),
  // Neutrals tinted with the brand hue (chroma ≈ 0.004–0.02).
  ink: scale({ hue: srcH, peak: 0.016, solid: [0.6, 0.545], text: [0.47, 0.255], textChroma: [1.1, 1.25], neutral: true }),
  // The supply network: a quiet slate, harmonised towards burgundy.
  slate: scale({ hue: harmonize(250, srcH), peak: 0.055, solid: [0.52, 0.47], text: [0.44, 0.27] }),
  // Network states, fixed hues (see header note 3). Red is deeper than amber and the green leans
  // blue (the "bluish green" of the Okabe–Ito palette), so the three differ in lightness and on the
  // blue–yellow axis, which survive red–green colour blindness. Danger also stays clear of burgundy.
  danger: scale({ hue: 29, peak: 0.19, solid: [0.535, 0.49], text: [0.46, 0.3] }),
  warning: scale({ hue: 57, peak: 0.15, solid: [0.655, 0.6], text: [0.5, 0.33] }),
  success: scale({ hue: 170, peak: 0.1, solid: [0.61, 0.565], text: [0.47, 0.3] }),
  // Verification and the money you choose to spend.
  info: scale({ hue: harmonize(250, srcH), peak: 0.12, solid: [0.58, 0.53], text: [0.47, 0.3] }),
  // The AI's voice: AI labels, hypotheses, revisions, what-if analyses.
  violet: scale({ hue: harmonize(295, srcH), peak: 0.15, solid: [0.56, 0.51], text: [0.47, 0.3] })
};

const HEX = {};
for (const [name, steps] of Object.entries(FAMILIES)) HEX[name] = steps.map(oklchToHex);
const WHITE = "#ffffff";

// ---- contrast duties (WCAG 2.2: 4.5:1 text, 3:1 non-text UI and state graphics) ----------------------
const step = (fam, n) => HEX[fam][n - 1];
const PAIRS = [
  ["Body text on paper", step("ink", 12), WHITE, 7],
  ["Body text on app background", step("ink", 12), step("ink", 2), 7],
  ["Muted text on paper", step("ink", 11), WHITE, 4.5],
  ["Muted text on app background", step("ink", 11), step("ink", 2), 4.5],
  ["Faint text on paper", step("ink", 10), WHITE, 4.5],
  ["Control border on paper (inputs, toggles)", step("ink", 9), WHITE, 3],
  ["Icon grey on paper", step("ink", 9), WHITE, 3],
  ["White on burgundy (primary buttons)", WHITE, step("wine", 9), 7],
  ["White on burgundy hover", WHITE, step("wine", 10), 7],
  ["Burgundy text on paper", step("wine", 11), WHITE, 4.5],
  ["Burgundy text on burgundy tint", step("wine", 11), step("wine", 3), 4.5],
  ["Focus ring (burgundy) on paper", step("wine", 9), WHITE, 3],
  ["Burgundy border on paper", step("wine", 7), WHITE, 1.5],
  ...["danger", "warning", "success", "info", "violet", "slate"].flatMap((f) => [
    [`${f} text on paper`, step(f, 11), WHITE, 4.5],
    [`${f} text on ${f} tint`, step(f, 11), step(f, 3), 4.5],
    [`${f} line or icon on paper`, step(f, 9), WHITE, 3]
  ]),
  ["Danger stroke on its map fill", step("danger", 9), step("danger", 6), 1.6]
];

// Brand and danger must stay apart: hue distance and a visible lightness gap for their solids.
const [wL, , wH] = FAMILIES.wine[8];
const [dL, , dH] = FAMILIES.danger[8];
const hueGap = Math.abs(((dH - wH + 540) % 360) - 180);
const DISTINCT = [["Burgundy vs danger: hue gap ≥ 18°", hueGap, 18], ["Burgundy vs danger: lightness gap ≥ 0.12", Math.abs(dL - wL), 0.12]];

// ---- colour-vision deficiency ---------------------------------------------------------------------------
// Machado, Oliveira & Fernandes (2009), "A physiologically-based model for simulation of color vision
// deficiency", IEEE TVCG 15(6). Severity 1.0 matrices (dichromacy, the worst case), applied to linear sRGB.
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
const deltaEOK = (a, b, kind) => Math.hypot(...seenAs(a, kind).map((v, i) => v - seenAs(b, kind)[i]));
// Pairs whose difference carries meaning on its own: the map states (and each against the quiet
// network), the three cost bars, and the brand against the disruption colour.
const SEPARATE = [
  ["Affected vs at risk (map states)", step("danger", 9), step("warning", 9)],
  ["Affected vs resolved", step("danger", 9), step("success", 9)],
  ["At risk vs resolved", step("warning", 9), step("success", 9)],
  ["Affected vs the supply network (slate)", step("danger", 9), step("slate", 9)],
  ["At risk vs the supply network", step("warning", 9), step("slate", 9)],
  ["Resolved vs the supply network", step("success", 9), step("slate", 9)],
  ["Cost bars: spend (info) vs remaining exposure (warning)", step("info", 9), step("warning", 9)],
  ["Cost bars: spend vs doing nothing (danger)", step("info", 9), step("danger", 9)],
  ["Burgundy (your decision) vs danger (disruption)", step("wine", 9), step("danger", 9)]
];
const MIN_SEPARATION = 0.1;

// ---- outputs ------------------------------------------------------------------------------------------------
const fmt = ([L, C, h]) => `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`;

function css() {
  const lines = [
    "/* Navigator colour primitives. GENERATED by tools/palette.mjs from the brand burgundy",
    ` * ${SOURCE} (${fmt([srcL, srcC, srcH])}). Do not edit by hand: change the generator and run`,
    " * `node tools/palette.mjs`. Roles (text, surfaces, states) are mapped in css/style.css.",
    " * Steps: 1–2 backgrounds · 3–5 component backgrounds · 6–8 borders · 9–10 solids · 11–12 text. */",
    "",
    ":root {"
  ];
  for (const [name, steps] of Object.entries(FAMILIES)) {
    steps.forEach((lch, i) => lines.push(`  --${name}-${i + 1}: ${HEX[name][i]};${" ".repeat(Math.max(1, 3 - String(i + 1).length))}/* ${fmt(lch)} */`));
    lines.push("");
  }
  lines[lines.length - 1] = "}";
  return `${lines.join("\n")}\n`;
}

function dtcg() {
  const doc = {
    $description: `Navigator colour primitives generated from ${SOURCE} in OKLCH by tools/palette.mjs (W3C Design Tokens Format 2025.10). Steps 1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solids, 11–12 text.`,
    color: {}
  };
  for (const [name, steps] of Object.entries(FAMILIES)) {
    doc.color[name] = { $type: "color" };
    steps.forEach((lch, i) => {
      doc.color[name][String(i + 1)] = {
        $value: { colorSpace: "oklch", components: lch.map((v, k) => Number(v.toFixed(k === 2 ? 2 : 4))), hex: HEX[name][i] }
      };
    });
  }
  // Semantic aliases (the roles css/style.css uses).
  const ref = (fam, n) => `{color.${fam}.${n}}`;
  doc.role = {
    $type: "color",
    text: { $value: ref("ink", 12) }, "text-muted": { $value: ref("ink", 11) }, "text-faint": { $value: ref("ink", 10) },
    surface: { $value: ref("ink", 2) }, line: { $value: ref("ink", 5) }, "line-strong": { $value: ref("ink", 7) },
    brand: { $value: ref("wine", 9), $description: "Identity, primary actions and every point where the human decides or approves" },
    "brand-hover": { $value: ref("wine", 10) }, "brand-text": { $value: ref("wine", 11) }, "brand-tint": { $value: ref("wine", 3) },
    affected: { $value: ref("danger", 9), $description: "Network state: a disruption hits this site or route" },
    "affected-fill": { $value: ref("danger", 7) },
    "at-risk": { $value: ref("warning", 9), $description: "Network state: exposed, not yet hit" },
    "at-risk-fill": { $value: ref("warning", 7) },
    resolved: { $value: ref("success", 9), $description: "Network state: covered by the approved option or a mitigation" },
    "resolved-fill": { $value: ref("success", 7) },
    network: { $value: ref("slate", 9), $description: "The supply network at rest: corridors, hubs, suppliers" },
    checking: { $value: ref("info", 9), $description: "Verification, and the money an option spends" },
    ai: { $value: ref("violet", 9), $description: "The AI's voice: AI labels, hypotheses, revisions, what-if analyses" },
    "ai-text": { $value: ref("violet", 11) }
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---- report -----------------------------------------------------------------------------------------------
let failures = 0;
console.log(`Source ${SOURCE} → ${fmt([srcL, srcC, srcH])}`);
console.log(`Harmonised hues: slate and info ${harmonize(250, srcH).toFixed(1)}°, violet ${harmonize(295, srcH).toFixed(1)}°. Fixed state hues: danger 29°, warning 57°, success 170°.\n`);
console.log("Contrast (WCAG 2.2)");
for (const [label, fg, bg, min] of PAIRS) {
  const c = contrast(fg, bg);
  const ok = c >= min;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.toFixed(2).padStart(5)} : 1 (needs ${min})  ${label}  ${fg} on ${bg}`);
}
for (const [label, value, min] of DISTINCT) {
  const ok = value >= min;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${value.toFixed(2).padStart(5)}        ${label}`);
}
console.log(`\nColour-blind separation (smallest ΔEOK across normal vision, protanopia, deuteranopia, tritanopia; needs ${MIN_SEPARATION.toFixed(2)})`);
for (const [label, a, b] of SEPARATE) {
  const [worst, value] = Object.keys(CVD).map((k) => [k, deltaEOK(a, b, k)]).sort((p, q) => p[1] - q[1])[0];
  const ok = value >= MIN_SEPARATION;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${value.toFixed(3)} (lowest under ${worst})  ${label}  ${a} vs ${b}`);
}

const files = [[path.join(ROOT, "css/tokens.css"), css()], [path.join(ROOT, "design/tokens.json"), dtcg()]];
if (CHECK) {
  for (const [file, content] of files) {
    const current = await readFile(file, "utf8").catch(() => null);
    if (current !== content) { failures += 1; console.log(`FAIL  ${path.relative(ROOT, file)} is out of date: run node tools/palette.mjs`); }
    else console.log(`PASS  ${path.relative(ROOT, file)} matches the generator`);
  }
} else {
  await mkdir(path.join(ROOT, "design"), { recursive: true });
  for (const [file, content] of files) await writeFile(file, content);
  console.log(`\nWrote ${files.map(([f]) => path.relative(ROOT, f)).join(" and ")}.`);
}
console.log(`\n${failures ? `${failures} check(s) failed.` : "All colour checks passed."}`);
process.exit(failures ? 1 : 0);

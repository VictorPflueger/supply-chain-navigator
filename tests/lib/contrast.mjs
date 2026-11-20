// The WCAG 2.2 contrast measure of the smoke and live suites, run in the page: every visible text
// against the nearest opaque background (semi-transparent layers blended), with the element's opacity
// applied. Normal text needs 4.5:1, large text (24 px, or 18.66 px bold) 3:1 (WCAG 1.4.3). Inactive
// controls have no duty. With a dialog open (a native <dialog> shown as a modal), only the dialog is
// measured. Vici paints the fill of a tag, a badge and a step's marker on a pseudo-element behind the
// text (::before or ::after, placed absolutely at z-index -1 and clipped to its hexagon or capsule):
// that fill counts as the text's background; a pseudo-element clipped to a ring (an evenodd clip path)
// draws only an outline and does not. Text inside an element that
// is still fading in (a finite animation running on it or an ancestor, such as a console entry that has
// just arrived while a run streams) is left for a later state, where it is measured at full opacity;
// the count of such elements is returned as `fading`.

/** { measured: text elements in view, below: those below their duty [{ text, ratio, need, color, bg }] }. */
export const contrastShortfalls = (page) => page.evaluate(() => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  // The fill a Vici capsule, badge or marker paints behind its text, if any.
  const fill = (e) => {
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(e, pseudo);
      if (ps.content === "none" || ps.content === "normal" || ps.position !== "absolute" || ps.zIndex !== "-1" || /evenodd/.test(ps.clipPath)) continue;
      const c = parse(ps.backgroundColor);
      if (c && c.a > 0) return c;
    }
    return null;
  };
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const f = fill(e);
      if (f) { layers.push(f); if (f.a >= 1) break; }
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    return layers.reduceRight((bg, layer) => over(layer, bg), { r: 255, g: 255, b: 255, a: 1 });
  };
  const fadingIn = (el) => {
    for (let e = el; e; e = e.parentElement) {
      if (e.getAnimations().some((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)) return true;
    }
    return false;
  };
  let fading = 0;
  const dialogs = document.querySelectorAll("dialog[open]");
  const scope = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  const out = [];
  let measured = 0;
  const seen = new Set();
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || seen.has(el) || el instanceof SVGElement) continue;
    seen.add(el);
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || box.bottom <= 0 || box.right <= 0 || box.top >= innerHeight || box.left >= innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || el.closest('[hidden], [aria-hidden="true"], [disabled], [aria-disabled="true"]')) continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity === 0) continue;
    if (fadingIn(el)) { fading += 1; continue; }
    const bg = background(el);
    const ink = parse(cs.color);
    const fg = over({ ...ink, a: ink.a * opacity }, bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    measured += 1;
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66) ? 3 : 4.5;
    if (ratio < need) out.push({ text: n.textContent.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100, need, color: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})` });
  }
  return { measured, below: out, fading };
});

/** Waits out fades and transitions (endless ones such as a spinner or the rail's pulse excepted). */
export const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null)))).catch(() => null);

// The map's hexagon cells (Vici's hexagon rule: nothing on the map is round). One cell is drawn in SVG,
// as Rebate Hunter draws its accounts: a halo and a gap ring behind, the body (its outline solid or
// dashed from css/map.css), and the mark of a state inside: a cross where something is affected, a bar
// and dot where it is at risk, a tick where it is resolved. The colours come from Vici's tokens through
// css/map.css (data-state, data-kind, data-tier), so a cell repaints with the theme by itself.
// Leaflet places the cells as the html of a divIcon: an element, never a markup string.

import { h } from "./dom.js";
import { icon } from "./icons.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const RAD = Math.PI / 180;

// A flat-top hexagon has the area of a circle of radius r when its height is 1.9046 × r: a supplier,
// a hub or an alternative keeps the area its round marker had.
export const HEX_PER_RADIUS = Math.sqrt((2 * Math.PI) / (3 * Math.sqrt(3))) * Math.sqrt(3);

/** The corners of a flat-top hexagon of circumradius R, as an SVG polygon's points. */
export function hexPoints(cx, cy, R) {
  return Array.from({ length: 6 }, (_, k) => `${(cx + R * Math.cos(k * 60 * RAD)).toFixed(2)},${(cy + R * Math.sin(k * 60 * RAD)).toFixed(2)}`).join(" ");
}

/** A hexagon cell in SVG, sized by CSS (--cell, its height); strokes keep their width at any size. */
export function hexCell(cls = "") {
  const shape = svg("svg", { class: ["hex-cell", cls].filter(Boolean).join(" "), viewBox: "-1.15 -1 2.3 2", "aria-hidden": "true", focusable: "false" });
  const pts = hexPoints(0, 0, 1.15);
  shape.append(
    svg("polygon", { class: "hex-halo", points: pts }),
    svg("polygon", { class: "hex-gap", points: pts }),
    svg("polygon", { class: "hex-body", points: pts }),
    // The state's own mark (css/map.css shows the one that applies).
    svg("path", { class: "hex-mark mark-affected", d: "M-0.36 -0.36 L0.36 0.36 M0.36 -0.36 L-0.36 0.36" }),
    svg("path", { class: "hex-mark mark-at_risk", d: "M0 -0.52 V0.06" }),
    svg("polygon", { class: "hex-dot mark-at_risk", points: hexPoints(0, 0.36, 0.13) }),
    svg("path", { class: "hex-mark mark-resolved", d: "M-0.42 0.02 L-0.12 0.32 L0.44 -0.3" })
  );
  return shape;
}

/**
 * A marker's cell (a supplier, a hub, a qualified alternative, a corridor's state badge): centred on
 * its point, `height` px high. data-kind, data-tier and data-state choose its look in css/map.css;
 * data-id names the entity.
 */
export function cellMarker(kind, { id = null, tier = null, height } = {}) {
  const el = h("span", { class: "hex-marker", dataset: { kind, state: "neutral", ...(id ? { id } : {}), ...(tier ? { tier: String(tier) } : {}) } }, hexCell());
  setCellHeight(el, height);
  return el;
}

/** Sets a cell's height in px (a custom property, so the content security policy allows it). */
export function setCellHeight(el, height) {
  el.style.setProperty("--cell", `${Math.round(height * 10) / 10}px`);
}

const STATE_WORD = { affected: "Affected", at_risk: "At risk", resolved: "Resolved" };
const STATE_TAG = { affected: ["vc-tag--danger", "error"], at_risk: ["vc-tag--warning", "warning"], resolved: ["vc-tag--success", "success"] };

/**
 * One of our plants: a client entity, so in ink. A hexagon cell with a strong neutral outline and the
 * factory icon, its name beside it, and a state, when it has one, as the cell's outline in the state's
 * tone and a Vici tag with the state's icon and word after the name.
 */
export function plantMarker(name) {
  const tag = h("span", { class: "vc-tag plant-state", hidden: true });
  const el = h("span", { class: "plant-marker", dataset: { state: "neutral" } },
    h("span", { class: "plant-glyph" }, hexCell(), icon("factory", 22)),
    h("span", { class: "plant-label" }, name),
    tag);
  el.stateTag = tag;
  return el;
}

/** Shows a plant's state on its marker: the cell's outline (css/map.css) and the tag beside the name. */
export function setPlantState(el, state) {
  el.dataset.state = state;
  const tag = el.stateTag;
  if (!tag) return;
  const [tone, glyph] = STATE_TAG[state] || [];
  tag.hidden = !tone;
  tag.className = ["vc-tag", tone, "plant-state"].filter(Boolean).join(" ");
  tag.replaceChildren(...(tone ? [icon(glyph, 16), STATE_WORD[state]] : []));
}

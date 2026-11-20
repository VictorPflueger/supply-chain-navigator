// The map: Natural Earth land and borders drawn as SVG, with only the places in the story on top:
// our two plants, and the sites and routes the agent has marked by the step on screen, each in its
// state. Drawn from data/basemap_offline.js, so it needs no tile server and looks the same offline
// and behind a proxy. The frame holds every place the story reaches, so it stays put between steps.

import { locate, legPath, routePath } from "./world.js";
import { shortName } from "./tools.js";

const NS = "http://www.w3.org/2000/svg";
const RAD = Math.PI / 180;
const STATE_WORD = { affected: "affected", at_risk: "at risk", resolved: "resolved" };
// Sizes on screen, in CSS pixels, whatever the size of the map.
const PX = { plant: 11, site: 7.5, plantText: 15, siteText: 12.5, route: 3, flow: 2, edge: 1.5, mark: 2, halo: 3.5, pad: 18 };
const CHAR = 0.56; // average glyph width of a label, in ems

/** Mercator in degrees: x is longitude, y grows southwards. */
const project = ([lat, lon]) => [lon, -Math.log(Math.tan(Math.PI / 4 + (Math.max(-80, Math.min(80, lat)) * RAD) / 2)) / RAD];
const pathOf = (pts, close) => pts.map((p, i) => { const [x, y] = project(p); return `${i ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`; }).join("") + (close ? "Z" : "");
const el = (name, attrs = {}, parent = null) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const hexPoints = (cx, cy, r) => Array.from({ length: 6 }, (_, k) => `${(cx + r * Math.cos(k * 60 * RAD)).toFixed(3)},${(cy + r * Math.sin(k * 60 * RAD)).toFixed(3)}`).join(" ");

/** The places a story touches, from every map and alert event it can emit: { ids, routes }. */
export function placesOf(model, events) {
  const ids = new Set(model.world.plants.map((p) => p.id));
  const routes = new Set();
  for (const e of events) {
    for (const k of ["supplier_ids", "node_ids", "plant_ids"]) for (const id of e[k] || []) if (locate(model, id)) ids.add(id);
    for (const id of e.route_ids || []) if (model.routes.has(id)) routes.add(id);
  }
  return { ids: [...ids], routes: [...routes] };
}

export function createMap(svg, model) {
  const base = globalThis.OFFLINE_BASEMAP;
  svg.setAttribute("xmlns", NS);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  el("path", { class: "map-land", d: base.land.map((poly) => poly.map((ring) => pathOf(ring, true)).join("")).join("") }, svg);
  el("path", { class: "map-borders", d: base.borders.map((line) => pathOf(line, false)).join("") }, svg);
  const routesLayer = el("g", { class: "map-routes" }, svg);
  const sitesLayer = el("g", { class: "map-sites" }, svg);
  const nameOf = (id) => shortName(model.plants.get(id)?.short || model.suppliers.get(id)?.short || model.suppliers.get(id)?.name || model.nodes.get(id)?.name || model.alternatives.get(id)?.name || id);
  let last = null;

  /** Draws the story's places as they stand: places { ids, routes } frame it, states (id → state) mark it. */
  function draw(places, states) {
    last = [places, states];
    routesLayer.replaceChildren();
    sitesLayer.replaceChildren();
    const u = fit(places);
    // The routes the story has marked, and the supply flows of every marked supplier.
    for (const id of places.routes) {
      if (!states.get(id)) continue;
      el("path", { d: pathOf(routePath(model, id), false), class: `map-route map-route--${states.get(id)}`, "stroke-width": (PX.route * u).toFixed(4) }, routesLayer);
    }
    for (const id of places.ids) {
      if (!model.suppliers.has(id) || !states.get(id)) continue;
      for (const f of model.flowsFrom.get(id) || []) {
        if (!model.plants.has(f.to) && !states.get(f.to)) continue;
        const route = model.routes.get(f.route);
        const line = route ? route.legs.flatMap((_, i) => legPath(model, route, i, f.from, f.to)) : [locate(model, f.from), locate(model, f.to)];
        el("path", { d: pathOf(line.filter(Boolean), false), class: `map-flow map-flow--${states.get(id)}`, "stroke-width": (PX.flow * u).toFixed(4), "stroke-dasharray": `${(6 * u).toFixed(4)} ${(5 * u).toFixed(4)}` }, routesLayer);
      }
    }
    // Our plants always; any other site once the story has marked it. A state adds its mark and its word.
    for (const id of places.ids) {
      const plant = model.plants.has(id);
      if (!plant && !states.get(id)) continue;
      const ll = locate(model, id);
      if (!ll) continue;
      const [x, y] = project(ll);
      const state = states.get(id) || (plant ? "plant" : "neutral");
      const r = (plant ? PX.plant : PX.site) * u;
      const g = el("g", { class: `map-site map-site--${state}${plant ? " map-site--plant" : ""}` }, sitesLayer);
      const label = STATE_WORD[state] ? `${nameOf(id)}, ${STATE_WORD[state]}` : nameOf(id);
      el("title", {}, g).textContent = label;
      el("polygon", { points: hexPoints(x, y, r), "stroke-width": (PX.edge * u).toFixed(4) }, g);
      mark(g, state, x, y, r * 0.5, u);
      const fs = (plant ? PX.plantText : PX.siteText) * u;
      const text = el("text", { x: (x + r * 1.3).toFixed(3), y: (y + fs * 0.35).toFixed(3), "font-size": fs.toFixed(4), "stroke-width": (PX.halo * u).toFixed(4) }, g);
      text.textContent = label;
    }
  }

  /** The state's own mark, so no state relies on colour: × affected, ! at risk, ✓ resolved, a plant's roof. */
  function mark(g, state, x, y, s, u) {
    const d = {
      affected: `M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`,
      at_risk: `M${x} ${y - s * 1.1}L${x} ${y + s * 0.3}M${x} ${y + s * 0.85}L${x} ${y + s * 0.9}`,
      resolved: `M${x - s} ${y}L${x - s * 0.25} ${y + s * 0.8}L${x + s} ${y - s * 0.75}`,
      plant: `M${x - s} ${y + s * 0.7}L${x - s} ${y - s * 0.1}L${x - s * 0.3} ${y - s * 0.55}L${x - s * 0.3} ${y - s * 0.1}L${x + s * 0.4} ${y - s * 0.55}L${x + s * 0.4} ${y + s * 0.7}Z`
    }[state];
    if (d) el("path", { d, class: "map-mark", "stroke-width": (PX.mark * u).toFixed(4) }, g);
  }

  /**
   * Frames every place of the story with room for its longest label, and returns the map units per
   * CSS pixel, so sizes on screen stay the same however large the map is drawn.
   */
  function fit(places) {
    const W = svg.clientWidth || 800, H = svg.clientHeight || 600;
    const sites = places.ids.map((id) => {
      const ll = locate(model, id);
      return ll && { xy: project(ll), plant: model.plants.has(id), chars: nameOf(id).length + 10 };
    }).filter(Boolean);
    const routePts = places.routes.flatMap((id) => routePath(model, id)).map(project);
    if (!sites.length && !routePts.length) return 0.05;
    let u = 0.05;
    let box = null;
    for (let k = 0; k < 4; k++) {
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of routePts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      for (const s of sites) {
        const [x, y] = s.xy;
        const r = (s.plant ? PX.plant : PX.site) * u;
        const fs = (s.plant ? PX.plantText : PX.siteText) * u;
        x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r * 1.3 + s.chars * CHAR * fs);
        y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
      }
      // A story in one town still shows the country around it.
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const w = Math.max(x1 - x0, 8), h = Math.max(y1 - y0, 5);
      const pad = PX.pad * u;
      box = [cx - w / 2 - pad, cy - h / 2 - pad, w + 2 * pad, h + 2 * pad];
      u = Math.max(box[2] / W, box[3] / H);
    }
    svg.setAttribute("viewBox", box.map((v) => v.toFixed(3)).join(" "));
    return u;
  }

  // Sizes are in screen pixels, so a new map size means drawing again.
  let queued = false;
  new ResizeObserver(() => {
    if (queued || !last) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; draw(...last); });
  }).observe(svg);

  return { draw };
}

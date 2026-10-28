// Leaflet map: basemap (tiles + offline land layer), corridors, suppliers, plants, nodes,
// in-transit orders, supply links, legend, popovers and the entity state API used by run events.

import { getModel, legPath, poLatLng, flowEndpoints } from "./world.js";
import { BASEMAP, UI } from "./config.js";
import { h, escapeHtml, prefersReducedMotion, withTooltip, setTooltip } from "./dom.js";
import { icon, iconSvg } from "./icons.js";
import { supplierPopover, plantPopover, routePopover, nodePopover, poPopover, alternativePopover } from "./popovers.js";

// Map colours are Vici's semantic tokens (vici/dist/vici.min.css), read from the page when the map is
// created; css/map.css uses the same tokens for what it draws:
//   - the supply network at rest (corridors, supply links, hubs, suppliers' outlines) is Vici's neutral
//     solid; the suppliers' fills step from strong to faint by tier, darker = closer to our plants, so
//     the network recedes behind the states that matter;
//   - states take Vici's danger, warning and success tones: the solid tone for a line or an outline, the
//     mid tone for a fill, and a larger marker or a heavier line than the network, so a state stands out
//     without relying on hue alone (the popover names it in words; tests/tokens.mjs checks the pairs);
//   - our plants are client entities: ink with a strong neutral outline (css/map.css), never merlot,
//     which belongs to the person in charge.
let COLOR = {};
let STATE_FILL = {};
let TIER = {};
let TIER_LINE = {};
const ROUTE_OPACITY = 0.75;

function readMapColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  COLOR = {
    affected: v("--vc-danger-solid"), at_risk: v("--vc-warning-text"), resolved: v("--vc-success-solid"),
    route: v("--vc-neutral-solid"), spoke: v("--vc-neutral-solid"), node: v("--vc-neutral-solid"), nodeFill: v("--vc-surface"),
    alternative: v("--vc-neutral-solid"), land: v("--vc-surface"), coast: v("--vc-border"), border: v("--vc-border-subtle")
  };
  STATE_FILL = { affected: v("--vc-danger-border"), at_risk: v("--vc-warning-border"), resolved: v("--vc-success-border") };
  TIER = { 1: v("--vc-border-strong"), 2: v("--vc-border"), 3: v("--vc-surface") };
  TIER_LINE = { 1: v("--vc-neutral-solid"), 2: v("--vc-neutral-solid"), 3: v("--vc-neutral-solid") };
}
const LEG = {
  sea: { weight: 2, dash: "1 6" },
  barge: { weight: 3, dash: "8 5" },
  rail: { weight: 2.25, dash: "12 4 2 4" },
  air: { weight: 1.6, dash: "2 7" },
  road: { weight: 2.5, dash: null },
  ferry: { weight: 2, dash: "4 6" }
};
const NODE_LABELS = {
  "N-RTM": "Rotterdam", "N-HAM": "Hamburg", "N-DUI": "Duisburg", "N-KAU": "Kaub", "N-SUZ": "Suez",
  "N-BAB": "Bab-el-Mandeb", "N-GIB": "Gibraltar", "N-SIN": "Singapore", "N-KOP": "Koper", "N-TME": "Tanger Med",
  "N-MAL": "Małaszewicze", "N-ALA": "Alashankou", "N-BRN": "Brenner", "N-ANR": "Antwerp"
};
// Label placement where two labelled nodes sit close together.
const NODE_LABEL_SIDE = { "N-GIB": "top", "N-TME": "right", "N-ANR": "left" };
const LABEL_OFFSET = { right: [8, 0], left: [-8, 0], top: [0, -6], bottom: [0, 6] };
const ALT_PATHS = ["ALT-CAPE", "ALT-MIDDLE", "ALT-TAUERN"];

/**
 * Creates the map inside `container`. Returns an API object; if Leaflet failed to load,
 * returns a no-op API and shows an explanation instead of the map.
 */
export function createMap(container, { onStatus } = {}) {
  const L = window.L;
  readMapColors();
  if (!L) return fallbackMap(container, "The map library (Leaflet) could not be loaded from unpkg, jsDelivr or the local copy in vendor/. Navigator keeps working without the map: the console, options, outbox and audit are unaffected.");

  const model = getModel();
  const map = L.map(container, {
    zoomControl: false, attributionControl: true,
    minZoom: 2, maxZoom: 11, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110,
    worldCopyJump: false, maxBounds: [[-80, -190], [85, 210]], maxBoundsViscosity: 0.7
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  map.attributionControl.setPrefix(false);

  // The last view the app asked for (a fit, a focus or an overview). When the map is resized, for
  // example when the drawer opens, that view is re-applied so the marked region stays in sight.
  // Any pan or zoom by the presenter takes over and clears it.
  let viewIntent = null;
  const userTookOver = () => { viewIntent = null; };
  map.on("dragstart", userTookOver);
  for (const type of ["wheel", "dblclick", "keydown"]) container.addEventListener(type, userTookOver, { passive: true });
  container.addEventListener("click", (e) => { if (e.target.closest?.(".leaflet-control-zoom")) userTookOver(); });

  const panes = { offline: 150, spokes: 360, routes: 380, alt: 385, nodes: 410, pos: 420, suppliers: 440, plants: 620 };
  for (const [name, z] of Object.entries(panes)) {
    const pane = map.createPane(name);
    pane.style.zIndex = String(z);
    if (name === "offline") pane.style.pointerEvents = "none";
  }

  // ---- basemap ------------------------------------------------------------------------------
  // The map's own notice (tiles unavailable): Vici's alert in its neutral tone, floating on the map.
  const statusEl = h("div", { class: "vc-alert vc-alert--neutral map-status", hidden: true, role: "status" }, icon("info", 16), h("span", { class: "vc-alert__body" }));
  container.parentElement.appendChild(statusEl);
  const showStatus = (text) => {
    statusEl.lastChild.textContent = text;
    statusEl.hidden = !text;
    onStatus?.(text);
  };

  addOfflineBasemap(L, map);
  const basemap = { kind: BASEMAP.cartoKey ? "carto" : "osm", loaded: 0, errors: 0 };
  const tiles = makeTileLayer(L, basemap.kind);
  tiles.on("tileload", () => {
    basemap.loaded++;
    if (basemap.loaded === 1) showStatus("");
  });
  tiles.on("tileerror", () => {
    basemap.errors++;
    if (basemap.kind === "carto" && basemap.loaded === 0 && basemap.errors >= 4) {
      map.removeLayer(tiles);
      basemap.kind = "osm";
      basemap.errors = 0;
      const osm = makeTileLayer(L, "osm");
      osm.on("tileload", () => { basemap.loaded++; showStatus(""); });
      osm.on("tileerror", () => {
        basemap.errors++;
        if (basemap.loaded === 0 && basemap.errors >= 6) showStatus("Map tiles unavailable — showing the offline coastline map");
      });
      osm.addTo(map);
    } else if (basemap.loaded === 0 && basemap.errors >= 6) {
      showStatus("Map tiles unavailable — showing the offline coastline map");
    }
  });
  tiles.addTo(map);

  // ---- layers --------------------------------------------------------------------------------
  const layers = {
    spokes: L.layerGroup().addTo(map),
    routes: L.layerGroup().addTo(map),
    alt: L.layerGroup().addTo(map),
    nodes: L.layerGroup().addTo(map),
    pos: L.layerGroup().addTo(map),
    suppliers: L.layerGroup().addTo(map),
    alternatives: L.layerGroup(),
    plants: L.layerGroup().addTo(map)
  };
  const reg = {
    routes: new Map(), spokesByFlow: new Map(), spokesBySupplier: new Map(),
    suppliers: new Map(), alternatives: new Map(), nodes: new Map(), pos: new Map(), posByRoute: new Map(),
    plants: new Map(), altPaths: new Map()
  };
  const states = new Map();
  const getState = (key) => states.get(key) || "neutral";

  const popupOpts = { maxWidth: 440, minWidth: 280, autoPanPadding: [48, 48], className: "nav-popup" };

  // Supply links (thin spokes) ------------------------------------------------------------------
  for (const f of model.flows) {
    const { segments } = flowEndpoints(model, f);
    const lines = segments.filter((s) => s[0] && s[1]).map((seg) =>
      L.polyline(seg, { pane: "spokes", color: COLOR.spoke, weight: 1, opacity: 0.7, interactive: false }).addTo(layers.spokes));
    reg.spokesByFlow.set(f.id, lines);
    if (!reg.spokesBySupplier.has(f.from)) reg.spokesBySupplier.set(f.from, []);
    reg.spokesBySupplier.get(f.from).push(...lines);
  }

  // Corridors (one polyline per leg, styled by mode) ---------------------------------------------
  for (const r of model.routes.values()) {
    if (r.display === false) continue;
    const lines = [];
    r.legs.forEach((leg, i) => {
      if (leg.from === "@origin" || leg.to === "@dest") return;
      let pts = legPath(model, r, i);
      if (pts.length < 2) return;
      if (leg.mode === "air") pts = greatCircle(pts[0], pts[pts.length - 1], 48);
      const st = LEG[leg.mode] || LEG.road;
      const line = L.polyline(pts, {
        pane: "routes", color: COLOR.route, weight: st.weight, opacity: ROUTE_OPACITY,
        dashArray: st.dash, lineCap: "round", lineJoin: "round", smoothFactor: 1.2
      });
      line.legMode = leg.mode;
      line.bindTooltip(escapeHtml(r.name), { sticky: true, className: "hover-label", direction: "top", offset: [0, -6] });
      line.bindPopup(() => routePopover(model, r.id, getState(`route:${r.id}`)), popupOpts);
      line.addTo(layers.routes);
      lines.push(line);
    });
    reg.routes.set(r.id, lines);
  }

  // Alternative corridor paths (shown only when an option uses them) ----------------------------
  for (const altId of ALT_PATHS) {
    const def = findAlternativeRoute(model, altId);
    if (!def?.via) continue;
    const line = L.polyline(def.via, { pane: "alt", color: COLOR.resolved, weight: 3, opacity: 0.95, dashArray: "6 6", lineCap: "round" });
    line.bindTooltip(escapeHtml(def.name), { sticky: true, className: "hover-label" });
    reg.altPaths.set(altId, line);
  }

  // Logistics nodes ------------------------------------------------------------------------------
  for (const n of model.world.nodes) {
    const routesHere = model.routesByNode.get(n.id) || [];
    if (!routesHere.some((rid) => model.routes.get(rid)?.display !== false) && n.id !== "N-CPT") continue;
    const big = ["chokepoint", "waterway", "port"].includes(n.type);
    const m = L.circleMarker([n.lat, n.lon], {
      pane: "nodes", radius: big ? 5 : 3.5, color: COLOR.node, weight: 1.5, fillColor: COLOR.nodeFill, fillOpacity: 1
    });
    if (NODE_LABELS[n.id]) {
      const side = NODE_LABEL_SIDE[n.id] || "right";
      m.bindTooltip(escapeHtml(NODE_LABELS[n.id]), { permanent: true, direction: side, offset: LABEL_OFFSET[side], className: "node-label" });
    } else {
      m.bindTooltip(escapeHtml(n.name), { className: "hover-label", direction: "top", offset: [0, -6] });
    }
    m.bindPopup(() => nodePopover(model, n.id, getState(`node:${n.id}`)), popupOpts);
    m.addTo(layers.nodes);
    reg.nodes.set(n.id, m);
  }

  // Orders in transit (small container blocks) -----------------------------------------------------
  for (const po of model.purchaseOrders.values()) {
    const ll = poLatLng(model, po);
    if (!ll) continue;
    const m = L.marker(ll, {
      pane: "pos", keyboard: false,
      icon: L.divIcon({ className: "po-icon", html: '<div class="po-marker" data-state="neutral"></div>', iconSize: [0, 0] })
    });
    m.bindTooltip(escapeHtml(`Order ${po.id}: ${po.item}`), { className: "hover-label", direction: "top", offset: [0, -6] });
    m.bindPopup(() => poPopover(model, po, getState(`po:${po.id}`)), popupOpts);
    m.addTo(layers.pos);
    reg.pos.set(po.id, m);
    if (!reg.posByRoute.has(po.route)) reg.posByRoute.set(po.route, []);
    reg.posByRoute.get(po.route).push(po.id);
  }

  // Suppliers --------------------------------------------------------------------------------------
  for (const s of model.world.suppliers) {
    const base = s.tier === 1 ? 7 : s.tier === 2 ? 5.5 : 5;
    const m = L.circleMarker([s.lat, s.lon], {
      pane: "suppliers", radius: base, color: TIER_LINE[s.tier], weight: 1.5, fillColor: TIER[s.tier], fillOpacity: 1
    });
    m.baseRadius = base;
    m.bindTooltip(escapeHtml(`${s.name} — ${s.city}`), { className: "hover-label", direction: "top", offset: [0, -8] });
    m.bindPopup(() => supplierPopover(model, s.id, getState(`sup:${s.id}`)), popupOpts);
    m.addTo(layers.suppliers);
    reg.suppliers.set(s.id, m);
  }

  // Qualified alternatives (hidden by default) ------------------------------------------------------
  for (const a of model.world.alternatives) {
    const m = L.circleMarker([a.lat, a.lon], {
      pane: "suppliers", radius: 6, color: COLOR.alternative, weight: 1.5, dashArray: "2 3", fillColor: COLOR.nodeFill, fillOpacity: 0.85
    });
    m.bindTooltip(escapeHtml(`${a.name} (alternative)`), { className: "hover-label", direction: "top", offset: [0, -8] });
    m.bindPopup(() => alternativePopover(model, a), popupOpts);
    m.addTo(layers.alternatives);
    reg.alternatives.set(a.id, m);
  }

  // Plants -----------------------------------------------------------------------------------------
  for (const p of model.world.plants) {
    const m = L.marker([p.lat, p.lon], {
      pane: "plants", riseOnHover: true, keyboard: true, title: p.name, alt: p.name,
      icon: L.divIcon({
        className: "plant-icon", iconSize: [0, 0],
        html: `<div class="plant-marker" data-state="neutral"><span class="plant-glyph">${iconSvg("factory", 22)}</span><span class="plant-label">${escapeHtml(p.short)}</span></div>`
      })
    });
    m.bindPopup(() => plantPopover(model, p.id, getState(`plant:${p.id}`)), popupOpts);
    m.addTo(layers.plants);
    reg.plants.set(p.id, m);
  }

  // ---- legend and tools --------------------------------------------------------------------------
  const legend = buildLegend(map, layers);
  container.parentElement.appendChild(legend);
  if (typeof ResizeObserver === "function") {
    new ResizeObserver((entries) => legend.fitToHeight(entries[0].contentRect.height)).observe(container);
  }
  // Two actions that move the view (not toggles): Vici's compact buttons, floating on the map.
  const tools = h("div", { class: "map-tools" },
    h("button", { class: "vc-button vc-button--outline button-compact", type: "button", on: { click: () => showNetwork() } }, icon("target", 18), "Europe network"),
    h("button", { class: "vc-button vc-button--outline button-compact", type: "button", on: { click: () => showWorld() } }, icon("globe", 18), "Global view")
  );
  container.parentElement.appendChild(tools);

  const syncZoomClass = () => container.classList.toggle("zoom-low", map.getZoom() < 4);
  map.on("zoomend", syncZoomClass);

  function showNetwork() {
    viewIntent = { kind: "view", center: [UI.networkView.lat, UI.networkView.lon], zoom: UI.networkView.zoom };
    map.setView(viewIntent.center, viewIntent.zoom, { animate: !prefersReducedMotion() });
  }
  function showWorld() {
    const pts = model.world.suppliers.map((s) => [s.lat, s.lon]);
    viewIntent = { kind: "bounds", bounds: L.latLngBounds(pts).pad(0.05), maxZoom: 11 };
    map.fitBounds(viewIntent.bounds, { animate: !prefersReducedMotion() });
  }
  showNetwork();
  syncZoomClass();

  // ---- state styling ------------------------------------------------------------------------------
  const pathClass = (layer, st, flash) => {
    const el = layer.getElement?.();
    if (!el) return;
    el.classList.remove("state-affected", "state-at_risk", "state-resolved");
    if (st !== "neutral") el.classList.add(`state-${st}`);
    if (flash && !prefersReducedMotion()) {
      el.classList.remove("flash");
      void el.getBoundingClientRect();
      el.classList.add("flash");
    }
  };

  function styleSupplier(id, flash) {
    const m = reg.suppliers.get(id);
    if (!m) return;
    const st = getState(`sup:${id}`);
    const tier = model.suppliers.get(id).tier;
    m.setStyle({
      fillColor: st === "neutral" ? TIER[tier] : STATE_FILL[st],
      color: st === "neutral" ? TIER_LINE[tier] : COLOR[st],
      weight: st === "neutral" ? 1.5 : 2.5
    });
    m.setRadius(m.baseRadius + (st === "affected" ? 3 : st === "neutral" ? 0 : 2));
    if (st !== "neutral") m.bringToFront();
    pathClass(m, st, flash);
    for (const line of reg.spokesBySupplier.get(id) || []) {
      line.setStyle(st === "neutral" ? { color: COLOR.spoke, weight: 1, opacity: 0.7 } : { color: COLOR[st], weight: 1.8, opacity: 0.85 });
    }
  }

  function styleRoute(id, flash) {
    const lines = reg.routes.get(id);
    if (!lines) return;
    const st = getState(`route:${id}`);
    for (const line of lines) {
      const base = LEG[line.legMode] || LEG.road;
      line.setStyle({ color: st === "neutral" ? COLOR.route : COLOR[st], weight: base.weight + (st === "neutral" ? 0 : 1.6), opacity: st === "neutral" ? ROUTE_OPACITY : 1 });
      if (st !== "neutral") line.bringToFront();
      pathClass(line, st, flash);
    }
  }

  function styleNode(id, flash) {
    const m = reg.nodes.get(id);
    if (!m) return;
    const st = getState(`node:${id}`);
    m.setStyle({ color: st === "neutral" ? COLOR.node : COLOR[st], weight: st === "neutral" ? 1.5 : 3, fillColor: st === "neutral" ? COLOR.nodeFill : STATE_FILL[st] });
    m.setRadius(st === "neutral" ? (m.options.radius > 4 ? 5 : 3.5) : 7);
    pathClass(m, st, flash);
  }

  function styleDiv(markerReg, key, id, selector) {
    const m = markerReg.get(id);
    const el = m?.getElement()?.querySelector(selector);
    if (el) el.dataset.state = getState(`${key}:${id}`);
  }

  function styleAltPath(id) {
    const line = reg.altPaths.get(id);
    if (!line) return;
    const st = getState(`alt:${id}`);
    if (st === "neutral") layers.alt.removeLayer(line);
    else {
      line.setStyle({ color: COLOR[st] || COLOR.resolved });
      line.addTo(layers.alt);
    }
  }

  function styleAlternative(id) {
    const m = reg.alternatives.get(id);
    if (!m) return;
    const st = getState(`alt-sup:${id}`);
    if (st === "neutral") {
      m.setStyle({ color: COLOR.alternative, dashArray: "2 3", fillColor: COLOR.nodeFill });
      if (!map.hasLayer(layers.alternatives)) map.removeLayer(m);
    } else {
      m.setStyle({ color: COLOR[st], dashArray: null, fillColor: STATE_FILL[st] });
      if (!map.hasLayer(m)) m.addTo(map);
    }
  }

  /** Apply a state to entities. ids may include ALT-* corridors and A-* alternative suppliers. */
  function mark({ supplier_ids = [], route_ids = [], node_ids = [], plant_ids = [], po_ids = [], alternative_ids = [], state = "affected" } = {}) {
    const st = ["affected", "at_risk", "resolved", "neutral"].includes(state) ? state : "affected";
    for (const id of supplier_ids || []) {
      if (String(id).startsWith("A-")) { states.set(`alt-sup:${id}`, st); styleAlternative(id); continue; }
      if (model.plants.has(id)) { states.set(`plant:${id}`, st); styleDiv(reg.plants, "plant", id, ".plant-marker"); continue; }
      states.set(`sup:${id}`, st);
      styleSupplier(id, st === "affected");
    }
    for (const id of alternative_ids || []) { states.set(`alt-sup:${id}`, st); styleAlternative(id); }
    for (const id of route_ids || []) {
      if (String(id).startsWith("ALT-")) { states.set(`alt:${id}`, st); styleAltPath(id); continue; }
      states.set(`route:${id}`, st);
      styleRoute(id, st === "affected");
      for (const poId of reg.posByRoute.get(id) || []) {
        states.set(`po:${poId}`, st === "neutral" ? "neutral" : st);
        styleDiv(reg.pos, "po", poId, ".po-marker");
      }
    }
    for (const id of node_ids || []) { states.set(`node:${id}`, st); styleNode(id, st === "affected"); }
    for (const id of plant_ids || []) { states.set(`plant:${id}`, st); styleDiv(reg.plants, "plant", id, ".plant-marker"); }
    for (const id of po_ids || []) { states.set(`po:${id}`, st); styleDiv(reg.pos, "po", id, ".po-marker"); }
  }

  function clearStates() {
    const keys = [...states.keys()];
    states.clear();
    for (const key of keys) {
      const [kind, ...rest] = key.split(":");
      const id = rest.join(":");
      if (kind === "sup") styleSupplier(id);
      else if (kind === "route") styleRoute(id);
      else if (kind === "node") styleNode(id);
      else if (kind === "plant") styleDiv(reg.plants, "plant", id, ".plant-marker");
      else if (kind === "po") styleDiv(reg.pos, "po", id, ".po-marker");
      else if (kind === "alt") styleAltPath(id);
      else if (kind === "alt-sup") styleAlternative(id);
    }
    map.closePopup();
  }

  function focus({ lat, lon, zoom } = {}) {
    if (typeof lat !== "number" || typeof lon !== "number") return;
    const z = zoom ?? Math.max(map.getZoom(), 5);
    viewIntent = { kind: "view", center: [lat, lon], zoom: z };
    map.flyTo([lat, lon], z, { duration: prefersReducedMotion() ? 0 : 1.2 });
  }

  /** Re-measure after a layout change and keep the last requested view in sight. */
  function invalidate() {
    map.invalidateSize({ pan: false });
    if (!viewIntent) return;
    if (viewIntent.kind === "bounds") map.fitBounds(viewIntent.bounds, { animate: false, maxZoom: viewIntent.maxZoom });
    else map.setView(viewIntent.center, viewIntent.zoom, { animate: false });
  }

  /** Fit the view to a set of entity ids (suppliers, plants, nodes). */
  function fitIds(ids = []) {
    const pts = [];
    for (const id of ids) {
      const s = model.sites.get(id)?.obj || model.nodes.get(id) || model.alternatives.get(id);
      if (s) pts.push([s.lat, s.lon]);
    }
    if (!pts.length) return;
    if (pts.length === 1) { focus({ lat: pts[0][0], lon: pts[0][1], zoom: 6 }); return; }
    viewIntent = { kind: "bounds", bounds: L.latLngBounds(pts).pad(0.25), maxZoom: 7 };
    map.flyToBounds(viewIntent.bounds, { duration: prefersReducedMotion() ? 0 : 1.2, maxZoom: 7 });
  }

  return {
    ready: true,
    mark,
    clearStates,
    focus,
    fitIds,
    showNetwork,
    showWorld,
    invalidate,
    stateOf: (kind, id) => getState(`${kind}:${id}`),
    basemapInfo: () => ({ ...basemap })
  };
}

// ---------------------------------------------------------------------------------------------

function makeTileLayer(L, kind) {
  if (kind === "carto") {
    return L.tileLayer(BASEMAP.carto.url.replace("{key}", encodeURIComponent(BASEMAP.cartoKey)), {
      attribution: BASEMAP.carto.attribution, maxZoom: 11, className: "tiles-carto", crossOrigin: false
    });
  }
  return L.tileLayer(BASEMAP.osm.url, { attribution: BASEMAP.osm.attribution, maxZoom: 11, className: "tiles-osm-light" });
}

function addOfflineBasemap(L, map) {
  const data = window.OFFLINE_BASEMAP;
  if (!data) return;
  const renderer = L.canvas({ pane: "offline", padding: 0.5 });
  for (const rings of data.land) {
    L.polygon(rings, { renderer, pane: "offline", color: COLOR.coast, weight: 0.8, opacity: 1, fillColor: COLOR.land, fillOpacity: 1, interactive: false, smoothFactor: 1.5 }).addTo(map);
  }
  for (const line of data.borders) {
    L.polyline(line, { renderer, pane: "offline", color: COLOR.border, weight: 1, opacity: 1, interactive: false, smoothFactor: 1.5 }).addTo(map);
  }
}

function buildLegend(map, layers) {
  const toggle = (label, layer, on) => {
    const btn = h("button", { class: "legend-toggle", type: "button", "aria-pressed": on ? "true" : "false" },
      h("span", { class: "box" }, icon("check", 14)), label);
    btn.addEventListener("click", () => {
      const now = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(now));
      if (now) layer.addTo(map); else map.removeLayer(layer);
    });
    return btn;
  };
  // The swatches take their colours from css/map.css (data-kind), as the map's own marks do.
  const dot = (kind, label) => h("div", { class: "legend-row" }, h("span", { class: "legend-swatch-dot", dataset: { kind } }), label);
  const line = (kind, label) => h("div", { class: "legend-row" }, h("span", { class: "legend-swatch-line", dataset: { kind } }), label);
  const legend = h("section", { class: "legend", "aria-label": "Map legend", dataset: { collapsed: "false" } });
  const collapseBtn = h("button", { class: "vc-icon-button", type: "button", "aria-expanded": "true" }, icon("chevronDown", 18));
  const collapseTip = withTooltip(collapseBtn, "Collapse legend");
  const setCollapsed = (collapsed) => {
    legend.dataset.collapsed = String(collapsed);
    collapseBtn.replaceChildren(icon(collapsed ? "chevronUp" : "chevronDown", 18));
    collapseBtn.setAttribute("aria-expanded", String(!collapsed));
    setTooltip(collapseBtn, collapsed ? "Expand legend" : "Collapse legend");
  };
  let userChoice = false;
  collapseBtn.addEventListener("click", () => {
    userChoice = true;
    setCollapsed(legend.dataset.collapsed !== "true");
  });
  // While the presenter has not chosen, the legend folds away when the map gets short (drawer open).
  legend.fitToHeight = (height) => {
    if (userChoice) return;
    const collapse = height < 560;
    if (collapse !== (legend.dataset.collapsed === "true")) setCollapsed(collapse);
  };
  legend.append(
    h("div", { class: "legend-head" }, h("strong", {}, "Legend"), collapseTip),
    h("div", { class: "legend-body" },
      h("div", { class: "legend-group" }, h("h4", {}, "Suppliers"),
        dot("tier1", "Tier 1 (delivers to our plants)"), dot("tier2", "Tier 2 (delivers to tier 1)"), dot("tier3", "Tier 3")),
      h("div", { class: "legend-group" }, h("h4", {}, "Status"),
        line("affected", "Affected"), line("at_risk", "At risk"), line("resolved", "Resolved or mitigation")),
      h("div", { class: "legend-group" }, h("h4", {}, "Corridors"),
        line("sea", "Sea"), line("barge", "Rhine barge, rail, ferry"), line("road", "Road")),
      h("div", { class: "legend-group" },
        toggle("Supply links", layers.spokes, true),
        toggle("Orders in transit", layers.pos, true),
        toggle("Qualified alternatives", layers.alternatives, false))
    )
  );
  return legend;
}

function findAlternativeRoute(model, altId) {
  for (const r of model.routes.values()) {
    const a = (r.alternatives || []).find((x) => x.id === altId);
    if (a) return a;
  }
  return null;
}

/** Points along the great circle between two [lat, lon] points. */
function greatCircle(a, b, n = 40) {
  const rad = Math.PI / 180;
  const [lat1, lon1] = [a[0] * rad, a[1] * rad];
  const [lat2, lon2] = [b[0] * rad, b[1] * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (d < 1e-6) return [a, b];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / rad, Math.atan2(y, x) / rad]);
  }
  return pts;
}

function fallbackMap(container, message) {
  container.appendChild(h("div", { class: "map-fallback" }, h("div", {}, icon("alert", 28), h("p", {}, message))));
  const noop = () => {};
  return {
    ready: false, mark: noop, clearStates: noop, focus: noop, fitIds: noop, showNetwork: noop, showWorld: noop,
    invalidate: noop, stateOf: () => "neutral", basemapInfo: () => ({ kind: "none" })
  };
}

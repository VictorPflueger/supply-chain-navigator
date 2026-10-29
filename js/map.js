// Leaflet map: basemap (tiles + offline land layer), corridors, suppliers, plants, nodes,
// in-transit orders, supply links, legend, popovers and the entity state API used by run events.

import { getModel, legPath, poLatLng, flowEndpoints } from "./world.js";
import { BASEMAP, UI } from "./config.js";
import { h, escapeHtml, prefersReducedMotion, withTooltip, setTooltip, setDisabled, isDisabled } from "./dom.js";
import { icon } from "./icons.js";
import { cellMarker, setCellHeight, plantMarker, setPlantState, hexCell, HEX_PER_RADIUS } from "./map_cells.js";
import { supplierPopover, plantPopover, routePopover, nodePopover, poPopover, alternativePopover } from "./popovers.js";

// Map colours are Vici's semantic tokens (vici/dist/vici.min.css). What Leaflet draws as lines (the
// corridors, the supply links, the offline coastline map) takes them from the page here; everything
// drawn as an element (the hexagon cells, our plants, the orders, the legend) takes them from
// css/map.css:
//   - the supply network at rest (corridors, supply links, hubs, suppliers' outlines) is Vici's neutral
//     solid; the suppliers' fills step from strong to faint by tier, stronger = closer to our plants, so
//     the network recedes behind the states that matter;
//   - states take Vici's danger, warning and success tones: the solid tone for a line or an outline, the
//     mid tone for a fill, and a larger cell or a heavier line than the network. A state never relies on
//     hue alone: a cell carries the state's mark (a cross, a bar and dot, a tick), a corridor carries the
//     same cell at its middle, and the popover names it in words (tests/tokens.mjs checks the pairs);
//   - our plants are client entities: ink with a strong neutral outline (css/map.css), never merlot,
//     which belongs to the person in charge.
// Everything that was round is a flat-top hexagon of the same area (Vici's hexagon rule). When the
// theme changes (vici.js fires vc:themechange), the colours are read again and the lines repainted;
// the cells follow by themselves, and the basemap turns dark too (css/map.css, makeTileLayer).
let COLOR = {};
const ROUTE_OPACITY = 0.75;

function readMapColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  COLOR = {
    affected: v("--vc-danger-solid"), at_risk: v("--vc-warning-text"), resolved: v("--vc-success-solid"),
    route: v("--vc-neutral-solid"), spoke: v("--vc-neutral-solid"),
    land: v("--vc-surface"), coast: v("--vc-border"), border: v("--vc-border-subtle")
  };
}
// The corridors keep their dash pattern by mode; square caps keep the sea's dots square.
const LEG = {
  sea: { weight: 2, dash: "1 6" },
  barge: { weight: 3, dash: "8 5" },
  rail: { weight: 2.25, dash: "12 4 2 4" },
  air: { weight: 1.6, dash: "2 7" },
  road: { weight: 2.5, dash: null },
  ferry: { weight: 2, dash: "4 6" }
};
const LINE = { lineCap: "square", lineJoin: "miter" };
const NODE_LABELS = {
  "N-RTM": "Rotterdam", "N-HAM": "Hamburg", "N-DUI": "Duisburg", "N-KAU": "Kaub", "N-SUZ": "Suez",
  "N-BAB": "Bab-el-Mandeb", "N-GIB": "Gibraltar", "N-SIN": "Singapore", "N-KOP": "Koper", "N-TME": "Tanger Med",
  "N-MAL": "Małaszewicze", "N-ALA": "Alashankou", "N-BRN": "Brenner", "N-ANR": "Antwerp"
};
// Label placement where two labelled nodes sit close together.
const NODE_LABEL_SIDE = { "N-GIB": "top", "N-TME": "right", "N-ANR": "left" };
const LABEL_OFFSET = { right: [8, 0], left: [-8, 0], top: [0, -6], bottom: [0, 6] };
const ALT_PATHS = ["ALT-CAPE", "ALT-MIDDLE", "ALT-TAUERN"];
// The radius each round marker had (px); a cell keeps that area (map_cells.js, HEX_PER_RADIUS).
const RADIUS = { tier: { 1: 7, 2: 5.5, 3: 5 }, node: 5, nodeSmall: 3.5, nodeStated: 7, alternative: 6 };
// The cell a corridor in a state carries at its middle, with the state's mark (px high).
const BADGE = 17;

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
  addZoomControl(L, map);
  map.attributionControl.setPrefix(false);

  // The last view the app asked for (a fit, a focus or an overview). When the map is resized, for
  // example when the drawer opens, that view is re-applied so the marked region stays in sight.
  // Any pan or zoom by the presenter takes over and clears it.
  let viewIntent = null;
  const userTookOver = () => { viewIntent = null; };
  map.on("dragstart", userTookOver);
  for (const type of ["wheel", "dblclick", "keydown"]) container.addEventListener(type, userTookOver, { passive: true });
  container.addEventListener("click", (e) => { if (e.target.closest?.(".leaflet-control-zoom")) userTookOver(); });

  // A corridor's state badge sits above the orders in transit on it and below the hubs and suppliers,
  // so a hub's own state (a chokepoint in the middle of its corridors) is never hidden by a badge.
  const panes = { offline: 150, spokes: 360, routes: 380, alt: 385, pos: 395, badges: 405, nodes: 410, suppliers: 440, plants: 620 };
  for (const [name, z] of Object.entries(panes)) {
    const pane = map.createPane(name);
    pane.style.zIndex = String(z);
    if (name === "offline" || name === "badges") pane.style.pointerEvents = "none";
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

  const offline = addOfflineBasemap(L, map);
  const basemap = { kind: BASEMAP.cartoKey ? "carto" : "osm", loaded: 0, errors: 0 };
  let tiles = makeTileLayer(L, basemap.kind);
  const onTileLoad = () => {
    basemap.loaded++;
    if (basemap.loaded === 1) showStatus("");
  };
  const onTileError = () => {
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
      tiles = osm;
    } else if (basemap.loaded === 0 && basemap.errors >= 6) {
      showStatus("Map tiles unavailable — showing the offline coastline map");
    }
  };
  tiles.on("tileload", onTileLoad);
  tiles.on("tileerror", onTileError);
  tiles.addTo(map);

  // ---- layers --------------------------------------------------------------------------------
  const layers = {
    spokes: L.layerGroup().addTo(map),
    routes: L.layerGroup().addTo(map),
    alt: L.layerGroup().addTo(map),
    badges: L.layerGroup().addTo(map),
    nodes: L.layerGroup().addTo(map),
    pos: L.layerGroup().addTo(map),
    suppliers: L.layerGroup().addTo(map),
    alternatives: L.layerGroup(),
    plants: L.layerGroup().addTo(map)
  };
  const reg = {
    routes: new Map(), spokesByFlow: new Map(), spokesBySupplier: new Map(),
    suppliers: new Map(), alternatives: new Map(), nodes: new Map(), pos: new Map(), posByRoute: new Map(),
    plants: new Map(), altPaths: new Map(), badges: new Map()
  };
  const states = new Map();
  const getState = (key) => states.get(key) || "neutral";

  // The cells replace circle markers, whose popover a second click opened again: Leaflet's markers
  // would close it instead, so a cell opens its popover on every click, as the circles did.
  const CellMarker = L.Marker.extend({
    _openPopup(e) {
      if (!this._popup || !this._map) return;
      L.DomEvent.stop(e);
      this._popup._source = e.layer || e.target;
      this.openPopup(e.latlng);
    }
  });

  // Popovers close with their own Vici icon button (Leaflet's × is left out) or with Escape.
  const popupOpts = { maxWidth: 440, minWidth: 280, autoPanPadding: [48, 48], className: "nav-popup", closeButton: false };
  const withClose = (content) => {
    const close = h("button", { class: "vc-icon-button pop-close", type: "button", on: { click: () => map.closePopup() } }, icon("x", 18));
    const anchor = withTooltip(close, "Close popup", { below: true });
    anchor.classList.add("pop-close-anchor");
    content.prepend(anchor);
    return content;
  };

  // A marker that draws a hexagon cell: no tab stop (the popover opens on a click, and its contents
  // are reached through the agent's console and the drawer), a hover label, and a popover.
  const cellAt = (latlng, pane, cell, label, popover) => {
    const m = new CellMarker(latlng, { pane, keyboard: false, icon: L.divIcon({ className: "hex-icon", html: cell, iconSize: [0, 0] }) });
    m.cell = cell;
    m.bindTooltip(escapeHtml(label), { className: "hover-label", direction: "top", offset: [0, -8] });
    m.bindPopup(() => withClose(popover()), popupOpts);
    return m;
  };

  // Supply links (thin spokes) ------------------------------------------------------------------
  for (const f of model.flows) {
    const { segments } = flowEndpoints(model, f);
    const lines = segments.filter((s) => s[0] && s[1]).map((seg) =>
      L.polyline(seg, { pane: "spokes", color: COLOR.spoke, weight: 1, opacity: 0.7, interactive: false, ...LINE }).addTo(layers.spokes));
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
        dashArray: st.dash, smoothFactor: 1.2, ...LINE
      });
      line.legMode = leg.mode;
      line.bindTooltip(escapeHtml(r.name), { sticky: true, className: "hover-label", direction: "top", offset: [0, -6] });
      line.bindPopup(() => withClose(routePopover(model, r.id, getState(`route:${r.id}`))), popupOpts);
      line.addTo(layers.routes);
      lines.push(line);
    });
    reg.routes.set(r.id, lines);
    if (lines.length) reg.badges.set(`route:${r.id}`, badgeAt(L, midpoint(L, lines)));
  }

  // Alternative corridor paths (shown only when an option uses them) ----------------------------
  for (const altId of ALT_PATHS) {
    const def = findAlternativeRoute(model, altId);
    if (!def?.via) continue;
    const line = L.polyline(def.via, { pane: "alt", color: COLOR.resolved, weight: 3, opacity: 0.95, dashArray: "6 6", ...LINE });
    line.bindTooltip(escapeHtml(def.name), { sticky: true, className: "hover-label" });
    reg.altPaths.set(altId, line);
    reg.badges.set(`alt:${altId}`, badgeAt(L, midpoint(L, [line])));
  }

  // Logistics nodes ------------------------------------------------------------------------------
  for (const n of model.world.nodes) {
    const routesHere = model.routesByNode.get(n.id) || [];
    if (!routesHere.some((rid) => model.routes.get(rid)?.display !== false) && n.id !== "N-CPT") continue;
    const big = ["chokepoint", "waterway", "port"].includes(n.type);
    const cell = cellMarker("node", { id: n.id, height: (big ? RADIUS.node : RADIUS.nodeSmall) * HEX_PER_RADIUS });
    const m = new CellMarker([n.lat, n.lon], { pane: "nodes", keyboard: false, icon: L.divIcon({ className: "hex-icon", html: cell, iconSize: [0, 0] }) });
    m.cell = cell;
    m.baseRadius = big ? RADIUS.node : RADIUS.nodeSmall;
    if (NODE_LABELS[n.id]) {
      const side = NODE_LABEL_SIDE[n.id] || "right";
      m.bindTooltip(escapeHtml(NODE_LABELS[n.id]), { permanent: true, direction: side, offset: LABEL_OFFSET[side], className: "node-label" });
    } else {
      m.bindTooltip(escapeHtml(n.name), { className: "hover-label", direction: "top", offset: [0, -6] });
    }
    m.bindPopup(() => withClose(nodePopover(model, n.id, getState(`node:${n.id}`))), popupOpts);
    m.addTo(layers.nodes);
    reg.nodes.set(n.id, m);
  }

  // Orders in transit (small container blocks) -----------------------------------------------------
  for (const po of model.purchaseOrders.values()) {
    const ll = poLatLng(model, po);
    if (!ll) continue;
    const block = h("span", { class: "po-marker", dataset: { state: "neutral" } });
    const m = L.marker(ll, {
      pane: "pos", keyboard: false,
      icon: L.divIcon({ className: "po-icon", html: block, iconSize: [0, 0] })
    });
    m.block = block;
    m.bindTooltip(escapeHtml(`Order ${po.id}: ${po.item}`), { className: "hover-label", direction: "top", offset: [0, -6] });
    m.bindPopup(() => withClose(poPopover(model, po, getState(`po:${po.id}`))), popupOpts);
    m.addTo(layers.pos);
    reg.pos.set(po.id, m);
    if (!reg.posByRoute.has(po.route)) reg.posByRoute.set(po.route, []);
    reg.posByRoute.get(po.route).push(po.id);
  }

  // Suppliers --------------------------------------------------------------------------------------
  for (const s of model.world.suppliers) {
    const base = RADIUS.tier[s.tier] || RADIUS.tier[3];
    const cell = cellMarker("supplier", { id: s.id, tier: s.tier, height: base * HEX_PER_RADIUS });
    const m = cellAt([s.lat, s.lon], "suppliers", cell, `${s.name} — ${s.city}`, () => supplierPopover(model, s.id, getState(`sup:${s.id}`)));
    m.baseRadius = base;
    m.addTo(layers.suppliers);
    reg.suppliers.set(s.id, m);
  }

  // Qualified alternatives (hidden by default; a dashed outline until an option uses one) -----------
  for (const a of model.world.alternatives) {
    const cell = cellMarker("alternative", { id: a.id, height: RADIUS.alternative * HEX_PER_RADIUS });
    const m = cellAt([a.lat, a.lon], "suppliers", cell, `${a.name} (alternative)`, () => alternativePopover(model, a));
    m.addTo(layers.alternatives);
    reg.alternatives.set(a.id, m);
  }

  // Plants -----------------------------------------------------------------------------------------
  for (const p of model.world.plants) {
    const marker = plantMarker(p.short);
    const m = L.marker([p.lat, p.lon], {
      pane: "plants", riseOnHover: true, keyboard: true, title: p.name, alt: p.name,
      icon: L.divIcon({ className: "plant-icon", iconSize: [0, 0], html: marker })
    });
    m.plant = marker;
    m.bindPopup(() => withClose(plantPopover(model, p.id, getState(`plant:${p.id}`))), popupOpts);
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

  // A popover's close button moves with the map, but its tooltip stays where vici.js placed it: hide it
  // while the map moves.
  map.on("movestart zoomstart", () => {
    for (const tip of container.querySelectorAll(".leaflet-popup .vc-tooltip")) {
      try { if (tip.matches(":popover-open")) tip.hidePopover(); } catch { /* no popover support */ }
    }
  });

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
  // A change of state flashes once: the class goes when the animation ends, so a redraw (a corridor
  // brought to the front again on a theme change) does not replay it.
  const flashEl = (el) => {
    if (!el || prefersReducedMotion()) return;
    el.classList.remove("flash");
    void el.getBoundingClientRect();
    el.classList.add("flash");
    el.addEventListener("animationend", () => el.classList.remove("flash"), { once: true });
  };
  const pathClass = (layer, st, flash) => {
    const el = layer.getElement?.();
    if (!el) return;
    el.classList.remove("state-affected", "state-at_risk", "state-resolved");
    if (st !== "neutral") el.classList.add(`state-${st}`);
    if (flash) flashEl(el);
  };
  // A cell in a state: its colours and mark (css/map.css), a larger size and a place on top.
  const cellState = (m, st, radius) => {
    m.cell.dataset.state = st;
    setCellHeight(m.cell, radius * HEX_PER_RADIUS);
    m.setZIndexOffset(st === "neutral" ? 0 : 1000);
  };
  // A corridor in a state carries a cell with the state's mark at its middle.
  const showBadge = (key, st) => {
    const b = reg.badges.get(key);
    if (!b) return;
    b.cell.dataset.state = st;
    if (st === "neutral") layers.badges.removeLayer(b);
    else b.addTo(layers.badges);
  };

  // A supplier's links take its state: the state's tone and a heavier line; at rest thin and neutral.
  function styleSpokes(id) {
    const st = getState(`sup:${id}`);
    for (const line of reg.spokesBySupplier.get(id) || []) {
      line.setStyle(st === "neutral" ? { color: COLOR.spoke, weight: 1, opacity: 0.7 } : { color: COLOR[st], weight: 1.8, opacity: 0.85 });
    }
  }

  function styleSupplier(id, flash) {
    const m = reg.suppliers.get(id);
    if (!m) return;
    const st = getState(`sup:${id}`);
    cellState(m, st, m.baseRadius + (st === "affected" ? 3 : st === "neutral" ? 0 : 2));
    if (flash) flashEl(m.cell);
    styleSpokes(id);
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
    showBadge(`route:${id}`, st);
  }

  function styleNode(id, flash) {
    const m = reg.nodes.get(id);
    if (!m) return;
    const st = getState(`node:${id}`);
    cellState(m, st, st === "neutral" ? m.baseRadius : RADIUS.nodeStated);
    if (flash) flashEl(m.cell);
  }

  function stylePlant(id) {
    const m = reg.plants.get(id);
    if (m) setPlantState(m.plant, getState(`plant:${id}`));
  }

  function stylePo(id) {
    const m = reg.pos.get(id);
    if (m) m.block.dataset.state = getState(`po:${id}`);
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
    showBadge(`alt:${id}`, st);
  }

  function styleAlternative(id) {
    const m = reg.alternatives.get(id);
    if (!m) return;
    const st = getState(`alt-sup:${id}`);
    cellState(m, st, RADIUS.alternative);
    if (st === "neutral") {
      if (!map.hasLayer(layers.alternatives)) map.removeLayer(m);
    } else if (!map.hasLayer(m)) m.addTo(map);
  }

  /** Apply a state to entities. ids may include ALT-* corridors and A-* alternative suppliers. */
  function mark({ supplier_ids = [], route_ids = [], node_ids = [], plant_ids = [], po_ids = [], alternative_ids = [], state = "affected" } = {}) {
    const st = ["affected", "at_risk", "resolved", "neutral"].includes(state) ? state : "affected";
    for (const id of supplier_ids || []) {
      if (String(id).startsWith("A-")) { states.set(`alt-sup:${id}`, st); styleAlternative(id); continue; }
      if (model.plants.has(id)) { states.set(`plant:${id}`, st); stylePlant(id); continue; }
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
        stylePo(poId);
      }
    }
    for (const id of node_ids || []) { states.set(`node:${id}`, st); styleNode(id, st === "affected"); }
    for (const id of plant_ids || []) { states.set(`plant:${id}`, st); stylePlant(id); }
    for (const id of po_ids || []) { states.set(`po:${id}`, st); stylePo(id); }
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
      else if (kind === "plant") stylePlant(id);
      else if (kind === "po") stylePo(id);
      else if (kind === "alt") styleAltPath(id);
      else if (kind === "alt-sup") styleAlternative(id);
    }
    map.closePopup();
  }

  // The theme changed: read the tokens again and repaint what Leaflet draws as lines (the supply links,
  // the corridors, the offline coastline map); CARTO's tiles switch between its light and dark style.
  document.addEventListener("vc:themechange", () => {
    readMapColors();
    for (const id of reg.spokesBySupplier.keys()) styleSpokes(id);
    for (const id of reg.routes.keys()) styleRoute(id);
    for (const id of reg.altPaths.keys()) styleAltPath(id);
    offline.restyle();
    if (basemap.kind === "carto") {
      const next = makeTileLayer(L, "carto");
      next.on("tileload", onTileLoad);
      next.on("tileerror", onTileError);
      map.removeLayer(tiles);
      tiles = next;
      next.addTo(map);
    }
  });

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

/**
 * The zoom buttons: Vici's icon buttons (plus and minus, 44 px hexagon cells with tooltips) in a
 * Leaflet control with Leaflet's zoom class, so a click on them counts as the presenter's own move.
 */
function addZoomControl(L, map) {
  const Zoom = L.Control.extend({
    options: { position: "bottomright" },
    onAdd() {
      const bar = h("div", { class: "leaflet-control-zoom map-zoom", role: "group", "aria-label": "Zoom" });
      const button = (glyph, label, zoom) => {
        const b = h("button", { class: "vc-icon-button", type: "button" }, glyph);
        b.addEventListener("click", (e) => { if (!isDisabled(b)) zoom(map.options.zoomDelta * (e.shiftKey ? 3 : 1)); });
        // After a click with the mouse the focus goes back to the map, as with Leaflet's own control,
        // so the arrow keys and + and − work at once.
        L.DomEvent.on(b, "click", this._refocusOnMap, this);
        bar.appendChild(withTooltip(b, label));
        return b;
      };
      const zoomIn = button(icon("plus", 20), "Zoom in", (d) => map.zoomIn(d));
      const zoomOut = button(icon("minus", 20), "Zoom out", (d) => map.zoomOut(d));
      const sync = () => {
        setDisabled(zoomIn, map.getZoom() >= map.getMaxZoom());
        setDisabled(zoomOut, map.getZoom() <= map.getMinZoom());
      };
      map.on("zoomend zoomlevelschange", sync);
      sync();
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.disableScrollPropagation(bar);
      return bar;
    }
  });
  new Zoom().addTo(map);
}

/** A corridor's state badge: a hexagon cell with the state's mark, not interactive, no tab stop. */
function badgeAt(L, latlng) {
  const cell = cellMarker("badge", { height: BADGE });
  const m = L.marker(latlng, { pane: "badges", interactive: false, keyboard: false, icon: L.divIcon({ className: "hex-icon", html: cell, iconSize: [0, 0] }) });
  m.cell = cell;
  return m;
}

/** The point halfway along a corridor's lines (their points in order, by distance on the ground). */
function midpoint(L, lines) {
  const pts = lines.flatMap((l) => l.getLatLngs());
  if (pts.length < 2) return pts[0];
  const steps = pts.slice(1).map((p, i) => pts[i].distanceTo(p));
  let left = steps.reduce((a, b) => a + b, 0) / 2;
  for (const [i, d] of steps.entries()) {
    if (left <= d && d > 0) {
      const f = left / d;
      return L.latLng(pts[i].lat + (pts[i + 1].lat - pts[i].lat) * f, pts[i].lng + (pts[i + 1].lng - pts[i].lng) * f);
    }
    left -= d;
  }
  return pts[pts.length - 1];
}

/** The theme the page shows now (js/theme.js and vici.js keep it on <html>). */
const darkTheme = () => document.documentElement.getAttribute("data-theme") === "dark";

/**
 * The tiles: CARTO's light or dark style from the same host when a key is set; otherwise
 * OpenStreetMap's, which css/map.css desaturates in the light theme and darkens in the dark one.
 */
function makeTileLayer(L, kind) {
  if (kind === "carto") {
    const url = darkTheme() ? BASEMAP.carto.urlDark : BASEMAP.carto.url;
    return L.tileLayer(url.replace("{key}", encodeURIComponent(BASEMAP.cartoKey)), {
      attribution: BASEMAP.carto.attribution, maxZoom: 11, className: "tiles-carto", crossOrigin: false
    });
  }
  return L.tileLayer(BASEMAP.osm.url, { attribution: BASEMAP.osm.attribution, maxZoom: 11, className: "tiles-osm-light" });
}

/** The offline coastline map in the theme's land, coast and border colours; restyle() repaints it. */
function addOfflineBasemap(L, map) {
  const data = window.OFFLINE_BASEMAP;
  const land = [];
  const borders = [];
  if (data) {
    const renderer = L.canvas({ pane: "offline", padding: 0.5 });
    for (const rings of data.land) {
      land.push(L.polygon(rings, { renderer, pane: "offline", color: COLOR.coast, weight: 0.8, opacity: 1, fillColor: COLOR.land, fillOpacity: 1, interactive: false, smoothFactor: 1.5 }).addTo(map));
    }
    for (const line of data.borders) {
      borders.push(L.polyline(line, { renderer, pane: "offline", color: COLOR.border, weight: 1, opacity: 1, interactive: false, smoothFactor: 1.5 }).addTo(map));
    }
  }
  return {
    restyle() {
      for (const p of land) p.setStyle({ color: COLOR.coast, fillColor: COLOR.land });
      for (const l of borders) l.setStyle({ color: COLOR.border });
    }
  };
}

function buildLegend(map, layers) {
  // The toggles: hex capsules the map owns (aria-pressed), ticked in ink.
  const toggle = (label, layer, on) => {
    const btn = h("button", { class: "legend-chip", type: "button", "aria-pressed": on ? "true" : "false" },
      h("span", { class: "box" }, icon("check", 14)), label);
    btn.addEventListener("click", () => {
      const now = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(now));
      if (now) layer.addTo(map); else map.removeLayer(layer);
    });
    return btn;
  };
  // The swatches are the map's own cells and lines; their colours come from css/map.css (data-kind).
  const cell = (kind, label) => h("div", { class: "legend-row" }, h("span", { class: "legend-swatch", dataset: { kind } }, hexCell()), label);
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
        cell("tier1", "Tier 1 (delivers to our plants)"), cell("tier2", "Tier 2 (delivers to tier 1)"), cell("tier3", "Tier 3")),
      h("div", { class: "legend-group" }, h("h4", {}, "Status"),
        cell("affected", "Affected"), cell("at_risk", "At risk"), cell("resolved", "Resolved or mitigation")),
      h("div", { class: "legend-group" }, h("h4", {}, "Corridors"),
        line("sea", "Sea"), line("barge", "Rhine barge, rail, ferry"), line("road", "Road")),
      h("div", { class: "legend-toggles", role: "group", "aria-label": "Show on the map" },
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

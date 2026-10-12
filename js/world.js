// World data access: indexes, normalised supply flows, route geometry and query helpers.
// Pure module (no DOM). Shared by the UI, the agent tools and the impact engine.

const EPS = 1e-9;

/** Returns the raw synthetic world loaded by data/world.js. */
export function getWorldData() {
  const w = globalThis.WORLD;
  if (!w || !Array.isArray(w.plants)) throw new Error("World data (data/world.js) is not loaded.");
  return w;
}

let cachedModel = null;
/** Returns the (cached) indexed model of the world. */
export function getModel() {
  if (!cachedModel) cachedModel = buildModel(getWorldData());
  return cachedModel;
}

/** Builds an indexed, normalised model from the raw world object. */
export function buildModel(world) {
  const plants = mapById(world.plants);
  const parts = mapById(world.parts);
  const nodes = mapById(world.nodes);
  const suppliers = mapById(world.suppliers);
  const alternatives = mapById(world.alternatives);
  const routes = new Map(world.routes.map((r) => [r.id, indexRoute(r)]));
  const purchaseOrders = mapById(world.purchase_orders || []);

  const sites = new Map();
  for (const p of world.plants) sites.set(p.id, { kind: "plant", obj: p });
  for (const s of world.suppliers) sites.set(s.id, { kind: "supplier", obj: s });

  // Material-part consumer lookup: supplierId -> partId -> consumer entry.
  const materialConsumers = new Map();
  for (const part of world.parts) {
    for (const c of part.consumers || []) {
      if (!materialConsumers.has(c.supplier)) materialConsumers.set(c.supplier, new Map());
      materialConsumers.get(c.supplier).set(part.id, c);
    }
  }

  // Destination input definitions --------------------------------------------------------------
  const plantParts = new Map(); // plantId -> Map(partId -> slot)
  for (const plant of world.plants) plantParts.set(plant.id, new Map());
  for (const part of world.parts) {
    if (part.kind === "material") continue;
    for (const [plantId, d] of Object.entries(part.plants || {})) {
      if (!plantParts.has(plantId)) continue;
      plantParts.get(plantId).set(part.id, {
        key: part.id, partId: part.id, plantId,
        cover: d.days_of_cover, ss: d.safety_stock_days, dailyUnits: d.daily_demand,
        flows: [], isPart: true
      });
    }
  }

  const supplierInputs = new Map(); // supplierId -> Map(key -> slot)
  for (const s of world.suppliers) {
    const slots = new Map();
    for (const [key, def] of Object.entries(s.inputs || {})) {
      const part = parts.get(key);
      if (part && part.kind === "material") {
        const consumer = materialConsumers.get(s.id)?.get(key);
        const chain = consumer ? part.plants[consumer.plant] : null;
        slots.set(key, {
          key, partId: key, supplierId: s.id, isPart: true,
          chainPlant: consumer?.plant || null,
          cover: def.buffer_days ?? chain?.days_of_cover ?? 0,
          ss: chain?.safety_stock_days ?? 0,
          dailyUnits: consumer?.daily_units ?? 0,
          contingency: def.contingency || null,
          flows: []
        });
      } else {
        slots.set(key, {
          key, partId: null, supplierId: s.id, isPart: false,
          cover: def.buffer_days ?? 0, ss: 0, dailyUnits: 0,
          contingency: def.contingency || null,
          flows: []
        });
      }
    }
    supplierInputs.set(s.id, slots);
  }

  // Normalised flows -------------------------------------------------------------------------
  const flows = [];
  const problems = [];
  const sources = [...world.plants, ...world.suppliers];
  for (const src of sources) {
    for (const f of src.flows || []) {
      const targets = Array.isArray(f.to) ? f.to : [f.to];
      for (const to of targets) {
        const key = f.part || f.input;
        const destKind = plants.has(to) ? "plant" : suppliers.has(to) ? "supplier" : null;
        const flow = {
          id: `${src.id}>${to}:${key}`,
          from: src.id, to, destKind, key,
          part: f.part || null, input: f.part ? null : f.input,
          share: (f.share_pct ?? 0) / 100,
          route: f.route,
          transit: Math.max(0, Math.round(f.transit_days ?? 0)),
          transitRaw: f.transit_days ?? 0,
          direction: f.direction === "reverse" ? "reverse" : "forward",
          enterAt: f.enter_at || null,
          exitAt: f.exit_at || null,
          teuPerDay: 0,
          dailyUnits: 0
        };
        let slot = null;
        if (destKind === "plant") slot = plantParts.get(to)?.get(key) || null;
        if (destKind === "supplier") slot = supplierInputs.get(to)?.get(key) || null;
        if (!slot) {
          problems.push(`Flow ${flow.id}: destination ${to} has no input slot "${key}".`);
        } else {
          slot.flows.push(flow);
          if (flow.part) {
            const part = parts.get(flow.part);
            flow.dailyUnits = flow.share * (slot.dailyUnits || 0);
            flow.teuPerDay = part?.units_per_teu ? flow.dailyUnits / part.units_per_teu : 0;
          } else {
            flow.teuPerDay = Number(f.teu_per_day ?? 0);
          }
        }
        flows.push(flow);
      }
    }
  }

  for (const slots of [...plantParts.values(), ...supplierInputs.values()]) {
    for (const slot of slots.values()) {
      const total = slot.flows.reduce((a, f) => a + f.share, 0);
      slot.modelledShare = Math.min(1, total);
      slot.unmodelledShare = Math.max(0, 1 - total);
    }
  }

  const flowsFrom = groupBy(flows, (f) => f.from);
  const flowsInto = groupBy(flows, (f) => f.to);

  // Chain plants (which plant(s) a site ultimately supplies) ----------------------------------
  const chainPlants = new Map();
  const visiting = new Set();
  const chainOf = (id) => {
    if (chainPlants.has(id)) return chainPlants.get(id);
    if (plants.has(id)) { chainPlants.set(id, new Set([id])); return chainPlants.get(id); }
    if (visiting.has(id)) return new Set();
    visiting.add(id);
    const out = new Set();
    for (const f of flowsFrom.get(id) || []) for (const p of chainOf(f.to)) out.add(p);
    visiting.delete(id);
    chainPlants.set(id, out);
    return out;
  };
  for (const id of sites.keys()) chainOf(id);

  // Topological order (sources first) ---------------------------------------------------------
  const { order: topo, cyclic } = topoSort([...sites.keys()], flows);
  if (cyclic.length) problems.push(`Supply graph has a cycle involving: ${cyclic.join(", ")}`);

  // Route ↔ node index --------------------------------------------------------------------------
  const routesByNode = new Map();
  for (const r of routes.values()) {
    for (const n of r.nodeSeq) {
      if (!routesByNode.has(n)) routesByNode.set(n, []);
      routesByNode.get(n).push(r.id);
    }
  }
  const flowsByRoute = groupBy(flows, (f) => f.route);

  return {
    world, plants, parts, nodes, suppliers, alternatives, routes, purchaseOrders, sites,
    flows, flowsFrom, flowsInto, flowsByRoute, plantParts, supplierInputs, materialConsumers,
    chainPlants, topo, routesByNode, problems
  };
}

// ---------------------------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------------------------

function indexRoute(r) {
  const nodeSeq = [];
  const cum = [];
  let t = 0;
  r.legs.forEach((leg, i) => {
    if (i === 0 && leg.from !== "@origin") { nodeSeq.push(leg.from); cum.push(0); }
    t += leg.days;
    if (leg.to !== "@dest") { nodeSeq.push(leg.to); cum.push(t); }
  });
  return {
    ...r,
    nodeSeq, cum, total: t,
    startsAtOrigin: r.legs[0]?.from === "@origin",
    endsAtDest: r.legs[r.legs.length - 1]?.to === "@dest"
  };
}

/**
 * Days between a node on a flow's route and the flow's destination (rounded to whole days),
 * scaled to the flow's own transit time. Returns null if the flow does not pass the node.
 */
export function downstreamDays(model, flow, nodeId) {
  const r = model.routes.get(flow.route);
  if (!r) return null;
  const pos = r.nodeSeq.indexOf(nodeId);
  if (pos < 0) return null;
  if (r.total <= EPS) return 0;
  if (flow.direction === "reverse") {
    return Math.max(0, Math.round((flow.transit * r.cum[pos]) / r.total));
  }
  let startDays = 0;
  if (flow.enterAt) {
    const e = r.nodeSeq.indexOf(flow.enterAt);
    if (e >= 0) {
      if (pos < e) return null;
      startDays = r.cum[e];
    }
  }
  if (flow.exitAt) {
    const x = r.nodeSeq.indexOf(flow.exitAt);
    if (x >= 0 && pos > x) return null;
  }
  const span = r.total - startDays;
  if (span <= EPS) return 0;
  return Math.max(0, Math.round((flow.transit * (r.total - r.cum[pos])) / span));
}

/** Lat/lon of any site or node id. */
export function locate(model, id) {
  const site = model.sites.get(id);
  if (site) return [site.obj.lat, site.obj.lon];
  const node = model.nodes.get(id);
  if (node) return [node.lat, node.lon];
  const alt = model.alternatives.get(id);
  if (alt) return [alt.lat, alt.lon];
  return null;
}

/** Polyline (array of [lat, lon]) for a single route leg; origin/dest resolved when given. */
export function legPath(model, route, legIndex, originId = null, destId = null) {
  const leg = route.legs[legIndex];
  if (!leg) return [];
  const from = leg.from === "@origin" ? (originId ? locate(model, originId) : null) : locate(model, leg.from);
  const to = leg.to === "@dest" ? (destId ? locate(model, destId) : null) : locate(model, leg.to);
  const pts = [];
  if (from) pts.push(from);
  for (const v of leg.via || []) pts.push(v);
  if (to) pts.push(to);
  return pts;
}

/** Corridor polyline of a route between its named nodes (no origin/dest feeders). */
export function routePath(model, routeOrId) {
  const r = typeof routeOrId === "string" ? model.routes.get(routeOrId) : routeOrId;
  if (!r) return [];
  const pts = [];
  r.legs.forEach((leg, i) => {
    if (leg.from === "@origin" || leg.to === "@dest") return;
    for (const p of legPath(model, r, i)) {
      const last = pts[pts.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > EPS || Math.abs(last[1] - p[1]) > EPS) pts.push(p);
    }
  });
  return pts;
}

/** Point at fraction t (0..1) along a polyline, by geographic length. */
export function pointAlong(path, t) {
  if (!path.length) return null;
  if (path.length === 1) return path[0];
  const segs = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], (path[i][1] - path[i - 1][1]) * Math.cos(((path[i][0] + path[i - 1][0]) / 2) * Math.PI / 180));
    segs.push(d);
    total += d;
  }
  let target = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] > EPS ? target / segs[i] : 0;
      const a = path[i], b = path[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    target -= segs[i];
  }
  return path[path.length - 1];
}

/** Current map position of an open purchase order. */
export function poLatLng(model, po) {
  const r = model.routes.get(po.route);
  if (!r) return locate(model, po.supplier);
  const path = legPath(model, r, po.position?.leg ?? 0, po.supplier, po.to);
  return pointAlong(path, po.position?.progress ?? 0) || locate(model, po.supplier);
}

/** Entry and exit points for drawing a flow's feeder links onto a displayed corridor. */
export function flowEndpoints(model, flow) {
  const r = model.routes.get(flow.route);
  const src = locate(model, flow.from);
  const dst = locate(model, flow.to);
  if (!r || r.display === false || !r.nodeSeq.length) return { direct: true, segments: [[src, dst]] };
  const first = r.nodeSeq[0];
  const last = r.nodeSeq[r.nodeSeq.length - 1];
  let entry, exit;
  if (flow.direction === "reverse") { entry = last; exit = first; }
  else { entry = flow.enterAt || first; exit = flow.exitAt || last; }
  const segs = [];
  const e = locate(model, entry), x = locate(model, exit);
  if (src && e && distKm(src, e) > 25) segs.push([src, e]);
  if (dst && x && distKm(x, dst) > 25) segs.push([x, dst]);
  return { direct: false, segments: segs };
}

/** Great-circle distance in km. */
export function distKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------------------------------------
// Query helpers (used by popovers and agent tools)
// ---------------------------------------------------------------------------------------------

/** Display name of any id (plant, supplier, node, route, part, alternative). */
export function nameOf(model, id) {
  return model.plants.get(id)?.name || model.suppliers.get(id)?.name || model.nodes.get(id)?.name ||
    model.routes.get(id)?.name || model.parts.get(id)?.name || model.alternatives.get(id)?.name || id;
}

/** Routes whose corridor passes a node. */
export function routesThroughNode(model, nodeId) {
  return (model.routesByNode.get(nodeId) || []).map((id) => model.routes.get(id));
}

/** Distinct routes used by a supplier's outbound flows. */
export function routesOfSupplier(model, supplierId) {
  const ids = new Set((model.flowsFrom.get(supplierId) || []).map((f) => f.route));
  return [...ids].map((id) => model.routes.get(id)).filter(Boolean);
}

/** Flows (any tier) that carry a part or feed into a site making that part. */
export function flowsForPart(model, partId) {
  return model.flows.filter((f) => f.part === partId);
}

/** Open purchase orders matching optional filters. */
export function openPOs(model, { supplierId = null, partId = null, routeId = null, nodeId = null } = {}) {
  return [...model.purchaseOrders.values()].filter((po) => {
    if (supplierId && po.supplier !== supplierId && po.to !== supplierId) return false;
    if (partId) {
      const destPart = po.part || inferPartOfInputPO(model, po);
      if (destPart !== partId) return false;
    }
    if (routeId && po.route !== routeId) return false;
    if (nodeId) {
      const r = model.routes.get(po.route);
      if (!r || !r.nodeSeq.includes(nodeId)) return false;
    }
    return true;
  });
}

function inferPartOfInputPO(model, po) {
  const dest = model.suppliers.get(po.to);
  return dest?.parts?.[0] || null;
}

/** Plant chains (set of plant ids) a site ultimately supplies. */
export function chainPlantsOf(model, siteId) {
  return [...(model.chainPlants.get(siteId) || [])];
}

/** Date helper: ISO date (YYYY-MM-DD) for today + n days, in the browser's local time zone. */
export function dayToISO(offset, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + Math.round(offset));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------------------------

function mapById(list) {
  return new Map((list || []).map((x) => [x.id, x]));
}

function groupBy(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function topoSort(ids, flows) {
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  for (const f of flows) {
    if (!indeg.has(f.from) || !indeg.has(f.to)) continue;
    indeg.set(f.to, indeg.get(f.to) + 1);
    out.get(f.from).push(f.to);
  }
  const queue = ids.filter((id) => indeg.get(id) === 0).sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const nxt of out.get(id)) {
      indeg.set(nxt, indeg.get(nxt) - 1);
      if (indeg.get(nxt) === 0) queue.push(nxt);
    }
  }
  const cyclic = ids.filter((id) => indeg.get(id) > 0);
  return { order, cyclic };
}

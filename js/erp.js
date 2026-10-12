// ERP-style queries over the synthetic world. Pure functions returning compact, JSON-safe objects.
// Used by map popovers, the agent's erp_* tools and the simulation player: one source of truth.

import { nameOf, routesThroughNode, routesOfSupplier, openPOs, chainPlantsOf, dayToISO } from "./world.js";

const round1 = (x) => Math.round(x * 10) / 10;

/** Company overview: plants, part families, network summary. */
export function erpOverview(model) {
  const w = model.world;
  const tiers = {};
  for (const s of w.suppliers) tiers[`tier_${s.tier}`] = (tiers[`tier_${s.tier}`] || 0) + 1;
  const countries = [...new Set(w.suppliers.map((s) => s.country))].sort();
  const pos = [...model.purchaseOrders.values()];
  return {
    company: w.meta.company,
    note: w.meta.company_note,
    plants: w.plants.map((p) => ({
      id: p.id, name: p.name, role: p.role,
      output_per_day: p.output_per_day, output_unit: p.output_unit,
      line_stop_cost_eur_per_day: p.line_stop_cost_eur_per_day
    })),
    part_families: w.parts.map((p) => ({
      id: p.id, name: p.name, kind: p.kind,
      cover_days: Object.fromEntries(Object.entries(p.plants).map(([pl, d]) => [pl, d.days_of_cover]))
    })),
    network: {
      suppliers: w.suppliers.length,
      by_tier: tiers,
      countries,
      corridors: w.routes.filter((r) => r.display !== false).length,
      open_purchase_orders: pos.length,
      open_po_value_eur: pos.reduce((a, p) => a + p.value_eur, 0)
    },
    assumptions: { line_stop_cost_eur_per_day: w.assumptions.line_stop_cost_eur_per_day, note: w.assumptions.line_stop_cost_note }
  };
}

/** Compact supplier footprint for a live scan: where Nordwerk is exposed. */
export function erpFootprint(model) {
  const byCluster = new Map();
  for (const s of model.world.suppliers) {
    const key = `${s.city}, ${s.country}`;
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key).push(`${s.id} (${s.parts.map((p) => model.parts.get(p)?.name.split(" (")[0]).join("/")}, tier ${s.tier})`);
  }
  const chokepoints = model.world.nodes.filter((n) => ["chokepoint", "waterway", "pass"].includes(n.type) || ["N-RTM", "N-HAM", "N-KOP", "N-TME", "N-DUI", "N-MAL", "N-ALA"].includes(n.id));
  return {
    sites: [...byCluster.entries()].map(([place, list]) => ({ place, suppliers: list })),
    logistics_nodes: chokepoints.map((n) => ({ id: n.id, name: n.name })),
    plants: model.world.plants.map((p) => `${p.name} (${p.city}, ${p.country})`)
  };
}

// English country names for the ISO codes used in the world data, so "Slovenia" finds "SI".
const COUNTRY_NAMES = {
  AT: "Austria", BE: "Belgium", CN: "China", CZ: "Czechia Czech Republic", DE: "Germany", EE: "Estonia",
  FI: "Finland", FR: "France", HU: "Hungary", IN: "India", IT: "Italy", JP: "Japan", KR: "South Korea",
  MA: "Morocco", MY: "Malaysia", NL: "Netherlands", PL: "Poland", RO: "Romania", SI: "Slovenia",
  TH: "Thailand", TN: "Tunisia", TW: "Taiwan"
};

/**
 * Suppliers filtered by region, part or tier. A region term is a two-letter country code (matched
 * exactly), or a country, city, cluster or company text (substring). Several terms can be given
 * separated by commas, e.g. "SI, AT" or "Styria, Slovenia".
 */
export function erpListSuppliers(model, { region = null, part_id = null, tier = null } = {}) {
  const terms = region ? String(region).toLowerCase().split(/[,;|/]+/).map((t) => t.trim()).filter(Boolean) : [];
  const matchesTerm = (s, t) => {
    if (/^[a-z]{2}$/.test(t)) return s.country.toLowerCase() === t;
    const hay = `${s.country} ${COUNTRY_NAMES[s.country] || ""} ${s.city} ${s.cluster} ${s.name}`.toLowerCase();
    return hay.includes(t);
  };
  const list = model.world.suppliers.filter((s) => {
    if (tier && Number(tier) !== s.tier) return false;
    if (part_id && !s.parts.includes(part_id)) return false;
    if (terms.length && !terms.some((t) => matchesTerm(s, t))) return false;
    return true;
  });
  return {
    count: list.length,
    suppliers: list.map((s) => ({
      id: s.id, name: s.name, tier: s.tier, location: `${s.city}, ${s.country}`,
      parts: s.parts, directed_buy: !!s.directed_buy, dual_source: !!s.dual_source,
      supplies: (model.flowsFrom.get(s.id) || []).map((f) => flowLabel(model, f))
    }))
  };
}

/** Full supplier record incl. flows, inputs, surge, routes and open POs. */
export function erpGetSupplier(model, id) {
  const s = model.suppliers.get(id);
  if (!s) return { error: `Unknown supplier id "${id}". Use erp_list_suppliers to find ids.` };
  const flows = model.flowsFrom.get(id) || [];
  const inputs = [...(model.supplierInputs.get(id)?.values() || [])].map((slot) => ({
    input: slot.isPart ? `${slot.key} (${model.parts.get(slot.key)?.name})` : slot.key,
    buffer_days: round1(slot.cover),
    sources: slot.flows.map((f) => ({ supplier_id: f.from, name: nameOf(model, f.from), share_pct: Math.round(f.share * 100) })),
    unmodelled_share_pct: Math.round(slot.unmodelledShare * 100),
    contingency: slot.contingency || null
  }));
  const pos = openPOs(model, { supplierId: id });
  return {
    id: s.id, name: s.name, tier: s.tier,
    location: `${s.city}, ${s.country}`, cluster: s.cluster, lat: s.lat, lon: s.lon,
    parts: s.parts.map((p) => ({ id: p, name: model.parts.get(p)?.name })),
    directed_buy: !!s.directed_buy, dual_source: !!s.dual_source,
    lead_time_days: s.lead_time_days, finished_goods_buffer_days: s.fg_buffer_days ?? 0,
    transport_mode: s.transport_mode,
    surge_capacity: s.surge ? { max_extra_share_pct: s.surge.max_extra_share_pct, lead_days: s.surge.lead_days, premium_pct: s.surge.premium_pct } : null,
    supplies: flows.map((f) => ({
      to: f.to, to_name: nameOf(model, f.to),
      item: f.part ? `${f.part} (${model.parts.get(f.part)?.name})` : f.input,
      share_pct: Math.round(f.share * 100), transit_days: f.transitRaw, route: f.route
    })),
    feeds_plants: chainPlantsOf(model, id),
    inputs,
    routes: routesOfSupplier(model, id).map((r) => ({ id: r.id, name: r.name })),
    open_pos: { count: pos.length, value_eur: pos.reduce((a, p) => a + p.value_eur, 0), ids: pos.slice(0, 8).map((p) => p.id) },
    note: s.note || null
  };
}

/** Part family: demand, cover, suppliers, upstream dependencies, expedite options. */
export function erpGetPart(model, id) {
  const p = model.parts.get(id);
  if (!p) return { error: `Unknown part id "${id}". Use erp_get_overview to list part families.` };
  const direct = model.flows.filter((f) => f.part === id).map((f) => ({
    supplier_id: f.from, name: nameOf(model, f.from), tier: model.suppliers.get(f.from)?.tier ?? "internal",
    to: f.to, share_pct: Math.round(f.share * 100), transit_days: f.transitRaw, route: f.route
  }));
  const tier1 = new Set(direct.map((d) => d.supplier_id));
  const upstream = [];
  for (const t1 of tier1) {
    for (const slot of model.supplierInputs.get(t1)?.values() || []) {
      if (slot.isPart) continue;
      for (const f of slot.flows) upstream.push({ supplier_id: f.from, name: nameOf(model, f.from), input: slot.key, feeds: t1, share_pct: Math.round(f.share * 100), buffer_days_at_feed: slot.cover });
    }
  }
  return {
    id: p.id, name: p.name, family: p.family, kind: p.kind, unit: p.unit, unit_value_eur: p.unit_value_eur,
    plants: Object.fromEntries(Object.entries(p.plants).map(([pl, d]) => [pl, {
      daily_demand: d.daily_demand, days_of_cover: d.days_of_cover, safety_stock_days: d.safety_stock_days, note: d.note || undefined
    }])),
    consumers: p.consumers || undefined,
    suppliers: direct,
    upstream_dependencies: upstream,
    air_freight: p.air,
    spot_market: p.spot,
    build_without_part: p.build_shy,
    alternatives: model.world.alternatives.filter((a) => a.part === id).map((a) => a.id)
  };
}

/** Open purchase orders in transit, filtered. */
export function erpGetOpenPOs(model, filters = {}, now = new Date()) {
  const list = openPOs(model, {
    supplierId: filters.supplier_id || null,
    partId: filters.part_id || null,
    routeId: filters.route_id || null,
    nodeId: filters.node_id || null
  });
  return {
    count: list.length,
    value_eur: list.reduce((a, p) => a + p.value_eur, 0),
    orders: list.slice(0, 15).map((po) => ({
      id: po.id, supplier_id: po.supplier, to: po.to, part: po.part, item: po.item,
      qty: po.qty, unit: po.unit, value_eur: po.value_eur, route: po.route,
      status: po.status, where: po.where,
      eta_in_days: po.eta_offset_days, eta_date: dayToISO(po.eta_offset_days, now)
    })),
    truncated: list.length > 15
  };
}

/** Qualified alternative sources for a part family. */
export function erpGetAlternatives(model, partId) {
  const part = model.parts.get(partId);
  if (!part) return { error: `Unknown part id "${partId}".` };
  return {
    part_id: partId,
    part: part.name,
    alternatives: model.world.alternatives.filter((a) => a.part === partId).map((a) => ({
      id: a.id, name: a.name, location: `${a.city}, ${a.country}`, serves_plant: a.plant,
      qualification_days: a.qualification_days, qualification_cost_eur: a.qualification_cost_eur,
      cost_premium_pct: a.cost_premium_pct, max_share_pct: a.max_share_pct, transit_days: a.transit_days, note: a.note
    })),
    surge_options: [...new Set(model.flows.filter((f) => f.part === partId).map((f) => f.from))]
      .map((sid) => model.suppliers.get(sid))
      .filter((s) => s?.surge)
      .map((s) => ({ supplier_id: s.id, name: s.name, ...s.surge })),
    air_freight: part.air, spot_market: part.spot, build_without_part: part.build_shy
  };
}

/** Routes through a node, used by a supplier, or a route by id/name. */
export function erpGetRoutes(model, query) {
  const q = String(query || "").trim();
  let routes = [];
  let resolved = null;
  if (model.routes.has(q)) { routes = [model.routes.get(q)]; resolved = { kind: "route", id: q }; }
  else if (model.nodes.has(q)) { routes = routesThroughNode(model, q); resolved = { kind: "node", id: q, name: model.nodes.get(q).name }; }
  else if (model.suppliers.has(q)) { routes = routesOfSupplier(model, q); resolved = { kind: "supplier", id: q, name: model.suppliers.get(q).name }; }
  else {
    const lower = q.toLowerCase();
    const node = model.world.nodes.find((n) => n.name.toLowerCase().includes(lower) || n.id.toLowerCase() === lower);
    if (node) { routes = routesThroughNode(model, node.id); resolved = { kind: "node", id: node.id, name: node.name }; }
    else {
      routes = [...model.routes.values()].filter((r) => r.name.toLowerCase().includes(lower));
      resolved = { kind: "search", text: q };
    }
  }
  const out = {
    query: q,
    resolved,
    count: routes.length,
    routes: routes.slice(0, 12).map((r) => ({
      id: r.id, name: r.name, mode: r.mode, normal_transit_days: r.total,
      nodes: r.nodeSeq,
      alternatives: (r.alternatives || []).map((a) => ({ id: a.id, name: a.name, at_node: a.at_node, extra_days: a.extra_days, extra_cost_eur_per_teu: a.extra_cost_eur_per_teu })),
      used_by: (model.flowsByRoute.get(r.id) || []).map((f) => flowLabel(model, f)),
      open_pos: openPOs(model, { routeId: r.id }).length
    }))
  };
  if (resolved?.id === "N-KAU" || routes.some((r) => r.nodeSeq.includes("N-KAU"))) out.reference = model.world.reference.rhine_kaub;
  if (resolved?.id === "N-BAB" || resolved?.id === "N-SUZ") out.reference = model.world.reference.red_sea;
  return out;
}

/** "S-WRO-CELL → PL-LEJ: 50 % of P-CELL (1 d, R-RD-PL-LEJ)" */
export function flowLabel(model, f) {
  const what = f.part ? f.part : f.input;
  return `${f.from} → ${f.to}: ${Math.round(f.share * 100)} % of ${what} (${f.transitRaw} d, ${f.route})`;
}

/** Days of cover per plant part (for plant popovers and the overview). */
export function erpPlantCover(model, plantId) {
  const slots = model.plantParts.get(plantId);
  if (!slots) return [];
  return [...slots.values()].map((slot) => ({
    part_id: slot.partId,
    name: model.parts.get(slot.partId)?.name,
    days_of_cover: slot.cover,
    safety_stock_days: slot.ss,
    suppliers: slot.flows.length
  })).sort((a, b) => a.days_of_cover - b.days_of_cover);
}

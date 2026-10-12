// Integrity checks for the synthetic world, scenarios and reference cases.
// Runs in the browser (Diagnostics panel) and in Node (tools/check_world.mjs).

import { buildModel, downstreamDays } from "./world.js";
import { simulateImpact } from "./impact.js";

/**
 * @returns {{ok: boolean, checks: Array<{name: string, ok: boolean, detail: string}>, stats: object}}
 */
export function checkWorld(world, scenarios = [], referenceCases = {}) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const model = buildModel(world);

  add("Model builds without structural problems", model.problems.length === 0, model.problems.slice(0, 5).join(" | ") || "no problems");

  // ---- counts ---------------------------------------------------------------------------------
  const nParts = world.parts.length, nSup = world.suppliers.length, nPO = world.purchase_orders.length;
  add("12–15 part families", nParts >= 12 && nParts <= 15, `${nParts} part families`);
  add("50–70 suppliers (tier-1/tier-2)", nSup >= 50 && nSup <= 70, `${nSup} suppliers (${countBy(world.suppliers, (s) => `tier-${s.tier}`)})`);
  add("30–50 open purchase orders", nPO >= 30 && nPO <= 50, `${nPO} purchase orders`);
  add("6 injectable scenarios", scenarios.length === 6, `${scenarios.length} scenarios`);

  // ---- every part has at least one supplier ----------------------------------------------------
  const partsWithoutSupplier = world.parts.filter((p) => !model.flows.some((f) => f.part === p.id)).map((p) => p.id);
  add("Every part has ≥ 1 supplier", partsWithoutSupplier.length === 0, partsWithoutSupplier.join(", ") || "all parts sourced");

  // ---- every supplier has at least one route --------------------------------------------------
  const badSup = [];
  for (const s of world.suppliers) {
    const fl = model.flowsFrom.get(s.id) || [];
    if (!fl.length) badSup.push(`${s.id}: no flows`);
    for (const f of fl) if (!model.routes.has(f.route)) badSup.push(`${s.id}: unknown route ${f.route}`);
  }
  add("Every supplier has ≥ 1 valid route", badSup.length === 0, badSup.slice(0, 5).join(" | ") || "all suppliers routed");

  // ---- routes reference known nodes --------------------------------------------------------------
  const badLegs = [];
  for (const r of world.routes) {
    for (const leg of r.legs) {
      for (const n of [leg.from, leg.to]) if (!n.startsWith("@") && !model.nodes.has(n)) badLegs.push(`${r.id}: ${n}`);
    }
    for (const a of r.alternatives || []) if (!model.nodes.has(a.at_node)) badLegs.push(`${r.id}/${a.id}: ${a.at_node}`);
  }
  add("Route legs and alternatives reference known nodes", badLegs.length === 0, badLegs.slice(0, 5).join(" | ") || `${world.routes.length} routes valid`);

  // ---- shares --------------------------------------------------------------------------------------
  const shareIssues = [];
  for (const [plantId, slots] of model.plantParts) {
    for (const slot of slots.values()) {
      const sum = slot.flows.reduce((a, f) => a + f.share, 0);
      if (Math.abs(sum - 1) > 0.005) shareIssues.push(`${plantId}/${slot.key}: ${Math.round(sum * 100)} %`);
    }
  }
  for (const [supId, slots] of model.supplierInputs) {
    for (const slot of slots.values()) {
      const sum = slot.flows.reduce((a, f) => a + f.share, 0);
      if (slot.isPart && Math.abs(sum - 1) > 0.005) shareIssues.push(`${supId}/${slot.key}: ${Math.round(sum * 100)} %`);
      if (!slot.isPart && sum > 1.005) shareIssues.push(`${supId}/${slot.key}: ${Math.round(sum * 100)} % > 100 %`);
      if (!slot.flows.length) shareIssues.push(`${supId}/${slot.key}: no supplying flow`);
    }
  }
  add("Supply shares add up (plant parts and directed buys = 100 %)", shareIssues.length === 0, shareIssues.slice(0, 5).join(" | ") || "all shares consistent");

  // ---- material consumers ---------------------------------------------------------------------------
  const consumerIssues = [];
  for (const p of world.parts.filter((x) => x.kind === "material")) {
    for (const [plantId, d] of Object.entries(p.plants)) {
      const sum = (p.consumers || []).filter((c) => c.plant === plantId).reduce((a, c) => a + c.daily_units, 0);
      if (Math.abs(sum - d.daily_demand) > 1) consumerIssues.push(`${p.id}/${plantId}: consumers ${sum} vs demand ${d.daily_demand}`);
    }
    for (const c of p.consumers || []) {
      const s = world.suppliers.find((x) => x.id === c.supplier);
      if (!s || !s.inputs || !(p.id in s.inputs)) consumerIssues.push(`${p.id}: consumer ${c.supplier} lacks input slot`);
    }
  }
  add("Directed-buy consumer volumes match plant demand", consumerIssues.length === 0, consumerIssues.join(" | ") || "consistent");

  // ---- days of cover --------------------------------------------------------------------------------
  const covers = [];
  for (const p of world.parts) for (const d of Object.values(p.plants)) covers.push(d.days_of_cover);
  const minC = Math.min(...covers), maxC = Math.max(...covers);
  add("Days of cover between 2 and 45 and spread across the range", minC >= 2 && maxC <= 45 && minC <= 3 && maxC >= 40, `range ${minC}–${maxC} days (${new Set(covers).size} distinct values)`);

  // ---- alternatives ----------------------------------------------------------------------------------
  const altIssues = [];
  for (const p of world.parts) {
    const n = world.alternatives.filter((a) => a.part === p.id).length;
    if (n < 1 || n > 2) altIssues.push(`${p.id}: ${n} alternatives`);
  }
  for (const a of world.alternatives) {
    const part = model.parts.get(a.part);
    if (!part) altIssues.push(`${a.id}: unknown part`);
    else if (!part.plants[a.plant]) altIssues.push(`${a.id}: part not used at ${a.plant}`);
    if (!model.routes.has(a.route)) altIssues.push(`${a.id}: unknown route ${a.route}`);
    if (!(a.qualification_days > 0)) altIssues.push(`${a.id}: qualification_days missing`);
  }
  add("1–2 qualified alternatives per part family", altIssues.length === 0, altIssues.slice(0, 5).join(" | ") || `${world.alternatives.length} alternatives`);

  // ---- purchase orders --------------------------------------------------------------------------------
  const poIssues = [];
  for (const po of world.purchase_orders) {
    const flow = model.flows.find((f) => f.from === po.supplier && f.to === po.to && (!po.part || f.part === po.part));
    if (!flow) { poIssues.push(`${po.id}: no supply flow ${po.supplier} → ${po.to}`); continue; }
    if (flow.route !== po.route) poIssues.push(`${po.id}: route ${po.route} ≠ flow route ${flow.route}`);
    const r = model.routes.get(po.route);
    if (!r || po.position.leg < 0 || po.position.leg >= r.legs.length) poIssues.push(`${po.id}: invalid leg`);
    if (!(po.eta_offset_days >= 0) || !(po.shipped_offset_days <= 0)) poIssues.push(`${po.id}: dates`);
    if (!(po.value_eur > 0)) poIssues.push(`${po.id}: value`);
  }
  add("Open POs match real supply flows and routes", poIssues.length === 0, poIssues.slice(0, 5).join(" | ") || `${nPO} POs consistent`);

  // ---- coordinates -------------------------------------------------------------------------------------
  const coordIssues = [];
  for (const x of [...world.plants, ...world.suppliers, ...world.nodes, ...world.alternatives]) {
    if (!(x.lat >= -90 && x.lat <= 90 && x.lon >= -180 && x.lon <= 180)) coordIssues.push(x.id);
  }
  add("All locations have valid coordinates", coordIssues.length === 0, coordIssues.join(", ") || "valid");

  // ---- scenarios touch >= 2 parts with different cover -------------------------------------------------
  for (const sc of scenarios) {
    const touched = scenarioParts(model, sc.exposure_check || {});
    const coverSet = new Set(touched.map((t) => t.cover));
    add(`Scenario ${sc.number}: touches ≥ 2 parts with different cover`, touched.length >= 2 && coverSet.size >= 2,
      touched.map((t) => `${t.part}@${t.plant} ${t.cover} d`).join(", ") || "no parts touched");
  }

  // ---- reference cases run and bite ------------------------------------------------------------------
  const stats = {};
  for (const sc of scenarios) {
    const rc = referenceCases[sc.id];
    if (!rc) { add(`Reference case for scenario ${sc.number}`, false, "missing"); continue; }
    const res = simulateImpact(model, rc.disruption);
    if (!res.ok) { add(`Reference case ${sc.number} runs`, false, res.errors.join(" | ")); continue; }
    const b = res.baseline;
    stats[sc.id] = { var: b.value_at_risk_eur, first_stop_day: b.first_stop_day, variants: res.variants.map((v) => ({ id: v.variant_id, total: v.total_cost_eur })) };
    add(`Reference case ${sc.number}: value at risk > 0 with 3 options`, b.value_at_risk_eur > 0 && res.variants.length === 3,
      `VaR €${(b.value_at_risk_eur / 1e6).toFixed(2)}M, first stop day ${b.first_stop_day ?? "—"}`);
  }

  return { ok: checks.every((c) => c.ok), checks, stats };
}

/** Parts (with plant and cover) exposed to a set of nodes and/or suppliers. */
export function scenarioParts(model, { node_ids = [], supplier_ids = [] } = {}) {
  const flows = new Set();
  for (const f of model.flows) {
    if (supplier_ids.includes(f.from)) flows.add(f);
    for (const n of node_ids) if (downstreamDays(model, f, n) !== null) flows.add(f);
  }
  const out = new Map();
  const addPart = (partId, plantId) => {
    const part = model.parts.get(partId);
    const d = part?.plants?.[plantId];
    if (!d) return;
    out.set(`${partId}@${plantId}`, { part: partId, plant: plantId, cover: d.days_of_cover });
  };
  for (const f of flows) {
    const plantsOfDest = model.chainPlants.get(f.to) || new Set();
    if (f.part) {
      for (const pl of plantsOfDest) addPart(f.part, pl);
    } else {
      const dest = model.suppliers.get(f.to);
      for (const partId of dest?.parts || []) for (const pl of plantsOfDest) addPart(partId, pl);
    }
  }
  return [...out.values()];
}

function countBy(list, fn) {
  const m = {};
  for (const x of list) m[fn(x)] = (m[fn(x)] || 0) + 1;
  return Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(", ");
}

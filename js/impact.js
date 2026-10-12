// Deterministic production-impact engine (powers the `sim_impact` tool and the simulation scripts).
// No randomness and no LLM arithmetic: identical inputs always produce identical outputs.
//
// Model in one paragraph: every site (supplier or plant) is simulated day by day in supply-graph
// order. A site produces at min(capacity, availability of each modelled input); input stock is
// measured in days of requirement. Shipments reach the next site after the flow's transit time;
// route disruptions cut arrivals during a window that starts when the first affected cargo would
// have reached the destination. A plant runs at the rate of its scarcest part. Lost output is
// costed as stop-equivalent days × line-stop cost per day. No backlog catch-up is assumed.

import { downstreamDays, dayToISO } from "./world.js";

export const ENGINE_VERSION = "1.0.0";
const SHORT = 0.995;        // output below this ratio counts as (partial) line stop
const LOOKAHEAD_DAYS = 60;  // internal simulation length used to find stops beyond the horizon
const EPS = 1e-9;

export const MITIGATION_TYPES = ["surge", "airfreight", "spot_buy", "alt_supplier", "build_shy", "reroute", "input_contingency"];

/**
 * Simulate a disruption and optional mitigation variants.
 * @param {object} model  result of buildModel()
 * @param {object} spec   { label?, horizon_days?, supplier_outages?, route_disruptions?, variants? }
 * @param {object} opts   { now?: Date }
 */
export function simulateImpact(model, spec = {}, opts = {}) {
  const errors = [];
  const warnings = [];
  const H = intIn(spec.horizon_days, 30, 7, 90, "horizon_days", errors);
  const T = Math.max(H, LOOKAHEAD_DAYS);

  const disruption = compileDisruption(model, spec, T, errors, warnings);
  const vin = Array.isArray(spec.variants) ? spec.variants : [];
  if (vin.length > 6) errors.push("variants: at most 6 variants per call.");
  const compiled = vin.slice(0, 6).map((v, i) => compileVariant(model, disruption, v, i, T, H, errors, warnings));

  if (errors.length) {
    return {
      ok: false,
      errors,
      hint: "Fix the listed fields and call sim_impact again. Ids must come from erp_* tool results."
    };
  }

  const base = run(model, disruption, emptyMitigation(disruption), H, T);
  const baseline = summarizeBaseline(model, base, disruption, H, T);
  const variants = compiled.map((cv) => {
    const r = run(model, disruption, cv.mit, H, T);
    return summarizeVariant(model, cv, r, baseline, H, T);
  });

  const now = opts.now || new Date();
  return {
    ok: true,
    engine_version: ENGINE_VERSION,
    label: String(spec.label || "Disruption scenario"),
    start_date: dayToISO(0, now),
    horizon_days: H,
    baseline,
    variants,
    assumptions: [
      `Line-stop cost: Leipzig €${fmtInt(model.plants.get("PL-LEJ").line_stop_cost_eur_per_day)}/day, Győr €${fmtInt(model.plants.get("PL-GYR").line_stop_cost_eur_per_day)}/day (assumptions). Partial shortages are costed pro rata.`,
      "A plant runs at the rate of its scarcest part; inventory is today's days of cover.",
      "No backlog catch-up after a disruption ends (conservative).",
      "Expediting (air, spot) only buys what is needed to protect safety stock; surge, alternative sources and contingencies replace lost volume.",
      `Value at risk counts the first ${H} days; first-stop dates are searched up to day ${T}.`
    ],
    warnings,
    ui: buildUiSeries(model, base, variants, H)
  };
}

/** Strips UI-only data and internal fields so the result can be returned to the model compactly. */
export function compactForModel(result) {
  if (!result || !result.ok) return result;
  const { ui, ...rest } = result;
  return {
    ...rest,
    variants: rest.variants.map(({ _run, ...v }) => v)
  };
}

// =============================================================================================
// Disruption compilation
// =============================================================================================

function compileDisruption(model, spec, T, errors, warnings) {
  const cap = new Map();     // siteId -> Float64Array capacity ratio per day
  const gaps = new Map();    // flowId -> [{start, len, sev, node, route, idx, type}]
  const outages = [];
  const routeEvents = [];

  (Array.isArray(spec.supplier_outages) ? spec.supplier_outages : []).forEach((o, i) => {
    const at = `supplier_outages[${i}]`;
    const id = o?.supplier_id;
    if (!model.suppliers.has(id) && !model.plants.has(id)) {
      errors.push(`${at}: unknown supplier_id "${id}" (plants are also allowed). Use erp_list_suppliers / erp_get_overview for valid ids.`);
      return;
    }
    const loss = numIn(o.capacity_loss_pct, 100, 0, 100, `${at}.capacity_loss_pct`, errors) / 100;
    const start = intIn(o.start_in_days, 0, 0, T, `${at}.start_in_days`, errors);
    if (o.duration_days === undefined || o.duration_days === null) {
      errors.push(`${at}: duration_days is required (expected outage length in days).`);
      return;
    }
    const dur = intIn(o.duration_days, 7, 1, 365, `${at}.duration_days`, errors);
    const arr = cap.get(id) || new Float64Array(T).fill(1);
    for (let t = start; t < Math.min(T, start + dur); t++) arr[t] = Math.max(0, arr[t] - loss);
    cap.set(id, arr);
    outages.push({ supplier_id: id, capacity_loss_pct: Math.round(loss * 100), start_in_days: start, duration_days: dur });
  });

  (Array.isArray(spec.route_disruptions) ? spec.route_disruptions : []).forEach((d, i) => {
    const at = `route_disruptions[${i}]`;
    const node = d?.node_id;
    if (!model.nodes.has(node)) {
      errors.push(`${at}: unknown node_id "${node}". Use erp_get_routes to list nodes (e.g. N-RTM, N-KAU, N-BAB).`);
      return;
    }
    const type = d.type === "capacity" ? "capacity" : d.type === "delay" ? "delay" : null;
    if (!type) {
      errors.push(`${at}: type must be "delay" (cargo held/re-routed for delay_days) or "capacity" (throughput reduced to capacity_pct for duration_days).`);
      return;
    }
    let len, sev;
    if (type === "delay") {
      if (d.delay_days === undefined) { errors.push(`${at}: delay_days is required for type "delay".`); return; }
      len = intIn(d.delay_days, 7, 1, 120, `${at}.delay_days`, errors);
      sev = 1;
    } else {
      if (d.capacity_pct === undefined || d.duration_days === undefined) {
        errors.push(`${at}: capacity_pct and duration_days are required for type "capacity".`);
        return;
      }
      const c = numIn(d.capacity_pct, 50, 0, 100, `${at}.capacity_pct`, errors) / 100;
      len = intIn(d.duration_days, 14, 1, 365, `${at}.duration_days`, errors);
      sev = 1 - c;
    }
    const start = intIn(d.start_in_days, 0, 0, T, `${at}.start_in_days`, errors);
    const filter = Array.isArray(d.route_ids) && d.route_ids.length ? new Set(d.route_ids) : null;
    if (filter) for (const r of filter) if (!model.routes.has(r)) errors.push(`${at}: unknown route id "${r}".`);
    let hits = 0;
    for (const f of model.flows) {
      if (filter && !filter.has(f.route)) continue;
      const delta = downstreamDays(model, f, node);
      if (delta === null) continue;
      if (!gaps.has(f.id)) gaps.set(f.id, []);
      gaps.get(f.id).push({ start: start + delta, len, sev, node, route: f.route, idx: i, type, nodeStart: start });
      hits++;
    }
    if (!hits) warnings.push(`${at}: no supply flows pass ${node}${filter ? " on the given routes" : ""}; no effect.`);
    routeEvents.push({ node_id: node, type, len, sev, start_in_days: start, flows: hits });
  });

  if (!outages.length && !routeEvents.length) {
    errors.push("Specify at least one supplier_outages[] or route_disruptions[] entry.");
  }
  return { cap, gaps, outages, routeEvents, T };
}

// =============================================================================================
// Mitigation compilation
// =============================================================================================

function emptyMitigation(D) {
  return {
    surge: new Map(),          // supplierId -> {extra, start, end, premium}
    slot: new Map(),           // slotKey -> {alt:[], air:[], spot:[], cont:[], shy:null}
    gaps: D ? D.gaps : new Map(),
    rerouteCost: 0,
    rerouteItems: [],
    fixedCosts: [],
    items: []
  };
}

function slotKey(siteId, key) { return `${siteId}|${key}`; }

function slotMit(mit, siteId, key) {
  const k = slotKey(siteId, key);
  if (!mit.slot.has(k)) mit.slot.set(k, { alt: [], air: [], spot: [], cont: [], shy: null });
  return mit.slot.get(k);
}

/** Resolve the slots (plant parts or consumer inputs) a part-level mitigation applies to. */
function partSlots(model, part, plantId, at, errors) {
  const plants = Object.keys(part.plants || {});
  let pl = plantId;
  if (!pl) {
    if (plants.length === 1) pl = plants[0];
    else { errors.push(`${at}: plant_id is required for ${part.id} (one of ${plants.join(", ")}).`); return []; }
  }
  if (!plants.includes(pl)) { errors.push(`${at}: ${part.id} is not used for plant ${pl}.`); return []; }
  if (part.kind !== "material") return [{ siteId: pl, key: part.id }];
  return (part.consumers || []).filter((c) => c.plant === pl).map((c) => ({ siteId: c.supplier, key: part.id }));
}

function compileVariant(model, D, v, i, T, H, errors, warnings) {
  const where = `variants[${i}]`;
  const mit = emptyMitigation(D);
  const id = String(v?.variant_id || `V${i + 1}`).slice(0, 40);
  const name = String(v?.name || id).slice(0, 120);
  let timeToEffect = 0;
  const list = Array.isArray(v?.mitigations) ? v.mitigations : [];
  if (!list.length) errors.push(`${where}: mitigations[] must contain at least one mitigation.`);
  const reroutes = [];

  list.forEach((m, j) => {
    const at = `${where}.mitigations[${j}]`;
    switch (m?.type) {
      case "surge": {
        const s = model.suppliers.get(m.supplier_id);
        if (!s) { errors.push(`${at}: unknown supplier_id "${m.supplier_id}".`); return; }
        if (!s.surge) { errors.push(`${at}: ${s.id} has no surge capacity on record.`); return; }
        const partFlows = (model.flowsFrom.get(s.id) || []).filter((f) => f.part);
        if (!partFlows.length) { errors.push(`${at}: surge is modelled only for suppliers that ship a part family (tier-1 or directed buy); ${s.id} ships inputs only.`); return; }
        const extra = numIn(m.extra_share_pct, s.surge.max_extra_share_pct, 1, 100, `${at}.extra_share_pct`, errors);
        if (extra > s.surge.max_extra_share_pct + EPS) { errors.push(`${at}: ${s.id} can add at most ${s.surge.max_extra_share_pct} % (extra_share_pct=${extra}).`); return; }
        const start = intIn(m.start_in_days, s.surge.lead_days, 0, T, `${at}.start_in_days`, errors);
        if (start < s.surge.lead_days) { errors.push(`${at}: ${s.id} needs ${s.surge.lead_days} days to ramp up; earliest start_in_days is ${s.surge.lead_days}.`); return; }
        const dur = intIn(m.duration_days, T, 1, 365, `${at}.duration_days`, errors);
        mit.surge.set(s.id, { extra: extra / 100, start, end: start + dur, premium: s.surge.premium_pct / 100 });
        mit.items.push({ type: "surge", ref: s.id, label: `Surge ${s.name} +${extra} %` });
        timeToEffect = Math.max(timeToEffect, start + (partFlows[0]?.transit || 0));
        break;
      }
      case "airfreight": {
        const part = model.parts.get(m.part_id);
        if (!part) { errors.push(`${at}: unknown part_id "${m.part_id}".`); return; }
        if (!part.air?.feasible) { errors.push(`${at}: air freight is not feasible for ${part.id} (${part.air?.note || "no air option"}).`); return; }
        const slots = partSlots(model, part, m.plant_id, at, errors);
        const max = numIn(m.max_share_pct, 100, 1, 100, `${at}.max_share_pct`, errors) / 100;
        const start = intIn(m.start_in_days, part.air.lead_days, 0, T, `${at}.start_in_days`, errors);
        if (start < part.air.lead_days) { errors.push(`${at}: air freight for ${part.id} needs ${part.air.lead_days} days (booking + flight + customs); earliest start_in_days is ${part.air.lead_days}.`); return; }
        const dur = intIn(m.duration_days, T, 1, 365, `${at}.duration_days`, errors);
        for (const sl of slots) slotMit(mit, sl.siteId, sl.key).air.push({ max, start, end: start + dur, premium: part.air.premium_eur_per_unit, partId: part.id });
        mit.items.push({ type: "airfreight", ref: part.id, label: `Air-freight bridge ${part.name}` });
        timeToEffect = Math.max(timeToEffect, start);
        break;
      }
      case "spot_buy": {
        const part = model.parts.get(m.part_id);
        if (!part) { errors.push(`${at}: unknown part_id "${m.part_id}".`); return; }
        if (!part.spot) { errors.push(`${at}: no spot/broker market is modelled for ${part.id}.`); return; }
        const slots = partSlots(model, part, m.plant_id, at, errors);
        const max = numIn(m.max_share_pct, part.spot.max_share_pct, 1, 100, `${at}.max_share_pct`, errors);
        if (max > part.spot.max_share_pct + EPS) { errors.push(`${at}: spot market for ${part.id} covers at most ${part.spot.max_share_pct} % of demand.`); return; }
        const start = intIn(m.start_in_days, part.spot.lead_days, 0, T, `${at}.start_in_days`, errors);
        if (start < part.spot.lead_days) { errors.push(`${at}: spot buys for ${part.id} need ${part.spot.lead_days} days; earliest start_in_days is ${part.spot.lead_days}.`); return; }
        const dur = intIn(m.duration_days, T, 1, 365, `${at}.duration_days`, errors);
        for (const sl of slots) slotMit(mit, sl.siteId, sl.key).spot.push({ max: max / 100, start, end: start + dur, premium: part.spot.premium_pct / 100, partId: part.id });
        mit.items.push({ type: "spot_buy", ref: part.id, label: `Spot/broker buy ${part.name}` });
        timeToEffect = Math.max(timeToEffect, start);
        break;
      }
      case "alt_supplier": {
        const alt = model.alternatives.get(m.alternative_id);
        if (!alt) { errors.push(`${at}: unknown alternative_id "${m.alternative_id}". Use erp_get_alternatives.`); return; }
        const part = model.parts.get(alt.part);
        const share = numIn(m.share_pct, alt.max_share_pct, 1, 100, `${at}.share_pct`, errors);
        if (share > alt.max_share_pct + EPS) { errors.push(`${at}: ${alt.id} can take at most ${alt.max_share_pct} % of demand.`); return; }
        const start = intIn(m.start_in_days, alt.qualification_days, 0, 400, `${at}.start_in_days`, errors);
        if (start < alt.qualification_days) { errors.push(`${at}: ${alt.id} needs ${alt.qualification_days} days of qualification; earliest start_in_days is ${alt.qualification_days}.`); return; }
        const slots = partSlots(model, part, alt.plant, at, errors);
        for (const sl of slots) slotMit(mit, sl.siteId, sl.key).alt.push({ share: share / 100, start, transit: Math.round(alt.transit_days || 0), premium: alt.cost_premium_pct / 100, altId: alt.id, partId: part.id });
        mit.fixedCosts.push({ label: `Qualification ${alt.name}`, cost: alt.qualification_cost_eur || 0, ref: alt.id });
        mit.items.push({ type: "alt_supplier", ref: alt.id, label: `Qualify ${alt.name} (${alt.qualification_days} d)` });
        timeToEffect = Math.max(timeToEffect, start + Math.round(alt.transit_days || 0));
        if (start + (alt.transit_days || 0) >= H) warnings.push(`${at}: ${alt.id} only delivers from day ${start + Math.round(alt.transit_days || 0)}, outside the ${H}-day horizon.`);
        break;
      }
      case "build_shy": {
        const part = model.parts.get(m.part_id);
        if (!part) { errors.push(`${at}: unknown part_id "${m.part_id}".`); return; }
        if (!part.build_shy) { errors.push(`${at}: building vehicles without ${part.id} is not allowed (only parts with a build_shy rule).`); return; }
        const plants = Object.keys(part.plants);
        const plantId = m.plant_id || plants[0];
        if (!plants.includes(plantId)) { errors.push(`${at}: ${part.id} is not used for plant ${plantId}.`); return; }
        const start = intIn(m.start_in_days, 0, 0, T, `${at}.start_in_days`, errors);
        const maxDays = intIn(m.max_days, part.build_shy.max_days, 1, part.build_shy.max_days, `${at}.max_days`, errors);
        // Budget of build-shy days, spent only on days the part is actually short.
        slotMit(mit, plantId, part.id).shy = { start, budget: maxDays, rework: part.build_shy.rework_eur_per_vehicle };
        mit.items.push({ type: "build_shy", ref: part.id, label: `Build without ${part.name}, retrofit later (≤ ${maxDays} days)` });
        timeToEffect = Math.max(timeToEffect, start);
        break;
      }
      case "reroute": {
        const altId = m.alternative_id;
        const routes = [...model.routes.values()].filter((r) => (r.alternatives || []).some((a) => a.id === altId));
        if (!routes.length) { errors.push(`${at}: unknown route alternative "${altId}". Use erp_get_routes to see alternatives (e.g. ALT-ANR, ALT-CAPE, ALT-RAIL-RHINE).`); return; }
        if (m.route_id && !routes.some((r) => r.id === m.route_id)) { errors.push(`${at}: route ${m.route_id} has no alternative ${altId}.`); return; }
        const start = intIn(m.start_in_days, 2, 0, T, `${at}.start_in_days`, errors);
        reroutes.push({ altId, routeId: m.route_id || null, start, at });
        timeToEffect = Math.max(timeToEffect, start);
        break;
      }
      case "input_contingency": {
        const slots = model.supplierInputs.get(m.supplier_id);
        if (!slots) { errors.push(`${at}: unknown supplier_id "${m.supplier_id}".`); return; }
        const slot = slots.get(m.input);
        if (!slot) { errors.push(`${at}: ${m.supplier_id} has no modelled input "${m.input}" (inputs: ${[...slots.keys()].join(", ") || "none"}).`); return; }
        const c = slot.contingency;
        if (!c) { errors.push(`${at}: no contingency source on record for ${m.supplier_id} / ${m.input}.`); return; }
        const share = numIn(m.share_pct, c.max_share_pct, 1, 100, `${at}.share_pct`, errors);
        if (share > c.max_share_pct + EPS) { errors.push(`${at}: contingency covers at most ${c.max_share_pct} %.`); return; }
        const start = intIn(m.start_in_days, c.lead_days, 0, T, `${at}.start_in_days`, errors);
        if (start < c.lead_days) { errors.push(`${at}: contingency needs ${c.lead_days} days; earliest start_in_days is ${c.lead_days}.`); return; }
        slotMit(mit, m.supplier_id, m.input).cont.push({ max: share / 100, fullMax: c.max_share_pct / 100, start, costPerDay: c.cost_eur_per_day });
        mit.items.push({ type: "input_contingency", ref: `${m.supplier_id}/${m.input}`, label: c.description });
        timeToEffect = Math.max(timeToEffect, start);
        break;
      }
      default:
        errors.push(`${at}: unknown type "${m?.type}". Allowed: ${MITIGATION_TYPES.join(", ")}.`);
    }
  });

  if (reroutes.length) applyReroutes(model, D, mit, reroutes, H, warnings);
  return { id, name, mit, timeToEffect };
}

function applyReroutes(model, D, mit, reroutes, H, warnings) {
  const gaps = new Map();
  for (const [fid, list] of D.gaps) gaps.set(fid, list.map((g) => ({ ...g })));
  const flowById = new Map(model.flows.map((f) => [f.id, f]));
  for (const rr of reroutes) {
    let applied = 0;
    let cost = 0;
    let altObj = null;
    for (const [fid, list] of gaps) {
      const f = flowById.get(fid);
      if (!f) continue;
      if (rr.routeId && f.route !== rr.routeId) continue;
      const route = model.routes.get(f.route);
      const alt = (route.alternatives || []).find((a) => a.id === rr.altId);
      if (!alt) continue;
      altObj = alt;
      for (const g of list) {
        if (g.node !== alt.at_node) continue;
        const already = Math.max(0, rr.start - g.nodeStart);
        const newLen = Math.min(g.len, already + alt.extra_days);
        const reroutedDays = Math.max(0, Math.min(g.len, H) - already);
        cost += reroutedDays * f.teuPerDay * g.sev * alt.extra_cost_eur_per_teu;
        g.len = newLen;
        applied++;
      }
    }
    if (!applied) warnings.push(`${rr.at}: ${rr.altId} has no effect — no disrupted flow passes its node.`);
    mit.rerouteCost += cost;
    mit.rerouteItems.push({ label: altObj ? altObj.name : rr.altId, cost, ref: rr.altId });
    mit.items.push({ type: "reroute", ref: rr.altId, label: altObj ? altObj.name : rr.altId });
  }
  mit.gaps = gaps;
}

// =============================================================================================
// Simulation run
// =============================================================================================

function run(model, D, mit, H, T) {
  const ship = new Map();      // siteId -> Float64Array shipped ratio
  const prod = new Map();      // siteId -> Float64Array production ratio
  const inv = new Map();       // slotKey -> Float64Array end-of-day stock (days)
  const avail = new Map();     // slotKey -> Float64Array availability before consumption (days)
  const cost = { surge: 0, air: 0, spot: 0, alt: 0, cont: 0, shy: 0 };
  const units = { surge: 0, air: 0, spot: 0, alt: 0, shyVehicles: 0 };

  for (const id of model.topo) {
    const site = model.sites.get(id);
    const isPlant = site.kind === "plant";
    const slots = isPlant ? model.plantParts.get(id) : model.supplierInputs.get(id);
    const capArr = D.cap.get(id);
    const fgMax = isPlant ? 0 : Math.max(0, site.obj.fg_buffer_days || 0);
    const p = new Float64Array(T);
    const s = new Float64Array(T);
    const stock = new Map();
    for (const slot of (slots || new Map()).values()) {
      stock.set(slot.key, slot.cover);
      inv.set(slotKey(id, slot.key), new Float64Array(T));
      avail.set(slotKey(id, slot.key), new Float64Array(T));
    }
    let fg = fgMax;
    const shyUsed = new Map();

    for (let t = 0; t < T; t++) {
      const inflow = new Map();
      let limit = capArr ? capArr[t] : 1;
      const shyActive = new Set();

      for (const slot of (slots || new Map()).values()) {
        const k = slotKey(id, slot.key);
        const sm = mit.slot.get(k);
        const st = stock.get(slot.key);
        let base = slot.unmodelledShare;
        let routeLoss = 0;
        for (const f of slot.flows) {
          const a = arrival(mit, ship, f, t);
          base += f.share * a.value;
          routeLoss += f.share * a.routeLoss;
        }
        let total = base;
        let short = Math.max(0, 1 - total);

        // Surge from feeding suppliers (replaces lost volume).
        if (short > EPS) {
          for (const f of slot.flows) {
            const sg = mit.surge.get(f.from);
            if (!sg) continue;
            const tp = t - f.transit;
            if (tp < sg.start || tp >= sg.end) continue;
            const srcProd = prod.get(f.from);
            const factor = srcProd ? Math.min(1, srcProd[Math.max(0, tp)]) : 1;
            const add = Math.min(sg.extra * factor, short);
            if (add <= EPS) continue;
            total += add; short -= add;
            if (t < H) addCost(cost, units, "surge", add * slot.dailyUnits, unitValue(model, slot) * sg.premium);
          }
        }
        if (sm) {
          for (const a of sm.alt) {
            if (short <= EPS) break;
            if (t - a.transit < a.start) continue;
            const add = Math.min(a.share, short);
            total += add; short -= add;
            if (t < H) addCost(cost, units, "alt", add * slot.dailyUnits, unitValue(model, slot) * a.premium);
          }
          for (const c of sm.cont) {
            if (short <= EPS) break;
            if (t < c.start) continue;
            const add = Math.min(c.max, short);
            total += add; short -= add;
            if (t < H) cost.cont += (add / c.fullMax) * c.costPerDay;
          }
          const need = () => Math.max(0, slot.ss + 1 - (st + total));
          for (const a of sm.air) {
            if (t < a.start || t >= a.end) continue;
            const add = Math.min(a.max, Math.min(routeLoss, short), need());
            if (add <= EPS) continue;
            total += add; short -= add;
            if (t < H) addCost(cost, units, "air", add * slot.dailyUnits, a.premium);
          }
          for (const sp of sm.spot) {
            if (t < sp.start || t >= sp.end) continue;
            const add = Math.min(sp.max, short, need());
            if (add <= EPS) continue;
            total += add; short -= add;
            if (t < H) addCost(cost, units, "spot", add * slot.dailyUnits, unitValue(model, slot) * sp.premium);
          }
          if (sm.shy && t >= sm.shy.start && (shyUsed.get(k) || 0) < sm.shy.budget && st + total < 1 - EPS) {
            shyActive.add(slot.key);
            shyUsed.set(k, (shyUsed.get(k) || 0) + 1);
          }
        }

        inflow.set(slot.key, total);
        const av = st + total;
        avail.get(k)[t] = av;
        if (!shyActive.has(slot.key)) limit = Math.min(limit, av);
      }

      const out = Math.max(0, Math.min(1, limit));
      p[t] = out;

      for (const slot of (slots || new Map()).values()) {
        const st = stock.get(slot.key);
        const av = st + inflow.get(slot.key);
        const used = Math.min(out, av);
        if (shyActive.has(slot.key) && out > av + EPS && t < H) {
          const vehicles = (out - av) * (site.obj.output_per_day || 0);
          units.shyVehicles += vehicles;
          cost.shy += vehicles * mit.slot.get(slotKey(id, slot.key)).shy.rework;
        }
        const next = Math.min(slot.cover, Math.max(0, av - used));
        stock.set(slot.key, next);
        inv.get(slotKey(id, slot.key))[t] = next;
      }

      if (isPlant) {
        s[t] = out;
      } else {
        const shipped = Math.min(1, out + fg);
        fg = Math.max(0, Math.min(fgMax, fg + out - shipped));
        s[t] = shipped;
      }
    }
    prod.set(id, p);
    ship.set(id, s);
  }
  return { ship, prod, inv, avail, cost, units, mit };
}

function arrival(mit, ship, f, t) {
  const src = ship.get(f.from);
  const tp = t - f.transit;
  const sent = tp >= 0 && src ? src[tp] : 1;
  let factor = 1;
  const list = mit.gaps.get(f.id);
  if (list) for (const g of list) if (t >= g.start && t < g.start + g.len) factor *= 1 - g.sev;
  return { value: sent * factor, routeLoss: sent * (1 - factor) };
}

function unitValue(model, slot) {
  const part = slot.partId ? model.parts.get(slot.partId) : null;
  return part ? part.unit_value_eur : 0;
}

function addCost(cost, units, kind, qty, perUnit) {
  units[kind] += qty;
  cost[kind] += qty * perUnit;
}

// =============================================================================================
// Summaries
// =============================================================================================

function plantStats(model, r, H, T) {
  const out = [];
  for (const plant of model.plants.values()) {
    const p = r.prod.get(plant.id);
    let stopDays = 0, minOut = 1, first = null;
    for (let t = 0; t < T; t++) {
      if (t < H) { stopDays += 1 - p[t]; minOut = Math.min(minOut, p[t]); }
      if (first === null && p[t] < SHORT) first = t;
    }
    out.push({
      plant_id: plant.id,
      plant: plant.short,
      first_stop_day: first,
      stop_days: round1(stopDays),
      min_output_pct: Math.round(minOut * 100),
      exposure_eur: roundK(stopDays * plant.line_stop_cost_eur_per_day)
    });
  }
  return out;
}

function summarizeBaseline(model, r, D, H, T) {
  const plants = plantStats(model, r, H, T);
  const var30 = plants.reduce((a, p) => a + p.exposure_eur, 0);
  const firstStops = plants.filter((p) => p.first_stop_day !== null).sort((a, b) => a.first_stop_day - b.first_stop_day);
  const first = firstStops[0] || null;

  // Plant parts
  const parts = [];
  for (const [plantId, slots] of model.plantParts) {
    for (const slot of slots.values()) {
      const k = slotKey(plantId, slot.key);
      const inv = r.inv.get(k), av = r.avail.get(k);
      let belowSS = null, stockout = null, minCover = slot.cover;
      for (let t = 0; t < T; t++) {
        if (t < H) minCover = Math.min(minCover, inv[t]);
        if (belowSS === null && inv[t] < slot.ss - 1e-6) belowSS = t;
        if (stockout === null && av[t] < SHORT) stockout = t;
      }
      if (minCover >= slot.cover - 1e-6 && belowSS === null && stockout === null) continue;
      parts.push({
        part_id: slot.partId, plant_id: plantId,
        days_of_cover: slot.cover, safety_stock_days: slot.ss,
        below_safety_stock_day: belowSS, shortage_day: stockout,
        min_cover_days: round1(Math.max(0, minCover)),
        status: stockout !== null && stockout < H ? "line_stop" : (belowSS !== null && belowSS < H) || stockout !== null ? "at_risk" : "watch"
      });
    }
  }
  // Material parts (consignment stock at tier-1 consumers)
  for (const part of model.parts.values()) {
    if (part.kind !== "material") continue;
    for (const c of part.consumers || []) {
      const k = slotKey(c.supplier, part.id);
      const inv = r.inv.get(k), av = r.avail.get(k);
      if (!inv) continue;
      const slot = model.supplierInputs.get(c.supplier).get(part.id);
      let belowSS = null, stockout = null, minCover = slot.cover;
      for (let t = 0; t < T; t++) {
        if (t < H) minCover = Math.min(minCover, inv[t]);
        if (belowSS === null && inv[t] < slot.ss - 1e-6) belowSS = t;
        if (stockout === null && av[t] < SHORT) stockout = t;
      }
      if (minCover >= slot.cover - 1e-6 && belowSS === null && stockout === null) continue;
      parts.push({
        part_id: part.id, plant_id: c.plant, at_supplier: c.supplier,
        days_of_cover: slot.cover, safety_stock_days: slot.ss,
        below_safety_stock_day: belowSS, shortage_day: stockout,
        min_cover_days: round1(Math.max(0, minCover)),
        status: stockout !== null && stockout < H ? "supplier_stop" : (belowSS !== null && belowSS < H) || stockout !== null ? "at_risk" : "watch"
      });
    }
  }
  parts.sort((a, b) => (a.shortage_day ?? 999) - (b.shortage_day ?? 999) || (a.below_safety_stock_day ?? 999) - (b.below_safety_stock_day ?? 999));

  // Propagation: first day each site ships below normal
  const propagation = [];
  for (const id of model.topo) {
    const s = r.ship.get(id);
    let first = null;
    for (let t = 0; t < T; t++) if (s[t] < SHORT) { first = t; break; }
    if (first === null) continue;
    const site = model.sites.get(id);
    propagation.push({
      site_id: id,
      name: site.obj.short || site.obj.name,
      kind: site.kind === "plant" ? "plant" : `tier-${site.obj.tier}`,
      first_reduced_output_day: first,
      lowest_output_pct_in_horizon: Math.round(Math.min(...Array.from(s.slice(0, H))) * 100)
    });
  }
  propagation.sort((a, b) => a.first_reduced_output_day - b.first_reduced_output_day);

  const affectedFlows = [...D.gaps.keys()];
  const affectedRoutes = [...new Set(affectedFlows.map((fid) => model.flows.find((f) => f.id === fid)?.route).filter(Boolean))];
  const affectedSuppliers = [...new Set([...D.cap.keys(), ...affectedFlows.map((fid) => fid.split(">")[0])])];

  return {
    value_at_risk_eur: roundK(var30),
    first_stop_day: first ? first.first_stop_day : null,
    first_stop_plant: first ? first.plant_id : null,
    plants,
    parts: parts.slice(0, 12),
    propagation: propagation.slice(0, 12),
    affected: {
      supplier_ids: affectedSuppliers.slice(0, 30),
      route_ids: affectedRoutes,
      disrupted_flows: affectedFlows.length
    }
  };
}

function summarizeVariant(model, cv, r, baseline, H, T) {
  const plants = plantStats(model, r, H, T);
  const residual = plants.reduce((a, p) => a + p.exposure_eur, 0);
  const firstStops = plants.filter((p) => p.first_stop_day !== null).sort((a, b) => a.first_stop_day - b.first_stop_day);
  const breakdown = [];
  const pushCost = (label, value, detail) => { if (value > 0.5) breakdown.push({ item: label, cost_eur: roundK(value), detail }); };
  pushCost("Surge premium", r.cost.surge, `${fmtInt(r.units.surge)} units at premium`);
  pushCost("Air-freight premium", r.cost.air, `${fmtInt(r.units.air)} units flown`);
  pushCost("Spot/broker premium", r.cost.spot, `${fmtInt(r.units.spot)} units bought`);
  pushCost("Alternative-source premium", r.cost.alt, `${fmtInt(r.units.alt)} units`);
  pushCost("Input contingency", r.cost.cont, "contingency sourcing at tier-1");
  pushCost("Build-shy rework", r.cost.shy, `${fmtInt(r.units.shyVehicles)} vehicles retrofitted`);
  for (const it of cv.mit.rerouteItems) pushCost(`Re-routing: ${it.label}`, it.cost, "extra freight cost");
  for (const fc of cv.mit.fixedCosts) pushCost(fc.label, fc.cost, "one-off");
  const mitigation = breakdown.reduce((a, b) => a + b.cost_eur, 0);
  const total = mitigation + roundK(residual);
  return {
    variant_id: cv.id,
    name: cv.name,
    mitigations: cv.mit.items.map((i) => i.label),
    mitigation_cost_eur: roundK(mitigation),
    residual_var_eur: roundK(residual),
    total_cost_eur: roundK(total),
    savings_vs_baseline_eur: roundK(baseline.value_at_risk_eur - total),
    time_to_effect_days: cv.timeToEffect,
    first_stop_day: firstStops[0] ? firstStops[0].first_stop_day : null,
    first_stop_plant: firstStops[0] ? firstStops[0].plant_id : null,
    plants,
    cost_breakdown: breakdown,
    _run: r
  };
}

/** Daily plant output ratios (baseline and per variant) for charts; never sent to the model. */
function buildUiSeries(model, base, variants, H) {
  const series = { days: H, baseline: {}, variants: {} };
  for (const id of model.plants.keys()) series.baseline[id] = Array.from(base.prod.get(id).slice(0, H), round2);
  for (const v of variants) {
    const per = {};
    for (const id of model.plants.keys()) per[id] = Array.from(v._run.prod.get(id).slice(0, H), round2);
    series.variants[v.variant_id] = per;
  }
  return series;
}

// =============================================================================================
// small utils
// =============================================================================================

function intIn(v, dflt, min, max, field, errors) {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) { errors.push(`${field}: must be a number.`); return dflt; }
  const r = Math.round(n);
  if (r < min || r > max) { errors.push(`${field}: must be between ${min} and ${max} (got ${n}).`); return Math.min(max, Math.max(min, r)); }
  return r;
}

function numIn(v, dflt, min, max, field, errors) {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) { errors.push(`${field}: must be a number.`); return dflt; }
  if (n < min || n > max) { errors.push(`${field}: must be between ${min} and ${max} (got ${n}).`); return Math.min(max, Math.max(min, n)); }
  return n;
}

function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }
function roundK(x) { return Math.round(x / 1000) * 1000; }
function fmtInt(x) { return Math.round(x).toLocaleString("en-US"); }

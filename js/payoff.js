// Shared shaping of options and of what an approved decision changes on screen. The live tools and
// the simulation player both use these helpers, so an option card, the KPI tiles and the plant
// markers look exactly the same whichever producer is running.

/** Figures of one engine variant as shown on an option card (all values come from the engine). */
export function optionFigures(model, v) {
  return {
    mitigation_cost_eur: v.mitigation_cost_eur,
    residual_var_eur: v.residual_var_eur,
    total_cost_eur: v.total_cost_eur,
    savings_eur: v.savings_vs_baseline_eur,
    time_days: v.time_to_effect_days,
    first_stop_day: v.first_stop_day ?? null,
    first_stop_plant: v.first_stop_plant ?? null,
    first_stop_plant_name: v.first_stop_plant ? model.plants.get(v.first_stop_plant)?.short || v.first_stop_plant : null,
    plant_exposure: plantExposure(v.plants)
  };
}

/** The do-nothing baseline as shown on its card. */
export function baselineFigures(model, b, description = "") {
  return {
    value_at_risk_eur: b.value_at_risk_eur,
    first_stop_day: b.first_stop_day,
    first_stop_plant: b.first_stop_plant,
    first_stop_plant_name: b.first_stop_plant ? model.plants.get(b.first_stop_plant)?.short || b.first_stop_plant : null,
    plant_exposure: plantExposure(b.plants),
    description: String(description || "").slice(0, 300)
  };
}

/**
 * Events that follow an approval: the KPI tiles show the exposure that remains, and every plant
 * that was exposed turns resolved (nothing left at risk) or at risk (some exposure remains).
 * Returns a list of [type, payload] pairs for the bus.
 */
export function decisionEffects(optionsPayload, optionId) {
  if (!optionsPayload) return [];
  const base = optionsPayload.baseline || {};
  if (optionId === "baseline") {
    return [["kpi_update", { decided: true, accepted: true, option_label: "Do nothing", before_eur: base.value_at_risk_eur }]];
  }
  const opt = (optionsPayload.options || []).find((o) => o.id === optionId);
  if (!opt) return [];
  const out = [["kpi_update", {
    decided: true,
    option_label: `option ${opt.letter}`,
    residual_eur: opt.residual_var_eur,
    total_eur: opt.total_cost_eur,
    before_eur: base.value_at_risk_eur,
    first_stop_day_after: opt.first_stop_day ?? null,
    first_stop_plant_name_after: opt.first_stop_plant_name || null
  }]];
  const exposed = Object.entries(base.plant_exposure || {}).filter(([, eur]) => eur > 0).map(([id]) => id);
  const resolved = exposed.filter((id) => !(opt.plant_exposure?.[id] > 0));
  const atRisk = exposed.filter((id) => opt.plant_exposure?.[id] > 0);
  if (resolved.length) out.push(["map_update", { plant_ids: resolved, state: "resolved", source: "decision" }]);
  if (atRisk.length) out.push(["map_update", { plant_ids: atRisk, state: "at_risk", source: "decision" }]);
  return out;
}

function plantExposure(plants) {
  const out = {};
  for (const p of plants || []) out[p.plant_id] = p.exposure_eur || 0;
  return out;
}

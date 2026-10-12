// Placeholders for simulation scripts. Authored scripts never type a number the engine computes:
// they write {{var}}, {{first_stop_date}}, {{V2.mit}} … and the player fills them from the engine
// result at playback. Shared by the player (js/simulation.js) and the script checker
// (js/sim_check.js), so a placeholder that would not resolve is caught before a demo.

import { eurCompact, shortDate } from "./format.js";

/**
 * Variables produced by one sim_impact result. `which` "hypothesis" prefixes keys with "hyp.";
 * every other result writes the unprefixed keys (a later result overwrites an earlier one).
 */
export function impactVars(model, which, res) {
  const v = {};
  const pre = which === "hypothesis" ? "hyp." : "";
  const b = res.baseline;
  v[`${pre}var`] = eurCompact(b.value_at_risk_eur);
  v[`${pre}first_stop_day`] = b.first_stop_day === null ? "none" : String(b.first_stop_day);
  v[`${pre}first_stop_date`] = b.first_stop_day === null ? "—" : shortDate(b.first_stop_day);
  v[`${pre}first_stop_plant`] = b.first_stop_plant ? model.plants.get(b.first_stop_plant)?.short || b.first_stop_plant : "—";
  const seen = new Set(); // within one result the first entry per part wins
  for (const p of b.parts || []) {
    const key = `${pre}part.${p.part_id}${p.at_supplier ? `@${p.at_supplier}` : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    v[`${key}.shortage_day`] = p.shortage_day === null ? "none" : String(p.shortage_day);
    v[`${key}.shortage_date`] = p.shortage_day === null ? "—" : shortDate(p.shortage_day);
  }
  for (const pl of b.plants) {
    v[`${pre}plant.${pl.plant_id}.stop_days`] = String(pl.stop_days);
    v[`${pre}plant.${pl.plant_id}.first_stop_day`] = pl.first_stop_day === null ? "none" : String(pl.first_stop_day);
    v[`${pre}plant.${pl.plant_id}.exposure`] = eurCompact(pl.exposure_eur);
  }
  for (const x of res.variants || []) {
    v[`${x.variant_id}.mit`] = eurCompact(x.mitigation_cost_eur);
    v[`${x.variant_id}.res`] = eurCompact(x.residual_var_eur);
    v[`${x.variant_id}.total`] = eurCompact(x.total_cost_eur);
    v[`${x.variant_id}.save`] = eurCompact(x.savings_vs_baseline_eur);
    v[`${x.variant_id}.time`] = String(x.time_to_effect_days);
    v[`${x.variant_id}.first_stop_day`] = x.first_stop_day === null ? "none" : String(x.first_stop_day);
  }
  return v;
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;
const DATE_KEY = /^date:\+?(-?\d+)$/;

/** Replaces {{key}} with vars[key]; {{date:+N}} becomes the short date N days from today. */
export function fillTemplate(vars, text) {
  return String(text ?? "").replace(PLACEHOLDER, (m, key) => {
    const dm = DATE_KEY.exec(key);
    if (dm) return shortDate(Number(dm[1]));
    return key in vars ? vars[key] : m;
  });
}

/** Placeholder keys in a text that `vars` cannot resolve. */
export function unresolvedKeys(vars, text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(PLACEHOLDER)) {
    const key = m[1];
    if (!DATE_KEY.test(key) && !(key in vars)) out.push(key);
  }
  return out;
}

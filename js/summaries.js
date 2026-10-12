// One-line, human-readable summaries of tool results for the agent console.
// Shared by the live tool executor and the simulation player so both read the same.

import { eurCompact } from "./format.js";

export function summarizeToolResult(name, result) {
  if (!result) return "No result";
  if (result.error) return `Error: ${result.error}`;
  if (result.ok === false && Array.isArray(result.errors)) return `Rejected by the engine: ${result.errors[0]}`;
  switch (name) {
    case "erp_get_overview": {
      const n = result.network || {};
      return `${result.plants?.length || 0} plants, ${result.part_families?.length || 0} part families, ${n.suppliers} suppliers in ${n.countries?.length || 0} countries, ${n.open_purchase_orders} orders in transit (${eurCompact(n.open_po_value_eur)})`;
    }
    case "erp_list_suppliers": {
      const ids = (result.suppliers || []).map((s) => s.id);
      return `${result.count} supplier${result.count === 1 ? "" : "s"}${ids.length ? `: ${ids.slice(0, 4).join(", ")}${ids.length > 4 ? ` +${ids.length - 4} more` : ""}` : ""}`;
    }
    case "erp_get_supplier":
      return `${result.name}: tier ${result.tier} in ${result.location}; supplies ${(result.supplies || []).map((f) => `${f.share_pct} % ${shortItem(f.item)} → ${f.to}`).join("; ")}`;
    case "erp_get_part": {
      const cover = Object.entries(result.plants || {}).map(([pl, d]) => `${d.days_of_cover} d cover at ${pl}`).join(", ");
      return `${result.name}: ${cover}; ${result.suppliers?.length || 0} supply flows, ${result.upstream_dependencies?.length || 0} upstream dependencies`;
    }
    case "erp_get_open_pos":
      return `${result.count} order${result.count === 1 ? "" : "s"} in transit (${eurCompact(result.value_eur)})`;
    case "erp_get_alternatives": {
      const alts = result.alternatives || [];
      const fastest = alts.slice().sort((a, b) => a.qualification_days - b.qualification_days)[0];
      return `${alts.length} qualified alternative${alts.length === 1 ? "" : "s"}${fastest ? `; fastest ${fastest.name} (${fastest.qualification_days} d)` : ""}; ${(result.surge_options || []).length} suppliers with surge capacity`;
    }
    case "erp_get_routes":
      return `${result.count} corridor${result.count === 1 ? "" : "s"}${result.resolved?.name ? ` via ${result.resolved.name}` : ""}`;
    case "sim_impact": {
      const b = result.baseline || {};
      const stop = b.first_stop_day === null || b.first_stop_day === undefined ? "no line stop within 60 days" : `first line stop on day ${b.first_stop_day} (${b.first_stop_plant})`;
      return `Value at risk ${eurCompact(b.value_at_risk_eur)} over ${result.horizon_days} days; ${stop}${result.variants?.length ? `; ${result.variants.length} options costed` : ""}`;
    }
    default:
      if (typeof result.summary === "string") return result.summary;
      return "Result received";
  }
}

function shortItem(item) {
  return String(item || "").replace(/^P-[A-Z]+ \((.*)\)$/, "$1").split(" (")[0];
}

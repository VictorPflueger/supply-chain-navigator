// Detail popovers for map entities, built from the same ERP queries the agent uses.

import { h } from "./dom.js";
import { eurCompact, eurFull, int, shortDate } from "./format.js";
import { erpGetSupplier, erpPlantCover } from "./erp.js";
import { nameOf, openPOs, routesThroughNode } from "./world.js";

const TIER_TEXT = { 1: "Tier-1 supplier", 2: "Tier-2 supplier", 3: "Tier-3 supplier" };
const STATE_TEXT = { affected: "Affected", at_risk: "At risk", resolved: "Resolved" };

// Tags in Vici's tones: a state in its own tone (danger, warning, success) with its word; a risk in
// the warning tone; a plain fact as a plain tag.
const TAG_TONE = { affected: "vc-tag--danger", at_risk: "vc-tag--warning", resolved: "vc-tag--success", risk: "vc-tag--warning", fact: "" };

function stateChip(state) {
  if (!state || state === "neutral") return null;
  return tag(state, STATE_TEXT[state]);
}

/** A Vici tag in one of the map's tones (TAG_TONE). */
function tag(tone, text) {
  return h("span", { class: ["vc-tag", TAG_TONE[tone] || ""] }, text);
}

function dl(rows) {
  return h("dl", { class: "pop-grid" }, rows.filter(Boolean).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}

export function supplierPopover(model, id, state) {
  const s = erpGetSupplier(model, id);
  if (s.error) return h("div", {}, s.error);
  const parts = s.parts.map((p) => p.name.split(" (")[0]).join(", ");
  const flows = s.supplies.map((f) => `${f.share_pct} % of ${f.item.replace(/^P-[A-Z]+ \((.*)\)$/, "$1")} → ${f.to_name} (${f.transit_days} d)`);
  return h("div", {},
    h("div", { class: "pop-title" }, s.name),
    h("div", { class: "pop-sub" }, `${TIER_TEXT[s.tier] || "Supplier"} in ${s.location}`),
    h("div", { class: "pop-tags" },
      stateChip(state),
      s.directed_buy ? tag("fact", "Directed buy") : null,
      !s.dual_source ? tag("risk", "Single source") : null
    ),
    dl([
      ["Cluster", s.cluster],
      ["Feeds", parts],
      ["Supplies", h("div", {}, flows.map((t) => h("div", {}, t)))],
      ["Lead time", `${s.lead_time_days} days`],
      ["Transport", s.transport_mode],
      s.surge_capacity ? ["Surge", `+${s.surge_capacity.max_extra_share_pct} % after ${s.surge_capacity.lead_days} days (+${s.surge_capacity.premium_pct} % cost)`] : null,
      s.inputs.length ? ["Inputs", h("div", {}, s.inputs.map((i) => h("div", {}, `${i.input.replace(/^P-[A-Z]+ \((.*)\)$/, "$1")}: ${i.buffer_days} d stock`)))] : null,
      ["Open orders", s.open_pos.count ? `${s.open_pos.count} (${eurCompact(s.open_pos.value_eur)})` : "none in transit"]
    ]),
    s.note ? h("div", { class: "pop-note" }, s.note) : null,
    h("div", { class: "pop-note" }, `ID ${s.id}. Fictional supplier at a real industrial location.`)
  );
}

export function plantPopover(model, id, state) {
  const p = model.plants.get(id);
  const cover = erpPlantCover(model, id);
  const coverClass = (d) => (d <= 3 ? "cover-bad" : d <= 5 ? "cover-low" : "");
  return h("div", {},
    h("div", { class: "pop-title" }, p.name),
    h("div", { class: "pop-sub" }, p.role),
    h("div", { class: "pop-tags" }, stateChip(state)),
    dl([
      ["Output", `${int(p.output_per_day)} ${p.output_unit} per day`],
      ["Line-stop cost", `${eurFull(p.line_stop_cost_eur_per_day)} per day (assumption)`]
    ]),
    h("table", { class: "vc-table vc-table--compact pop-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Part family"), h("th", { class: "r" }, "Cover"), h("th", { class: "r" }, "Safety"))),
      h("tbody", {}, cover.map((c) => h("tr", {},
        h("td", {}, c.name.split(" (")[0]),
        h("td", { class: `r ${coverClass(c.days_of_cover)}` }, `${c.days_of_cover} d`),
        h("td", { class: "r" }, `${c.safety_stock_days} d`)
      )))
    ),
    h("div", { class: "pop-note" }, "Fictional plant. Days of cover at today's production rate.")
  );
}

export function routePopover(model, id, state) {
  const r = model.routes.get(id);
  const users = model.flowsByRoute.get(id) || [];
  const pos = openPOs(model, { routeId: id });
  const legs = r.legs.map((l) => {
    const from = l.from === "@origin" ? "Supplier" : nameOf(model, l.from);
    const to = l.to === "@dest" ? "Destination" : nameOf(model, l.to);
    return h("tr", {}, h("td", {}, `${from} → ${to}`), h("td", {}, l.mode), h("td", { class: "r" }, `${l.days} d`));
  });
  return h("div", {},
    h("div", { class: "pop-title" }, r.name),
    h("div", { class: "pop-sub" }, `Normal transit ${r.total} days`),
    h("div", { class: "pop-tags" }, stateChip(state)),
    h("table", { class: "vc-table vc-table--compact pop-table" }, h("tbody", {}, legs)),
    dl([
      ["Used by", `${users.length} supply flow${users.length === 1 ? "" : "s"} from ${new Set(users.map((f) => f.from)).size} supplier(s)`],
      ["In transit", pos.length ? `${pos.length} orders (${eurCompact(pos.reduce((a, p) => a + p.value_eur, 0))})` : "no open orders"],
      (r.alternatives || []).length ? ["Alternatives", h("div", {}, r.alternatives.map((a) => h("div", {}, `${a.name}: +${a.extra_days} d, +€${int(a.extra_cost_eur_per_teu)}/TEU`)))] : null
    ])
  );
}

export function nodePopover(model, id, state) {
  const n = model.nodes.get(id);
  const routes = routesThroughNode(model, id);
  const pos = openPOs(model, { nodeId: id });
  const ref = id === "N-KAU" ? model.world.reference.rhine_kaub : null;
  return h("div", {},
    h("div", { class: "pop-title" }, n.name),
    h("div", { class: "pop-sub" }, `${n.type[0].toUpperCase()}${n.type.slice(1)}, ${n.country}`),
    h("div", { class: "pop-tags" }, stateChip(state)),
    dl([
      ["Corridors", routes.length ? h("div", {}, routes.slice(0, 6).map((r) => h("div", {}, r.name))) : "none"],
      ["Orders routed via", pos.length ? `${pos.length} (${eurCompact(pos.reduce((a, p) => a + p.value_eur, 0))})` : "none"]
    ]),
    ref ? h("div", { class: "pop-note" }, ref.gauge_note) : null
  );
}

export function poPopover(model, po, state) {
  return h("div", {},
    h("div", { class: "pop-title" }, `Order ${po.id}`),
    h("div", { class: "pop-sub" }, po.item),
    h("div", { class: "pop-tags" }, stateChip(state)),
    dl([
      ["Quantity", `${int(po.qty)} ${po.unit}`],
      ["Value", eurFull(po.value_eur)],
      ["From", nameOf(model, po.supplier)],
      ["To", nameOf(model, po.to)],
      ["Where", po.where],
      ["Shipped", shortDate(po.shipped_offset_days)],
      ["ETA", `${shortDate(po.eta_offset_days)} (in ${po.eta_offset_days} d)`],
      ["Route", nameOf(model, po.route)]
    ])
  );
}

export function alternativePopover(model, alt) {
  return h("div", {},
    h("div", { class: "pop-title" }, alt.name),
    h("div", { class: "pop-sub" }, `Qualified alternative (not active) in ${alt.city}, ${alt.country}`),
    dl([
      ["Part family", model.parts.get(alt.part)?.name],
      ["Qualification", `${alt.qualification_days} days, ${eurCompact(alt.qualification_cost_eur)} one-off`],
      ["Cost premium", `+${alt.cost_premium_pct} %`],
      ["Max share", `${alt.max_share_pct} % of demand`]
    ]),
    h("div", { class: "pop-note" }, alt.note)
  );
}

// The live agent's tools: JSON Schemas sent to the model, and executors that run in the browser.
// Every UI effect is emitted on the run-event bus, exactly as the simulation player does it.
//
// Guardrails enforced in code, not only in the prompt:
//   - option € figures and times come from the latest sim_impact result (by variant_id);
//   - an alert needs at least two sources;
//   - every outbound action is a draft carrying the AI footer, and the final report waits until
//     every draft has been approved or rejected.

import { MITIGATION_TYPES, simulateImpact, compactForModel } from "./impact.js";
import { erpOverview, erpListSuppliers, erpGetSupplier, erpGetPart, erpGetOpenPOs, erpGetAlternatives, erpGetRoutes } from "./erp.js";
import { geoWeather, geoEarthquakes, geoNaturalEvents, geoRhineLevel, EONET_CATEGORIES } from "./geo.js";
import { summarizeToolResult } from "./summaries.js";
import { optionFigures, baselineFigures, decisionEffects } from "./payoff.js";
import { ANTHROPIC } from "./config.js";
import { eurCompact } from "./format.js";

export const DRAFT_FOOTER = "Prepared with the Navigator AI assistant. Requires human approval before sending.";
export const MOCK_BOOKING_LINE = "Mock booking for demonstration; no carrier system is connected.";
export const LIVE_REPORT_FOOTER = "*Live agent run. Nordwerk and its suppliers are fictional; figures come from the deterministic impact engine.*";
const LETTERS = ["A", "B", "C"];
const ids = (description) => ({ type: "array", items: { type: "string" }, description });

// ---- schemas ----------------------------------------------------------------------------------

const MITIGATION_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: MITIGATION_TYPES },
    supplier_id: { type: "string", description: "surge: tier-1 supplier with surge capacity; input_contingency: the tier-1 whose input is covered." },
    extra_share_pct: { type: "number", description: "surge: extra share of demand, ≤ the supplier's max_extra_share_pct." },
    part_id: { type: "string", description: "airfreight, spot_buy, build_shy: part family id (P-…)." },
    plant_id: { type: "string", description: "airfreight, spot_buy, build_shy: PL-LEJ or PL-GYR where the part is used at both." },
    max_share_pct: { type: "number", description: "airfreight or spot_buy: share of demand covered at most." },
    alternative_id: { type: "string", description: "alt_supplier: qualified alternative (A-…); reroute: route alternative (ALT-…)." },
    share_pct: { type: "number", description: "alt_supplier or input_contingency: share of demand, ≤ its max_share_pct." },
    route_id: { type: "string", description: "reroute: limit the reroute to one route (optional)." },
    input: { type: "string", description: "input_contingency: input name exactly as in erp_get_supplier inputs (e.g. \"Electrolyte\")." },
    start_in_days: { type: "integer", description: "Day the measure starts; must respect lead, ramp-up or qualification days from ERP." },
    duration_days: { type: "integer" },
    max_days: { type: "integer", description: "build_shy: days of building without the part (≤ its rule)." }
  },
  required: ["type"]
};

const DEFINITIONS = [
  {
    name: "erp_get_overview",
    description: "Company overview: plants (line-stop cost per day), part families with days of cover, network summary. Call first when you need ids.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "erp_list_suppliers",
    description: "Suppliers filtered by region, part family or tier. Returns ids, tier, location and what each supplies to whom.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", description: "Two-letter country code (exact), or country, city or cluster text; several separated by commas. e.g. \"MA\", \"Taiwan\", \"Hsinchu\", \"SI, AT\"" },
        part_id: { type: "string" },
        tier: { type: "integer", enum: [1, 2, 3] }
      }
    }
  },
  {
    name: "erp_get_supplier",
    description: "Full supplier record: location (lat/lon), parts, supply flows with share and route, inputs with buffer days and contingencies, surge capacity, open orders.",
    input_schema: { type: "object", properties: { supplier_id: { type: "string" } }, required: ["supplier_id"] }
  },
  {
    name: "erp_get_part",
    description: "Part family: daily demand, days of cover and safety stock per plant, supplying flows, upstream dependencies, air-freight, spot-market and build-without options.",
    input_schema: { type: "object", properties: { part_id: { type: "string" } }, required: ["part_id"] }
  },
  {
    name: "erp_get_open_pos",
    description: "Purchase orders in transit with ETA, route and position. Filter by supplier, part, route or node.",
    input_schema: {
      type: "object",
      properties: { supplier_id: { type: "string" }, part_id: { type: "string" }, route_id: { type: "string" }, node_id: { type: "string" } }
    }
  },
  {
    name: "erp_get_alternatives",
    description: "Response levers for a part family: qualified alternative sources (qualification days and cost, premium, max share), suppliers with surge capacity, air freight, spot market, build-without rule.",
    input_schema: { type: "object", properties: { part_id: { type: "string" } }, required: ["part_id"] }
  },
  {
    name: "erp_get_routes",
    description: "Corridors through a logistics node, used by a supplier, or matching a route id or place name. Returns legs, normal transit days, route alternatives (ALT-…) and which flows use them.",
    input_schema: {
      type: "object",
      properties: { node_or_supplier: { type: "string", description: "Node id (N-…), supplier id (S-…), route id (R-…) or a place name such as \"Rotterdam\"." } },
      required: ["node_or_supplier"]
    }
  },
  {
    name: "geo_weather",
    description: "Live Open-Meteo daily weather (past days and forecast) at a coordinate, with flags for heavy rain, storm gusts, snow and heat, and the nearest Nordwerk sites.",
    input_schema: {
      type: "object",
      properties: {
        lat: { type: "number" }, lon: { type: "number" },
        days: { type: "integer", minimum: 1, maximum: 16, description: "Forecast days (default 7)." },
        past_days: { type: "integer", minimum: 0, maximum: 14, description: "Past days included (default 3)." }
      },
      required: ["lat", "lon"]
    }
  },
  {
    name: "geo_earthquakes",
    description: "Live USGS earthquakes, joined with Nordwerk's network (sites within 300 km).",
    input_schema: {
      type: "object",
      properties: {
        min_magnitude: { type: "number", description: "Default 4.5." },
        days: { type: "integer", minimum: 1, maximum: 30, description: "Look-back window (default 7)." }
      }
    }
  },
  {
    name: "geo_natural_events",
    description: "Live NASA EONET open natural events (storms, floods, wildfires, volcanoes …) within 250 km of Nordwerk sites. EONET is a reference feed: always confirm with a second source.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: EONET_CATEGORIES },
        days: { type: "integer", minimum: 1, maximum: 90, description: "Look-back window (default 30)." }
      }
    }
  },
  {
    name: "geo_rhine_level",
    description: "Live Rhine gauge from PEGELONLINE (default station KAUB) with the 7-day trend and, for Kaub, the estimated share of normal barge capacity.",
    input_schema: { type: "object", properties: { station: { type: "string", description: "PEGELONLINE station short name (default \"KAUB\")." } } }
  },
  {
    name: "sim_impact",
    description: [
      "Deterministic impact engine (no LLM maths). Simulates a disruption day by day through the supply network and returns, over horizon_days:",
      "value_at_risk_eur, first_stop_day and plant, per-part shortage days, propagation, and for each variant the mitigation cost, residual exposure, total and time to effect.",
      "Use ids from erp_* results only. Durations are your evidence-based assumptions; say what they rest on.",
      "Mitigation fields by type — surge: supplier_id, extra_share_pct, start_in_days ≥ ramp-up; airfreight: part_id, plant_id, max_share_pct, start_in_days ≥ lead, duration_days;",
      "spot_buy: part_id, plant_id, max_share_pct, start_in_days, duration_days; alt_supplier: alternative_id (A-…), share_pct, start_in_days ≥ qualification_days;",
      "build_shy: part_id, plant_id, max_days; reroute: alternative_id (ALT-…), optional route_id, start_in_days; input_contingency: supplier_id, input, share_pct, start_in_days ≥ lead.",
      "Errors come back with the field to fix."
    ].join(" "),
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short description of the assumed disruption." },
        horizon_days: { type: "integer", minimum: 7, maximum: 90, description: "Default 30." },
        supplier_outages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              supplier_id: { type: "string" },
              capacity_loss_pct: { type: "number", description: "Default 100." },
              start_in_days: { type: "integer", description: "Default 0 (today)." },
              duration_days: { type: "integer" }
            },
            required: ["supplier_id", "duration_days"]
          }
        },
        route_disruptions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              node_id: { type: "string", description: "Logistics node, e.g. N-RTM, N-KAU, N-BAB." },
              type: { type: "string", enum: ["delay", "capacity"], description: "delay: cargo held or re-routed for delay_days; capacity: throughput cut to capacity_pct for duration_days." },
              delay_days: { type: "integer" },
              capacity_pct: { type: "number" },
              duration_days: { type: "integer" },
              start_in_days: { type: "integer" },
              route_ids: ids("Optional: only these routes.")
            },
            required: ["node_id", "type"]
          }
        },
        variants: {
          type: "array",
          maxItems: 6,
          description: "Response options to cost against the same disruption. For the decision, pass exactly three with variant_id V1, V2, V3.",
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string" },
              name: { type: "string" },
              mitigations: { type: "array", items: MITIGATION_SCHEMA }
            },
            required: ["variant_id", "name", "mitigations"]
          }
        }
      }
    }
  },
  {
    name: "ui_report_alert",
    description: "Raise a disruption alert in the console and mark the affected entities on the map. basis \"verified\" requires at least two independent sources; basis \"what_if\" labels the alert as an unverified exercise.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
        basis: { type: "string", enum: ["verified", "what_if"], description: "Default verified." },
        summary: { type: "string", description: "Two sentences: what happened and why it matters to Nordwerk." },
        sources: {
          type: "array",
          items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title"] }
        },
        supplier_ids: ids("Affected suppliers (and plants)."),
        route_ids: ids("Affected routes."),
        node_ids: ids("Affected logistics nodes.")
      },
      required: ["title", "severity", "summary"]
    }
  },
  {
    name: "ui_mark_map",
    description: "Colour entities on the map: affected (red), at_risk (amber), resolved (green) or neutral.",
    input_schema: {
      type: "object",
      properties: {
        supplier_ids: ids("Supplier, plant (PL-…) or alternative (A-…) ids."),
        route_ids: ids("Route ids, or route alternatives (ALT-…) to show a re-routing path."),
        node_ids: ids("Logistics node ids."),
        plant_ids: ids("Plant ids."),
        state: { type: "string", enum: ["affected", "at_risk", "resolved", "neutral"] },
        fit: { type: "boolean", description: "Zoom the map to these entities." }
      },
      required: ["state"]
    }
  },
  {
    name: "ui_propose_options",
    description: "Show exactly three response options plus the do-nothing baseline and wait for the human decision. Euro figures and times are filled in from your latest sim_impact result by variant_id, so run sim_impact with exactly these three variants first. Returns the decision.",
    input_schema: {
      type: "object",
      properties: {
        options: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string", description: "V1, V2 or V3 from the latest sim_impact call." },
              title: { type: "string", description: "Up to 8 words." },
              description: { type: "string", description: "One or two sentences: what we would do." },
              residual_risk: { type: "string", description: "One sentence: what can still go wrong." }
            },
            required: ["variant_id", "title", "description", "residual_risk"]
          }
        },
        recommended_variant_id: { type: "string" },
        baseline_description: { type: "string", description: "One sentence: what happens if we do nothing." }
      },
      required: ["options", "recommended_variant_id", "baseline_description"]
    }
  },
  {
    name: "ui_await_decision",
    description: "After an option was rejected, wait for the human's next decision on the remaining options or on accepting the risk. Returns the decision.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ui_draft_action",
    description: "Queue one outbound action as a draft in the Outbox, pending human approval. Nothing is ever sent. Use names and quantities from erp_* results.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["email", "booking", "replan"] },
        recipient: { type: "string", description: "Company and function, e.g. \"Banat Cable Systems SRL, Timișoara (key account)\"." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text. Emails: greeting, request with quantities and dates, deadline, signature \"Purchasing, Nordwerk Automotive GmbH\". Bookings: lane, service, frequency, period, cargo." }
      },
      required: ["type", "recipient", "subject", "body"]
    }
  },
  {
    name: "ui_await_approvals",
    description: "Wait until the human has approved or rejected every draft in the Outbox. Returns each decision. Call after the last ui_draft_action and before ui_final_report.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ui_final_report",
    description: "Publish the management summary (Markdown) and end the workflow. Figures must come from tool results.",
    input_schema: {
      type: "object",
      properties: {
        markdown: { type: "string" },
        outcome: { type: "string", enum: ["response_decided", "risk_accepted", "no_material_disruption", "monitoring"], description: "Default response_decided." }
      },
      required: ["markdown"]
    }
  }
];

/** Tool list for a request; web search is omitted when the organisation has it switched off. */
export function toolDefinitions({ webSearch = true } = {}) {
  const tools = DEFINITIONS.map((d) => ({ ...d }));
  if (webSearch) tools.unshift({ ...ANTHROPIC.webSearchTool });
  return tools;
}

export const UI_BLOCKING_TOOLS = new Set(["ui_propose_options", "ui_await_decision", "ui_await_approvals"]);

// ---- executors ----------------------------------------------------------------------------------

/**
 * Creates the executor for one run.
 * ctx: { model, emit, waitUntil(test) → Promise, takeOptionDecision(pred) → ev|null, drafts: Map,
 *        onPhase(state) }
 * execute() resolves { content (string for tool_result), isError, result (object for the UI), summary }.
 */
export function createToolbox(ctx) {
  const run = {
    impacts: 0,
    lastImpact: null,          // latest successful sim_impact result (full, incl. ui series)
    lastWithVariants: null,    // latest successful result that costed variants
    options: null,             // options shown to the human
    optionsPayload: null,      // the full "options" event payload (for the approval payoff)
    rejected: new Set(),
    approvedOption: null,
    alertBasis: null,
    reported: false,
    outcome: null
  };

  const handlers = {
    erp_get_overview: () => erpOverview(ctx.model),
    erp_list_suppliers: (i) => erpListSuppliers(ctx.model, { region: i.region || null, part_id: i.part_id || null, tier: i.tier || null }),
    erp_get_supplier: (i) => erpGetSupplier(ctx.model, i.supplier_id),
    erp_get_part: (i) => erpGetPart(ctx.model, i.part_id),
    erp_get_open_pos: (i) => erpGetOpenPOs(ctx.model, i || {}),
    erp_get_alternatives: (i) => erpGetAlternatives(ctx.model, i.part_id),
    erp_get_routes: (i) => erpGetRoutes(ctx.model, i.node_or_supplier ?? i.query ?? ""),
    geo_weather: (i) => geoWeather(ctx.model, i),
    geo_earthquakes: (i) => geoEarthquakes(ctx.model, i),
    geo_natural_events: (i) => geoNaturalEvents(ctx.model, i),
    geo_rhine_level: (i) => geoRhineLevel(ctx.model, i),
    sim_impact: simImpact,
    ui_report_alert: reportAlert,
    ui_mark_map: markMap,
    ui_propose_options: proposeOptions,
    ui_await_decision: awaitDecision,
    ui_draft_action: draftAction,
    ui_await_approvals: awaitApprovals,
    ui_final_report: finalReport
  };

  async function execute(name, input = {}) {
    const fn = handlers[name];
    if (!fn) return done({ error: `Unknown tool "${name}".` }, true, name);
    let result;
    try {
      result = await fn(input || {});
    } catch (e) {
      // Cancellation (the agent's abort symbol or a fetch AbortError) ends the run, not the tool.
      if (typeof e === "symbol" || e?.name === "AbortError") throw e;
      console.error(`[Navigator] tool ${name} failed:`, e);
      result = { error: `The tool failed unexpectedly (${String(e?.message || "unknown error")}). Try different input or another tool.` };
    }
    const isError = !!(result && (result.error || result.ok === false));
    return done(result, isError, name);
  }

  function done(result, isError, name) {
    const forModel = name === "sim_impact" && result?.ok ? compactForModel(result) : result;
    return {
      content: JSON.stringify(forModel),
      isError,
      result: forModel,
      summary: summarizeToolResult(name, forModel)
    };
  }

  // -- sim_impact -------------------------------------------------------------------------------
  function simImpact(spec) {
    const res = simulateImpact(ctx.model, spec);
    if (!res.ok) return res;
    run.impacts += 1;
    run.lastImpact = res;
    if (res.variants?.length) run.lastWithVariants = res;
    const b = res.baseline;
    ctx.emit("kpi_update", {
      value_at_risk_eur: b.value_at_risk_eur,
      horizon_days: res.horizon_days,
      first_stop_day: b.first_stop_day,
      first_stop_plant: b.first_stop_plant,
      first_stop_plant_name: b.first_stop_plant ? ctx.model.plants.get(b.first_stop_plant)?.short : null,
      search_days: 60,
      label: run.impacts === 1 ? "first estimate" : "latest estimate",
      series: res.ui
    });
    return res;
  }

  // -- alerts and map -----------------------------------------------------------------------------
  function reportAlert(i) {
    const basis = i.basis === "what_if" ? "what_if" : "verified";
    const sources = (Array.isArray(i.sources) ? i.sources : []).filter((s) => s && (s.title || s.url));
    if (basis === "verified" && sources.length < 2) {
      return { error: "A verified alert needs at least two independent sources. Verify with a second source first, narrate \"Not confirmed:\" and state the uncertainty, or raise it with basis \"what_if\"." };
    }
    const unknown = unknownIds(i);
    run.alertBasis = basis;
    ctx.emit("alert", {
      title: String(i.title || "Disruption alert").slice(0, 160),
      basis,
      severity: ["critical", "high", "medium", "low"].includes(i.severity) ? i.severity : "high",
      summary: String(i.summary || "").slice(0, 600),
      sources: sources.slice(0, 6).map((s) => ({ title: String(s.title || s.url).slice(0, 200), url: safeHttpUrl(s.url) })),
      supplier_ids: knownIds(i.supplier_ids), route_ids: knownIds(i.route_ids), node_ids: knownIds(i.node_ids)
    });
    return { ok: true, shown: true, ...(unknown.length ? { ignored_unknown_ids: unknown } : {}) };
  }

  function markMap(i) {
    const state = ["affected", "at_risk", "resolved", "neutral"].includes(i.state) ? i.state : "affected";
    const p = {
      supplier_ids: knownIds(i.supplier_ids), route_ids: knownIds(i.route_ids),
      node_ids: knownIds(i.node_ids), plant_ids: knownIds(i.plant_ids), state
    };
    if (i.fit) p.fit = [...p.supplier_ids, ...p.plant_ids, ...p.node_ids].filter((id) => !id.startsWith("ALT-"));
    ctx.emit("map_update", p);
    const unknown = unknownIds(i);
    return { ok: true, marked: p.supplier_ids.length + p.route_ids.length + p.node_ids.length + p.plant_ids.length, ...(unknown.length ? { ignored_unknown_ids: unknown } : {}) };
  }

  function isKnownId(id) {
    const m = ctx.model;
    return m.suppliers.has(id) || m.plants.has(id) || m.nodes.has(id) || m.routes.has(id) || m.alternatives.has(id) ||
      [...m.routes.values()].some((r) => (r.alternatives || []).some((a) => a.id === id));
  }
  function knownIds(list) {
    return (Array.isArray(list) ? list : []).map(String).filter(isKnownId).slice(0, 40);
  }
  function unknownIds(i) {
    return ["supplier_ids", "route_ids", "node_ids", "plant_ids"].flatMap((k) => (Array.isArray(i[k]) ? i[k] : []).map(String).filter((id) => !isKnownId(id)));
  }

  // -- options and decisions --------------------------------------------------------------------------
  async function proposeOptions(i) {
    const src = run.lastWithVariants;
    const list = Array.isArray(i.options) ? i.options : [];
    if (list.length !== 3) return { error: "Exactly three options are required (plus the automatic do-nothing baseline)." };
    if (!src) return { error: "No costed variants yet. Call sim_impact with the disruption and exactly three variants (V1, V2, V3) first." };
    if (run.lastImpact !== src) {
      return { error: "Your latest sim_impact call has no variants, so the options would be costed against an earlier disruption. Call sim_impact again with the current disruption and exactly three variants (V1, V2, V3), then propose the options." };
    }
    const seen = new Set();
    const options = [];
    for (const [k, o] of list.entries()) {
      const v = src.variants.find((x) => x.variant_id === o.variant_id);
      if (!v) return { error: `variant_id "${o.variant_id}" is not in the latest sim_impact result (has: ${src.variants.map((x) => x.variant_id).join(", ")}).` };
      if (seen.has(v.variant_id)) return { error: `variant_id "${v.variant_id}" is used twice.` };
      seen.add(v.variant_id);
      options.push({
        id: v.variant_id, letter: LETTERS[k],
        title: String(o.title || v.name).slice(0, 90),
        description: String(o.description || v.mitigations.join("; ")).slice(0, 400),
        residual_risk: String(o.residual_risk || "").slice(0, 300),
        ...optionFigures(ctx.model, v),
        recommended: v.variant_id === i.recommended_variant_id
      });
    }
    run.options = options;
    run.rejected.clear();
    run.optionsPayload = {
      horizon_days: src.horizon_days,
      recommended: i.recommended_variant_id,
      options,
      baseline: baselineFigures(ctx.model, src.baseline, i.baseline_description)
    };
    ctx.onPhase("options");
    ctx.emit("options", run.optionsPayload);
    return waitForDecision();
  }

  async function awaitDecision() {
    if (!run.options) return { error: "No options are on screen. Use ui_propose_options first." };
    if (run.approvedOption) return { error: `A decision was already taken: ${run.approvedOption.label}. Continue with the drafts.` };
    return waitForDecision();
  }

  async function waitForDecision() {
    ctx.onPhase("awaiting_approval");
    const ev = await ctx.waitUntil(() => ctx.takeOptionDecision(() => true));
    const { option_id: id, decision } = ev.payload;
    const opt = run.options.find((o) => o.id === id);
    const label = id === "baseline" ? "Do nothing (accept the risk)" : opt ? `Option ${opt.letter}: ${opt.title}` : id;
    if (decision === "approved") {
      run.approvedOption = { id, label };
      for (const [type, payload] of decisionEffects(run.optionsPayload, id)) ctx.emit(type, payload);
      ctx.onPhase("executing");
      return id === "baseline"
        ? { decision: "approved", option_id: "baseline", option: label,
            next: "The human accepted the risk. Do not contact suppliers. Draft one internal re-plan note for the affected plant (ui_draft_action, type replan), then ui_await_approvals, then ui_final_report." }
        : { decision: "approved", option_id: id, option: label,
            figures: { mitigation_cost: eurCompact(opt.mitigation_cost_eur), remaining_exposure: eurCompact(opt.residual_var_eur), expected_total: eurCompact(opt.total_cost_eur), time_to_effect_days: opt.time_days },
            next: "Draft the actions for this option with ui_draft_action (one per supplier, carrier or internal team), then call ui_await_approvals, then ui_final_report." };
    }
    run.rejected.add(id);
    const remaining = run.options.filter((o) => !run.rejected.has(o.id)).map((o) => `Option ${o.letter} (${o.id})`);
    return {
      decision: "rejected", option_id: id, option: label,
      remaining_options: remaining,
      next: remaining.length
        ? "Acknowledge the rejection in one sentence and do not draft anything for it. Then call ui_await_decision to wait for the next decision."
        : "All three options were rejected. Say that no action is taken unless the human accepts the risk, then call ui_await_decision once more."
    };
  }

  // -- drafts and approvals ----------------------------------------------------------------------------
  function draftAction(i) {
    const type = ["email", "booking", "replan"].includes(i.type) ? i.type : null;
    if (!type) return { error: "type must be email, booking or replan." };
    const subject = String(i.subject || "").trim();
    let body = String(i.body || "").trim().slice(0, 5600);
    if (!subject || !body) return { error: "subject and body are required." };
    if (!run.approvedOption) return { error: "Drafts follow a human decision. Propose options with ui_propose_options and wait for an approval first." };
    // The safety lines are added in code, after truncation, so no draft can lose them.
    if (type === "booking" && !/Mock booking/i.test(body)) body = `${body}\n\n${MOCK_BOOKING_LINE}`;
    if (!body.includes("Requires human approval before sending")) body = `${body}\n\n${DRAFT_FOOTER}`;
    const action_id = `act-${ctx.drafts.size + 1}`;
    ctx.drafts.set(action_id, { status: "pending", subject, recipient: String(i.recipient || "").slice(0, 160), type });
    ctx.onPhase("executing");
    ctx.emit("action_draft", { action_id, type, recipient: String(i.recipient || "").slice(0, 160), subject: subject.slice(0, 200), body, status: "pending" });
    return { action_id, status: "pending_approval", note: "Queued in the Outbox as a draft. Nothing is sent." };
  }

  async function awaitApprovals() {
    const pending = () => [...ctx.drafts.values()].filter((d) => d.status === "pending").length;
    if (!ctx.drafts.size) return { error: "There are no drafts. Use ui_draft_action first." };
    if (pending()) {
      ctx.onPhase("awaiting_approval");
      ctx.emit("notice", { level: "info", text: `Waiting for your approval of ${pending()} draft${pending() === 1 ? "" : "s"} in the Outbox.` });
      await ctx.waitUntil(() => pending() === 0);
    }
    ctx.onPhase("executing");
    const decisions = [...ctx.drafts.entries()].map(([id, d]) => ({ action_id: id, recipient: d.recipient, subject: d.subject, decision: d.status }));
    return {
      all_decided: true,
      approved: decisions.filter((d) => d.decision === "approved").length,
      rejected: decisions.filter((d) => d.decision === "rejected").length,
      decisions,
      next: "Write the management summary with ui_final_report. Approved drafts are cleared for sending by a human; nothing was sent."
    };
  }

  function finalReport(i) {
    const pendingCount = [...ctx.drafts.values()].filter((d) => d.status === "pending").length;
    if (pendingCount) return { error: `${pendingCount} draft(s) are still pending. Call ui_await_approvals first.` };
    let markdown = String(i.markdown || "").trim().slice(0, 19000);
    if (markdown.length < 40) return { error: "The report is empty. Write a short Markdown management summary." };
    // Every live report states what it is, whatever the model wrote.
    if (!/live agent run/i.test(markdown)) markdown = `${markdown}\n\n${LIVE_REPORT_FOOTER}`;
    run.reported = true;
    run.outcome = ["response_decided", "risk_accepted", "no_material_disruption", "monitoring"].includes(i.outcome) ? i.outcome : "response_decided";
    ctx.emit("report", { markdown, outcome: run.outcome });
    return { ok: true, published: true, next: "End your turn now with one short closing sentence." };
  }

  return {
    execute,
    state: () => ({ ...run, rejected: [...run.rejected] })
  };
}

function safeHttpUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

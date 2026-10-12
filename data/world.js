/*
 * NAVIGATOR — synthetic world for the fictional client "Nordwerk Automotive GmbH".
 *
 * Everything in this file is invented for demonstration purposes:
 *   - the company, its plants' names, all supplier names and all quantities are FICTIONAL;
 *   - locations, ports, chokepoints, industrial clusters and transport corridors are REAL
 *     public geography, chosen so the network looks like a plausible European EV supply chain.
 * Public anchors for every location and assumption are listed in DATA_SOURCES.md.
 *
 * Conventions
 *   - All dates are relative to the day the app is opened ("day 0" = today).
 *   - Inventory is expressed in days of cover at the current production rate.
 *   - share_pct on a flow = share of the destination's requirement for that part/input.
 *   - Material parts (kind "material") are directed buys: Nordwerk contracts them, but they are
 *     consumed by tier-1 suppliers; their cover is the consignment stock held at those suppliers.
 *   - Line-stop costs are ASSUMPTIONS (see `assumptions`), not facts about any real company.
 *
 * Loaded as a classic script so the app works without any same-origin fetch.
 */
window.WORLD = (function () {
  "use strict";

  // ---------------------------------------------------------------------------------------------
  // Sea-lane and corridor waypoints ([lat, lon]) used only for drawing routes on the map.
  // ---------------------------------------------------------------------------------------------
  const LANE = {
    PUS_SIN: [[33.8, 128.6], [31.0, 125.5], [27.5, 122.6], [24.6, 120.0], [22.0, 117.5], [18.0, 114.5], [12.0, 111.5], [7.0, 107.5], [3.5, 105.2]],
    NGB_SIN: [[28.0, 122.4], [24.6, 120.0], [22.0, 117.5], [18.0, 114.5], [12.0, 111.5], [7.0, 107.5], [3.5, 105.2]],
    KHH_SIN: [[21.0, 118.0], [18.0, 114.5], [12.0, 111.5], [7.0, 107.5], [3.5, 105.2]],
    LCB_SIN: [[11.5, 101.2], [8.5, 103.0], [5.0, 104.6], [2.5, 104.8]],
    SGZ_SIN: [[6.5, 102.0], [4.0, 104.2], [2.0, 104.6]],
    KUA_SIN: [[3.0, 104.0], [1.6, 104.4]],
    SIN_BAB: [[2.5, 101.3], [4.0, 99.6], [5.8, 97.0], [6.3, 94.5], [5.6, 90.0], [5.3, 80.6], [8.0, 73.0], [11.0, 62.0], [14.0, 54.5], [12.6, 48.0], [12.2, 45.0]],
    COK_BAB: [[9.5, 74.0], [11.0, 62.0], [14.0, 54.5], [12.6, 48.0], [12.2, 45.0]],
    BAB_SUZ: [[14.5, 42.0], [17.5, 40.3], [21.0, 38.2], [24.5, 36.0], [27.2, 34.2], [28.6, 33.0], [29.9, 32.55]],
    SUZ_GIB: [[31.27, 32.31], [32.5, 29.0], [33.6, 24.0], [35.4, 18.0], [36.0, 15.3], [37.6, 11.4], [37.8, 8.0], [37.0, 3.0], [36.2, -2.0]],
    SUZ_KOP: [[31.27, 32.31], [32.5, 29.0], [33.6, 24.0], [35.8, 21.0], [38.5, 19.4], [40.3, 19.0], [41.8, 17.3], [42.5, 16.0], [43.8, 14.3], [44.8, 13.3]],
    GIB_RTM: [[36.6, -9.6], [39.0, -10.0], [43.0, -10.0], [47.5, -6.0], [48.7, -5.8], [49.8, -3.0], [50.3, -0.5], [50.9, 1.3], [51.45, 2.6]],
    GIB_HAM: [[36.6, -9.6], [39.0, -10.0], [43.0, -10.0], [47.5, -6.0], [48.7, -5.8], [49.8, -3.0], [50.3, -0.5], [50.9, 1.3], [51.45, 2.6], [52.8, 3.9], [53.6, 5.8], [53.95, 7.8], [53.88, 8.7], [53.55, 9.7]],
    RTM_MUG: [[52.8, 3.9], [53.6, 5.8], [53.95, 7.8], [53.9, 9.15], [54.36, 10.15], [54.6, 12.5], [55.3, 15.0], [56.8, 19.0], [58.6, 21.5], [59.4, 24.0]],
    RHINE_LOWER: [[51.9, 4.5], [51.85, 5.1], [51.86, 5.87], [51.83, 6.25]],
    RHINE_MIDDLE: [[51.22, 6.77], [50.94, 6.96], [50.73, 7.1], [50.36, 7.6], [50.23, 7.59], [50.15, 7.71]],
    KAU_KAR: [[49.97, 7.9], [50.0, 8.27], [49.63, 8.37], [49.49, 8.43], [49.32, 8.44]],
    KAU_LUH: [[49.97, 7.9], [50.0, 8.27], [49.63, 8.37]],
    KAU_FRH: [[49.97, 7.9], [50.0, 8.27], [50.03, 8.5]],
    RAU_ROS: [[60.3, 20.8], [59.0, 20.0], [57.0, 17.2], [55.6, 14.9], [54.7, 12.9]],
    RAD_GOA: [[37.5, 10.5], [39.5, 10.3], [41.5, 10.0], [43.2, 9.6]],
    HFR_LZH: [[34.75, 113.65], [34.27, 108.94]],
    BTR_LZH: [[38.49, 106.23]],
    ULR_LZH: [[40.66, 109.84], [38.49, 106.23]],
    LZH_ALA: [[39.73, 98.49], [42.95, 89.19], [43.83, 87.62], [44.43, 84.88]],
    ALA_MAL: [[46.4, 79.2], [49.8, 73.1], [51.17, 71.43], [53.2, 63.6], [54.7, 55.95], [55.79, 49.12], [55.75, 37.62], [54.78, 32.05], [53.9, 27.56], [52.1, 23.7]],
    ALG_IRN: [[37.39, -5.98], [40.42, -3.7], [42.34, -3.7]],
    IRN_PAR: [[44.84, -0.58], [47.39, 0.69]],
    PAR_ERF: [[49.26, 4.03], [49.12, 6.18], [49.24, 6.99], [49.49, 8.47], [50.11, 8.68]],
    VRN_BRN: [[46.07, 11.12], [46.5, 11.35]],
    BRN_MUC: [[47.27, 11.39], [47.86, 12.12]],
    MUC_NUE: [[48.76, 11.43]],
    GRZ_PYH: [[47.34, 15.0]],
    PYH_LNZ: [[47.95, 14.15]],
    LNZ_PAS: [[48.46, 13.83]],
    PAS_REG: [[48.83, 12.96]],
    GOA_GOT: [[45.46, 9.19]],
    GOT_BAS: [[47.05, 8.31]],
    BDP_GYR_M1: [[47.57, 18.4]],
    COL_GIE: [[50.95, 7.9]],
    GIE_ERF: [[50.87, 9.71]],
    CAPE: [[5.3, 80.6], [-5.0, 72.0], [-15.0, 64.0], [-28.0, 48.0], [-33.5, 30.0], [-35.3, 22.0], [-35.0, 18.2], [-30.0, 13.5], [-15.0, 3.0], [2.0, -12.0], [10.0, -19.5], [20.0, -19.0], [29.5, -16.0], [36.5, -11.0], [43.0, -10.0]],
    MIDDLE: [[45.17, 82.57], [43.25, 76.95], [43.65, 51.17], [40.41, 49.87], [41.72, 44.79], [42.15, 41.67], [43.2, 35.0], [44.17, 28.65], [47.5, 19.04]],
    TAUERN: [[46.62, 13.85], [47.08, 13.4], [47.8, 13.04]]
  };

  // Route alternatives shared by several corridors (re-routing options for mitigation planning).
  const ALT = {
    CAPE: { id: "ALT-CAPE", name: "Re-route via Cape of Good Hope", at_node: "N-BAB", extra_days: 12, extra_cost_eur_per_teu: 1200, note: "Avoids Red Sea/Suez; adds 10–14 days Asia–North Europe (12 used).", via: LANE.CAPE },
    ANR: { id: "ALT-ANR", name: "Divert vessels to Antwerp-Bruges", at_node: "N-RTM", extra_days: 2, extra_cost_eur_per_teu: 260, note: "Slot re-booking, extra drayage/barge from Antwerp." },
    HAM: { id: "ALT-HAM", name: "Divert vessels to Hamburg", at_node: "N-RTM", extra_days: 3, extra_cost_eur_per_teu: 390, note: "Longer feeder rotation; rail from Hamburg." },
    RAIL_RHINE: { id: "ALT-RAIL-RHINE", name: "Shift Rhine barge cargo to rail", at_node: "N-KAU", extra_days: 2, extra_cost_eur_per_teu: 420, note: "Rail slots scarce during low water; includes booking lead time." },
    TRUCK_RHINE: { id: "ALT-TRUCK-RHINE", name: "Shift Rhine barge cargo to road", at_node: "N-KAU", extra_days: 1, extra_cost_eur_per_teu: 980, note: "Fastest switch; limited tank/truck capacity, highest cost." },
    MIDDLE: { id: "ALT-MIDDLE", name: "Middle Corridor (Trans-Caspian) rail", at_node: "N-ALA", extra_days: 9, extra_cost_eur_per_teu: 1100, note: "Kazakhstan – Caspian ferry – Caucasus – Black Sea – EU.", via: LANE.MIDDLE },
    TRS: { id: "ALT-TRS", name: "Divert vessels to Trieste", at_node: "N-KOP", extra_days: 1, extra_cost_eur_per_teu: 160, note: "Neighbouring Adriatic port with rail to Hungary." },
    TAUERN: { id: "ALT-TAUERN", name: "Re-route trucks via Tauern motorway", at_node: "N-BRN", extra_days: 1, extra_cost_eur_per_teu: 140, note: "Avoids Brenner corridor.", via: LANE.TAUERN }
  };

  return {
    meta: {
      app: "NAVIGATOR — Supply Chain Disruption Navigator",
      world_version: "1.0.0",
      company: "Nordwerk Automotive GmbH",
      company_note: "Fictional German EV manufacturer. One EV model (NW-e7), final assembly in Leipzig, rear e-drive units from Győr.",
      fictional: true,
      currency: "EUR",
      dates: "All dates are relative to the day the app is opened (day 0 = today).",
      disclaimer: "Company, supplier names, volumes, prices and inventories are invented. Locations, ports, chokepoints, clusters and corridors are real public geography (see DATA_SOURCES.md)."
    },

    assumptions: {
      line_stop_cost_eur_per_day: { "PL-LEJ": 1100000, "PL-GYR": 350000 },
      line_stop_cost_note: "ASSUMPTION for demonstration: lost contribution margin plus fixed cost absorption per full day of lost output. Partial shortages are costed proportionally (stop-equivalent days).",
      horizon_days_default: 30,
      inventory_note: "Days of cover are measured at today's production rate and include safety stock.",
      transit_note: "Transit days are typical door-to-door values under normal conditions.",
      fx_note: "All values in EUR."
    },

    // -------------------------------------------------------------------------------------------
    // Plants
    // -------------------------------------------------------------------------------------------
    plants: [
      {
        id: "PL-LEJ", name: "Leipzig Vehicle Plant", short: "Leipzig", city: "Leipzig", country: "DE",
        lat: 51.401, lon: 12.415,
        role: "Final assembly of the NW-e7 (one EV model) incl. battery-pack assembly",
        output_per_day: 850, output_unit: "vehicles",
        line_stop_cost_eur_per_day: 1100000,
        shifts: "3 shifts, 5 days + Saturday early shift",
        flows: []
      },
      {
        id: "PL-GYR", name: "Győr E-Drive Plant", short: "Győr", city: "Győr", country: "HU",
        lat: 47.662, lon: 17.693,
        role: "Rear e-drive units (e-motor, gearbox, inverter integration) for Leipzig",
        output_per_day: 850, output_unit: "e-drive units",
        line_stop_cost_eur_per_day: 350000,
        shifts: "3 shifts, 6 days",
        flows: [
          { to: "PL-LEJ", part: "P-EDU", share_pct: 100, route: "R-RD-CE-LEJ", enter_at: "N-GYR", transit_days: 2 }
        ]
      }
    ],

    // -------------------------------------------------------------------------------------------
    // Part families (15). Per-plant demand, days of cover and safety stock vary deliberately.
    // -------------------------------------------------------------------------------------------
    parts: [
      {
        id: "P-CELL", name: "Battery cells (prismatic NMC)", family: "Battery", kind: "component", unit: "cells",
        unit_value_eur: 32, units_per_teu: 6500, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 192, daily_demand: 163200, days_of_cover: 5, safety_stock_days: 2 } },
        air: { feasible: false, note: "Lithium-ion cells are dangerous goods (UN3480); bulk air freight is not viable." },
        spot: null, build_shy: null
      },
      {
        id: "P-CAM", name: "Cathode active material (NMC 811)", family: "Battery materials", kind: "material", unit: "kg",
        unit_value_eur: 19, units_per_teu: 20000, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 120, daily_demand: 102000, days_of_cover: 24, safety_stock_days: 10, note: "Directed buy, consigned to the three cell suppliers; cover = consignment stock." } },
        consumers: [
          { supplier: "S-WRO-CELL", plant: "PL-LEJ", daily_units: 51000 },
          { supplier: "S-DEB-CELL", plant: "PL-LEJ", daily_units: 30600 },
          { supplier: "S-GOD-CELL", plant: "PL-LEJ", daily_units: 20400 }
        ],
        air: { feasible: false, note: "Bulk powder; sea and rail only." },
        spot: { premium_pct: 35, lead_days: 25, max_share_pct: 30 }, build_shy: null
      },
      {
        id: "P-PSM", name: "Power semiconductor modules (SiC)", family: "Semiconductors", kind: "material", unit: "modules",
        unit_value_eur: 150, units_per_teu: 14000, criticality: "A",
        plants: { "PL-GYR": { per_vehicle: 3, daily_demand: 2550, days_of_cover: 8, safety_stock_days: 3, note: "Directed buy, consigned to both inverter suppliers." } },
        consumers: [
          { supplier: "S-HAT-INV", plant: "PL-GYR", daily_units: 1530 },
          { supplier: "S-NUE-INV", plant: "PL-GYR", daily_units: 1020 }
        ],
        air: { feasible: true, premium_eur_per_unit: 1.4, lead_days: 4 },
        spot: { premium_pct: 220, lead_days: 6, max_share_pct: 20 }, build_shy: null
      },
      {
        id: "P-MCU", name: "Automotive microcontrollers (MCU)", family: "Semiconductors", kind: "material", unit: "pcs",
        unit_value_eur: 8.5, units_per_teu: 250000, criticality: "A",
        plants: {
          "PL-LEJ": { per_vehicle: 12, daily_demand: 10200, days_of_cover: 12, safety_stock_days: 5, note: "Directed buy for ECU and brake suppliers (multi-sourced part numbers)." },
          "PL-GYR": { per_vehicle: 2, daily_demand: 1700, days_of_cover: 5, safety_stock_days: 2, note: "Inverter control MCU — single-sourced part number." }
        },
        consumers: [
          { supplier: "S-REG-ECU", plant: "PL-LEJ", daily_units: 4590 },
          { supplier: "S-SIB-ECU", plant: "PL-LEJ", daily_units: 3060 },
          { supplier: "S-FRA-BRK", plant: "PL-LEJ", daily_units: 1403 },
          { supplier: "S-CZW-BRK", plant: "PL-LEJ", daily_units: 1147 },
          { supplier: "S-HAT-INV", plant: "PL-GYR", daily_units: 1020 },
          { supplier: "S-NUE-INV", plant: "PL-GYR", daily_units: 680 }
        ],
        air: { feasible: true, premium_eur_per_unit: 0.02, lead_days: 4 },
        spot: { premium_pct: 300, lead_days: 4, max_share_pct: 40 }, build_shy: null
      },
      {
        id: "P-ECU", name: "Central compute & body ECUs", family: "Electronics", kind: "component", unit: "units",
        unit_value_eur: 145, units_per_teu: 4500, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 6, daily_demand: 5100, days_of_cover: 4, safety_stock_days: 2 } },
        air: { feasible: true, premium_eur_per_unit: 2.5, lead_days: 2 },
        spot: null, build_shy: null
      },
      {
        id: "P-HAR", name: "Main wiring harness sets", family: "Electrical", kind: "component", unit: "sets",
        unit_value_eur: 640, units_per_teu: 70, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 1, daily_demand: 850, days_of_cover: 3, safety_stock_days: 1.5 } },
        air: { feasible: true, premium_eur_per_unit: 38, lead_days: 2, note: "Charter from North Africa; only useful when the producing plant is running." },
        spot: null, build_shy: null
      },
      {
        id: "P-INV", name: "Traction inverters", family: "Power electronics", kind: "component", unit: "units",
        unit_value_eur: 820, units_per_teu: 220, criticality: "A",
        plants: { "PL-GYR": { per_vehicle: 1, daily_demand: 850, days_of_cover: 4, safety_stock_days: 2 } },
        air: { feasible: true, premium_eur_per_unit: 36, lead_days: 2 },
        spot: null, build_shy: null
      },
      {
        id: "P-MAG", name: "E-motor magnets (sintered NdFeB)", family: "E-motor", kind: "component", unit: "kg",
        unit_value_eur: 95, units_per_teu: 18000, criticality: "A",
        plants: { "PL-GYR": { per_vehicle: 2.2, daily_demand: 1870, days_of_cover: 45, safety_stock_days: 20, note: "Strategic stock (export-control risk)." } },
        air: { feasible: true, premium_eur_per_unit: 4.5, lead_days: 5 },
        spot: { premium_pct: 60, lead_days: 12, max_share_pct: 25 }, build_shy: null
      },
      {
        id: "P-CAST", name: "Aluminium structural castings (rear megacasting set)", family: "Body", kind: "component", unit: "sets",
        unit_value_eur: 430, units_per_teu: 36, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 1, daily_demand: 850, days_of_cover: 4, safety_stock_days: 2, note: "Bulky parts; limited line-side storage." } },
        air: { feasible: false, note: "Large structural castings; road only." },
        spot: null, build_shy: null
      },
      {
        id: "P-SEAT", name: "Seat sets (just-in-sequence)", family: "Interior", kind: "component", unit: "sets",
        unit_value_eur: 1380, units_per_teu: 18, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 1, daily_demand: 850, days_of_cover: 2, safety_stock_days: 1 } },
        air: { feasible: false, note: "Bulky JIS delivery; road only." },
        spot: null, build_shy: null
      },
      {
        id: "P-GLS", name: "Automotive glass (windscreen + panoramic roof)", family: "Body", kind: "component", unit: "sets",
        unit_value_eur: 310, units_per_teu: 60, criticality: "B",
        plants: { "PL-LEJ": { per_vehicle: 1, daily_demand: 850, days_of_cover: 9, safety_stock_days: 4 } },
        air: { feasible: false, note: "Fragile, bulky." },
        spot: null, build_shy: null
      },
      {
        id: "P-TYR", name: "Tyres", family: "Chassis", kind: "component", unit: "tyres",
        unit_value_eur: 92, units_per_teu: 550, criticality: "B",
        plants: { "PL-LEJ": { per_vehicle: 4, daily_demand: 3400, days_of_cover: 12, safety_stock_days: 5 } },
        air: { feasible: false, note: "Volume freight." },
        spot: null, build_shy: null
      },
      {
        id: "P-BRK", name: "Brake systems (corner modules + brake-by-wire unit)", family: "Chassis", kind: "component", unit: "sets",
        unit_value_eur: 540, units_per_teu: 85, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 1, daily_demand: 850, days_of_cover: 10, safety_stock_days: 4 } },
        air: { feasible: true, premium_eur_per_unit: 95, lead_days: 2 },
        spot: null, build_shy: null
      },
      {
        id: "P-DSP", name: "Displays (centre + cluster)", family: "Electronics", kind: "component", unit: "sets",
        unit_value_eur: 420, units_per_teu: 380, criticality: "B",
        plants: { "PL-LEJ": { per_vehicle: 1, daily_demand: 850, days_of_cover: 6, safety_stock_days: 2.5 } },
        air: { feasible: true, premium_eur_per_unit: 12, lead_days: 4 },
        spot: { premium_pct: 80, lead_days: 10, max_share_pct: 20 },
        build_shy: { rework_eur_per_vehicle: 230, max_days: 8, note: "Vehicles can be completed without displays and retrofitted in the yard (capacity ~8 days of output)." }
      },
      {
        id: "P-EDU", name: "Rear e-drive units (internal, from Győr)", family: "E-drive", kind: "internal", unit: "units",
        unit_value_eur: 3950, units_per_teu: 10, criticality: "A",
        plants: { "PL-LEJ": { per_vehicle: 1, daily_demand: 850, days_of_cover: 3, safety_stock_days: 1.5 } },
        air: { feasible: false, note: "Heavy units; internal truck shuttle." },
        spot: null, build_shy: null
      }
    ],

    // -------------------------------------------------------------------------------------------
    // Network nodes: ports, inland hubs, chokepoints, airports, rail gateways, road hubs (real).
    // -------------------------------------------------------------------------------------------
    nodes: [
      { id: "N-RTM", name: "Port of Rotterdam (Maasvlakte)", type: "port", country: "NL", lat: 51.96, lon: 4.03 },
      { id: "N-BOT", name: "Rotterdam-Botlek chemical terminals", type: "port", country: "NL", lat: 51.88, lon: 4.3 },
      { id: "N-ANR", name: "Port of Antwerp-Bruges", type: "port", country: "BE", lat: 51.28, lon: 4.3 },
      { id: "N-HAM", name: "Port of Hamburg", type: "port", country: "DE", lat: 53.53, lon: 9.92 },
      { id: "N-KOP", name: "Port of Koper", type: "port", country: "SI", lat: 45.56, lon: 13.74 },
      { id: "N-TRS", name: "Port of Trieste", type: "port", country: "IT", lat: 45.63, lon: 13.77 },
      { id: "N-GOA", name: "Port of Genoa", type: "port", country: "IT", lat: 44.405, lon: 8.905 },
      { id: "N-RAD", name: "Port of Radès (Tunis)", type: "port", country: "TN", lat: 36.8, lon: 10.26 },
      { id: "N-TME", name: "Tanger Med port", type: "port", country: "MA", lat: 35.89, lon: -5.5 },
      { id: "N-ALG", name: "Port of Algeciras", type: "port", country: "ES", lat: 36.13, lon: -5.44 },
      { id: "N-PUS", name: "Port of Busan", type: "port", country: "KR", lat: 35.08, lon: 129.05 },
      { id: "N-NGB", name: "Port of Ningbo-Zhoushan", type: "port", country: "CN", lat: 29.93, lon: 121.85 },
      { id: "N-KHH", name: "Port of Kaohsiung", type: "port", country: "TW", lat: 22.6, lon: 120.28 },
      { id: "N-LCB", name: "Port of Laem Chabang", type: "port", country: "TH", lat: 13.08, lon: 100.88 },
      { id: "N-SGZ", name: "Port of Songkhla", type: "port", country: "TH", lat: 7.21, lon: 100.59 },
      { id: "N-COK", name: "Port of Kochi", type: "port", country: "IN", lat: 9.97, lon: 76.27 },
      { id: "N-KUA", name: "Port of Kuantan", type: "port", country: "MY", lat: 3.98, lon: 103.43 },
      { id: "N-MUG", name: "Port of Muuga (Tallinn)", type: "port", country: "EE", lat: 59.5, lon: 24.96 },
      { id: "N-RAU", name: "Port of Rauma", type: "port", country: "FI", lat: 61.13, lon: 21.46 },
      { id: "N-ROS", name: "Port of Rostock", type: "port", country: "DE", lat: 54.15, lon: 12.1 },
      { id: "N-DUI", name: "Duisburg inland port (duisport)", type: "hub", country: "DE", lat: 51.43, lon: 6.75 },
      { id: "N-KAU", name: "Kaub — Middle Rhine bottleneck (gauge KAUB)", type: "waterway", country: "DE", lat: 50.0854, lon: 7.765 },
      { id: "N-FRH", name: "Frankfurt Osthafen (Main)", type: "port", country: "DE", lat: 50.11, lon: 8.73 },
      { id: "N-LUH", name: "Ludwigshafen/Mannheim Rhine ports", type: "port", country: "DE", lat: 49.49, lon: 8.43 },
      { id: "N-KAR", name: "Karlsruhe Rheinhafen", type: "port", country: "DE", lat: 49.015, lon: 8.315 },
      { id: "N-SIN", name: "Singapore Strait", type: "chokepoint", country: "SG", lat: 1.25, lon: 103.85 },
      { id: "N-BAB", name: "Bab-el-Mandeb Strait (Red Sea entrance)", type: "chokepoint", country: "YE/DJ", lat: 12.6, lon: 43.35 },
      { id: "N-SUZ", name: "Suez Canal", type: "chokepoint", country: "EG", lat: 30.59, lon: 32.33 },
      { id: "N-GIB", name: "Strait of Gibraltar", type: "chokepoint", country: "ES/MA", lat: 35.95, lon: -5.6 },
      { id: "N-CPT", name: "Cape of Good Hope", type: "chokepoint", country: "ZA", lat: -34.8, lon: 18.3 },
      { id: "N-TPE", name: "Taipei Taoyuan International Airport", type: "airport", country: "TW", lat: 25.08, lon: 121.23 },
      { id: "N-LEJ", name: "Leipzig/Halle Airport (air-cargo hub)", type: "airport", country: "DE", lat: 51.424, lon: 12.236 },
      { id: "N-BUD", name: "Budapest Ferenc Liszt Airport", type: "airport", country: "HU", lat: 47.437, lon: 19.256 },
      { id: "N-HFR", name: "Hefei rail freight terminal", type: "rail", country: "CN", lat: 31.82, lon: 117.23 },
      { id: "N-BTR", name: "Baotou rail freight terminal", type: "rail", country: "CN", lat: 40.65, lon: 109.84 },
      { id: "N-ULR", name: "Ulanqab rail freight terminal", type: "rail", country: "CN", lat: 41.0, lon: 113.13 },
      { id: "N-LZH", name: "Lanzhou rail junction", type: "rail", country: "CN", lat: 36.06, lon: 103.83 },
      { id: "N-ALA", name: "Alashankou–Dostyk border crossing", type: "rail", country: "CN/KZ", lat: 45.17, lon: 82.57 },
      { id: "N-MAL", name: "Małaszewicze EU rail gateway", type: "rail", country: "PL", lat: 52.04, lon: 23.55 },
      { id: "N-BRN", name: "Brenner Pass", type: "pass", country: "AT/IT", lat: 47.005, lon: 11.507 },
      { id: "N-PYH", name: "Pyhrn motorway corridor (A9)", type: "pass", country: "AT", lat: 47.63, lon: 14.32 },
      { id: "N-GOT", name: "Gotthard road tunnel", type: "pass", country: "CH", lat: 46.56, lon: 8.59 },
      { id: "N-DRE", name: "Dresden motorway hub", type: "hub", country: "DE", lat: 51.05, lon: 13.74 },
      { id: "N-PRG", name: "Prague ring", type: "hub", country: "CZ", lat: 50.08, lon: 14.44 },
      { id: "N-BTS", name: "Bratislava", type: "hub", country: "SK", lat: 48.15, lon: 17.11 },
      { id: "N-BDP", name: "Budapest M0 ring", type: "hub", country: "HU", lat: 47.5, lon: 19.04 },
      { id: "N-GYR", name: "Győr (M1 motorway)", type: "hub", country: "HU", lat: 47.68, lon: 17.63 },
      { id: "N-VIE", name: "Vienna", type: "hub", country: "AT", lat: 48.21, lon: 16.37 },
      { id: "N-NUE", name: "Nuremberg motorway hub", type: "hub", country: "DE", lat: 49.45, lon: 11.08 },
      { id: "N-HOF", name: "Hof (A9/A72)", type: "hub", country: "DE", lat: 50.31, lon: 11.92 },
      { id: "N-ERF", name: "Erfurt (A4/A71)", type: "hub", country: "DE", lat: 50.98, lon: 11.03 },
      { id: "N-GIE", name: "Gießen (A45/A5)", type: "hub", country: "DE", lat: 50.58, lon: 8.68 },
      { id: "N-COL", name: "Cologne motorway ring", type: "hub", country: "DE", lat: 50.94, lon: 6.96 },
      { id: "N-PAR", name: "Paris (A86 ring)", type: "hub", country: "FR", lat: 48.86, lon: 2.35 },
      { id: "N-IRN", name: "Irun–Hendaye border", type: "border", country: "ES/FR", lat: 43.34, lon: -1.79 },
      { id: "N-BAS", name: "Basel", type: "hub", country: "CH", lat: 47.56, lon: 7.59 },
      { id: "N-VRN", name: "Verona", type: "hub", country: "IT", lat: 45.44, lon: 10.99 },
      { id: "N-MUC", name: "Munich", type: "hub", country: "DE", lat: 48.14, lon: 11.58 },
      { id: "N-GRZ", name: "Graz", type: "hub", country: "AT", lat: 47.07, lon: 15.44 },
      { id: "N-LNZ", name: "Linz", type: "hub", country: "AT", lat: 48.31, lon: 14.29 },
      { id: "N-PAS", name: "Passau", type: "hub", country: "DE", lat: 48.57, lon: 13.43 },
      { id: "N-REG", name: "Regensburg", type: "hub", country: "DE", lat: 49.01, lon: 12.1 },
      { id: "N-WRO", name: "Wrocław (A4)", type: "hub", country: "PL", lat: 51.11, lon: 17.03 },
      { id: "N-GRL", name: "Görlitz border crossing", type: "border", country: "DE/PL", lat: 51.15, lon: 14.99 },
      { id: "N-KTW", name: "Katowice", type: "hub", country: "PL", lat: 50.26, lon: 19.02 },
      { id: "N-ARD", name: "Arad", type: "hub", country: "RO", lat: 46.18, lon: 21.31 },
      { id: "N-SZG", name: "Szeged", type: "hub", country: "HU", lat: 46.25, lon: 20.15 },
      { id: "N-BRO", name: "Brno", type: "hub", country: "CZ", lat: 49.19, lon: 16.61 },
      { id: "N-UST", name: "Ústí nad Labem", type: "hub", country: "CZ", lat: 50.66, lon: 14.03 },
      { id: "N-WAW", name: "Warsaw", type: "hub", country: "PL", lat: 52.23, lon: 21.01 },
      { id: "N-RIX", name: "Riga", type: "hub", country: "LV", lat: 56.95, lon: 24.11 },
      { id: "N-KUN", name: "Kaunas", type: "hub", country: "LT", lat: 54.9, lon: 23.9 },
      { id: "N-OST", name: "Ostrava", type: "hub", country: "CZ", lat: 49.82, lon: 18.26 },
      { id: "N-GVA", name: "Geneva", type: "hub", country: "CH", lat: 46.2, lon: 6.14 },
      { id: "N-STR", name: "Stuttgart", type: "hub", country: "DE", lat: 48.78, lon: 9.18 }
    ],

    // -------------------------------------------------------------------------------------------
    // Logistics routes (corridors). Leg days are typical transit times; "@dest" = the receiving
    // site of a flow, "@origin" = the shipping site. display:false = regional short-haul network
    // (no corridor line drawn; the map shows a supply link instead).
    // -------------------------------------------------------------------------------------------
    routes: [
      {
        id: "R-SEA-KR-RTM-CE", name: "Korea – Suez – Rotterdam – rail to Central Europe", mode: "sea", display: true,
        legs: [
          { from: "N-PUS", to: "N-SIN", mode: "sea", days: 9, via: LANE.PUS_SIN },
          { from: "N-SIN", to: "N-BAB", mode: "sea", days: 9, via: LANE.SIN_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-GIB", mode: "sea", days: 4, via: LANE.SUZ_GIB },
          { from: "N-GIB", to: "N-RTM", mode: "sea", days: 5, via: LANE.GIB_RTM },
          { from: "N-RTM", to: "@dest", mode: "rail", days: 3 }
        ],
        alternatives: [ALT.CAPE, ALT.ANR, ALT.HAM]
      },
      {
        id: "R-SEA-CN-HAM-CE", name: "Ningbo – Suez – Hamburg – rail to Central Europe", mode: "sea", display: true,
        legs: [
          { from: "N-NGB", to: "N-SIN", mode: "sea", days: 7, via: LANE.NGB_SIN },
          { from: "N-SIN", to: "N-BAB", mode: "sea", days: 9, via: LANE.SIN_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-GIB", mode: "sea", days: 4, via: LANE.SUZ_GIB },
          { from: "N-GIB", to: "N-HAM", mode: "sea", days: 6, via: LANE.GIB_HAM },
          { from: "N-HAM", to: "@dest", mode: "rail", days: 3 }
        ],
        alternatives: [ALT.CAPE]
      },
      {
        id: "R-SEA-TW-RTM-LEJ", name: "Kaohsiung – Suez – Rotterdam – rail to Leipzig", mode: "sea", display: true,
        legs: [
          { from: "N-KHH", to: "N-SIN", mode: "sea", days: 5, via: LANE.KHH_SIN },
          { from: "N-SIN", to: "N-BAB", mode: "sea", days: 9, via: LANE.SIN_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-GIB", mode: "sea", days: 4, via: LANE.SUZ_GIB },
          { from: "N-GIB", to: "N-RTM", mode: "sea", days: 5, via: LANE.GIB_RTM },
          { from: "N-RTM", to: "@dest", mode: "rail", days: 2 }
        ],
        alternatives: [ALT.CAPE, ALT.ANR, ALT.HAM]
      },
      {
        id: "R-SEA-TH-RTM-LEJ", name: "Laem Chabang – Suez – Rotterdam – rail to Leipzig", mode: "sea", display: true,
        legs: [
          { from: "N-LCB", to: "N-SIN", mode: "sea", days: 3, via: LANE.LCB_SIN },
          { from: "N-SIN", to: "N-BAB", mode: "sea", days: 9, via: LANE.SIN_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-GIB", mode: "sea", days: 4, via: LANE.SUZ_GIB },
          { from: "N-GIB", to: "N-RTM", mode: "sea", days: 5, via: LANE.GIB_RTM },
          { from: "N-RTM", to: "@dest", mode: "rail", days: 2 }
        ],
        alternatives: [ALT.CAPE, ALT.ANR, ALT.HAM]
      },
      {
        id: "R-SEA-TH-RHINE-KAR", name: "Songkhla – Suez – Rotterdam – Rhine barge (via Kaub) – Karlsruhe", mode: "sea+barge", display: true,
        legs: [
          { from: "N-SGZ", to: "N-SIN", mode: "sea", days: 2, via: LANE.SGZ_SIN },
          { from: "N-SIN", to: "N-BAB", mode: "sea", days: 9, via: LANE.SIN_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-GIB", mode: "sea", days: 4, via: LANE.SUZ_GIB },
          { from: "N-GIB", to: "N-RTM", mode: "sea", days: 5, via: LANE.GIB_RTM },
          { from: "N-RTM", to: "N-DUI", mode: "barge", days: 2, via: LANE.RHINE_LOWER },
          { from: "N-DUI", to: "N-KAU", mode: "barge", days: 2, via: LANE.RHINE_MIDDLE },
          { from: "N-KAU", to: "N-KAR", mode: "barge", days: 2, via: LANE.KAU_KAR },
          { from: "N-KAR", to: "@dest", mode: "road", days: 0 }
        ],
        alternatives: [ALT.CAPE, ALT.ANR, ALT.RAIL_RHINE, ALT.TRUCK_RHINE]
      },
      {
        id: "R-SEA-IN-RHINE-FRA", name: "Kochi – Suez – Rotterdam – Rhine/Main barge (via Kaub) – Frankfurt", mode: "sea+barge", display: true,
        legs: [
          { from: "N-COK", to: "N-BAB", mode: "sea", days: 6, via: LANE.COK_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-GIB", mode: "sea", days: 4, via: LANE.SUZ_GIB },
          { from: "N-GIB", to: "N-RTM", mode: "sea", days: 5, via: LANE.GIB_RTM },
          { from: "N-RTM", to: "N-DUI", mode: "barge", days: 2, via: LANE.RHINE_LOWER },
          { from: "N-DUI", to: "N-KAU", mode: "barge", days: 2, via: LANE.RHINE_MIDDLE },
          { from: "N-KAU", to: "N-FRH", mode: "barge", days: 1, via: LANE.KAU_FRH },
          { from: "N-FRH", to: "@dest", mode: "road", days: 0 }
        ],
        alternatives: [ALT.CAPE, ALT.ANR, ALT.RAIL_RHINE, ALT.TRUCK_RHINE]
      },
      {
        id: "R-SEA-MY-RTM-MUG", name: "Kuantan – Suez – Rotterdam – Baltic feeder – Muuga", mode: "sea", display: true,
        legs: [
          { from: "N-KUA", to: "N-SIN", mode: "sea", days: 1, via: LANE.KUA_SIN },
          { from: "N-SIN", to: "N-BAB", mode: "sea", days: 9, via: LANE.SIN_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-GIB", mode: "sea", days: 4, via: LANE.SUZ_GIB },
          { from: "N-GIB", to: "N-RTM", mode: "sea", days: 5, via: LANE.GIB_RTM },
          { from: "N-RTM", to: "N-MUG", mode: "sea", days: 4, via: LANE.RTM_MUG },
          { from: "N-MUG", to: "@dest", mode: "road", days: 1 }
        ],
        alternatives: [ALT.CAPE, ALT.ANR, ALT.HAM]
      },
      {
        id: "R-SEA-CN-KOP-GYR", name: "Ningbo – Suez – Koper – rail to Győr", mode: "sea", display: true,
        legs: [
          { from: "N-NGB", to: "N-SIN", mode: "sea", days: 7, via: LANE.NGB_SIN },
          { from: "N-SIN", to: "N-BAB", mode: "sea", days: 9, via: LANE.SIN_BAB },
          { from: "N-BAB", to: "N-SUZ", mode: "sea", days: 3, via: LANE.BAB_SUZ },
          { from: "N-SUZ", to: "N-KOP", mode: "sea", days: 4, via: LANE.SUZ_KOP },
          { from: "N-KOP", to: "@dest", mode: "rail", days: 2 }
        ],
        alternatives: [ALT.CAPE, ALT.TRS]
      },
      {
        id: "R-BARGE-BOT-LUH", name: "Rhine tank barge Rotterdam-Botlek – Duisburg – Kaub – Ludwigshafen", mode: "barge", display: true,
        legs: [
          { from: "N-BOT", to: "N-DUI", mode: "barge", days: 2, via: LANE.RHINE_LOWER },
          { from: "N-DUI", to: "N-KAU", mode: "barge", days: 2, via: LANE.RHINE_MIDDLE },
          { from: "N-KAU", to: "N-LUH", mode: "barge", days: 1, via: LANE.KAU_LUH },
          { from: "N-LUH", to: "@dest", mode: "road", days: 0 }
        ],
        alternatives: [ALT.RAIL_RHINE, ALT.TRUCK_RHINE]
      },
      {
        id: "R-RAIL-CN-LEJ", name: "China–Europe rail: Hefei – Alashankou – Małaszewicze – Leipzig", mode: "rail", display: true,
        legs: [
          { from: "N-HFR", to: "N-LZH", mode: "rail", days: 3, via: LANE.HFR_LZH },
          { from: "N-LZH", to: "N-ALA", mode: "rail", days: 3, via: LANE.LZH_ALA },
          { from: "N-ALA", to: "N-MAL", mode: "rail", days: 10, via: LANE.ALA_MAL },
          { from: "N-MAL", to: "@dest", mode: "rail", days: 2 }
        ],
        alternatives: [ALT.MIDDLE]
      },
      {
        id: "R-RAIL-CN-GYR", name: "China–Europe rail: Baotou – Alashankou – Małaszewicze – Győr", mode: "rail", display: true,
        legs: [
          { from: "N-BTR", to: "N-LZH", mode: "rail", days: 2, via: LANE.BTR_LZH },
          { from: "N-LZH", to: "N-ALA", mode: "rail", days: 3, via: LANE.LZH_ALA },
          { from: "N-ALA", to: "N-MAL", mode: "rail", days: 10, via: LANE.ALA_MAL },
          { from: "N-MAL", to: "@dest", mode: "rail", days: 4 }
        ],
        alternatives: [ALT.MIDDLE]
      },
      {
        id: "R-RAIL-CN-CE", name: "China–Europe rail: Ulanqab – Alashankou – Małaszewicze – Central Europe", mode: "rail", display: true,
        legs: [
          { from: "N-ULR", to: "N-LZH", mode: "rail", days: 3, via: LANE.ULR_LZH },
          { from: "N-LZH", to: "N-ALA", mode: "rail", days: 3, via: LANE.LZH_ALA },
          { from: "N-ALA", to: "N-MAL", mode: "rail", days: 10, via: LANE.ALA_MAL },
          { from: "N-MAL", to: "@dest", mode: "rail", days: 3 }
        ],
        alternatives: [ALT.MIDDLE]
      },
      {
        id: "R-AIR-TW-LEJ", name: "Air freight Taipei – Leipzig/Halle", mode: "air", display: true,
        legs: [
          { from: "@origin", to: "N-TPE", mode: "road", days: 1 },
          { from: "N-TPE", to: "N-LEJ", mode: "air", days: 1 },
          { from: "N-LEJ", to: "@dest", mode: "road", days: 2 }
        ],
        alternatives: []
      },
      {
        id: "R-AIR-TW-BUD", name: "Air freight Taipei – Budapest", mode: "air", display: true,
        legs: [
          { from: "@origin", to: "N-TPE", mode: "road", days: 1 },
          { from: "N-TPE", to: "N-BUD", mode: "air", days: 1 },
          { from: "N-BUD", to: "@dest", mode: "road", days: 2 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-TNG-LEJ", name: "Tangier – Strait ferry – Spain – France – Leipzig (road)", mode: "road", display: true,
        legs: [
          { from: "N-TME", to: "N-ALG", mode: "ferry", days: 0.5 },
          { from: "N-ALG", to: "N-IRN", mode: "road", days: 1, via: LANE.ALG_IRN },
          { from: "N-IRN", to: "N-PAR", mode: "road", days: 1, via: LANE.IRN_PAR },
          { from: "N-PAR", to: "N-ERF", mode: "road", days: 1, via: LANE.PAR_ERF },
          { from: "N-ERF", to: "@dest", mode: "road", days: 0.5 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-SOU-LEJ", name: "Sousse – Radès – ferry to Genoa – Gotthard – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-RAD", to: "N-GOA", mode: "ferry", days: 1.5, via: LANE.RAD_GOA },
          { from: "N-GOA", to: "N-GOT", mode: "road", days: 0.5, via: LANE.GOA_GOT },
          { from: "N-GOT", to: "N-BAS", mode: "road", days: 0.5, via: LANE.GOT_BAS },
          { from: "N-BAS", to: "@dest", mode: "road", days: 1.5 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-ALP-LEJ", name: "Trans-Alpine road via Brenner: Verona – Munich – Nuremberg – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-VRN", to: "N-BRN", mode: "road", days: 0.5, via: LANE.VRN_BRN },
          { from: "N-BRN", to: "N-MUC", mode: "road", days: 0.5, via: LANE.BRN_MUC },
          { from: "N-MUC", to: "N-NUE", mode: "road", days: 0.5, via: LANE.MUC_NUE },
          { from: "N-NUE", to: "@dest", mode: "road", days: 0.5 }
        ],
        alternatives: [ALT.TAUERN]
      },
      {
        id: "R-RD-SI-LEJ", name: "Pyhrn corridor: Graz – Linz – Passau – Regensburg – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-GRZ", to: "N-PYH", mode: "road", days: 0.5, via: LANE.GRZ_PYH },
          { from: "N-PYH", to: "N-LNZ", mode: "road", days: 0.25, via: LANE.PYH_LNZ },
          { from: "N-LNZ", to: "N-PAS", mode: "road", days: 0.25, via: LANE.LNZ_PAS },
          { from: "N-PAS", to: "N-REG", mode: "road", days: 0.25, via: LANE.PAS_REG },
          { from: "N-REG", to: "@dest", mode: "road", days: 0.75 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-CE-LEJ", name: "Central Europe corridor: Budapest – Győr – Bratislava – Brno – Prague – Dresden – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-BDP", to: "N-GYR", mode: "road", days: 0.25, via: LANE.BDP_GYR_M1 },
          { from: "N-GYR", to: "N-BTS", mode: "road", days: 0.25 },
          { from: "N-BTS", to: "N-BRO", mode: "road", days: 0.25 },
          { from: "N-BRO", to: "N-PRG", mode: "road", days: 0.5 },
          { from: "N-PRG", to: "N-DRE", mode: "road", days: 0.25 },
          { from: "N-DRE", to: "@dest", mode: "road", days: 0.5 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-RO-LEJ", name: "Romania – Hungary – Central Europe corridor to Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-ARD", to: "N-SZG", mode: "road", days: 0.25 },
          { from: "N-SZG", to: "N-BDP", mode: "road", days: 0.25 },
          { from: "N-BDP", to: "N-GYR", mode: "road", days: 0.25, via: LANE.BDP_GYR_M1 },
          { from: "N-GYR", to: "N-BTS", mode: "road", days: 0.25 },
          { from: "N-BTS", to: "N-BRO", mode: "road", days: 0.25 },
          { from: "N-BRO", to: "N-PRG", mode: "road", days: 0.25 },
          { from: "N-PRG", to: "N-DRE", mode: "road", days: 0.25 },
          { from: "N-DRE", to: "@dest", mode: "road", days: 0.25 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-PL-LEJ", name: "A4 corridor: Katowice – Wrocław – Görlitz – Dresden – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-KTW", to: "N-WRO", mode: "road", days: 0.25 },
          { from: "N-WRO", to: "N-GRL", mode: "road", days: 0.25 },
          { from: "N-GRL", to: "N-DRE", mode: "road", days: 0.25 },
          { from: "N-DRE", to: "@dest", mode: "road", days: 0.25 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-CZ-LEJ", name: "D8/A17: Prague – Ústí – Dresden – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-PRG", to: "N-UST", mode: "road", days: 0.25 },
          { from: "N-UST", to: "N-DRE", mode: "road", days: 0.25 },
          { from: "N-DRE", to: "@dest", mode: "road", days: 0.5 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-DE-W", name: "A45/A4 west: Cologne – Gießen – Erfurt – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-COL", to: "N-GIE", mode: "road", days: 0.25, via: LANE.COL_GIE },
          { from: "N-GIE", to: "N-ERF", mode: "road", days: 0.25, via: LANE.GIE_ERF },
          { from: "N-ERF", to: "@dest", mode: "road", days: 0.5 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-DE-S", name: "A93/A9 south: Regensburg – Hof – Leipzig", mode: "road", display: true,
        legs: [
          { from: "N-REG", to: "N-HOF", mode: "road", days: 0.25 },
          { from: "N-HOF", to: "@dest", mode: "road", days: 0.75 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-HU-GYR", name: "M3/M1: Hatvan – Budapest – Győr", mode: "road", display: true,
        legs: [
          { from: "N-BDP", to: "N-GYR", mode: "road", days: 0.5, via: LANE.BDP_GYR_M1 },
          { from: "N-GYR", to: "@dest", mode: "road", days: 0.5 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-DE-HU", name: "Danube corridor: Nuremberg – Regensburg – Passau – Linz – Vienna – Győr", mode: "road", display: true,
        legs: [
          { from: "N-NUE", to: "N-REG", mode: "road", days: 0.25 },
          { from: "N-REG", to: "N-PAS", mode: "road", days: 0.25, via: [[48.83, 12.96]] },
          { from: "N-PAS", to: "N-LNZ", mode: "road", days: 0.15, via: [[48.46, 13.83]] },
          { from: "N-LNZ", to: "N-VIE", mode: "road", days: 0.2 },
          { from: "N-VIE", to: "@dest", mode: "road", days: 0.15 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-BALT-GYR", name: "Via Baltica: Riga – Kaunas – Warsaw – Katowice – Ostrava – Bratislava – Győr", mode: "road", display: true,
        legs: [
          { from: "N-RIX", to: "N-KUN", mode: "road", days: 0.5 },
          { from: "N-KUN", to: "N-WAW", mode: "road", days: 0.5 },
          { from: "N-WAW", to: "N-KTW", mode: "road", days: 0.5 },
          { from: "N-KTW", to: "N-OST", mode: "road", days: 0.25 },
          { from: "N-OST", to: "N-BTS", mode: "road", days: 0.5 },
          { from: "N-BTS", to: "@dest", mode: "road", days: 0.25 }
        ],
        alternatives: []
      },
      {
        id: "R-FERRY-FI-CE", name: "Finland – Rauma–Rostock ferry – Central Europe", mode: "ferry", display: true,
        legs: [
          { from: "N-RAU", to: "N-ROS", mode: "ferry", days: 1.5, via: LANE.RAU_ROS },
          { from: "N-ROS", to: "@dest", mode: "road", days: 2 }
        ],
        alternatives: []
      },
      {
        id: "R-RD-FR-DE", name: "Grenoble – Geneva – Basel – Stuttgart – Nuremberg", mode: "road", display: true,
        legs: [
          { from: "N-GVA", to: "N-BAS", mode: "road", days: 0.25 },
          { from: "N-BAS", to: "N-STR", mode: "road", days: 0.25 },
          { from: "N-STR", to: "N-NUE", mode: "road", days: 0.25 },
          { from: "N-NUE", to: "@dest", mode: "road", days: 1 }
        ],
        alternatives: []
      },
      { id: "R-REG-EU", name: "European regional road network (short-haul)", mode: "road", display: false, legs: [{ from: "@origin", to: "@dest", mode: "road", days: 1 }], alternatives: [] },
      { id: "R-REG-MA", name: "Northern Morocco regional road", mode: "road", display: false, legs: [{ from: "@origin", to: "@dest", mode: "road", days: 1 }], alternatives: [] },
      { id: "R-REG-TW", name: "Taiwan domestic road", mode: "road", display: false, legs: [{ from: "@origin", to: "@dest", mode: "road", days: 1 }], alternatives: [] },
      { id: "R-REG-ASIA", name: "Intra-Asia feeder (sea/air)", mode: "sea", display: false, legs: [{ from: "@origin", to: "@dest", mode: "sea", days: 3 }], alternatives: [] }
    ],

    // -------------------------------------------------------------------------------------------
    // Suppliers (57): 26 tier-1, 30 tier-2 (9 of them directed-buy materials), 1 tier-3.
    // surge: extra share of the destination's requirement an unaffected supplier can add.
    // inputs: modelled inputs of a supplier; buffer_days = input stock at that supplier.
    // -------------------------------------------------------------------------------------------
    suppliers: [
      // ---- Battery cells (tier 1) -------------------------------------------------------------
      {
        id: "S-WRO-CELL", name: "Odra Cell Systems Sp. z o.o.", tier: 1, country: "PL", city: "Wrocław (Biskupice Podgórne)",
        cluster: "Lower Silesia battery cluster", lat: 51.07, lon: 16.88, parts: ["P-CELL"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 10, premium_pct: 6 },
        inputs: {
          "P-CAM": {},
          "Separator film": { buffer_days: 10 },
          "Graphite anode": { buffer_days: 21 },
          "Electrolyte": { buffer_days: 4, contingency: { description: "Electrolyte from an approved Korean source via Polish consignment stock", lead_days: 8, max_share_pct: 40, cost_eur_per_day: 38000 } }
        },
        flows: [{ to: "PL-LEJ", part: "P-CELL", share_pct: 50, route: "R-RD-PL-LEJ", enter_at: "N-WRO", transit_days: 1 }]
      },
      {
        id: "S-DEB-CELL", name: "Puszta Energy Cells Kft.", tier: 1, country: "HU", city: "Debrecen",
        cluster: "Debrecen battery cluster", lat: 47.475, lon: 21.6, parts: ["P-CELL"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 8, lead_days: 10, premium_pct: 6 },
        inputs: {
          "P-CAM": {},
          "Separator film": { buffer_days: 10 },
          "Graphite anode": { buffer_days: 21 },
          "Electrolyte": { buffer_days: 4, contingency: { description: "Electrolyte from an approved Korean source via Polish consignment stock", lead_days: 8, max_share_pct: 40, cost_eur_per_day: 23000 } }
        },
        flows: [{ to: "PL-LEJ", part: "P-CELL", share_pct: 30, route: "R-RD-CE-LEJ", enter_at: "N-BDP", transit_days: 2 }]
      },
      {
        id: "S-GOD-CELL", name: "Göd Battery Works Kft.", tier: 1, country: "HU", city: "Göd",
        cluster: "Budapest–Göd battery cluster", lat: 47.7, lon: 19.15, parts: ["P-CELL"], directed_buy: false,
        lead_time_days: 12, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 5, lead_days: 14, premium_pct: 7 },
        inputs: {
          "P-CAM": {},
          "Separator film": { buffer_days: 10 },
          "Graphite anode": { buffer_days: 21 },
          "Electrolyte": { buffer_days: 4, contingency: { description: "Electrolyte from an approved Korean source via Polish consignment stock", lead_days: 8, max_share_pct: 40, cost_eur_per_day: 15000 } }
        },
        flows: [{ to: "PL-LEJ", part: "P-CELL", share_pct: 20, route: "R-RD-CE-LEJ", enter_at: "N-BDP", transit_days: 2 }]
      },

      // ---- Cathode active material (directed buy, tier 2) ------------------------------------
      {
        id: "S-POH-CAM", name: "Hanbit Cathode Materials Co., Ltd.", tier: 2, country: "KR", city: "Pohang",
        cluster: "Pohang cathode-materials cluster", lat: 36.09, lon: 129.4, parts: ["P-CAM"], directed_buy: true,
        lead_time_days: 45, fg_buffer_days: 5, dual_source: true, transport_mode: "sea",
        surge: { max_extra_share_pct: 10, lead_days: 14, premium_pct: 4 },
        flows: [{ to: ["S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], part: "P-CAM", share_pct: 50, route: "R-SEA-KR-RTM-CE", transit_days: 33 }]
      },
      {
        id: "S-NGB-CAM", name: "Yongjiang Cathode Technology Co., Ltd.", tier: 2, country: "CN", city: "Ningbo",
        cluster: "Ningbo cathode-materials cluster", lat: 29.9, lon: 121.62, parts: ["P-CAM"], directed_buy: true,
        lead_time_days: 40, fg_buffer_days: 5, dual_source: true, transport_mode: "sea",
        surge: { max_extra_share_pct: 10, lead_days: 14, premium_pct: 4 },
        flows: [{ to: ["S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], part: "P-CAM", share_pct: 30, route: "R-SEA-CN-HAM-CE", transit_days: 32 }]
      },
      {
        id: "S-HJV-CAM", name: "Satakunta Cathode Oy", tier: 2, country: "FI", city: "Harjavalta",
        cluster: "Harjavalta battery-chemicals cluster", lat: 61.315, lon: 22.14, parts: ["P-CAM"], directed_buy: true,
        lead_time_days: 14, fg_buffer_days: 3, dual_source: true, transport_mode: "ferry+road",
        surge: { max_extra_share_pct: 10, lead_days: 10, premium_pct: 6 },
        flows: [{ to: ["S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], part: "P-CAM", share_pct: 20, route: "R-FERRY-FI-CE", transit_days: 4 }]
      },

      // ---- Power semiconductors (directed buy, tier 2) ---------------------------------------
      {
        id: "S-HSC-PSM", name: "Formosa Wide-Bandgap Semiconductor Corp.", tier: 2, country: "TW", city: "Hsinchu",
        cluster: "Hsinchu Science Park semiconductor cluster", lat: 24.775, lon: 121.005, parts: ["P-PSM"], directed_buy: true,
        lead_time_days: 60, fg_buffer_days: 3, dual_source: true, transport_mode: "air",
        surge: { max_extra_share_pct: 10, lead_days: 7, premium_pct: 6 },
        flows: [{ to: ["S-HAT-INV", "S-NUE-INV"], part: "P-PSM", share_pct: 40, route: "R-AIR-TW-BUD", transit_days: 4 }]
      },
      {
        id: "S-DRS-PSM", name: "Elbtal Power Semiconductors GmbH", tier: 2, country: "DE", city: "Dresden",
        cluster: "Silicon Saxony", lat: 51.125, lon: 13.705, parts: ["P-PSM"], directed_buy: true,
        lead_time_days: 50, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 10, premium_pct: 12 },
        inputs: { "SiC substrates": { buffer_days: 20 } },
        flows: [{ to: ["S-HAT-INV", "S-NUE-INV"], part: "P-PSM", share_pct: 40, route: "R-REG-EU", transit_days: 1 }]
      },
      {
        id: "S-VIL-PSM", name: "Kärnten SiC Devices GmbH", tier: 2, country: "AT", city: "Villach",
        cluster: "Carinthia power-semiconductor cluster", lat: 46.6, lon: 13.865, parts: ["P-PSM"], directed_buy: true,
        lead_time_days: 50, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 10, premium_pct: 12 },
        inputs: { "SiC substrates": { buffer_days: 20 } },
        flows: [{ to: ["S-HAT-INV", "S-NUE-INV"], part: "P-PSM", share_pct: 20, route: "R-REG-EU", transit_days: 1 }]
      },

      // ---- Microcontrollers (directed buy, tier 2) -------------------------------------------
      {
        id: "S-HSC-MCU", name: "Hsinchu Microcontroller Foundry Corp.", tier: 2, country: "TW", city: "Hsinchu",
        cluster: "Hsinchu Science Park semiconductor cluster", lat: 24.785, lon: 120.995, parts: ["P-MCU"], directed_buy: true,
        lead_time_days: 90, fg_buffer_days: 3, dual_source: false, transport_mode: "air",
        note: "Sole source of the inverter control MCU (Győr chain); 55 % of Leipzig-chain MCU volume.",
        surge: { max_extra_share_pct: 10, lead_days: 7, premium_pct: 6 },
        flows: [
          { to: ["S-REG-ECU", "S-SIB-ECU", "S-FRA-BRK", "S-CZW-BRK"], part: "P-MCU", share_pct: 55, route: "R-AIR-TW-LEJ", transit_days: 4 },
          { to: ["S-HAT-INV", "S-NUE-INV"], part: "P-MCU", share_pct: 100, route: "R-AIR-TW-BUD", transit_days: 4 }
        ]
      },
      {
        id: "S-DRS-MCU", name: "Saxon Logic Devices GmbH", tier: 2, country: "DE", city: "Dresden",
        cluster: "Silicon Saxony", lat: 51.14, lon: 13.735, parts: ["P-MCU"], directed_buy: true,
        lead_time_days: 70, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 10, premium_pct: 10 },
        flows: [{ to: ["S-REG-ECU", "S-SIB-ECU", "S-FRA-BRK", "S-CZW-BRK"], part: "P-MCU", share_pct: 25, route: "R-REG-EU", transit_days: 1 }]
      },
      {
        id: "S-CRO-MCU", name: "Dauphiné Embedded Silicon SAS", tier: 2, country: "FR", city: "Crolles",
        cluster: "Grenoble–Crolles semiconductor cluster", lat: 45.27, lon: 5.88, parts: ["P-MCU"], directed_buy: true,
        lead_time_days: 70, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 10, premium_pct: 10 },
        flows: [{ to: ["S-REG-ECU", "S-SIB-ECU", "S-FRA-BRK", "S-CZW-BRK"], part: "P-MCU", share_pct: 20, route: "R-RD-FR-DE", transit_days: 2 }]
      },

      // ---- ECUs (tier 1) ------------------------------------------------------------------------
      {
        id: "S-REG-ECU", name: "Donau Automotive Electronics GmbH", tier: 1, country: "DE", city: "Regensburg",
        cluster: "Eastern Bavaria automotive-electronics cluster", lat: 49.0, lon: 12.14, parts: ["P-ECU"], directed_buy: false,
        lead_time_days: 14, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 15, lead_days: 7, premium_pct: 9 },
        inputs: { "P-MCU": {}, "Printed circuit boards": { buffer_days: 15 } },
        flows: [{ to: "PL-LEJ", part: "P-ECU", share_pct: 60, route: "R-RD-DE-S", enter_at: "N-REG", transit_days: 1 }]
      },
      {
        id: "S-SIB-ECU", name: "Carpathia Electronics SRL", tier: 1, country: "RO", city: "Sibiu",
        cluster: "Transylvania electronics cluster", lat: 45.79, lon: 24.1, parts: ["P-ECU"], directed_buy: false,
        lead_time_days: 14, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 7, premium_pct: 8 },
        inputs: { "P-MCU": {}, "Printed circuit boards": { buffer_days: 15 } },
        flows: [{ to: "PL-LEJ", part: "P-ECU", share_pct: 40, route: "R-RD-RO-LEJ", transit_days: 3 }]
      },

      // ---- Wiring harnesses (tier 1) ----------------------------------------------------------
      {
        id: "S-TNG-HAR", name: "Tanger Harness Systems SARL", tier: 1, country: "MA", city: "Tangier (Tanger Automotive City)",
        cluster: "Tangier automotive cluster", lat: 35.66, lon: -5.63, parts: ["P-HAR", "P-SEAT"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 0, dual_source: true, transport_mode: "road+ferry",
        note: "Also produces the seat wiring harness for the seat supplier in Mladá Boleslav.",
        surge: { max_extra_share_pct: 10, lead_days: 4, premium_pct: 12 },
        inputs: { "Copper wire": { buffer_days: 10 }, "Connectors & terminals": { buffer_days: 8 } },
        flows: [
          { to: "PL-LEJ", part: "P-HAR", share_pct: 55, route: "R-RD-TNG-LEJ", transit_days: 4 },
          { to: "S-MBO-SEAT", input: "Seat wiring harness", share_pct: 100, route: "R-RD-TNG-LEJ", transit_days: 5, teu_per_day: 3.5 }
        ]
      },
      {
        id: "S-TSR-HAR", name: "Banat Cable Systems SRL", tier: 1, country: "RO", city: "Timișoara",
        cluster: "Western Romania wiring-harness cluster", lat: 45.735, lon: 21.18, parts: ["P-HAR"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 20, lead_days: 5, premium_pct: 14 },
        inputs: { "Copper wire": { buffer_days: 8 }, "Connectors & terminals": { buffer_days: 8 } },
        flows: [{ to: "PL-LEJ", part: "P-HAR", share_pct: 35, route: "R-RD-RO-LEJ", enter_at: "N-ARD", transit_days: 2 }]
      },
      {
        id: "S-SOU-HAR", name: "Sahel Wiring Systems SA", tier: 1, country: "TN", city: "Sousse",
        cluster: "Sousse–Monastir wiring-harness cluster", lat: 35.8, lon: 10.6, parts: ["P-HAR"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 1, dual_source: true, transport_mode: "road+ferry",
        surge: { max_extra_share_pct: 8, lead_days: 4, premium_pct: 12 },
        inputs: { "Connectors & terminals": { buffer_days: 8 } },
        flows: [{ to: "PL-LEJ", part: "P-HAR", share_pct: 10, route: "R-RD-SOU-LEJ", transit_days: 4 }]
      },

      // ---- Inverters (tier 1 to Győr) -----------------------------------------------------------
      {
        id: "S-HAT-INV", name: "Pannonia Power Electronics Kft.", tier: 1, country: "HU", city: "Hatvan",
        cluster: "Hatvan power-electronics cluster", lat: 47.665, lon: 19.67, parts: ["P-INV"], directed_buy: false,
        lead_time_days: 14, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 15, lead_days: 7, premium_pct: 8 },
        inputs: { "P-PSM": {}, "P-MCU": {}, "DC-link capacitors": { buffer_days: 10 } },
        flows: [{ to: "PL-GYR", part: "P-INV", share_pct: 60, route: "R-RD-HU-GYR", transit_days: 1 }]
      },
      {
        id: "S-NUE-INV", name: "Franken Drive Electronics GmbH", tier: 1, country: "DE", city: "Nuremberg",
        cluster: "Nuremberg drive-electronics cluster", lat: 49.43, lon: 11.09, parts: ["P-INV"], directed_buy: false,
        lead_time_days: 14, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 12, lead_days: 7, premium_pct: 9 },
        inputs: { "P-PSM": {}, "P-MCU": {}, "DC-link capacitors": { buffer_days: 10 } },
        flows: [{ to: "PL-GYR", part: "P-INV", share_pct: 40, route: "R-RD-DE-HU", transit_days: 1 }]
      },

      // ---- Magnets (tier 1 to Győr) -------------------------------------------------------------
      {
        id: "S-BAO-MAG", name: "Baotou Rare Earth Magnetics Co., Ltd.", tier: 1, country: "CN", city: "Baotou",
        cluster: "Baotou rare-earth cluster", lat: 40.62, lon: 109.9, parts: ["P-MAG"], directed_buy: false,
        lead_time_days: 30, fg_buffer_days: 5, dual_source: true, transport_mode: "rail",
        surge: { max_extra_share_pct: 15, lead_days: 7, premium_pct: 4 },
        flows: [{ to: "PL-GYR", part: "P-MAG", share_pct: 50, route: "R-RAIL-CN-GYR", transit_days: 19 }]
      },
      {
        id: "S-NGB-MAG", name: "Ningbo Permanent Magnet Co., Ltd.", tier: 1, country: "CN", city: "Ningbo",
        cluster: "Ningbo magnet cluster", lat: 29.86, lon: 121.56, parts: ["P-MAG"], directed_buy: false,
        lead_time_days: 30, fg_buffer_days: 5, dual_source: true, transport_mode: "sea+rail",
        surge: { max_extra_share_pct: 10, lead_days: 7, premium_pct: 4 },
        flows: [{ to: "PL-GYR", part: "P-MAG", share_pct: 30, route: "R-SEA-CN-KOP-GYR", transit_days: 25 }]
      },
      {
        id: "S-NAR-MAG", name: "Narva Rare Earth Magnets OÜ", tier: 1, country: "EE", city: "Narva",
        cluster: "Narva rare-earth magnet plant (EU)", lat: 59.37, lon: 28.2, parts: ["P-MAG"], directed_buy: false,
        lead_time_days: 21, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 14, premium_pct: 10 },
        inputs: { "NdPr oxide": { buffer_days: 30 } },
        flows: [{ to: "PL-GYR", part: "P-MAG", share_pct: 20, route: "R-RD-BALT-GYR", transit_days: 3 }]
      },

      // ---- Castings (tier 1) --------------------------------------------------------------------
      {
        id: "S-BRE-CAST", name: "Val Trompia Fonderie S.p.A.", tier: 1, country: "IT", city: "Brescia",
        cluster: "Brescia die-casting cluster", lat: 45.62, lon: 10.23, parts: ["P-CAST"], directed_buy: false,
        lead_time_days: 21, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 12, lead_days: 7, premium_pct: 9 },
        inputs: { "Aluminium alloy": { buffer_days: 7 } },
        flows: [{ to: "PL-LEJ", part: "P-CAST", share_pct: 40, route: "R-RD-ALP-LEJ", transit_days: 2 }]
      },
      {
        id: "S-SLB-CAST", name: "Štajerska Lightmetal d.o.o.", tier: 1, country: "SI", city: "Slovenska Bistrica",
        cluster: "Styria–Slovenia light-metal cluster", lat: 46.39, lon: 15.575, parts: ["P-CAST"], directed_buy: false,
        lead_time_days: 21, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        note: "Casts the rear megacasting; single-sourced for alloy and heat treatment in its region.",
        surge: { max_extra_share_pct: 8, lead_days: 7, premium_pct: 9 },
        inputs: {
          "Aluminium alloy": { buffer_days: 4, contingency: { description: "Spot alloy ingots from Austrian and Italian smelters", lead_days: 4, max_share_pct: 60, cost_eur_per_day: 26000 } },
          "T6 heat treatment": { buffer_days: 3, contingency: { description: "Subcontract T6 heat treatment to a heat-treater in Upper Austria", lead_days: 3, max_share_pct: 70, cost_eur_per_day: 34000 } }
        },
        flows: [{ to: "PL-LEJ", part: "P-CAST", share_pct: 60, route: "R-RD-SI-LEJ", transit_days: 2 }]
      },

      // ---- Seats (tier 1, single source, JIS) ----------------------------------------------------
      {
        id: "S-MBO-SEAT", name: "Iser Seating Systems s.r.o.", tier: 1, country: "CZ", city: "Mladá Boleslav",
        cluster: "Mladá Boleslav automotive cluster", lat: 50.42, lon: 14.92, parts: ["P-SEAT"], directed_buy: false,
        lead_time_days: 2, fg_buffer_days: 0, dual_source: false, transport_mode: "road (JIS)",
        surge: { max_extra_share_pct: 5, lead_days: 3, premium_pct: 10 },
        inputs: {
          "Seat wiring harness": { buffer_days: 6, contingency: { description: "Re-source the seat harness from the Timișoara harness plant (approved drawing)", lead_days: 6, max_share_pct: 100, cost_eur_per_day: 9000 } },
          "Seat foam & trim": { buffer_days: 4 },
          "Seat mechanisms": { buffer_days: 5 }
        },
        flows: [{ to: "PL-LEJ", part: "P-SEAT", share_pct: 100, route: "R-RD-CZ-LEJ", transit_days: 1 }]
      },

      // ---- Glass (tier 1) -----------------------------------------------------------------------
      {
        id: "S-TEP-GLS", name: "Teplice Float & Auto Glass a.s.", tier: 1, country: "CZ", city: "Teplice",
        cluster: "North Bohemia glass cluster", lat: 50.64, lon: 13.825, parts: ["P-GLS"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 15, lead_days: 5, premium_pct: 7 },
        inputs: { "Float glass": { buffer_days: 6 } },
        flows: [{ to: "PL-LEJ", part: "P-GLS", share_pct: 60, route: "R-RD-CZ-LEJ", enter_at: "N-UST", transit_days: 1 }]
      },
      {
        id: "S-HZR-GLS", name: "Wurmtal Automotive Glazing GmbH", tier: 1, country: "DE", city: "Herzogenrath",
        cluster: "Aachen glass cluster", lat: 50.87, lon: 6.095, parts: ["P-GLS"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 15, lead_days: 5, premium_pct: 7 },
        flows: [{ to: "PL-LEJ", part: "P-GLS", share_pct: 40, route: "R-RD-DE-W", transit_days: 1 }]
      },

      // ---- Tyres (tier 1) -----------------------------------------------------------------------
      {
        id: "S-RAC-TYR", name: "Duna Tyre Manufacturing Kft.", tier: 1, country: "HU", city: "Rácalmás",
        cluster: "Dunaújváros tyre cluster", lat: 47.025, lon: 18.94, parts: ["P-TYR"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 15, lead_days: 5, premium_pct: 5 },
        inputs: { "Synthetic rubber": { buffer_days: 10 } },
        flows: [{ to: "PL-LEJ", part: "P-TYR", share_pct: 40, route: "R-RD-CE-LEJ", enter_at: "N-BDP", transit_days: 2 }]
      },
      {
        id: "S-KAR-TYR", name: "Oberrhein Reifenwerke GmbH", tier: 1, country: "DE", city: "Karlsruhe",
        cluster: "Upper Rhine tyre & rubber cluster", lat: 49.02, lon: 8.37, parts: ["P-TYR"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 5, premium_pct: 5 },
        inputs: { "Natural rubber": { buffer_days: 12 }, "Synthetic rubber": { buffer_days: 10 } },
        flows: [{ to: "PL-LEJ", part: "P-TYR", share_pct: 35, route: "R-RD-DE-W", enter_at: "N-GIE", transit_days: 1 }]
      },
      {
        id: "S-RAY-TYR", name: "Rayong Radial Tyre Co., Ltd.", tier: 1, country: "TH", city: "Rayong",
        cluster: "Eastern Seaboard tyre cluster", lat: 12.7, lon: 101.15, parts: ["P-TYR"], directed_buy: false,
        lead_time_days: 35, fg_buffer_days: 3, dual_source: true, transport_mode: "sea+rail",
        surge: { max_extra_share_pct: 10, lead_days: 5, premium_pct: 3 },
        flows: [{ to: "PL-LEJ", part: "P-TYR", share_pct: 25, route: "R-SEA-TH-RTM-LEJ", transit_days: 26 }]
      },

      // ---- Brakes (tier 1) ----------------------------------------------------------------------
      {
        id: "S-FRA-BRK", name: "Rhein-Main Bremsensysteme GmbH", tier: 1, country: "DE", city: "Frankfurt am Main",
        cluster: "Rhine-Main brake-systems cluster", lat: 50.125, lon: 8.61, parts: ["P-BRK"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 7, premium_pct: 8 },
        inputs: {
          "P-MCU": {},
          "Caliper castings": { buffer_days: 9, contingency: { description: "Caliper castings from an approved Czech foundry", lead_days: 7, max_share_pct: 50, cost_eur_per_day: 18000 } },
          "Forged wheel hubs": { buffer_days: 8, contingency: { description: "Forged hubs from a Czech forging shop", lead_days: 6, max_share_pct: 50, cost_eur_per_day: 12000 } }
        },
        flows: [{ to: "PL-LEJ", part: "P-BRK", share_pct: 55, route: "R-RD-DE-W", enter_at: "N-GIE", transit_days: 1 }]
      },
      {
        id: "S-CZW-BRK", name: "Częstochowa Brake Technology Sp. z o.o.", tier: 1, country: "PL", city: "Częstochowa",
        cluster: "Silesia brake & chassis cluster", lat: 50.81, lon: 19.12, parts: ["P-BRK"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 15, lead_days: 7, premium_pct: 7 },
        inputs: {
          "P-MCU": {},
          "Forged wheel hubs": { buffer_days: 8, contingency: { description: "Forged hubs from a Czech forging shop", lead_days: 6, max_share_pct: 50, cost_eur_per_day: 10000 } }
        },
        flows: [{ to: "PL-LEJ", part: "P-BRK", share_pct: 45, route: "R-RD-PL-LEJ", enter_at: "N-KTW", transit_days: 1 }]
      },

      // ---- Displays (tier 1) --------------------------------------------------------------------
      {
        id: "S-TNN-DSP", name: "Tainan Display Technologies Corp.", tier: 1, country: "TW", city: "Tainan",
        cluster: "Southern Taiwan Science Park display cluster", lat: 23.11, lon: 120.27, parts: ["P-DSP"], directed_buy: false,
        lead_time_days: 21, fg_buffer_days: 3, dual_source: true, transport_mode: "sea+rail",
        surge: { max_extra_share_pct: 15, lead_days: 5, premium_pct: 5 },
        inputs: { "Display driver ICs": { buffer_days: 20 } },
        flows: [{ to: "PL-LEJ", part: "P-DSP", share_pct: 60, route: "R-SEA-TW-RTM-LEJ", transit_days: 28 }]
      },
      {
        id: "S-HFE-DSP", name: "Hefei Optoelectronics Co., Ltd.", tier: 1, country: "CN", city: "Hefei",
        cluster: "Hefei display cluster", lat: 31.88, lon: 117.38, parts: ["P-DSP"], directed_buy: false,
        lead_time_days: 21, fg_buffer_days: 3, dual_source: true, transport_mode: "rail",
        surge: { max_extra_share_pct: 15, lead_days: 7, premium_pct: 6 },
        inputs: { "Display driver ICs": { buffer_days: 25 } },
        flows: [{ to: "PL-LEJ", part: "P-DSP", share_pct: 25, route: "R-RAIL-CN-LEJ", transit_days: 18 }]
      },
      {
        id: "S-WTZ-DSP", name: "Lahn Display Modules GmbH", tier: 1, country: "DE", city: "Wetzlar",
        cluster: "Lahn–Dill optics cluster", lat: 50.56, lon: 8.5, parts: ["P-DSP"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        surge: { max_extra_share_pct: 10, lead_days: 5, premium_pct: 12 },
        inputs: { "Display driver ICs": { buffer_days: 15 } },
        flows: [{ to: "PL-LEJ", part: "P-DSP", share_pct: 15, route: "R-RD-DE-W", enter_at: "N-GIE", transit_days: 1 }]
      },

      // ---- Tier-2 / tier-3 suppliers --------------------------------------------------------------
      {
        id: "S-DGO-SEP", name: "Silesia Separator Films Sp. z o.o.", tier: 2, country: "PL", city: "Dąbrowa Górnicza",
        cluster: "Silesia battery-materials cluster", lat: 50.33, lon: 19.23, parts: ["P-CELL"], directed_buy: false,
        lead_time_days: 20, fg_buffer_days: 3, dual_source: false, transport_mode: "road",
        flows: [{ to: ["S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], input: "Separator film", share_pct: 100, route: "R-REG-EU", transit_days: 2, teu_per_day: 0.8 }]
      },
      {
        id: "S-ULQ-ANO", name: "Ulanqab Graphite Anode Materials Co., Ltd.", tier: 2, country: "CN", city: "Ulanqab",
        cluster: "Inner Mongolia graphite cluster", lat: 41.0, lon: 113.13, parts: ["P-CELL"], directed_buy: false,
        lead_time_days: 40, fg_buffer_days: 5, dual_source: true, transport_mode: "rail",
        flows: [{ to: ["S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], input: "Graphite anode", share_pct: 60, route: "R-RAIL-CN-CE", transit_days: 19, teu_per_day: 3 }]
      },
      {
        id: "S-LUD-ELY", name: "Rhein-Neckar Elektrolyt GmbH", tier: 2, country: "DE", city: "Ludwigshafen",
        cluster: "Ludwigshafen chemical park", lat: 49.51, lon: 8.43, parts: ["P-CELL"], directed_buy: false,
        lead_time_days: 14, fg_buffer_days: 1, dual_source: false, transport_mode: "road (ISO tank)",
        note: "Single source of electrolyte for all three cell suppliers.",
        inputs: { "Carbonate solvents": { buffer_days: 3 } },
        flows: [{ to: ["S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], input: "Electrolyte", share_pct: 100, route: "R-REG-EU", transit_days: 2, teu_per_day: 6 }]
      },
      {
        id: "S-BOT-SOL", name: "Botlek Solvents B.V.", tier: 3, country: "NL", city: "Rotterdam (Botlek)",
        cluster: "Rotterdam-Botlek chemical cluster", lat: 51.88, lon: 4.31, parts: ["P-CELL"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 2, dual_source: false, transport_mode: "Rhine tank barge",
        flows: [{ to: "S-LUD-ELY", input: "Carbonate solvents", share_pct: 100, route: "R-BARGE-BOT-LUH", transit_days: 5, teu_per_day: 18 }]
      },
      {
        id: "S-HET-CU", name: "Mansfelder Kupferdraht GmbH", tier: 2, country: "DE", city: "Hettstedt",
        cluster: "Mansfeld copper region", lat: 51.65, lon: 11.51, parts: ["P-HAR"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        flows: [
          { to: "S-TSR-HAR", input: "Copper wire", share_pct: 60, route: "R-REG-EU", transit_days: 2, teu_per_day: 2 },
          { to: "S-TNG-HAR", input: "Copper wire", share_pct: 40, route: "R-RD-TNG-LEJ", direction: "reverse", transit_days: 4, teu_per_day: 1.5 }
        ]
      },
      {
        id: "S-BEN-CON", name: "Bergstraße Steckverbinder GmbH", tier: 2, country: "DE", city: "Bensheim",
        cluster: "Bergstraße connector cluster", lat: 49.68, lon: 8.62, parts: ["P-HAR"], directed_buy: false,
        lead_time_days: 21, fg_buffer_days: 5, dual_source: true, transport_mode: "road",
        flows: [
          { to: "S-TNG-HAR", input: "Connectors & terminals", share_pct: 60, route: "R-RD-TNG-LEJ", direction: "reverse", transit_days: 4, teu_per_day: 0.5 },
          { to: "S-TSR-HAR", input: "Connectors & terminals", share_pct: 100, route: "R-REG-EU", transit_days: 2, teu_per_day: 0.5 },
          { to: "S-SOU-HAR", input: "Connectors & terminals", share_pct: 100, route: "R-RD-SOU-LEJ", direction: "reverse", transit_days: 4, teu_per_day: 0.2 }
        ]
      },
      {
        id: "S-KEN-TRM", name: "Kénitra Terminals SARL", tier: 2, country: "MA", city: "Kénitra",
        cluster: "Kénitra Atlantic Free Zone", lat: 34.25, lon: -6.54, parts: ["P-HAR"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        flows: [{ to: "S-TNG-HAR", input: "Connectors & terminals", share_pct: 40, route: "R-REG-MA", transit_days: 1, teu_per_day: 0.3 }]
      },
      {
        id: "S-TAO-PCB", name: "Taoyuan Circuit Boards Co., Ltd.", tier: 2, country: "TW", city: "Taoyuan",
        cluster: "Taoyuan PCB cluster", lat: 25.03, lon: 121.13, parts: ["P-ECU"], directed_buy: false,
        lead_time_days: 21, fg_buffer_days: 3, dual_source: true, transport_mode: "air",
        flows: [{ to: ["S-REG-ECU", "S-SIB-ECU"], input: "Printed circuit boards", share_pct: 70, route: "R-AIR-TW-LEJ", transit_days: 4, teu_per_day: 0.2 }]
      },
      {
        id: "S-KID-ALY", name: "Drava Alloy Refining d.o.o.", tier: 2, country: "SI", city: "Kidričevo",
        cluster: "Drava valley aluminium cluster", lat: 46.405, lon: 15.795, parts: ["P-CAST"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 2, dual_source: false, transport_mode: "road",
        flows: [
          { to: "S-SLB-CAST", input: "Aluminium alloy", share_pct: 100, route: "R-REG-EU", transit_days: 1, teu_per_day: 6 },
          { to: "S-BRE-CAST", input: "Aluminium alloy", share_pct: 20, route: "R-REG-EU", transit_days: 2, teu_per_day: 2 }
        ]
      },
      {
        id: "S-LEO-HTR", name: "Mur Heat Treatment GmbH", tier: 2, country: "AT", city: "Leoben",
        cluster: "Upper Styria metalworking cluster", lat: 47.38, lon: 15.095, parts: ["P-CAST"], directed_buy: false,
        lead_time_days: 3, fg_buffer_days: 0, dual_source: false, transport_mode: "road",
        flows: [{ to: "S-SLB-CAST", input: "T6 heat treatment", share_pct: 100, route: "R-REG-EU", transit_days: 1, teu_per_day: 4 }]
      },
      {
        id: "S-RAV-FRG", name: "Koroška Precision Forging d.o.o.", tier: 2, country: "SI", city: "Ravne na Koroškem",
        cluster: "Koroška steel & forging cluster", lat: 46.545, lon: 14.965, parts: ["P-BRK"], directed_buy: false,
        lead_time_days: 14, fg_buffer_days: 1, dual_source: true, transport_mode: "road",
        flows: [{ to: ["S-FRA-BRK", "S-CZW-BRK"], input: "Forged wheel hubs", share_pct: 40, route: "R-REG-EU", transit_days: 2, teu_per_day: 1 }]
      },
      {
        id: "S-BRE-ALY", name: "Lombardia Leghe Leggere S.r.l.", tier: 2, country: "IT", city: "Brescia",
        cluster: "Brescia secondary-aluminium cluster", lat: 45.51, lon: 10.2, parts: ["P-CAST"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 2, dual_source: true, transport_mode: "road",
        flows: [{ to: "S-BRE-CAST", input: "Aluminium alloy", share_pct: 80, route: "R-REG-EU", transit_days: 1, teu_per_day: 5 }]
      },
      {
        id: "S-LIB-FOA", name: "Liberec Foam & Trim s.r.o.", tier: 2, country: "CZ", city: "Liberec",
        cluster: "Liberec automotive-textiles cluster", lat: 50.77, lon: 15.06, parts: ["P-SEAT"], directed_buy: false,
        lead_time_days: 5, fg_buffer_days: 1, dual_source: false, transport_mode: "road",
        flows: [{ to: "S-MBO-SEAT", input: "Seat foam & trim", share_pct: 100, route: "R-REG-EU", transit_days: 1, teu_per_day: 4 }]
      },
      {
        id: "S-UST-MEC", name: "Labe Seat Mechanisms a.s.", tier: 2, country: "CZ", city: "Ústí nad Labem",
        cluster: "Ústí engineering cluster", lat: 50.66, lon: 14.04, parts: ["P-SEAT"], directed_buy: false,
        lead_time_days: 7, fg_buffer_days: 2, dual_source: false, transport_mode: "road",
        flows: [{ to: "S-MBO-SEAT", input: "Seat mechanisms", share_pct: 100, route: "R-REG-EU", transit_days: 1, teu_per_day: 2 }]
      },
      {
        id: "S-SGK-NR", name: "Songkhla Natural Rubber Co., Ltd.", tier: 2, country: "TH", city: "Songkhla",
        cluster: "Southern Thailand natural-rubber belt", lat: 7.05, lon: 100.48, parts: ["P-TYR"], directed_buy: false,
        lead_time_days: 40, fg_buffer_days: 5, dual_source: false, transport_mode: "sea+barge",
        flows: [{ to: "S-KAR-TYR", input: "Natural rubber", share_pct: 100, route: "R-SEA-TH-RHINE-KAR", transit_days: 29, teu_per_day: 2 }]
      },
      {
        id: "S-SKO-SR", name: "Saale Synthesekautschuk GmbH", tier: 2, country: "DE", city: "Schkopau",
        cluster: "Central German chemical triangle", lat: 51.39, lon: 11.96, parts: ["P-TYR"], directed_buy: false,
        lead_time_days: 10, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        flows: [{ to: ["S-RAC-TYR", "S-KAR-TYR"], input: "Synthetic rubber", share_pct: 50, route: "R-REG-EU", transit_days: 2, teu_per_day: 1.5 }]
      },
      {
        id: "S-COI-CAL", name: "Coimbatore Precision Castings Pvt. Ltd.", tier: 2, country: "IN", city: "Coimbatore",
        cluster: "Coimbatore foundry cluster", lat: 11.02, lon: 76.96, parts: ["P-BRK"], directed_buy: false,
        lead_time_days: 45, fg_buffer_days: 3, dual_source: true, transport_mode: "sea+barge",
        flows: [{ to: "S-FRA-BRK", input: "Caliper castings", share_pct: 60, route: "R-SEA-IN-RHINE-FRA", transit_days: 23, teu_per_day: 0.5 }]
      },
      {
        id: "S-KUA-REE", name: "Kuantan Rare Earth Processing Sdn. Bhd.", tier: 2, country: "MY", city: "Kuantan (Gebeng)",
        cluster: "Gebeng industrial estate", lat: 3.97, lon: 103.38, parts: ["P-MAG"], directed_buy: false,
        lead_time_days: 45, fg_buffer_days: 5, dual_source: false, transport_mode: "sea",
        flows: [{ to: "S-NAR-MAG", input: "NdPr oxide", share_pct: 70, route: "R-SEA-MY-RTM-MUG", transit_days: 27, teu_per_day: 0.1 }]
      },
      {
        id: "S-ERL-SUB", name: "Erlangen Crystal Substrates GmbH", tier: 2, country: "DE", city: "Erlangen",
        cluster: "Erlangen–Nuremberg SiC materials cluster", lat: 49.59, lon: 11.0, parts: ["P-PSM"], directed_buy: false,
        lead_time_days: 30, fg_buffer_days: 5, dual_source: true, transport_mode: "road",
        flows: [{ to: ["S-DRS-PSM", "S-VIL-PSM"], input: "SiC substrates", share_pct: 60, route: "R-REG-EU", transit_days: 1, teu_per_day: 0.05 }]
      },
      {
        id: "S-DUC-FLT", name: "Bohemia Float Glass s.r.o.", tier: 2, country: "CZ", city: "Duchcov",
        cluster: "North Bohemia glass cluster", lat: 50.6, lon: 13.745, parts: ["P-GLS"], directed_buy: false,
        lead_time_days: 5, fg_buffer_days: 3, dual_source: true, transport_mode: "road",
        flows: [{ to: "S-TEP-GLS", input: "Float glass", share_pct: 80, route: "R-REG-EU", transit_days: 1, teu_per_day: 8 }]
      },
      {
        id: "S-ZHB-DDI", name: "Zhubei Display Driver Semiconductor Corp.", tier: 2, country: "TW", city: "Zhubei (Hsinchu County)",
        cluster: "Hsinchu County IC-design & back-end cluster", lat: 24.83, lon: 121.01, parts: ["P-DSP"], directed_buy: false,
        lead_time_days: 30, fg_buffer_days: 3, dual_source: true, transport_mode: "road/air",
        flows: [
          { to: "S-TNN-DSP", input: "Display driver ICs", share_pct: 70, route: "R-REG-TW", transit_days: 1, teu_per_day: 0.02 },
          { to: "S-HFE-DSP", input: "Display driver ICs", share_pct: 60, route: "R-REG-ASIA", transit_days: 3, teu_per_day: 0.01 },
          { to: "S-WTZ-DSP", input: "Display driver ICs", share_pct: 70, route: "R-AIR-TW-LEJ", transit_days: 4, teu_per_day: 0.01 }
        ]
      },
      {
        id: "S-MOS-CAP", name: "Pannon Capacitor Kft.", tier: 2, country: "HU", city: "Mosonmagyaróvár",
        cluster: "Western Hungary electronics cluster", lat: 47.87, lon: 17.27, parts: ["P-INV"], directed_buy: false,
        lead_time_days: 14, fg_buffer_days: 3, dual_source: false, transport_mode: "road",
        flows: [{ to: ["S-HAT-INV", "S-NUE-INV"], input: "DC-link capacitors", share_pct: 100, route: "R-REG-EU", transit_days: 1, teu_per_day: 0.3 }]
      }
    ],

    // -------------------------------------------------------------------------------------------
    // Qualified alternative sources (not active today). plant = the plant chain they can serve.
    // -------------------------------------------------------------------------------------------
    alternatives: [
      { id: "A-SZG-CELL", name: "Leine Cell Manufacturing GmbH", country: "DE", city: "Salzgitter", lat: 52.15, lon: 10.33, part: "P-CELL", plant: "PL-LEJ", qualification_days: 120, qualification_cost_eur: 2500000, cost_premium_pct: 8, max_share_pct: 30, transit_days: 1, route: "R-REG-EU", note: "New European gigafactory; cell format requalification needed." },
      { id: "A-CZX-CELL", name: "Changzhou Prismatic Power Co., Ltd.", country: "CN", city: "Changzhou", lat: 31.78, lon: 119.95, part: "P-CELL", plant: "PL-LEJ", qualification_days: 75, qualification_cost_eur: 1200000, cost_premium_pct: 3, max_share_pct: 40, transit_days: 33, route: "R-SEA-CN-HAM-CE", note: "Same chemistry as a current supplier's sister plant; long sea pipeline." },
      { id: "A-NYS-CAM", name: "Nysa Cathode Materials Sp. z o.o.", country: "PL", city: "Nysa", lat: 50.47, lon: 17.33, part: "P-CAM", plant: "PL-LEJ", qualification_days: 90, qualification_cost_eur: 900000, cost_premium_pct: 6, max_share_pct: 35, transit_days: 1, route: "R-REG-EU", note: "European CAM plant." },
      { id: "A-SWZ-CAM", name: "Lausitz Battery Materials GmbH", country: "DE", city: "Schwarzheide", lat: 51.48, lon: 13.88, part: "P-CAM", plant: "PL-LEJ", qualification_days: 75, qualification_cost_eur: 850000, cost_premium_pct: 9, max_share_pct: 30, transit_days: 1, route: "R-REG-EU", note: "European CAM plant." },
      { id: "A-CTA-PSM", name: "Etna SiC Microsystems S.r.l.", country: "IT", city: "Catania", lat: 37.45, lon: 15.06, part: "P-PSM", plant: "PL-GYR", qualification_days: 60, qualification_cost_eur: 650000, cost_premium_pct: 12, max_share_pct: 30, transit_days: 3, route: "R-REG-EU", note: "SiC module qualification incl. inverter validation." },
      { id: "A-KUL-PSM", name: "Kedah Power Devices Sdn. Bhd.", country: "MY", city: "Kulim", lat: 5.4, lon: 100.56, part: "P-PSM", plant: "PL-GYR", qualification_days: 75, qualification_cost_eur: 600000, cost_premium_pct: 6, max_share_pct: 35, transit_days: 5, route: "R-REG-ASIA", note: "SiC fab in Malaysia; air freight." },
      { id: "A-NIJ-MCU", name: "Waal Microcontrollers B.V.", country: "NL", city: "Nijmegen", lat: 51.84, lon: 5.86, part: "P-MCU", plant: "PL-GYR", qualification_days: 21, qualification_cost_eur: 320000, cost_premium_pct: 8, max_share_pct: 60, transit_days: 1, route: "R-REG-EU", note: "Pin-compatible inverter MCU variant already approved in a sister programme; needs inverter firmware re-validation (fast-track 3 weeks)." },
      { id: "A-KMM-MCU", name: "Kumamoto Semiconductor Manufacturing Co.", country: "JP", city: "Kikuyo (Kumamoto)", lat: 32.88, lon: 130.83, part: "P-MCU", plant: "PL-LEJ", qualification_days: 90, qualification_cost_eur: 400000, cost_premium_pct: 5, max_share_pct: 40, transit_days: 4, route: "R-REG-ASIA", note: "Foundry second source for ECU/brake MCUs." },
      { id: "A-BRN-ECU", name: "Brno Embedded Systems s.r.o.", country: "CZ", city: "Brno", lat: 49.2, lon: 16.61, part: "P-ECU", plant: "PL-LEJ", qualification_days: 60, qualification_cost_eur: 450000, cost_premium_pct: 9, max_share_pct: 35, transit_days: 1, route: "R-REG-EU", note: "EMS provider with automotive approval." },
      { id: "A-PEN-ECU", name: "Penang EMS Sdn. Bhd.", country: "MY", city: "Penang", lat: 5.36, lon: 100.3, part: "P-ECU", plant: "PL-LEJ", qualification_days: 90, qualification_cost_eur: 380000, cost_premium_pct: 4, max_share_pct: 50, transit_days: 5, route: "R-REG-ASIA", note: "Air freight required." },
      { id: "A-KEN-HAR", name: "Atlantic Wiring Kénitra SARL", country: "MA", city: "Kénitra", lat: 34.26, lon: -6.58, part: "P-HAR", plant: "PL-LEJ", qualification_days: 14, qualification_cost_eur: 180000, cost_premium_pct: 7, max_share_pct: 40, transit_days: 4, route: "R-RD-TNG-LEJ", note: "Sister plant of the Tangier supplier; tooling and test boards can be transferred." },
      { id: "A-BIS-HAR", name: "Someș Harness SRL", country: "RO", city: "Bistrița", lat: 47.13, lon: 24.5, part: "P-HAR", plant: "PL-LEJ", qualification_days: 35, qualification_cost_eur: 240000, cost_premium_pct: 5, max_share_pct: 30, transit_days: 3, route: "R-RD-RO-LEJ", note: "Spare capacity; new tooling required." },
      { id: "A-GLW-INV", name: "Silesia Inverter Systems Sp. z o.o.", country: "PL", city: "Gliwice", lat: 50.29, lon: 18.67, part: "P-INV", plant: "PL-GYR", qualification_days: 75, qualification_cost_eur: 800000, cost_premium_pct: 10, max_share_pct: 35, transit_days: 1, route: "R-REG-EU", note: "Full inverter validation required." },
      { id: "A-HAN-MAG", name: "Main-Kinzig Magnetics GmbH", country: "DE", city: "Hanau", lat: 50.13, lon: 8.92, part: "P-MAG", plant: "PL-GYR", qualification_days: 90, qualification_cost_eur: 350000, cost_premium_pct: 18, max_share_pct: 30, transit_days: 1, route: "R-REG-EU", note: "European magnet maker." },
      { id: "A-ECH-MAG", name: "Echizen Magnet Works Co., Ltd.", country: "JP", city: "Echizen", lat: 35.9, lon: 136.17, part: "P-MAG", plant: "PL-GYR", qualification_days: 60, qualification_cost_eur: 300000, cost_premium_pct: 12, max_share_pct: 40, transit_days: 6, route: "R-REG-ASIA", note: "Air freight." },
      { id: "A-GRL-CAST", name: "Lausitz Druckguss GmbH", country: "DE", city: "Görlitz", lat: 51.15, lon: 14.99, part: "P-CAST", plant: "PL-LEJ", qualification_days: 70, qualification_cost_eur: 1200000, cost_premium_pct: 15, max_share_pct: 30, transit_days: 1, route: "R-REG-EU", note: "Large die-casting cell; die transfer needed." },
      { id: "A-OST-CAST", name: "Moravia Light Metal a.s.", country: "CZ", city: "Ostrava", lat: 49.82, lon: 18.26, part: "P-CAST", plant: "PL-LEJ", qualification_days: 45, qualification_cost_eur: 600000, cost_premium_pct: 11, max_share_pct: 25, transit_days: 1, route: "R-REG-EU", note: "Shock-tower castings only." },
      { id: "A-ZWI-SEAT", name: "Westsachsen Sitzsysteme GmbH", country: "DE", city: "Zwickau", lat: 50.72, lon: 12.49, part: "P-SEAT", plant: "PL-LEJ", qualification_days: 30, qualification_cost_eur: 400000, cost_premium_pct: 11, max_share_pct: 50, transit_days: 1, route: "R-REG-EU", note: "JIS seat assembly; trim sets from current tier-2s." },
      { id: "A-ORO-GLS", name: "Orosháza Auto Glass Zrt.", country: "HU", city: "Orosháza", lat: 46.57, lon: 20.67, part: "P-GLS", plant: "PL-LEJ", qualification_days: 45, qualification_cost_eur: 250000, cost_premium_pct: 6, max_share_pct: 40, transit_days: 2, route: "R-RD-CE-LEJ", note: "Float + laminating line." },
      { id: "A-KRA-TYR", name: "Gorenjska Tyre Works d.o.o.", country: "SI", city: "Kranj", lat: 46.24, lon: 14.36, part: "P-TYR", plant: "PL-LEJ", qualification_days: 30, qualification_cost_eur: 150000, cost_premium_pct: 5, max_share_pct: 35, transit_days: 2, route: "R-RD-SI-LEJ", note: "OE homologation of tyre size required." },
      { id: "A-POZ-TYR", name: "Wielkopolska Opony Sp. z o.o.", country: "PL", city: "Poznań", lat: 52.41, lon: 16.93, part: "P-TYR", plant: "PL-LEJ", qualification_days: 30, qualification_cost_eur: 150000, cost_premium_pct: 4, max_share_pct: 35, transit_days: 1, route: "R-RD-PL-LEJ", note: "OE homologation of tyre size required." },
      { id: "A-JIH-BRK", name: "Vysočina Brake Components s.r.o.", country: "CZ", city: "Jihlava", lat: 49.4, lon: 15.59, part: "P-BRK", plant: "PL-LEJ", qualification_days: 60, qualification_cost_eur: 500000, cost_premium_pct: 7, max_share_pct: 40, transit_days: 1, route: "R-REG-EU", note: "Brake-by-wire software release needed." },
      { id: "A-HWS-DSP", name: "Hwaseong Display Co., Ltd.", country: "KR", city: "Hwaseong", lat: 37.2, lon: 126.83, part: "P-DSP", plant: "PL-LEJ", qualification_days: 60, qualification_cost_eur: 300000, cost_premium_pct: 5, max_share_pct: 40, transit_days: 5, route: "R-REG-ASIA", note: "Air freight." },
      { id: "A-BAB-DSP", name: "Babenhausen Cockpit Electronics GmbH", country: "DE", city: "Babenhausen", lat: 49.96, lon: 8.95, part: "P-DSP", plant: "PL-LEJ", qualification_days: 45, qualification_cost_eur: 380000, cost_premium_pct: 14, max_share_pct: 30, transit_days: 1, route: "R-RD-DE-W", note: "Display module assembly in Germany." },
      { id: "A-SWF-EDU", name: "Mainfranken E-Axle GmbH", country: "DE", city: "Schweinfurt", lat: 50.05, lon: 10.23, part: "P-EDU", plant: "PL-LEJ", qualification_days: 150, qualification_cost_eur: 3500000, cost_premium_pct: 22, max_share_pct: 25, transit_days: 1, route: "R-REG-EU", note: "External e-axle; vehicle homologation impact." }
    ],

    // -------------------------------------------------------------------------------------------
    // Open purchase orders in transit (46). position.leg = index into route.legs, progress 0..1.
    // -------------------------------------------------------------------------------------------
    purchase_orders: [
      { id: "4500-118301", supplier: "S-POH-CAM", to: "S-WRO-CELL", part: "P-CAM", item: "Cathode active material NMC 811", qty: 120000, unit: "kg", value_eur: 2280000, route: "R-SEA-KR-RTM-CE", shipped_offset_days: -24, eta_offset_days: 9, position: { leg: 3, progress: 0.6 }, status: "in_transit", where: "Mediterranean, south of Sicily" },
      { id: "4500-118344", supplier: "S-POH-CAM", to: "S-DEB-CELL", part: "P-CAM", item: "Cathode active material NMC 811", qty: 96000, unit: "kg", value_eur: 1824000, route: "R-SEA-KR-RTM-CE", shipped_offset_days: -12, eta_offset_days: 21, position: { leg: 1, progress: 0.45 }, status: "in_transit", where: "Indian Ocean, south of Sri Lanka" },
      { id: "4500-118390", supplier: "S-POH-CAM", to: "S-GOD-CELL", part: "P-CAM", item: "Cathode active material NMC 811", qty: 60000, unit: "kg", value_eur: 1140000, route: "R-SEA-KR-RTM-CE", shipped_offset_days: -3, eta_offset_days: 30, position: { leg: 0, progress: 0.3 }, status: "in_transit", where: "East China Sea" },
      { id: "4500-118412", supplier: "S-POH-CAM", to: "S-WRO-CELL", part: "P-CAM", item: "Cathode active material NMC 811", qty: 120000, unit: "kg", value_eur: 2280000, route: "R-SEA-KR-RTM-CE", shipped_offset_days: -30, eta_offset_days: 3, position: { leg: 5, progress: 0.05 }, status: "at_port", where: "Rotterdam Maasvlakte, awaiting rail loading" },
      { id: "4500-118455", supplier: "S-NGB-CAM", to: "S-DEB-CELL", part: "P-CAM", item: "Cathode active material NMC 811", qty: 80000, unit: "kg", value_eur: 1520000, route: "R-SEA-CN-HAM-CE", shipped_offset_days: -20, eta_offset_days: 12, position: { leg: 2, progress: 0.5 }, status: "in_transit", where: "Red Sea" },
      { id: "4500-118470", supplier: "S-NGB-CAM", to: "S-WRO-CELL", part: "P-CAM", item: "Cathode active material NMC 811", qty: 72000, unit: "kg", value_eur: 1368000, route: "R-SEA-CN-HAM-CE", shipped_offset_days: -8, eta_offset_days: 24, position: { leg: 1, progress: 0.15 }, status: "in_transit", where: "Strait of Malacca" },
      { id: "4500-118502", supplier: "S-TNN-DSP", to: "PL-LEJ", part: "P-DSP", item: "Display sets (centre + cluster)", qty: 5100, unit: "sets", value_eur: 2142000, route: "R-SEA-TW-RTM-LEJ", shipped_offset_days: -25, eta_offset_days: 3, position: { leg: 4, progress: 0.85 }, status: "in_transit", where: "English Channel" },
      { id: "4500-118519", supplier: "S-TNN-DSP", to: "PL-LEJ", part: "P-DSP", item: "Display sets (centre + cluster)", qty: 5100, unit: "sets", value_eur: 2142000, route: "R-SEA-TW-RTM-LEJ", shipped_offset_days: -18, eta_offset_days: 10, position: { leg: 3, progress: 0.3 }, status: "in_transit", where: "Eastern Mediterranean" },
      { id: "4500-118533", supplier: "S-TNN-DSP", to: "PL-LEJ", part: "P-DSP", item: "Display sets (centre + cluster)", qty: 5100, unit: "sets", value_eur: 2142000, route: "R-SEA-TW-RTM-LEJ", shipped_offset_days: -11, eta_offset_days: 17, position: { leg: 1, progress: 0.65 }, status: "in_transit", where: "Arabian Sea" },
      { id: "4500-118548", supplier: "S-TNN-DSP", to: "PL-LEJ", part: "P-DSP", item: "Display sets (centre + cluster)", qty: 5100, unit: "sets", value_eur: 2142000, route: "R-SEA-TW-RTM-LEJ", shipped_offset_days: -4, eta_offset_days: 24, position: { leg: 0, progress: 0.7 }, status: "in_transit", where: "South China Sea" },
      { id: "4500-118561", supplier: "S-RAY-TYR", to: "PL-LEJ", part: "P-TYR", item: "Tyres 235/45 R20 (OE)", qty: 6800, unit: "tyres", value_eur: 625600, route: "R-SEA-TH-RTM-LEJ", shipped_offset_days: -22, eta_offset_days: 4, position: { leg: 4, progress: 0.5 }, status: "in_transit", where: "Bay of Biscay" },
      { id: "4500-118577", supplier: "S-RAY-TYR", to: "PL-LEJ", part: "P-TYR", item: "Tyres 235/45 R20 (OE)", qty: 6800, unit: "tyres", value_eur: 625600, route: "R-SEA-TH-RTM-LEJ", shipped_offset_days: -13, eta_offset_days: 13, position: { leg: 2, progress: 0.7 }, status: "in_transit", where: "Northern Red Sea" },
      { id: "4500-118590", supplier: "S-RAY-TYR", to: "PL-LEJ", part: "P-TYR", item: "Tyres 235/45 R20 (OE)", qty: 6800, unit: "tyres", value_eur: 625600, route: "R-SEA-TH-RTM-LEJ", shipped_offset_days: -5, eta_offset_days: 21, position: { leg: 1, progress: 0.2 }, status: "in_transit", where: "Andaman Sea" },
      { id: "4500-118604", supplier: "S-SGK-NR", to: "S-KAR-TYR", part: null, item: "Natural rubber (TSR 20)", qty: 400, unit: "t", value_eur: 660000, route: "R-SEA-TH-RHINE-KAR", shipped_offset_days: -27, eta_offset_days: 2, position: { leg: 6, progress: 0.55 }, status: "in_transit", where: "Rhine barge between Koblenz and Kaub" },
      { id: "4500-118618", supplier: "S-SGK-NR", to: "S-KAR-TYR", part: null, item: "Natural rubber (TSR 20)", qty: 400, unit: "t", value_eur: 660000, route: "R-SEA-TH-RHINE-KAR", shipped_offset_days: -20, eta_offset_days: 9, position: { leg: 3, progress: 0.6 }, status: "in_transit", where: "Central Mediterranean" },
      { id: "4500-118633", supplier: "S-SGK-NR", to: "S-KAR-TYR", part: null, item: "Natural rubber (TSR 20)", qty: 400, unit: "t", value_eur: 660000, route: "R-SEA-TH-RHINE-KAR", shipped_offset_days: -9, eta_offset_days: 20, position: { leg: 1, progress: 0.5 }, status: "in_transit", where: "Indian Ocean" },
      { id: "4500-118647", supplier: "S-COI-CAL", to: "S-FRA-BRK", part: null, item: "Brake caliper castings", qty: 18000, unit: "pcs", value_eur: 684000, route: "R-SEA-IN-RHINE-FRA", shipped_offset_days: -19, eta_offset_days: 4, position: { leg: 4, progress: 0.0 }, status: "at_port", where: "Rotterdam, awaiting barge to Frankfurt" },
      { id: "4500-118660", supplier: "S-COI-CAL", to: "S-FRA-BRK", part: null, item: "Brake caliper castings", qty: 18000, unit: "pcs", value_eur: 684000, route: "R-SEA-IN-RHINE-FRA", shipped_offset_days: -8, eta_offset_days: 15, position: { leg: 1, progress: 0.4 }, status: "in_transit", where: "Red Sea" },
      { id: "4500-118674", supplier: "S-NGB-MAG", to: "PL-GYR", part: "P-MAG", item: "Sintered NdFeB rotor magnets", qty: 9000, unit: "kg", value_eur: 855000, route: "R-SEA-CN-KOP-GYR", shipped_offset_days: -15, eta_offset_days: 10, position: { leg: 2, progress: 0.25 }, status: "in_transit", where: "Southern Red Sea" },
      { id: "4500-118689", supplier: "S-NGB-MAG", to: "PL-GYR", part: "P-MAG", item: "Sintered NdFeB rotor magnets", qty: 9000, unit: "kg", value_eur: 855000, route: "R-SEA-CN-KOP-GYR", shipped_offset_days: -4, eta_offset_days: 21, position: { leg: 0, progress: 0.6 }, status: "in_transit", where: "South China Sea" },
      { id: "4500-118702", supplier: "S-KUA-REE", to: "S-NAR-MAG", part: null, item: "NdPr oxide", qty: 12, unit: "t", value_eur: 900000, route: "R-SEA-MY-RTM-MUG", shipped_offset_days: -16, eta_offset_days: 11, position: { leg: 3, progress: 0.4 }, status: "in_transit", where: "Mediterranean" },
      { id: "4500-118716", supplier: "S-BOT-SOL", to: "S-LUD-ELY", part: null, item: "Battery-grade carbonate solvents (EC/DMC)", qty: 1800, unit: "t", value_eur: 2070000, route: "R-BARGE-BOT-LUH", shipped_offset_days: -2, eta_offset_days: 3, position: { leg: 1, progress: 0.6 }, status: "in_transit", where: "Tank barge approaching Kaub" },
      { id: "4500-118729", supplier: "S-BOT-SOL", to: "S-LUD-ELY", part: null, item: "Battery-grade carbonate solvents (EC/DMC)", qty: 1800, unit: "t", value_eur: 2070000, route: "R-BARGE-BOT-LUH", shipped_offset_days: 0, eta_offset_days: 5, position: { leg: 0, progress: 0.1 }, status: "in_transit", where: "Departing Rotterdam-Botlek" },
      { id: "4500-118743", supplier: "S-HFE-DSP", to: "PL-LEJ", part: "P-DSP", item: "Display sets (centre + cluster)", qty: 4250, unit: "sets", value_eur: 1785000, route: "R-RAIL-CN-LEJ", shipped_offset_days: -12, eta_offset_days: 6, position: { leg: 2, progress: 0.75 }, status: "in_transit", where: "Rail, Belarus" },
      { id: "4500-118757", supplier: "S-HFE-DSP", to: "PL-LEJ", part: "P-DSP", item: "Display sets (centre + cluster)", qty: 4250, unit: "sets", value_eur: 1785000, route: "R-RAIL-CN-LEJ", shipped_offset_days: -6, eta_offset_days: 12, position: { leg: 2, progress: 0.15 }, status: "in_transit", where: "Rail, Kazakhstan" },
      { id: "4500-118771", supplier: "S-HFE-DSP", to: "PL-LEJ", part: "P-DSP", item: "Display sets (centre + cluster)", qty: 4250, unit: "sets", value_eur: 1785000, route: "R-RAIL-CN-LEJ", shipped_offset_days: -1, eta_offset_days: 17, position: { leg: 0, progress: 0.35 }, status: "in_transit", where: "Rail, Henan province" },
      { id: "4500-118785", supplier: "S-BAO-MAG", to: "PL-GYR", part: "P-MAG", item: "Sintered NdFeB rotor magnets", qty: 18000, unit: "kg", value_eur: 1710000, route: "R-RAIL-CN-GYR", shipped_offset_days: -9, eta_offset_days: 10, position: { leg: 2, progress: 0.4 }, status: "in_transit", where: "Rail, Russia (Volga region)" },
      { id: "4500-118799", supplier: "S-BAO-MAG", to: "PL-GYR", part: "P-MAG", item: "Sintered NdFeB rotor magnets", qty: 18000, unit: "kg", value_eur: 1710000, route: "R-RAIL-CN-GYR", shipped_offset_days: -2, eta_offset_days: 17, position: { leg: 1, progress: 0.2 }, status: "in_transit", where: "Rail, Gansu province" },
      { id: "4500-118812", supplier: "S-ULQ-ANO", to: "S-DEB-CELL", part: null, item: "Graphite anode material", qty: 60, unit: "t", value_eur: 288000, route: "R-RAIL-CN-CE", shipped_offset_days: -10, eta_offset_days: 9, position: { leg: 2, progress: 0.5 }, status: "in_transit", where: "Rail, Kazakhstan–Russia" },
      { id: "4500-118826", supplier: "S-HSC-MCU", to: "S-REG-ECU", part: "P-MCU", item: "Automotive MCU (body/central compute)", qty: 60000, unit: "pcs", value_eur: 510000, route: "R-AIR-TW-LEJ", shipped_offset_days: -2, eta_offset_days: 2, position: { leg: 2, progress: 0.2 }, status: "customs", where: "Customs clearance, Leipzig/Halle Airport" },
      { id: "4500-118840", supplier: "S-HSC-MCU", to: "S-HAT-INV", part: "P-MCU", item: "Inverter control MCU (sole source)", qty: 10200, unit: "pcs", value_eur: 86700, route: "R-AIR-TW-BUD", shipped_offset_days: -1, eta_offset_days: 3, position: { leg: 1, progress: 0.5 }, status: "in_transit", where: "In flight Taipei → Budapest" },
      { id: "4500-118853", supplier: "S-HSC-PSM", to: "S-HAT-INV", part: "P-PSM", item: "SiC power modules", qty: 9000, unit: "modules", value_eur: 1350000, route: "R-AIR-TW-BUD", shipped_offset_days: -3, eta_offset_days: 1, position: { leg: 2, progress: 0.5 }, status: "in_transit", where: "Truck Budapest Airport → Hatvan" },
      { id: "4500-118867", supplier: "S-TAO-PCB", to: "S-SIB-ECU", part: null, item: "HDI printed circuit boards", qty: 30000, unit: "pcs", value_eur: 180000, route: "R-AIR-TW-LEJ", shipped_offset_days: -1, eta_offset_days: 3, position: { leg: 1, progress: 0.3 }, status: "in_transit", where: "In flight Taipei → Leipzig" },
      { id: "4500-118881", supplier: "S-ZHB-DDI", to: "S-WTZ-DSP", part: null, item: "Display driver ICs", qty: 20000, unit: "pcs", value_eur: 48000, route: "R-AIR-TW-LEJ", shipped_offset_days: -2, eta_offset_days: 2, position: { leg: 2, progress: 0.1 }, status: "customs", where: "Leipzig/Halle Airport" },
      { id: "4500-118895", supplier: "S-TNG-HAR", to: "PL-LEJ", part: "P-HAR", item: "Main wiring harness sets", qty: 850, unit: "sets", value_eur: 544000, route: "R-RD-TNG-LEJ", shipped_offset_days: -3, eta_offset_days: 1, position: { leg: 3, progress: 0.5 }, status: "in_transit", where: "Truck, eastern France" },
      { id: "4500-118908", supplier: "S-TNG-HAR", to: "PL-LEJ", part: "P-HAR", item: "Main wiring harness sets", qty: 850, unit: "sets", value_eur: 544000, route: "R-RD-TNG-LEJ", shipped_offset_days: -2, eta_offset_days: 2, position: { leg: 2, progress: 0.3 }, status: "in_transit", where: "Truck, south-west France" },
      { id: "4500-118922", supplier: "S-TNG-HAR", to: "PL-LEJ", part: "P-HAR", item: "Main wiring harness sets", qty: 850, unit: "sets", value_eur: 544000, route: "R-RD-TNG-LEJ", shipped_offset_days: -1, eta_offset_days: 3, position: { leg: 1, progress: 0.4 }, status: "in_transit", where: "Truck, central Spain" },
      { id: "4500-118936", supplier: "S-TNG-HAR", to: "PL-LEJ", part: "P-HAR", item: "Main wiring harness sets", qty: 850, unit: "sets", value_eur: 544000, route: "R-RD-TNG-LEJ", shipped_offset_days: 0, eta_offset_days: 4, position: { leg: 0, progress: 0.5 }, status: "in_transit", where: "Ferry, Strait of Gibraltar" },
      { id: "4500-118950", supplier: "S-TSR-HAR", to: "PL-LEJ", part: "P-HAR", item: "Main wiring harness sets", qty: 600, unit: "sets", value_eur: 384000, route: "R-RD-RO-LEJ", shipped_offset_days: -1, eta_offset_days: 1, position: { leg: 4, progress: 0.5 }, status: "in_transit", where: "Truck, Slovakia" },
      { id: "4500-118963", supplier: "S-BRE-CAST", to: "PL-LEJ", part: "P-CAST", item: "Rear megacasting sets", qty: 680, unit: "sets", value_eur: 292400, route: "R-RD-ALP-LEJ", shipped_offset_days: -1, eta_offset_days: 1, position: { leg: 1, progress: 0.2 }, status: "in_transit", where: "Truck, just north of Brenner Pass" },
      { id: "4500-118977", supplier: "S-SLB-CAST", to: "PL-LEJ", part: "P-CAST", item: "Rear megacasting sets", qty: 1020, unit: "sets", value_eur: 438600, route: "R-RD-SI-LEJ", shipped_offset_days: -1, eta_offset_days: 1, position: { leg: 1, progress: 0.5 }, status: "in_transit", where: "Truck, Pyhrn motorway" },
      { id: "4500-118991", supplier: "S-MBO-SEAT", to: "PL-LEJ", part: "P-SEAT", item: "Seat sets (JIS call-off, shift 2)", qty: 425, unit: "sets", value_eur: 586500, route: "R-RD-CZ-LEJ", shipped_offset_days: 0, eta_offset_days: 1, position: { leg: 1, progress: 0.5 }, status: "in_transit", where: "Truck, A17 near Dresden" },
      { id: "4500-119004", supplier: "PL-GYR", to: "PL-LEJ", part: "P-EDU", item: "Rear e-drive units (stock transfer)", qty: 850, unit: "units", value_eur: 3357500, route: "R-RD-CE-LEJ", shipped_offset_days: -1, eta_offset_days: 1, position: { leg: 3, progress: 0.5 }, status: "in_transit", where: "Truck, D1 near Jihlava" },
      { id: "4500-119018", supplier: "S-HJV-CAM", to: "S-GOD-CELL", part: "P-CAM", item: "Cathode active material NMC 811", qty: 40000, unit: "kg", value_eur: 760000, route: "R-FERRY-FI-CE", shipped_offset_days: -2, eta_offset_days: 2, position: { leg: 0, progress: 0.6 }, status: "in_transit", where: "Ferry, Baltic Sea" },
      { id: "4500-119032", supplier: "S-WRO-CELL", to: "PL-LEJ", part: "P-CELL", item: "Prismatic battery cells", qty: 81600, unit: "cells", value_eur: 2611200, route: "R-RD-PL-LEJ", shipped_offset_days: 0, eta_offset_days: 1, position: { leg: 1, progress: 0.5 }, status: "in_transit", where: "Truck, A4 near Legnica" },
      { id: "4500-119046", supplier: "S-RAC-TYR", to: "PL-LEJ", part: "P-TYR", item: "Tyres 235/45 R20 (OE)", qty: 4080, unit: "tyres", value_eur: 375360, route: "R-RD-CE-LEJ", shipped_offset_days: -1, eta_offset_days: 1, position: { leg: 2, progress: 0.5 }, status: "in_transit", where: "Truck, Bratislava–Brno" },
      { id: "4500-119060", supplier: "S-HSC-MCU", to: "S-NUE-INV", part: "P-MCU", item: "Inverter control MCU (sole source)", qty: 6800, unit: "pcs", value_eur: 57800, route: "R-AIR-TW-BUD", shipped_offset_days: -2, eta_offset_days: 2, position: { leg: 2, progress: 0.3 }, status: "in_transit", where: "Truck Budapest Airport → Nuremberg" }
    ],

    // -------------------------------------------------------------------------------------------
    // Public reference figures used by the agent's reasoning (documented in DATA_SOURCES.md).
    // -------------------------------------------------------------------------------------------
    reference: {
      rhine_kaub: {
        station: "KAUB", water: "RHEIN", river_km: 546.23,
        gauge_note: "The gauge value is not the water depth: fairway depth ≈ gauge − 77 cm + 190 cm (16 cm on the gauge ≈ 1.29 m). Reference low-water level (GlW/EWL 2022, valid 2023–2031) is 77 cm; the industry still often quotes the earlier 78 cm mark. There is no legal low-water navigation ban; below ~40 cm freight navigation is impractical.",
        capacity_curve_note: "Approximate share of normal Rhine barge capacity able to pass the Middle Rhine at a given Kaub gauge reading (published rule of thumb: ~50 % at 135 cm, ~25 % at 75 cm, ~16 % at 55 cm, impractical below 40 cm). Use for scenario sizing, not for operations.",
        capacity_curve: [[250, 100], [200, 78], [135, 50], [100, 35], [78, 26], [75, 25], [55, 16], [40, 8], [35, 5], [16, 2], [0, 1]]
      },
      red_sea: { note: "Re-routing Asia–North Europe services via the Cape of Good Hope adds roughly 10–14 days of transit (12 days used in this model)." },
      china_eu_rail: { note: "Northern corridor via Kazakhstan, Russia and Belarus with EU entry at Małaszewicze; Middle Corridor (Trans-Caspian) as alternative." }
    }
  };
})();

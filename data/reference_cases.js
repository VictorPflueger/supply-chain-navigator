/*
 * NAVIGATOR — reference cases for the six preset scenarios.
 *
 * A reference case is the set of disruption parameters and response options a representative
 * agent run would arrive at AFTER verification. It serves two purposes:
 *   1. the scripted Simulation mode computes every € figure from these specs with the same
 *      deterministic engine the live agent uses (js/impact.js) — numbers are never typed in;
 *   2. the integrity check (js/world_check.js) runs them to prove each scenario bites.
 * The live agent never sees this file: it must derive its own parameters from evidence.
 *
 * `hypothesis` (optional) is the first, unverified assumption shown before the visible
 * self-correction in a simulated run.
 */
window.REFERENCE_CASES = {
  "SC-RTM-STRIKE": {
    disruption: {
      label: "Rotterdam container terminal strike (9 days) + 5 days congestion",
      horizon_days: 30,
      route_disruptions: [{ node_id: "N-RTM", type: "delay", delay_days: 14 }],
      variants: [
        { variant_id: "V1", name: "Divert inbound vessels to Antwerp-Bruges", mitigations: [{ type: "reroute", alternative_id: "ALT-ANR", start_in_days: 2 }] },
        { variant_id: "V2", name: "Air-freight bridge for displays from Tainan", mitigations: [{ type: "airfreight", part_id: "P-DSP", plant_id: "PL-LEJ", max_share_pct: 60, start_in_days: 4, duration_days: 16 }] },
        { variant_id: "V3", name: "Build without displays and retrofit in the yard", mitigations: [{ type: "build_shy", part_id: "P-DSP", plant_id: "PL-LEJ", max_days: 8 }] }
      ]
    },
    hypothesis: { label: "Initial assumption: strike lasts 7 days, no congestion", horizon_days: 30, route_disruptions: [{ node_id: "N-RTM", type: "delay", delay_days: 7 }] }
  },

  "SC-RHINE-LOW": {
    disruption: {
      label: "Rhine low water at Kaub (≈75 cm) — barge capacity ≈25 % for 6 weeks",
      horizon_days: 30,
      route_disruptions: [{ node_id: "N-KAU", type: "capacity", capacity_pct: 25, duration_days: 42 }],
      variants: [
        { variant_id: "V1", name: "Shift all Kaub-bound cargo to rail", mitigations: [{ type: "reroute", alternative_id: "ALT-RAIL-RHINE", start_in_days: 3 }] },
        { variant_id: "V2", name: "Truck the solvents to Ludwigshafen only", mitigations: [{ type: "reroute", alternative_id: "ALT-TRUCK-RHINE", route_id: "R-BARGE-BOT-LUH", start_in_days: 1 }] },
        { variant_id: "V3", name: "Contingency electrolyte for the cell suppliers", mitigations: [
          { type: "input_contingency", supplier_id: "S-WRO-CELL", input: "Electrolyte", share_pct: 40, start_in_days: 8 },
          { type: "input_contingency", supplier_id: "S-DEB-CELL", input: "Electrolyte", share_pct: 40, start_in_days: 8 },
          { type: "input_contingency", supplier_id: "S-GOD-CELL", input: "Electrolyte", share_pct: 40, start_in_days: 8 }
        ] }
      ]
    },
    hypothesis: { label: "Initial assumption from the trigger: 78 cm ≈ 26 % capacity for 2 weeks", horizon_days: 30, route_disruptions: [{ node_id: "N-KAU", type: "capacity", capacity_pct: 26, duration_days: 14 }] }
  },

  "SC-HSC-QUAKE": {
    disruption: {
      label: "Hsinchu earthquake — fab outage 10 days, then 50 % for 3 weeks",
      horizon_days: 30,
      supplier_outages: [
        { supplier_id: "S-HSC-MCU", capacity_loss_pct: 100, duration_days: 10 },
        { supplier_id: "S-HSC-MCU", capacity_loss_pct: 50, start_in_days: 10, duration_days: 21 },
        { supplier_id: "S-HSC-PSM", capacity_loss_pct: 100, duration_days: 10 },
        { supplier_id: "S-HSC-PSM", capacity_loss_pct: 50, start_in_days: 10, duration_days: 21 },
        { supplier_id: "S-TAO-PCB", capacity_loss_pct: 40, duration_days: 5 },
        { supplier_id: "S-ZHB-DDI", capacity_loss_pct: 100, duration_days: 5 }
      ],
      variants: [
        { variant_id: "V1", name: "Broker buy of inverter MCUs", mitigations: [{ type: "spot_buy", part_id: "P-MCU", plant_id: "PL-GYR", max_share_pct: 40, start_in_days: 4, duration_days: 30 }] },
        { variant_id: "V2", name: "Fast-track pin-compatible MCU (Nijmegen) + broker bridge", mitigations: [
          { type: "alt_supplier", alternative_id: "A-NIJ-MCU", share_pct: 60, start_in_days: 21 },
          { type: "spot_buy", part_id: "P-MCU", plant_id: "PL-GYR", max_share_pct: 40, start_in_days: 4, duration_days: 30 }
        ] },
        { variant_id: "V3", name: "Fast-track pin-compatible MCU (Nijmegen) only", mitigations: [{ type: "alt_supplier", alternative_id: "A-NIJ-MCU", share_pct: 60, start_in_days: 21 }] }
      ]
    },
    hypothesis: {
      label: "Initial assumption: fab down for 3 weeks",
      horizon_days: 30,
      supplier_outages: [
        { supplier_id: "S-HSC-MCU", capacity_loss_pct: 100, duration_days: 21 },
        { supplier_id: "S-HSC-PSM", capacity_loss_pct: 100, duration_days: 21 },
        { supplier_id: "S-TAO-PCB", capacity_loss_pct: 100, duration_days: 10 },
        { supplier_id: "S-ZHB-DDI", capacity_loss_pct: 100, duration_days: 10 }
      ]
    }
  },

  "SC-STYRIA-FLOOD": {
    disruption: {
      label: "Drava/Mur flooding — alloy refiner, heat-treater and forge down",
      horizon_days: 30,
      supplier_outages: [
        { supplier_id: "S-KID-ALY", capacity_loss_pct: 100, duration_days: 12 },
        { supplier_id: "S-KID-ALY", capacity_loss_pct: 50, start_in_days: 12, duration_days: 10 },
        { supplier_id: "S-LEO-HTR", capacity_loss_pct: 100, duration_days: 12 },
        { supplier_id: "S-RAV-FRG", capacity_loss_pct: 100, duration_days: 14 }
      ],
      variants: [
        { variant_id: "V1", name: "Keep the Slovenian casting line running (spot alloy + subcontract heat treatment)", mitigations: [
          { type: "input_contingency", supplier_id: "S-SLB-CAST", input: "Aluminium alloy", share_pct: 60, start_in_days: 4 },
          { type: "input_contingency", supplier_id: "S-SLB-CAST", input: "T6 heat treatment", share_pct: 70, start_in_days: 3 }
        ] },
        { variant_id: "V2", name: "Surge Brescia castings", mitigations: [{ type: "surge", supplier_id: "S-BRE-CAST", extra_share_pct: 12, start_in_days: 7 }] },
        { variant_id: "V3", name: "Both: contingency in Slovenia + Brescia surge", mitigations: [
          { type: "input_contingency", supplier_id: "S-SLB-CAST", input: "Aluminium alloy", share_pct: 60, start_in_days: 4 },
          { type: "input_contingency", supplier_id: "S-SLB-CAST", input: "T6 heat treatment", share_pct: 70, start_in_days: 3 },
          { type: "surge", supplier_id: "S-BRE-CAST", extra_share_pct: 12, start_in_days: 7 }
        ] }
      ]
    },
    hypothesis: {
      label: "Initial assumption: only the alloy refiner is affected (5 days)",
      horizon_days: 30,
      supplier_outages: [{ supplier_id: "S-KID-ALY", capacity_loss_pct: 100, duration_days: 5 }]
    }
  },

  "SC-REDSEA": {
    disruption: {
      label: "Red Sea closure — Asia–Europe services via Cape of Good Hope (+12 days)",
      horizon_days: 30,
      route_disruptions: [{ node_id: "N-BAB", type: "delay", delay_days: 12 }],
      variants: [
        { variant_id: "V1", name: "Air-freight bridge for displays", mitigations: [{ type: "airfreight", part_id: "P-DSP", plant_id: "PL-LEJ", max_share_pct: 60, start_in_days: 4, duration_days: 30 }] },
        { variant_id: "V2", name: "Surge rail and German display sources", mitigations: [
          { type: "surge", supplier_id: "S-HFE-DSP", extra_share_pct: 15, start_in_days: 7 },
          { type: "surge", supplier_id: "S-WTZ-DSP", extra_share_pct: 10, start_in_days: 5 }
        ] },
        { variant_id: "V3", name: "Build without displays and retrofit", mitigations: [{ type: "build_shy", part_id: "P-DSP", plant_id: "PL-LEJ", max_days: 8 }] }
      ]
    },
    hypothesis: { label: "Initial assumption: +10 days transit", horizon_days: 30, route_disruptions: [{ node_id: "N-BAB", type: "delay", delay_days: 10 }] }
  },

  "SC-TNG-FIRE": {
    disruption: {
      label: "Fire at the Tangier harness plant — production halted for 5 weeks",
      horizon_days: 30,
      supplier_outages: [{ supplier_id: "S-TNG-HAR", capacity_loss_pct: 100, duration_days: 35 }],
      variants: [
        { variant_id: "V1", name: "Surge Timișoara and Sousse + re-source seat harness", mitigations: [
          { type: "surge", supplier_id: "S-TSR-HAR", extra_share_pct: 20, start_in_days: 5 },
          { type: "surge", supplier_id: "S-SOU-HAR", extra_share_pct: 8, start_in_days: 4 },
          { type: "input_contingency", supplier_id: "S-MBO-SEAT", input: "Seat wiring harness", share_pct: 100, start_in_days: 6 }
        ] },
        { variant_id: "V2", name: "V1 + move Tangier tooling to the Kénitra sister plant", mitigations: [
          { type: "surge", supplier_id: "S-TSR-HAR", extra_share_pct: 20, start_in_days: 5 },
          { type: "surge", supplier_id: "S-SOU-HAR", extra_share_pct: 8, start_in_days: 4 },
          { type: "input_contingency", supplier_id: "S-MBO-SEAT", input: "Seat wiring harness", share_pct: 100, start_in_days: 6 },
          { type: "alt_supplier", alternative_id: "A-KEN-HAR", share_pct: 40, start_in_days: 14 }
        ] },
        { variant_id: "V3", name: "Kénitra tooling transfer + seat harness only (no surge premium)", mitigations: [
          { type: "input_contingency", supplier_id: "S-MBO-SEAT", input: "Seat wiring harness", share_pct: 100, start_in_days: 6 },
          { type: "alt_supplier", alternative_id: "A-KEN-HAR", share_pct: 40, start_in_days: 14 }
        ] }
      ]
    },
    hypothesis: { label: "Initial assumption from first reports: one week of lost production", horizon_days: 30, supplier_outages: [{ supplier_id: "S-TNG-HAR", capacity_loss_pct: 100, duration_days: 7 }] }
  }
};

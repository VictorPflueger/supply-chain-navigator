/*
 * NAVIGATOR — injectable disruption scenarios.
 *
 * Each scenario is only a short, UNVERIFIED trigger ("seed") written the way a first signal
 * typically arrives (newsletter, carrier notice, social media). In Live mode the agent receives
 * the seed text and nothing else: it must verify the event independently (web search, open data),
 * map it onto Nordwerk's network, quantify it with the deterministic engine and propose options.
 *
 * `map_focus` positions the map. `exposure_check` is used ONLY by the offline integrity check
 * (js/world_check.js) and is never shown to the agent.
 */
window.SCENARIOS = [
  {
    id: "SC-RTM-STRIKE",
    number: 1,
    title: "Container terminal strike — Port of Rotterdam",
    short: "Rotterdam strike",
    category: "Port / labour",
    seed: "Unverified signal from a logistics newsletter: dockworkers at the Maasvlakte container terminals in the Port of Rotterdam have walked out over a collective-agreement dispute. Several deep-sea vessels are reportedly waiting at anchor. Duration unknown — the union mentions 'at least a week'.",
    map_focus: { lat: 51.9, lon: 5.2, zoom: 6 },
    exposure_check: { node_ids: ["N-RTM"] }
  },
  {
    id: "SC-RHINE-LOW",
    number: 2,
    title: "Rhine low water at Kaub (78 cm)",
    short: "Rhine low water",
    category: "Inland waterway / climate",
    seed: "Unverified signal from a barge operator's customer notice: the Rhine gauge at Kaub reads 78 cm and is falling. Low-water surcharges apply and vessels on the Middle Rhine can only load part of their capacity.",
    map_focus: { lat: 50.6, lon: 7.4, zoom: 7 },
    exposure_check: { node_ids: ["N-KAU"] }
  },
  {
    id: "SC-HSC-QUAKE",
    number: 3,
    title: "M6.4 earthquake near Hsinchu, Taiwan",
    short: "Hsinchu earthquake",
    category: "Natural hazard",
    seed: "Unverified signal from social media: a magnitude 6.4 earthquake has struck near Hsinchu, Taiwan. Fabs in the Hsinchu Science Park are said to be evacuating staff for safety inspections.",
    map_focus: { lat: 24.8, lon: 121.0, zoom: 7 },
    exposure_check: { supplier_ids: ["S-HSC-MCU", "S-HSC-PSM", "S-TAO-PCB", "S-ZHB-DDI"] }
  },
  {
    id: "SC-STYRIA-FLOOD",
    number: 4,
    title: "Flooding in the Slovenian/Styrian castings region",
    short: "Styria/Slovenia flood",
    category: "Natural hazard / tier-2",
    seed: "Unverified signal from regional news: after 48 hours of torrential rain, flash floods are reported along the Drava and Mur rivers in north-eastern Slovenia and Styria (Austria). Industrial sites near Kidričevo, Ravne na Koroškem and Leoben are said to be affected.",
    map_focus: { lat: 46.8, lon: 15.2, zoom: 8 },
    exposure_check: { supplier_ids: ["S-KID-ALY", "S-LEO-HTR", "S-RAV-FRG"] }
  },
  {
    id: "SC-REDSEA",
    number: 5,
    title: "Red Sea security situation — Cape rerouting",
    short: "Red Sea rerouting",
    category: "Geopolitical / shipping",
    seed: "Unverified signal from a carrier advisory: because of the security situation in the southern Red Sea and Gulf of Aden, Asia–North Europe and Asia–Mediterranean services will be rerouted via the Cape of Good Hope until further notice.",
    map_focus: { lat: 18.0, lon: 40.0, zoom: 4 },
    exposure_check: { node_ids: ["N-BAB"] }
  },
  {
    id: "SC-TNG-FIRE",
    number: 6,
    title: "Fire at the Tangier wiring-harness plant",
    short: "Tangier harness fire",
    category: "Supplier site incident",
    seed: "Unverified signal from a local news site: a large fire broke out overnight at a wiring-harness plant in Tanger Automotive City, Morocco. Production is reported to be halted; the extent of the damage is unclear.",
    map_focus: { lat: 35.7, lon: -5.6, zoom: 7 },
    exposure_check: { supplier_ids: ["S-TNG-HAR"] }
  }
];

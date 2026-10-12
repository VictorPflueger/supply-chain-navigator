/*
 * NAVIGATOR — simulation scripts (Simulation mode).
 *
 * One script per preset scenario. Each mirrors what the live agent does: the same tools in the
 * same order, a hypothesis that is checked against a second independent source, a visible
 * "Revised:" self-correction, exactly three costed options plus the do-nothing baseline, drafts
 * that wait for approval, and a management summary.
 *
 * Integrity rules for authors (checked by js/sim_check.js in Diagnostics and tools/check_world.mjs):
 *   - ERP results are produced at playback by the real ERP queries (js/erp.js).
 *   - Every € figure and line-stop day comes from the impact engine via {{placeholders}}
 *     (js/sim_vars.js); never type a number that the engine computes.
 *   - Web search and open-data results are representative and labelled as such; they carry no
 *     URLs because they do not point to real articles.
 *   - Reports end with the simulation marker; nothing here may present itself as a live run.
 *
 * A completed live run can replace a script: "Save run as simulation" in the Audit tab exports it
 * in this format (source: "recorded"), to be appended to the end of this file.
 */
window.SIM_RUNS = {
  "SC-RTM-STRIKE": {
    title: "Container terminal strike, Port of Rotterdam",
    steps: [
      { state: "scanning" },
      { say: "Signal received: a logistics newsletter reports a walkout at the Maasvlakte container terminals in Rotterdam, with deep-sea vessels waiting at anchor. First question: which of our flows pass through Rotterdam?" },
      { map: { node_ids: ["N-RTM"], state: "at_risk", focus: { lat: 51.7, lon: 5.6, zoom: 6 } } },
      { tool: "erp_get_routes", input: { node_or_supplier: "N-RTM" } },
      { say: "Hypothesis: displays are the critical cargo. Tainan Display Technologies (S-TNN-DSP) ships 60 % of Leipzig's displays through Rotterdam, and electronics are rarely stocked deep.\n\nTyres from Rayong, cathode material for our cell suppliers and three feeder flows use the port as well." },
      { map: { route_ids: ["R-SEA-TW-RTM-LEJ", "R-SEA-TH-RTM-LEJ", "R-SEA-KR-RTM-CE"], state: "at_risk" } },

      { state: "verifying" },
      { web: {
        query: "Rotterdam Maasvlakte container terminal strike dockworkers",
        summary: "2 results: the logistics newsletter and the union's statement in the trade press",
        results: [
          { title: "Dockworkers walk out at Maasvlakte terminals over collective agreement", source: "Logistics newsletter", page_age: "today" },
          { title: "Union: strike at Rotterdam deep-sea terminals will last 'at least a week'", source: "Trade press quoting the union", page_age: "today" }
        ]
      } },
      { say: "Check: both reports go back to the union's own announcement. I need an independent source showing that the terminals have actually stopped." },
      { web: {
        query: "Port of Rotterdam vessel waiting times Maasvlakte terminal operations",
        summary: "1 result: a port-authority operations update",
        results: [
          { title: "Port authority: Maasvlakte deep-sea terminals stop handling, waiting times rising", source: "Port-authority update quoted by maritime news", page_age: "today" }
        ]
      } },
      { say: "Confirmed: the port authority reports that the Maasvlakte deep-sea terminals have stopped handling and that vessels are waiting at anchor. Two independent sources agree." },
      { alert: {
        title: "Strike stops Rotterdam's Maasvlakte container terminals",
        severity: "high",
        summary: "Dockworkers at the Maasvlakte deep-sea terminals have walked out, and vessels are waiting at anchor. Six of our sea corridors run through Rotterdam, including 60 % of Leipzig's displays.",
        node_ids: ["N-RTM"],
        route_ids: ["R-SEA-TW-RTM-LEJ", "R-SEA-TH-RTM-LEJ", "R-SEA-KR-RTM-CE"],
        sources: [
          { title: "Port-authority operations update quoted by maritime news (representative)" },
          { title: "Union statement quoted by the trade press (representative)" }
        ]
      } },

      { state: "diagnosing" },
      { tool: "erp_get_part", input: { part_id: "P-DSP" } },
      { tool: "erp_get_open_pos", input: { node_id: "N-RTM" } },
      { say: "Finding: Leipzig holds six days of displays, and a shipment of 5,100 sets is already in the English Channel, heading for the closed terminals. Hefei by rail (25 %) and Lahn Display Modules in Wetzlar (15 %) are not affected." },
      { say: "First estimate, taking the union's 'at least a week' at face value: cargo through Rotterdam is held for seven days." },
      { impact: "hypothesis" },
      { say: "On a seven-day hold, value at risk is {{hyp.var}}: display stock and the other two sources bridge the gap. That only holds if the strike really ends after a week, so I check the outlook." },
      { state: "verifying" },
      { web: {
        query: "Rotterdam strike talks outlook backlog congestion after restart",
        summary: "1 result: a carrier advisory on the strike outlook",
        results: [
          { title: "Union rejects mediation and extends the Maasvlakte strike to nine days; carriers expect five days to clear the backlog", source: "Carrier customer advisory", page_age: "today" }
        ]
      } },
      { say: "Revised: a seven-day hold → nine days of strike plus about five days of congestion. The union has rejected mediation, and carriers expect the yards to need about five days to clear." },
      { impact: "disruption" },
      { say: "Impact: Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: {{var}}; tyres and cathode material are delayed but stay covered." },
      { map: { plant_ids: ["PL-LEJ"], state: "affected", fit: ["N-RTM", "N-ANR", "N-HAM", "PL-LEJ"] } },

      { state: "diagnosing" },
      { tool: "erp_get_alternatives", input: { part_id: "P-DSP" } },
      { say: "Response levers: divert our containers to Antwerp-Bruges (two extra days) or Hamburg (three), fly displays from Tainan at €12 a set with four days' lead time, or build vehicles without displays for up to eight days and retrofit them in the yard." },

      { options: {
        recommended: "V1",
        baseline_description: "Wait for the terminals to reopen; Leipzig runs out of displays before the backlog clears.",
        texts: {
          V1: {
            title: "Divert inbound vessels to Antwerp-Bruges",
            description: "Ask our ocean carrier to discharge Rotterdam-bound containers in Antwerp-Bruges and rail them on to Leipzig, about two days more in transit.",
            residual_risk: "Antwerp-Bruges may congest as other shippers divert, and the carrier charges a fee per container."
          },
          V2: {
            title: "Air-freight bridge for displays from Tainan",
            description: "Fly up to 60 % of Leipzig's display demand from Tainan while the sea cargo is held.",
            residual_risk: "Covers displays only; tyres and cathode material still wait for Rotterdam."
          },
          V3: {
            title: "Build without displays and retrofit",
            description: "Complete vehicles without displays when stock runs out and fit them in the yard once the ships are unloaded.",
            residual_risk: "Yard rework is limited to eight days of output, and vehicles cannot ship until retrofitted."
          }
        }
      } },
      { say: "Recommendation: option A. It costs {{V1.mit}} and removes the {{var}} exposure, the lowest expected total of the three; option B is the fallback if Antwerp-Bruges congests too." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. Options B and C remain: B protects displays by air, C avoids any freight premium but needs yard rework.",
          V2: "Option B rejected. Option A remains the cheapest full protection; option C works without any carrier.",
          V3: "Option C rejected. Options A and B both protect the line at a lower cost."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the diversion request, the onward rail booking and a note for Leipzig logistics. Each draft waits for your approval in the Outbox; nothing is sent." },
            { draft: {
              type: "email", recipient: "Contracted ocean carrier, Asia–North Europe service (key account desk)",
              subject: "Divert Nordwerk containers from Rotterdam to Antwerp-Bruges",
              body: "Dear key account team,\n\nBecause of the strike at the Maasvlakte terminals, please discharge all containers shipped under Nordwerk's contract and bound for Rotterdam in Antwerp-Bruges instead.\n\nScope\n- Display sets from Kaohsiung for our Leipzig plant: four sailings in transit, the first now in the English Channel\n- Tyres from Laem Chabang for Leipzig\n- Cathode material from Busan for our cell suppliers in Poland and Hungary\n\nPlease confirm the diversion, the fee per container and the revised arrival dates by 12:00 tomorrow.\n\nKind regards\nInbound Logistics\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "booking", recipient: "Contracted rail operator (framework agreement)",
              subject: "Mock booking: container trains Antwerp-Bruges → Leipzig, 3 per week",
              body: "Lane: Antwerp-Bruges (BE) → Leipzig (DE)\nService: intermodal container train, about 2 days transit\nFrequency: 3 departures per week\nPeriod: {{date:+2}} to {{date:+21}}\nCargo: display sets and tyres in 40-ft containers, diverted from Rotterdam\nReference: Navigator option A, Rotterdam strike response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { draft: {
              type: "replan", recipient: "Leipzig plant logistics",
              subject: "Display arrivals move to Antwerp-Bruges: adjust call-offs",
              body: "Decision: option A approved. Our Rotterdam-bound containers are diverted to Antwerp-Bruges and railed to Leipzig.\n\nWhat changes\n- Display arrivals shift by about two days against the original Rotterdam dates\n- The first diverted shipment carries 5,100 display sets\n- Without the diversion, displays would have run out on day {{first_stop_day}} ({{first_stop_date}})\n\nPlease adjust the line-side call-offs and keep the safety stock untouched until the first train arrives.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { node_ids: ["N-ANR"], supplier_ids: ["S-TNN-DSP"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Rotterdam terminal strike: response decision\n\n**What happened.** A strike has stopped the Maasvlakte deep-sea terminals in the Port of Rotterdam. The union's announcement and a port-authority update confirm it; carriers expect about five days of congestion after the nine-day strike.\n\n**If we do nothing.** Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}): 60 % of them arrive by sea through Rotterdam. Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option A approved: discharge our Rotterdam-bound containers in Antwerp-Bruges and rail them to Leipzig.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Mitigation cost | – | {{V1.mit}} |\n| Remaining exposure (30 days) | {{var}} | {{V1.res}} |\n| Expected total | {{var}} | {{V1.total}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox. They are drafts: nothing was sent.\n\n**Residual risk.** Antwerp-Bruges may congest as other shippers divert; the air-freight bridge for displays (option B) is the fallback.\n\n**How we know.** Exposure from ERP master data; stop dates and euro figures from the deterministic impact engine; the event confirmed by two independent sources.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the air-freight booking and the shipping request to Tainan; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "booking", recipient: "Contracted air-freight forwarder (framework agreement)",
              subject: "Mock booking: air freight of display sets Taipei → Leipzig/Halle",
              body: "Lane: Taipei Taoyuan (TW) → Leipzig/Halle (DE)\nService: air freight, about 4 days door to door\nVolume: up to 60 % of Leipzig's display demand (about 510 sets per day)\nPeriod: {{date:+4}} to {{date:+20}}\nCargo: display sets (centre + cluster)\nReference: Navigator option B, Rotterdam strike response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { draft: {
              type: "email", recipient: "Tainan Display Technologies Corp. (key account)",
              subject: "Ship display sets to Leipzig by air from {{date:+2}}",
              body: "Dear Tainan Display Technologies team,\n\nThe strike at the Port of Rotterdam holds our sea shipments of display sets. Until the terminals have cleared, we ask you to send part of our volume by air.\n\nRequest\n- Hand over up to 510 display sets per day to our forwarder at Taipei Taoyuan from {{date:+2}}\n- Keep the remaining volume on the sea schedule\n- Pack in air-freight cartons, labelled per shipment\n\nWe cover the air-freight cost. Please confirm the daily quantities you can release by 18:00 tomorrow.\n\nKind regards\nPurchasing, Electronics\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-TNN-DSP"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Rotterdam terminal strike: response decision\n\n**What happened.** A strike has stopped the Maasvlakte deep-sea terminals in Rotterdam; two independent sources confirm it.\n\n**If we do nothing.** Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option B approved: an air-freight bridge for up to 60 % of Leipzig's displays from Tainan. Mitigation cost {{V2.mit}}; remaining exposure {{V2.res}}; expected total {{V2.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** Tyres and cathode material still wait for Rotterdam; their stock covers the delay.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the build-without-displays plan for Leipzig; it waits for your approval in the Outbox." },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Build without displays from {{first_stop_date}}; retrofit in the yard",
              body: "Decision: option C approved. When display stock runs out on day {{first_stop_day}} ({{first_stop_date}}), Leipzig keeps building and completes vehicles without displays.\n\nWhat to prepare\n- Release the build-without-displays sequence for up to eight days of output\n- Set up a retrofit area in the yard; rework is planned at €230 per vehicle\n- Hold affected vehicles from shipping until they are retrofitted\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Rotterdam terminal strike: response decision\n\n**What happened.** A strike has stopped the Maasvlakte deep-sea terminals in Rotterdam; two independent sources confirm it.\n\n**If we do nothing.** Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Decision.** Option C approved: build without displays and retrofit them in the yard. Mitigation cost {{V3.mit}}; remaining exposure {{V3.res}}; expected total {{V3.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal plans approved (drafts only, nothing sent).\n\n**Residual risk.** Yard rework is limited to eight days of output; a longer strike needs option A or B.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "Risk accepted. I will not contact any carrier or supplier. Drafting an internal note so Leipzig can plan for the expected stoppage." },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Expected line stop from {{first_stop_date}}: display shortage",
              body: "Decision: accept the supply risk from the Rotterdam terminal strike; no mitigation ordered.\n\nExpected impact\n- Displays run out on day {{first_stop_day}} ({{first_stop_date}})\n- Value at risk over 30 days: {{var}}\n\nPlease prepare shift and staffing plans for a stoppage and inform the works council and logistics.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Rotterdam terminal strike: risk accepted\n\n**What happened.** A strike has stopped the Maasvlakte deep-sea terminals in Rotterdam.\n\n**Decision.** Do nothing; the risk is accepted. Expected first line stop on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal notes approved.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-RHINE-LOW": {
    title: "Rhine low water at Kaub (78 cm)",
    steps: [
      { state: "scanning" },
      { say: "Signal received: a barge operator's customer notice reports 78 cm at the Kaub gauge and falling, with part loads only on the Middle Rhine. First question: which of our flows pass Kaub?" },
      { map: { node_ids: ["N-KAU"], state: "at_risk", focus: { lat: 50.6, lon: 7.4, zoom: 7 } } },
      { tool: "erp_get_routes", input: { node_or_supplier: "N-KAU" } },
      { say: "Hypothesis: the main exposure is natural rubber for our tyre supplier in Karlsruhe, which arrives by Rhine barge. Brake caliper castings for Frankfurt and a solvent tank barge to Ludwigshafen pass Kaub as well." },
      { map: { route_ids: ["R-SEA-TH-RHINE-KAR", "R-SEA-IN-RHINE-FRA", "R-BARGE-BOT-LUH"], state: "at_risk" } },

      { state: "verifying" },
      { geo: "geo_rhine_level", input: { station: "KAUB" },
        summary: "Kaub 78 cm, down 19 cm in seven days and falling; barges can load about 26 % of normal capacity",
        result: {
          source: "PEGELONLINE, German Federal Waterways and Shipping Administration (representative values)",
          station: "KAUB", gauge_cm: 78, measured_at: "today, 06:00",
          last_7_days: { min_cm: 78, max_cm: 97, change_cm: -19, trend: "falling" },
          estimated_barge_capacity_pct: 26, reference_low_water_cm: 77
        } },
      { say: "Check: the official gauge confirms the notice, so this is no longer a single-source claim. At 78 cm, barges can load only about a quarter of their normal capacity." },
      { web: {
        query: "Rhine Kaub low water surcharges part loads barges",
        summary: "2 results: an inland-shipping market report and a trade-press article",
        results: [
          { title: "Low-water surcharges rise as Kaub falls below 80 cm", source: "Inland-shipping market report", page_age: "today" },
          { title: "Barge operators cut loads on the Middle Rhine", source: "Logistics trade press", page_age: "yesterday" }
        ]
      } },
      { say: "Confirmed: the gauge and independent market reports agree. Operators are charging low-water surcharges and sailing part-loaded." },
      { alert: {
        title: "Rhine low water at Kaub cuts barge capacity to about a quarter",
        severity: "high",
        summary: "The Kaub gauge reads 78 cm and is falling; barges can carry about 26 % of a normal load. Three of our supply corridors pass Kaub.",
        node_ids: ["N-KAU"],
        route_ids: ["R-SEA-TH-RHINE-KAR", "R-SEA-IN-RHINE-FRA", "R-BARGE-BOT-LUH"],
        sources: [
          { title: "PEGELONLINE gauge Kaub (representative reading)" },
          { title: "Inland-shipping market report on low-water surcharges (representative)" }
        ]
      } },

      { state: "diagnosing" },
      { tool: "erp_get_open_pos", input: { node_id: "N-KAU" } },
      { tool: "erp_get_supplier", input: { supplier_id: "S-LUD-ELY" } },
      { say: "Revised: rubber for the tyre plant is the main exposure → battery-grade solvents for Rhein-Neckar Elektrolyt (S-LUD-ELY) are. A tank barge with 1,800 t of solvents is approaching Kaub, and this plant is the only electrolyte source for all three of our cell suppliers." },
      { tool: "erp_get_part", input: { part_id: "P-CELL" } },
      { say: "Finding: Ludwigshafen holds three days of solvents, the cell plants four days of electrolyte and Leipzig five days of cells. The Rhine reaches our battery line through a tier-2 chemical plant." },
      { map: { supplier_ids: ["S-LUD-ELY"], state: "affected" } },
      { map: { supplier_ids: ["S-BOT-SOL", "S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], state: "at_risk", fit: ["S-BOT-SOL", "S-LUD-ELY", "S-WRO-CELL", "S-GOD-CELL", "PL-LEJ"] } },
      { say: "First estimate, based on the trigger: about 26 % capacity for two weeks." },
      { impact: "hypothesis" },
      { say: "For two weeks at this level, value at risk is {{hyp.var}}: the stocks along the chain bridge the gap. Everything depends on how long the low water lasts, so I check the weather in the catchment and the waterway forecast." },
      { state: "verifying" },
      { geo: "geo_weather", input: { lat: 47.6, lon: 8.7, days: 14, past_days: 3 },
        summary: "Upper Rhine catchment: 7 mm of rain over 17 days, no rain event that would lift the river",
        result: {
          source: "Open-Meteo forecast API (representative values)",
          location: { lat: 47.6, lon: 8.7, timezone: "Europe/Zurich" },
          near: [], past_days: 3, total_precip_mm: 7.4, flags: [],
          assessment: "No severe weather in this window."
        } },
      { web: {
        query: "Rhine water level forecast Kaub coming weeks",
        summary: "1 result: the waterway forecast quoted by the trade press",
        results: [
          { title: "Waterway forecast: Kaub to stay below 80 cm for four to six weeks", source: "Federal waterway forecast service quoted by the trade press", page_age: "today" }
        ]
      } },
      { say: "Revised: two weeks at 78 cm → about six weeks, with the gauge falling towards 75 cm. The catchment stays dry, and the waterway forecast keeps Kaub below 80 cm for four to six weeks." },
      { impact: "disruption" },
      { say: "Impact: once the electrolyte chain empties, Leipzig runs short of cells on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: {{var}}; tyres and brakes have enough stock behind them." },
      { map: { plant_ids: ["PL-LEJ"], state: "affected" } },

      { state: "diagnosing" },
      { tool: "erp_get_supplier", input: { supplier_id: "S-WRO-CELL" } },
      { say: "Response levers: move the barge cargo to rail from Duisburg (two extra days) or to road (one extra day, at more than twice the rail premium). As a last resort, the cell plants can draw up to 40 % of their electrolyte from an approved Korean source via Polish consignment stock, with eight days' lead time." },

      { options: {
        recommended: "V1",
        baseline_description: "Keep shipping on part-loaded barges; the electrolyte chain empties and Leipzig's cell supply follows.",
        texts: {
          V1: {
            title: "Shift Kaub-bound cargo to rail",
            description: "Book rail from Duisburg for all three Kaub corridors: solvents to Ludwigshafen, rubber to Karlsruhe and calipers to Frankfurt.",
            residual_risk: "Rail slots on the Rhine corridor tighten as other shippers switch; they need booking today."
          },
          V2: {
            title: "Truck the solvents to Ludwigshafen",
            description: "Move only the solvent cargo from Rotterdam-Botlek to ISO-tank trucks; rubber and calipers stay on part-loaded barges.",
            residual_risk: "Dangerous-goods tankers are scarce, and road costs more than twice as much as rail per container."
          },
          V3: {
            title: "Contingency electrolyte for the cell plants",
            description: "Let all three cell suppliers draw 40 % of their electrolyte from the approved Korean source via Polish consignment stock.",
            residual_risk: "Highest cost; Ludwigshafen still runs short, and the contingency covers only 40 % of electrolyte demand."
          }
        }
      } },
      { say: "Recommendation: option A. It costs {{V1.mit}} and removes the {{var}} exposure, the lowest expected total; rail also protects rubber and calipers if the low water lasts longer than forecast." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. Options B and C remain: B protects the solvent flow by road, C protects the cell plants directly at a higher cost.",
          V2: "Option B rejected. Option A protects all three corridors at a lower cost; option C remains as the last resort.",
          V3: "Option C rejected. Options A and B both protect the solvent flow before the electrolyte chain empties."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the rail booking for the solvents and the notices to the solvent and tyre suppliers. Each draft waits for your approval in the Outbox; nothing is sent." },
            { draft: {
              type: "booking", recipient: "Contracted rail operator (framework agreement)",
              subject: "Mock booking: tank-wagon trains Duisburg → Ludwigshafen, 3 per week",
              body: "Lane: Duisburg (DE) → Ludwigshafen (DE); solvents transferred from tank barge to tank wagons in Duisburg\nService: block train of tank wagons for dangerous goods (RID), about 2 days\nFrequency: 3 departures per week, sized to Rhein-Neckar Elektrolyt's consumption\nPeriod: {{date:+3}} to {{date:+42}}\nCargo: battery-grade carbonate solvents (EC/DMC)\nReference: Navigator option A, Rhine low-water response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { draft: {
              type: "email", recipient: "Botlek Solvents B.V. (logistics)",
              subject: "Solvent deliveries to Ludwigshafen: rail from Duisburg from {{date:+3}}",
              body: "Dear Botlek Solvents team,\n\nThe low water at Kaub restricts the Middle Rhine to part loads. From {{date:+3}}, please route our solvent deliveries for Rhein-Neckar Elektrolyt, Ludwigshafen, via Duisburg, where they transfer to tank-wagon trains we have booked.\n\nRequest\n- Keep tank-barge loading in Botlek unchanged as far as Duisburg\n- Prepare the rail transport documents (RID) for the Duisburg transfer\n- Confirm your next two loading dates by 12:00 tomorrow\n\nKind regards\nPurchasing, Battery Materials\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Oberrhein Reifenwerke GmbH, Karlsruhe (supply chain)",
              subject: "Natural rubber: rail from Duisburg while the Rhine is low",
              body: "Dear Oberrhein Reifenwerke team,\n\nBecause of the low water at Kaub, we have booked rail capacity from Duisburg for inbound natural rubber to Karlsruhe until the Rhine recovers. The barge now between Koblenz and Kaub with 400 t completes its trip part-loaded; later lots move to rail in Duisburg.\n\nPlease confirm your current rubber stock and tell us whether rail delivery to your siding needs any adjustment.\n\nKind regards\nPurchasing, Chassis\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-LUD-ELY", "S-KAR-TYR", "S-FRA-BRK"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Rhine low water at Kaub: response decision\n\n**What happened.** The Rhine gauge at Kaub reads 78 cm and is falling; barges can carry about a quarter of a normal load. The gauge and market reports confirm it, and the forecast keeps Kaub below 80 cm for four to six weeks.\n\n**If we do nothing.** The solvent barge to Rhein-Neckar Elektrolyt, our only electrolyte source, cannot deliver in full. Leipzig runs short of battery cells on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option A approved: move all Kaub-bound cargo to rail from Duisburg.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Mitigation cost | – | {{V1.mit}} |\n| Remaining exposure (30 days) | {{var}} | {{V1.res}} |\n| Expected total | {{var}} | {{V1.total}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox. They are drafts: nothing was sent.\n\n**Residual risk.** Rail slots on the Rhine corridor tighten as other shippers switch. The tier-2 electrolyte dependency remains a single point of failure worth a structural fix.\n\n**How we know.** The Kaub gauge, market reports and the waterway forecast; exposure from ERP master data; stop dates and euro figures from the deterministic impact engine.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the road-tanker booking and the notice to the solvent supplier; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "booking", recipient: "Contracted chemical road haulier (framework agreement)",
              subject: "Mock booking: ISO-tank trucks Rotterdam-Botlek → Ludwigshafen, daily",
              body: "Lane: Rotterdam-Botlek (NL) → Ludwigshafen (DE)\nService: ISO-tank trucks for dangerous goods (ADR), about 1 day\nFrequency: daily, sized to Rhein-Neckar Elektrolyt's solvent consumption\nPeriod: {{date:+1}} to {{date:+42}}\nCargo: battery-grade carbonate solvents (EC/DMC)\nReference: Navigator option B, Rhine low-water response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { draft: {
              type: "email", recipient: "Botlek Solvents B.V. (logistics)",
              subject: "Solvent deliveries to Ludwigshafen by road tanker from {{date:+1}}",
              body: "Dear Botlek Solvents team,\n\nThe low water at Kaub restricts the Middle Rhine to part loads. From {{date:+1}}, please load our solvent deliveries for Rhein-Neckar Elektrolyt into ISO-tank trucks that we have booked, instead of the tank barge.\n\nPlease confirm the loading slots for the first three days by 12:00 tomorrow.\n\nKind regards\nPurchasing, Battery Materials\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-LUD-ELY"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Rhine low water at Kaub: response decision\n\n**What happened.** The Kaub gauge reads 78 cm and is falling; barges carry about a quarter of a normal load, likely for four to six weeks.\n\n**If we do nothing.** Leipzig runs short of battery cells on day {{first_stop_day}} ({{first_stop_date}}), because the solvent barge to our only electrolyte supplier cannot deliver in full. Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option B approved: solvents by ISO-tank truck from Rotterdam-Botlek to Ludwigshafen. Mitigation cost {{V2.mit}}; remaining exposure {{V2.res}}; expected total {{V2.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** Dangerous-goods tankers are scarce; rubber and calipers stay on part-loaded barges.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the contingency releases for the three cell suppliers; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Odra Cell Systems Sp. z o.o., Wrocław (supply chain)",
              subject: "Release contingency electrolyte (40 %) from {{date:+8}}",
              body: "Dear Odra Cell Systems team,\n\nLow water on the Rhine is cutting the solvent supply of Rhein-Neckar Elektrolyt. Please draw 40 % of your electrolyte from the approved Korean source via the Polish consignment stock from {{date:+8}} until further notice.\n\nPlease confirm the call-off and your current electrolyte stock by 12:00 tomorrow.\n\nKind regards\nPurchasing, Battery Materials\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Puszta Energy Cells Kft., Debrecen (supply chain)",
              subject: "Release contingency electrolyte (40 %) from {{date:+8}}",
              body: "Dear Puszta Energy Cells team,\n\nLow water on the Rhine is cutting the solvent supply of Rhein-Neckar Elektrolyt. Please draw 40 % of your electrolyte from the approved Korean source via the Polish consignment stock from {{date:+8}} until further notice.\n\nPlease confirm the call-off and your current electrolyte stock by 12:00 tomorrow.\n\nKind regards\nPurchasing, Battery Materials\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Göd Battery Works Kft., Göd (supply chain)",
              subject: "Release contingency electrolyte (40 %) from {{date:+8}}",
              body: "Dear Göd Battery Works team,\n\nLow water on the Rhine is cutting the solvent supply of Rhein-Neckar Elektrolyt. Please draw 40 % of your electrolyte from the approved Korean source via the Polish consignment stock from {{date:+8}} until further notice.\n\nPlease confirm the call-off and your current electrolyte stock by 12:00 tomorrow.\n\nKind regards\nPurchasing, Battery Materials\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-WRO-CELL", "S-DEB-CELL", "S-GOD-CELL"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Rhine low water at Kaub: response decision\n\n**What happened.** The Kaub gauge reads 78 cm and is falling; barges carry about a quarter of a normal load, likely for four to six weeks.\n\n**If we do nothing.** Leipzig runs short of battery cells on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option C approved: the three cell suppliers draw 40 % of their electrolyte from the approved Korean contingency source. Mitigation cost {{V3.mit}}; remaining exposure {{V3.res}}; expected total {{V3.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** Rhein-Neckar Elektrolyt still runs short; the contingency covers only 40 % of electrolyte demand.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "Risk accepted. I will not contact any supplier or carrier. Drafting an internal note so Leipzig can plan for the expected cell shortage." },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Expected line stop from {{first_stop_date}}: battery cell shortage",
              body: "Decision: accept the supply risk from the Rhine low water at Kaub; no mitigation ordered.\n\nExpected impact\n- The solvent supply of our only electrolyte maker falls short; cells run short on day {{first_stop_day}} ({{first_stop_date}})\n- Value at risk over 30 days: {{var}}\n\nPlease prepare shift and staffing plans for a stoppage and inform the works council and logistics.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Rhine low water at Kaub: risk accepted\n\n**What happened.** The Kaub gauge reads 78 cm and is falling; barge capacity is down to about a quarter.\n\n**Decision.** Do nothing; the risk is accepted. Expected first line stop on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal notes approved.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-HSC-QUAKE": {
    title: "M6.4 earthquake near Hsinchu, Taiwan",
    steps: [
      { state: "scanning" },
      { say: "Signal received: social media reports a magnitude 6.4 earthquake near Hsinchu, Taiwan, with fabs in the Science Park evacuating staff. First question: what do we source from Hsinchu?" },
      { tool: "erp_list_suppliers", input: { region: "TW" } },
      { say: "Hypothesis: our exposure is microcontrollers. Hsinchu Microcontroller Foundry (S-HSC-MCU) is the only source of Győr's inverter control chip and supplies 55 % of the MCUs in Leipzig's chain; a power-module fab and two electronics suppliers sit nearby." },
      { map: { supplier_ids: ["S-HSC-MCU", "S-HSC-PSM", "S-ZHB-DDI", "S-TAO-PCB"], state: "at_risk", focus: { lat: 24.8, lon: 121.0, zoom: 8 } } },

      { state: "verifying" },
      { geo: "geo_earthquakes", input: { min_magnitude: 5, days: 1 },
        summary: "M6.4, 18 km south-east of Hsinchu at 14 km depth; four of our suppliers within 40 km",
        result: {
          source: "USGS earthquake feed 4.5_day (representative values)",
          window_days: 1, min_magnitude: 5, total_events: 3,
          within_300_km_of_nordwerk: [{
            magnitude: 6.4, place: "18 km SE of Hsinchu, Taiwan", time_utc: "today, 03:41 UTC",
            lat: 24.71, lon: 121.12, depth_km: 14, pager_alert: "yellow", tsunami: false,
            near_nordwerk: [
              { id: "S-HSC-PSM", name: "Formosa Wide-Bandgap Semiconductor Corp.", kind: "tier-2 supplier", distance_km: 14 },
              { id: "S-HSC-MCU", name: "Hsinchu Microcontroller Foundry Corp.", kind: "tier-2 supplier", distance_km: 15 },
              { id: "S-ZHB-DDI", name: "Zhubei Display Driver Semiconductor Corp.", kind: "tier-2 supplier", distance_km: 17 },
              { id: "S-TAO-PCB", name: "Taoyuan Circuit Boards Co., Ltd.", kind: "tier-2 supplier", distance_km: 36 },
              { id: "N-TPE", name: "Taipei Taoyuan International Airport", kind: "logistics node (airport)", distance_km: 43 }
            ]
          }],
          strongest_elsewhere: []
        } },
      { say: "Confirmed: the USGS feed records an M6.4 earthquake 18 km south-east of Hsinchu at 14 km depth, within 20 km of three of our suppliers. Seismic data and the first reports agree on the event." },
      { say: "Check: a strong quake near the fabs does not yet mean they are damaged. I look for the science park's own statement." },
      { web: {
        query: "Hsinchu Science Park fabs earthquake evacuation inspection",
        summary: "1 result: the science-park administration's statement in the business press",
        results: [
          { title: "Science Park: fabs evacuated for tool inspections, no structural damage reported so far", source: "Science-park administration statement quoted by the business press", page_age: "today" }
        ]
      } },
      { alert: {
        title: "M6.4 earthquake hits the Hsinchu semiconductor cluster",
        severity: "critical",
        summary: "A shallow M6.4 quake struck near Hsinchu Science Park, and fabs are evacuated for inspections. Our only source of Győr's inverter MCU is there.",
        supplier_ids: ["S-HSC-MCU", "S-HSC-PSM", "S-ZHB-DDI", "S-TAO-PCB"],
        sources: [
          { title: "USGS earthquake feed (representative reading)" },
          { title: "Science-park administration statement quoted by the business press (representative)" }
        ]
      } },

      { state: "diagnosing" },
      { tool: "erp_get_part", input: { part_id: "P-MCU" } },
      { say: "Finding: Leipzig's chain holds 12 days of MCUs and has two European second sources, in Dresden and Crolles. Győr's inverter chain holds five days and has none." },
      { tool: "erp_get_part", input: { part_id: "P-INV" } },
      { say: "Finding: Győr holds four more days of finished inverters. The chain to Győr's inverter line is the weak point." },
      { map: { supplier_ids: ["S-HAT-INV", "S-NUE-INV"], plant_ids: ["PL-GYR"], state: "at_risk", fit: ["S-HSC-MCU", "S-HAT-INV", "S-NUE-INV", "PL-GYR", "PL-LEJ"] } },
      { say: "First estimate, taking the worst case from the first reports: both Hsinchu fabs produce nothing for three weeks, and the board and display-driver suppliers lose ten days." },
      { impact: "hypothesis" },
      { say: "On that basis {{hyp.first_stop_plant}} stops on day {{hyp.first_stop_day}}, Leipzig follows when e-drive units run out, and value at risk is {{hyp.var}}. Before acting on a worst case, I check what the foundry itself reports." },
      { state: "verifying" },
      { web: {
        query: "Hsinchu Microcontroller Foundry earthquake restart output",
        summary: "1 result: a company statement quoted by business news",
        results: [
          { title: "Foundry plans restart within ten days; wafers in process scrapped, half output for three weeks", source: "Company statement quoted by business news", page_age: "today" }
        ]
      } },
      { say: "Revised: three weeks without output → ten days down, then half output for three weeks. The foundry reports no structural damage, but it is re-qualifying tools and has scrapped the wafers in process." },
      { impact: "disruption" },
      { say: "Impact: Győr stops on day {{first_stop_day}} ({{first_stop_date}}) when inverter MCUs run out, and Leipzig follows on day {{plant.PL-LEJ.first_stop_day}} for lack of e-drive units. Value at risk over 30 days: {{var}}, far below the first estimate." },
      { map: { plant_ids: ["PL-GYR"], state: "affected" } },
      { map: { plant_ids: ["PL-LEJ"], state: "at_risk" } },

      { state: "diagnosing" },
      { tool: "erp_get_alternatives", input: { part_id: "P-MCU" } },
      { say: "Response levers: buy inverter MCUs from brokers (up to 40 % of demand within four days, at a 300 % premium), or fast-track the pin-compatible MCU from Waal Microcontrollers in Nijmegen. It is already approved in a sister programme; firmware re-validation takes 21 days." },

      { options: {
        recommended: "V1",
        baseline_description: "Wait for Hsinchu to recover; Győr stops when inverter MCUs run out, and Leipzig follows.",
        texts: {
          V1: {
            title: "Broker buy of inverter MCUs",
            description: "Buy up to 40 % of the Győr chain's MCU demand from authorised brokers for four weeks, with incoming inspection.",
            residual_risk: "Broker parts need authenticity checks, and supply depends on broker stock."
          },
          V2: {
            title: "Nijmegen MCU fast-track plus broker bridge",
            description: "Option A, plus a 21-day fast-track qualification of the pin-compatible MCU from Waal Microcontrollers for up to 60 % of demand.",
            residual_risk: "The firmware re-validation must hold its 21 days; until then, option A's inspection risk applies."
          },
          V3: {
            title: "Nijmegen MCU fast-track only",
            description: "Qualify the Nijmegen MCU without buying from brokers.",
            residual_risk: "Győr stops before the new source delivers."
          }
        }
      } },
      { say: "Recommendation: option A. It costs {{V1.mit}} and removes the {{var}} exposure, the lowest expected total. Option B costs {{V2.mit}} and also ends Győr's dependence on a single fab; it is the better choice if aftershocks extend the outage." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. Option B adds the Nijmegen second source; option C avoids broker parts but leaves a gap at Győr.",
          V2: "Option B rejected. Option A covers the gap at the lowest cost; option C builds the second source without broker parts.",
          V3: "Option C rejected. Options A and B both keep Győr running."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the broker request and the notices to our two inverter suppliers. Each draft waits for your approval in the Outbox; nothing is sent." },
            { draft: {
              type: "email", recipient: "Authorised electronic-components distributor (key account)",
              subject: "Request: inverter control MCUs, up to 680 pcs per day from {{date:+4}}",
              body: "Dear key account team,\n\nAn earthquake has interrupted the foundry that makes our inverter control MCU. We are looking for authorised stock of the same part number to bridge the gap.\n\nRequest\n- Quantity: up to 680 pcs per day (40 % of demand) for four weeks, first delivery {{date:+4}}\n- Delivery to our inverter suppliers in Hatvan (HU) and Nuremberg (DE)\n- Full traceability to the original manufacturer; no grey-market lots\n\nPlease send available quantities, date codes and prices by 12:00 tomorrow.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Pannonia Power Electronics Kft., Hatvan (supply chain)",
              subject: "Broker-sourced inverter MCUs from {{date:+4}}: incoming inspection",
              body: "Dear Pannonia Power Electronics team,\n\nThe earthquake near Hsinchu interrupts your supply of inverter control MCUs. We are buying authorised broker stock of the same part number; first deliveries reach you from {{date:+4}}.\n\nPlease run full incoming inspection (authenticity and date codes) on every broker lot, keep these lots segregated and report your current MCU stock by 12:00 tomorrow.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Franken Drive Electronics GmbH, Nuremberg (supply chain)",
              subject: "Broker-sourced inverter MCUs from {{date:+4}}: incoming inspection",
              body: "Dear Franken Drive Electronics team,\n\nThe earthquake near Hsinchu interrupts your supply of inverter control MCUs. We are buying authorised broker stock of the same part number; first deliveries reach you from {{date:+4}}.\n\nPlease run full incoming inspection (authenticity and date codes) on every broker lot, keep these lots segregated and report your current MCU stock by 12:00 tomorrow.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-HAT-INV", "S-NUE-INV"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Hsinchu earthquake: response decision\n\n**What happened.** An M6.4 earthquake struck 18 km from Hsinchu Science Park. The USGS feed and the science-park administration confirm it; our MCU foundry expects ten days without output, then half output for three weeks.\n\n**If we do nothing.** The foundry is the only source of Győr's inverter MCU. Győr stops on day {{first_stop_day}} ({{first_stop_date}}) and Leipzig follows on day {{plant.PL-LEJ.first_stop_day}} for lack of e-drive units. Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option A approved: buy up to 40 % of the Győr chain's MCU demand from authorised brokers, with incoming inspection.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Mitigation cost | – | {{V1.mit}} |\n| Remaining exposure (30 days) | {{var}} | {{V1.res}} |\n| Expected total | {{var}} | {{V1.total}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox. They are drafts: nothing was sent.\n\n**Residual risk.** Broker supply and authenticity; Győr stays single-sourced. Qualifying the Nijmegen MCU (option B) would remove that dependency for {{V2.mit}} in total.\n\n**How we know.** Seismic data and official statements; exposure from ERP master data; stop dates and euro figures from the deterministic impact engine.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the broker request, the fast-track request to Nijmegen and the notices to our two inverter suppliers; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Authorised electronic-components distributor (key account)",
              subject: "Request: inverter control MCUs, up to 680 pcs per day from {{date:+4}}",
              body: "Dear key account team,\n\nAn earthquake has interrupted the foundry that makes our inverter control MCU. We are looking for authorised stock of the same part number to bridge the gap.\n\nRequest\n- Quantity: up to 680 pcs per day (40 % of demand) for four weeks, first delivery {{date:+4}}\n- Delivery to our inverter suppliers in Hatvan (HU) and Nuremberg (DE)\n- Full traceability to the original manufacturer; no grey-market lots\n\nPlease send available quantities, date codes and prices by 12:00 tomorrow.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Waal Microcontrollers B.V., Nijmegen (sales)",
              subject: "Fast-track qualification of your pin-compatible inverter MCU",
              body: "Dear Waal Microcontrollers team,\n\nAn earthquake near Hsinchu has interrupted the foundry that makes our inverter control MCU. Your pin-compatible variant is already approved in a sister programme, and we would like to qualify it for the NW-e7 inverter on a fast track.\n\nTarget\n- Firmware re-validation and release within 21 days\n- Up to 60 % of demand (about 1,020 pcs per day) from {{date:+22}}\n- Commercials: we cover qualification costs up to €320,000 and accept the agreed 8 % premium\n\nPlease nominate a project lead today; our inverter suppliers' engineers can start tomorrow.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Pannonia Power Electronics Kft., Hatvan (engineering)",
              subject: "Broker MCUs from {{date:+4}} and firmware re-validation for the Nijmegen MCU",
              body: "Dear Pannonia Power Electronics team,\n\nTo bridge the Hsinchu outage, authorised broker MCUs reach you from {{date:+4}}; please inspect and segregate every lot. In parallel, we are qualifying the pin-compatible MCU from Waal Microcontrollers in Nijmegen.\n\nPlease start the firmware re-validation for the new MCU tomorrow, aiming for release within 21 days, and share your test plan within two days.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Franken Drive Electronics GmbH, Nuremberg (engineering)",
              subject: "Broker MCUs from {{date:+4}} and firmware re-validation for the Nijmegen MCU",
              body: "Dear Franken Drive Electronics team,\n\nTo bridge the Hsinchu outage, authorised broker MCUs reach you from {{date:+4}}; please inspect and segregate every lot. In parallel, we are qualifying the pin-compatible MCU from Waal Microcontrollers in Nijmegen.\n\nPlease start the firmware re-validation for the new MCU tomorrow, aiming for release within 21 days, and share your test plan within two days.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-HAT-INV", "S-NUE-INV", "A-NIJ-MCU"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Hsinchu earthquake: response decision\n\n**What happened.** An M6.4 earthquake struck 18 km from Hsinchu Science Park; our MCU foundry expects ten days without output, then half output for three weeks.\n\n**If we do nothing.** Győr stops on day {{first_stop_day}} ({{first_stop_date}}) and Leipzig follows on day {{plant.PL-LEJ.first_stop_day}}. Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option B approved: broker MCUs bridge the gap while the pin-compatible MCU from Nijmegen is qualified on a 21-day fast track.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Mitigation cost | – | {{V2.mit}} |\n| Remaining exposure (30 days) | {{var}} | {{V2.res}} |\n| Expected total | {{var}} | {{V2.total}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox. They are drafts: nothing was sent.\n\n**Residual risk.** The firmware re-validation must hold its 21 days. Afterwards Győr has two MCU sources instead of one.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the fast-track request to Nijmegen and a re-plan note for Győr; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Waal Microcontrollers B.V., Nijmegen (sales)",
              subject: "Fast-track qualification of your pin-compatible inverter MCU",
              body: "Dear Waal Microcontrollers team,\n\nAn earthquake near Hsinchu has interrupted the foundry that makes our inverter control MCU. We would like to qualify your pin-compatible variant for the NW-e7 inverter on a fast track: firmware re-validation within 21 days and up to 60 % of demand (about 1,020 pcs per day) from {{date:+22}}.\n\nWe cover qualification costs up to €320,000 and accept the agreed 8 % premium. Please nominate a project lead today.\n\nKind regards\nPurchasing, Semiconductors\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "replan", recipient: "Győr plant management",
              subject: "Inverter shortage from {{first_stop_date}} until the Nijmegen MCU delivers",
              body: "Decision: option C approved. The pin-compatible MCU from Nijmegen is qualified on a 21-day fast track; no broker parts are bought.\n\nExpected impact\n- Inverter MCUs run out and Győr stops on day {{first_stop_day}} ({{first_stop_date}})\n- The new source delivers from {{date:+22}}\n- Remaining exposure over 30 days: {{V3.res}}\n\nPlease plan reduced output and inform Leipzig about e-drive unit volumes.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["A-NIJ-MCU"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Hsinchu earthquake: response decision\n\n**What happened.** An M6.4 earthquake struck 18 km from Hsinchu Science Park; our MCU foundry expects ten days without output, then half output for three weeks.\n\n**If we do nothing.** Győr stops on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Decision.** Option C approved: fast-track the pin-compatible MCU from Nijmegen, without broker parts. Mitigation cost {{V3.mit}}; remaining exposure {{V3.res}}; expected total {{V3.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** Győr stops before the new source delivers.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "Risk accepted. I will not contact any supplier. Drafting an internal note so Győr can plan for the expected stoppage." },
            { draft: {
              type: "replan", recipient: "Győr plant management",
              subject: "Expected line stop from {{first_stop_date}}: inverter MCU shortage",
              body: "Decision: accept the supply risk from the Hsinchu earthquake; no mitigation ordered.\n\nExpected impact\n- Inverter MCUs run out; Győr stops on day {{first_stop_day}} ({{first_stop_date}})\n- Leipzig follows on day {{plant.PL-LEJ.first_stop_day}} for lack of e-drive units\n- Value at risk over 30 days: {{var}}\n\nPlease prepare shift plans for a stoppage and inform Leipzig and the works council.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Hsinchu earthquake: risk accepted\n\n**What happened.** An M6.4 earthquake struck 18 km from Hsinchu Science Park, home of our only inverter MCU source.\n\n**Decision.** Do nothing; the risk is accepted. Expected first line stop on day {{first_stop_day}} ({{first_stop_date}}) at Győr; value at risk over 30 days **{{var}}**.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal notes approved.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-STYRIA-FLOOD": {
    title: "Flooding in the Slovenian/Styrian castings region",
    steps: [
      { state: "scanning" },
      { say: "Signal received: regional news reports flash floods along the Drava and Mur after 48 hours of torrential rain, with industrial sites near Kidričevo, Ravne na Koroškem and Leoben affected. First question: who do we have there?" },
      { tool: "erp_list_suppliers", input: { region: "SI, AT" } },
      { say: "Hypothesis: the exposure is Drava Alloy Refining in Kidričevo (S-KID-ALY). It supplies all the alloy for our tier-1 caster Štajerska Lightmetal (S-SLB-CAST), which makes 60 % of Leipzig's rear megacastings." },
      { map: { supplier_ids: ["S-KID-ALY", "S-SLB-CAST"], state: "at_risk", focus: { lat: 46.7, lon: 15.3, zoom: 8 } } },

      { state: "verifying" },
      { geo: "geo_weather", input: { lat: 46.405, lon: 15.795, days: 7, past_days: 3 },
        summary: "148 mm of rain in 48 hours at Kidričevo; drying from tomorrow",
        result: {
          source: "Open-Meteo forecast API (representative values)",
          location: { lat: 46.405, lon: 15.795, timezone: "Europe/Ljubljana" },
          near: [
            { id: "S-KID-ALY", name: "Drava Alloy Refining d.o.o.", kind: "tier-2 supplier", distance_km: 0 },
            { id: "S-SLB-CAST", name: "Štajerska Lightmetal d.o.o.", kind: "tier-1 supplier", distance_km: 17 }
          ],
          past_days: 3, total_precip_mm: 156.2,
          flags: ["extreme rainfall 92 mm yesterday", "heavy rainfall 56 mm the day before"],
          assessment: "Weather events that can disrupt operations or transport."
        } },
      { say: "Check: the weather data confirms the rainfall, 148 mm in 48 hours at Kidričevo. Rain alone does not prove that a plant is flooded." },
      { web: {
        query: "Kidričevo flood industrial zone Drava aluminium",
        summary: "1 result: a report from the Slovenian public broadcaster",
        results: [
          { title: "Floods reach the Kidričevo industrial zone; aluminium plant halts production", source: "Slovenian public broadcaster", page_age: "today" }
        ]
      } },
      { say: "Confirmed: the regional broadcaster reports water in the Kidričevo industrial zone and a production halt at the aluminium site. Two independent sources agree." },
      { alert: {
        title: "Floods halt our alloy refiner in Kidričevo",
        severity: "high",
        summary: "Flash floods along the Drava have stopped Drava Alloy Refining (S-KID-ALY), the only alloy source of our caster Štajerska Lightmetal. Weather data and a regional broadcaster confirm it.",
        supplier_ids: ["S-KID-ALY"],
        sources: [
          { title: "Open-Meteo rainfall at Kidričevo (representative reading)" },
          { title: "Slovenian public broadcaster report (representative)" }
        ]
      } },

      { state: "diagnosing" },
      { tool: "erp_get_supplier", input: { supplier_id: "S-SLB-CAST" } },
      { say: "Finding: the caster holds four days of alloy and three days of heat treatment. Its only heat-treater is Mur Heat Treatment in Leoben (S-LEO-HTR), another place named in the report." },
      { tool: "erp_get_part", input: { part_id: "P-CAST" } },
      { say: "Finding: Leipzig holds four days of rear castings, with little line-side space for more. Val Trompia Fonderie in Brescia (S-BRE-CAST) makes the other 40 %." },
      { say: "First estimate: only the refiner is down, for about five days." },
      { impact: "hypothesis" },
      { say: "If only the refiner stops for five days, value at risk is {{hyp.var}}: the caster's alloy buffer bridges it. The report also names Leoben and Ravne, so I check those sites before relying on this." },
      { state: "verifying" },
      { web: {
        query: "Kidričevo Leoben flood damage restart aluminium heat treatment",
        summary: "2 results: Slovenian business news and an Austrian regional newspaper",
        results: [
          { title: "Kidričevo aluminium site: restart in about 12 days, at half output at first", source: "Slovenian business news", page_age: "today" },
          { title: "Mur floods Leoben industrial estate; heat-treatment furnaces under water", source: "Austrian regional newspaper", page_age: "today" }
        ]
      } },
      { web: {
        query: "Ravne na Koroškem forge flood Meža",
        summary: "1 result: Slovenian business news",
        results: [
          { title: "Meža floods forge hall in Ravne; restart expected in two weeks", source: "Slovenian business news", page_age: "today" }
        ]
      } },
      { say: "Revised: only the refiner, for five days → three sites down. The refiner is out for 12 days and then at half output, the Leoben heat-treater for an assumed 12 days, and the forge in Ravne for two weeks." },
      { impact: "disruption" },
      { say: "Impact: Leipzig runs out of rear megacastings on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: {{var}}; the brake suppliers' other hub sources cover the forge outage." },
      { map: { supplier_ids: ["S-LEO-HTR", "S-RAV-FRG"], state: "affected", fit: ["S-KID-ALY", "S-LEO-HTR", "S-RAV-FRG", "S-SLB-CAST", "S-BRE-CAST"] } },
      { map: { plant_ids: ["PL-LEJ"], state: "affected" } },

      { state: "diagnosing" },
      { tool: "erp_get_alternatives", input: { part_id: "P-CAST" } },
      { say: "Response levers: keep the Slovenian casting line running with spot alloy ingots from Austrian and Italian smelters (four days) and heat treatment subcontracted to Upper Austria (three days), or ask Brescia for 12 % more castings within seven days. New casting sources need 45 to 70 days to qualify, too slow for this event." },

      { options: {
        recommended: "V1",
        baseline_description: "Wait for the Slovenian and Austrian sites to recover; Leipzig runs out of rear megacastings on day {{first_stop_day}}.",
        texts: {
          V1: {
            title: "Keep the Slovenian casting line running",
            description: "Supply Štajerska Lightmetal with spot alloy ingots from Austrian and Italian smelters and subcontract its T6 heat treatment to Upper Austria.",
            residual_risk: "Spot alloy needs a chemistry release before casting, and the heat-treatment shuttle adds trucking."
          },
          V2: {
            title: "Surge Brescia castings",
            description: "Ask Val Trompia Fonderie for 12 % more rear castings at a 9 % premium.",
            residual_risk: "Covers only part of the gap; Leipzig still loses output while the Slovenian line is down."
          },
          V3: {
            title: "Slovenian contingency plus Brescia surge",
            description: "Option A plus the Brescia surge as a second safety net.",
            residual_risk: "Highest cost; the extra Brescia volume insures against delays in option A."
          }
        }
      } },
      { say: "Recommendation: option A. It costs {{V1.mit}} and removes the {{var}} exposure, the lowest expected total; option C adds Brescia's surge as a safety net for {{V3.mit}} in total." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. Option B relies on Brescia alone; option C combines both measures.",
          V2: "Option B rejected. Option A removes the exposure; option C adds Brescia on top.",
          V3: "Option C rejected. Option A removes the exposure at a lower cost; option B is the low-cost partial fix."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the requests to the caster and the heat-treatment subcontractor, and the truck shuttle between them. Each draft waits for your approval in the Outbox; nothing is sent." },
            { draft: {
              type: "email", recipient: "Štajerska Lightmetal d.o.o., Slovenska Bistrica (supply chain)",
              subject: "Flood contingency: spot alloy and subcontracted T6 heat treatment from {{date:+3}}",
              body: "Dear Štajerska Lightmetal team,\n\nThe floods have stopped your alloy supplier in Kidričevo and your heat-treater in Leoben. To keep your casting line for our rear megacastings running, we release both contingencies.\n\nRequest\n- Spot alloy ingots from Austrian and Italian smelters for up to 60 % of your requirement, first lots from {{date:+4}}, released by chemistry analysis before casting\n- T6 heat treatment subcontracted to the approved heat-treater in Upper Austria for up to 70 % of volume, from {{date:+3}}\n\nWe cover the extra cost against invoices. Please confirm both call-offs and your current stock by 18:00 today.\n\nKind regards\nPurchasing, Body\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Approved heat-treatment subcontractor, Upper Austria (sales)",
              subject: "T6 heat treatment for rear megacastings from {{date:+3}}",
              body: "Dear sales team,\n\nFloods have stopped the heat-treater of our caster Štajerska Lightmetal. We would like you to take over T6 heat treatment of our rear megacastings for up to 70 % of volume from {{date:+3}}, for about four weeks.\n\nPlease confirm furnace capacity, lead time per batch and your price by 12:00 tomorrow.\n\nKind regards\nPurchasing, Body\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "booking", recipient: "Contracted road haulier (framework agreement)",
              subject: "Mock booking: casting shuttle Slovenska Bistrica ↔ Upper Austria",
              body: "Lane: Slovenska Bistrica (SI) ↔ Upper Austria (AT), round trip\nService: dedicated trucks for large castings in special racks, about 5 h each way\nFrequency: 4 round trips per day\nPeriod: {{date:+3}} to {{date:+30}}\nCargo: rear megacastings before and after T6 heat treatment\nReference: Navigator option A, Drava/Mur flood response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { map: { supplier_ids: ["S-SLB-CAST"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Drava and Mur floods: response decision\n\n**What happened.** Flash floods along the Drava and Mur have stopped three of our tier-2 sites: the alloy refiner in Kidričevo, the heat-treater in Leoben and a forge in Ravne. Weather data and regional media confirm it.\n\n**If we do nothing.** Our caster Štajerska Lightmetal runs out of alloy and heat treatment, and Leipzig runs out of rear megacastings on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option A approved: keep the Slovenian casting line running with spot alloy and subcontracted heat treatment.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Mitigation cost | – | {{V1.mit}} |\n| Remaining exposure (30 days) | {{var}} | {{V1.res}} |\n| Expected total | {{var}} | {{V1.total}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox. They are drafts: nothing was sent.\n\n**Residual risk.** Spot alloy needs a chemistry release before casting; the heat-treatment shuttle adds trucking.\n\n**How we know.** Weather data and regional reports; exposure from ERP master data; stop dates and euro figures from the deterministic impact engine.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the surge request to Brescia and a re-plan note for Leipzig; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Val Trompia Fonderie S.p.A., Brescia (key account)",
              subject: "Capacity request: +12 % rear megacastings for Leipzig from {{date:+7}}",
              body: "Dear Val Trompia Fonderie team,\n\nFloods have stopped the supply chain of our second rear-casting source in Slovenia. We ask you to raise deliveries to Leipzig by 12 % of demand (about 100 sets per day) from {{date:+7}} for at least four weeks.\n\nWe accept a premium of up to 9 % on the additional volume. Please confirm feasibility and your alloy availability by 18:00 tomorrow.\n\nKind regards\nPurchasing, Body\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Reduced rear-casting supply from {{first_stop_date}}: plan for lower output",
              body: "Decision: option B approved. Brescia raises rear-casting deliveries by 12 % from {{date:+7}}; the Slovenian source stays down.\n\nExpected impact\n- Rear megacastings run short from day {{V2.first_stop_day}}\n- Remaining exposure over 30 days: {{V2.res}}\n\nPlease plan a reduced line rate and prioritise the build sequence accordingly.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-BRE-CAST"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Drava and Mur floods: response decision\n\n**What happened.** Flash floods have stopped the alloy refiner, the heat-treater and a forge that supply our Slovenian caster.\n\n**If we do nothing.** Leipzig runs out of rear megacastings on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option B approved: Brescia raises its share by 12 %. Mitigation cost {{V2.mit}}; remaining exposure {{V2.res}}; expected total {{V2.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** Brescia covers only part of the gap; Leipzig runs at a reduced rate until the Slovenian line restarts.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the Slovenian contingency, the heat-treatment subcontract and the Brescia surge; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Štajerska Lightmetal d.o.o., Slovenska Bistrica (supply chain)",
              subject: "Flood contingency: spot alloy and subcontracted T6 heat treatment from {{date:+3}}",
              body: "Dear Štajerska Lightmetal team,\n\nThe floods have stopped your alloy supplier and your heat-treater. We release spot alloy ingots from Austrian and Italian smelters (up to 60 %, from {{date:+4}}) and T6 heat treatment at the approved subcontractor in Upper Austria (up to 70 %, from {{date:+3}}).\n\nPlease confirm both call-offs and your current stock by 18:00 today.\n\nKind regards\nPurchasing, Body\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Approved heat-treatment subcontractor, Upper Austria (sales)",
              subject: "T6 heat treatment for rear megacastings from {{date:+3}}",
              body: "Dear sales team,\n\nFloods have stopped the heat-treater of our caster Štajerska Lightmetal. Please take over T6 heat treatment of our rear megacastings for up to 70 % of volume from {{date:+3}}, for about four weeks, and confirm capacity and price by 12:00 tomorrow.\n\nKind regards\nPurchasing, Body\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Val Trompia Fonderie S.p.A., Brescia (key account)",
              subject: "Capacity request: +12 % rear megacastings for Leipzig from {{date:+7}}",
              body: "Dear Val Trompia Fonderie team,\n\nAs a safety net while our Slovenian source recovers from the floods, please raise deliveries to Leipzig by 12 % of demand (about 100 sets per day) from {{date:+7}} for four weeks. We accept a premium of up to 9 % on the additional volume.\n\nKind regards\nPurchasing, Body\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-SLB-CAST", "S-BRE-CAST"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Drava and Mur floods: response decision\n\n**What happened.** Flash floods have stopped the alloy refiner, the heat-treater and a forge that supply our Slovenian caster.\n\n**If we do nothing.** Leipzig runs out of rear megacastings on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option C approved: the Slovenian contingency plus a 12 % surge in Brescia. Mitigation cost {{V3.mit}}; remaining exposure {{V3.res}}; expected total {{V3.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** Low; the Brescia surge insures against delays in the contingency.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "Risk accepted. I will not contact any supplier. Drafting an internal note so Leipzig can plan for the expected stoppage." },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Expected line stop from {{first_stop_date}}: rear megacasting shortage",
              body: "Decision: accept the supply risk from the Drava and Mur floods; no mitigation ordered.\n\nExpected impact\n- Rear megacastings run out on day {{first_stop_day}} ({{first_stop_date}})\n- Value at risk over 30 days: {{var}}\n\nPlease prepare shift and staffing plans for a stoppage and inform the works council and logistics.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Drava and Mur floods: risk accepted\n\n**What happened.** Flash floods have stopped three tier-2 sites behind our Slovenian caster.\n\n**Decision.** Do nothing; the risk is accepted. Expected first line stop on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal notes approved.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-REDSEA": {
    title: "Red Sea security situation, Cape rerouting",
    steps: [
      { state: "scanning" },
      { say: "Signal received: a carrier advisory announces that Asia–North Europe and Asia–Mediterranean services will sail around the Cape of Good Hope until further notice. First question: which of our flows use the Red Sea?" },
      { tool: "erp_get_routes", input: { node_or_supplier: "N-BAB" } },
      { say: "Hypothesis: the most exposed part is e-motor magnets for Győr. Ningbo Permanent Magnet ships them through Suez to Koper, and rare-earth magnets are hard to replace." },
      { map: { node_ids: ["N-BAB", "N-SUZ"], route_ids: ["R-SEA-CN-KOP-GYR", "R-SEA-TW-RTM-LEJ", "R-SEA-TH-RTM-LEJ", "R-SEA-KR-RTM-CE", "R-SEA-CN-HAM-CE"], state: "at_risk", focus: { lat: 22.0, lon: 55.0, zoom: 3 } } },

      { state: "verifying" },
      { web: {
        query: "carrier advisory Red Sea Cape of Good Hope rerouting Asia North Europe",
        summary: "2 results: a carrier advisory and maritime trade press",
        results: [
          { title: "Carrier reroutes Asia–Europe loops via the Cape of Good Hope until further notice", source: "Carrier customer advisory", page_age: "today" },
          { title: "Second major carrier announces Cape diversions for Asia–Europe services", source: "Maritime trade press", page_age: "today" }
        ]
      } },
      { say: "Check: two carriers announce Cape diversions independently. I also look for an official maritime security notice." },
      { web: {
        query: "maritime security advisory southern Red Sea Gulf of Aden threat level",
        summary: "1 result: an official maritime security advisory",
        results: [
          { title: "Maritime security centre raises the threat level for the southern Red Sea and Gulf of Aden", source: "Official maritime security advisory", page_age: "yesterday" }
        ]
      } },
      { say: "Confirmed: carrier advisories and an official security notice agree. Asia–Europe container traffic is moving to the Cape route." },
      { alert: {
        title: "Red Sea diversions lengthen Asia–Europe shipping",
        severity: "high",
        summary: "Carriers are rerouting Asia–Europe services around the Cape of Good Hope. Eight of our sea corridors use the Red Sea.",
        node_ids: ["N-BAB", "N-SUZ"],
        sources: [
          { title: "Carrier customer advisory (representative)" },
          { title: "Official maritime security advisory (representative)" }
        ]
      } },
      { map: { route_ids: ["ALT-CAPE"], state: "at_risk" } },

      { state: "diagnosing" },
      { tool: "erp_get_open_pos", input: { node_id: "N-BAB" } },
      { tool: "erp_get_part", input: { part_id: "P-MAG" } },
      { say: "Revised: magnets are the critical part → displays are. Győr holds 45 days of magnets as strategic stock, while 60 % of Leipzig's displays come by sea from Tainan." },
      { tool: "erp_get_part", input: { part_id: "P-DSP" } },
      { say: "Finding: Leipzig holds six days of displays, and four display shipments are at sea. Hefei by rail (25 %) and Lahn Display Modules in Wetzlar (15 %) are not affected." },
      { map: { supplier_ids: ["S-TNN-DSP"], state: "at_risk" } },
      { say: "First estimate, at the low end of the carriers' range: ten extra days in transit." },
      { impact: "hypothesis" },
      { say: "With ten extra days, value at risk is {{hyp.var}}: display stock and the unaffected sources just bridge the gap. The margin is thin, so I check what the carriers quote for our lanes." },
      { state: "verifying" },
      { web: {
        query: "Cape of Good Hope diversion transit time Far East North Europe extra days",
        summary: "1 result: a freight-rate service",
        results: [
          { title: "Cape routing adds about 12 days on Far East–North Europe loops, carriers say", source: "Freight-rate service", page_age: "today" }
        ]
      } },
      { say: "Revised: ten extra days → twelve. Carriers quote twelve days for Far East–North Europe services, and those two days use up the display margin." },
      { impact: "disruption" },
      { say: "Impact: Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: {{var}}; magnets, cathode material and tyres stay covered." },
      { map: { plant_ids: ["PL-LEJ"], state: "affected" } },

      { state: "diagnosing" },
      { tool: "erp_get_alternatives", input: { part_id: "P-DSP" } },
      { say: "Response levers: an air-freight bridge from Tainan (€12 a set, four days' lead time), more volume from Hefei by rail (+15 %) and Lahn in Wetzlar (+10 %), or building without displays for up to eight days with a yard retrofit." },

      { options: {
        recommended: "V1",
        baseline_description: "Let the ships take the Cape route; Leipzig runs out of displays before the first rerouted ships arrive.",
        texts: {
          V1: {
            title: "Air-freight bridge for displays",
            description: "Fly up to 60 % of Leipzig's display demand from Tainan until the first Cape-routed ships arrive.",
            residual_risk: "Air rates rise as other shippers switch; capacity should be booked early."
          },
          V2: {
            title: "Surge Hefei by rail and Lahn in Wetzlar",
            description: "Ask Hefei for 15 % more displays by rail and Lahn Display Modules for 10 % more.",
            residual_risk: "Takes longest to arrive, and Hefei's extra volume depends on rail slots on the China–Europe corridor."
          },
          V3: {
            title: "Build without displays and retrofit",
            description: "Complete vehicles without displays when stock runs out and retrofit them in the yard (up to eight days).",
            residual_risk: "Yard rework capacity is limited, and vehicles cannot ship until retrofitted."
          }
        }
      } },
      { say: "Recommendation: option A. It costs {{V1.mit}} and removes the {{var}} exposure, the lowest expected total; option B is almost as cheap but needs {{V2.time}} days to take effect." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. Option B avoids air freight but takes longer; option C avoids any freight premium.",
          V2: "Option B rejected. Option A protects the line fastest; option C needs no supplier at all.",
          V3: "Option C rejected. Options A and B protect the line at a lower cost."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the air-freight booking and the shipping request to Tainan. Each draft waits for your approval in the Outbox; nothing is sent." },
            { draft: {
              type: "booking", recipient: "Contracted air-freight forwarder (framework agreement)",
              subject: "Mock booking: air freight of display sets Taipei → Leipzig/Halle",
              body: "Lane: Taipei Taoyuan (TW) → Leipzig/Halle (DE)\nService: air freight, about 4 days door to door\nVolume: up to 60 % of Leipzig's display demand (about 510 sets per day)\nPeriod: {{date:+4}} until the first Cape-routed ship arrives\nCargo: display sets (centre + cluster)\nReference: Navigator option A, Red Sea rerouting response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { draft: {
              type: "email", recipient: "Tainan Display Technologies Corp. (key account)",
              subject: "Ship display sets to Leipzig by air from {{date:+2}}",
              body: "Dear Tainan Display Technologies team,\n\nOur sea shipments from Kaohsiung now sail around the Cape of Good Hope, which adds about twelve days. Until the first rerouted ships arrive, we ask you to send part of our volume by air.\n\nRequest\n- Hand over up to 510 display sets per day to our forwarder at Taipei Taoyuan from {{date:+2}}\n- Keep the remaining volume on the sea schedule\n\nWe cover the air-freight cost. Please confirm the daily quantities you can release by 18:00 tomorrow.\n\nKind regards\nPurchasing, Electronics\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-TNN-DSP"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Red Sea rerouting: response decision\n\n**What happened.** Carriers are rerouting Asia–Europe services around the Cape of Good Hope; carrier advisories and an official maritime security notice confirm it. Carriers quote about twelve extra days for Far East–North Europe.\n\n**If we do nothing.** Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}): 60 % of them come by sea from Tainan. Magnets, cathode material and tyres stay covered. Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option A approved: an air-freight bridge for up to 60 % of Leipzig's displays.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Mitigation cost | – | {{V1.mit}} |\n| Remaining exposure (30 days) | {{var}} | {{V1.res}} |\n| Expected total | {{var}} | {{V1.total}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox. They are drafts: nothing was sent.\n\n**Residual risk.** Air rates rise as other shippers switch. A longer closure would reach cathode material for our cell suppliers next.\n\n**How we know.** Carrier and security advisories; exposure from ERP master data; stop dates and euro figures from the deterministic impact engine.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the surge requests to Hefei and Wetzlar and the extra rail capacity; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Hefei Optoelectronics Co., Ltd. (key account)",
              subject: "Capacity request: +15 % display sets for Leipzig by rail from {{date:+7}}",
              body: "Dear Hefei Optoelectronics team,\n\nOur sea shipments from Taiwan now sail around the Cape of Good Hope. We ask you to raise rail deliveries of display sets to Leipzig by 15 % of demand (about 130 sets per day) from {{date:+7}} for at least six weeks.\n\nWe accept a premium of up to 6 % on the additional volume. Please confirm feasibility and your rail slots by 18:00 tomorrow.\n\nKind regards\nPurchasing, Electronics\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Lahn Display Modules GmbH, Wetzlar (key account)",
              subject: "Capacity request: +10 % display sets for Leipzig from {{date:+5}}",
              body: "Dear Lahn Display Modules team,\n\nTo bridge longer sea transit from Asia, we ask you to raise deliveries of display sets to Leipzig by 10 % of demand (about 85 sets per day) from {{date:+5}} for at least six weeks.\n\nWe accept a premium of up to 12 % on the additional volume. Please confirm by 18:00 tomorrow.\n\nKind regards\nPurchasing, Electronics\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "booking", recipient: "Contracted rail operator, China–Europe corridor (framework agreement)",
              subject: "Mock booking: extra container slots Hefei → Leipzig",
              body: "Lane: Hefei (CN) → Leipzig (DE) via the China–Europe rail corridor\nService: container slots on scheduled block trains, about 18 days\nFrequency: 2 extra 40-ft containers per weekly departure\nPeriod: {{date:+7}} to {{date:+49}}\nCargo: display sets (centre + cluster)\nReference: Navigator option B, Red Sea rerouting response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { map: { supplier_ids: ["S-HFE-DSP", "S-WTZ-DSP"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Red Sea rerouting: response decision\n\n**What happened.** Carriers are rerouting Asia–Europe services around the Cape of Good Hope, adding about twelve days.\n\n**If we do nothing.** Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}). Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option B approved: Hefei +15 % by rail and Lahn Display Modules +10 %. Mitigation cost {{V2.mit}}; remaining exposure {{V2.res}}; expected total {{V2.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** The extra rail volume needs {{V2.time}} days to arrive and depends on slots on the China–Europe corridor.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the build-without-displays plan for Leipzig; it waits for your approval in the Outbox." },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Build without displays from {{first_stop_date}}; retrofit in the yard",
              body: "Decision: option C approved. When display stock runs out on day {{first_stop_day}} ({{first_stop_date}}), Leipzig keeps building and completes vehicles without displays.\n\nWhat to prepare\n- Release the build-without-displays sequence for up to eight days of output\n- Set up a retrofit area in the yard; rework is planned at €230 per vehicle\n- Hold affected vehicles from shipping until they are retrofitted\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Red Sea rerouting: response decision\n\n**What happened.** Carriers are rerouting Asia–Europe services around the Cape of Good Hope, adding about twelve days.\n\n**If we do nothing.** Leipzig runs out of displays on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Decision.** Option C approved: build without displays and retrofit in the yard. Mitigation cost {{V3.mit}}; remaining exposure {{V3.res}}; expected total {{V3.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal plans approved (drafts only, nothing sent).\n\n**Residual risk.** Yard rework is limited to eight days of output.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "Risk accepted. I will not contact any supplier or carrier. Drafting an internal note so Leipzig can plan for the expected stoppage." },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Expected line stop from {{first_stop_date}}: display shortage",
              body: "Decision: accept the supply risk from the Red Sea rerouting; no mitigation ordered.\n\nExpected impact\n- Displays run out on day {{first_stop_day}} ({{first_stop_date}})\n- Value at risk over 30 days: {{var}}\n\nPlease prepare shift and staffing plans for a stoppage and inform the works council and logistics.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Red Sea rerouting: risk accepted\n\n**What happened.** Carriers are rerouting Asia–Europe services around the Cape of Good Hope, adding about twelve days.\n\n**Decision.** Do nothing; the risk is accepted. Expected first line stop on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal notes approved.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-TNG-FIRE": {
    title: "Fire at the Tangier wiring-harness plant",
    steps: [
      { state: "scanning" },
      { say: "Signal received: an unverified report of a fire at a wiring-harness plant in Tanger Automotive City, Morocco. First question: are we exposed there?" },
      { tool: "erp_list_suppliers", input: { region: "MA" } },
      { say: "Hypothesis: the plant is our tier-1 supplier Tanger Harness Systems (S-TNG-HAR). It ships 55 % of Leipzig's main wiring harnesses by road and ferry, four days door to door." },
      { map: { supplier_ids: ["S-TNG-HAR"], state: "at_risk", focus: { lat: 35.75, lon: -5.6, zoom: 6.5 } } },

      { state: "verifying" },
      { web: {
        query: "fire wiring harness plant Tanger Automotive City",
        summary: "2 results: a local news report and a social-media roundup; neither names the company",
        results: [
          { title: "Fire breaks out at automotive supplier site in Tanger Automotive City", source: "Regional news site", page_age: "today" },
          { title: "Smoke over the Melloussa industrial zone, firefighters on site", source: "Social-media roundup", page_age: "today" }
        ]
      } },
      { say: "Check: neither source names the company, and one is social media. One unconfirmed signal is not enough for an alert, so I look for an independent source." },
      { web: {
        query: "Tanger Harness Systems fire production halted statement",
        summary: "1 result: a company statement quoted by a business news outlet",
        results: [
          { title: "Harness maker confirms production halt after overnight fire in Tangier", source: "Business news outlet quoting a company statement", page_age: "today" }
        ]
      } },
      { say: "Confirmed: an independent business outlet quotes the company directly. Production at the Tangier plant is halted, nobody was hurt, and the extent of the damage is still being assessed." },
      { alert: {
        title: "Fire halts our tier-1 harness supplier in Tangier",
        severity: "critical",
        summary: "Tanger Harness Systems (S-TNG-HAR) has stopped production after a fire. It supplies 55 % of Leipzig's main wiring harnesses. Confirmed by two independent sources.",
        supplier_ids: ["S-TNG-HAR"],
        sources: [
          { title: "Company statement quoted by a business news outlet (representative)" },
          { title: "Regional news report from Tanger Automotive City (representative)" }
        ]
      } },
      { map: { supplier_ids: ["S-TNG-HAR"], route_ids: ["R-RD-TNG-LEJ"], state: "affected" } },

      { state: "diagnosing" },
      { tool: "erp_get_supplier", input: { supplier_id: "S-TNG-HAR" } },
      { say: "Finding: the same plant builds all seat wiring harnesses for our single-source seat supplier in Mladá Boleslav (S-MBO-SEAT), which holds six days of that harness. The fire threatens two Leipzig lines, not one." },
      { map: { supplier_ids: ["S-MBO-SEAT"], state: "at_risk", fit: ["S-TNG-HAR", "S-MBO-SEAT", "PL-LEJ"] } },
      { tool: "erp_get_part", input: { part_id: "P-HAR" } },
      { tool: "erp_get_open_pos", input: { supplier_id: "S-TNG-HAR" } },
      { say: "Leipzig holds three days of main harnesses. Four trucks with 3,400 sets are already on the road and will still arrive; the gap opens after that." },

      { say: "First estimate, based on the initial report: one week of lost production." },
      { impact: "hypothesis" },
      { say: "On a one-week outage Leipzig would lose output from day {{hyp.first_stop_day}}, about {{hyp.var}} over 30 days. Before acting on that, I check the damage assessment." },
      { state: "verifying" },
      { web: {
        query: "Tangier harness plant fire damage restart estimate",
        summary: "1 result: trade-press interview with the plant manager",
        results: [
          { title: "Plant manager: cutting and crimping hall damaged, restart in weeks rather than days", source: "Automotive trade press", page_age: "today" }
        ]
      } },
      { say: "Revised: one week of lost production → about five weeks. The cutting and crimping hall is damaged, and comparable harness-plant fires have needed four to six weeks to restart." },
      { impact: "disruption" },
      { say: "Impact: main harnesses run out on day {{first_stop_day}} ({{first_stop_date}}). Seats follow on day {{part.P-SEAT.shortage_day}}, once the seat supplier's harness stock is gone. Value at risk over 30 days: {{var}}." },
      { map: { plant_ids: ["PL-LEJ"], supplier_ids: ["S-MBO-SEAT"], state: "affected" } },

      { state: "diagnosing" },
      { tool: "erp_get_alternatives", input: { part_id: "P-HAR" } },
      { say: "Response levers: Timișoara can add 20 % of volume within five days and Sousse 8 % within four. The Kénitra sister plant can take over Tangier's tooling after a 14-day fast-track qualification. The seat supplier can source its harness from Timișoara within six days." },

      { options: {
        recommended: "V2",
        baseline_description: "Let Leipzig run until main harnesses and then seats run out, and wait about five weeks for Tangier to restart.",
        texts: {
          V1: {
            title: "Surge Timișoara and Sousse, re-source the seat harness",
            description: "Ask the two other harness plants for +20 % and +8 % of volume, and let the seat supplier source its harness from Timișoara.",
            residual_risk: "Covers about three quarters of main-harness demand; Leipzig runs at a reduced rate until Tangier restarts."
          },
          V2: {
            title: "Option A plus tooling transfer to Kénitra",
            description: "Everything in option A, plus a 14-day fast-track qualification of the Kénitra sister plant, which can take up to 40 % of volume.",
            residual_risk: "A short gap remains until Kénitra delivers, and the plan depends on Timișoara confirming its surge today."
          },
          V3: {
            title: "Kénitra transfer and seat harness only",
            description: "No surge premiums: re-source the seat harness and move Tangier's tooling to Kénitra.",
            residual_risk: "Leipzig runs on 45 % of its main-harness supply for more than a week before Kénitra starts."
          }
        }
      } },
      { say: "Recommendation: option B. It costs {{V2.mit}} and cuts the 30-day exposure from {{var}} to {{V2.res}}, an expected saving of {{V2.save}} against doing nothing. It is the only option that also covers the weeks after the surge capacity is exhausted." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. Without the Kénitra transfer, Leipzig stays short until Tangier restarts; options B and C remain open.",
          V2: "Option B rejected. Option A protects the next two weeks at lower cost; option C avoids surge premiums but leaves a longer gap.",
          V3: "Option C rejected. Options A and B remain; B gives the most protection."
        },
        approved: {
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the supplier requests and the extra transport. Each draft waits for your approval in the Outbox; nothing is sent." },
            { draft: {
              type: "email", recipient: "Banat Cable Systems SRL, Timișoara (key account)",
              subject: "Urgent capacity request: +20 % main harness volume for Leipzig from {{date:+5}}",
              body: "Dear Banat Cable Systems team,\n\nFollowing the fire at another harness supplier in Tangier, we need additional main wiring harness sets for our Leipzig plant at short notice.\n\nRequest\n- Additional volume: 20 % of Leipzig demand (170 sets per day) on top of your current call-off\n- First shipment: {{date:+5}}, for at least four weeks\n- Delivery: daily full truckloads to Leipzig, sequenced as today\n\nWe accept an overtime premium of up to 14 % on the additional volume. Please confirm feasibility, your earliest ship date and any material constraints (copper wire, connectors) by 18:00 today.\n\nKind regards\nPurchasing, Electrical Systems\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Atlantic Wiring Kénitra SARL (plant management)",
              subject: "Tooling transfer and fast-track qualification for NW-e7 main harness sets",
              body: "Dear Atlantic Wiring Kénitra team,\n\nYour sister plant in Tangier is out of production after last night's fire. We would like to transfer the NW-e7 main-harness tooling and test boards to Kénitra.\n\nTarget\n- Fast-track qualification (PPAP) within 14 days\n- First deliveries from {{date:+18}}, up to 40 % of Leipzig demand (340 sets per day)\n- Commercials: we cover qualification costs up to €180,000 and a 7 % premium during the transition\n\nPlease nominate a project lead today. Our supplier-quality engineers can be on site within 48 hours.\n\nKind regards\nPurchasing, Electrical Systems\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Sahel Wiring Systems SA, Sousse (key account)",
              subject: "Capacity request: +8 % main harness volume for Leipzig from {{date:+4}}",
              body: "Dear Sahel Wiring Systems team,\n\nTo bridge an interruption at another supplier, we ask you to raise main-harness deliveries to Leipzig by 8 % of demand (68 sets per day) from {{date:+4}} for at least four weeks.\n\nWe accept a premium of up to 12 % on the additional volume. Please confirm by tomorrow 10:00, including your ferry slots Radès to Genoa.\n\nKind regards\nPurchasing, Electrical Systems\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Iser Seating Systems s.r.o., Mladá Boleslav (supply chain)",
              subject: "Seat wiring harness: switch to Banat Cable Systems from {{date:+6}}",
              body: "Dear Iser Seating Systems team,\n\nYour seat wiring harness supply from Tanger Harness Systems is interrupted by the fire in Tangier. We have released Banat Cable Systems (Timișoara) as an approved source for the seat harness drawing.\n\nPlease place call-offs covering 100 % of your seat-harness requirement from {{date:+6}} and confirm your remaining stock today (our records show six days).\n\nKind regards\nPurchasing, Interior\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "booking", recipient: "Contracted road carrier (framework agreement)",
              subject: "Mock booking: dedicated trucks Timișoara → Leipzig, 2 per day",
              body: "Lane: Timișoara (RO) → Leipzig (DE)\nService: dedicated full truckload, team drivers, about 36 h transit\nFrequency: 2 trucks per day, 7 days a week\nPeriod: {{date:+5}} to {{date:+35}}\nCargo: wiring-harness sets in returnable racks\nReference: Navigator option B, Tangier fire response\n\nMock booking for demonstration; no carrier system is connected."
            } },
            { map: { supplier_ids: ["S-TSR-HAR", "S-SOU-HAR", "S-MBO-SEAT", "A-KEN-HAR"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Tangier harness plant fire: response decision\n\n**What happened.** A fire has halted production at Tanger Harness Systems, our tier-1 supplier for 55 % of Leipzig's main wiring harnesses. Two independent sources confirmed it; the plant expects about five weeks to restart.\n\n**If we do nothing.** Leipzig runs out of main harnesses on day {{first_stop_day}} ({{first_stop_date}}). The same plant builds the seat harness for our single-source seat supplier, so seats run out on day {{part.P-SEAT.shortage_day}}. Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option B approved: Timișoara +20 %, Sousse +8 %, seat harness re-sourced from Timișoara, and Tangier's tooling moved to the Kénitra sister plant on a 14-day fast track.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Mitigation cost | – | {{V2.mit}} |\n| Remaining exposure (30 days) | {{var}} | {{V2.res}} |\n| Expected total | {{var}} | {{V2.total}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox. They are drafts: nothing was sent.\n\n**Residual risk.** Leipzig still runs short for a few days before Kénitra delivers, and the plan depends on Timișoara confirming its surge today.\n\n**How we know.** Exposure from ERP master data; stop dates and euro figures from the deterministic impact engine; the event confirmed by two independent sources.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the surge requests and the seat-harness switch; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Banat Cable Systems SRL, Timișoara (key account)",
              subject: "Urgent capacity request: +20 % main harness volume for Leipzig from {{date:+5}}",
              body: "Dear Banat Cable Systems team,\n\nFollowing the fire at another harness supplier in Tangier, we ask you to raise main-harness deliveries to Leipzig by 20 % of demand (170 sets per day) from {{date:+5}} for at least four weeks. We accept an overtime premium of up to 14 % on the additional volume.\n\nPlease confirm feasibility and material availability by 18:00 today.\n\nKind regards\nPurchasing, Electrical Systems\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Sahel Wiring Systems SA, Sousse (key account)",
              subject: "Capacity request: +8 % main harness volume for Leipzig from {{date:+4}}",
              body: "Dear Sahel Wiring Systems team,\n\nPlease raise main-harness deliveries to Leipzig by 8 % of demand (68 sets per day) from {{date:+4}} for at least four weeks. We accept a premium of up to 12 % on the additional volume.\n\nKind regards\nPurchasing, Electrical Systems\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Iser Seating Systems s.r.o., Mladá Boleslav (supply chain)",
              subject: "Seat wiring harness: switch to Banat Cable Systems from {{date:+6}}",
              body: "Dear Iser Seating Systems team,\n\nYour seat-harness supply from Tangier is interrupted. Banat Cable Systems (Timișoara) is released as an approved source. Please cover 100 % of your requirement from there from {{date:+6}} and confirm your remaining stock today.\n\nKind regards\nPurchasing, Interior\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-TSR-HAR", "S-SOU-HAR", "S-MBO-SEAT"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Tangier harness plant fire: response decision\n\n**What happened.** A fire has halted Tanger Harness Systems, our tier-1 supplier for 55 % of Leipzig's main harnesses; restart expected in about five weeks.\n\n**If we do nothing.** Main harnesses run out on day {{first_stop_day}} ({{first_stop_date}}), seats on day {{part.P-SEAT.shortage_day}}. Value at risk over 30 days: **{{var}}**.\n\n**Decision.** Option A approved: Timișoara +20 %, Sousse +8 %, seat harness from Timișoara. Mitigation cost {{V1.mit}}; remaining exposure {{V1.res}}; expected total {{V1.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** About a quarter of main-harness demand stays uncovered until Tangier restarts. Revisit the Kénitra tooling transfer if the restart slips.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the Kénitra tooling transfer and the seat-harness switch; each draft waits for your approval in the Outbox." },
            { draft: {
              type: "email", recipient: "Atlantic Wiring Kénitra SARL (plant management)",
              subject: "Tooling transfer and fast-track qualification for NW-e7 main harness sets",
              body: "Dear Atlantic Wiring Kénitra team,\n\nWe would like to transfer the NW-e7 main-harness tooling and test boards from your Tangier sister plant to Kénitra, with fast-track qualification within 14 days and first deliveries from {{date:+18}} (up to 340 sets per day). We cover qualification costs up to €180,000 and a 7 % transition premium.\n\nKind regards\nPurchasing, Electrical Systems\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { draft: {
              type: "email", recipient: "Iser Seating Systems s.r.o., Mladá Boleslav (supply chain)",
              subject: "Seat wiring harness: switch to Banat Cable Systems from {{date:+6}}",
              body: "Dear Iser Seating Systems team,\n\nYour seat-harness supply from Tangier is interrupted. Banat Cable Systems (Timișoara) is released as an approved source. Please cover 100 % of your requirement from there from {{date:+6}}.\n\nKind regards\nPurchasing, Interior\nNordwerk Automotive GmbH, Leipzig\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { map: { supplier_ids: ["S-MBO-SEAT", "A-KEN-HAR"], state: "resolved" } },
            { awaitActions: true },
            { report: "## Tangier harness plant fire: response decision\n\n**What happened.** A fire has halted Tanger Harness Systems, our tier-1 supplier for 55 % of Leipzig's main harnesses.\n\n**If we do nothing.** Main harnesses run out on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Decision.** Option C approved: tooling to Kénitra (14-day fast track) and seat harness from Timișoara, without surge premiums. Mitigation cost {{V3.mit}}; remaining exposure {{V3.res}}; expected total {{V3.total}}.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the outbox (drafts only, nothing sent).\n\n**Residual risk.** Leipzig runs on reduced main-harness supply for more than a week before Kénitra starts.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "Risk accepted. I will not contact any supplier. Drafting an internal note so Leipzig can plan for the expected stoppage." },
            { draft: {
              type: "replan", recipient: "Leipzig plant management",
              subject: "Expected line stop from {{first_stop_date}}: main harness shortage",
              body: "Decision: accept the supply risk from the Tangier harness plant fire; no mitigation ordered.\n\nExpected impact\n- Main wiring harnesses run out on day {{first_stop_day}} ({{first_stop_date}})\n- Seats run out on day {{part.P-SEAT.shortage_day}} (seat-harness dependency)\n- Value at risk over 30 days: {{var}}\n\nPlease prepare shift and staffing plans for a stoppage and inform works council and logistics.\n\nPrepared with the Navigator AI assistant. Requires human approval before sending."
            } },
            { awaitActions: true },
            { report: "## Tangier harness plant fire: risk accepted\n\n**What happened.** A fire has halted Tanger Harness Systems, our tier-1 supplier for 55 % of Leipzig's main harnesses.\n\n**Decision.** Do nothing; the risk is accepted. Expected first line stop on day {{first_stop_day}} ({{first_stop_date}}); value at risk over 30 days **{{var}}**.\n\n**Actions.** {{actions.approved}} of {{actions.total}} internal notes approved.\n\n*Simulated run (scripted replay). Figures calculated by the impact engine from the synthetic world.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  }
};

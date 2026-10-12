/*
 * NAVIGATOR — authored simulation runs (Simulation mode).
 *
 * Each run mirrors what the live agent does for a preset scenario: the same tools, the same
 * verification and self-correction pattern, the same options and approval gates.
 * Integrity rules for authors:
 *   - ERP results are produced at playback by the real ERP queries (js/erp.js).
 *   - Every € figure and line-stop day comes from the impact engine via {{placeholders}};
 *     never type a number that the engine computes.
 *   - Web search and open-data results are representative and are labelled as such; they carry
 *     no URLs because they do not point to real articles.
 *
 * M2 ships the Tangier run so the full interface can be reviewed; the other five arrive in M4.
 */
window.SIM_RUNS = {
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
            residual_risk: "covers about three quarters of main-harness demand; Leipzig runs at a reduced rate until Tangier restarts."
          },
          V2: {
            title: "Option A plus tooling transfer to Kénitra",
            description: "Everything in option A, plus a 14-day fast-track qualification of the Kénitra sister plant, which can take up to 40 % of volume.",
            residual_risk: "a short gap remains until Kénitra delivers; depends on Timișoara confirming its surge today."
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

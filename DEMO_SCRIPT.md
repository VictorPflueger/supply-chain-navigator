# Navigator — 8-minute demo script

**Audience:** partners, principals and later clients. **Goal:** in eight minutes they should be able to repeat one sentence: *"We know in minutes which factory will stop, what it costs, and the cheapest way to keep it running."*

**Recommended run:** Scenario 2, **Rhine low water at Kaub**, in **Live** mode on **Sonnet 5.5**. The Rhine is the strongest live story. The agent reads the real federal gauge at Kaub and real news, then traces every flow that passes Kaub. The hidden exposure in the data is a tier-2 chemical plant in Ludwigshafen that supplies electrolyte to all three of Nordwerk's cell makers, so the Rhine reaches the battery line. If the real gauge disagrees with the injected signal, the agent corrects itself in front of the audience, which is the moment people remember.

**Fallback:** the same scenario in **Simulation** mode at ×2. It uses the same interface, is labelled SIMULATION throughout, and needs no key or network.

---

## Pre-flight (30 minutes before, on the presentation laptop and network)

1. Open the site in Chrome or Edge and hard-reload (**Ctrl + Shift + R**). On a browser's first visit the **How Navigator works** window opens by itself; close it. Close other tabs and silence notifications. Plug in the power and disable sleep.
2. Click **Diagnostics → Run all tests**. Check that every row passes and that the footer shows **Navigator 1.2.0**.
   - The PEGELONLINE row shows today's Kaub reading. **If Kaub is above about 150 cm**, the Rhine is not low today and the live run will become a labelled what-if. That is honest, but for the main demo choose **Live scan** (if the news has a real disruption near the network) or Scenario 6, **Tangier harness fire**, and present it as a what-if.
   - A failed open-data row is fine: the agent says so on screen and verifies through web search.
   - Optional: **Test web search on my key** (≈ €0.0001) confirms that your organisation allows web search.
3. Do one full **Live** rehearsal of the scenario. It enters your key (Start agent → Live agent → paste → Check key and continue) and confirms timing and cost: the console's last line shows the **Run facts**. Then click **Reset**. **Keep this tab open.** The key lives only in this tab.
4. Run the **Simulation** of the same scenario once at ×4 to refresh the flow in your head. Click **Reset**.
5. Set the stage: Scenario menu → **Rhine low water**, Model → **Sonnet 5.5**, console **Larger text** on, browser full screen (**F11**). The page is in the light theme, which projectors in lit rooms show best (the sun in the header switches back from dark). The status pill reads **Idle**.
6. Have a phone hotspot ready. Never paste the key on the projector, in chat or in slides.

## The eight minutes at a glance

| Time | Segment | On screen |
|---|---|---|
| 0:00–0:30 | Hook | Idle workspace: map of Nordwerk's network, empty KPI tiles |
| 0:30–1:00 | Mode choice | Mode dialog: Simulation or Live agent |
| 1:00–5:00 | The run | Console, map and KPIs fill live; options open in the drawer |
| 5:00–7:00 | Decision, outbox, summary | Approval, drafts, management summary, audit export |
| 7:00–8:00 | Audience what-if | Custom what-if typed from the room (Live only) |

---

## 1. Hook (0:00–0:30)

On screen: the idle map. Leipzig and Győr are the two plants, the large hexagons with a factory; the small hexagons are suppliers in real industry clusters; lines are real corridors. If the room needs a picture of the flow first, click **How it works** in the header: its five steps (spot, check, calculate, propose, prepare) are the run you are about to show, and its **Start agent** button leads straight into segment 2.

> "This is Nordwerk, a fictional German EV maker with real geography: two plants, 57 suppliers, real ports and real rivers. When a disruption hits, a supply chain team needs a day or two to answer three questions: are we exposed, which plant stops when, and what does it cost to prevent it? Let's watch an AI agent do it in about four minutes, and ask for permission before it does anything."

Point at the five steps above the console, the agent's plan. One sentence on the colours, if the room is new to the screen:

> "Merlot is you, lilac is the AI, red, honey and green are the supply chain. When a step turns merlot, it's our turn."

## 2. Mode choice and key (0:30–1:00)

Click **Start agent**. The mode dialog opens.

> "Two honest modes. Simulation is a labelled replay we use for rehearsal; it costs nothing and runs offline. Live is the real thing: Claude reasoning on live news and live sensor data, on my own API key. We'll go live."

Click **Use my key (sk-ant-…)** on the Live card. Point at the header: **LIVE** badge and **You are interacting with an AI system**.

> "The key stays in this browser tab and only goes to Anthropic. The browser itself blocks the page from connecting anywhere else."

## 3. The run (1:00–5:00)

Narrate what the console shows; do not read it out. The left column says what to watch for, the right column what to say.

| Console moment | You say |
|---|---|
| **Phase: Scanning.** The opening line restates the signal: a barge operator's notice says Kaub reads 78 cm and is falling | "This is how disruptions arrive: as a rumour in a customer notice, not as a fact." |
| **Hypothesis:** a first guess at the exposure, followed by ERP tool calls (`erp_list_suppliers`, `erp_get_routes`…) | "First question: are we exposed at all? It queries our ERP, synthetic here, for every flow that passes Kaub." |
| **Check:** with `geo_rhine_level` (federal waterways gauge, live) and `web_search` results with sources | "Now it refuses to trust a single source. It reads the official gauge, live, right now, and checks the news." |
| **Confirmed:** or **Revised: … → …** | If revised: "Watch this: the signal said 78 cm, the gauge says otherwise, and it corrects itself in public." If confirmed: "Two independent sources agree, so now it raises the alert." |
| **Alert card**; corridors and the Kaub node turn red on the map, each marked with a cross | "Only now, with two sources, does it raise a verified alert." |
| **Finding:** or **Revised:** the exposure that matters is battery electrolyte from the tier-2 plant in Ludwigshafen (the Simulation always shows this; live, it appears once the agent has traced the routes through Kaub) | "Here's the insight a planner usually finds days later: the Rhine reaches our battery line through a tier-2 chemical plant that supplies all three of our cell makers." If the live agent stays with tyres or brakes, say: "It has found the direct flows; the battery chain sits one tier deeper." |
| **Phase: Simulating**; `sim_impact` calls; **Value at risk** and **First line stop in** tiles fill | "These numbers do not come from the language model. A deterministic engine calculates them from the bill of materials, stock and open orders. The agent can only choose between scenarios the engine has costed." |
| **Phase: Options**, **Review options**; the drawer opens with three options, *Do nothing* and the comparison bars; the rail's **Propose** step turns merlot: **Your decision** | "Exactly three costed options next to doing nothing. The bars show response cost plus the exposure that remains. It recommends the lowest expected total, and the step has turned merlot: nothing happens until a human decides." |

If the run reaches the options before 5:00, use the spare time on the map (click a red corridor) or open a **Reasoning** entry in the console to show the model's summarised thinking.

## 4. Decision, outbox and summary (5:00–7:00)

Click **Approve** on the recommended option.

> "I approve the recommendation. Look at the tiles: value at risk now shows what is left with this option, and the exposed plant turns green on the map with a tick and the word Resolved, or honey with At risk if some risk remains."

The agent drafts the actions. The **Outbox** opens with emails and mock bookings, each **Pending approval**.

> "It drafts the supplier emails and the rail bookings. Every draft carries the AI footer, and none of them is sent: this outbox has no connection to anything. Each one needs its own approval."

If there is time, click the lilac **AI** label on a draft: it says who wrote the draft and that approving sends nothing.

Approve all drafts but one, and **Reject** that one to show the control. The agent finishes; click **Open management summary** and read its first two sentences.

> "A board-ready summary: what happened, how we know, what it costs, what we decided. And the **Detection → decision** tile shows how long it took from the rumour to our decision."

Open the **Audit** tab and click **Export JSON**.

> "Every tool call, every model message, every human decision, with timestamps and cost. That is what makes this auditable, and it is what the EU AI Act asks for in spirit: disclosure, human oversight and records."

Point at the console's last line: **Run facts: … agent time; … tool calls; … verification steps; cost €0.2x.**

## 5. Audience what-if (7:00–8:00, Live only)

> "Everything you saw was live. So give me a disruption."

Scenario menu → **Custom what-if…**. Type the suggestion in a sentence, for example *"Our cell supplier in Poland loses its plant for three weeks"*, and click **Start agent**, then the Live card.

> "It starts exactly as before: are we exposed, which parts, which plant, what does it cost. It will take three or four minutes; we'll leave it running and look at the result over coffee."

Close while it works:

> "Minutes, not days, from a rumour to a costed decision, with a human in charge of every action. The same pattern works on your own data."

---

## Contingencies

**Slow response (nothing new in the console for 20 seconds).** The status pill shows the phase and the stopwatch keeps running. Say:
> "It's waiting for the model. Real reasoning has real latency; I'd rather show you that than a pre-recorded video."

Use the pause to explain the map or the KPI tiles. If nothing has moved for about a minute, click **Abort**, set Replay to **×2**, then click **New run → Run simulation**:
> "Let's switch to the replay of this scenario. Same interface, clearly labelled SIMULATION."

**API error, network loss or Wi-Fi problems.** The console states the cause in plain words (rate limit, network, key). Switch to the phone hotspot if it is quick; otherwise run the Simulation, which needs no network beyond map tiles and runs fully offline. If the tiles are blocked, the map falls back to an offline coastline map.

**Empty Live scan.** The agent ends with "no material disruption found".
> "That's the right answer on a quiet day. An agent that finds a crisis every time is a liability. Let me inject a scenario instead."

Then run Scenario 2 or 6.

**The signal cannot be confirmed (what-if path).** The agent says it could not confirm the event in two sources and continues as a labelled what-if.
> "It won't raise a verified alert on a rumour. It labels this a what-if and still quantifies it, which is exactly the behaviour you want from an agent that writes to suppliers."

**The run ends as Stopped or Error.** Read the console's reason aloud in one sentence, then run the Simulation.

**Questions you will get**

| Question | Answer |
|---|---|
| "Is this real?" | "The company is fictional. The geography, ports, corridors, gauge readings and news are real, and in Live mode the reasoning is real Claude on my key. Nothing touches a real supplier." |
| "Can the AI make up the numbers?" | "Not the money. A deterministic engine computes every euro figure and stop date; the agent can only pick between costed variants, and the code rejects anything else." |
| "What does a run cost?" | "About twenty cents on the default model. The meter in the corner shows it live." |
| "What about the EU AI Act?" | "It discloses that you're dealing with an AI system, keeps a human in charge of every outbound action, and logs everything for export. Nothing is sent automatically." |
| "Could it run on our data?" | "Yes. The agent talks to the company through a handful of tools: suppliers, parts, stock, orders. Point those at your ERP and planning data, and the guardrails stay the same." |
| "Which model is this?" | "Claude Sonnet 5.5 by default; Haiku for speed and cost, Opus for depth. It's a dropdown." |
| "Why these colours?" | "Each colour means one thing: merlot is a person deciding, lilac is the AI, red, honey and green are the network, and every state also has its own mark, so nobody needs the colours to read it. They come from Vici, the design system behind all our prototypes, tested for contrast in a light and a dark theme and for colour blindness; our Rebate Hunter uses the same. And nothing is round: the shapes are hexagons, Vici's signature." |
| "Is my data safe in the browser?" | "There's no server. The key stays in this tab and only goes to Anthropic. The browser blocks the page from connecting to any other host, and Diagnostics checks that." |

## After the demo

- **Start agent → Change or forget key → Forget key**, or close the tab.
- If the key was ever visible on screen, delete it in the Claude Console and create a new one.
- To keep a good live run as the new Simulation for that scenario, use **Save run as simulation** (see README, "Recording a live run").

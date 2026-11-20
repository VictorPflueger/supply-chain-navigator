# Navigator: the five-minute demo

**For** a COO, a head of supply chain or a head of purchasing in automotive or logistics. **Goal:** after five minutes they can repeat one sentence: *"The agent checked a fire report, priced the damage at €19.1M and proposed option B for €984k; a person decided, and nothing left without approval."*

## The four figures at the top

| Figure | What it shows | In the demo |
|---|---|---|
| Value at risk | What stopped lines cost over 30 days, then what is left after your decision | €19.1M, then €1.9M |
| First line stop in | Days until a plant can no longer build at full rate | 9 days, Leipzig |
| Detection → decision | From the report on screen to your approval, measured on the page | about 4 minutes |
| Session cost | What the agent's run costs in model fees | ≈ €0.20 for a live run |

## Before the call

1. Chrome or Edge, full screen (F11), 100 % zoom, light theme; other tabs closed, notifications off.
2. Walk the five steps once. The simulation needs no key and no network.
3. Let the guide open, or start at `?guide=0` if you explain the showcase yourself.
4. For a live run, bring your own Anthropic API key, ideally from a workspace with a spend limit, and keep the simulation as the fallback.

## The five minutes

| Time | Step | What to do and say |
|---|---|---|
| 0:00 | Spot | Click **Start** on the guide; the agent starts by itself. "An AI agent watches the suppliers of Nordwerk, a fictional maker of electric cars." Point at the four figures: "A fire at a supplier in Tangier puts €19.1M at risk, and Leipzig stops in 9 days unless we act. The clock runs from the report to our decision." |
| 1:00 | Check | Press **Run step 2**. "One report is not enough. The agent finds a second, independent source before it raises the alert." |
| 2:00 | Calculate | Press **Run step 3**. "A week's outage would cost €935k; the damage report means five weeks and €19.1M. An engine computes every euro, not the AI, and it found a second line at risk: seats." |
| 3:00 | Propose | Press **Run step 4**. "Three costed options next to doing nothing. The agent recommends B: €984k cuts the risk to €1.9M." Press **Approve option B**: "A person decides, and the clock stops at about four minutes." |
| 4:00 | Prepare | It drafts by itself; press **Approve all**. "Four emails and one booking wait for approval; nothing is sent. Live on Claude, the whole run costs about €0.20, and it works the same on your data." |

The bar under the agent's words always holds the next button; Space pauses a step.

Say once: *"In this replay the agent's words are scripted; the engine calculates every figure. Start agent runs it live on Claude."*

## Questions you will get

**Is this a real company?** No. Nordwerk and its suppliers are invented; the places, routes and the kind of event are real. In March 2022 a wire-harness shortage stopped a carmaker's Leipzig plant within days.

**Can the AI make up the numbers?** No. A deterministic engine computes every euro and day from Nordwerk's records; the agent picks between costed options and words them.

**What if the report is false?** The agent raises no alert on a single source. If nothing confirms it, it says so and treats the case as a what-if.

**Does it send the emails?** Never. Drafts wait for a person's approval, and even approved drafts stay on the page.

**What does a live run cost?** About €0.20 on Claude Sonnet 5.5 for one scenario; the Session cost figure shows what the API reports.

**Can it run on our data?** The agent's tools read records through a small interface. A pilot would connect them to your ERP and supplier data, read only at first.

**What about the EU AI Act?** Wherever a live run is possible, the page says "You are interacting with an AI system", and a person decides on everything the agent prepares.

## If something goes wrong

Press Home, or **Start over** beside the steps, and carry on from Spot. Every step is also a link, such as `?step=propose`. If a live run stalls, press **Stop the live run** and switch to the simulation.

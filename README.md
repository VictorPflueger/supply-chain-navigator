# Navigator

A five-minute showcase of agentic AI in an automotive supply chain. A report of a fire at a supplier reaches the agent of Nordwerk Automotive, a fictional maker of electric cars. The agent checks the report against a second source, lets an engine calculate what it costs, proposes three costed responses and drafts the emails for the one you approve. In the demo, the fire in Tangier puts €19.1M at risk and Leipzig stops in 9 days; option B costs €984k and leaves €1.9M at risk.

**Live:** https://victorpflueger.github.io/supply-chain-navigator/

It is a static page on GitHub Pages: no backend, no build step. The simulation connects nowhere. A live run connects to one host, api.anthropic.com, on the visitor's own key.

## The four figures

The top right of the page holds the key figures. The guide's chapter *How it works* explains them, and the talk track points at them.

| Figure | What it measures | In the demo |
|---|---|---|
| Value at risk | What stopped lines cost over 30 days if nothing is done, then what is left once you approve an option | €19.1M, €1.9M after option B |
| First line stop in | Days until a plant can no longer build at full rate | 9 days, Leipzig |
| Detection → decision | Time from the report on screen to your approval, measured on the page | about 4 minutes on the talk track |
| Session cost | Model fees for the agent's run: estimated in the simulation, measured in a live run | ≈ €0.20 |

## The talk track

The page opens with Vici's guide, *How the showcase works*, once per browser tab. Its last chapter is the talk track, and the same five steps are the buttons under the header. Each step is one minute.

| Step | What the room sees | What you say |
|---|---|---|
| Spot | The report, not yet confirmed, and the four figures | "€19.1M at risk, and Leipzig stops in 9 days unless we act." |
| Check | Three sources, then the alert | "One report is not enough: the agent finds a second source." |
| Calculate | The first estimate against the one after the check, and Leipzig's output falling to zero | "An engine, not the AI, prices five weeks at €19.1M, not €935k." |
| Propose | Three costed options next to doing nothing. Click **Approve** on option B; the clock stops | "€984k cuts the risk to €1.9M; a person decides in about 4 minutes." |
| Prepare | Four emails and one booking. Click **Approve all** | "Four emails and one booking wait for approval. Live, this costs €0.20." |

`DEMO_SCRIPT.md` has the timings, the checks before the call and the questions you will get.

**Moving through it.** Click a step, press 1 to 5, or use the arrow keys; Home goes back to Spot. **Start over** (the arrow beside the steps) clears your decisions.

**Links.** The address holds the step and the scenario: `?step=propose`, `?scenario=rhine&step=calculate`. Add `&guide=0` to keep the guide closed, or open `?guide=present` to start at the talk track.

**Other scenarios.** The menu beside the steps holds five more: a strike in Rotterdam, low water on the Rhine, an earthquake near Hsinchu, floods in Styria and Slovenia, and ships avoiding the Red Sea. Every figure follows the scenario.

## Start agent: the simulation or a live run

**Start agent** offers two runs of the same five steps.

- **Simulation**, the default and the presenter's path: a scripted replay of the agent. Free, needs no key, works offline.
- **Live run**: Claude Sonnet 5.5 with real web search, on your own Anthropic API key. The page says "You are interacting with an AI system" wherever a live run is possible, as the EU AI Act asks. The key stays in the browser tab and goes only to api.anthropic.com. The agent waits for your approval of an option and of every draft, and nothing is ever sent: drafts stay on the page. The Session cost figure then shows the fees as the API reports them.

## What is real

| | |
|---|---|
| Fictional | Nordwerk Automotive, its 57 suppliers, their volumes, prices, stock and orders |
| Real | The places and transport routes; the precedent: a wire-harness shortage stopped a carmaker's Leipzig plant in March 2022 |
| Computed | Every euro and day, by a deterministic engine from Nordwerk's data |
| Scripted | In the simulation, the agent's words and web sources, marked as representative |

`DATA_SOURCES.md` lists every source and assumption.

## How it works

```
index.html        the page: header, key figures, steps, map, story, guide, Start agent
js/main.js        starts it and wires the shell to the case; follows clicks, keys and a live run
js/shell.js       the presenter's shell: steps, keys, links, key figures, Start agent, the clock
js/claude.js      the browser's client for Claude: session key, streaming, retries
js/cost.js        session cost: measured from the API's usage, or estimated from a replay
js/format.js      euros, days, dates, minutes
js/theme.js       light or dark, before the first paint
js/story.js       the five steps, the six scenarios, a scenario's run with every figure filled in
js/view.js        draws a step: heading, evidence, the agent's words, options, drafts, key figures
js/map.js         the map, drawn from Natural Earth, with the places the agent marks
js/agent.js       the live agent: the conversation with Claude and its guardrails
js/tools.js       the agent's tools: Nordwerk's records, the engine, the screen
js/erp.js         the records the tools query
js/impact.js      the deterministic impact engine
js/world.js       Nordwerk's world as a model the engine and the map read
js/prompt.js      the live agent's instructions
data/             the synthetic world, the six scenarios, their scripts, the map
```

The shell (shell.js, claude.js, cost.js, format.js, theme.js) knows nothing about supply chains; Rebate Hunter and Timetable Translator can take it with their own steps and figures. `DESIGN.md` explains how.

The look is Vici, Victor's design system, copied into `vici/` (`vici/README.md`).

## Run it

Browsers don't run the page's modules from a file. Serve the folder instead:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. On Windows: `py -m http.server 8000`.

## Tests

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

Nine suites: the figures, the files, how lean the app stays, Vici's own checks, the showcase in Chromium, the guide, a live run against a stand-in API, contrast and Vici's hexagon rule. GitHub Actions runs them on every push. `tests/README.md` has the setup.

## History

2.0.0 (20 November 2026) turned the lab into this one-screen showcase on Vici 2.0. Release 1.2.0, the lab version with its toolbar, live scans, diagnostics, outbox and audit log, is in the git history at commit `61f1483`.

## Author

Built by Victor Pflüger · [LinkedIn](https://www.linkedin.com/in/victorpflueger) · [Website](https://victorpflueger.github.io/VIP/index.html)

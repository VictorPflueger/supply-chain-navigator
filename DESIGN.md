# Navigator: design

One screen a presenter drives in five minutes, for partners and their customers in automotive and logistics. The test for every element: would a visitor with no supply chain knowledge and no time miss it? If not, it went.

## The screen

| Part | What it holds |
|---|---|
| Header | Navigator with its icon in a lilac hexagon, the kind on Victor's website; SIMULATION or LIVE; How it works; the theme; the four key figures, top right |
| Under the header | One sentence: what it does, that the company is fictional, that nothing is sent without approval; the byline, as Vici asks of a single screen |
| Talk track | Start agent and the AI notice; the five steps, Spot, Check, Calculate, Propose and Prepare; the scenario menu; Start over |
| Map | Our two plants, and the sites and routes the agent has marked by this step, each with its state |
| Story | The step's result as a heading, what the step does, the one thing to look at, the agent's own words, and at its foot the bar that says what happens or what to do next |

Each step shows one thing to look at: the report (Spot), the sources and the alert (Check), the first estimate against the revised one with the plant's output (Calculate), the options (Propose), the drafts, the management summary and the decision log of who approved what and when (Prepare). One dark button per screen, and it sits in the bar.

**The prototype runs; the bar asks.** Step 1 starts by itself once the guide closes, and every step plays out event by event, as the agent works. While it works, the bar under the story says what it is doing and offers Pause. When the page waits for the presenter, the bar says so in words (Your move, Your decision, Your approval) and holds the one action, which pulses until it is pressed: Run step 2, Approve option B, Approve all. The bar sits right under what just happened, where the eye is when a step ends, and stays in view however long the story grows. An approval runs Prepare by itself. Space pauses and continues; the right arrow finishes a step or runs the next; a click on a step, a number key or `?step=` shows a step at once. The guide holds a running step while it is open, so nothing plays out unseen.

The key figures have values before anything happens: the replay's figures, answer first, and the estimated cost of a live run. A live run starts them at "Step 3" until the engine has run. Detection → decision is measured on the page, from the report on screen (the guide closed) to the approval.

Colour carries meaning, and every state has its own mark as well:

| Colour | Meaning |
|---|---|
| Merlot (Vici's accent) | You: Approve, your decision and its outcome |
| Lilac (Vici's feature colour) | The AI: the agent's words, its recommendation, its drafts and summary, and the live-run notice |
| Coral, honey, sage | Affected (×), at risk (!), resolved (✓) |
| Ink | Everything else |

## The shell and the case

The shell is the presenter's frame and knows nothing about supply chains. Rebate Hunter and Timetable Translator can take it as it is.

| Shell | Case |
|---|---|
| `js/shell.js`: steps by click, key and `?step=`, the bar that asks (`setMove`), the key figures, the mode, the case menu, the Start agent dialog and the decision clock | `js/story.js`: the steps, the scenarios and a scenario's run, with every figure filled in |
| `js/claude.js`: the session key, streaming from the Messages API, retries | `js/view.js`: how a step looks, and the key figures' values |
| `js/cost.js`: the session cost, measured or estimated | `js/map.js`, `js/agent.js`, `js/tools.js`, `js/prompt.js`, `js/erp.js`, `js/impact.js`, `js/world.js` |
| `js/format.js`, `js/theme.js` | `js/main.js` wires the two |

To port it: copy the shell modules and the page's header, talk track, Start agent dialog and guide; mark your figures `data-vc-kpi`; write your own `STEPS`, each with what it will do (`next`) and what the agent is doing (`doing`), a run record with events by step, a `renderStory(run, step)` and a `renderKpis(run, setKpi)`; and wire them in a `main.js` like this one. `tests/files.mjs shell` checks that the shell imports nothing of the case.

## The run record

A replay and a live run fill the same record, so every step looks the same in both:

```
{ mode, scenario, events: { spot: [], check: [], calculate: [], propose: [], prepare: [] },
  options, decision, rejected, drafts, report }
```

The scripted runs (`data/sim_runs.js`) hold words and placeholders such as `{{var}}` or `{{part.P-DSP.air}}`. `js/story.js` plays them through the same record queries and engine the live agent calls, and fills every placeholder from the results. Nothing in a script is a typed figure; `tests/figures.mjs` checks it, and checks every figure written in the page against the engine.

## The live run

Start agent runs Claude Sonnet 5.5 from the browser on the visitor's key, with real web search. The key stays in the tab's session storage and goes only to api.anthropic.com, the one host the page's content security policy allows.

- **The conversation.** Streaming, adaptive thinking, prompt caching; every assistant turn goes back unchanged, and every tool call is answered.
- **The guardrails, in code.** An alert needs two independent sources, or it is labelled a what-if. Drafts follow an approved option only. The summary waits until every draft is decided. A run stops at 40 steps or €3.
- **Nothing is sent.** There is no email or booking system to send to. Approved drafts stay on the page.
- **Transparency.** The page says "You are interacting with an AI system" wherever a live run is possible, and the mode reads Live during one.

`tests/live.mjs` runs it against a stand-in for the API that checks every request.

## Vici

The page follows Vici 2.0 at ViciDesign's main branch, copied into `vici/` byte for byte (`vici/README.md`). Navigator brought three rules back to Vici: the How it works chapter explains every key figure in a table row of its own, a page that can run live says it is an AI, and both are checked in ViciDesign's CI.

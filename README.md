# Navigator — Supply Chain Disruption Navigator

A live, agentic AI demo for supply chain risk. Navigator watches a fictional German EV maker, Nordwerk Automotive (final assembly in Leipzig, e-drive plant in Győr, 57 suppliers in real industry clusters), and answers the question every operations board asks after a disruption: *which factory stops when, what does it cost, and what is the cheapest way to keep it running?*

**Version 1.1.0.** Static website, no backend, no build step. Runs on GitHub Pages or any static host.

---

## What it is and why it matters

Supply chain disruptions are rarely a data problem: the signal is usually in the news hours before it reaches the planning meeting. What takes days is the joining-up. Someone has to work out whether the event touches a supplier, which parts and plants depend on that supplier, how much stock is left, and what the options cost. Navigator shows an AI agent doing that work in minutes. It takes an unverified signal, checks it against a second independent source, maps it onto the bill of materials, inventory and open orders, and calculates when each plant would stop and what that costs.

The agent then proposes exactly three costed responses next to the do-nothing baseline, waits for a human decision, and turns the approved option into draft supplier emails and mock freight bookings. Nothing leaves the outbox without approval, and nothing is ever sent to a real company. Every step is visible in the console as it happens: tool calls, sources, self-corrections, and the reasoning summary. Every model call and decision lands in an audit log that can be exported as JSON. The € figures do not come from the language model. A deterministic impact engine computes them from the company data, and the agent can only choose between engine variants, so it cannot invent a number.

For clients, the point is not the fictional company but the pattern: agentic AI that uses tools, verifies before it alerts, quantifies before it recommends, and keeps a human in charge of every outbound action. Everything runs in the presenter's browser on open data and the presenter's own Claude API key. There is no server to approve, no client data and no integration project. Because it reads well to a non-expert in about a minute, it opens a conversation about where the same pattern fits the client's own data.

> **Fictional company.** Nordwerk Automotive GmbH and all supplier names are invented. Locations, ports, corridors and industry clusters are real. See `DATA_SOURCES.md`.

## How it works

```
 Presenter's browser: static files from GitHub Pages (or any static host)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                                                                            │
 │   Live agent (js/agent.js)            ┐                                    │
 │   Claude tool-use loop, streamed      │   one stream of     ┌───────────┐  │
 │                                       ├─► run events ──────►│ Map, KPIs,│  │
 │   Simulation player (js/simulation.js)│   (js/events.js)    │ console,  │  │
 │   scripted replay, data/sim_runs.js   ┘                     │ options,  │  │
 │                                                             │ outbox,   │  │
 │   Tools the agent can call (js/tools.js)                    │ audit log │  │
 │    erp_*       synthetic ERP: suppliers, BOM, stock, orders └───────────┘  │
 │    sim_impact  deterministic impact engine (js/impact.js)                  │
 │    geo_*       open-data APIs ──────────────────────────┐                  │
 │    ui_*        alert, options, drafts, report: they wait for a human       │
 │                                                         │                  │
 └───────────┬─────────────────────────────────────────────┼──────────────────┘
             │ HTTPS with your API key                      │ HTTPS, no key
             ▼                                              ▼
   api.anthropic.com/v1/messages                 Open-Meteo (weather)
   Claude, plus its server-side web search       USGS (earthquakes)
                                                 NASA EONET (natural events)
                                                 PEGELONLINE (Rhine gauge at Kaub)
```

- **Two producers, one interface.** The live agent and the simulation player emit the same run events, so the interface behaves the same in both modes. Only the mode badge, the console watermark and the audit export differ.
- **Synthetic world.** `data/world.js` holds the company, plants, suppliers, parts, stock, purchase orders, routes and qualified alternatives. It ships as a script (`window.WORLD = …`), so nothing is fetched.
- **Guardrails in code, not only in the prompt.** Every option figure comes from the engine. An alert marked "verified" needs two sources. Drafts only follow an approved option. The report waits until every draft is decided. Each run is capped at 40 model calls and €3.
- **Browser-enforced boundaries.** The page's Content Security Policy only lets it connect to api.anthropic.com and the four open-data APIs. The key lives in this tab's session storage only.

## Deploy in five minutes (GitHub Pages)

You need a free GitHub account. The repository must be public for Pages on a free plan.

1. **Create the repository.** On github.com, open the **+** menu (top right) and choose **New repository**. Name it `supply-chain-navigator`, choose **Public**, and click **Create repository**.
2. **Upload the files.** On the empty repository page, click **uploading an existing file**. Drag in the *contents* of the Navigator folder (the files and folders, not the folder itself), then click **Commit changes**.
   - GitHub takes **at most 100 files per upload**. Navigator has about 120, so upload in two goes: first everything except `fonts/` and `vendor/`, then those two folders (**Add file → Upload files**).
   - Include the hidden file **`.nojekyll`**. It stops GitHub from running Jekyll over the Markdown files. On a Mac, press **Cmd + Shift + .** in Finder to show hidden files. If it is missing, use **Add file → Create new file**, name it `.nojekyll`, type any text, and commit.
3. **Turn on Pages.** Go to **Settings → Pages**. Under **Build and deployment → Source**, choose **Deploy from a branch**. Set the branch to **main** and the folder to **/ (root)**, then click **Save**.
4. **Open the site.** After a minute or two, reload the Pages settings page. It shows **Your site is live at `https://<your-user>.github.io/supply-chain-navigator/`**. Progress is visible under the **Actions** tab ("pages build and deployment").
5. **Check it on the presentation laptop.** Open the site and click **Diagnostics**, then **Run all tests**. Every row should pass. Map tiles may fail on some corporate networks; the offline coastline map then takes over.

**Updating.** Upload the changed files again (same names overwrite) or push with git. GitHub Pages caches files for up to ten minutes. After an update, hard-reload (**Ctrl + Shift + R**, or **Cmd + Shift + R** on a Mac) and check the version shown at the bottom of Diagnostics.

**Run it locally.** Browsers do not run JavaScript modules from `file://`, so double-clicking `index.html` shows a page that explains this. Start any static web server in the folder instead, for example:

```
python3 -m http.server 8000
```

On Windows, use `py -m http.server 8000`. Then open `http://localhost:8000`. Live mode works locally too, because the Anthropic API accepts browser calls from any origin.

**Free alternatives.** The folder runs unchanged on any static host:
- **Cloudflare Pages:** in the dashboard, open **Workers & Pages → Create application → Get started** and choose **Drag and drop your files**. Name the project, drag in the folder and click **Deploy site**.
- **Netlify:** sign in, then drag the folder onto `app.netlify.com/drop`.

## First visit

On a first visit, a short window explains what Navigator does, how it works (spot, check, calculate, propose, prepare) and why it pays off. Its **Start agent** button leads straight into the run. **How it works** in the header opens it again at any time; during a run it only explains and never interrupts.

## Reading the screen

- **Burgundy is you.** Approve buttons are burgundy, and so is the step of the progress rail that waits for you: *Your decision* for the options, then *Your approval* for the drafts.
- **Violet is the AI.** The options, drafts and summary the agent wrote carry an **AI** label. Click it to see who wrote them and where the figures come from.
- **Red, amber and green are the supply chain:** affected, at risk, resolved. A word or an icon always says the same thing.
- **The progress rail** above the console shows the agent's plan in five steps and where it is now.

Every colour is generated from the one burgundy and checked for contrast and colour blindness. `DESIGN.md` explains the system, the methods behind it and how to change it.

## The two modes

Clicking **Start agent** first asks how the agent should run.

| | **Simulation** | **Live agent** |
|---|---|---|
| What runs | A scripted replay of a representative agent run | Real Claude reasoning with real tool calls |
| Evidence | Representative headlines and readings, labelled "(representative)" | Live web search and live open data |
| Figures | Calculated by the impact engine at playback | Calculated by the impact engine |
| Key and cost | None | Your Anthropic API key; a few tens of euro cents per run |
| Network | None beyond map tiles; works fully offline | api.anthropic.com and the open-data APIs |
| Labelling | SIMULATION badge, hazard-tape watermark in the console, "Simulated run" in the summary, `"mode": "simulation"` in the audit export | LIVE badge, `"mode": "live"` |

- **Use Live for the real demo.** If the agent finds nothing, it says so. If an injected scenario cannot be confirmed, it labels the analysis a *what-if*.
- **Use Simulation** for rehearsal, as the fallback on stage, and for anyone exploring without a key. Replay speed ×1, ×2 or ×4 is set in the control bar.
- **Live scan** (control bar) looks for real disruptions in today's news and open data, with no injected scenario. It always runs live.
- **Custom what-if** (Scenario menu) lets the audience type a disruption. It needs the live agent.

The six preset scenarios: Rotterdam terminal strike, Rhine low water at Kaub, an earthquake near Hsinchu, flooding in the Styrian and Slovenian castings region, Red Sea re-routing via the Cape, and a fire at a Tangier wiring-harness plant. Each has a real-world precedent (`DATA_SOURCES.md` §4.4).

## Your API key

Navigator asks for a key only when you start a live run: **Live agent** in the mode dialog, **Live scan**, or a custom what-if.

1. **Create a dedicated workspace with a spend limit.** At [platform.claude.com](https://platform.claude.com), open **Settings → Workspaces → Create workspace** (needs an organisation admin), for example "Navigator demo". Select it and set a monthly spend limit under **Spend limits**, for example $10. Spend limits apply per workspace, not per key, and cannot be set on the Default Workspace.
2. **Create a key in that workspace.** Under **Settings → API keys → Create key**, scope the key to the Navigator workspace.
3. **Enter it only in the app.** Paste it when Navigator asks; it is checked with a free call that uses no tokens. Never paste the key into chat, slides or email.

What happens to the key:
- It is kept in this tab's session storage only. It is cleared when the tab closes, is absent from other tabs, and is never written to local storage, the console, the audit export or recorded runs.
- It is sent only to api.anthropic.com, in the `x-api-key` header. The page's security policy blocks every other destination.
- **Start agent → Change or forget key** removes it at any time. On a shared computer, use it before you leave: duplicating a tab copies its session storage, and browser session restore can bring a closed tab back.
- Diagnostics has a **Key and privacy** row that checks all of this in your browser.

## What a run costs

The cost meter in the header shows the real cost of every call as it happens (token usage × list price, plus $10 per 1,000 web searches, converted at 1 USD = 0.894 EUR). The audit export holds the usage of every model call.

| Model (selector) | Per preset scenario run | Notes |
|---|---|---|
| **Sonnet 5.5** (default) | **≈ €0.20 measured**; expect €0.15–0.40 | Best balance for the stage |
| Haiku 5.5 | ≈ €0.02–0.06 | Fastest; the search fee dominates |
| Opus 5.5 | ≈ €0.35–0.90 | Deepest reasoning, slower |

A Live scan can add up to €0.05 for extra searches. Diagnostics' optional web-search test costs about €0.0001. A full rehearsal day of 20 Sonnet runs costs about €4–8. Each run stops on its own if it passes €3.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Page says it must be opened through a web server | It was opened from disk (`file://`). Use GitHub Pages or `python3 -m http.server` (see above). |
| GitHub Pages shows 404 | Wait two minutes after enabling Pages and check the **Actions** tab. Make sure `index.html` is in the repository root and the branch is `main` with folder `/ (root)`. |
| Old version after an update | Pages caches for up to ten minutes. Hard-reload and check the version in the Diagnostics footer. |
| "Could not reach api.anthropic.com", or Diagnostics fails the Anthropic API row | A firewall, proxy or browser extension blocks the call (this looks like a CORS or network error). Try another network, such as a phone hotspot, or another browser profile without extensions. Simulation mode works offline. |
| "Anthropic rejected the API key (401)" | The key is wrong, expired or archived. Navigator removes it from the tab; enter a valid one. |
| Error that mentions a workspace | The key works in several workspaces, and the API needs to know which one. Create a key scoped to a single workspace. |
| "Spend limit reached" or "no credit" | Raise the workspace's spend limit or add credit in the Console, or switch to Simulation. |
| Banner "Web search is switched off for this API key" | An organisation admin has disabled Claude's web search in the Console's organisation settings. Navigator keeps going with the open-data tools; preset scenarios and Simulation work, Live scan is disabled. Ask the admin to enable web search, or use a key from another organisation. |
| An open-data row fails in Diagnostics | That provider is blocked or down from this network. Nothing to fix: the agent skips it, says so in the console and verifies through web search instead. |
| Map shows only grey land and coastlines | Tile servers are blocked; the offline coastline map takes over. Markers, routes and colours still work. |
| "The API is busy right now" | Anthropic returned overloaded or rate-limit errors after two automatic retries. Wait a minute, or switch to Haiku, or run the Simulation. |
| Run ends as **Stopped** | The model ended its turn twice without finishing; Navigator does not invent the rest. Start again, or switch to the Simulation of the same scenario. |
| Text too small on the projector | Use **Larger text** in the console header. The layout is tested at 1920×1080 and down to 1280×720. |

## Recording a live run for Simulation mode

After a completed live run of a preset scenario, click **Save run as simulation** (end of the console, or the Audit tab). Navigator validates the recording and downloads `sim-run-<scenario>-recorded-<date>.js`. Append that file's content to the end of `data/sim_runs.js`: from then on, Simulation mode replays that real run for the scenario, labelled "Replay of a live run recorded on <date>". Evidence is shown as "(recorded <date>)", € figures are recomputed by the engine, and only the decision path that was taken live can be replayed. Delete the appended block to return to the authored script.

Record on Sonnet, approve the recommended option, and read the run before you ship it. If the reasoning would not survive a partner's questions, record again. The first real recording was not shipped for that reason (`TECH_NOTES.md`, D28).

## Safety and the EU AI Act

Navigator is designed along the transparency and human-oversight lines of the EU AI Act. This is a design intent, not a legal assessment.
- **Disclosure.** "You are interacting with an AI system" is shown permanently in the header.
- **Human oversight.** Options wait for a human decision, and each draft waits for its own approval. A run that ends without a decision shows its options and drafts as undecided.
- **No real-world action.** The outbox has no email or booking integration; approval only marks a draft as cleared. Bookings say "Mock booking for demonstration".
- **Record-keeping.** The audit export contains every run event, every model request and response (minus thinking signatures and encrypted search content), the mode, the run facts and the cost.
- **Honest modes.** Simulation output is labelled everywhere and never presented as live.

## Quality and acceptance

- The **run facts** line at the end of every run states agent time (excluding time spent waiting for your decisions), tool calls by kind, visible verification steps, revisions and cost. The same facts are in the audit export.
- `node tools/check_world.mjs` checks the synthetic world, the scenarios, the reference cases and all six simulation scripts. It needs Node.js only.
- `node tools/palette.mjs --check` checks the colour system: contrast for every text and state pairing, and that the state colours stay apart for colour-blind viewers. It needs Node.js only.
- `tests/` contains the browser test suites used for the acceptance checklist (Playwright; optional). See `tests/README.md`.
- `TECH_NOTES.md` §11 lists each acceptance item with its evidence. §10 is the verification log.

## Files

| Path | Contents |
|---|---|
| `index.html` | The single page, its security policy and the boot screen |
| `css/` | Styles: layout, components, console, drawer, map, dialogs, fonts |
| `css/tokens.css`, `design/tokens.json` | The colour tokens, generated by `tools/palette.mjs`; do not edit by hand |
| `js/` | ES modules, one responsibility each (see below) |
| `data/world.js` | The synthetic company: plants, suppliers, parts, BOM, stock, orders, nodes, corridors, alternatives |
| `data/scenarios.js`, `data/reference_cases.js` | The six preset scenarios and their engine reference cases |
| `data/sim_runs.js` | The six simulation scripts |
| `data/basemap_offline.js` | Natural Earth land polygons for the offline map |
| `fonts/`, `vendor/leaflet-1.9.4/` | Self-hosted fonts and the fallback copy of Leaflet, with licences |
| `images/author.jpg` | The author's photo for the credit in the drawer bar |
| `tools/check_world.mjs` | Static integrity checks (Node.js) |
| `tools/palette.mjs` | The colour generator and its checks (Node.js) |
| `tests/` | Optional browser test suites |
| `README.md`, `DEMO_SCRIPT.md`, `DATA_SOURCES.md`, `TECH_NOTES.md`, `DESIGN.md` | This guide, the 8-minute stage script, every data source, verified API facts and decisions, the design system |

Main modules: `agent.js` (live tool-use loop), `anthropic.js` (streaming client, retries), `prompt.js` (system prompt), `tools.js` (tool definitions and guardrails), `erp.js` (ERP queries), `impact.js` (impact engine), `geo.js` (open-data tools), `simulation.js` (replay), `recorder.js` (Save run as simulation), `events.js` (run-event bus), `ui.js` (orchestration), `intro.js` (the How it works window), `progress.js` (the progress rail), `handover.js` (names the step that waits for you), `ai_label.js` (AI labels), `map.js`, `console.js`, `kpi.js`, `options_panel.js`, `outbox.js`, `audit.js`, `diagnostics.js`, `keystore.js` (session-only key), `cost.js`, `run_facts.js`.

## Credits and licences

Leaflet 1.9.4 (BSD-2-Clause). Map data © OpenStreetMap contributors (ODbL). Natural Earth land polygons (public domain). Fonts: Barlow, Barlow Semi Condensed and IBM Plex Mono (SIL Open Font License 1.1). Live data: Open-Meteo (CC BY 4.0; the free API is for non-commercial use), USGS (public domain), NASA EONET, PEGELONLINE (DL-DE→Zero-2.0). Claude and its web search are services of Anthropic, billed to your own key. Details are in `DATA_SOURCES.md`.

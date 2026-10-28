# Tests (optional, for developers)

Navigator itself needs no Node.js, npm or build step. These scripts are the checks behind the acceptance checklist in `TECH_NOTES.md` §11. Run them after changing code or data.

## What runs

| Suite | Command | Checks |
|---|---|---|
| tokens | `node tests/tokens.mjs` | The colour system on Vici's values (`vici/dist/tokens.json`), in the light and the dark theme: WCAG 2.2 contrast for every text-on-fill and mark-on-surface pair the app uses (4.5:1 for text, 3:1 for marks, icons and control borders), the shell's and the map's (`lib/prototype.mjs`: the network, the states, the marks inside the hexagons, the plants, the labels, the popups, the comparison bars); every Vici token the app's CSS and JavaScript name exists. It also measures how far the state colours, the network, checking, the comparison bars and the map's fills stay apart under simulated protanopia, deuteranopia and tritanopia, and how far merlot stays from danger, and reports the gaps where Vici's tones fall short of the former palette's thresholds without failing on them. Node.js only |
| page-icon | `node tests/page-icon.mjs` | `favicon.svg` byte for byte as given; the header and the loading screen use the page icon's cell and icon classes; with a checkout of Victor's website (`VIP`) next to this repository, its card (`VIP/data/prototypes.js`) still gives Navigator the same icon and kind (otherwise it says it skipped that part and passes). Node.js only |
| vici-files | `node tests/vici-files.mjs` | `vici/` holds exactly the files `vici/README.md` lists, with the release, the licence and every file Vici's stylesheet loads; with a checkout of Vici (`ViciDesign`) at the same release next to this repository, every file is byte for byte Vici's (otherwise it says it skipped that part and passes). Node.js only |
| world | `node tools/check_world.mjs` | Synthetic world, scenarios, reference cases and the six simulation scripts (32 checks). Node.js only |
| unit | `node tests/unit.mjs` | Streaming client: SSE parsing, thinking signatures, retries, aborts, truncated streams; cost maths per model. Node.js only |
| smoke | `node tests/smoke.mjs` | A full Simulation run; key check and a model that stops early; Diagnostics; the intro window (first visit, reopen, start); Vici's byline in the drawer bar (its markup, LinkedIn's logo and the website as 44 px links in a new tab, no link to the source code); every control doing its job exactly once (the theme toggle and the map following it, *Larger text*, the map's legend and a layer toggle, the zoom buttons, the replay speed, a drawer tab, a dialog's backdrop and Escape, the tooltips, *Show key*), because vici.js acts on some controls by itself; CDNs down; no Leaflet; `file://`; a missing data file |
| sims | `node tests/sims.mjs` | All six simulations with different decision paths; markings, placeholders, network, payoff, audit |
| live | `node tests/live.mjs` | The live agent against `lib/fake-claude.mjs`, a scripted stand-in for the Messages API that checks every request against the protocol rules; includes Save run as simulation and its replay |
| accept | `node tests/accept.mjs` | Key lifecycle and privacy, Diagnostics → agent fallback, the Abort/Reset matrix, Simulation fully offline |
| layout | `node tests/layout.mjs` | From 1920×1080 down to 1280×720, including 1536×864: no horizontal overflow, header badges never overlap the KPI tiles, one-row control bar; touch targets ≥ 40 px |
| design | `node tests/design.mjs` | In the light and the dark theme: the colour grammar in the running app: the map's corridors, its hexagon cells and the legend use the state tokens of the theme on screen; the status tag, console and progress rail name the human step (*Your decision*, then *Your approval*); AI labels open and close. Also writes review screenshots in both themes: the options under a simulated projector washout, and the finished run as seen with protanopia, deuteranopia and tritanopia (`review-*.png` in `navigator-tests/design/`, the dark theme's ending in `-dark`) |
| hexagon | `node tests/hexagon.mjs` | Vici's hexagon rule: nothing in the app is round. The app's own files (not `vici/`, `vendor/`, `tests/` or `tools/`) hold no round CSS (a radius of 25 %, 40 px or 2.5 rem or more, viewport units in a radius, `circle()` or `ellipse()` in a clip path, radial gradients) and no round drawing code (`<circle>`, `<ellipse>`, a pill-shaped `<rect>`, "circle" or "ellipse" handed to an element factory, Leaflet circles, canvas arcs, path data with arc commands); the rendered app at the main states of a simulation run, the map's details and views and the dialogs on the way, in both themes, holds no element whose corners are at least half its size, no circle or ellipse and no arc. Each part first proves on planted examples that it catches every kind. `node tests/hexagon.mjs files` runs the file scan alone, without a browser |

`node tests/run-all.mjs` runs everything in that order and prints a summary. Name suites to run only those (`node tests/run-all.mjs unit live`); name cases to run only those within a suite (`node tests/live.mjs full abort`).

No test calls a real API or spends money: Anthropic and the open-data services are replaced by fixtures inside the browser, and the Leaflet CDN is served from `vendor/`.

## Setup for the browser suites

You need Node.js 20 or later and Playwright with Chromium. Install them once, outside this folder:

```
npm install -g playwright
npx playwright install chromium
```

Then run with Node's module path pointing at the global packages:

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`.

Options (environment variables):
- `PLAYWRIGHT_MODULE`: path to a Playwright installation, instead of `NODE_PATH`.
- `CHROME_PATH`: use this Chrome or Chromium binary instead of Playwright's.
- `NAV_TEST_OUT`: folder for screenshots, downloads and result files (default: the system temp folder, `navigator-tests/`).

The suites serve the app on `127.0.0.1` ports 8765 to 8770; the hexagon suite takes a random one between 8790 and 9089.

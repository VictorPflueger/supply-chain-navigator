# Tests (optional, for developers)

Navigator itself needs no Node.js, npm or build step. These scripts are the checks behind the acceptance checklist in `TECH_NOTES.md` §11. Run them after changing code or data.

## What runs

| Suite | Command | Checks |
|---|---|---|
| world | `node tools/check_world.mjs` | Synthetic world, scenarios, reference cases and the six simulation scripts (32 checks). Node.js only |
| unit | `node tests/unit.mjs` | Streaming client: SSE parsing, thinking signatures, retries, aborts, truncated streams; cost maths per model. Node.js only |
| smoke | `node tests/smoke.mjs` | A full Simulation run; key check and a model that stops early; Diagnostics; the intro window (first visit, reopen, start); CDNs down; no Leaflet; `file://`; a missing data file |
| sims | `node tests/sims.mjs` | All six simulations with different decision paths; markings, placeholders, network, payoff, audit |
| live | `node tests/live.mjs` | The live agent against `lib/fake-claude.mjs`, a scripted stand-in for the Messages API that checks every request against the protocol rules; includes Save run as simulation and its replay |
| accept | `node tests/accept.mjs` | Key lifecycle and privacy, Diagnostics → agent fallback, the Abort/Reset matrix, Simulation fully offline |
| layout | `node tests/layout.mjs` | From 1920×1080 down to 1280×720, including 1536×864: no horizontal overflow, header badges never overlap the KPI tiles, one-row control bar; touch targets ≥ 40 px |

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

The suites serve the app on `127.0.0.1` ports 8765 to 8769.

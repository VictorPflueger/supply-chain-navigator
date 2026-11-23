# Navigator's tests

The showcase needs none of this: it is a static page. The suites check that it stays what it claims to be.

## Setup

Node.js 22 or later. The browser suites need Playwright with Chromium, installed once, globally or in any folder:

```
npm install -g playwright@1.56.0
npx playwright install chromium
```

Vici's own checks come from a checkout of ViciDesign next to this repository (`../ViciDesign`) or in the folder `VICI_DIR` names. Without one, the suites that need it say so and pass; `--require-vici` makes them fail instead, as on GitHub Actions.

## Running them

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs                 # every suite
NODE_PATH="$(npm root -g)" node tests/run-all.mjs showcase live    # some suites
node tests/figures.mjs docs                                        # one case of one suite
```

Screenshots go to the folder in `NAV_TEST_OUT`, or `navigator-tests` in the system's temporary folder.

| Suite | What it checks | Prints |
|---|---|---|
| `figures` | Every figure on the page and in the guide equals the engine's for all six scenarios; no figure is typed into a script; the docs' figures are the app's | FIGURES OK, DOCS MATCH |
| `files` | The shell imports nothing of the case; the page's files, the imports and the workflow; `vici/` byte for byte at a ViciDesign main commit that CI checks out too | SHELL PORTABLE, FILES OK |
| `lean` | At most 16 modules, 4,500 lines of JavaScript, 900 of CSS; one module and one host for the network; short docs | LEAN OK |
| `vici` | Vici's guide, byline, writing and AI-notice checks on the page, every sentence the steps write and the docs, each first failing on a planted control | VICI CONTROLS OK, VICI STANDARDS OK |
| `showcase` | The five steps by click, key and link; the prototype running each step by itself; the bar that asks at every waiting point; the scenarios; the first screen, where Run it live stands after the steps; the key figures and the clock that says it stopped; the layout at four window sizes in both themes, with every option and Do nothing in view at the decision; Vici's `recordIdProblems` on every screen | STEPS OK, RUN OK, MOVE OK, SCENARIOS OK, FIRST SCREEN OK, KPIS OK, LAYOUT OK, NAMES OK |
| `guide` | ViciDesign's `check-guide-render.mjs` against the page over http, and every chapter fitting 1280 × 720 and 1366 × 768 | GUIDE OK |
| `live` | A live run against a stand-in API that checks every request: approvals, nothing sent, the cost measured, a rejected key, a stop | LIVE OK |
| `contrast` | Every visible text meets WCAG 2.2 AA, light and dark | CONTRAST OK |
| `hexagon` | Nothing round in the app's files or on the rendered page | HEXAGON OK |

Each rule is first tried on a planted example that must break it, so a check that cannot fail is caught.

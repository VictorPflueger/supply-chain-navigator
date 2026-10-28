# TECH_NOTES — verified facts and build decisions

Navigator calls the Claude API and four open-data APIs directly from the browser. Every external detail the code depends on is recorded here with its source and the date it was verified. If a fact changes, update this file first, then `js/config.js`.

**Verification date:** 12 October 2026 (Milestone 0). Sources are official Anthropic documentation at `platform.claude.com/docs`, the open-data providers' own documentation, and live probes run from the build environment. Sections 8–11 record the agent guardrails, the simulation format, the test log of Milestones 3–6 and the acceptance checklist. App version **1.2.0** (on Vici v1.0.0, Victor Pflüger's design system, 28 October 2026; see `DESIGN.md` and D47–D54).

---

## 1. Claude models and token prices (cost meter inputs)

Source: Models overview and Pricing pages, `https://platform.claude.com/docs/en/about-claude/models/overview`, `https://platform.claude.com/docs/en/about-claude/pricing`.

| Navigator label | API model ID | Input $/MTok | Output $/MTok | 5-min cache write $/MTok | Cache read $/MTok | Context | Max output |
|---|---|---|---|---|---|---|---|
| Haiku 5.5 — fast, cheapest | `claude-haiku-5-5` | 0.10 (prompt ≤ 100k tok) / 0.50 (> 100k) | 0.50 / 2.50 | 0.125 / 0.625 | 0.01 / 0.05 | 1M | 128K |
| **Sonnet 5.5 — default** | `claude-sonnet-5-5` | 2.00 | 10.00 | 2.50 | 0.10 | 1M | 128K |
| Opus 5.5 — deepest | `claude-opus-5-5` | 4.00 | 20.00 | 5.00 | 0.20 | 1M | 128K |

- Haiku 5.5 is priced in two tiers by prompt size. The cost meter picks the tier per request from `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
- Cache reads cost 0.05× base input on Sonnet 5.5 and Opus 5.5, and 0.1× on Haiku 5.5. 5-minute cache writes cost 1.25×.
- Adding any tool adds a fixed system overhead of 286 input tokens on all three models (`tool_choice: auto`). It is billed like any other input token and is already included in the `usage` the API returns.
- The Models API (`GET /v1/models`) returns `id`, `display_name`, `lifecycle`, `line`, `max_input_tokens`, `max_tokens` and a `capabilities` map, including `capabilities.server_tools.web_search.supported`. Diagnostics uses this free call to validate a key and confirm the three model IDs are active.

**USD → EUR.** The API bills in USD. The cost meter converts at a fixed rate: **1 USD = 0.894 EUR** (ECB reference rate 12 Oct 2026, read via `api.frankfurter.dev`). The constant `FX_USD_EUR` lives in `js/config.js`.

### Cost per run (measured and estimated)

| Model | Cost per preset-scenario run | Basis |
|---|---|---|
| Sonnet 5.5 (default) | **€0.20 measured**; expect €0.15–0.40 | First real run, 12 Oct 2026 (Styria scenario, 12 data and engine tool calls, 2 web searches). More searches, rejections and longer reasoning move it up |
| Haiku 5.5 | about €0.02–0.06 | Token prices are 1/20 of Sonnet's below 100k prompt tokens; the web-search fee (≈ €0.009 per search) then dominates |
| Opus 5.5 | about €0.35–0.90 | Token prices twice Sonnet's, and Navigator runs it at high effort |

A Live scan can use all five searches the prompt allows: add up to €0.05. The estimates for Haiku and Opus are derived from the Sonnet measurement and the price ratios; the cost meter shows the real figure on every run, and the audit export holds the usage of every model call.

## 2. Server-side web search tool

Source: `https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool`.

**Decision: use `web_search_20250305` with `max_uses: 5`.**

Request shape:

```json
{ "type": "web_search_20250305", "name": "web_search", "max_uses": 5 }
```

Optional fields: `allowed_domains` or `blocked_domains` (not both; bare domains, no scheme), and `user_location` (`{"type": "approximate", "city", "region", "country", "timezone"}`). Navigator sets neither; results should not be biased towards German-language sources.

Versions available:

| Version | Adds | Why Navigator does not use it |
|---|---|---|
| `web_search_20250305` | Basic search | — (chosen) |
| `web_search_20260209` | Dynamic filtering. Claude writes and runs code to filter results; `allowed_callers` defaults to `["code_execution_20260120"]` | Adds code-execution blocks to the transcript and console. Opaque on stage, no benefit at 5 searches per run |
| `web_search_20260318` | `response_inclusion` control | Not needed |

Response blocks:

- `server_tool_use` — `{id: "srvtoolu_…", name: "web_search", input: {query}}`
- `web_search_tool_result` — `content` is an array of `web_search_result` (`url`, `title`, `page_age`, `encrypted_content`), or an error object `{type: "web_search_tool_result_error", error_code}`. Error codes: `too_many_requests`, `invalid_tool_input`, `max_uses_exceeded`, `query_too_long`, `request_too_large`, `unavailable`. Errors arrive with HTTP 200 and are not billed. An empty array means no matches.
- `text` blocks may carry `citations` of type `web_search_result_location` (`url`, `title`, `cited_text` ≤ 150 chars, `encrypted_index`).

Billing and limits:

- **Price: $10 per 1,000 searches** plus normal token costs. Search results are counted as input tokens on later turns.
- Usage field: `usage.server_tool_use.web_search_requests`.
- **Org-level switch.** Web search is on by default. If an admin disabled it at `platform.claude.com/settings/capabilities`, any request containing the tool fails with **HTTP 400 `invalid_request_error`** stating that web search is not enabled. Navigator detects this, retries the request without the tool, shows a banner, and continues on open-data tools and scenario mode.
- **`pause_turn`.** Long server-tool loops can stop with `stop_reason: "pause_turn"`. The client resends the conversation with the paused assistant content unchanged.
- **Mixed groups.** If Claude calls web search and a client tool in the same turn, the API returns `stop_reason: "tool_use"` and runs the search on the next request. The follow-up user message must then contain only `tool_result` blocks.

## 3. Messages API from the browser (CORS, headers, protocol)

Sources: API overview, Errors, Streaming, Handle tool calls, Handling stop reasons, Thinking, Effort, Prompt caching, Rate limits (all under `platform.claude.com/docs`). The CORS behaviour is not described in the docs, so it was **probed live on 12 Oct 2026** (results below).

### Request

`POST https://api.anthropic.com/v1/messages` with exactly these headers:

| Header | Value |
|---|---|
| `x-api-key` | user's key (from `sessionStorage` only) |
| `anthropic-version` | `2023-06-01` |
| `content-type` | `application/json` |
| `anthropic-dangerous-direct-browser-access` | `true` |

Notes:

- The API overview now lists `Authorization: Bearer <key>` as the primary scheme and `x-api-key` as a supported legacy fallback. Navigator uses `x-api-key`, as the project spec fixes, and the CORS allow-list confirms it.
- Keys that span several workspaces also need `anthropic-workspace-id`. This is noted in the README troubleshooting section. The preflight echoes requested headers, so adding it is CORS-safe. Navigator does not send it; a 400/403 that names the workspace is answered with "use a key scoped to a single workspace".
- **Spend limits are per workspace, not per key** (re-verified 12 Oct 2026, docs "Workspaces" and "Authentication"): Settings → Workspaces → select the workspace → Spend limits. They cannot be set on the Default Workspace, and only organisation admins can create workspaces. Keys are created under Settings → API keys and can be scoped to one workspace. The key dialog therefore advises a dedicated workspace with a monthly spend limit and a key scoped to it (D35).
- No `anthropic-beta` header is used anywhere.

### CORS probe results (12 Oct 2026, from the build environment, `Origin: https://victorpflueger.github.io`)

- `OPTIONS /v1/messages` returned 200 with `access-control-allow-origin: *` and `access-control-allow-headers: x-api-key,anthropic-version,content-type,anthropic-dangerous-direct-browser-access`. The allow-list echoes whatever headers are requested.
- `POST /v1/messages` **with** `anthropic-dangerous-direct-browser-access: true` and no key returned 401 JSON (`authentication_error`) with `access-control-allow-origin: *` and `access-control-expose-headers: *`. The browser can read it.
- The same POST **without** the header returned 401 with **no** `access-control-allow-origin`. The browser blocks it as a CORS error. **The header is mandatory.**
- `GET /v1/models` with the header is also CORS-enabled. Diagnostics uses it as a free key check.

### Parameters Navigator sends

```json
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 16000,
  "stream": true,
  "cache_control": { "type": "ephemeral" },
  "thinking": { "type": "adaptive", "display": "summarized" },
  "output_config": { "effort": "medium" },
  "system": "…",
  "tools": [ … ],
  "tool_choice": { "type": "auto" },
  "messages": [ … ]
}
```

- **Prompt caching.** A top-level `cache_control: {"type": "ephemeral"}` is automatic caching: the API places the breakpoint on the last cacheable block. Every agent step resends the whole conversation, so this cuts input cost by roughly 70–80% per run. The minimum cacheable prompt is 512 tokens on all three models. Usage fields are `cache_creation_input_tokens`, `cache_read_input_tokens` and `input_tokens` (uncached only); total input is their sum.
- **Thinking.** On all three 5.5 models thinking is on by default (adaptive). Opus 5.5 and Sonnet 5.5 reject `{"type": "disabled"}`. The default display is `"omitted"` (empty thinking text). Navigator requests `"display": "summarized"` and shows the summaries as collapsed "Reasoning" entries, which supports transparency. Thinking is billed as output tokens at full length, whatever the display mode.
  - **Rule:** every assistant `content` array, including `thinking` and `redacted_thinking` blocks and their `signature`, is passed back to the API **unchanged**. Modified thinking blocks are rejected with 400.
  - Thinking blocks from Sonnet 5.5 and Haiku 5.5 only work in the account that produced them. Recorded runs are therefore stored as UI events, never as raw API transcripts.
- **Effort** (`output_config.effort`; levels `low`, `medium`, `high`, `xhigh`, `max`). API defaults are medium on Opus 5.5 and Haiku 5.5 and high on Sonnet 5.5. Navigator sends **medium for Haiku and Sonnet** (keeps a full run under about 4 minutes) and **high for Opus** (the "deep" option). Lower effort also means fewer, terser tool calls.
- **`tool_choice`.** Only `auto` is used. `any` and `tool` return 400 on Opus 5.5 and Sonnet 5.5.

### Streaming (SSE over `fetch`)

- Event order: `message_start` → (`content_block_start`, `content_block_delta`…, `content_block_stop`) per block → `message_delta`… → `message_stop`. `ping` events can appear anywhere. Unknown event types must be ignored.
- Delta types: `text_delta`, `input_json_delta` (`partial_json` strings that concatenate to the final tool input), `thinking_delta`, `signature_delta` (sent just before `content_block_stop`), and `citations_delta` (present in the API, not documented on the streaming page; handled defensively).
- `server_tool_use` and `web_search_tool_result` blocks stream as ordinary content blocks. The result block arrives complete in `content_block_start`.
- Usage: `message_start` carries input usage. `message_delta.usage` is **cumulative** and includes `server_tool_use.web_search_requests`.
- Mid-stream errors arrive as `event: error` with an error object, for example `overloaded_error`. Treat them like the equivalent HTTP error.
- A body that ends without a `stop_reason` (cut connection, or a proxy that does not pass the event stream through) is treated as an interrupted connection and retried like a network error (D23).

### Tool-use protocol rules enforced in `js/agent.js`

1. Every `tool_use` id in an assistant turn is answered by a `tool_result` in the very next user message.
2. `tool_result` blocks come **first** in that message. No text is added after results if a server tool is still unresolved.
3. Errors are returned as `{"type": "tool_result", "tool_use_id", "content": "…what went wrong and what to try next…", "is_error": true}`.
4. Stop reasons:

| `stop_reason` | Navigator's handling |
|---|---|
| `end_turn` | Run ends after `ui_final_report`. If the agent ends its turn earlier (for example to ask the presenter a question), Navigator tells it to continue on its own, at most twice and with a visible console note; after that the run ends as **Stopped** (D15) |
| `tool_use` | Execute client tools, send results |
| `pause_turn` | Resend unchanged |
| `max_tokens` | Retry once with a higher `max_tokens` if the last block is an incomplete `tool_use`; otherwise continue |
| `refusal` | Stop the run, show the reason, suggest switching model |
| `model_context_window_exceeded` | Stop the run cleanly |

### Errors and rate limits

| HTTP | `error.type` | Navigator behaviour |
|---|---|---|
| 400 | `invalid_request_error` | Show message. Covers spend-limit reached and web search disabled; the latter triggers the fallback |
| 401 | `authentication_error` | "Key rejected", reopen key modal |
| 402 | `billing_error` | Show billing hint |
| 403 | `permission_error` | Show message |
| 404 | `not_found_error` | Show message, e.g. model not available to this key |
| 413 | `request_too_large` | Show message |
| 429 | `rate_limit_error` | Honour `retry-after` (max 2 retries). A spend-cap 429 (`details.error_code = "enforced_spend_limit_reached"`) has no `retry-after` and is shown immediately |
| 500, 504, 529 | `api_error`, `timeout_error`, `overloaded_error` | Exponential backoff, max 2 retries, then stop with a clear message |
| — | network error, cut stream, 90 s without data | Retried like 5xx (max 2), then stopped with a message that points to Diagnostics and Simulation mode |

- Error bodies look like `{"type": "error", "error": {"type", "message"}, "request_id"}`. The `request-id` response header is logged to the audit trail for support.
- Rate limits (Start tier, per model): 1,000 RPM, 2,000,000 ITPM, 400,000 OTPM. Only uncached input counts toward ITPM on these models, so a Navigator run uses a tiny fraction.

## 4. Open-data endpoints (keyless)

The build environment's network allow-list blocks these hosts, so their CORS headers could not be probed from here. URLs and response shapes were verified by fetching them through a documentation fetcher on 12 Oct 2026. None of the four providers documents CORS. Each is widely called directly from browser apps, but **status: verify via in-app Diagnostics**. Every `geo_*` tool also returns `{error, fallback_hint: "use web_search"}` on any failure.

| Source | Endpoint used by Navigator | Verified response shape | Browser CORS | Terms |
|---|---|---|---|---|
| **Open-Meteo** forecast | `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=weather_code,precipitation_sum,rain_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min&forecast_days={1–16}&past_days={0–92}&timezone=auto` | `daily.{time[], …}` arrays | Not documented → Diagnostics | Free API is **non-commercial only**; < 600/min, 5,000/h, 10,000/day, 300,000/month; data CC BY 4.0. See `DATA_SOURCES.md` for the client-demo caveat |
| **USGS** earthquakes | Summary feeds `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{significant\|4.5\|2.5\|1.0\|all}_{hour\|day\|week\|month}.geojson` (updated every minute). Optional query service: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=…&minmagnitude=…&latitude=…&longitude=…&maxradiuskm=…` | GeoJSON `features[].properties.{mag, place, time, url, alert, tsunami, sig}`, `geometry.coordinates = [lon, lat, depth]` | Not documented → Diagnostics | US public domain |
| **NASA EONET v3** | `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days={n}&limit={n}[&category=…]`. Categories: `drought, dustHaze, earthquakes, floods, landslides, manmade, seaLakeIce, severeStorms, snow, tempExtremes, volcanoes, waterColor, wildfires` | `events[].{id, title, categories[], sources[], geometry[]}`; geometry is a time series of `{date, type, coordinates, magnitudeValue, magnitudeUnit}`. Storm tracks can hold dozens of points, so the tool keeps only the latest | Not documented → Diagnostics | Public; for visualization and general reference, not an official source |
| **PEGELONLINE** (WSV) | Current: `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/KAUB/W/currentmeasurement.json`. History: `…/stations/KAUB/W/measurements.json?start=P7D`. Station metadata: `…/stations/KAUB.json?includeTimeseries=true&includeCurrentMeasurement=true` | `{timestamp, value, stateMnwMhw, stateNswHsw}`, value in **cm**. KAUB: uuid `1d26e504-7f9e-480a-b52c-5932be6549ab`, Rhine km 546.23, gauge zero 67.669 m NHN | Not documented → Diagnostics | DL-DE→Zero-2.0; no authentication |

The station shortname `KAUB` works in the URL path, verified live. The docs only show UUID examples, so the UUID is kept in `js/config.js` as a fallback.

### Live observation captured during verification

PEGELONLINE reported Kaub at **15 cm** (11 Oct 2026, 20:30 CEST, `stateMnwMhw: "low"`), with readings between −2 and 13 cm over 2–10 Oct and discharge around 500 m³/s. German media report record-low Rhine levels with negative gauge readings this autumn. ZDFheute, 11 Aug 2026: Kaub at 16 cm, below the October 2018 record of 25 cm; most vessels unable to use the Middle Rhine; 16 cm on the gauge ≈ 1.29 m fairway depth.

**Consequence for the demo:** a Live scan today will very likely find a *real* Rhine low-water disruption. Navigator's world contains a deliberately modelled Rhine exposure (see `DATA_SOURCES.md`, scenario 2).

## 5. Map tiles (basemap)

Sources: `docs.carto.com/faqs/carto-basemaps`, `carto.com/basemaps/apikey`, `operations.osmfoundation.org/policies/tiles`.

- **CARTO raster basemaps (incl. Positron `light_all` and Dark Matter `dark_all`) require an API key since 25 Sep 2026.** Without one, maps show an "API key required" watermark. Keys are free but must be requested by a person. Free tier: 1M requests/month commercial, 5M non-commercial.
- **Decision:**
  - **Default basemap:** OpenStreetMap standard tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, desaturated with a CSS filter (`saturate(0.3) brightness(1.05) contrast(0.94)`) into a pale base for the light theme, and turned into a dark, quiet base for the dark theme by a second filter (`invert(1) hue-rotate(180deg) saturate(0.25) sepia(0.3) hue-rotate(-40deg) saturate(1.4) brightness(0.72) contrast(0.95)`, in `css/map.css`). Keyless; light interactive use is permitted with visible attribution and a valid Referer, both of which Navigator meets.
  - **Optional:** set `BASEMAP.cartoKey` in `js/config.js` to use CARTO's raster tiles: Positron (`light_all`) in the light theme and Dark Matter (`dark_all`) in the dark one, both from `basemaps.cartocdn.com`, which the security policy already allows. A theme change swaps the tile layer (D49).
  - **Always present:** an offline land-mass layer (Natural Earth, public domain) bundled in `data/basemap_offline.js`, drawn in the theme's tokens (land `--vc-surface`, coasts `--vc-border`, borders `--vc-border-subtle`, on the map's `--vc-bg-sunken`) and repainted when the theme changes. The map shows geography even with no tile access (Simulation-mode fallback).
  - The tile servers are blocked from this build environment, so the dark filter was tuned on a tile drawn in OpenStreetMap's palette; check it by eye on the presentation laptop.

## 6. Front-end libraries, fonts and browser security

| Asset | Version | Delivery | Notes |
|---|---|---|---|
| Leaflet | **1.9.4** (latest stable; 2.0 is still alpha on npm) | Loaded by `js/libs.js`: `https://unpkg.com/leaflet@1.9.4/dist/…`, then `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/…`, then the byte-identical copy in `vendor/leaflet-1.9.4/` (from the npm tarball, BSD-2-Clause licence included). 7 s timeout per source | Same SRI hashes on every source: `leaflet.js` `sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=`; `leaflet.css` `sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=` (computed from the npm tarball; identical to Leaflet's published values). Diagnostics shows which source was used |
| Design system | Vici v1.0.0 (commit `fdd868b`), copied from Rebate Hunter at commit `73c00f8` | Copied unchanged into `vici/`: `dist/vici.min.css`, `dist/vici.js`, `dist/tokens.json`, its fonts, the byline's portrait and LinkedIn's logo (`vici/README.md`) | MIT for its code (`vici/LICENSE`); `tests/vici-files.mjs` checks the copy against Vici's own checkout |
| Web fonts | Bricolage Grotesque, Inter, JetBrains Mono, and Vici's own Vici Mask | Self-hosted woff2 in `vici/assets/fonts/`, latin and latin-ext subsets (latin-ext covers ő in Győr, č in Kidričevo), declared in Vici's stylesheet | SIL Open Font License 1.1 for the three families (`vici/assets/fonts/OFL-*.txt`), MIT for Vici Mask (`vici/LICENSE`). No request goes to a third-party font service (D11) |

- No other runtime libraries; Vici's small script (`vici/dist/vici.js`) runs the theme toggle and the tooltips. Markdown in the management summary is rendered by a small built-in, escape-first renderer (`js/md.js`); no `marked`/DOMPurify dependency.
- ES modules need an `http(s)` origin. Browsers never run them from `file://`, so `index.html` carries a static boot screen that explains how to start a local server; `js/main.js` removes it once the workspace runs. Missing data or program files are reported on the same screen.

### Content Security Policy (meta tag in `index.html`)

The browser itself enforces where the page may connect, which turns the key-handling promise into a technical guarantee.

| Directive | Allows | Why |
|---|---|---|
| `connect-src` | `api.anthropic.com`, `api.open-meteo.com`, `earthquake.usgs.gov`, `eonet.gsfc.nasa.gov`, `www.pegelonline.wsv.de` | The only `fetch` targets. No other host can receive the API key or any data |
| `script-src` | `'self'`, `unpkg.com`, `cdn.jsdelivr.net` | App modules, data files, `js/theme.js`, Vici's script and Leaflet. No inline scripts, no `eval` |
| `style-src` | `'self'`, `unpkg.com`, `cdn.jsdelivr.net` | Vici's stylesheet, the app's and Leaflet's; dynamic styles and run-time custom properties (an icon's `--_icon`, a cell's `--cell`) go through the CSSOM (`element.style.setProperty`), never a `style` attribute, so no `'unsafe-inline'` |
| `img-src` | `'self'`, `data:`, `tile.openstreetmap.org`, `basemaps.cartocdn.com` (+ subdomains), the two CDNs | Map tiles; the favicon, the byline's portrait and LinkedIn's logo (`vici/assets/`); Vici's icons, which are CSS masks made of `data:` images. Leaflet uses a `data:` GIF for cancelled tiles |
| `font-src` | `'self'` | Vici's fonts, served from `vici/assets/fonts/` |
| `object-src`, `base-uri`, `form-action` | none | Hardening |

`frame-ancestors` cannot be set from a meta tag; GitHub Pages does not let a site set response headers.

## 7. Build decisions log

| # | Decision | Reason |
|---|---|---|
| D1 | Stream all Messages API calls (SSE) | Live narration appears token by token (real, not simulated delays), and avoids long idle HTTP requests |
| D2 | Automatic prompt caching on every request | ~70–80% lower input cost per run |
| D3 | Adaptive thinking with summarized display, shown collapsed | Transparency (EU AI Act spirit). No cost difference versus omitted display |
| D4 | `ui_propose_options` and `ui_await_approvals` block until the human decides | The loop pauses with no request in flight; rejections come back to the agent as tool results |
| D5 | Option € figures are taken from the deterministic engine by `variant_id` | Enforces the numbers rule in code, not only in the prompt |
| D6 | One unified run-event bus for live and simulated runs | The UI is producer-agnostic; only the badge, watermark and audit `mode` differ |
| D7 | Diagnostics results are stored in `sessionStorage` (`nav.diag`) | Geo tools skip endpoints known to fail and go straight to the web-search fallback |
| D8 | OSM tiles with a desaturating filter by default; CARTO Positron optional | CARTO now requires a key |
| D9 | Line-stop cost is modelled as stop-equivalent days × daily cost | Partial shortages reduce output proportionally; the plant runs at the rate of its scarcest part |
| D10 | Leaflet from unpkg, then jsDelivr, then a vendored copy in `vendor/` | Constraint 4 asks for libraries via CDN; constraint 6 asks Simulation to run with no network beyond map tiles. CDN stays the primary source; the local copy only loads when both CDNs fail, with the same SRI hashes. Delete `vendor/` to go CDN-only |
| D11 | Self-hosted fonts instead of Google Fonts | Loading Google Fonts from Google's servers sends each visitor's IP address to Google; the Munich Regional Court ruled this a GDPR violation without consent (LG München I, 20 Jan 2022, 3 O 17493/20). Also faster and offline-safe |
| D12 | Content Security Policy as a meta tag | Enforces in the browser that the key and data can only reach the documented hosts |
| D13 | Human decisions are queued from the start of a run | A decision is never lost while the producer is busy (for example "Approve all" sends five decisions at once). The live agent in M3 uses the same rule |
| D14 | Light theme: white paper, burgundy (`#7a1e3a`) for brand and actions, pastel tints for meaning (review feedback, 12 Oct 2026) | Pastels carry state as fills; each pastel has a deeper line and text shade so text meets WCAG AA (≥ 4.5:1 on white) and state strokes on the map reach ≥ 3:1 against white |
| D15 | If the agent ends its turn before `ui_final_report`, Navigator sends one short instruction to continue (at most twice, shown in the console); then the run ends as **Stopped**, not Done | Models sometimes stop to ask "Shall I continue?"; on stage nobody can answer in the console. The cap and the distinct end state keep it honest |
| D16 | Option cards, the KPI payoff and the plant colours after a decision all come from the same engine variant (`js/payoff.js`, shared by both producers) | After approval the value-at-risk tile shows the exposure that remains ("€1.9M left with option B (was €19.1M)"), the first-stop tile the option's first stop, and exposed plants turn green (nothing left) or amber |
| D17 | Simulation scripts use `{{placeholders}}` for every engine figure (`js/sim_vars.js`) and are checked statically (`js/sim_check.js`) | A scripted replay can never show an invented number or a broken decision path; Diagnostics and `tools/check_world.mjs` run the checks |
| D18 | "Save run as simulation" exports the UI event stream of a completed live run, not the API transcript | Thinking signatures only work in the account that produced them; events are what the UI needs. Evidence is labelled "recorded <date>", € figures are recomputed by the engine, options the live run did not take end the replay with a note |
| D19 | `erp_list_suppliers` matches two-letter country codes exactly and accepts country names and comma-separated lists | A substring match made "SI" also match "Hsinchu" and "Silesia" (17 suppliers instead of 3) |
| D20 | The map remembers the last view the app asked for and re-applies it when the drawer resizes the map, until the presenter pans or zooms | Without it, opening the options drawer cut the marked region off the bottom of the map |
| D21 | Live scan is disabled when web search is unavailable for the key | A scan depends on news; preset scenarios still work with the open-data tools |
| D22 | Console "Larger text" toggle (remembered per browser) | Readability at 1080p from five metres without making the whole layout larger |
| D23 | A response stream without a stop reason counts as an interrupted connection; the 90 s idle limit also covers the wait for response headers | Prevents a broken proxy response from looking like an empty, finished answer, and a stalled connection from hanging the run |
| D24 | Nothing from a run reaches the UI after it has ended: late tool results, throttled narration and tool emits are dropped after Abort or Reset | Found in review: a slow open-data call returning after Abort could appear in the next run's console and audit |
| D25 | `ui_propose_options` refuses to cost options against an older `sim_impact` than the latest one | Otherwise the cards could show a superseded baseline while the KPI tile shows the revised one |
| D26 | Safety lines are added in code: the AI footer on every draft (after truncation), "Mock booking…" on every booking, and "Live agent run…" on every live report | The prompt asks for them; the code guarantees them, and the recorder can always replace the live marker with the replay marker |
| D27 | The recorder follows the agent's view of each decision (the tool result of `ui_propose_options`/`ui_await_decision`), not the click | A quick second click while the model still answers the first decision would otherwise mix a rejection line into the approved path |
| D28 | The first real recording (Styria, 12 Oct 2026, Sonnet 5.5, €0.20) is **not** shipped in `data/sim_runs.js` | The run was technically clean (0 validation errors, honest what-if path because the flood could not be confirmed), but its reasoning had four flaws a partner would notice: no visible "Revised:" line; the duration was revised because "the 7-day case showed no stop" (assumption fitted to the result); option B's expected total (€2.98M) was higher than doing nothing (€2.2M) without comment; the agent called the options V1–V3. The authored script stays; README explains how to record a fresh run after D29 |
| D29 | Prompt and tool results tuned from that run (`js/prompt.js`, `js/tools.js`) | Visible "Revised: old → new" or "Confirmed: the first estimate holds" lines with the evidence; assumptions follow evidence, never the result; an option costlier than doing nothing is replaced or explicitly justified; options are named A, B, C everywhere (the decision tool results now say how to refer to them); the opening restates the signal in one sentence; the report's "How we know" names the evidence per assumption |
| D30 | Run facts: the console's last line and the audit export (`run_facts`) state agent time (excluding time waiting for the human), tool calls by kind, visible verification steps, revisions and cost (`js/run_facts.js`) | Acceptance item 2 becomes self-checking on every run, live or simulated, instead of a stopwatch exercise on stage |
| D31 | Diagnostics "Key and privacy" self-test | Checks in the presenter's browser that the CSP allows exactly the five documented hosts, that no key sits in local storage, that redaction works and that the audit export holds no key. Turns the key promises into something the presenter can show |
| D32 | "Change or forget key" in the mode dialog whenever a key is stored; the key dialog advises Forget key on shared computers | Before, Forget key was only reachable when no key was stored. Session storage ends with the tab, but duplicating a tab copies it and browser session restore can bring it back |
| D33 | When a run ends without a decision (Abort, error), open options show "No decision: the run ended" and pending drafts "Not decided: the run ended", without buttons | Buttons that only produce a "run has ended" notice invite clicks on stage; the state is now explicit. Nothing was ever sent either way |
| D34 | Version 1.0.0, shown in the Diagnostics footer | GitHub Pages caches files for up to 10 minutes; the presenter can confirm which version is loaded |
| D35 | Key advice names the mechanism that actually caps spend: a dedicated workspace with a monthly spend limit, and a key scoped to it | The Console sets spend limits per workspace, not per key, and not on the Default Workspace. The earlier text ("set its limit under Limits") pointed at the organisation-wide page |
| D36 | The browser test suites ship in `tests/` as optional developer tooling (Node.js and Playwright, installed outside the app); the app still has no dependencies or build step | The acceptance evidence in §10–11 can be reproduced by anyone after a change. The suites use fixtures for every external service, and their mock key (`sk-ant-test-MOCKKEY…`) is shaped so that secret scanners do not mistake it for a real key |
| D37 | An intro window, "How Navigator works", opens by itself on a browser's first visit and from **How it works** in the header (`js/intro.js`). It covers what Navigator does, five steps (spot, check, calculate, propose, prepare, coloured like the map states) and three value points, in under 200 words. "Seen" is remembered in local storage (`nav.introSeen`) | Anyone opening the link understands the prototype in a minute without a presenter. Local storage holds only this per-browser convenience flag, never the key; during a run the window has no Start button and never interrupts the run |
| D38 | The control bar collapses its labels below 1600 px (was 1500 px), and header badges wrap to a second row instead of overflowing | At 1536×864, a 1080p laptop at 125 % scaling and a common presenter set-up, the control bar wrapped to two rows. Wrapping the badges keeps the header's height (two rows fit) and can never overlap the KPI tiles |
| D39 | Every colour is generated from the brand burgundy `#7a1e3a` in OKLCH by tools/palette.mjs (removed in 1.2.0, D47): 12-step scales (Radix step roles), neutrals tinted with the brand hue, gamut mapping by chroma only. Output css/tokens.css and design/tokens.json (W3C Design Tokens Format 2025.10); `css/style.css` only assigns roles; the map and the logo read the roles | One change re-themes the whole app, and every pairing is checked instead of eyeballed. Supersedes the hand-picked pastels of D14 |
| D40 | Colour grammar: burgundy is identity and the human in charge (every Approve, the step that waits for you, decisions); red, amber and green are the network and outcomes; blue is checking; violet is the AI; ink is everything else. Approve buttons are burgundy (were pastel green), Reject is neutral (was red), the pending-decision status is burgundy (was amber), supplier tiers are slate (were blue, violet and pink); danger red stays on Abort and Forget key; the logo's ring is rose (was peach, now the colour of risk) | In 1.0 a person's decision borrowed the network's colours, and violet and amber meant different things in different places. One meaning per colour makes the screen readable in a sentence: "burgundy is you, violet is the AI, red, amber and green are the supply chain" |
| D41 | State hues are fixed (danger 29°, warning 57°, success 170°), not harmonised, and tools/palette.mjs (removed in 1.2.0, D47) fails the build unless the state colours, the cost bars and burgundy vs danger stay ≥ ΔEOK 0.10 apart under simulated protanopia, deuteranopia and tritanopia (Machado et al. 2009, severity 1.0, linear RGB) | Harmonising towards burgundy turned green to 140°: red and green were then ΔEOK 0.03 apart under deuteranopia. Red is now deeper than amber and green leans blue (Okabe–Ito's bluish green); the closest pair is 0.104 |
| D42 | Progress rail above the console (`js/progress.js`): the intro's five steps; ink while the agent works, burgundy with "Your decision" or "Your approval" when it waits for a person; monotonic; `aria-current="step"` and spelled-out states; labels collapse in a narrow console (container query) | The "intent preview" and "escalation" patterns for agentic UI (Smashing Magazine, Feb 2026): the room sees the plan, where the agent is, and the moment the human is needed |
| D43 | AI labels (after IBM Carbon for AI) on the options summary, each draft and the management summary: a violet **AI** mark that opens a toggletip saying who wrote the content (live model by name, recorded run, or scripted replay), that every figure comes from the engine, and what approval does | Makes the split between AI-written words and engine-computed numbers visible where decisions are made, in the spirit of the EU AI Act's transparency duties |
| D44 | The status pill, the console's phase line and the rail name the waiting state by the human step: "Awaiting your decision", then "Awaiting your approval" (`js/handover.js`) | The run state `awaiting_approval` covers both moments; the pill said "Awaiting approval" while the rail said "Your decision". One name per moment |
| D45 | Version 1.1.0. Design checks join the test suites: `tokens` (tools/palette.mjs --check: 32 contrast pairings, 2 brand-vs-danger checks, 9 colour-blind pairs, 2 file checks; replaced by `tests/tokens.mjs` in 1.2.0, D47) and `design` (`tests/design.mjs`: the grammar in the running app, plus projector-washout and colour-blind review screenshots) | Keeps the design system from drifting as the app changes |
| D46 | The drawer bar carries the author's credit in its middle, with links to his website and his LinkedIn profile, both opening in a new tab. Since 1.2.0 it is Vici's byline (D52); 1.1.x had a credit of its own with his photo, in ink like the tabs with a thin burgundy ring. The tab list is its own element inside the bar (it used to hold the note and the toggle too), and the bar is a three-column grid that centres the credit; below 1181 px it drops "Built by", below 1101 px it moves to a second row of the bar. Same code as Rebate Hunter (D-R56) | Requested 15 Oct 2026: the prototypes link back to their author. A new tab leaves a running demo in place, and the credit never covers the tabs or the note (`tests/layout.mjs`) |
| D47 | Vici v1.0.0, Victor's design system, copied unchanged into `vici/` (from Rebate Hunter at commit `73c00f8`, the commit that moved Rebate Hunter onto Vici) and loaded before the app's stylesheets. Vici decides the look (colours, type, shapes, components, icons), this prototype's rules the meaning (`DESIGN.md`). The app's CSS sits outside Vici's cascade layers and styles its own classes only. The shared shell (`css/` except `map.css`, `js/theme.js`, `js/dom.js`, `js/md.js`, `js/modal.js`, `js/progress.js`, `js/drawer.js`, and the tests `tests/tokens.mjs`, `tests/hexagon.mjs`, `tests/page-icon.mjs`, `tests/vici-files.mjs`) is Rebate Hunter's at that commit, with Navigator's names in its comments; what differs per prototype in the shared tests lives in `tests/lib/prototype.mjs`. Reading text runs at Vici's prose measure (50ch, about 65 characters of Inter). The former palette with its generator and token files, the self-hosted fonts with their stylesheet, and the author's photo left the repository; no CSS or JavaScript names the old scales | Requested 28 Oct 2026: the prototype looks like the rest of Victor's work, reworked the way Rebate Hunter was. A copy rather than a CDN keeps the security policy's hosts as they were; an unchanged copy keeps every fix in Vici (`tests/vici-files.mjs`) |
| D48 | The colour grammar in Vici's tokens: merlot (`--vc-accent`) is the human in charge, lilac (feature) the AI, danger, warning and success the network's states and outcomes, fjord (info) checking and the response cost, neutral ink the network at rest. Our plants are ink: a factory in a hexagon with a `--vc-border-strong` outline, a state as the outline's tone and a Vici tag with the state's icon and word beside the name; the supply links are neutral at rest (in 1.1 they were burgundy, the person's colour). Every state also has a form: a mark inside each hexagon on the map (cross, bar and dot, tick), a corridor's heavier line with that mark at its middle, a larger cell, words in the popovers. The simulation's tape is neutral, always with the word SIMULATION. No colour values in the app's CSS or JavaScript; the favicon is the one exception | Merlot sits close to Vici's danger (its text tone almost equals the danger solid), so it never marks anything among state colours, nor the client's own sites. Vici's state tones have almost the same lightness and some come close under colour blindness: `tests/tokens.mjs` reports those gaps (33) instead of failing on them, as Vici's to fix, and the form carries the difference (the design suite's colour-blind captures) |
| D49 | Both of Vici's themes, light by default: `js/theme.js` sets `data-theme` before the page is drawn (dark only if the visitor chose it), Vici's toggle in the header switches it, and vici.js remembers it under `vc-theme` in local storage, the one key Navigator shares on purpose with Victor's other pages on `victorpflueger.github.io`. On `vc:themechange` the map reads Vici's tokens again (never with fallbacks) and repaints what Leaflet draws as lines (corridors, supply links, alternative routes, the offline coastline map); the cells, plants, labels, legend and popovers follow through their classes; OpenStreetMap's tiles take the dark filter, and with a CARTO key the tile layer switches between Positron and Dark Matter on the same host. No `theme-color` meta | Projectors in lit rooms show the light theme best; the choice is shared with Victor's other pages on the same origin. Every contrast check and the design suite run in both themes; the security policy is unchanged |
| D50 | Hexagons instead of circles (Vici's hexagon rule): pips, badges, tags, steps, spinners and pulses; on the map the suppliers, hubs, alternatives and the corridors' state badges are hexagon cells in SVG (`js/map_cells.js`), each with the area of the circle it replaces, so outlines can be dashed and carry the state's mark; the plants are 42 px hexagons with a factory; the legend's swatches are the same cells, its toggles hex capsules; lines have square caps and mitred joins. Leaflet draws no circle any more. The cells are Leaflet markers with `keyboard: false` that open their popover on every click, as the circles did. In Chrome and Edge the circles had been tab stops, not by design: Leaflet 1.9 puts a tooltip's focus listeners on its layer, and Blink makes an SVG shape with focus listeners focusable (48 hubs and 43 suppliers in the Europe view, each opening its tooltip on focus and its popup on Enter); in Firefox they were not. The cells are no tab stops in any browser; the corridors' lines keep their accidental tab stops in Chrome and Edge | Vici's signature shape. `tests/hexagon.mjs` scans the files and the rendered app in both themes, the map's details and views included. `keyboard: false` follows the request, which counted the circles as no tab stops; `keyboard: true` on the cells (with Vici's ring) would bring Chrome's tab stops back |
| D51 | Vici's icons through `js/icons.js` (Rebate Hunter's module, with Navigator's names); nine concepts Vici has no icon for are drawn in Vici's style in the same module and proposed for Vici (`DESIGN.md` §11): seven of Rebate Hunter's drawings (stop, radar, key, eye-off, pulse, list, shield), a truck and a factory. Icon-only buttons are named by Vici's tooltips (`aria-labelledby`). The zoom buttons are Vici's icon buttons (plus, minus) in a Leaflet control that keeps Leaflet's zoom class and its Shift-click; the map's tools are Vici's compact buttons | One icon language with the rest of Victor's work; a click on the zoom buttons still counts as the presenter's own move (D20) |
| D52 | The page icon is the prototype's card on Victor's website: Vici's globe-hex icon in a lilac hexagon cell in the header (`vc-cell`), on the loading screen (`vc-cell--xl`) and, drawn for small sizes, as `favicon.svg`. The drawer bar carries Vici's byline (*Built by*, the portrait, LinkedIn's own logo and the website's globe), its two links 44 px targets that open in a new tab. No link to this repository in the app | The website and the app show the same mark (`tests/page-icon.mjs`); Vici makes the byline's links 24 px, the room needs 44 px |
| D53 | vici.js and the app's modules each own their controls: vici.js the theme toggle and the tooltips (the app's own tooltips are bound by `Vici.init` on a holder with nothing else in it, so no other behaviour is bound twice); the app its dialogs (`data-vc-dismissable="false"`), its drawer tabs, menus, the legend's fold and toggles, the zoom buttons, *Larger text* and the replay speed, none of which carry the classes vici.js acts on | A control both sides act on flips twice and looks unchanged; the keyboard paths stay as they were (`tests/smoke.mjs`, case *once*) |
| D54 | Version 1.2.0 | A change of look, with the same data, engine, guardrails and behaviour |

**Spec deviation (deliberate).** The kickoff lists `ui_propose_options({options: [{title, description, cost_eur, time_days, residual_risk}], baseline_cost_eur})`. Navigator's tool takes `variant_id` instead of `cost_eur`/`time_days`, and fills every € figure and time from the latest `sim_impact` result (D5). The agent cannot type a number onto an option card.

## 8. Live-agent guardrails (Milestones 3 and 5)

Enforced in code (`js/agent.js`, `js/tools.js`), not only in the system prompt (`js/prompt.js`):

| Guardrail | Where | Behaviour |
|---|---|---|
| Step cap | `AGENT.maxSteps = 40` | At most 40 model calls per run; then the run stops with a message |
| Cost cap | `AGENT.budgetEur = 3.00` | The run stops once its own cost passes €3.00. A typical Sonnet run costs about €0.20 (measured, §1) |
| Idle timeout | `AGENT.idleTimeoutMs = 90000` | 90 s without streamed data counts as a failed request (retried) |
| Compatibility | `callModel` | A 400 that names `output_config`/`effort`, `display`, `thinking` or `cache_control` drops that optional field and retries; a 400 about web search removes the tool, rebuilds the system prompt, shows a banner and disables Live scan |
| Output limit | `max_tokens` | A tool call cut off mid-input is discarded and the turn retried once with 1.5× `max_tokens` (16,000 → 24,000 on Sonnet) |
| Two-source rule | `ui_report_alert` | `basis: "verified"` needs at least two sources; otherwise the tool returns an error. Unverifiable injected scenarios run as `basis: "what_if"` and are labelled so |
| Options | `ui_propose_options` | Exactly three, each a `variant_id` of the latest `sim_impact` result; figures come from the engine |
| Decisions | `ui_propose_options`, `ui_await_decision` | Block until the human decides; approvals and rejections return as tool results with the next step spelled out |
| Drafts | `ui_draft_action` | Only after an approved option; every draft gets the footer "Prepared with the Navigator AI assistant. Requires human approval before sending." Nothing is ever sent |
| Report | `ui_final_report` | Refused while any draft is still pending; the agent must call `ui_await_approvals` first |
| Key | 401 | The key is removed from the tab and the run stops |
| Audit | `recordApiExchange` | Every request (appended messages, parameters) and response (content, usage, request id, duration) is logged; the system prompt and tool schemas once per run. Thinking signatures, redacted thinking and search `encrypted_content` are stripped; the key never enters the audit |

Run states shown in the status pill and under the stopwatch: Idle → Scanning → Diagnosing → Verifying → Simulating → Options → Awaiting approval → Executing → Done (or Stopped, Aborted, Error). The pill and the console name the waiting state by the human step: **Awaiting your decision** while the options wait for a choice, **Awaiting your approval** while drafts wait (`js/handover.js`, D44).

## 9. Simulation scripts and recorded runs (Milestone 4)

- **Format.** `data/sim_runs.js` holds one script per preset scenario: `{ title, steps: [...] }`, with optional `source: "recorded"` and `recorded: {at, model, app_version, run_id, cost_eur}`. Step types: `state`, `say`, `think`, `tool` (ERP query, re-executed), `web`, `geo`, `recordedTool`, `impact` (a reference-case name or `{name, spec, label}`), `alert`, `map`, `options` (`texts` per variant, `recommended`, optional `from` and `order`), `awaitOption` (`rejected` lines and `approved` step lists per option, `baseline` and `default`), `draft`, `awaitActions`, `report`, `notice`, `end`.
- **Numbers.** ERP results come from `js/erp.js` at playback; every € figure, stop day and date comes from the impact engine via placeholders such as `{{var}}`, `{{first_stop_date}}`, `{{V2.mit}}`, `{{part.P-SEAT.shortage_day}}`, `{{date:+5}}`.
- **Evidence.** Web-search and open-data results in authored scripts are representative, carry no URLs and are labelled "(representative)" in the console and in the alert sources. Recorded scripts keep the real results of the live run, labelled "(recorded <date>)".
- **Integrity.** SIMULATION badge with a striped tape, the tape and the word SIMULATION at the top of the console ("Scripted replay of a representative run" or "Replay of a live run recorded on <date> (<model>)"), a faint diagonal mark behind the log, `"mode": "simulation"` and `sim_source` in the audit export, and a report footer that names the run as simulated or recorded. `js/sim_check.js` rejects any script whose report calls itself a live run.
- **Authored paths.** Each of the six scripts has a hypothesis, at least two pieces of evidence before the verified alert, a visible "Revised:" self-correction, 9–11 visible tool calls before the decision, rejection lines for all three options, and approval paths for options A, B, C and "accept the risk". Rejecting all three options leads to the do-nothing path.
- **Recorder.** After a completed live run of a preset scenario, "Save run as simulation" (console end line and Audit tab) validates the recording with `js/sim_check.js` and downloads `sim-run-<scenario>-recorded-<date>.js`. Appending it to `data/sim_runs.js` replaces the authored script for that scenario. The live report's "Live agent run" line is rewritten to "Recorded live run, replayed in Simulation mode". Dates in recorded narration refer to the recording day.

## 10. Verification log (Milestones 3–6, 12 Oct 2026; design system 1.1.0, 13 Oct 2026; Vici 1.2.0, 28 Oct 2026)

All tests run headless in Chromium at 1920×1080 against the static files, with external hosts mocked or blocked. The suites ship in `tests/` (`tests/README.md`); `node tests/run-all.mjs` runs them all, and none calls a real API. On 28 October 2026, for 1.2.0, all twelve suites passed, with the checkouts of Vici and of Victor's website beside the repository, so `vici-files` and `page-icon` compared instead of skipping.

| Test | What it covers | Result |
|---|---|---|
| `tests/unit.mjs` | SSE parsing (LF/CRLF, any chunking), thinking signatures, incomplete tool input, mid-stream errors, 429, retries, abort, truncated streams, cost maths per model | Pass |
| Live agent vs scripted API mock: full run | Parallel tool calls, `pause_turn`, a 529 retry, two-source alert, rejection then approval as tool results, `max_tokens` cut-off retry (16k → 24k), draft approve/reject, report gate, every assistant turn echoed unchanged with signatures, cost meter equal to the usage maths to the cent | Pass, 0 protocol violations |
| Live: web search disabled | 400 → tool removed, prompt rebuilt, banner, Live scan disabled, early end → nudge → report | Pass |
| Live: open-data failure | PEGELONLINE 503 → `{error, fallback_hint}` as `is_error` tool result, console note, web-search fallback | Pass |
| Live: key rejected, scan with no findings | 401 → key forgotten; honest "no material disruption" end | Pass |
| Independent code review (separate agent, no prior context) | Protocol, races, integrity, key handling, numeric integrity | Seven findings (abort leaks, recorder branching, recorded state flicker, recorder rejecting valid runs, audit of merged turns, superseded impact, header timeout); all fixed (D23–D27) and covered by the tests above |
| Save run as simulation | Export from the mock live run, load, replay: watermark "recorded on 12 Oct 2026", recorded sources, engine-recomputed figures, recorded path plays to the end, another option ends gracefully, audit `sim_source: recorded` | Pass |
| Live: quick second decision | Reject A, approve B while the model still answers: the agent receives both decisions in order; the recording keeps "Option A rejected…" as the rejection line and starts the B path with the approval; a booking without the mock line gets it; an underscore-styled live footer is replaced | Pass |
| Live: Abort during a model call | No console entry and no late text after "Aborted" | Pass |
| All six simulations | Different decision paths (reject then approve, approve directly, accept the risk, reject all three), drafts approved and rejected, no unresolved placeholders, no network beyond map tiles, KPI and map payoff, audit `mode: simulation` | 6 of 6 pass |
| Static checks | `node tools/check_world.mjs`: world, scenarios, reference cases and the six scripts | 32 of 32 pass; negative tests catch typos, missing paths, missing footers, live-run claims, single-source alerts, unknown tools and reports before the outbox |
| Layout (`tests/layout.mjs`) | 1920×1080, 1600×900, 1536×864, 1366×768, 1280×720: no horizontal overflow, header badges never overlap the KPI tiles, header height unchanged, control bar on one row; every visible interactive element ≥ 40 px, including the intro window | Pass |
| Intro window (`tests/smoke.mjs intro`) | Opens by itself on the first visit (174 words, fits the screen, Start agent focused); stays closed after a reload; **How it works** reopens it; its Start agent opens the mode choice; during a run it offers Close only and the run carries on | Pass |
| First real live run (presenter's key, 12 Oct 2026 19:39 UTC) | Scenario 4 (Styria) on Sonnet 5.5: 12 data and engine tool calls before the decision (5 ERP, 2 open data, 2 web-search steps, 3 impact runs), 2 visible "Check:" steps, honest what-if path because no source confirmed the flood, 3 drafts, €0.20. Saved as a simulation and replayed: 0 validation errors | Pass; reasoning flaws fed into D28–D29 |
| M6 key lifecycle (`tests/accept.mjs key`) | No key at load; Start opens the mode dialog first, Live then the masked key dialog with the spend-limit advice; key in session storage only, absent from a new tab, the DOM, local storage, 124 console lines and the audit export; it travels only in the `x-api-key` header of `GET /v1/models` and `POST /v1/messages` to api.anthropic.com; Change or forget key clears it and Live asks again; Key and privacy row passes with and without a key | Pass |
| M6 Diagnostics → agent (`tests/accept.mjs diag`) | PEGELONLINE blocked at network level: Diagnostics flags it (Fail), the other three open-data APIs pass; in the following live Rhine run `geo_rhine_level` makes no request, returns "failed the Diagnostics check … skipped" with the web-search hint, the console announces the fallback and the agent verifies through web search | Pass |
| M6 Abort and Reset matrix (`tests/accept.mjs abort`) | Simulation: Abort while scanning (then Start again directly), Abort at the option decision, Reset while drafts wait, Reset after Done. Live: Abort at the option decision, Abort while drafts wait, Reset during a model call in flight, then a normal run. Every path: nothing appears after Abort, no further model call, Reset gives an empty Idle workspace, the next run completes | Pass (7 paths) |
| M6 Simulation offline (`tests/accept.mjs offline`) | Every external host blocked, including both CDNs and the tile servers: Leaflet loads from `vendor/`, the offline coastline map shows, the Rhine replay runs to Done with a rejection, an approval and a rejected draft; SIMULATION badge and watermark visible at start, options, outbox and Done | Pass |
| Design system 1.1.0 (13 Oct 2026, tools/palette.mjs --check, removed in 1.2.0) | 32 WCAG 2.2 contrast pairings (body text 15.9:1, white on burgundy 10.1:1, every state stroke ≥ 3.3:1), burgundy vs danger (21.9°, ΔL 0.14), 9 colour-blind pairs (lowest 0.104, at risk vs resolved under protanopia), token files current | 45 of 45 pass |
| Design in the app (`tests/design.mjs`) | Map strokes and legend equal the state tokens; pill "Awaiting your decision" → "Awaiting your approval" → "Done", rail "Your decision" → "Your approval" → all done; console phase lines match; AI labels on the options, every draft and the summary open and close with Escape; review screenshots under projector washout and simulated protanopia, deuteranopia and tritanopia inspected by eye | Pass |
| Vici 1.2.0 colour system (28 Oct 2026, `tests/tokens.mjs`) | Vici's values (`vici/dist/tokens.json`) in the light and the dark theme: 71 text-on-fill and mark-on-surface pairs in each (51 of the shared shell's, 20 of the map's: the network on land and on the sea, the states, the marks inside the hexagons, the plants, the place names, the legend's toggles, the popovers' cover figures, the comparison bars); the 71 Vici tokens the app's CSS and JavaScript name all exist; the separation of the state colours, the network, checking, the comparison bars, the map's fills and merlot against danger under protanopia, deuteranopia and tritanopia, reported against the former palette's thresholds | 154 of 154 pass; 33 gaps reported for Vici (D48) |
| Page icon (`tests/page-icon.mjs`) | `favicon.svg` byte for byte, the header's and the loading screen's cells, the former logo gone; with the website's checkout beside the repository, its card's icon (`globe-hex`) and kind (prototype) | 9 of 9 pass |
| Vici's copy (`tests/vici-files.mjs`) | `vici/` holds exactly what its README lists, with release, licence and the fonts the stylesheet loads; with Vici's checkout at v1.0.0 beside the repository, every file byte for byte | 7 of 7 pass |
| Smoke 1.2.0 (`tests/smoke.mjs`) | A full Simulation run, the key check and an early end, Diagnostics and a custom what-if, the intro window, CDNs down, no Leaflet, `file://` and a missing data file, plus Vici's byline (markup, LinkedIn's logo and the website as 44 px links in a new tab, no link to the source code) and every control doing its job exactly once (the theme toggle with the map's lines in each theme's network colour, *Larger text*, the legend's fold and a layer toggle, the zoom buttons at half a zoom level per click, the replay speed, a drawer tab, a dialog's backdrop and Escape, the tooltips, *Show key*) | 10 of 10 pass |
| Design in the app, both themes (`tests/design.mjs`) | In the light and the dark theme: the map's corridors, cells and legend equal the state tokens of the theme on screen; status tag, console and rail name the human step; AI labels open and close; projector-washout and colour-blind captures in both themes, inspected by eye | 4 of 4 pass |
| Hexagon rule (`tests/hexagon.mjs`) | Nothing round: the scan of the app's 62 files after catching 25 of 25 planted examples, the page check after catching 10 of 10, and the rendered app at 15 states (intro, idle map, a supplier's and a plant's details, global view, Diagnostics, mode and key dialogs, the first entity marked, decision, drafts, finished, audit, drawer hidden, summary) in both themes | Pass, no exceptions |
| The rest of 1.2.0 | world 32 of 32, unit 10 of 10, sims 6 of 6, live 7 of 7, accept 4 of 4, layout 6 of 6: the same checks as before the change of look; the browser suites' selectors follow Vici's markup | Pass |

## 11. Acceptance checklist (Milestone 6)

Each item of the kickoff's checklist, how it was tested, and the evidence. "Mock" means the live agent ran against a scripted stand-in for the Anthropic API that checks every request against the protocol rules in §3; the real-key runs were made by the presenter.

| # | Requirement | How it was verified | Result |
|---|---|---|---|
| 1 | Loads with no key; Start opens the mode dialog; Live then asks for the key; the key is gone after the tab closes and never appears in logs or the audit export | `tests/accept.mjs key` (see §10): session storage only, new tab has no key, not in DOM, console, local storage, audit export or recorded script; only in the `x-api-key` header to api.anthropic.com. The Diagnostics "Key and privacy" row repeats the checks in the presenter's browser | Pass |
| 2 | A full run of each scenario takes under about 4 minutes on Sonnet, with ≥ 8 visible tool calls and ≥ 1 visible verification step | Simulation: all six scripts have 9–11 tool calls before the decision, hypothesis → second source → "Revised:" before the alert, and replay in about one minute at ×1 (`tools/check_world.mjs`, `tests/sims.mjs`). Live: the first real run had 12 tool calls before the decision and 2 visible checks; the run-facts line (D30) now reports agent time, tool calls and verification steps at the end of every run, so the four-minute target is confirmed in rehearsal per scenario | Pass for Simulation and for the tool-call and verification counts live; time to be read from the run-facts line in rehearsal |
| 3 | Options always show a € comparison including do-nothing; approving one produces outbox drafts; nothing is sent anywhere except api.anthropic.com and the listed open APIs | Every simulation and mock live run shows three options plus "Do nothing" with engine figures and the comparison bars; approval produces drafts that wait for approval. The page's CSP allows `fetch` to exactly five hosts (D12, D31); request logs in `tests/accept.mjs` show only api.anthropic.com, the open-data APIs, the Leaflet CDN and map tiles (static GETs) | Pass |
| 4 | A live scan with no findings ends honestly | Mock scan with quiet open data ends "Run complete: no material disruption found." with the monitoring report | Pass |
| 5 | The cost meter is within ±25% of the usage maths; Abort and Reset always recover to Idle | Mock full run: meter equals the price table × usage to 1e-9 (€0.2513). Real run: €0.20 shown, per-call usage in the audit export. Abort/Reset matrix: 7 paths in both modes (§10) | Pass |
| 6 | Diagnostics flags an unreachable API and the agent routes around it | `tests/accept.mjs diag`: blocked PEGELONLINE flagged; the live agent skips it without a request and verifies via web search. `tests/live.mjs geofail`: an HTTP 503 during a run gets the same fallback | Pass |
| 7 | Simulation runs every preset with no key and no network beyond map tiles; badge and watermark always visible; approval and rejection paths play; "Save run as simulation" exports a valid script | `tests/sims.mjs`: six presets, four decision patterns, no request beyond tiles. `tests/accept.mjs offline`: runs with every host blocked. Recorder: mock exports replay end to end (`tests/live.mjs full`, `race`), and the presenter's real recording validates with 0 errors | Pass |

**Not testable here.** Real model latency and real web-search results need a real key and are covered by the presenter's rehearsal; the run-facts line and the audit export give the numbers. Browser CORS of the four open-data APIs was not observable from the build environment (§4); Diagnostics tests it on the presentation laptop, and every failure falls back to web search.


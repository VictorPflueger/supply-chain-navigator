# TECH_NOTES — verified facts and build decisions

Navigator calls the Claude API and four open-data APIs directly from the browser. Every external detail the code depends on is recorded here with its source and the date it was verified. If a fact changes, update this file first, then `js/config.js`.

**Verification date:** 12 October 2026 (Milestone 0). Sources are official Anthropic documentation at `platform.claude.com/docs`, the open-data providers' own documentation, and live probes run from the build environment.

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
- Keys that span several workspaces also need `anthropic-workspace-id`. This is noted in the README troubleshooting section. The preflight echoes requested headers, so adding it is CORS-safe.
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

### Tool-use protocol rules enforced in `js/agent.js`

1. Every `tool_use` id in an assistant turn is answered by a `tool_result` in the very next user message.
2. `tool_result` blocks come **first** in that message. No text is added after results if a server tool is still unresolved.
3. Errors are returned as `{"type": "tool_result", "tool_use_id", "content": "…what went wrong and what to try next…", "is_error": true}`.
4. Stop reasons:

| `stop_reason` | Navigator's handling |
|---|---|
| `end_turn` | Run ends, or the agent waits for a human decision |
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
  - **Default basemap:** OpenStreetMap standard tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, desaturated with a CSS filter (`saturate(0.3) brightness(1.05) contrast(0.94)`) into a pale base for the light theme. Keyless; light interactive use is permitted with visible attribution and a valid Referer, both of which Navigator meets.
  - **Optional:** set `BASEMAP.cartoKey` in `js/config.js` to use CARTO Positron (`light_all`) raster tiles.
  - **Always present:** an offline land-mass layer (Natural Earth, public domain) bundled in `data/basemap_offline.js`. The map shows geography even with no tile access (Simulation-mode fallback).

## 6. Front-end libraries, fonts and browser security

| Asset | Version | Delivery | Notes |
|---|---|---|---|
| Leaflet | **1.9.4** (latest stable; 2.0 is still alpha on npm) | Loaded by `js/libs.js`: `https://unpkg.com/leaflet@1.9.4/dist/…`, then `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/…`, then the byte-identical copy in `vendor/leaflet-1.9.4/` (from the npm tarball, BSD-2-Clause licence included). 7 s timeout per source | Same SRI hashes on every source: `leaflet.js` `sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=`; `leaflet.css` `sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=` (computed from the npm tarball; identical to Leaflet's published values). Diagnostics shows which source was used |
| Web fonts | Barlow 400/500/600/700 and italic 400/600; Barlow Semi Condensed 500–800; IBM Plex Mono 400–600 (Fontsource 5.3.0 npm packages) | Self-hosted woff2 files in `fonts/`, latin and latin-ext subsets (latin-ext covers ő in Győr, č in Kidričevo), declared in `css/fonts.css` | SIL Open Font License 1.1; licence files in `fonts/`. No request goes to a third-party font service |

- No other runtime libraries. Markdown in the management summary is rendered by a small built-in, escape-first renderer (`js/md.js`); no `marked`/DOMPurify dependency.
- ES modules need an `http(s)` origin. Browsers never run them from `file://`, so `index.html` carries a static boot screen that explains how to start a local server; `js/main.js` removes it once the workspace runs. Missing data or program files are reported on the same screen.

### Content Security Policy (meta tag in `index.html`)

The browser itself enforces where the page may connect, which turns the key-handling promise into a technical guarantee.

| Directive | Allows | Why |
|---|---|---|
| `connect-src` | `api.anthropic.com`, `api.open-meteo.com`, `earthquake.usgs.gov`, `eonet.gsfc.nasa.gov`, `www.pegelonline.wsv.de` | The only `fetch` targets. No other host can receive the API key or any data |
| `script-src` | `'self'`, `unpkg.com`, `cdn.jsdelivr.net` | App modules, data files, Leaflet. No inline scripts, no `eval` |
| `style-src` | `'self'`, `unpkg.com`, `cdn.jsdelivr.net` | Stylesheets only; dynamic styles go through the CSSOM, so no `'unsafe-inline'` |
| `img-src` | `'self'`, `data:`, `tile.openstreetmap.org`, `basemaps.cartocdn.com` (+ subdomains), the two CDNs | Map tiles. Leaflet uses a `data:` GIF for cancelled tiles |
| `font-src` | `'self'` | Self-hosted fonts |
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

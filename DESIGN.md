# Navigator — design system

How Navigator looks, why it looks that way, and how to change it without breaking it. Version 1.2.0, 28 October 2026.

Navigator is built on **Vici**, Victor Pflüger's design system (release v1.0.0, copied unchanged into `vici/`; `vici/README.md` says which files and from where). Vici decides the look: its tokens in a light and a dark theme, its fonts, components, icons and hexagon shapes. This prototype's rules decide the meaning: what a colour stands for, what needs emphasis, what the room must see. Where the two meet, this file says how, and §10 lists every deliberate deviation from Vici with its reason.

Navigator shares its shell with its sister prototypes, **Rebate Hunter** (missed supplier rebates), the **Timetable Translator** and **Repack Pilot**: the same Vici copy, the same shell code and styles, the same colour grammar and agentic patterns. Rebate Hunter was the first to move onto Vici; Navigator's shell is Rebate Hunter's at commit `73c00f8`, with Navigator's names in its comments. Where Rebate Hunter shows a rebate board, Navigator shows its **map**, built from the same canvas, floating controls, legend card, popovers and grammar (§3). §9 lists the shared shell file by file.

---

## 1. The brief

- **On Vici.** The prototype looks like the rest of Victor's work: merlot ink and pastel surfaces, Bricolage Grotesque, Inter and JetBrains Mono, hexagons where other systems draw circles. Its page icon is the card it has on Victor's website (§4).
- **Legible in 60 seconds.** A partner who has never seen the tool should get the point from across a room, on a 1080p projector, often in a lit room: *we know in minutes which factory will stop, what it costs, and the cheapest way to keep it running.*
- **Agentic.** An AI agent acts on screen. At every moment the viewer must be able to tell who is acting: the agent, or the person who has to decide.

Everything below follows from those three lines.

## 2. Methods, and what each one decided

| Method | Source | What it decided |
|---|---|---|
| A design system with semantic tokens | Vici v1.0.0 (`vici/`) | Every colour is one of Vici's semantic tokens (`--vc-text`, `--vc-accent`, `--vc-danger-solid` …), which switch with the theme; no colour values of the app's own (§4) |
| The hexagon rule | Vici, *Hexagon* guideline: "If it would be round, make it a hexagon" | The map's suppliers, hubs, alternatives and corridor badges, pips, badges, spinners, pulses and pills are flat-top hexagons and hex capsules (§4); each map cell keeps the area of the circle it replaces; `tests/hexagon.mjs` keeps it so |
| Colour-blind separation | Machado, Oliveira & Fernandes (2009) | The state colours are measured under simulated colour blindness (`tests/tokens.mjs`); where Vici's tones come close, form carries the difference (§3, §5) |
| Accessibility | WCAG 2.2 | Contrast for every pairing in both themes, the focus ring, target size, no meaning by colour alone |
| Agentic UX patterns | Yocco, *Designing For Agentic AI*, Smashing Magazine, Feb 2026 | The progress rail (intent preview), the handover to the human, the audit trail |
| AI labelling | IBM Carbon for AI; Pickering, *Tooltips & Toggletips* | An **AI** label (Vici's feature tag, the sparkle and "AI") on the options, drafts and summary the agent wrote, with a short explanation one click away |
| Emphasis | Google, *Expressive Design: Google's UX Research* (Material 3 Expressive) | One emphasised action per moment: colour, size and containment go to the step that needs the person |
| Projection | VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations* | Pastels never carry meaning alone; every pastel fill has a deeper stroke or text step. Layouts are reviewed under a simulated washout |
| Dashboard patterns | Bach et al., *Dashboard Design Patterns* (2022) | Each KPI tile pairs one value (data information) with a line of context (meta information) |

## 3. Colour grammar

Four rules. Each colour means one thing, everywhere.

| Colour (Vici's tokens) | Means | Where you see it | Never used for |
|---|---|---|---|
| **Merlot** (`--vc-accent` and its tokens) | **The human in charge** | Primary buttons; every Approve; the progress step that waits for you (*Your decision*, *Your approval*); the recommended option's frame (2 px of `--vc-accent` on `--vc-accent-soft`); the recommendation the agent hands to you and your decisions in the console and the audit; the focus ring; the LIVE badge | A mark among state colours: merlot sits close to Vici's danger tone (§5). Not our plants either: they are ink |
| **Danger, warning, success** (`--vc-danger-*`, `--vc-warning-*`, `--vc-success-*`) | **The supply network and outcomes**: affected, at risk, resolved | On the map the suppliers, hubs, corridors, supply links and orders in transit, the plants' outlines and tags; KPI tiles, status tags, the comparison bars, *Confirmed* and *Not confirmed* in the console | Decoration, and buttons other than the two destructive ones |
| **Fjord** (`--vc-info-*`) | Checking, and money an option spends | *Check* steps in the console, links to sources, the response-cost bar; a supplier's *Directed buy* tag, blue before | |
| **Lilac** (`--vc-feature-*`) | **The AI's voice** | AI tags (`vc-tag--feature` with the sparkle and "AI"), *Hypothesis* and *Revised* lines, what-if alerts (`vc-alert--feature`), the reasoning summaries, the streaming cursor, model calls in the audit, the AI disclosure | Anything a person decided |
| **Ink** (`--vc-text`, Vici's neutrals) | Everything else: the agent's work; the network at rest (`--vc-neutral-solid`); Nordwerk's own plants | Text, tool calls, separators, neutral controls, Reject; the map's corridors, supply links, hubs and suppliers at rest; the plants (a factory in ink, a `--vc-border-strong` outline) | |
| **The tape** (`--vc-text` and `--vc-surface` stripes) | **Simulation** | The SIMULATION badge, the tape and the watermark, always with the word SIMULATION. Outside every state colour (Vici's honey now means *at risk*), so a replay can never pass for a live run | |

On stage, in one sentence: *"Merlot is you, lilac is the AI, red, honey and green are the supply chain."*

**Every state has a form of its own** (WCAG 1.4.1), because Vici's state tones are close in lightness and some come close under colour blindness (§5): a word (*Affected*, *At risk*, *Resolved* in the popovers and beside a plant's name); Vici's state icons (error, warning, success) in a plant's state tag; the mark inside each hexagon on the map (a cross where it is affected, a bar and dot where it is at risk, a tick where it is resolved); a larger cell with a halo; a corridor's heavier line, with a hexagon carrying the same mark at its middle. The danger tone appears on two buttons only, **Abort** and **Forget key**, as an outline, because they stop or delete something.

**The map in this grammar.** The map is the prototype's centrepiece, and everything on it speaks the same colours.
- *The ground.* A quiet basemap so the network and its states carry the story: OpenStreetMap's tiles, desaturated in the light theme and darkened in the dark one by a CSS filter; with a CARTO key, CARTO's Positron and Dark Matter from the same host; and, always underneath, the offline coastline map drawn in the theme's tokens (land `--vc-surface`, coasts `--vc-border`, borders `--vc-border-subtle`, sea `--vc-bg-sunken`, which is also the map's colour before its tiles arrive).
- *The network at rest is ink.* Corridors are lines in `--vc-neutral-solid` with a pattern per transport mode (sea and air dotted, barge and ferry dashed, rail dash-dotted, road solid), square caps and mitred joins. Supply links are thin neutral lines. Hubs, ports and chokepoints are small hexagon cells, the labelled ones named in muted text with a halo of the surface. Suppliers are hexagon cells with a neutral outline, filled by tier, the stronger the closer they are to our plants (tier 1 `--vc-border-strong`, tier 2 `--vc-border`, tier 3 the surface). A qualified alternative not in use is a dashed hexagon, shown when the legend asks for it.
- *Our plants are ink.* Leipzig and Győr are client entities: a 42 px hexagon with a factory in ink, a `--vc-border-strong` outline and the plant's name in Bricolage beside it. A plant's state shows as its outline in the state's tone with a soft halo and as Vici's tag beside the name, with the state's icon and word. Never merlot: merlot belongs to the person deciding.
- *States.* A supplier, hub or alternative in a state takes the state's fill (`--vc-danger-border` and so on) and outline (`--vc-danger-solid`, `--vc-success-solid`; warning uses `--vc-warning-text`, its solid being too pale for a stroke), grows a little, gets a halo and the state's mark, and comes to the front; its supply links take the tone and a heavier line. A corridor in a state turns to the tone with a heavier line and a soft glow, carries a hexagon with the state's mark at its middle, and its orders in transit (small container blocks) take the tone too. An alternative route that an option uses appears dashed in the success tone. A newly affected cell or corridor flashes once.
- *Details.* A click on any cell, plant, corridor or order opens its details in Vici's popover look (the raised surface, a quiet border, the large shadow), closed by Vici's icon button: tags in the tones the chips had (*Single source* in honey, *Directed buy* in fjord), Vici's compact table for a plant's cover and a corridor's legs, cover below what the line needs in danger text and running low in honey. Hovering shows a name in Vici's tooltip look.
- *Legend and tools.* The legend is a card with the map's own cells and lines as swatches, and three toggles (*Supply links*, *Orders in transit*, *Qualified alternatives*) drawn as hex capsules with ink ticks. *Europe network* and *Global view* are Vici's compact outline buttons floating with a shadow; the zoom buttons are Vici's icon buttons with their tooltips, filled with the surface and edged with a hairline in `--vc-border-strong`, so they hold their shape on the dark map too; the notice that tiles are unavailable is Vici's neutral alert.

A selection on the map is always ink: the legend's ticked toggles, the pressed replay speed in the control bar.

**Why a map.** For a supply-chain disruption, place is the question: which sites sit in the affected region, which routes run through it, which plant they feed. The map puts exactly those on screen, so the finding reads from across the room: *this corridor is cut, these suppliers are behind it, this plant runs out first.*

## 4. Where the look comes from

**Colours.** Every colour is one of Vici's semantic tokens, which switch with the theme. The app has no colour values of its own; the favicon is the one exception, because a favicon cannot read CSS. Vici's family primitives (`--vc-lilac-100` and so on) appear only where Vici uses them itself (the page icon's lilac cell). The map's elements take their colours from classes in `css/map.css`; what Leaflet draws as lines (the corridors, the supply links, the offline coastline map) reads the same tokens from the page in `js/map.js`, without fallbacks, and reads them again on Vici's `vc:themechange` event, so a theme change repaints the whole map. The roles of the former palette map onto Vici like this:

| Former role | Vici's token |
|---|---|
| `--paper` | `--vc-surface` |
| `--porcelain`, `--porcelain-2` | `--vc-bg`; `--vc-bg-subtle` for tracks, `--vc-surface-hover` for hover |
| `--line`, `--line-strong`, `--border-control` | `--vc-border-subtle`, `--vc-border`, `--vc-border-strong` |
| `--text`, `--text-muted`, `--text-faint` | `--vc-text`, `--vc-text-muted`, `--vc-text-subtle` |
| `--on-brand`, `--brand`, `--brand-deep` | `--vc-on-accent`; `--vc-accent`, `--vc-accent-hover`, `--vc-accent-pressed` |
| `--brand-text`, `--brand-mid`, `--brand-line` | `--vc-accent-text` (merlot text and icons, never among state colours); `--vc-accent-soft-hover` for quiet lines |
| `--brand-soft`, `--brand-wash` | `--vc-accent-soft` (`--vc-surface-selected` for a selected item in a list or menu), `--vc-surface-hover` |
| danger, warning, success, info (fill, mid, line, text) | `--vc-danger-bg`, `-border`, `-solid`, `-text` and the same for success and info; warning uses `--vc-warning-text` for lines too (its solid is a light fill, too pale for a stroke) |
| violet | lilac, Vici's feature tone: `--vc-feature-bg`, `-border`, `-solid`, `-text` |
| `--affected`, `--at-risk`, `--resolved` and their fills | the line and mid tokens of danger, warning and success: `--vc-danger-solid` and `--vc-danger-border`, `--vc-warning-text` and `--vc-warning-border`, `--vc-success-solid` and `--vc-success-border` |
| `--network` and the slate of the map's network | `--vc-neutral-solid` |
| the suppliers' slate tiers | `--vc-border-strong`, `--vc-border` and `--vc-surface` |
| the former burgundy of our plants and their supply links | ink: a factory in `--vc-text`, an outline in `--vc-border-strong`; the supply links in `--vc-neutral-solid` |
| `--live` | `--vc-accent` |
| the former hazard yellow and black of the simulation | the neutral tape: `--vc-text` and `--vc-surface`, with `--vc-bg-subtle` as its wash |
| `--sea` (the map's ground) | `--vc-bg-sunken`; the offline map's land `--vc-surface` |
| `--r-sm`, `--r-md`, `--r-lg` | `--vc-radius-md`, `--vc-radius-lg`, `--vc-radius-xl` |
| `--shadow-pop`, `--shadow-soft` | `--vc-shadow-lg`, `--vc-shadow-md` |
| `--focus` | Vici's focus ring, `var(--vc-stroke-focus) solid var(--vc-focus)`, hexagonal on hexagon controls |

The app keeps a handful of tokens of its own in `css/style.css`: the type sizes Vici has no step for (`--fs-xs`, `--fs-lg`, `--fs-xl`, `--fs-kpi`; `--fs-sm` and `--fs-md` became Vici's `--vc-font-size-sm` and `--vc-font-size-md`), because the layout and the projector checks are tuned to them, and `--hit`, 44 px, the smallest target for what the room clicks.

**Themes.** Light is the default: the prototypes are mostly shown on projectors in lit rooms. `js/theme.js` sets `data-theme="dark"` only if the visitor chose dark with the header's toggle (Vici's toggle, moon and sun, tooltip *Dark theme*), `data-theme="light"` otherwise; Vici remembers the choice under `vc-theme`, the key all of Victor's pages share. The map follows: its lines are drawn again in the new theme's tokens, the cells follow through their classes, OpenStreetMap's tiles take the dark filter, CARTO's tiles switch to Dark Matter, and the offline coastline map takes the dark surface. Every contrast check runs in both themes (§5).

**Type.** Bricolage Grotesque (`--vc-font-display`) only for short display text: the app's name, the KPI figures, dialog and panel titles, the plants' names on the map, the popovers' titles. Inter (`--vc-font-text`) for all other text, with tabular figures wherever numbers line up. JetBrains Mono (`--vc-font-mono`) for ids, timestamps, codes, tool names and raw output. Sentence case for headings, buttons, tabs and labels, except names, codes and the mode markings (§10). Reading text runs at most 75 characters per line: console entries, dialog texts, the summary and the drafts take Vici's prose measure (`--vc-container-prose`, 50ch, about 65 characters of Inter), while tool calls and their raw results keep the console's width. The root size follows the projector, in relative units so it still follows the reader's browser setting: `clamp(93.75%, 0.48vw + 50%, 112.5%)`, 15 px at 1280 px wide and about 17 px at 1920 px.

**Shapes.** Anything round is a flat-top hexagon, anything pill-shaped a hex capsule with pointed ends (Vici's `--vc-hex`, `vc-hex`, `vc-capsule`, `vc-cell`): status and live pips, count badges, the status, mode and AI-disclosure tags, the byline's portrait, spinners and pulses, the intro's numbered steps, the rail's markers, the option letters, the menu's scenario numbers, the zoom buttons; on the map the suppliers, hubs, ports and chokepoints, the qualified alternatives, the corridors' state badges, the plants' cells, the legend's swatches and toggles. The map's cells are drawn in SVG (`hexCell` in `js/map_cells.js`), so their outlines can be dashed and carry the state's mark; each keeps the area of the circle it replaces (its height is 1.9046 times the former radius), so the network keeps its density. Lines have square caps and mitred joins, so the sea's dots are square. Rectangles keep small radii, up to `--vc-radius-xl`; the orders in transit are small container blocks. Other brands' logos stay as their owners publish them (LinkedIn's in the byline). In forced colours (Windows contrast themes) the app's own hexagons keep a visible outline, as Vici's cells do.

**Icons.** Vici's icons (`<span class="vc-icon vc-icon--NAME">`), through `js/icons.js`, which maps the app's names to Vici's (`reset` → `refresh`, `gear` → `settings`, `globe` → `globe-hex`, `target` → `pin` …). Nine things have no Vici icon yet; the app draws them in Vici's style in the same module (24 × 24 with 2 px to spare, 1.75 px strokes with round caps and joins, hexagons where a shape would be round, chamfered corners) and proposes them for Vici (§11). They are written the way Vici writes its own icons, as masks (black strokes on the grid, which only say where the icon is), so they too take the colour of the text around them. Icon-only buttons have Vici's tooltip with their name.

**The page icon.** The prototype's mark is the card it has on Victor's website (`VIP/data/prototypes.js`, in the repository VictorPflueger/VIP: icon `globe-hex`, kind *prototype*): Vici's globe-hex icon in a lilac hexagon cell, in the header (`vc-cell vc-cell--lilac`), on the loading screen (`vc-cell--xl`) and, drawn larger and bolder so it reads at 16 px, as `favicon.svg`. If the website's card changes, the page icon changes with it, and the other way round (`tests/page-icon.mjs`).

**The byline.** The drawer bar carries Vici's byline: *Built by*, Victor's hexagon portrait and name, LinkedIn's own logo and a globe for his website, each a 44 px link that opens in a new tab. The app links to its author, never to its own source code.

## 5. The checks

`node tests/tokens.mjs` checks the colour system on Vici's values (`vici/dist/tokens.json`) in the light and the dark theme. It is the first suite in `node tests/run-all.mjs`.

**Contrast (WCAG 2.2).** Every text-on-fill and mark-on-surface pairing the app uses, the shared shell's and the map's (`tests/lib/prototype.mjs`: the network on land and on the sea, the states, the marks inside the hexagons, the plants' outlines, factory and names, the place names, the popovers' cover figures, the comparison bars), in both themes: 4.5:1 for text (1.4.3), 3:1 for marks, icons, control borders and the focus ring (1.4.11). The test fails below that. It also fails when the app's CSS or JavaScript names a Vici token that does not exist, or when a pairing names a token one theme lacks.

**Colour-blind separation.** The state colours, the network, checking, the comparison bars, the map's fills and merlot against danger, simulated for normal vision, protanopia, deuteranopia and tritanopia with the Machado et al. (2009) matrices at full severity in linear RGB. The former palette was generated to keep every pair at least 0.10 apart in OKLab; Vici's tones fall short of that in places, for example danger and success (0.030 in the light theme, 0.020 in the dark one), the map's affected and resolved fills (0.020, 0.030), a resolved line and the network at rest (0.063, 0.018), and merlot text and danger (a hue gap of 16.7° and a lightness gap of 0.03, where the former palette kept 18° and 0.12). The test reports these gaps rather than failing on them, because they are Vici's to fix: the app makes up for each in form (§3), and the colour-blind captures of `tests/design.mjs` show it.

## 6. Agentic patterns

Yocco's six patterns for agentic AI, and where each one lives:

| Pattern | In Navigator |
|---|---|
| Intent preview | The **progress rail** shows the agent's five-step plan before the run starts (Spot, Check, Calculate, Propose, Prepare), and the intro window explains it |
| Autonomy dial | Fixed at one level on purpose: *plan and propose, you approve*. Every outbound action (supplier email, mock freight booking, production re-plan) is a draft that needs its own approval |
| Explainable rationale | The recommendation line, *Confirmed:* and *Revised: old → new* with their evidence, the reasoning summaries, and the AI label's explanation |
| Confidence signal | Alerts are *verified* (two independent sources, enforced in code) or labelled *what-if*; *Not confirmed* lines in honey |
| Action audit and undo | The Audit tab and its JSON export. Undo is not needed: nothing leaves the outbox |
| Escalation pathway | The agent hands over at each decision (the rail turns merlot), continues as a labelled what-if when it cannot confirm, and ends as **Stopped** rather than guess |

**Progress rail** (`js/progress.js`, on Vici's stepper). Five steps, the same as the intro, in one line above the console. Ink while the agent works, with a pulsing hexagon on the current step. Merlot with *Your decision* or *Your approval* when the run waits for a person. A tick in ink when done, a stop mark where a run ended early, a dashed hexagon for steps a run did not need. It never moves backwards when the agent revisits an earlier phase. It is an ordered list, the current step carries `aria-current="step"`, and each step's state is spelled out for screen readers. A container query hides the labels of other steps when the console is narrow.

**Handover** (`js/handover.js`). The run state *awaiting approval* covers two moments, so the status tag, the console's phase line and the rail all name the human step the same way: **Awaiting your decision** while the options wait, then **Awaiting your approval** while the drafts wait.

**AI labels** (`js/ai_label.js`). After Carbon for AI: Vici's feature tag (lilac, the sparkle, **AI**) at the upper right of the options summary, each draft and the management summary. Clicking it opens a toggletip in Vici's popover look that stays open until you click elsewhere or press Escape. It says who wrote the content (the live model by name, a recorded run, or the scripted replay), that every euro figure and date comes from the deterministic impact engine, and what approval does. The label is 24 px, inside a 40 × 40 px target.

## 7. Built for the room

- **Projection.** Muted colours blend on a projector (VUMC). Pastels therefore only ever fill; the meaning sits in a deeper stroke or text step at 3:1 or more. The options view is reviewed under a simulated washout (`contrast(0.62) brightness(1.18) saturate(0.8)`).
- **Emphasis.** Google's research on Material 3 Expressive (46 studies, more than 18,000 participants) found that people spotted key elements up to four times faster when colour, size, shape and containment pointed at them, and that breaking familiar patterns hurt. Navigator spends emphasis on one thing per moment: the recommended option has the merlot frame, its tag on the frame and the only solid Approve; the other options have soft or outline buttons; the rail highlights one step; on the map only what the run marked carries colour.
- **Size.** The root font scales to about 17 px at 1920 px wide; **Larger text** enlarges the console. Vici's buttons, tabs, tags, menu items and fields keep the sizes the app had before Vici, except for three badges the shared shell still has to fix (§10). Every HTML control is at least 40 × 40 px, well above the 24 px minimum of WCAG 2.5.8 (`tests/layout.mjs`); the zoom buttons are 44 px hexagons. On the map, the plants are markers you can reach by keyboard, with Vici's ring around their hexagon. The cells of suppliers, hubs, alternatives and orders are no tab stops (`keyboard: false`): their details open on a click, and the run speaks about them in the console and the drawer. Before 1.2.0 the circles in their place were tab stops in Chrome and Edge, though not by design: Leaflet 1.9 puts a tooltip's focus listeners on its layer, and Blink makes an SVG shape with focus listeners focusable. For the same reason a corridor's lines still are, in those browsers.
- **Nothing covers the finding.** While the presenter has not chosen otherwise, the legend folds away when the map gets short (the drawer open); the map re-applies the last view the app asked for when the drawer resizes it, until the presenter pans or zooms; the notice that tiles are unavailable sits compact in the top left corner, clear of the map's tools; a corridor's state badge sits above the orders in transit, below the suppliers and hubs.
- **Focus.** Vici's focus ring: 2 px of `--vc-focus` with a 2 px gap, an outline on rectangles and a hexagonal ring on hexagon controls (the plants, the legend's toggles, icon buttons). Controls with a shadow of their own keep the ring next to it.
- **Motion.** One pulsing hexagon on the active rail step, the streaming cursor, a short flash on a newly affected cell or corridor, and the map flying to the region the agent looks at. All of it stops under `prefers-reduced-motion`: nothing flashes, and the map moves to its new view at once.
- **Words.** Labels name what a person understands: *Your decision*, *Approve*, *Accept the risk*, *Forget key*. The same action keeps the same name through the flow. KPI tiles say what and when in a few words: *Value at risk €19.1M, 30-day exposure, verified* (it said *after verification*, which Inter, wider than the former font, cut at 1920 px; a shorter second line is the first way to keep the tiles whole, smaller figures the second); *First line stop in 9 days, Leipzig, Fri 6 Nov*; after a decision *left with option B (was €19.1M)*. The header keeps two badge rows down to 1280 px (`tests/layout.mjs`): Inter and Bricolage run wider than the former fonts, so "How it works" sits beside the mode badge, the tiles' second lines wrap at most once below 1700 px, and from 1700 px down the figures step to 1.875rem. The AI disclosure keeps its full sentence, "You are interacting with an AI system", at 1280 px and wider.

## 8. Testing the design

| Command | What it does |
|---|---|
| `node tests/tokens.mjs` | Contrast for every pairing in both themes, every Vici token the app names exists, colour-blind separation reported (Node.js only) |
| `node tests/hexagon.mjs` | The hexagon rule, modelled on Vici's `scripts/check-hex.mjs`: the app's own files (not `vici/`, `vendor/`, `tests/` or `tools/`) must hold no round CSS (a radius of 25 %, 40 px or 2.5 rem or more, viewport units in a radius, `circle()` or `ellipse()` in a clip path, radial gradients) and no round drawing code (`<circle>`, `<ellipse>`, a pill-shaped `<rect>`, "circle" or "ellipse" handed to an element factory, Leaflet circles, canvas arcs, path data with arc commands); the rendered app, at the main states of a simulation run, the map's details and views and the dialogs on the way, in both themes, must hold no element whose corners are at least half its size, no circle or ellipse, no arc. Planted examples of each kind come first, and the test fails if it misses one. An exception needs its reason, written in the test |
| `node tests/page-icon.mjs` | `favicon.svg` byte for byte; the header's and the loading screen's cells; and, when a checkout of Victor's website sits next to this repository, that its card still gives this prototype the same icon and kind |
| `node tests/vici-files.mjs` | `vici/` holds exactly the files `vici/README.md` lists, everything Vici's stylesheet loads is there, and (with a checkout of Vici at the same release next to this repository) every file is unchanged |
| `node tests/layout.mjs` | Five viewports from 1920×1080 to 1280×720; no overflow; badges never overlap the KPI tiles; the header keeps its height; one-row control bar; targets ≥ 40 px |
| `node tests/design.mjs` | In the running app, in the light and the dark theme: the map's corridors, its cells and the legend use the state tokens of the theme on screen; tag, console and rail name the human step; AI labels open and close. Writes review screenshots in both themes: the options normally and under the washout, and the finished run as seen with protanopia, deuteranopia and tritanopia |
| `node tests/smoke.mjs once` | Every control does its job exactly once: the theme toggle (and the map following it) and the tooltips (vici.js's), *Larger text*, the map's legend and a layer toggle, the zoom buttons, the replay speed, a drawer tab, a dialog's backdrop and Escape, *Show key* (the app's). A toggle that both sides flipped would look unchanged, which a plain click test misses |

The browser suites need Playwright (`tests/README.md`). The colour-blind screenshots use the same matrices as the colour test, applied by an SVG colour-matrix filter in linear RGB.

## 9. Changing things safely

**Keep the sister apps in step.** Navigator, Rebate Hunter, the Timetable Translator and Repack Pilot share one shell: `vici/` (the same Vici release, unchanged); `css/` except `map.css` (`css/style.css`, `css/components.css`, `css/console.css`, `css/drawer.css`, `css/modals.css`; each prototype's centrepiece has its own stylesheet); `js/theme.js` and the shell modules `js/dom.js`, `js/md.js`, `js/modal.js`, `js/progress.js` and `js/drawer.js`; and four tests that are the same file in every prototype: `tests/tokens.mjs`, `tests/hexagon.mjs`, `tests/page-icon.mjs` and `tests/vici-files.mjs`. What differs between the prototypes in those tests (the colour pairs only one prototype draws, the tour the hexagon test takes, the page icon) lives in one place, `tests/lib/prototype.mjs`, and the shared tests use only what every prototype's `tests/lib/harness.mjs` exports. The shell's comments name the prototype they sit in; its code is the same everywhere. Change a shared file in all four repositories in the same way, or the prototypes drift apart.

**Colours come from Vici.** There is no palette to regenerate any more. To use a colour, pick the semantic token whose meaning fits (§3, §4), never a family primitive or a value of your own, and add the pairing to the contrast test: to `SHELL_PAIRS` in `tests/tokens.mjs` for the shared shell, to `COLOUR_PAIRS` in `tests/lib/prototype.mjs` for the map. To change a colour, change Vici: a fix belongs in Vici's next release, which then comes here as described in `vici/README.md` (copy the files, change the version, run the tests, look at the prototype in light and dark). Never edit the copy in `vici/`. `favicon.svg` is the one file with colour values of its own: change it together with the website's card.

**Keep the grammar.**
- Merlot only for what a person does or decides, and never as a mark among state colours. Nordwerk's own plants are ink, by form and words.
- State colours only for the network and outcomes, and always with a word, an icon, a mark or a shape.
- Lilac only for what the AI wrote or thinks. New AI-written content gets an AI label.
- No colour values in components: use a token. Anything round is a hexagon; anything pill-shaped a hex capsule. A new map marker is a cell from `js/map_cells.js` with the area of the circle it would have been.
- New interactive elements are at least 40 × 40 px and use Vici's focus ring, hexagonal on a hexagon.

## 10. Deviations from Vici

Each one deliberate, with its reason. The first group comes with the shared shell, as in Rebate Hunter; the second is Navigator's own, on the map.

| Where | Vici | Navigator | Why |
|---|---|---|---|
| Buttons, icon buttons, inputs, menu items, tabs | 2.5 rem controls with .875 rem text (37.5 px at a 15 px root); tabs .875 rem; menu items 2.25 rem | 44 px with 1 rem text; compact buttons 40 px with .875 rem; tabs and menu items 44 px with 1 rem | The room reads the screen from a distance, and nothing clickable is under 40 px (WCAG 2.5.8, projector use) |
| Tags and count badges | 1.5 rem with .75 rem text; badges 1.25 rem | Tags 26 px with .8125 rem; badges 24 px. The shell means the status tag to be 44 px with 1 rem text and the mode badge and the AI disclosure 36 px, the sizes they had before Vici, but its `.vc-tag` rule in `css/components.css` loads after `css/style.css` and keeps them at 26 px with .8125 rem, in Rebate Hunter too: a fix for the shared shell | Today's sizes: the state words must read from the back of the room |
| Profile links in the byline | 24 px targets | 44 px | The bar's targets are 44 px |
| Field labels, help and alerts | `vc-label` .875 rem, `vc-help` .75 rem, alerts .875 rem | Labels 1 rem, help .875 rem, alerts 1 rem | The sizes the app had: they are read from the back of the room |
| Danger button | Solid danger fill | Abort and Forget key as an outline in the danger tone | A solid red bar in the control bar would shout at the room for an action that is rarely needed |
| Segmented control | `vc-segmented`, a radio group | The replay speed stays a group of toggle buttons with `aria-pressed`, drawn like Vici's segmented control | A radio group would change the keyboard path and break the behaviour tests |
| Toggles the app owns | vici.js flips `aria-pressed` on `.vc-chip` and `.vc-button--toggle` | The legend's toggles and *Larger text* use neither class; the app's own code flips them | One owner per control, so a toggle never flips twice (`tests/smoke.mjs`, case *once*) |
| Dialogs | 85 vh high; vici.js closes a dialog on a click on its backdrop | Today's widths (880, 620, 1080 and 1000 px), the window's height less 48 px; the app owns Escape, the backdrop and the focus trap (`data-vc-dismissable="false"`) | The intro and the mode choice fit a 1280 × 720 projector without scrolling; a decision or a typed key is never dropped by a stray click |
| Menus | `.vc-menu[popover]`, fixed to the viewport by vici.js | `.vc-menu` without `popover`, opened under its toggle by the app | The control bar's dropdowns keep their keyboard paths and their place |
| Drawer tabs | `.vc-tabs` bound by vici.js | `.vc-tabs__list` without `.vc-tabs` | The app's tabs close the drawer when the open tab is clicked again |
| Audit table | `vc-table-wrap` scrolls sideways | It clips, and the drawer scrolls | The header row sticks while the audit scrolls with the drawer; its columns fit the drawer |
| The AI label's note | `vc-popover` with `popover`, placed by vici.js | The popover's look without the attribute, opened, placed and closed by `js/ai_label.js` | A toggletip that stays open until a click elsewhere or Escape and gives the focus back (Carbon for AI, Pickering) |
| Progress rail | Labels under the markers; `vc-step--done` in merlot | One line, each label beside its marker; done steps ticked in ink; the step that waits for you merlot with *Your decision* | The rail must not take height from the console; merlot means the person's turn, and a finished step is the agent's |
| Intro steps | Centred labels; Vici's current and done looks | Flush left; each step's hexagon in the tone of its moment (danger, fjord, honey, ink, success) | The steps' hints run to five lines, which read better flush left; the tones introduce the grammar |
| Recommended option | A tag in the card's head | Its tag sits on the card's top frame | Inter runs wider than the former font: the four cards still fit a 1080p drawer with the title on two lines |
| KPI tiles | `vc-stat` has no tones; figures 1.75–2.25 rem; the note in `--vc-text-subtle` | A tile that shows a state takes that state's tone; figures 2.125 rem, 1.875 rem from 1700 px down; the note in `--vc-text-muted` | The strip turns from danger and honey to success as the run moves; the header keeps its height; the note (*30-day exposure, verified*) must read on a projector |
| Mode markings | Sentence case | SIMULATION and LIVE in capitals | Tests and the downloaded files rely on them |
| Simulation | No tape in Vici | A tape of `--vc-text` and `--vc-surface` stripes with the word SIMULATION | A replay must never pass for a live run, and Vici's honey now means *at risk* |
| Disabled buttons | `pointer-events: none` | Pointer kept; the code ignores the click | The title still says why the button is off |
| Tooltips | Shown on hover and on any focus | On buttons with words, only while the words are hidden; not when a dialog moves the focus after a click | A tooltip that repeats the button's words, or pops up when a dialog opens, is noise |
| Scrollbars | The browser's | Thin, in the border tone, on the app's own scrolling panels (console, drawer, legend) | Wide scrollbars take room from the console and the map on a 1280 px projector |
| Map cells | `vc-cell` (a clip-path fill), 1 to 3.5 rem high | SVG hexagons (`js/map_cells.js`), each with the area of the circle it replaces | An outline that is dashed (an alternative not in use) and the state's mark inside need SVG; Vici's cell sizes would crowd the network |
| The legend's toggles | `.vc-chip` with merlot when pressed | Hex capsules with ink ticks, flipped by the map's code | One owner per control; merlot never among the map's state colours |
| Map popovers | `vc-popover` with `popover`, placed by vici.js | Leaflet's popups in Vici's popover look, closed by Vici's icon button, still named *Close popup*; its tooltip hides while the map moves, since vici.js places a tooltip only once; a second click on a cell opens the popover again, as on the circles before | Leaflet keeps a popup on its point while the map pans and zooms, and closes it on a click on the map |
| Hover labels and place names | `vc-tooltip` on an anchor | Leaflet's tooltips: in Vici's tooltip look on hover; the place names permanent, in muted text with a halo of the surface | They follow map coordinates, not elements; the names must read on the tiles in both themes |
| Zoom | Vici has no map controls; its icon buttons have no fill at rest | Vici's icon buttons (plus, minus, with tooltips) in a Leaflet control that keeps Leaflet's class, filled with the surface and edged with a hairline (two tight drop shadows, since a clip-path hexagon takes no border) | A click on them counts as the presenter's own move, gives the focus back to the map and zooms three steps with Shift, as Leaflet's control did; on the map the buttons need a ground of their own, in the dark theme too |
| The ground | Vici's surfaces and patterns | Map tiles, desaturated in the light theme and darkened in the dark one by a CSS filter; CARTO's own light and dark styles with a key | Tiles are images: a filter is the only way to bring them into the theme; the offline coastline map takes the tokens |

## 11. Icons to propose for Vici

The app draws these in Vici's style (`js/icons.js`), until Vici has them:

| Name | Drawing | Used for |
|---|---|---|
| `stop` | A square with chamfered corners | Abort; the rail's stop mark |
| `radar` | Two nested hexagons with a sweep line | Live scan |
| `key` | A key with a hexagonal bow | The API key |
| `eye-off` | Vici's eye, struck through | Hide the key |
| `pulse` | A heartbeat line with sharp turns | Diagnostics |
| `list` | Three lines with hexagon dots | The options ready for a decision, in the console |
| `shield` | A shield with chamfered shoulders | "Actions stay drafts" |
| `truck` | A lorry with hexagon wheels | A mock freight booking, in the outbox and the console |
| `factory` | Three sawtooth sheds, a chimney and three windows on the ground line | Our plants on the map |

The first seven are Rebate Hunter's drawings, unchanged; `truck` and `factory` are new with Navigator.

## Sources

- Vici, Victor Pflüger's design system: https://victorpflueger.github.io/ViciDesign/ (release v1.0.0, `vici/README.md`)
- Machado, Oliveira & Fernandes (2009), *A physiologically-based model for simulation of color vision deficiency*, IEEE TVCG 15(6): https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- R colorspace, `simulate_cvd` (the matrices apply to linear RGB): https://www.rdocumentation.org/packages/colorspace/versions/2.1-2/topics/simulate_cvd
- CSS Color Module Level 4 (OKLab, the 0.02 just-noticeable difference): https://drafts.csswg.org/css-color-4/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Victor Yocco, *Designing For Agentic AI: Practical UX Patterns For Control, Consent, And Accountability*, Smashing Magazine, 11 Feb 2026: https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/
- IBM Carbon for AI, AI label usage: https://carbondesignsystem.com/components/ai-label/usage/
- Heydon Pickering, *Tooltips & Toggletips*, Inclusive Components: https://inclusive-components.design/tooltips-toggletips/
- Google Design, *Expressive Design: Google's UX Research*: https://design.google/library/expressive-material-design-google-research
- VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations*: https://edgeforscholars.vumc.org/optimizing-colors-for-projected-presentations
- Bach et al., *Dashboard Design Patterns*, IEEE VIS 2022: https://arxiv.org/abs/2205.00757

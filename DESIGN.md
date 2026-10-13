# Navigator — design system

How Navigator looks, why it looks that way, and how to change it without breaking it. Version 1.1.0, 13 October 2026.

---

## 1. The brief

- **Burgundy at the centre.** White paper, burgundy for identity, mostly pastel colours (stakeholder direction, 12 October 2026).
- **Legible in 60 seconds.** A partner who has never seen the tool should get the point from across a room, on a 1080p projector, often in a lit room.
- **Agentic.** An AI agent acts on screen. At every moment the viewer must be able to tell who is acting: the agent, or the person who has to decide.

Everything below follows from those three lines.

## 2. Methods, and what each one decided

| Method | Source | What it decided in Navigator |
|---|---|---|
| Perceptual colour in OKLCH | CSS Color 4; Evil Martians, *OKLCH in CSS* | One generator builds every colour from the brand burgundy. Equal OKLCH lightness means equal visual weight, so tints of different hues line up |
| Functional 12-step scales | Radix Colors, *Understanding the scale* | Each step has one job: 1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solids, 11–12 text |
| Hue harmonisation | Material Color Utilities, `Blend.harmonize` | Supporting hues (the network slate, blue, violet) turn towards burgundy by half the distance, at most 15° |
| Colour-blind-safe state hues | Okabe & Ito, *Color Universal Design*; Machado, Oliveira & Fernandes (2009) | The red, amber and green of the network states are fixed hues, and the build fails if they come too close under simulated colour blindness |
| Design tokens | W3C Design Tokens Format Module 2025.10 | The palette ships as `design/tokens.json` (OKLCH, with hex fallbacks) next to the CSS custom properties |
| Accessibility | WCAG 2.2 | Contrast duties for every pairing, focus ring, target size, no meaning by colour alone |
| Agentic UX patterns | Yocco, *Designing For Agentic AI*, Smashing Magazine, Feb 2026 | The progress rail (intent preview), the handover to the human, the audit trail |
| AI labelling | IBM Carbon for AI; Pickering, *Tooltips & Toggletips* | An **AI** label on the options, drafts and summary the agent wrote, with a short explanation one click away |
| Emphasis | Google, *Expressive Design: Google's UX Research* (Material 3 Expressive) | One emphasised action per moment: colour, size and containment go to the step that needs the person |
| Projection | VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations* | Pastels never carry meaning alone; every pastel fill has a deeper stroke or text step. Layouts are reviewed under a simulated washout |
| Dashboard patterns | Bach et al., *Dashboard Design Patterns* (2022) | Each KPI tile pairs one value (data information) with a line of context (meta information) |

## 3. Colour grammar

Four rules. Each colour means one thing, everywhere.

| Colour | Means | Where you see it | Never used for |
|---|---|---|---|
| **Burgundy** | Identity, and **the human in charge** | Primary buttons; every Approve button; the progress step that waits for you (*Your decision*, *Your approval*); the recommended option's frame; the recommendation the agent hands to you and your decisions in the console and the audit; the focus ring; the logo; Nordwerk's own plants and their supply links on the map | The state of the supply network |
| **Red, amber, green** | **The supply network and outcomes**: affected, at risk, resolved | Map strokes and fills, KPI tints, status chips, the cost bars, *Confirmed* and *Unconfirmed* in the console | Decoration, and buttons other than the two destructive ones |
| **Blue** | Checking, and money an option spends | *Check* steps in the console, links to sources, the response-cost bar | |
| **Violet** | **The AI's voice** | AI labels, *Hypothesis* and *Revised* lines, what-if alerts, the reasoning summaries, the streaming cursor, model calls in the audit, the AI disclosure icon | Anything a person decided |
| **Ink** | Everything else: the agent's work | Text, tool calls, separators, neutral controls, Reject | |
| **Hazard yellow and black** | **Simulation** | The SIMULATION badge, tape and watermark. Deliberately outside the palette, so a replay can never pass for a live run | |

On stage, in one sentence: *"Burgundy is you, violet is the AI, red, amber and green are the supply chain."*

Every status colour comes with a second cue (WCAG 1.4.1): a word (*Affected*, *Approved*), an icon, a larger marker or a heavier line. The danger red appears on two buttons only, **Abort** and **Forget key**, because they stop or delete something.

What changed from 1.0: Approve buttons were pastel green and Reject buttons red, so a person's decision borrowed the network's colours. The pending-decision status was amber, the colour of risk. The supplier tiers were blue, violet and pink: pink sat next to the affected red, and violet now belongs to the AI. Now burgundy is the only colour of human action, Reject is neutral, and the network at rest is one quiet slate.

## 4. How the palette is made

`tools/palette.mjs` generates every colour from one input, `SOURCE = "#7a1e3a"`, which is `oklch(0.394 0.127 7.1)`.

1. **Ladder.** Steps 1–8 share one lightness ladder across all families (L 0.993 → 0.772), so a tint of red and a tint of blue at the same step weigh the same. Steps 9–12 are set per family, so that solids and text meet their contrast duties.
2. **Tints.** Chroma grows with the step. Burgundy tints use 75 % of the usual chroma, so the pale steps read as rosewood, not candy pink.
3. **Ink.** The neutrals carry the burgundy hue at very low chroma (0.004–0.02), so every grey on the page belongs to the brand. Shadows are tinted with the darkest burgundy, never black.
4. **Harmonisation.** Where colour is atmosphere, hues turn towards burgundy by Material's rule (half the hue distance, at most 15°; applied to OKLCH hue rather than Material's HCT): the network slate and the blue move from 250° to 265°, violet from 295° to 310°.
5. **Fixed state hues.** Where colour is meaning, hues are fixed: danger 29°, warning 57°, success 170°. The first draft harmonised them too, which turned green towards yellow (140°). Under deuteranopia, red and that green were then only ΔEOK 0.03 apart, below what a viewer can reliably tell apart on a map. The fix makes red deeper than amber and makes the green lean blue (the "bluish green" of Okabe and Ito), so the three differ in lightness and on the blue–yellow axis, which red–green colour blindness preserves. Red also stays clear of burgundy: at least 18° of hue and 0.12 of lightness apart.
6. **Gamut.** Colours outside sRGB are brought in by lowering chroma only; lightness and hue stay.

| Family | Hue | Role |
|---|---|---|
| `wine` | 7.1° (source) | Brand, actions, the human's decisions |
| `ink` | 7.1°, chroma ≤ 0.02 | Text, surfaces, borders |
| `slate` | 265° (harmonised) | The supply network at rest: corridors, hubs, supplier tiers |
| `danger` | 29° (fixed) | Affected; destructive actions |
| `warning` | 57° (fixed) | At risk; unconfirmed |
| `success` | 170° (fixed) | Resolved; approved; confirmed |
| `info` | 265° (harmonised) | Checking; money an option spends |
| `violet` | 310° (harmonised) | The AI's voice |

**Outputs.** `css/tokens.css` holds the primitives (`--wine-1` … `--violet-12`) as hex, each with its OKLCH value in a comment. `design/tokens.json` holds the same primitives in the W3C Design Tokens Format 2025.10 (`colorSpace: "oklch"`, `components`, `hex` fallback) plus the role aliases. Both files are generated: never edit them by hand.

**Roles.** `css/style.css` maps primitives to roles and contains no colour values of its own, apart from white and the simulation colours. Components use roles: `--brand`, `--brand-soft`, `--text-muted`, `--line`, `--border-control`, `--danger-line`, `--violet-text` and so on. The map reads `--affected`, `--at-risk`, `--resolved`, their `-fill` variants and `--network` when it starts (`js/map.js`).

## 5. The checks

`node tools/palette.mjs --check` runs 45 checks and fails the build if any fails. It is the first suite in `node tests/run-all.mjs`.

**Contrast (WCAG 2.2), 32 pairings.** Body text 15.9:1 on paper (AAA, 1.4.6, needs 7). Muted and faint text 6.9:1 and 5.0:1 (1.4.3, needs 4.5). White on burgundy 10.1:1. Burgundy text 8.2:1. Input and toggle borders 4.0:1, and every state stroke and icon on paper: danger 5.7, warning 3.3, success 3.6, blue 4.4, violet 5.0, slate 5.5 (1.4.11, needs 3). Each family's text step is also checked on its own tint.

**Brand vs danger, 2 checks.** Hue gap 21.9° (needs 18°), lightness gap 0.14 (needs 0.12).

**Colour-blind separation, 9 pairs.** Each pair is simulated for normal vision, protanopia, deuteranopia and tritanopia with the Machado et al. (2009) matrices at full severity, applied in linear RGB. The smallest OKLab distance must be at least 0.10, five times the 0.02 just-noticeable difference that CSS Color 4 uses for gamut mapping.

| Pair | Smallest ΔEOK | Worst case |
|---|---|---|
| Affected vs at risk | 0.120 | deuteranopia |
| Affected vs resolved | 0.111 | deuteranopia |
| At risk vs resolved | 0.104 | protanopia |
| Affected vs the network (slate) | 0.156 | protanopia |
| At risk vs the network | 0.188 | protanopia |
| Resolved vs the network | 0.113 | deuteranopia |
| Cost bars: response cost vs remaining exposure | 0.237 | protanopia |
| Cost bars: response cost vs doing nothing | 0.228 | deuteranopia |
| Burgundy vs danger | 0.130 | protanopia |

**Token files, 2 checks.** `css/tokens.css` and `design/tokens.json` must match what the generator produces now.

## 6. Agentic patterns

Yocco's six patterns for agentic AI, and where each one lives:

| Pattern | In Navigator |
|---|---|
| Intent preview | The **progress rail** shows the agent's five-step plan before the run starts, and the intro window explains it |
| Autonomy dial | Fixed at one level on purpose: *plan and propose, you approve*. Every outbound action is a draft that needs its own approval |
| Explainable rationale | The recommendation line, *Confirmed:* and *Revised: old → new* with their evidence, the reasoning summaries, and the AI label's explanation |
| Confidence signal | Alerts are *verified* (two independent sources, enforced in code) or labelled *what-if*; *Unconfirmed* lines in amber |
| Action audit and undo | The Audit tab and its JSON export. Undo is not needed: nothing leaves the outbox |
| Escalation pathway | The agent hands over at each decision (the rail turns burgundy), continues as a labelled what-if when it cannot confirm, and ends as **Stopped** rather than guess |

**Progress rail** (`js/progress.js`). Five steps, the same as the intro: Spot, Check, Calculate, Propose, Prepare. Ink while the agent works, with a pulse on the current step. Burgundy with *Your decision* or *Your approval* when the run waits for a person. A tick when done, a stop mark where a run ended early, a dashed circle for steps a run did not need. It never moves backwards when the agent revisits an earlier phase. It is an ordered list, the current step carries `aria-current="step"`, and each step's state is spelled out for screen readers. A container query hides the labels of other steps when the console is narrow.

**Handover** (`js/handover.js`). The run state *awaiting approval* covers two moments, so the status pill, the console's phase line and the rail all name the human step the same way: **Awaiting your decision** while the options wait, then **Awaiting your approval** while the drafts wait.

**AI labels** (`js/ai_label.js`). After Carbon for AI: a small violet **AI** mark at the upper right of the options summary, each draft and the management summary. Clicking it opens a toggletip that stays open until you click elsewhere or press Escape. It says who wrote the content (the live model by name, a recorded run, or the scripted replay), that every euro figure and date comes from the deterministic engine, and what approval does. The label is 24 px, inside a 40 × 40 px target.

## 7. Built for the room

- **Projection.** Muted colours blend on a projector (VUMC). Pastels therefore only ever fill; the meaning sits in a deeper stroke or text step at 3:1 or more. The options view is reviewed under a simulated washout (`contrast(0.62) brightness(1.18) saturate(0.8)`).
- **Emphasis.** Google's research on Material 3 Expressive (46 studies, more than 18,000 participants) found that people spotted key elements up to four times faster when colour, size, shape and containment pointed at them, and that breaking familiar patterns hurt. Navigator spends emphasis on one thing per moment: the recommended option has the burgundy frame and the only solid Approve; the other options have outline buttons; the rail highlights one step.
- **Size.** The root font scales to about 17 px at 1920 px wide; **Larger text** enlarges the console. Every interactive element is at least 40 × 40 px, well above the 24 px minimum of WCAG 2.5.8 (`tests/layout.mjs`).
- **Focus.** A 2 px burgundy ring outside a 2 px white gap: 10:1 against paper, meeting WCAG 2.4.13 Focus Appearance.
- **Motion.** One pulse on the active rail step, a short flash on a newly affected map element, the streaming cursor. All of it stops under `prefers-reduced-motion`.
- **Words.** Labels name what a person understands: *Your decision*, *Approve*, *Accept the risk*, *Forget key*. The same action keeps the same name through the flow.

## 8. Testing the design

| Command | What it does |
|---|---|
| `node tools/palette.mjs --check` | The 45 colour checks above (Node.js only) |
| `node tests/layout.mjs` | Five viewports from 1920×1080 to 1280×720; no overflow; targets ≥ 40 px |
| `node tests/design.mjs` | In the running app: map strokes and legend use the state tokens; pill, console and rail name the human step; AI labels open and close. Writes review screenshots: the options normally and under the washout, and the finished run as seen with protanopia, deuteranopia and tritanopia |

The browser suites need Playwright (`tests/README.md`). The colour-blind screenshots use the same matrices as the palette check, applied by an SVG colour-matrix filter in linear RGB.

## 9. Changing things safely

**Change the brand colour.** Edit `SOURCE` in `tools/palette.mjs` and run `node tools/palette.mjs`. Both token files are rewritten and the checks run. If one fails, adjust that family's solid or text lightness in `FAMILIES` and run it again. Then update `favicon.svg`, the only file that cannot read the tokens. The logo in the page is drawn from the tokens.

**Add a colour.** Add a family to `FAMILIES`, give it contrast duties in `PAIRS`, and add separation pairs to `SEPARATE` if it carries meaning next to other colours. Map it to a role in `css/style.css` and use the role, not the primitive.

**Keep the grammar.**
- Burgundy only for identity and for what a person does or decides.
- Status colours only for the network and outcomes, and always with a word, an icon or a shape.
- Violet only for what the AI wrote or thinks. New AI-written content gets an AI label.
- No new hex values in components: use a role.
- New interactive elements are at least 40 × 40 px and use the shared focus ring.

## Sources

- CSS Color Module Level 4, gamut mapping (JND 0.02): https://drafts.csswg.org/css-color-4/
- Evil Martians, *OKLCH in CSS: why we moved from RGB and HSL*: https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
- Radix Colors, *Understanding the scale*: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Material Color Utilities, `Blend.harmonize`: https://api.flutter.dev/flutter/package-material_color_utilities_blend_blend/Blend/harmonize.html
- Okabe & Ito, *Color Universal Design*: https://jfly.uni-koeln.de/color/
- Machado, Oliveira & Fernandes (2009), *A physiologically-based model for simulation of color vision deficiency*, IEEE TVCG 15(6): https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- R colorspace, `simulate_cvd` (the matrices apply to linear RGB): https://www.rdocumentation.org/packages/colorspace/versions/2.1-2/topics/simulate_cvd
- W3C Design Tokens Format Module 2025.10: https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Victor Yocco, *Designing For Agentic AI: Practical UX Patterns For Control, Consent, And Accountability*, Smashing Magazine, 11 Feb 2026: https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/
- IBM Carbon for AI, AI label usage: https://carbondesignsystem.com/components/ai-label/usage/
- Heydon Pickering, *Tooltips & Toggletips*, Inclusive Components: https://inclusive-components.design/tooltips-toggletips/
- Google Design, *Expressive Design: Google's UX Research*: https://design.google/library/expressive-material-design-google-research
- VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations*: https://edgeforscholars.vumc.org/optimizing-colors-for-projected-presentations
- Bach et al., *Dashboard Design Patterns*, IEEE VIS 2022: https://arxiv.org/abs/2205.00757

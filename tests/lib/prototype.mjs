// What differs between the four prototypes in the shared Vici tests (tests/tokens.mjs,
// tests/hexagon.mjs, tests/page-icon.mjs and tests/vici-files.mjs). Those four files are the same in
// Rebate Hunter, Navigator, Timetable Translator and Repack Pilot; this file is the one place that is
// not. Everything here is Navigator's.

/** The prototype's name, as on its page and on its card on Victor's website. */
export const NAME = "Navigator";

/**
 * Colour pairs only this prototype draws (the shared shell's pairs are in tests/tokens.mjs):
 * [what, foreground token, background token, kind]. kind "text" needs 4.5:1, "mark" (a line, an icon,
 * a control's border, a bar) 3:1 (WCAG 2.2, 1.4.3 and 1.4.11). Tokens are Vici's, without "--vc-".
 * The map's ground is the offline coastline map's land (surface) and sea (bg-sunken, also the map's
 * colour before its tiles arrive); the tiles are kept as quiet as that land (css/map.css).
 */
export const COLOUR_PAIRS = [
  // The supply network at rest: corridors, supply links, hubs and the suppliers' outlines.
  ["Map: the network at rest (corridors, supply links, hubs, supplier outlines), on land", "neutral-solid", "surface", "mark"],
  ["Map: the network at rest, on the sea", "neutral-solid", "bg-sunken", "mark"],
  // The states, on land (the shell's danger, warning and success marks on panels) and on the sea.
  ["Map: affected (a heavier line, an outline with a cross), on the sea", "danger-solid", "bg-sunken", "mark"],
  ["Map: at risk (a heavier line, an outline with a bar and dot), on the sea", "warning-text", "bg-sunken", "mark"],
  ["Map: resolved or a mitigation (a heavier line, an outline with a tick), on the sea", "success-solid", "bg-sunken", "mark"],
  ["Map: the cross inside an affected hexagon", "danger-text", "danger-border", "mark"],
  ["Map: the bar and dot inside an at-risk hexagon", "warning-text", "warning-border", "mark"],
  ["Map: the tick inside a resolved hexagon", "success-text", "success-border", "mark"],
  // Our plants: client entities in ink, a strong neutral outline at rest.
  ["Map: a plant's outline at rest, on land", "border-strong", "surface", "mark"],
  ["Map: a plant's outline at rest, on the sea", "border-strong", "bg-sunken", "mark"],
  ["Map: a plant's factory icon, in its cell", "text", "surface", "mark"],
  ["Map: plant names, on the sea", "text", "bg-sunken", "text"],
  ["Map: hub and port names, on land", "text-muted", "surface", "text"],
  ["Map: hub and port names, on the sea", "text-muted", "bg-sunken", "text"],
  // The legend's toggles: hex capsules on a quiet fill, their box outlined until it is ticked in ink.
  ["Map legend: a toggle's box at rest (its border), on the toggle's quiet fill", "border-strong", "bg-subtle", "mark"],
  // The popups (Vici's popover look on the raised surface).
  ["Map popups: a plant's cover below what the line needs (danger)", "danger-text", "surface-raised", "text"],
  ["Map popups: a plant's cover running low (warning)", "warning-text", "surface-raised", "text"],
  // The options' comparison bars (the shared drawer), on their track.
  ["Comparison of options: the response cost (fjord), on its track", "info-solid", "bg-subtle", "mark"],
  ["Comparison of options: the exposure that remains, on its track", "warning-text", "bg-subtle", "mark"],
  ["Comparison of options: doing nothing, on its track", "danger-solid", "bg-subtle", "mark"]
];

/**
 * Colours that must stay apart, beyond the shared ones in tests/tokens.mjs: [what, token, token].
 * The test reports how far apart they stay under colour-vision deficiency; it does not fail on them.
 */
export const SEPARATIONS = [
  ["Map: an affected supplier's fill vs a tier-1 supplier's fill", "danger-border", "border-strong"],
  ["Map: an at-risk supplier's fill vs a tier-1 supplier's fill", "warning-border", "border-strong"],
  ["Map: a resolved supplier's fill vs a tier-1 supplier's fill", "success-border", "border-strong"],
  ["Map: affected vs at-risk fills", "danger-border", "warning-border"],
  ["Map: affected vs resolved fills", "danger-border", "success-border"],
  ["Map: at-risk vs resolved fills", "warning-border", "success-border"]
];

/**
 * The hexagon test's tour of the app (tests/hexagon.mjs): the main states of a simulation run, and
 * the dialogs and map views on the way. The page has just been opened, without SKIP_INTRO, so the
 * intro opens by itself. visit(name, { settle }) checks the page as it is, settle ms (250) after the step.
 */
export async function hexagonTour(page, visit) {
  const approve = '.option-card[data-recommended="true"] [data-action="approve"]';
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.waitForSelector(".intro-modal", { timeout: 10000 });
  await visit("start screen with the intro");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".intro-modal", { state: "detached", timeout: 5000 });
  await visit("idle map, Europe network");
  // The legend opened (if the map folded it), a supplier's and a plant's details, and the global view
  // before a run.
  const fold = await page.$('.legend[data-collapsed="true"] .legend-head button');
  if (fold && (await fold.isVisible())) {
    await fold.click();
    await visit("idle map, legend open");
  }
  await page.$eval('.hex-marker[data-id="S-DEB-CELL"]', (el) => el.closest(".leaflet-marker-icon").click());
  await page.waitForSelector(".leaflet-popup .pop-title", { timeout: 5000 });
  await visit("details of a supplier");
  await page.click(".leaflet-popup .pop-close");
  await page.waitForSelector(".leaflet-popup", { state: "detached", timeout: 5000 });
  // A plant's details: its tags and its table of cover.
  await page.$eval(".plant-icon", (el) => el.click());
  await page.waitForSelector(".leaflet-popup .pop-table", { timeout: 5000 });
  await visit("details of a plant");
  await page.click(".leaflet-popup .pop-close");
  await page.waitForSelector(".leaflet-popup", { state: "detached", timeout: 5000 });
  await page.click('.map-tools button:has-text("Global view")');
  await page.waitForTimeout(800);
  await visit("global view");
  await page.click('.map-tools button:has-text("Europe network")');
  await page.click("#btn-diagnostics");
  await page.waitForSelector(".diag-table", { timeout: 5000 });
  await visit("diagnostics");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".diag-table", { state: "detached", timeout: 5000 });
  // The mode dialog, the key dialog behind the live card, then a simulation: at ×1 until the map
  // first marks an entity, then at ×4.
  await page.click('button[aria-label="Replay speed ×1"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await visit("mode dialog");
  await page.click('.mode-card[data-mode="live"] .mode-cta button');
  await page.waitForSelector("#api-key-input", { timeout: 5000 });
  await visit("key dialog");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#api-key-input", { state: "detached", timeout: 5000 });
  if (!(await page.$(".mode-card"))) await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  await page.waitForSelector('.hex-marker:not([data-state="neutral"]), .plant-marker:not([data-state="neutral"])', { state: "attached", timeout: 90000 });
  await visit("the first entity marked on the map", { settle: 50 });
  await page.click('button[aria-label="Replay speed ×4"]');
  await page.waitForSelector(approve, { state: "visible", timeout: 180000 });
  await page.waitForTimeout(800);
  await visit("decision");
  await page.click(approve);
  await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 120000 });
  await page.waitForTimeout(800);
  await visit("drafts");
  await page.click('button:has-text("Approve all")');
  await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await visit("finished");
  await page.click("#tab-audit");
  await visit("finished, audit");
  // The drawer hidden: the whole map with the run's states on it.
  await page.click(".drawer-toggle");
  await page.waitForTimeout(1500);
  await visit("finished, drawer hidden");
  await page.click('button:has-text("Open management summary")');
  await page.waitForSelector(".report-modal", { timeout: 5000 });
  await visit("management summary");
  await page.keyboard.press("Escape");
}

/**
 * The page icon (tests/page-icon.mjs): the icon and kind of this prototype's card on Victor's website
 * (VictorPflueger/VIP, data/prototypes.js), the colour of that kind's cell (Vici's lilac for a
 * prototype), and favicon.svg exactly: the card's cell drawn for small sizes.
 */
export const PAGE_ICON = {
  icon: "globe-hex",
  kind: "prototype",
  tone: "lilac",
  favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 103.92">
  <!-- Navigator's page icon: Vici's globe-hex icon in a lilac hexagon cell, the same as its card
       on Victor Pflüger's website (icon and kind: VictorPflueger/VIP, data/prototypes.js). Vici's
       lilac 100 (#f2e9fd) and lilac 900 (#372544); the icon is drawn larger and bolder
       than on the card so that it still reads at 16 px. -->
  <polygon points="120,51.96 90,103.92 30,103.92 0,51.96 30,0 90,0" fill="#f2e9fd"/>
  <g transform="translate(18 9.96) scale(3.5)" fill="none" stroke="#372544" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2.8 L19.97 7.4 L19.97 16.6 L12 21.2 L4.03 16.6 L4.03 7.4 Z"/>
    <path d="M4 9 H20 M4 15 H20 M12 2.8 L9.5 7.5 V16.5 L12 21.2"/>
  </g>
</svg>
`
};

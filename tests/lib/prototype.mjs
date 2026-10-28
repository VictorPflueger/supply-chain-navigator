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

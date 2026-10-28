// Icons: Vici's icon set, and the app's own drawings for the few things Vici has no icon for yet.
// An icon is a <span class="vc-icon"> that Vici's stylesheet paints as a mask in the current text
// colour, hidden from screen readers. A drawing of the app's own is set as the span's --_icon with
// element.style.setProperty(), which the content security policy allows (no style attribute in the
// markup). The drawings follow Vici's grid: 24 × 24 with 2 px to spare, 1.75 px strokes with round
// caps and joins, no fills but small dots, hexagons where a shape would be round, chamfered corners;
// DESIGN.md lists them as icons to propose for Vici.

/** The app's names for Vici's icons. */
const VICI = {
  play: "play", reset: "refresh", gear: "settings", globe: "globe-hex", check: "check", x: "close",
  alert: "warning", info: "info", user: "user", mail: "mail", calendar: "calendar", download: "download", copy: "copy",
  chevronDown: "chevron-down", chevronUp: "chevron-up", chevronRight: "chevron-right", eye: "eye",
  external: "external", spark: "sparkle", target: "pin",
  // The map's zoom buttons.
  plus: "plus", minus: "minus",
  // The states on the map (a plant's state tag): Vici's state icons.
  error: "error", warning: "warning", success: "success"
};

/** The app's own drawings (static, trusted strings; never built from data). */
const DRAWN = {
  // A square with chamfered corners.
  stop: "<path d='M7.6 6 H16.4 L18 7.6 V16.4 L16.4 18 H7.6 L6 16.4 V7.6 Z'/>",
  // Two nested hexagons with a sweep line (the live scan for disruptions).
  radar: "<path d='M21 12 L16.5 19.79 L7.5 19.79 L3 12 L7.5 4.21 L16.5 4.21 Z'/><path d='M16.5 12 L14.25 15.9 L9.75 15.9 L7.5 12 L9.75 8.1 L14.25 8.1 Z'/><path d='M12 12 L16 5.07'/>",
  // A key with a hexagonal bow (the API key).
  key: "<path d='M12 12 L9.75 15.9 L5.25 15.9 L3 12 L5.25 8.1 L9.75 8.1 Z'/><path d='M12 12 H21 M18 12 V15 M21 12 V14.5'/>",
  // Vici's eye, struck through (hide the key).
  eyeOff: "<path d='M2 13 L7 8.5 H17 L22 13 L17 17.5 H7 Z'/><path d='M14.7 13 L13.35 15.34 L10.65 15.34 L9.3 13 L10.65 10.66 L13.35 10.66 Z' fill='black' stroke='none'/><path d='M12 3.5 V5.75 M18.25 4.75 L17.1 6.6'/><path d='M3.5 5 L20.5 21'/>",
  // A heartbeat line with sharp turns (Diagnostics).
  pulse: "<path d='M2.5 12.5 H7 L9.5 6 L14 19 L16.5 12.5 H21.5'/>",
  // Three lines with hexagon dots (the options ready for a decision).
  list: "<path d='M9 7 H20.5 M9 12 H20.5 M9 17 H20.5'/><path d='M6.05 7 L5.4 8.13 L4.1 8.13 L3.45 7 L4.1 5.87 L5.4 5.87 Z M6.05 12 L5.4 13.13 L4.1 13.13 L3.45 12 L4.1 10.87 L5.4 10.87 Z M6.05 17 L5.4 18.13 L4.1 18.13 L3.45 17 L4.1 15.87 L5.4 15.87 Z' fill='black' stroke='none'/>",
  // A shield with chamfered shoulders (drafts only, nothing is sent).
  shield: "<path d='M8 3.5 H16 L19.5 6.5 V12 L16 17.5 L12 20.5 L8 17.5 L4.5 12 V6.5 Z'/>",
  // A lorry with hexagon wheels (a freight booking in the outbox).
  truck: "<path d='M14 15.5 V5 H2.5 V15.5 M14 8.5 H18 L21.5 12 V15.5'/><path d='M2.5 15.5 H4.85 M9.15 15.5 H14.85 M19.15 15.5 H21.5'/><path d='M9.15 17.25 L8.08 19.11 L5.93 19.11 L4.85 17.25 L5.93 15.39 L8.08 15.39 Z M19.15 17.25 L18.08 19.11 L15.93 19.11 L14.85 17.25 L15.93 15.39 L18.08 15.39 Z'/>",
  // A factory: three sawtooth sheds, a chimney, three windows on the ground line (our plants).
  factory: "<path d='M4 20.5 V12 L8.5 9 V12 L13 9 V12 L17 9 V4 H20 V20.5'/><path d='M2.5 20.5 H21.5'/><path d='M7 16 H9 M11 16 H13 M15 16 H17'/>"
};

const masks = new Map();
/** A drawing as the CSS value Vici's .vc-icon masks with: black strokes on a 24 × 24 grid. */
function maskOf(name) {
  if (!masks.has(name)) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'>${DRAWN[name]}</svg>`;
    masks.set(name, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
  return masks.get(name);
}

/** The names icon() knows: Vici's and the app's own. */
export const ICON_NAMES = [...Object.keys(VICI), ...Object.keys(DRAWN)];

/**
 * A Vici icon, <span class="vc-icon vc-icon--NAME" aria-hidden="true">, or one of the app's own
 * drawings in the same form. size (px) sets its size where no Vici component sizes it (in a button,
 * a tag, an alert or a cell, Vici sizes the icon to the text). An unknown name draws "info".
 */
export function icon(name, size = 20, cls = "") {
  const span = document.createElement("span");
  const own = Object.hasOwn(DRAWN, name);
  const vici = own ? null : VICI[name] || "info";
  span.className = ["vc-icon", vici ? `vc-icon--${vici}` : "app-icon", cls].filter(Boolean).join(" ");
  span.setAttribute("aria-hidden", "true");
  if (own) span.style.setProperty("--_icon", maskOf(name));
  if (size) span.style.setProperty("--vc-icon-size", `${size}px`);
  return span;
}

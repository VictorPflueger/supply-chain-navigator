// Formatting for money, counts, durations and dates: British English, euros, a no-break space between
// a number and its unit. Part of the shell: nothing here knows about supply chains.

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const NBSP = " ";

/** Compact euro amount for figures and cards: €19.1M, €984k, €2,640. */
export function eurCompact(value) {
  const v = Number(value);
  if (value === null || value === undefined || Number.isNaN(v)) return "";
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}€${nf1.format(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}€${nf1.format(a / 1e6)}M`;
  if (a >= 1e4) return `${sign}€${nf0.format(a / 1e3)}k`;
  return `${sign}€${nf0.format(a)}`;
}

/** Small euro amounts with cents, for the session cost: €0.21. */
export function eurCents(value) {
  return `€${nf2.format(Number(value) || 0)}`;
}

/** A euro amount as the records hold it, in full: €12, €1.40, €180,000. */
export function eurExact(value) {
  const v = Number(value) || 0;
  return `€${Number.isInteger(v) ? nf0.format(v) : nf2.format(v)}`;
}

export function int(value) {
  return nf0.format(Math.round(Number(value) || 0));
}

/** "9 days", "1 day". */
export function days(n) {
  return `${int(n)}${NBSP}${Math.abs(Math.round(n)) === 1 ? "day" : "days"}`;
}

/** m:ss (or h:mm:ss) for the decision clock. */
export function clock(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "Sun 29 Nov": a day offset from today, or an ISO date. */
export function shortDate(isoOrOffset, today = new Date()) {
  const d = typeof isoOrOffset === "number"
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + isoOrOffset)
    : new Date(String(isoOrOffset).includes("T") ? isoOrOffset : `${isoOrOffset}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "73 %" from a whole percentage. */
export function pct(n) {
  return `${int(n)}${NBSP}%`;
}

export function plural(n, one, many = `${one}s`) {
  return `${int(n)} ${Math.abs(n) === 1 ? one : many}`;
}

/** "one", "two" … for counts a sentence reads better in words. */
export function words(n) {
  return ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? int(n);
}

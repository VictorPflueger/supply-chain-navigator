// Formatting helpers for money, durations and dates (English UI, EUR).

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Compact euro amount for KPIs and cards: €19.1M, €380k, €2,640. */
export function eurCompact(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const v = Number(value);
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}€${nf1.format(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}€${nf1.format(a / 1e6)}M`;
  if (a >= 1e4) return `${sign}€${nf0.format(a / 1e3)}k`;
  return `${sign}€${nf0.format(a)}`;
}

/** Full euro amount: €2,640,000. */
export function eurFull(value) {
  if (value === null || value === undefined) return "—";
  return `€${nf0.format(Math.round(Number(value)))}`;
}

/** Small euro amounts with cents, for the cost meter: €0.38. */
export function eurCents(value) {
  return `€${nf2.format(Number(value) || 0)}`;
}

export function int(value) {
  return nf0.format(Math.round(Number(value) || 0));
}

export function days(n) {
  if (n === null || n === undefined) return "—";
  const v = Math.round(Number(n) * 10) / 10;
  return `${v} ${Math.abs(v) === 1 ? "day" : "days"}`;
}

/** mm:ss (or h:mm:ss) for the stopwatch. */
export function clock(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** "Tue 21 Oct" for an ISO date or a day offset from today. */
export function shortDate(isoOrOffset) {
  let d;
  if (typeof isoOrOffset === "number") {
    const now = new Date();
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + isoOrOffset);
  } else {
    d = new Date(`${isoOrOffset}T12:00:00`);
  }
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "15:56:03" local time from an ISO timestamp. */
export function timeOfDay(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function pct(ratio) {
  return `${Math.round((Number(ratio) || 0) * 100)} %`;
}

export function plural(n, one, many = `${one}s`) {
  return `${int(n)} ${Math.abs(n) === 1 ? one : many}`;
}

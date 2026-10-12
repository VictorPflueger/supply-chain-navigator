// Open-data tools for the live agent: weather (Open-Meteo), earthquakes (USGS), natural events
// (NASA EONET) and Rhine water levels (PEGELONLINE). Results are compacted to keep tokens low and
// joined with Nordwerk's network by distance, so the agent sees exposure, not raw feeds.
// Every function resolves (never throws): on failure it returns { error, fallback_hint }.

import { OPEN_DATA } from "./config.js";
import { distKm } from "./world.js";
import { isKnownFailed, remember } from "./diagnostics.js";

const FALLBACK = "use web_search";

async function getJson(url, diagId, timeoutMs = 10000) {
  if (isKnownFailed(diagId)) {
    return { failed: true, error: `${OPEN_DATA[diagId]?.label || diagId} failed the Diagnostics check in this browser session, so it was skipped.` };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) {
      remember(diagId, "fail", `HTTP ${res.status}`);
      return { failed: true, error: `${OPEN_DATA[diagId]?.label || diagId} answered HTTP ${res.status}.` };
    }
    const json = await res.json();
    remember(diagId, "pass", "Used by the agent");
    return { json };
  } catch (e) {
    const why = e?.name === "AbortError" ? "timed out" : "was blocked or unreachable from this browser (network, firewall or CORS)";
    remember(diagId, "fail", why);
    return { failed: true, error: `${OPEN_DATA[diagId]?.label || diagId} ${why}.` };
  } finally {
    clearTimeout(timer);
  }
}

function fail(error) {
  return { error, fallback_hint: FALLBACK };
}

/** Nordwerk sites (plants, suppliers, qualified alternatives) and logistics nodes near a point. */
function nearNetwork(model, lat, lon, radiusKm, limit = 6) {
  const out = [];
  const consider = (id, name, kind, la, lo) => {
    const d = distKm([lat, lon], [la, lo]);
    if (d <= radiusKm) out.push({ id, name, kind, distance_km: Math.round(d) });
  };
  for (const p of model.world.plants) consider(p.id, p.name, "plant", p.lat, p.lon);
  for (const s of model.world.suppliers) consider(s.id, s.name, `tier-${s.tier} supplier`, s.lat, s.lon);
  for (const a of model.world.alternatives) consider(a.id, a.name, "qualified alternative", a.lat, a.lon);
  for (const n of model.world.nodes) consider(n.id, n.name, `logistics node (${n.type})`, n.lat, n.lon);
  return out.sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);
}

// ---- weather ----------------------------------------------------------------------------------

const WMO = {
  0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "rime fog",
  51: "light drizzle", 53: "drizzle", 55: "dense drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "rain showers", 81: "rain showers",
  82: "violent rain showers", 85: "snow showers", 86: "heavy snow showers", 95: "thunderstorm",
  96: "thunderstorm with hail", 99: "thunderstorm with heavy hail"
};

export async function geoWeather(model, { lat, lon, days = 7, past_days = 3 } = {}) {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    return { error: "lat and lon must be valid coordinates (take them from erp_get_supplier)." };
  }
  const fd = Math.min(16, Math.max(1, Math.round(Number(days) || 7)));
  const pd = Math.min(14, Math.max(0, Math.round(Number(past_days) || 0)));
  const url = `${OPEN_DATA.openMeteo.forecastUrl}?latitude=${la.toFixed(3)}&longitude=${lo.toFixed(3)}` +
    "&daily=weather_code,precipitation_sum,rain_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min" +
    `&forecast_days=${fd}&past_days=${pd}&timezone=auto`;
  const r = await getJson(url, "openMeteo");
  if (r.failed) return fail(r.error);
  const d = r.json?.daily;
  if (!d?.time) return fail("Open-Meteo returned no daily data.");
  const daysOut = d.time.map((date, i) => ({
    date,
    conditions: WMO[d.weather_code?.[i]] || `code ${d.weather_code?.[i]}`,
    precip_mm: round1(d.precipitation_sum?.[i]),
    snow_cm: round1(d.snowfall_sum?.[i]),
    gust_kmh: Math.round(d.wind_gusts_10m_max?.[i] ?? 0),
    tmax_c: round1(d.temperature_2m_max?.[i]),
    tmin_c: round1(d.temperature_2m_min?.[i])
  }));
  const flags = [];
  for (const x of daysOut) {
    if (x.precip_mm >= 80) flags.push(`extreme rainfall ${x.precip_mm} mm on ${x.date}`);
    else if (x.precip_mm >= 40) flags.push(`heavy rainfall ${x.precip_mm} mm on ${x.date}`);
    if (x.gust_kmh >= 100) flags.push(`severe gusts ${x.gust_kmh} km/h on ${x.date}`);
    else if (x.gust_kmh >= 75) flags.push(`storm gusts ${x.gust_kmh} km/h on ${x.date}`);
    if (x.snow_cm >= 10) flags.push(`snowfall ${x.snow_cm} cm on ${x.date}`);
    if (x.tmax_c >= 38) flags.push(`heat ${x.tmax_c} °C on ${x.date}`);
  }
  const total = daysOut.reduce((a, x) => a + (x.precip_mm || 0), 0);
  return {
    source: "Open-Meteo forecast API (live)",
    location: { lat: la, lon: lo, timezone: r.json.timezone || null },
    near: nearNetwork(model, la, lo, 60, 4),
    past_days: pd,
    days: daysOut,
    total_precip_mm: round1(total),
    flags,
    assessment: flags.length ? "Weather events that can disrupt operations or transport." : "No severe weather in this window."
  };
}

// ---- earthquakes ------------------------------------------------------------------------------

export async function geoEarthquakes(model, { min_magnitude = 4.5, days = 7 } = {}) {
  const minMag = Math.min(9, Math.max(1, Number(min_magnitude) || 4.5));
  const span = Math.min(30, Math.max(1, Math.round(Number(days) || 7)));
  const period = span <= 1 ? "day" : span <= 7 ? "week" : "month";
  const level = minMag >= 4.5 ? "4.5" : minMag >= 2.5 ? "2.5" : "1.0";
  const url = `${OPEN_DATA.usgs.feedBase}${level}_${period}.geojson`;
  const r = await getJson(url, "usgs");
  if (r.failed) return fail(r.error);
  const since = Date.now() - span * 86400000;
  const feats = (r.json?.features || []).filter((f) => (f.properties?.mag ?? 0) >= minMag && (f.properties?.time ?? 0) >= since);
  const quakes = feats.map((f) => {
    const [lo, la, depth] = f.geometry?.coordinates || [];
    return {
      magnitude: f.properties.mag,
      place: f.properties.place,
      time_utc: new Date(f.properties.time).toISOString().slice(0, 16).replace("T", " "),
      lat: round2(la), lon: round2(lo), depth_km: Math.round(depth ?? 0),
      pager_alert: f.properties.alert || null,
      tsunami: !!f.properties.tsunami,
      url: f.properties.url,
      near_nordwerk: nearNetwork(model, la, lo, 300, 5)
    };
  });
  const near = quakes.filter((q) => q.near_nordwerk.length).sort((a, b) => b.magnitude - a.magnitude);
  const others = quakes.filter((q) => !q.near_nordwerk.length).sort((a, b) => b.magnitude - a.magnitude).slice(0, 5)
    .map(({ near_nordwerk, url, ...q }) => q);
  return {
    source: `USGS earthquake feed ${level}_${period} (live)`,
    window_days: span,
    min_magnitude: minMag,
    total_events: quakes.length,
    within_300_km_of_nordwerk: near.slice(0, 10),
    strongest_elsewhere: others
  };
}

// ---- natural events ---------------------------------------------------------------------------

export const EONET_CATEGORIES = ["drought", "dustHaze", "earthquakes", "floods", "landslides", "manmade", "seaLakeIce", "severeStorms", "snow", "tempExtremes", "volcanoes", "waterColor", "wildfires"];

export async function geoNaturalEvents(model, { category = null, days = 30 } = {}) {
  const span = Math.min(90, Math.max(1, Math.round(Number(days) || 30)));
  const cat = category && EONET_CATEGORIES.includes(category) ? category : null;
  const url = `${OPEN_DATA.eonet.eventsUrl}?status=open&days=${span}&limit=200${cat ? `&category=${cat}` : ""}`;
  const r = await getJson(url, "eonet");
  if (r.failed) return fail(r.error);
  const events = (r.json?.events || []).map((e) => {
    const g = (e.geometry || []).slice(-1)[0] || {};
    const pt = pointOf(g.coordinates, g.type);
    return {
      title: e.title,
      category: e.categories?.[0]?.title || e.categories?.[0]?.id || "event",
      latest: g.date ? String(g.date).slice(0, 10) : null,
      lat: pt ? round2(pt[0]) : null,
      lon: pt ? round2(pt[1]) : null,
      magnitude: g.magnitudeValue != null ? `${g.magnitudeValue} ${g.magnitudeUnit || ""}`.trim() : null,
      source_url: e.sources?.[0]?.url || null
    };
  });
  const byCategory = {};
  for (const e of events) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  const near = events
    .filter((e) => e.lat !== null)
    .map((e) => ({ ...e, near_nordwerk: nearNetwork(model, e.lat, e.lon, 250, 4) }))
    .filter((e) => e.near_nordwerk.length)
    .slice(0, 12);
  return {
    source: "NASA EONET v3 open events (live; a reference feed, not an authoritative source)",
    window_days: span,
    category: cat,
    open_events: events.length,
    by_category: byCategory,
    within_250_km_of_nordwerk: near
  };
}

function pointOf(coords, type) {
  if (!Array.isArray(coords)) return null;
  if (type === "Point" && typeof coords[0] === "number") return [coords[1], coords[0]];
  // Polygon: first ring, first vertex.
  let c = coords;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return typeof c?.[0] === "number" ? [c[1], c[0]] : null;
}

// ---- Rhine water level ------------------------------------------------------------------------

export async function geoRhineLevel(model, { station = "KAUB" } = {}) {
  const st = String(station || "KAUB").trim().toUpperCase().replace(/[^A-Z0-9ÄÖÜ_\-. ]/g, "") || "KAUB";
  const base = `${OPEN_DATA.pegel.base}${encodeURIComponent(st)}/W/`;
  const [cur, hist] = await Promise.all([
    getJson(`${base}currentmeasurement.json`, "pegel"),
    getJson(`${base}measurements.json?start=P7D`, "pegel")
  ]);
  if (cur.failed) return fail(cur.error);
  const value = Number(cur.json?.value);
  if (!Number.isFinite(value)) return fail(`PEGELONLINE returned no current value for station ${st}.`);
  const series = Array.isArray(hist.json) ? hist.json.map((m) => Number(m.value)).filter(Number.isFinite) : [];
  const out = {
    source: "PEGELONLINE, German Federal Waterways and Shipping Administration (live)",
    station: st,
    gauge_cm: value,
    measured_at: cur.json.timestamp || null,
    state_vs_mean_water: cur.json.stateMnwMhw || null,
    last_7_days: series.length ? {
      min_cm: Math.min(...series), max_cm: Math.max(...series),
      change_cm: Math.round(series[series.length - 1] - series[0]),
      trend: trendOf(series)
    } : null
  };
  const ref = model.world.reference?.rhine_kaub;
  if (st === "KAUB" && ref) {
    out.estimated_barge_capacity_pct = Math.round(interpolate(ref.capacity_curve, value));
    out.reference_low_water_cm = 77;
    out.note = `${ref.gauge_note} Capacity estimate from the published rule of thumb (${ref.capacity_curve_note.split("(")[1]?.split(")")[0] || "see DATA_SOURCES.md"}); use it for scenario sizing in sim_impact (route disruption at N-KAU, type "capacity").`;
  }
  return out;
}

function trendOf(series) {
  if (series.length < 2) return "unknown";
  const n = Math.min(24, Math.floor(series.length / 4) || 1);
  const head = avg(series.slice(0, n));
  const tail = avg(series.slice(-n));
  const delta = tail - head;
  return delta <= -5 ? "falling" : delta >= 5 ? "rising" : "stable";
}

function interpolate(curve, x) {
  const pts = [...curve].sort((a, b) => a[0] - b[0]);
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

function avg(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function round1(x) { return x === null || x === undefined ? null : Math.round(Number(x) * 10) / 10; }
function round2(x) { return x === null || x === undefined ? null : Math.round(Number(x) * 100) / 100; }

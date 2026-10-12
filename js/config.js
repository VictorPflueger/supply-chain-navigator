// Central configuration. Every value here is documented and verified in TECH_NOTES.md.

export const APP = {
  name: "Navigator",
  fullName: "Supply Chain Disruption Navigator",
  version: "0.2.1-m2",
  milestone: "M2 — app shell and UI"
};

export const ANTHROPIC = {
  messagesUrl: "https://api.anthropic.com/v1/messages",
  modelsUrl: "https://api.anthropic.com/v1/models?limit=100",
  apiVersion: "2023-06-01",
  // Header that enables CORS for direct browser calls (verified by live probe, TECH_NOTES §3).
  browserHeader: "anthropic-dangerous-direct-browser-access",
  webSearchTool: { type: "web_search_20250305", name: "web_search", max_uses: 5 },
  webSearchUsdPer1000: 10,
  consoleKeysUrl: "https://platform.claude.com/settings/keys",
  consoleLimitsUrl: "https://platform.claude.com/settings/limits"
};

// Prices in USD per million tokens (TECH_NOTES §1, verified 12 Oct 2026).
export const MODELS = [
  {
    id: "claude-sonnet-5-5", label: "Sonnet 5.5", hint: "Balanced. Recommended for the demo.",
    effort: "medium", maxTokens: 16000,
    price: { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.1 }
  },
  {
    id: "claude-haiku-5-5", label: "Haiku 5.5", hint: "Fastest and cheapest.",
    effort: "medium", maxTokens: 12000,
    price: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01,
      longPrompt: { thresholdTokens: 100000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 } }
  },
  {
    id: "claude-opus-5-5", label: "Opus 5.5", hint: "Deepest reasoning, highest cost.",
    effort: "high", maxTokens: 16000,
    price: { input: 4.0, output: 20.0, cacheWrite: 5.0, cacheRead: 0.2 }
  }
];
export const DEFAULT_MODEL = "claude-sonnet-5-5";

// ECB reference rate on 12 Oct 2026 (via api.frankfurter.dev). Fixed for a stable cost meter.
export const FX_USD_EUR = 0.894;

export const OPEN_DATA = {
  openMeteo: {
    label: "Open-Meteo (weather)",
    forecastUrl: "https://api.open-meteo.com/v1/forecast",
    probe: "https://api.open-meteo.com/v1/forecast?latitude=51.40&longitude=12.42&daily=precipitation_sum&forecast_days=1&timezone=auto"
  },
  usgs: {
    label: "USGS (earthquakes)",
    feedBase: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/",
    probe: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson"
  },
  eonet: {
    label: "NASA EONET (natural events)",
    eventsUrl: "https://eonet.gsfc.nasa.gov/api/v3/events",
    probe: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1"
  },
  pegel: {
    label: "PEGELONLINE (Rhine at Kaub)",
    base: "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/",
    station: "KAUB",
    stationUuid: "1d26e504-7f9e-480a-b52c-5932be6549ab",
    probe: "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/KAUB/W/currentmeasurement.json"
  }
};

export const BASEMAP = {
  // Optional: a free CARTO basemaps key enables the light Positron raster style (TECH_NOTES §5).
  cartoKey: "",
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    probeTile: "https://tile.openstreetmap.org/4/8/5.png"
  },
  carto: {
    url: "https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key={key}",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
  }
};

// Leaflet: unpkg first, then jsDelivr, then the byte-identical copy in vendor/ (TECH_NOTES §6, D10).
// The same SRI hashes apply to all three sources.
export const LIBS = {
  leaflet: {
    version: "1.9.4",
    integrity: {
      js: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
      css: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
    },
    sources: [
      { label: "unpkg", base: "https://unpkg.com/leaflet@1.9.4/dist/" },
      { label: "jsDelivr", base: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/" },
      { label: "local copy", base: "vendor/leaflet-1.9.4/" }
    ],
    timeoutMs: 7000
  }
};

export const STORAGE = {
  apiKey: "nav.anthropic.key",
  diagnostics: "nav.diag",
  model: "nav.model",
  speed: "nav.speed"
};

export const UI = {
  defaultScenario: "SC-TNG-FIRE",
  networkView: { lat: 46.5, lon: 18.0, zoom: 5 },
  worldView: { lat: 30.0, lon: 60.0, zoom: 3 }
};

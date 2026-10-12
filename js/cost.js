// Cost model for live runs: converts the API's `usage` objects into USD and EUR with the prices
// verified in TECH_NOTES §1. Pure functions, so the cost meter and the tests use the same maths.

import { MODELS, FX_USD_EUR, ANTHROPIC } from "./config.js";

/** Normalised usage with zero defaults. */
export function normalizeUsage(u = {}) {
  return {
    input_tokens: Number(u.input_tokens) || 0,
    output_tokens: Number(u.output_tokens) || 0,
    cache_creation_input_tokens: Number(u.cache_creation_input_tokens) || 0,
    cache_read_input_tokens: Number(u.cache_read_input_tokens) || 0,
    web_search_requests: Number(u.server_tool_use?.web_search_requests ?? u.web_search_requests) || 0
  };
}

/** USD cost of one response. Haiku switches to its long-prompt prices above 100k prompt tokens. */
export function usageCostUsd(modelId, usage) {
  const model = MODELS.find((m) => m.id === modelId) || MODELS[0];
  const u = normalizeUsage(usage);
  const promptTokens = u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
  const long = model.price.longPrompt && promptTokens > model.price.longPrompt.thresholdTokens;
  const p = long ? model.price.longPrompt : model.price;
  const perTok = (usdPerMillion) => usdPerMillion / 1e6;
  return (
    u.input_tokens * perTok(p.input) +
    u.cache_creation_input_tokens * perTok(p.cacheWrite) +
    u.cache_read_input_tokens * perTok(p.cacheRead) +
    u.output_tokens * perTok(p.output) +
    u.web_search_requests * (ANTHROPIC.webSearchUsdPer1000 / 1000)
  );
}

/** Running totals for one run. */
export function createCostTracker(modelId) {
  const totals = {
    usd: 0, input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, web_searches: 0, requests: 0
  };
  return {
    add(usage) {
      const u = normalizeUsage(usage);
      totals.usd += usageCostUsd(modelId, usage);
      totals.input_tokens += u.input_tokens;
      totals.output_tokens += u.output_tokens;
      totals.cache_write_tokens += u.cache_creation_input_tokens;
      totals.cache_read_tokens += u.cache_read_input_tokens;
      totals.web_searches += u.web_search_requests;
      totals.requests += 1;
      return this.snapshot();
    },
    snapshot() {
      return { ...totals, eur: totals.usd * FX_USD_EUR, simulated: false, model: modelId };
    }
  };
}

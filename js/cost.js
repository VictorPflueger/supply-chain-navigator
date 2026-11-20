// Session cost: what a run costs in model fees. A live run measures it from the API's own usage
// figures; a replay estimates what the same run would cost live, from its own words. Part of the
// shell: it prices conversations, whatever they are about.
//
// Prices: Claude Sonnet 5.5 list prices per million tokens and the web-search fee, as published by
// Anthropic and checked on 12 Oct 2026; ECB reference rate of the same day for USD to EUR.

export const MODEL = {
  id: "claude-sonnet-5-5", label: "Sonnet 5.5", effort: "medium", maxTokens: 16000,
  price: { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.1 }
};
export const WEB_SEARCH_USD = 10 / 1000;
export const USD_EUR = 0.894;

// The estimate's assumptions, stated once: about four characters make a token in English text and
// JSON; prompt caching works as the live agent uses it (what was sent before is read from the cache,
// what is new is written to it); the model's hidden reasoning is three times its visible reply, and
// every web search adds about 3,000 tokens of results. The last two are set so that the estimate for
// the Styria scenario matches the one measured live run of it: €0.20 on Sonnet 5.5, 12 Oct 2026
// (DATA_SOURCES.md; tests/figures.mjs keeps the two within 10 %).
export const ESTIMATE = { charsPerToken: 4, reasoningPerVisible: 3, searchTokens: 3000 };

const tokens = (text) => Math.ceil(String(text || "").length / ESTIMATE.charsPerToken);

/** Euros for one response's usage object, as the API reports it. */
export function usageEur(usage = {}) {
  const p = MODEL.price;
  const m = (n, usdPerMillion) => (Number(n) || 0) * usdPerMillion / 1e6;
  const searches = Number(usage.server_tool_use?.web_search_requests ?? usage.web_search_requests) || 0;
  const usd = m(usage.input_tokens, p.input) + m(usage.output_tokens, p.output) +
    m(usage.cache_creation_input_tokens, p.cacheWrite) + m(usage.cache_read_input_tokens, p.cacheRead) +
    searches * WEB_SEARCH_USD;
  return usd * USD_EUR;
}

/** Running total of a live run: add() each response's usage; eur is the measured cost so far. */
export function createMeter() {
  let eur = 0, calls = 0, searches = 0;
  return {
    add(usage) {
      eur += usageEur(usage);
      calls += 1;
      searches += Number(usage?.server_tool_use?.web_search_requests) || 0;
      return { eur, calls, searches, measured: true };
    },
    get: () => ({ eur, calls, searches, measured: true })
  };
}

/**
 * Estimated cost of a conversation run live: prefix is what every request repeats (system prompt
 * and tool definitions); turns are the requests in order, each with the text it adds (the opening
 * message or tool results), the text the model writes (narration and tool calls) and its searches.
 */
export function estimateEur({ prefix, turns }) {
  const p = MODEL.price;
  let cached = 0, usd = 0;
  for (const [i, t] of turns.entries()) {
    const fresh = tokens(t.sent) + (i === 0 ? tokens(prefix) : 0) + (t.searches || 0) * ESTIMATE.searchTokens;
    const written = tokens(t.wrote) * (1 + ESTIMATE.reasoningPerVisible);
    usd += (cached * p.cacheRead + fresh * p.cacheWrite + written * p.output) / 1e6 + (t.searches || 0) * WEB_SEARCH_USD;
    cached += fresh + tokens(t.wrote);
  }
  return usd * USD_EUR;
}

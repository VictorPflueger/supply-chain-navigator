# Navigator: data sources

Navigator uses no data from a user, Detecon or any client. Everything on the page is synthetic, public or computed, and each kind is listed here.

## The company: synthetic

Nordwerk Automotive GmbH is invented: a maker of one electric car, assembled in Leipzig with rear drive units from Győr. Its 57 suppliers and 25 qualified alternative sources, their volumes, prices, stock, purchase orders and contingencies are invented too (`data/world.js`). The places are real cities and industrial clusters, chosen because comparable industry works there; no supplier is modelled on a real company. Any resemblance to one is unintended.

## Places, routes and the map

| What | Source |
|---|---|
| Cities, ports, crossings and corridors | Public geography, accurate to a few kilometres |
| Transit times | Typical published door-to-door times, for example four days by road and ferry from Tangier to Leipzig |
| The map | Natural Earth land and borders (public domain), via the world-atlas package, bundled as `data/basemap_offline.js`; no tile server |

## The precedent for the demo

In March 2022 carmakers ran short of wire harnesses when plants in western Ukraine stopped, and Porsche suspended production at its Leipzig plant (Reuters, 2 March 2022: [Ukraine invasion hampers wire harness supplies for carmakers](https://www.euronews.com/2022/03/02/autos-ukraine-suppliers)). The Tangier fire is fictional; a harness gap stopping a Leipzig line within days is not.

The other five scenarios rest on public events of the same kind:

| Scenario | Precedent |
|---|---|
| Strike at the Port of Rotterdam | Strikes in North-West European ports have repeatedly held up container flows |
| Rhine low water at Kaub | Autumn 2018 (Kaub at 25 cm) cut production on the Upper Rhine; record low water again in 2026 |
| Earthquake near Hsinchu | Taiwan's 1999 and 2024 earthquakes led to fab evacuations and inspections |
| Floods in Styria and Slovenia | The August 2023 floods in Slovenia and Austria hit industrial sites |
| Red Sea rerouting | Since late 2023 carriers have sent Asia to Europe services round the Cape of Good Hope |

## The engine's assumptions

These are modelling choices, stated in every result of the engine (`js/impact.js`):

- A full day of lost output costs Leipzig €1.1M and Győr €350k in contribution margin and fixed costs; a partial shortage is costed in proportion.
- A plant runs at the rate of its scarcest part; stock is today's days of cover, safety stock included.
- Lost output is not caught up after a disruption ends.
- Air freight and spot buys protect safety stock only; surge capacity, alternative sources and contingencies replace lost volume.

## The simulation's evidence

The simulation replays scripts from `data/sim_runs.js` and calls no API. The record queries and the engine run in the page, as in a live run. Its web search results are written for the demo to resemble what a live run finds, carry no links, and are marked "representative" on screen. They make no claim about real events on the day of a demo.

## Session cost

A live run's cost is measured from the usage the API reports for every response: Claude Sonnet 5.5 at its list prices per million tokens (input $2, output $10, cache writes $2.50, cache reads $0.10) and $10 per 1,000 web searches, as Anthropic published them on 12 October 2026, converted at the ECB reference rate of that day, $1 = €0.894.

The first real run, on 12 October 2026, cost €0.20 for the Styria scenario (12 record and engine calls, 2 web searches). The simulation estimates what its own run would cost live from the length of its words and calls, with prompt caching as the live agent uses it, hidden reasoning three times the visible text and about 3,000 tokens per web search; the last two are set so the estimate for Styria matches the measured run, and `tests/figures.mjs` keeps it within 10 %.

## What Navigator does not use

- No data from a user, Detecon or a client, and no personal data.
- No licensed, paywalled or scraped data.
- No service but Claude, and only in a live run on the visitor's own key, which stays in the browser tab.

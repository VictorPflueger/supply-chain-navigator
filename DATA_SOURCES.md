# DATA_SOURCES — what Navigator is built on

Navigator uses **no data from the user or any client**. Everything is one of three things:

1. **Synthetic data.** Invented for this prototype: the fictional company, supplier names, volumes, prices, inventories and purchase orders.
2. **Public reference knowledge.** Real geography, ports, chokepoints, industrial clusters, corridors and published rules of thumb. Each anchor is listed below so it can be checked.
3. **Live open data.** Keyless public APIs and Claude's own server-side web search, called from the presenter's browser at run time.

This file backs the stage claim *"built 100 % on open data"*. Every row says what is real and what is invented.

> **Fictional entities.** Nordwerk Automotive GmbH and all 82 supplier and alternative-source names are invented. Any resemblance to real companies is unintended. Locations are real cities and industrial regions, chosen because comparable industry operates there. No supplier is modelled on a specific real company, and no real company's volumes, prices or inventories are used.

---

## 1. Live data sources (called from the browser at run time)

| Source | Endpoint(s) | Used for | Licence / terms | Notes |
|---|---|---|---|---|
| **Claude web search** (Anthropic, server-side tool `web_search_20250305`) | via `POST https://api.anthropic.com/v1/messages` | Live news and verification of disruption signals | Billed to the user's own API key ($10 per 1,000 searches + tokens) | Runs on Anthropic's servers, so no CORS issue. Admins can disable it per organisation; Navigator then falls back to open APIs and scenario mode |
| **Open-Meteo** forecast API | `https://api.open-meteo.com/v1/forecast` | Rainfall, wind gusts and temperature extremes at plants, suppliers and corridor nodes | Data CC BY 4.0. **Free API is for non-commercial use only** (< 10,000 calls/day) | See caveat 6.1 |
| **USGS** earthquake feeds | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{level}_{period}.geojson` | Recent earthquakes near supplier clusters | U.S. public domain | Updated every minute |
| **NASA EONET v3** | `https://eonet.gsfc.nasa.gov/api/v3/events` | Open natural events: storms, floods, wildfires, volcanoes | Public; NASA states EONET is for visualisation and general reference, not an authoritative source | Navigator always confirms EONET hits with a second source |
| **PEGELONLINE** (German Federal Waterways and Shipping Administration) | `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/KAUB/W/currentmeasurement.json` and `…/measurements.json?start=P7D` | Rhine water level at Kaub (cm) and 7-day trend | DL-DE→Zero-2.0 (free, commercial use allowed); no authentication | Station KAUB, Rhine km 546.23 |

Exact URLs, parameters and response shapes are in `TECH_NOTES.md` §4. CORS is not documented by any of the four open-data providers, so the in-app **Diagnostics** panel tests each one from the presenter's browser. If a call fails, the agent reports it in the console and verifies via web search instead.

## 2. Map and geography

| Layer | Source | Licence / terms |
|---|---|---|
| Default basemap | OpenStreetMap standard tiles, `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, quietened with a CSS filter in the light theme and darkened by one in the dark theme | Data © OpenStreetMap contributors, ODbL; attribution shown on the map. OSMF tile policy: light interactive use with valid Referer, no bulk downloading |
| Optional basemap | CARTO raster tiles from the same host, Positron in the light theme and Dark Matter in the dark one, used only if a free CARTO key is entered in `js/config.js` | Since 25 Sep 2026 CARTO requires a key; free tier 1M requests/month for commercial use. Attribution © OpenStreetMap, © CARTO |
| Offline land layer (always present) | Natural Earth land polygons via the `world-atlas` package, bundled as `data/basemap_offline.js`, drawn in the theme's colours | Natural Earth: public domain |
| Coordinates of cities, ports, airports, passes and chokepoints | Public geography (approximate to ~1–5 km) | — |

Front-end assets are open source as well: Leaflet 1.9.4 (BSD-2-Clause) from public CDNs, with an identical local copy in `vendor/` as a fallback, and Victor Pflüger's design system Vici, copied into `vici/` (`vici/README.md`): its stylesheet, script and tokens (MIT), its fonts Bricolage Grotesque, Inter and JetBrains Mono (SIL Open Font License 1.1), his portrait for the byline and LinkedIn's own logo file. Vici is served from the app itself, so no visitor data goes to a font service.

## 3. The synthetic company — what is invented and what is anchored

### 3.1 Company and plants

| Item | Real or invented | Anchor |
|---|---|---|
| Nordwerk Automotive GmbH, model "NW-e7" | **Invented** | — |
| Leipzig vehicle plant (final assembly, 850 vehicles/day) | Location real; plant and volume **invented** | Leipzig is an established automotive production location in Saxony |
| Győr e-drive plant (850 units/day) | Location real; plant and volume **invented** | Győr is an established automotive and e-drive production location in north-western Hungary |
| Line-stop cost €1.1M/day Leipzig, €350k/day Győr | **Assumption** (stated in `data/world.js`) | Order of magnitude for lost contribution margin of a mid-volume EV line |
| Bill of materials (15 part families), quantities per vehicle | **Invented**, plausible orders of magnitude | E.g. ~80 kWh pack ≈ 192 prismatic cells; ~1.5 kg cathode material per kWh |
| Days of cover (2–45), safety stock, unit values | **Invented** | Deliberately varied (JIS seats 2 days … strategic magnet stock 45 days) so scenarios bite differently |
| 47 open purchase orders | **Invented** | Consistent with the modelled flows; dates are relative to "today" |

### 3.2 Suppliers (57) — fictional names, real cluster locations

Tier 1 delivers to a Nordwerk plant. Tier 2/3 delivers to a tier-1 supplier. "Directed buy" means Nordwerk contracts the material and consigns it to a tier-1 supplier, a common practice for battery materials and semiconductors.

| ID | Fictional name | Tier | Location (real) | Feeds part family | Real cluster anchor |
|---|---|---|---|---|---|
| S-WRO-CELL | Odra Cell Systems Sp. z o.o. | 1 | Wrocław (Biskupice Podgórne), PL | Battery cells | Lower Silesia battery cluster |
| S-DEB-CELL | Puszta Energy Cells Kft. | 1 | Debrecen, HU | Battery cells | Debrecen battery cluster |
| S-GOD-CELL | Göd Battery Works Kft. | 1 | Göd, HU | Battery cells | Budapest–Göd battery cluster |
| S-POH-CAM | Hanbit Cathode Materials Co., Ltd. | 2 (directed buy) | Pohang, KR | Cathode active material | Pohang cathode-materials cluster |
| S-NGB-CAM | Yongjiang Cathode Technology Co., Ltd. | 2 (directed buy) | Ningbo, CN | Cathode active material | Ningbo cathode-materials cluster |
| S-HJV-CAM | Satakunta Cathode Oy | 2 (directed buy) | Harjavalta, FI | Cathode active material | Harjavalta battery-chemicals cluster |
| S-HSC-PSM | Formosa Wide-Bandgap Semiconductor Corp. | 2 (directed buy) | Hsinchu, TW | Power semiconductor modules | Hsinchu Science Park semiconductor cluster |
| S-DRS-PSM | Elbtal Power Semiconductors GmbH | 2 (directed buy) | Dresden, DE | Power semiconductor modules | Silicon Saxony |
| S-VIL-PSM | Kärnten SiC Devices GmbH | 2 (directed buy) | Villach, AT | Power semiconductor modules | Carinthia power-semiconductor cluster |
| S-HSC-MCU | Hsinchu Microcontroller Foundry Corp. | 2 (directed buy) | Hsinchu, TW | Automotive microcontrollers | Hsinchu Science Park semiconductor cluster |
| S-DRS-MCU | Saxon Logic Devices GmbH | 2 (directed buy) | Dresden, DE | Automotive microcontrollers | Silicon Saxony |
| S-CRO-MCU | Dauphiné Embedded Silicon SAS | 2 (directed buy) | Crolles, FR | Automotive microcontrollers | Grenoble–Crolles semiconductor cluster |
| S-REG-ECU | Donau Automotive Electronics GmbH | 1 | Regensburg, DE | Central compute & body ECUs | Eastern Bavaria automotive-electronics cluster |
| S-SIB-ECU | Carpathia Electronics SRL | 1 | Sibiu, RO | Central compute & body ECUs | Transylvania electronics cluster |
| S-TNG-HAR | Tanger Harness Systems SARL | 1 | Tangier (Tanger Automotive City), MA | Main wiring harness sets, Seat sets | Tangier automotive cluster |
| S-TSR-HAR | Banat Cable Systems SRL | 1 | Timișoara, RO | Main wiring harness sets | Western Romania wiring-harness cluster |
| S-SOU-HAR | Sahel Wiring Systems SA | 1 | Sousse, TN | Main wiring harness sets | Sousse–Monastir wiring-harness cluster |
| S-HAT-INV | Pannonia Power Electronics Kft. | 1 | Hatvan, HU | Traction inverters | Hatvan power-electronics cluster |
| S-NUE-INV | Franken Drive Electronics GmbH | 1 | Nuremberg, DE | Traction inverters | Nuremberg drive-electronics cluster |
| S-BAO-MAG | Baotou Rare Earth Magnetics Co., Ltd. | 1 | Baotou, CN | E-motor magnets | Baotou rare-earth cluster |
| S-NGB-MAG | Ningbo Permanent Magnet Co., Ltd. | 1 | Ningbo, CN | E-motor magnets | Ningbo magnet cluster |
| S-NAR-MAG | Narva Rare Earth Magnets OÜ | 1 | Narva, EE | E-motor magnets | Narva rare-earth magnet plant (EU) |
| S-BRE-CAST | Val Trompia Fonderie S.p.A. | 1 | Brescia, IT | Aluminium structural castings | Brescia die-casting cluster |
| S-SLB-CAST | Štajerska Lightmetal d.o.o. | 1 | Slovenska Bistrica, SI | Aluminium structural castings | Styria–Slovenia light-metal cluster |
| S-MBO-SEAT | Iser Seating Systems s.r.o. | 1 | Mladá Boleslav, CZ | Seat sets | Mladá Boleslav automotive cluster |
| S-TEP-GLS | Teplice Float & Auto Glass a.s. | 1 | Teplice, CZ | Automotive glass | North Bohemia glass cluster |
| S-HZR-GLS | Wurmtal Automotive Glazing GmbH | 1 | Herzogenrath, DE | Automotive glass | Aachen glass cluster |
| S-RAC-TYR | Duna Tyre Manufacturing Kft. | 1 | Rácalmás, HU | Tyres | Dunaújváros tyre cluster |
| S-KAR-TYR | Oberrhein Reifenwerke GmbH | 1 | Karlsruhe, DE | Tyres | Upper Rhine tyre & rubber cluster |
| S-RAY-TYR | Rayong Radial Tyre Co., Ltd. | 1 | Rayong, TH | Tyres | Eastern Seaboard tyre cluster |
| S-FRA-BRK | Rhein-Main Bremsensysteme GmbH | 1 | Frankfurt am Main, DE | Brake systems | Rhine-Main brake-systems cluster |
| S-CZW-BRK | Częstochowa Brake Technology Sp. z o.o. | 1 | Częstochowa, PL | Brake systems | Silesia brake & chassis cluster |
| S-TNN-DSP | Tainan Display Technologies Corp. | 1 | Tainan, TW | Displays | Southern Taiwan Science Park display cluster |
| S-HFE-DSP | Hefei Optoelectronics Co., Ltd. | 1 | Hefei, CN | Displays | Hefei display cluster |
| S-WTZ-DSP | Lahn Display Modules GmbH | 1 | Wetzlar, DE | Displays | Lahn–Dill optics cluster |
| S-DGO-SEP | Silesia Separator Films Sp. z o.o. | 2 | Dąbrowa Górnicza, PL | Battery cells | Silesia battery-materials cluster |
| S-ULQ-ANO | Ulanqab Graphite Anode Materials Co., Ltd. | 2 | Ulanqab, CN | Battery cells | Inner Mongolia graphite cluster |
| S-LUD-ELY | Rhein-Neckar Elektrolyt GmbH | 2 | Ludwigshafen, DE | Battery cells | Ludwigshafen chemical park |
| S-BOT-SOL | Botlek Solvents B.V. | 3 | Rotterdam (Botlek), NL | Battery cells | Rotterdam-Botlek chemical cluster |
| S-HET-CU | Mansfelder Kupferdraht GmbH | 2 | Hettstedt, DE | Main wiring harness sets | Mansfeld copper region |
| S-BEN-CON | Bergstraße Steckverbinder GmbH | 2 | Bensheim, DE | Main wiring harness sets | Bergstraße connector cluster |
| S-KEN-TRM | Kénitra Terminals SARL | 2 | Kénitra, MA | Main wiring harness sets | Kénitra Atlantic Free Zone |
| S-TAO-PCB | Taoyuan Circuit Boards Co., Ltd. | 2 | Taoyuan, TW | Central compute & body ECUs | Taoyuan PCB cluster |
| S-KID-ALY | Drava Alloy Refining d.o.o. | 2 | Kidričevo, SI | Aluminium structural castings | Drava valley aluminium cluster |
| S-LEO-HTR | Mur Heat Treatment GmbH | 2 | Leoben, AT | Aluminium structural castings | Upper Styria metalworking cluster |
| S-RAV-FRG | Koroška Precision Forging d.o.o. | 2 | Ravne na Koroškem, SI | Brake systems | Koroška steel & forging cluster |
| S-BRE-ALY | Lombardia Leghe Leggere S.r.l. | 2 | Brescia, IT | Aluminium structural castings | Brescia secondary-aluminium cluster |
| S-LIB-FOA | Liberec Foam & Trim s.r.o. | 2 | Liberec, CZ | Seat sets | Liberec automotive-textiles cluster |
| S-UST-MEC | Labe Seat Mechanisms a.s. | 2 | Ústí nad Labem, CZ | Seat sets | Ústí engineering cluster |
| S-SGK-NR | Songkhla Natural Rubber Co., Ltd. | 2 | Songkhla, TH | Tyres | Southern Thailand natural-rubber belt |
| S-SKO-SR | Saale Synthesekautschuk GmbH | 2 | Schkopau, DE | Tyres | Central German chemical triangle |
| S-COI-CAL | Coimbatore Precision Castings Pvt. Ltd. | 2 | Coimbatore, IN | Brake systems | Coimbatore foundry cluster |
| S-KUA-REE | Kuantan Rare Earth Processing Sdn. Bhd. | 2 | Kuantan (Gebeng), MY | E-motor magnets | Gebeng industrial estate |
| S-ERL-SUB | Erlangen Crystal Substrates GmbH | 2 | Erlangen, DE | Power semiconductor modules | Erlangen–Nuremberg SiC materials cluster |
| S-DUC-FLT | Bohemia Float Glass s.r.o. | 2 | Duchcov, CZ | Automotive glass | North Bohemia glass cluster |
| S-ZHB-DDI | Zhubei Display Driver Semiconductor Corp. | 2 | Zhubei (Hsinchu County), TW | Displays | Hsinchu County IC-design & back-end cluster |
| S-MOS-CAP | Pannon Capacitor Kft. | 2 | Mosonmagyaróvár, HU | Traction inverters | Western Hungary electronics cluster |

### 3.3 Cluster anchors — why each location is plausible

The anchors are public, general knowledge and can be checked in any encyclopaedia or regional investment-agency source.

| Cluster | Public anchor |
|---|---|
| Lower Silesia (Wrocław area), Debrecen, Göd | Large lithium-ion cell plants operate or are being built in all three; Poland and Hungary are Europe's main cell-manufacturing countries |
| Pohang; Ningbo; Harjavalta | Korean cathode-materials hub; Chinese cathode and NdFeB magnet manufacturing hub; Finnish battery-chemicals cluster |
| Hsinchu Science Park; Zhubei; Taoyuan | Core of Taiwan's semiconductor manufacturing; IC-design and back-end cluster; major PCB manufacturing area |
| Silicon Saxony (Dresden); Villach; Crolles/Grenoble; Erlangen–Nuremberg | Europe's largest microelectronics cluster; power-semiconductor (incl. SiC) manufacturing in Carinthia; French semiconductor fabs; SiC substrate and power-electronics know-how in Franconia |
| Regensburg; Sibiu; Hatvan; Nuremberg; Mosonmagyaróvár | Established automotive-electronics and drive-electronics locations |
| Tanger Automotive City and Kénitra (Morocco); Timișoara (Romania); Sousse–Monastir (Tunisia) | Morocco, Romania and Tunisia are among Europe's largest wiring-harness sourcing countries; both Moroccan sites are automotive free zones |
| Baotou; Ulanqab (Inner Mongolia); Narva; Gebeng (Kuantan) | China's rare-earth centre; graphite-anode processing region; EU rare-earth magnet plant; one of the largest rare-earth processing sites outside China |
| Brescia; Slovenska Bistrica, Kidričevo, Ravne na Koroškem; Leoben | Italy's die-casting cluster; Slovenia's aluminium and steel/forging industry along the Drava and Meža valleys; Upper Styria metalworking |
| Mladá Boleslav, Liberec, Ústí nad Labem | Czech automotive cluster with seat, textile and mechanism suppliers |
| Teplice, Duchcov; Herzogenrath | North Bohemian flat-glass industry; automotive glass near Aachen |
| Rácalmás/Dunaújváros; Karlsruhe; Rayong; Songkhla; Schkopau | Hungarian tyre manufacturing; tyre plant on the Upper Rhine; Thailand's Eastern Seaboard auto-parts cluster; southern Thailand's natural-rubber belt; synthetic rubber in Saxony-Anhalt's chemical triangle |
| Frankfurt (Rhine-Main); Częstochowa; Coimbatore | Brake-systems engineering and production; Polish chassis components; Indian foundry cluster |
| Tainan; Hefei; Wetzlar | Southern Taiwan display-panel cluster; Chinese display-panel fabs; German optics cluster (Lahn–Dill) |
| Ludwigshafen; Rotterdam-Botlek | Europe's largest integrated chemical site on the Upper Rhine; Rotterdam's petrochemical cluster. Rhine barges supply Ludwigshafen |
| Hettstedt; Bensheim | Copper processing in the Mansfeld region; connector manufacturing on the Bergstraße |

### 3.4 Qualified alternative sources (25) — fictional, not active

| ID | Fictional name | Location (real) | Part family | Qualification | Premium |
|---|---|---|---|---|---|
| A-SZG-CELL | Leine Cell Manufacturing GmbH | Salzgitter, DE | Battery cells | 120 days | +8 % |
| A-CZX-CELL | Changzhou Prismatic Power Co., Ltd. | Changzhou, CN | Battery cells | 75 days | +3 % |
| A-NYS-CAM | Nysa Cathode Materials Sp. z o.o. | Nysa, PL | Cathode active material | 90 days | +6 % |
| A-SWZ-CAM | Lausitz Battery Materials GmbH | Schwarzheide, DE | Cathode active material | 75 days | +9 % |
| A-CTA-PSM | Etna SiC Microsystems S.r.l. | Catania, IT | Power semiconductor modules | 60 days | +12 % |
| A-KUL-PSM | Kedah Power Devices Sdn. Bhd. | Kulim, MY | Power semiconductor modules | 75 days | +6 % |
| A-NIJ-MCU | Waal Microcontrollers B.V. | Nijmegen, NL | Automotive microcontrollers | 21 days | +8 % |
| A-KMM-MCU | Kumamoto Semiconductor Manufacturing Co. | Kikuyo (Kumamoto), JP | Automotive microcontrollers | 90 days | +5 % |
| A-BRN-ECU | Brno Embedded Systems s.r.o. | Brno, CZ | Central compute & body ECUs | 60 days | +9 % |
| A-PEN-ECU | Penang EMS Sdn. Bhd. | Penang, MY | Central compute & body ECUs | 90 days | +4 % |
| A-KEN-HAR | Atlantic Wiring Kénitra SARL | Kénitra, MA | Main wiring harness sets | 14 days | +7 % |
| A-BIS-HAR | Someș Harness SRL | Bistrița, RO | Main wiring harness sets | 35 days | +5 % |
| A-GLW-INV | Silesia Inverter Systems Sp. z o.o. | Gliwice, PL | Traction inverters | 75 days | +10 % |
| A-HAN-MAG | Main-Kinzig Magnetics GmbH | Hanau, DE | E-motor magnets | 90 days | +18 % |
| A-ECH-MAG | Echizen Magnet Works Co., Ltd. | Echizen, JP | E-motor magnets | 60 days | +12 % |
| A-GRL-CAST | Lausitz Druckguss GmbH | Görlitz, DE | Aluminium structural castings | 70 days | +15 % |
| A-OST-CAST | Moravia Light Metal a.s. | Ostrava, CZ | Aluminium structural castings | 45 days | +11 % |
| A-ZWI-SEAT | Westsachsen Sitzsysteme GmbH | Zwickau, DE | Seat sets | 30 days | +11 % |
| A-ORO-GLS | Orosháza Auto Glass Zrt. | Orosháza, HU | Automotive glass | 45 days | +6 % |
| A-KRA-TYR | Gorenjska Tyre Works d.o.o. | Kranj, SI | Tyres | 30 days | +5 % |
| A-POZ-TYR | Wielkopolska Opony Sp. z o.o. | Poznań, PL | Tyres | 30 days | +4 % |
| A-JIH-BRK | Vysočina Brake Components s.r.o. | Jihlava, CZ | Brake systems | 60 days | +7 % |
| A-HWS-DSP | Hwaseong Display Co., Ltd. | Hwaseong, KR | Displays | 60 days | +5 % |
| A-BAB-DSP | Babenhausen Cockpit Electronics GmbH | Babenhausen, DE | Displays | 45 days | +14 % |
| A-SWF-EDU | Mainfranken E-Axle GmbH | Schweinfurt, DE | Rear e-drive units | 150 days | +22 % |

## 4. Logistics network — real nodes and corridors

### 4.1 Nodes (75)

| ID | Node (real) | Type | Country |
|---|---|---|---|
| N-RTM | Port of Rotterdam (Maasvlakte) | port | NL |
| N-BOT | Rotterdam-Botlek chemical terminals | port | NL |
| N-ANR | Port of Antwerp-Bruges | port | BE |
| N-HAM | Port of Hamburg | port | DE |
| N-KOP | Port of Koper | port | SI |
| N-TRS | Port of Trieste | port | IT |
| N-GOA | Port of Genoa | port | IT |
| N-RAD | Port of Radès (Tunis) | port | TN |
| N-TME | Tanger Med port | port | MA |
| N-ALG | Port of Algeciras | port | ES |
| N-PUS | Port of Busan | port | KR |
| N-NGB | Port of Ningbo-Zhoushan | port | CN |
| N-KHH | Port of Kaohsiung | port | TW |
| N-LCB | Port of Laem Chabang | port | TH |
| N-SGZ | Port of Songkhla | port | TH |
| N-COK | Port of Kochi | port | IN |
| N-KUA | Port of Kuantan | port | MY |
| N-MUG | Port of Muuga (Tallinn) | port | EE |
| N-RAU | Port of Rauma | port | FI |
| N-ROS | Port of Rostock | port | DE |
| N-DUI | Duisburg inland port (duisport) | hub | DE |
| N-KAU | Kaub — Middle Rhine bottleneck (gauge KAUB) | waterway | DE |
| N-FRH | Frankfurt Osthafen (Main) | port | DE |
| N-LUH | Ludwigshafen/Mannheim Rhine ports | port | DE |
| N-KAR | Karlsruhe Rheinhafen | port | DE |
| N-SIN | Singapore Strait | chokepoint | SG |
| N-BAB | Bab-el-Mandeb Strait (Red Sea entrance) | chokepoint | YE/DJ |
| N-SUZ | Suez Canal | chokepoint | EG |
| N-GIB | Strait of Gibraltar | chokepoint | ES/MA |
| N-CPT | Cape of Good Hope | chokepoint | ZA |
| N-TPE | Taipei Taoyuan International Airport | airport | TW |
| N-LEJ | Leipzig/Halle Airport (air-cargo hub) | airport | DE |
| N-BUD | Budapest Ferenc Liszt Airport | airport | HU |
| N-HFR | Hefei rail freight terminal | rail | CN |
| N-BTR | Baotou rail freight terminal | rail | CN |
| N-ULR | Ulanqab rail freight terminal | rail | CN |
| N-LZH | Lanzhou rail junction | rail | CN |
| N-ALA | Alashankou–Dostyk border crossing | rail | CN/KZ |
| N-MAL | Małaszewicze EU rail gateway | rail | PL |
| N-BRN | Brenner Pass | pass | AT/IT |
| N-PYH | Pyhrn motorway corridor (A9) | pass | AT |
| N-GOT | Gotthard road tunnel | pass | CH |
| N-DRE | Dresden motorway hub | hub | DE |
| N-PRG | Prague ring | hub | CZ |
| N-BTS | Bratislava | hub | SK |
| N-BDP | Budapest M0 ring | hub | HU |
| N-GYR | Győr (M1 motorway) | hub | HU |
| N-VIE | Vienna | hub | AT |
| N-NUE | Nuremberg motorway hub | hub | DE |
| N-HOF | Hof (A9/A72) | hub | DE |
| N-ERF | Erfurt (A4/A71) | hub | DE |
| N-GIE | Gießen (A45/A5) | hub | DE |
| N-COL | Cologne motorway ring | hub | DE |
| N-PAR | Paris (A86 ring) | hub | FR |
| N-IRN | Irun–Hendaye border | border | ES/FR |
| N-BAS | Basel | hub | CH |
| N-VRN | Verona | hub | IT |
| N-MUC | Munich | hub | DE |
| N-GRZ | Graz | hub | AT |
| N-LNZ | Linz | hub | AT |
| N-PAS | Passau | hub | DE |
| N-REG | Regensburg | hub | DE |
| N-WRO | Wrocław (A4) | hub | PL |
| N-GRL | Görlitz border crossing | border | DE/PL |
| N-KTW | Katowice | hub | PL |
| N-ARD | Arad | hub | RO |
| N-SZG | Szeged | hub | HU |
| N-BRO | Brno | hub | CZ |
| N-UST | Ústí nad Labem | hub | CZ |
| N-WAW | Warsaw | hub | PL |
| N-RIX | Riga | hub | LV |
| N-KUN | Kaunas | hub | LT |
| N-OST | Ostrava | hub | CZ |
| N-GVA | Geneva | hub | CH |
| N-STR | Stuttgart | hub | DE |

### 4.2 Corridors (33) and normal transit times

| ID | Corridor | Mode | Normal transit (days) |
|---|---|---|---|
| R-SEA-KR-RTM-CE | Korea – Suez – Rotterdam – rail to Central Europe | sea | 33 |
| R-SEA-CN-HAM-CE | Ningbo – Suez – Hamburg – rail to Central Europe | sea | 32 |
| R-SEA-TW-RTM-LEJ | Kaohsiung – Suez – Rotterdam – rail to Leipzig | sea | 28 |
| R-SEA-TH-RTM-LEJ | Laem Chabang – Suez – Rotterdam – rail to Leipzig | sea | 26 |
| R-SEA-TH-RHINE-KAR | Songkhla – Suez – Rotterdam – Rhine barge (via Kaub) – Karlsruhe | sea+barge | 29 |
| R-SEA-IN-RHINE-FRA | Kochi – Suez – Rotterdam – Rhine/Main barge (via Kaub) – Frankfurt | sea+barge | 23 |
| R-SEA-MY-RTM-MUG | Kuantan – Suez – Rotterdam – Baltic feeder – Muuga | sea | 27 |
| R-SEA-CN-KOP-GYR | Ningbo – Suez – Koper – rail to Győr | sea | 25 |
| R-BARGE-BOT-LUH | Rhine tank barge Rotterdam-Botlek – Duisburg – Kaub – Ludwigshafen | barge | 5 |
| R-RAIL-CN-LEJ | China–Europe rail: Hefei – Alashankou – Małaszewicze – Leipzig | rail | 18 |
| R-RAIL-CN-GYR | China–Europe rail: Baotou – Alashankou – Małaszewicze – Győr | rail | 19 |
| R-RAIL-CN-CE | China–Europe rail: Ulanqab – Alashankou – Małaszewicze – Central Europe | rail | 19 |
| R-AIR-TW-LEJ | Air freight Taipei – Leipzig/Halle | air | 4 |
| R-AIR-TW-BUD | Air freight Taipei – Budapest | air | 4 |
| R-RD-TNG-LEJ | Tangier – Strait ferry – Spain – France – Leipzig (road) | road | 4 |
| R-RD-SOU-LEJ | Sousse – Radès – ferry to Genoa – Gotthard – Leipzig | road | 4 |
| R-RD-ALP-LEJ | Trans-Alpine road via Brenner: Verona – Munich – Nuremberg – Leipzig | road | 2 |
| R-RD-SI-LEJ | Pyhrn corridor: Graz – Linz – Passau – Regensburg – Leipzig | road | 2 |
| R-RD-CE-LEJ | Central Europe corridor: Budapest – Győr – Bratislava – Brno – Prague – Dresden – Leipzig | road | 2 |
| R-RD-RO-LEJ | Romania – Hungary – Central Europe corridor to Leipzig | road | 2 |
| R-RD-PL-LEJ | A4 corridor: Katowice – Wrocław – Görlitz – Dresden – Leipzig | road | 1 |
| R-RD-CZ-LEJ | D8/A17: Prague – Ústí – Dresden – Leipzig | road | 1 |
| R-RD-DE-W | A45/A4 west: Cologne – Gießen – Erfurt – Leipzig | road | 1 |
| R-RD-DE-S | A93/A9 south: Regensburg – Hof – Leipzig | road | 1 |
| R-RD-HU-GYR | M3/M1: Hatvan – Budapest – Győr | road | 1 |
| R-RD-DE-HU | Danube corridor: Nuremberg – Regensburg – Passau – Linz – Vienna – Győr | road | 1 |
| R-RD-BALT-GYR | Via Baltica: Riga – Kaunas – Warsaw – Katowice – Ostrava – Bratislava – Győr | road | 2.5 |
| R-FERRY-FI-CE | Finland – Rauma–Rostock ferry – Central Europe | ferry | 3.5 |
| R-RD-FR-DE | Grenoble – Geneva – Basel – Stuttgart – Nuremberg | road | 1.75 |
| R-REG-EU | European regional road network (short-haul) | road | per flow |
| R-REG-MA | Northern Morocco regional road | road | per flow |
| R-REG-TW | Taiwan domestic road | road | per flow |
| R-REG-ASIA | Intra-Asia feeder (sea/air) | sea | per flow |

Sea-lane polylines follow the real shipping lanes (Malacca Strait – south of Sri Lanka – Gulf of Aden – Red Sea – Suez – Mediterranean – Gibraltar – Bay of Biscay – English Channel). Waypoints are approximate and for display only.

### 4.3 Published reference figures used in the model

| Figure | Value used | Public anchor |
|---|---|---|
| Asia → North Europe sea transit via Suez | 26–34 days door-to-door, depending on origin | Typical published liner schedules |
| Red Sea avoidance via the Cape of Good Hope | **+12 days** (published range 10–14) | Widely reported since carriers began re-routing in late 2023 |
| China–Europe rail transit | 18–19 days | Commonly quoted 16–20 days. Northern corridor via Kazakhstan, Russia and Belarus, EU entry at Małaszewicze; Middle Corridor (Trans-Caspian) as alternative, +9 days assumed |
| Rhine barge Rotterdam → Duisburg → Kaub → Upper Rhine | 2 + 2 + 1–2 days | Typical upstream barge times |
| Kaub reference low-water level | **77 cm** (GlW/EWL 2022, valid 2023–2031); industry still often quotes **78 cm** | River-level reference: riversat (EarthDaily), "Interpreting river levels — Rhine" |
| Kaub gauge vs. fairway depth | depth ≈ gauge − 77 cm + 190 cm; 16 cm ≈ 1.29 m | Same source; consistent with ZDFheute, 11 Aug 2026 |
| Barge capacity vs. Kaub gauge | ~50 % at 135 cm, ~25 % at 75 cm, ~16 % at 55 cm, impractical below 40 cm; no legal low-water ban | Same source (rule of thumb). Used as an illustrative curve in `data/world.js` → `reference.rhine_kaub` |
| Previous Kaub record low | 25 cm (22 Oct 2018); broken in 2026 (16 cm in Aug 2026; single-digit and negative raw readings in Oct 2026) | ZDFheute, 11 Aug 2026; PEGELONLINE raw data (see `TECH_NOTES.md` §4) |
| Air-freight lead time Taiwan → Central Europe | 4 days door-to-door | Typical booking + flight + customs |
| Wiring-harness road transit Tangier → Leipzig | 4 days (Tanger Med – Algeciras ferry, road via Spain and France) | Typical North Africa – Germany road-ferry times |

### 4.4 Precedents behind the six scenarios

| # | Scenario | Real-world precedent (public) |
|---|---|---|
| 1 | Container terminal strike, Port of Rotterdam | Port and dockworker strikes in North-West European ports have repeatedly disrupted container flows |
| 2 | Rhine low water at Kaub | Autumn 2018 low water (Kaub 25 cm) forced industrial production cuts on the Upper Rhine; record low water again in 2026 |
| 3 | M6.4 earthquake near Hsinchu | Taiwan's 1999 Chi-Chi and 2024 Hualien earthquakes caused fab evacuations and inspections |
| 4 | Flooding in the Slovenian/Styrian castings region | August 2023 floods in Slovenia (incl. the Koroška/Meža valley) and Austria hit industrial sites |
| 5 | Red Sea security situation → Cape re-routing | Since late 2023 major carriers have re-routed Asia–Europe services via the Cape of Good Hope |
| 6 | Fire at the Tangier harness plant | Fires at single-source automotive suppliers have repeatedly stopped OEM lines; harness production is highly concentrated in North Africa and Eastern Europe |

The scenario files only seed an **unverified trigger**. In Live mode the agent must confirm or refute it with live sources. If the trigger is a hypothetical exercise and nothing confirms it, the agent says so and labels the analysis as a what-if.

### 4.5 Evidence shown in Simulation mode

Simulation mode replays a script from `data/sim_runs.js`; it calls no API and no model.

| Element | Where it comes from | How it is labelled |
|---|---|---|
| ERP answers (suppliers, parts, orders, routes, alternatives) | The synthetic world, queried at playback by the same functions the live agent uses | As in Live mode |
| € figures, line-stop days and dates | The deterministic impact engine at playback; scripts contain placeholders, never typed numbers | "Figures calculated by the impact engine from the synthetic world" |
| Web-search results and open-data readings in the six authored scripts | Written for the demo to resemble what a live run finds; no URLs, no real articles | "(representative)" on every source and reading, plus the SIMULATION badge and console watermark |
| Web-search results and open-data readings in a recorded script | Captured from a real live run with "Save run as simulation" | "(recorded <date>)"; the watermark names the recording date and model |

The representative results describe plausible events. They are not claims about real events on the day of the demo.

## 5. Model assumptions (deterministic impact engine)

These are modelling choices, not data. They are stated in every `sim_impact` result.

- Line-stop cost: Leipzig €1.1M/day and Győr €350k/day. Partial shortages are costed pro rata as stop-equivalent days.
- A plant runs at the rate of its scarcest part. Inventory is today's days of cover.
- No backlog catch-up after a disruption ends (conservative).
- Expediting (air freight, spot buys) buys only what protects safety stock. Surge capacity, alternative sources and contingencies replace lost volume.
- Surge capacities, qualification lead times, cost premiums and contingency costs are invented but plausible.

## 6. Caveats to mention when presenting

1. **Open-Meteo terms.** The free API is for non-commercial use. Showing the prototype internally at very low volume is low-risk, but a client-facing or commercial deployment should use an Open-Meteo API subscription or a different open weather source.
2. **OpenStreetMap tiles** are a donated community service. Navigator only loads tiles for the visible map; never use the app for bulk tile downloading.
3. **NASA EONET** is a reference feed, not an authoritative source. Navigator always confirms it with a second source.
4. **Web search results** come from the open web at run time. Navigator cites them in the console and never treats a single source as confirmation.
5. **Real-world events.** The Rhine low-water crisis in autumn 2026 is real (PEGELONLINE, German media). Nordwerk's exposure to it is fictional.
6. **Simulation evidence.** In Simulation mode, news headlines and sensor readings are representative or recorded (section 4.5). Present them as a replay, not as today's news.

## 7. What Navigator does **not** use

- No data supplied by the user, Detecon or any client.
- No proprietary, licensed or paywalled datasets.
- No scraping. Live information comes only from the APIs above and Claude's web search tool.
- No personal data. The only secret is the user's own Anthropic API key, held in `sessionStorage` for the current tab and sent only to `api.anthropic.com`.

# Capital Fluere: Independent Due-Diligence Audit

**Audit date:** 6 September 2026  
**Subject:** Capital Fluere terminal, FLUERE TERMINAL LTD, its public data architecture, and the linked Fluere Fund page  
**Decision question:** Is this a scam, how can it cost 4.99 per month, what data does it use, and how does it compare with Bloomberg?  
**Evidence standard:** Public, reproducible evidence only. No account was purchased, no private system was accessed, and no representation from the company was treated as independently verified.

> **Bottom line:** The evidence does not support calling the Capital Fluere terminal a proven scam. It supports a more precise conclusion: this is a real, functioning, extremely young retail dashboard whose low price is technically plausible because it combines a narrow commercial data core with free public data, delayed/free embeds, cached headline links, static curated datasets, and browser-side calculations. Its broad Bloomberg and hedge-fund equivalence claims are not supported. The largest unresolved risks are data redistribution rights, data quality, business continuity, security maturity, and the opaque separate Fluere Fund page.

## Executive verdict

### The short answer

Capital Fluere is operated by an identifiable UK company, FLUERE TERMINAL LTD (company 17324799). Companies House records two identity-verified directors and beneficial owners, Ned Talli Fitzgerald Neylon and Ben Setyo Obermeyer. The company and its technical backend are real. The public dashboard code contains substantial working product logic, its protected data routes reject unauthenticated requests, and its public news endpoint was live during this audit. These points weigh against a simple fake-site or card-harvesting theory. [S1] [S7] [S8] [S9] [S10]

That is not the same as saying the product is proven, reliable, or Bloomberg-equivalent. The company was incorporated only on 7 July 2026, its domain was registered on 9 February 2026, it has filed no accounts, its initial share capital was GBP 2, it has almost no independent reputation, and the founders' public profiles do not show prior institutional market-data or regulated-finance employment. Youth and a home-based startup are not fraud indicators by themselves; they do mean there is almost no operating history to underwrite the claims. [S7] [S11] [S12] [S13] [S14]

The most important technical finding is that the terminal is not mysterious. Its publicly delivered dashboard source names or identifies the principal building blocks. Selected US-equity quotes, charts, company metrics, analyst data, estimates and news use Finnhub-backed routes. Many global, foreign-equity, FX, crypto, calendar and chart views use TradingView widgets. Non-US fallback charts are labelled Yahoo end-of-day in the source. Filings and fundamentals use SEC EDGAR/XBRL plus vendor data. Macro data comes from FRED and related official sources. Energy uses EIA; positioning uses CFTC and SEC filings; maps use NASA FIRMS, GDELT, Natural Earth, WRI and US government sources; shipping uses IMF PortWatch; prediction panels use public Polymarket and sometimes Kalshi; several physical-economy datasets are curated, approximate reference tables. [S4] [S15] [S16] [S17] [S18] [S20] [S21] [S22] [S23]

This architecture explains both the breadth and the price. Many panels are different views over the same few upstreams. Public data can be free. TradingView widgets arrive with data and can be embedded with little engineering. A single upstream stream can be pooled and fanned out through Cloudflare. Quantitative calculators such as DCF, Black-Scholes, VaR, GARCH and regressions are inexpensive calculations performed in the browser. Capital Fluere has no Bloomberg-scale newsroom, security master, identifier system, professional messaging network, broker network, global support organization, entitlement operation, or disclosed service-level commitment. [S4] [S18] [S24] [S25] [S26] [S27]

The marketing is materially too broad. The homepage says "real-time market data," "streamed, not refreshed," and promotes 9+ wires. Its own code and help text distinguish live US-equity trade panels from roughly 20-minute heatmaps, hourly screeners, end-of-day non-US history, delayed TradingView equity widgets, weekly CFTC reports, quarterly 13F disclosures, and static approximations. The terms explicitly say third-party data can be delayed or inaccurate and carry no accuracy, completeness, timeliness, availability or uptime warranty. [S1] [S3] [S4] [S16] [S18] [S21]

### Decision matrix

| Decision | Judgment | Practical meaning |
|---|---|---|
| Is the terminal a proven scam? | **No evidence sufficient to say that** | There is a real company, named owners, a real product codebase and functioning services. |
| Is it Bloomberg-equivalent? | **No** | Similar-looking panels do not provide Bloomberg's breadth, rights, quality controls, proprietary content, network, workflow or support. |
| Is 4.99/month economically possible? | **Yes, technically** | Public data, free embeds, caching, pooled streams and client-side computation radically reduce cost. Sustainability still cannot be verified without contracts, subscriber numbers and accounts. |
| Is the data safe as a sole trading source? | **No** | Coverage, latency, correction policy, entitlements and quality are insufficiently disclosed; some internal datasets are explicitly approximate or unchecked. |
| Is a low-value monthly trial reasonable? | **Conditionally** | Treat it as an experimental dashboard, pay through Stripe/card, use the trial, avoid sensitive data, and verify every material figure elsewhere. |
| Should anyone send capital to "Fluere Fund" now? | **No** | Stop until the legal vehicle, manager, regulatory basis, custodian, administrator, auditor and offering documents are independently verified. |

### Risk rating

| Risk area | Rating | Evidence-based reason |
|---|---|---|
| Classic payment scam risk for a 4.99 subscription | Low to medium | Identifiable operator and real backend reduce risk; age, lack of reviews and auto-renewal increase uncertainty. |
| Marketing / expectation risk | High | Blanket institutional and real-time positioning conflicts with documented panel-level limitations and contractual disclaimers. |
| Data accuracy / trading reliance | High | No SLA, incomplete provenance in public pages, delayed/static feeds, approximations, and explicit unvalidated datasets. |
| Data licensing / continuity | High uncertainty | Finnhub use is clear; written commercial redistribution approval is not public. A private agreement may exist. |
| Cybersecurity / privacy | Medium | Sensible baseline controls are visible, but no independent assurance, no CSP observed, and sensitive community content is not end-to-end encrypted. |
| Counterparty / financial resilience | High | Two-month-old company, GBP 2 initial capital, no accounts, no disclosed funding or customer base. |
| Fluere Fund / investment capital | High - stop | Material legal, regulatory, custody and disclosure facts are absent. |

## 1. Scope, method, and limits

This audit used five evidence lanes:

- First-party pages: homepage, architecture, pricing, terms, privacy, impressum, dashboard source and fund subdomain.
- Public technical inspection: passive review of HTML/JavaScript, HTTP headers, documented routes, public API responses and unauthenticated access controls. No bypass, exploit, account creation or paid access was attempted.
- Authoritative registries: Companies House, Verisign RDAP, FCA Register and ICO fee-payer register.
- Upstream documentation: Finnhub, TradingView, SEC, CFTC, FRED, NASA and public procurement records.
- Independent footprint checks: targeted searches for press, customer reviews, litigation, regulator warnings, archived versions, public repositories and founder employment history.

The investigation was performed as a snapshot on 6 September 2026. Web content, pricing, company filings and register results can change. Negative searches mean "not found in the sources checked," not "does not exist."

The central unresolved items cannot be proved from public evidence: Capital Fluere's private Finnhub or exchange licence, actual vendor invoices, subscriber count, cash runway, production architecture behind the Worker, paid-panel performance, internal data tests, external security assessments, and the legal nature of Fluere Fund. Those are not minor omissions; they are the documents required to convert plausible explanations into verified conclusions.

## 2. Who is behind Capital Fluere?

### 2.1 Legal operator

The website's terms, privacy notice and impressum name FLUERE TERMINAL LTD as operator. Companies House confirms an active private company registered in England and Wales under number 17324799, incorporated 7 July 2026, with business classification 62012, business and domestic software development. The registered office is 37 Newton Road, Lewes, England, BN7 2SH. [S3] [S5] [S6] [S7]

The filing history contains only the incorporation filing. First accounts are due 7 April 2028. The incorporation statement shows GBP 2 total capital: 200 ordinary shares at GBP 0.01 each. There are no registered charges. This is legally possible and common for a tiny new software company. It does not show fraud; it also provides almost no balance-sheet assurance to customers or data suppliers. [S11]

Companies House itself warns that placing information on the register does not mean the agency has verified its accuracy. The newer identity-verification entries are useful identity evidence, but company registration is not a product audit, solvency certificate, market-data licence, or FCA authorization. [S12]

### 2.2 Directors and owners

Companies House lists two active directors appointed on incorporation:

- **Ned Talli Fitzgerald Neylon**, born May 2006, English and resident in England.
- **Ben Setyo Obermeyer**, born April 2004, German and resident in Germany.

Both directors are shown as identity verified. Both are persons with significant control, each in the statutory band of more than 25% and no more than 50% of shares and voting rights. The incorporation document shows an initial 50/50 split of 100 shares each. They were approximately 20 and 22 at the audit date. Age is not evidence for or against honesty; it matters because the marketing invokes institutional quality while the public professional track record is short. [S8] [S9] [S10] [S11]

### 2.3 Public professional record

Capital Fluere's architecture page identifies Ned and Ben as co-founders and says they trade and invest. Ned's public LinkedIn profile lists Fluere Terminal from February 2025 and makes a self-reported claim about managing private capital. It also shows A-level design studies. Ben's profile shows a marketing-communications apprenticeship and client-service work at EssenceMediacom; it does not list Fluere as employment at the audit date. Neither profile showed a prior role at an exchange, data vendor, bank, hedge fund, broker, regulated asset manager or institutional terminal provider, nor a public finance qualification or regulatory status. Public profiles can be incomplete, so the finding is absence of corroboration, not proof of no experience. [S2] [S13] [S14]

Ned has one other UK directorship, FINDS APP LTD, incorporated 7 April 2026 at the same registered address and under the same software SIC. Its first-party website and Google Play entry show that he has shipped another software product, although the Android listing showed only 1+ download at the audit date. This supports software-building activity, not institutional-finance expertise or commercial scale. [S36] [S37] [S38]

### 2.4 Footprint and history

Verisign's authoritative registry record dates capitalfluere.com to 9 February 2026. It uses Squarespace Domains II as registrar and Cloudflare nameservers. Registrant details are privacy-redacted, which is normal. Internet Archive queries returned no captures for the apex or www host, and targeted GitHub searches found no public project repository. [S15]

The Fluere Terminal LinkedIn company page showed 11 followers, a self-selected size band of 2-10 employees, and one visible associated member. Targeted searches found no substantive press profile, customer case study, Trustpilot page, Reddit review thread, independent product benchmark, litigation, regulator warning or director-disqualification match. That absence is weak reassurance because the company and domain are exceptionally new; there has been little time for either a positive or negative reputation to form. [S49]

### 2.5 Identity conclusion

This is not an anonymous offshore website. The company identity, directors, beneficial owners, address, domain and first-party legal pages broadly align. That is a meaningful positive signal. The corresponding negative is not hidden identity but lack of history: no accounts, no proven revenue, no audited controls, no independent customer references and no corroborated institutional background.

## 3. What the product actually is

### 3.1 Reconstructed architecture

The gated terminal sends more than 2 MB of readable HTML and JavaScript to the browser before authentication. That public code names providers, routes, refresh intervals, limitations and operational notes. This is normal public client delivery rather than a security bypass. It is unusually revealing and permits a high-confidence reconstruction of the product's data supply chain. [S4]

[[ARCHITECTURE_DIAGRAM]]

The product is best described as a Cloudflare-hosted orchestration and user-interface layer:

1. It obtains selected commercial market/company data through server-side vendor routes.
2. It collects or transforms free official and open datasets.
3. It embeds third-party widgets for data it does not independently license or render.
4. It caches shared outputs and pools a live connection to reduce calls and cost.
5. It performs many analytical calculations locally in the subscriber's browser.
6. It stores user layouts, notes, watchlists, community content and related state in Cloudflare-backed services described in the privacy notice.

This is a legitimate and common architecture for a retail dashboard. It is economically and functionally different from Bloomberg's vertically integrated data, content, workflow and communications system.

### 3.2 Provider and feature map

| Feature family | Apparent upstream / method | Freshness actually supported by evidence | Main limitation |
|---|---|---|---|
| US-equity quote monitor and selected live prices | Finnhub REST and WebSocket through Fluere Workers | Live trades for supported US symbols; source describes pooled stream and polling fallback | Exact venue/SIP entitlement, NBBO coverage, depth, corrections and latency SLA are not disclosed. |
| US-equity historical OHLCV | Finnhub-backed chart route | Intraday/daily depending panel and entitlement | Deep intraday availability and adjustment methodology are not independently tested. |
| Company profiles, metrics, peers, analyst ratings, targets, estimates and events | Finnhub vendor proxy, with SEC data in some panels | Vendor-dependent | Methodology, consensus contributor set, timestamps and correction policy are not disclosed. |
| US financial statements and filings | SEC EDGAR/XBRL plus vendor fallback | Filings can arrive quickly after SEC publication | US-centric; derived line items and quarterly calculations require normalization and restatement controls. |
| Non-US equities | Source labels Yahoo end-of-day route and TradingView fallbacks | End-of-day or TradingView-delayed in relevant widgets | Not equivalent to global live consolidated market data; commercial permission is not publicly documented. |
| FX, crypto, commodities, indices and many charts | TradingView widgets | FX/crypto can be real time; equity widgets are delayed; market-specific | Embedded display only; no evidence of exportable institutional feed, full depth or terminal-wide normalization. |
| News | Fluere public headline/link aggregator, plus FinancialJuice widget and public feeds | Fluere Worker rebuilds at most every 45 seconds | Headline links are not a licensed full-text Bloomberg/Reuters wire; source rights are undisclosed. |
| Macro and rates | FRED, Treasury/H.15, ECB, World Bank and related official data | Publication cadence of each series; often daily/monthly/quarterly | "Live" display cannot make a slow official release intrinsically live. |
| Energy | US EIA | Official release cadence | Mostly US and periodic, not exchange-grade real-time commodity data. |
| Institutional positions | SEC 13F and CFTC COT | 13F up to 45 days after quarter; COT usually Friday for Tuesday | Delayed disclosures, limited instrument scope and no live hedge-fund books. |
| Insider activity | SEC Form 4 | Generally filed within two business days of transaction | Filing delay and reporting exemptions remain; not live trading flow. |
| Shipping/chokepoints | IMF PortWatch satellite AIS | Daily, source notes a few days behind and subject to revision | Aggregated calls/capacity estimates, not live vessel telemetry. |
| Fires and news maps | NASA FIRMS, GDELT, public map layers | FIRMS global data generally within three hours; US/Canada faster | Satellite detections and approximate geocoding, not continuous ground truth. |
| Prediction markets | Public Polymarket and where available Kalshi; FRED mapping | Market-dependent | Explicitly not CME FedWatch; outcomes are normalized and methodology differs. |
| Supply chains, trade, defence, infrastructure | Curated IEA, USGS, EIA, USDA, SIPRI and other public reference data | Mostly point-in-time 2024-26 snapshots | Approximate, curated and sometimes explicitly not source-checked. |
| Quant/model panels | Browser-side conventional formulas and statistics | Calculation is immediate; inputs inherit upstream age/quality | A named model is not validation, governance, proprietary alpha or production risk infrastructure. |
| Community and private workspace | Fluere/Cloudflare application storage | Near-real-time application state | Direct messages are not end-to-end encrypted; no enterprise retention/eDiscovery assurance. |

### 3.3 Finnhub is the primary commercial core

The dashboard source repeatedly names Finnhub. It describes live Finnhub quotes, a Finnhub WebSocket and Finnhub OHLCV, and routes a function named `fhub()` to a vendor proxy. The exposed client logic refers to the same endpoint families Finnhub documents: company profile and metrics, analyst targets and recommendations, upgrades/downgrades, company news, earnings, estimates, ownership, executives, dividends, splits, calendars and historical company measures. The combined naming and endpoint match is strong evidence, not a guess based on visual similarity. [S4] [S16]

The application also names `stream.capitalfluere.com` as a shared streaming service. Its comments say an earlier per-tab design exhausted the upstream connection allowance and caused 429 responses; the revised service pools one upstream connection and fans prices out to clients. Code describes a 20-second REST baseline with a faster fallback if the socket fails. This is efficient engineering and one direct reason a low-cost product can scale more cheaply than one upstream connection per tab. It also reveals dependency concentration: if the one vendor, account or pooled service fails, many panels can degrade together. [S4]

Finnhub's official documentation says its quote endpoint provides real-time US-stock data and that real-time international prices require enterprise access through a partner feed. Its terms state that website-listed plans are for personal use unless explicitly stated otherwise and prohibit redistribution or sharing data or derived results without written approval. Capital Fluere is a business redistributing displays to paying users, so it needs appropriate written commercial rights. No reviewed public Fluere legal page names Finnhub or supplies proof of that permission. [S16] [S17]

This is a critical diligence gap, not evidence of infringement. A legitimate private enterprise or redistribution agreement may exist and would not normally be posted online. The correct test is documentary: ask Fluere to confirm in writing that its supplier contract permits external display to paying users, and ask which exchanges, venues, symbol classes and user categories the permission covers.

Finnhub's public pricing page showed an All-In-One plan at USD 3,500 per month billed annually at the audit date, while its terms label public plans as personal-use. That number is not Capital Fluere's known cost and cannot substitute for a commercial redistribution quote. It does establish that feature-rich API access need not cost Bloomberg prices. If Fluere's true authorized vendor cost were near that public figure, gross monthly revenue from roughly 702 subscribers at USD 4.99 would equal the API fee alone, before VAT, Stripe, hosting, support and every other cost. The actual break-even point could be materially lower or higher. [S17] [S19]

### 3.4 TradingView supplies much of the visible global breadth

The source loads standard TradingView widgets for advanced charts, market quotes, events, forex cross-rates, financials, screeners, technical analysis and crypto views. Fluere's privacy notice confirms that TradingView chart and screener panels load in the subscriber's browser and receive the user's IP address. [S4] [S5]

TradingView says its widgets include built-in data, require no data API from the embedding website and are intended for finance websites and dashboards. It also states that equity widget data is delayed because exchanges require websites to pay for real-time rights; FX and crypto can be real time; and buying an upgraded TradingView consumer plan does not make embedded equities real time. [S18] [S20]

This is not a trick. TradingView deliberately offers embeddable widgets. It does mean a product can display professional-looking global charts without owning a Bloomberg-like global feed. The screen can look like an institutional terminal while the underlying rights, latency, exportability and completeness remain retail-widget class.

### 3.5 News is a headline/link aggregator, not a terminal wire

During the audit on 6 September 2026, the unauthenticated `/api/news` endpoint returned 220 records from 17 source labels. Each record contained a headline, publisher label, URL, timestamp, region and category - no licensed article body. The oldest record was approximately 53 hours old. The source distribution was: [S50]

| Label | Items | Label | Items |
|---|---:|---|---:|
| Reuters | 31 | FXStreet | 25 |
| Guardian | 25 | ForexLive | 21 |
| CNBC | 20 | Cointelegraph | 15 |
| GlobalNewswire | 15 | CoinDesk | 11 |
| SCMP | 11 | Investing.com | 10 |
| MarketWatch | 10 | FT | 9 |
| BBC | 8 | SeekingAlpha | 5 |
| Bloomberg | 2 | BusinessWire | 1 |
| CNBC Asia | 1 |  |  |

All 31 Reuters-labelled items linked through Google News RSS URLs. The two Bloomberg-labelled items linked to ordinary public Bloomberg article URLs. The dashboard source calls these public news feeds and says the Worker rebuilds the feed at most once every 45 seconds; a hidden tab polls less often. It separately embeds FinancialJuice's standard news widget. [S4]

The feature is useful: one screen aggregates many current headlines. But "9+ wires" should not be read as evidence of licensed, full-text, low-latency Bloomberg, Reuters, Dow Jones or exchange-news services. Public headline linking, RSS aggregation and publisher attribution have different content rights, latency, corrections, metadata and continuity. Fluere discloses no public per-publisher licence schedule.

### 3.6 Public and intrinsically delayed data create many panels cheaply

SEC EDGAR APIs provide filings and XBRL company facts without authentication. FRED exposes a large macroeconomic database. EIA, CFTC, NASA, GDELT, World Bank, ECB, USGS and other agencies publish useful official or open data. A small team can produce dozens of visual panels from these sources at low marginal cost. [S21] [S22] [S23] [S24] [S25]

Freshness must follow the source:

- Form 13F is due within 45 days after a calendar quarter, covers specified long US securities and cannot show a live hedge-fund portfolio. [S22]
- CFTC COT is generally released Friday using positions from Tuesday. [S23]
- SEC Form 4 is generally due by the end of the second business day after a reportable transaction. [S39]
- NASA FIRMS says global fire detections are generally available within three hours of satellite observation, with faster US/Canada products. [S25]
- IMF PortWatch is a daily aggregated satellite-AIS product and the Fluere source warns that recent figures can lag and be revised. [S4]

A fast web interface cannot remove those underlying delays. It can only display each release promptly after publication.

### 3.7 Curated and unvalidated data are a serious quality warning

Several maps and supply-chain panels explicitly describe their figures as approximate, point-in-time reference shares rather than live telemetry. More concerningly, a source comment says lithium, cobalt, graphite and rare-earth data were checked against USGS material after significant omissions or errors were found, while the other 29 commodities had never been checked against a source. [S4]

That comment is unusually candid and may reflect work in progress rather than intent to mislead. It is nevertheless incompatible with treating every panel as institutional-grade research. An institutional production dataset normally needs named sources, observation dates, definitions, reproducible transformations, review ownership, correction history and tests. Fluere's public code itself establishes that this standard is not uniform across the terminal.

### 3.8 The landing page demo is not live evidence

The homepage code describes its visible terminal prices and headlines as captured values. The price animation flashes static closing figures, and the headline marquee uses a hardcoded captured set. This is acceptable for a marketing mock-up if understood as such; it means a live-looking landing page cannot be used as proof that the paid terminal is live, accurate or continuously available. [S1]

## 4. Marketing claims versus evidence

| Public claim or impression | Evidence found | Audit assessment |
|---|---|---|
| Real-time market data across the terminal | Finnhub-backed live US-equity trades exist, but many panels are 20-minute, hourly, EOD, weekly, quarterly or static. TradingView equities are delayed. | **Partly true, materially overbroad.** The UI needs per-panel source and timestamp labels. |
| Headlines the second they land | Public headline/link feed rebuilds no faster than 45 seconds and depends on publisher/RSS availability. | **Not supported literally.** Current aggregation is useful, but not a proprietary real-time wire. |
| 9+ wires | Feed contained 17 publisher labels, mostly headline URLs; Reuters items came through Google News RSS. | **Publisher aggregation, not proof of nine licensed wires.** |
| Statements pulled from filings | SEC EDGAR/XBRL logic is visible and filings link to accessions. | **Substantially supported for US filers.** Derived lines and normalization still need controls. |
| Same data a hedge fund works with | Hedge funds also use SEC, FRED, CFTC and public news; Fluere uses some of those sources. | **Literally possible but misleading as equivalence.** Source overlap does not imply the same licensed feeds, history, point-in-time quality, identifiers, corrections or workflow. |
| Institutional-grade analysis | Conventional models and some thoughtful explainers exist; unvalidated approximate datasets and no methodology governance are also visible. | **Not demonstrated as a terminal-wide standard.** |
| Twenty years / decades of data | Requested ranges and long daily histories are coded for supported assets. | **Plausible for selected series, not verified for every asset.** Long daily history is not deep tick history. |
| Live institutional positioning | Panels use 13F and COT public disclosures. | **Incorrect impression if read as live.** These are delayed regulatory reports. |
| Live fires from orbit | NASA FIRMS is genuine near-real-time satellite data. | **Supported with latency qualification.** Global data is generally within hours, not continuous live video. |
| 4.99 is sustainable | Architecture can be cheap; no accounts, subscriber count, vendor contract or funding is public. | **Possible but unverified.** Could be profitable, subsidized, loss-leading or dependent on current vendor terms. |
| Cancel anytime / secure Stripe checkout | Terms specify auto-renewal, monthly trial, cancellation and Stripe processing. | **Supported contractually.** Payments are generally non-refundable except where law requires. |

The recurring pattern is not "everything is fake." It is scope inflation: accurate descriptions of some components are written as if they apply to the whole terminal, and source overlap is presented as institutional equivalence.

## 5. Bloomberg Terminal comparison

### 5.1 Correcting the price misconception

A single Bloomberg Terminal does not normally cost millions of dollars. Bloomberg does not publish a simple public rate card, so current figures should be described as observed or reported, not an official universal list price. NeuGroup reported 2025 pricing of USD 31,980 per year for one terminal and USD 28,320 each for two or more under a two-year subscription. A February 2026 US government purchase order corroborates USD 31,980 for one year. Large institutions can spend millions across many seats, data services and enterprise products: a Bank of England 2026-28 Bloomberg contract was GBP 4.67 million, but the notice does not disclose seat count or product mix. [S26] [S27] [S28]

At the advertised US annual plan of USD 49.99, one observed Bloomberg seat costs roughly 640 times as much per year. At twelve monthly Fluere payments, USD 59.88, it is about 534 times. The ratio is real; the products are not equivalent units.

[[PRICE_COMPARISON]]

### 5.2 What Bloomberg's premium funds

Bloomberg's value proposition is an integrated professional system rather than a collection of charts. Its official materials describe cross-asset market data, proprietary and third-party news/research, portfolio and pre/post-trade analytics, execution and order workflow integrations, a large professional communications network, entitlements, identifiers, remote access and 24/7 specialist support. Instant Bloomberg connects more than 350,000 finance and government professionals. [S29] [S30] [S31] [S32]

Bloomberg's B-PIPE enterprise feed separately claims 35 million instruments, more than 330 exchanges and more than 5,000 contributors, with normalization, entitlement reporting, depth and proprietary calculated content. B-PIPE is not necessarily included in a basic terminal seat. Likewise AIM, Vault, TOMS and other enterprise workflow/compliance products can be separate or premium offerings integrated with the Terminal. The comparison must not attribute every Bloomberg enterprise product to the base observed seat price. [S30] [S33]

### 5.3 Side-by-side

| Dimension | Capital Fluere | Bloomberg Terminal / ecosystem |
|---|---|---|
| Target user | Retail traders and investors | Professional markets, buy-side, sell-side, government and corporate users |
| Core price | GBP/EUR/USD 4.99 monthly or 49.99 yearly | Observed roughly USD 31,980/year single seat; terms and negotiated rates vary |
| Market-data core | Finnhub-backed selected US equities; embeds and EOD fallbacks elsewhere | Broad multi-asset normalized data with venue entitlements; enterprise feeds available separately |
| Meaning of real-time | Panel-specific; live selected US trade prices, many delayed/static sources | Entitlement-specific professional data, including depth/direct/consolidated options depending product and fees |
| Breadth | Many panels over a limited set of upstreams and curated data | Millions of instruments and thousands of contributors across Bloomberg's wider data ecosystem |
| News | Public headline/link aggregation and embedded widgets | Bloomberg's global newsroom, proprietary reporting, full stories and event feeds; third-party content |
| Research | Vendor consensus, SEC data, member content, AI summaries, standard models | Bloomberg Intelligence and integrated third-party research, estimates and analytics |
| Identifiers and normalization | No public security-master methodology | Bloomberg identifiers, corporate actions, symbology, normalization and reference-data operations |
| History | Long daily series for selected assets; limits depend on source | Deep historical datasets, tick products and enterprise history depending entitlement/product |
| Professional messaging | Small subscriber community | Instant Bloomberg network of more than 350,000 professionals and trade-linked collaboration |
| Trading workflow | No broker execution/OMS integration found | Integrated execution/order workflows; premium enterprise systems also available |
| Compliance and audit | Consumer terms; no enterprise assurance found | Enterprise entitlements, compliance capture, security and service processes, product-dependent |
| Support and SLA | No accuracy, timeliness, availability or uptime warranty | 24/7 help desk and specialist support; enterprise contracts and support framework |
| Data licensing transparency | Supplier rights not publicly demonstrated | Long-established exchange/contributor entitlement business, with extra exchange fees possible |

### 5.4 Why two screens can look similar while the economics differ

A price tile, chart or Black-Scholes calculator is cheap to reproduce. Bloomberg's expensive work is mostly behind the screen: negotiating thousands of licences; mapping symbols and corporate actions; cleaning and timestamping feeds; operating low-latency global infrastructure; producing proprietary journalism and research; maintaining contributor relationships; providing entitlements, compliance and audit; integrating orders and communications; and staffing 24/7 support.

Fluere reproduces the visible interface category - terminal-like navigation, panels and analytics - without showing most of that institutional substrate. This is why a feature-count comparison is misleading. Ninety UI panels can be built on a handful of shared endpoints; one reliable global security master can require years of operations.

### 5.5 "Real-time" has multiple meanings

Real-time does not necessarily mean consolidated, complete or execution-grade. A feed can update immediately from a single exchange or alternative venue while representing only a fraction of total volume and omitting the national best bid and offer, depth and other venues. Nasdaq Basic is a legitimate real-time subset product; it is not the same as the complete consolidated SIP. TradingView also notes that its default US display can use Cboe data rather than the primary exchanges. [S20] [S34] [S35]

Fluere does not publicly specify whether its Finnhub-backed US stream is consolidated SIP, an alternative-venue feed, last trade only, NBBO, regular-hours only, adjusted, professional/non-professional entitled, or corrected after busts. Until it does, a moving quote should be treated as a convenience signal, not proof of institutional completeness.

## 6. How can it be so cheap?

The low price is not inherently suspicious. The following cost structure is plausible from the product itself:

### 6.1 Free and public raw material

SEC filings, FRED macro series, EIA releases, CFTC reports, NASA fire detections, public maps and many government datasets can be obtained at low or no licence cost, subject to each source's terms and attribution requirements. Public availability does not guarantee unlimited commercial redistribution, but it is fundamentally cheaper than purchasing normalized cross-asset enterprise feeds. [S21] [S24] [S25]

### 6.2 Free or low-friction embedded products

TradingView publishes ready-to-use widgets with built-in data. FinancialJuice publishes embeddable widgets. YouTube supplies video players. The embedding site provides layout and context rather than licensing and transporting every datum itself. [S18] [S20]

### 6.3 One commercial core reused widely

Finnhub exposes many endpoint families under one platform. A quote stream, company profile, metrics, estimates, analyst data and calendars can populate numerous panels. One subscription or enterprise agreement can therefore create the appearance of dozens of separate products. The exact authorized Fluere contract remains unknown. [S16] [S17] [S19]

### 6.4 Caching and fan-out

The source describes pooling one upstream WebSocket and fanning it out to clients, caching headline aggregation for 45 seconds, and using slower refreshes when tabs are hidden. These choices reduce vendor connections, API calls and server work. Cloudflare Pages/Workers/CDN/storage are designed for low-cost global distribution; the privacy notice confirms that Cloudflare provides hosting, content delivery, storage and some AI summaries. [S4] [S5]

### 6.5 The subscriber's device does the mathematics

DCF, option pricing, VaR, regressions, correlation matrices, optimizers, HMMs and other named models can run in JavaScript on the user's computer. The expensive question is not computation but data quality, modelling assumptions, validation, point-in-time integrity and support. Fluere supplies calculators; it does not demonstrate an institutional model-risk program.

### 6.6 Missing expensive layers

No evidence shows a proprietary newsroom, staffed research organization, global identifier/security-master team, broker/exchange connectivity, professional messaging network, trade capture, compliance archive, enterprise procurement/support team, or guaranteed service. Avoiding these layers is the largest saving.

### 6.7 Startup economics and possible subsidy

The founders are early-career, the company is tiny and infrastructure is serverless. Founder labour may be unpaid or below market rate. The price may be a launch strategy designed to attract users. It could also be sustainable at scale because marginal serving cost is low. With no accounts, subscriber count, funding disclosure or vendor invoices, public evidence cannot distinguish profit, break-even, founder subsidy or loss-leading growth. [S48]

The correct conclusion is: **4.99 is technically plausible, while long-term commercial sustainability and proper redistribution rights remain unverified.** Cheapness alone is not a scam indicator.

## 7. Legal, licensing, regulatory, and consumer issues

### 7.1 Data redistribution is the largest terminal-specific legal question

Finnhub's public terms require written approval for redistribution and business use. Fluere's public terms merely tell subscribers not to scrape or resell the data; they do not identify its own provider permissions. The source also labels a Yahoo end-of-day route, while Yahoo's general terms restrict commercial reuse absent permission. Public headline feeds raise separate publisher and database-right questions. None of these observations proves misuse because private agreements, partner feeds or permitted display arrangements may exist. [S3] [S4] [S17] [S40]

The company should be able to answer, without disclosing pricing:

- Which vendor and exchange licences cover external display to paying subscribers?
- What market is consolidated versus single-venue, and what is last-sale versus bid/ask/depth?
- Which assets are real-time, delayed or end-of-day, in each country?
- Are users classified as professional/non-professional where required?
- Do the agreements permit cached display, derived analytics, history and redistribution across every advertised panel?
- What happens to customers and saved work if a vendor terminates access?

Refusal to provide even a high-level written attestation would materially increase continuity risk.

### 7.2 FCA status: absence is not automatically a problem for the terminal

Exact FCA Register searches on 6 September 2026 found no entry for FLUERE TERMINAL LTD, Capital Fluere, Ned Neylon or Ben Obermeyer. That fact alone is not wrongdoing. UK authorization is activity-based: a service limited to neutral market data, generic research and analytical tools may sit outside the FCA perimeter. FCA guidance distinguishes generic information from advice on the merits of a particular investment. Personalized recommendations, arranging transactions, managing assets and some financial promotions can require authorization. A disclaimer and a software SIC do not decide the question; actual conduct does. [S41] [S42]

Nothing in the public terminal pages proves that Fluere executes trades, takes custody or manages subscriber money. Its terms consistently position the terminal as informational and educational. On public evidence, the appropriate conclusion is "no FCA registration found; terminal authorization may not be required," not "unlicensed illegal terminal."

### 7.3 Fluere Fund is a separate, higher-risk issue

The terminal homepage links to fund.capitalfluere.com. That page calls itself an investment partnership, refers to "our fund," and presents a boutique investment firm. It collects an email address through a contact form. It does not publicly identify a fund vehicle, investment manager, jurisdiction, regulator, authorization number, custodian, administrator, auditor, legal counsel, eligibility rules, offering memorandum, fees, performance record, conflicts, valuation, redemption terms or risk disclosures. No separately disclosed exact-name Fluere Fund company or FCA entry was found. [S1] [S43]

This is a material transparency gap, not proof of an illegal or fraudulent fund. It may describe a private proprietary-capital arrangement or an unfinished concept; an email form does not prove that outside money is being accepted. The risk changes immediately if anyone is invited to subscribe, pool money, grant discretionary authority or transfer assets.

Until the eight proofs in section 10.3 are independently confirmed, no capital should be sent to Fluere Fund, FLUERE TERMINAL LTD, either founder, any personal account, a crypto wallet or a differently named beneficiary.

### 7.4 Potential ICO fee issue

The privacy policy names FLUERE TERMINAL LTD as data controller and describes processing emails, billing status, profiles, messages, private notes, IP addresses and device data. Exact-name searches of the ICO fee-payer register returned no Fluere entry; a postcode search returned FINDS APP LTD and an unrelated company, but not FLUERE TERMINAL LTD. The ICO says organizations processing personal information generally must pay the data-protection fee unless exempt and notes that new entries may take two working days to appear. [S5] [S44] [S45]

Fluere should provide its ICO registration reference or explain its exemption or pending status. The missing public entry is a potential administrative-compliance gap, not proof of a GDPR breach.

### 7.5 Stale legal drafting

The current impressum links to the European Commission's Online Dispute Resolution platform. The platform was discontinued on 20 July 2025 and its legal basis repealed. A 2026 notice presenting it as available is stale. This suggests copied or insufficiently reviewed legal text, not fraud by itself. [S6] [S46] [S47]

### 7.6 Subscription terms

The public terms provide a monthly 14-day trial, no trial on the annual plan, automatic renewal, cancellation at any time effective at period end, and no refunds except where law requires. Billing is through Stripe, prices include applicable tax where supported, and users must be 18. Consumers should save the offer page and cancellation confirmation and should use the monthly trial before considering an annual plan. Mandatory local consumer rights can override contract wording. [S3]

## 8. Security, privacy, and operational maturity

This was a passive surface review, not a penetration test. No conclusion about internal security can be definitive.

### 8.1 Positive observations

- HTTPS is enforced and the dashboard returned HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` and a strict-origin referrer policy.
- Protected profile, quote, history and fundamental routes returned HTTP 401 without membership during spot checks.
- The main API's cross-origin response was restricted to capitalfluere.com during testing.
- Payments are delegated to Stripe; the privacy notice says Fluere does not store full card data.
- Optional TOTP two-factor authentication is documented, with an encrypted shared secret and one-way recovery-code hashes.
- No API credential or obvious secret was found in the public dashboard source during targeted inspection.

### 8.2 Gaps and cautions

- No Content-Security-Policy or Permissions-Policy header was observed. A CSP is an important browser-side defense for a page loading substantial third-party JavaScript and iframes; absence is a maturity gap, not proof of an exploitable vulnerability.
- Third-party scripts were visible without an external integrity assurance mechanism in the inspected response.
- More than 2 MB of unminified client source exposes route names, internal comments, old vendor failures, 429 limits, eventual-consistency notes and bug history. Public client code is not a secret, but shipping operational notes increases information exposure and signals a young release process.
- No public SOC 2, ISO 27001, penetration-test statement, vulnerability-disclosure policy, uptime page, incident history, business-continuity plan or SLA was found.
- Direct messages are explicitly not end-to-end encrypted. Fluere can technically access them. Chat keeps roughly 12 months; account and content retention after closure is described only as a reasonable period for legal/accounting obligations.
- The service stores private notes, diary entries, watchlists, alerts, positions, profile content and community messages. Users should not treat it as a confidential research archive until backup, access-control, staff-access, encryption-at-rest and export/deletion controls are independently understood.

### 8.3 Operational concentration

Cloudflare appears to host the pages, Worker APIs, streaming fan-out, storage and AI summaries. Finnhub appears to supply most commercial financial data. TradingView supplies many embedded views. Stripe supplies billing. This efficient vendor concentration also creates correlated outage and contract risk. The code includes candid notes about a recent vendor outage, upstream rate limits and an EDGAR issue. An early-stage service can improve quickly, but it should not be a single point of failure in a trading workflow.

## 9. Is it a scam?

"Scam" is too blunt for the evidence. It helps to separate four different propositions.

### 9.1 Is the operator fictitious?

Probably not. The UK company exists, its two directors and owners are identified and identity verified, the legal pages align with the registry, and related software activity exists. The domain, Cloudflare services, protected routes and live feed show a functioning operation. This weighs against a fake-front conclusion. [S7] [S8] [S9] [S10]

### 9.2 Is the terminal vaporware?

No. The public source contains a large and specific application, provider integrations, user features, error handling and current operational notes. Several services responded. However, the paid experience and every advertised panel were not tested, so full delivery remains unverified.

### 9.3 Are the marketing claims reliable?

Not as written. "Real-time" and hedge-fund/institutional equivalence are broad umbrella claims that hide substantial differences in source, delay, coverage, validation and rights. The contract retreats to data that may be inaccurate, delayed or unavailable. This is a high expectation and suitability risk. It can be aggressive startup marketing without proving fraudulent intent.

### 9.4 Is there evidence of intentional financial fraud?

No direct evidence was found: no fake regulatory claim, forged client asset statement, guaranteed return, false named custodian, cloned identity, regulator warning, withdrawal complaint or instruction to send money was identified for the terminal. There is also almost no independent user history from which to infer conduct.

The linked fund page is different. It uses investment-firm language while omitting the basic identity and service-provider facts needed for capital due diligence. That page should be treated as **uninvestable until proven otherwise**, without asserting that it currently takes money or operates illegally.

### 9.5 Final classification

> **Terminal:** real product; unproven company; overstated positioning; high data-reliance and licensing uncertainty; low-stakes subscription only.  
> **Fund:** opaque concept or vehicle; no capital transfer or mandate until full independent verification.

## 10. Recommended action

### 10.1 If you want to try the terminal

1. Use the monthly 14-day trial, not the annual plan.
2. Pay only through the advertised Stripe card flow; use a virtual or low-limit card if available.
3. Save the price, renewal and cancellation pages and cancel in advance if you do not intend to continue.
4. Use a unique password and enable TOTP two-factor authentication.
5. Do not upload confidential research, exact portfolio sizes, personal documents, API keys or brokerage credentials.
6. Treat every price, analyst figure, filing-derived metric and map number as a lead. Verify decisions against a regulated broker, exchange, SEC filing or named official source.
7. Never use Fluere alone for execution prices, best execution, options valuation, risk limits, compliance, tax lots or material portfolio accounting.

### 10.2 Questions the terminal team should answer in writing

| Topic | Required answer |
|---|---|
| Market-data vendor | Exact provider(s), feed product(s), and whether the US stream is SIP, alternative venue, last sale, NBBO or another scope. |
| Redistribution | Confirmation that written agreements permit external display to paying Fluere users and derived analytics. |
| Coverage | Venue-by-venue and asset-by-asset table of real-time, delayed and EOD data, including pre/post-market. |
| Entitlements | How professional/non-professional users and exchange declarations are handled. |
| Timestamps | Exchange timestamp, vendor receipt time and Fluere receipt/display time shown in every panel. |
| Corrections | Trade-bust, split, dividend, restatement, backfill and error-correction process, with visible revision dates. |
| Fundamentals | Point-in-time handling, restatements, currency conversion, fiscal calendars, Q4 derivation and non-US coverage. |
| Estimates | Contributing analyst population, consensus methodology, update time and survivorship history. |
| News | Whether each publisher is RSS/link aggregation or licensed wire content; latency and takedown rights. |
| Curated data | Named source, observation date, transformation, reviewer and test status for every map/supply-chain dataset. |
| Reliability | Status page, uptime history, incident process, backup/restore tests, vendor failover and support response targets. |
| Security | Independent test date/scope, encryption, employee access, secrets management, CSP roadmap and vulnerability reporting route. |
| Privacy | ICO reference/exemption, complete subprocessor list, retention periods, export and verified deletion process. |
| Business viability | Subscriber count band, funding/runway assurance or a continuity plan if pricing/vendor economics change. |
| Fund separation | Legal and operational relationship between FLUERE TERMINAL LTD and the entity branded Fluere Fund; conflict controls. |

### 10.3 Eight proofs required before sending investment capital

1. **Exact vehicle:** full legal name, jurisdiction, registration number, address, constitutional documents and current registry extract.
2. **Regulatory basis:** FCA firm reference number and exact permissions verified independently, or a written opinion from identifiable financial-services counsel explaining why authorization is not required. Verify any other jurisdiction with its regulator.
3. **Offering documents:** current prospectus or private-placement memorandum, subscription and partnership agreements, eligibility, risks, fees, conflicts, lock-up, valuation, redemption, suspension and wind-down terms.
4. **Accountable manager:** legal identity of the GP, investment manager/AIFM, directors, compliance officer and owners, plus verified work and regulatory histories.
5. **Independent service providers:** named administrator, auditor, counsel, custodian/prime broker and bank. Confirm relationships using independently obtained provider contact details.
6. **Segregated custody:** proof that assets and subscriptions are held for the exact fund vehicle at a regulated bank/custodian. Never pay a founder, personal account, operating software company, Stripe checkout, crypto wallet or mismatched beneficiary.
7. **Substantiated assets and performance:** audited financials, administrator-issued NAV, AUM, inception date and gross/net methodology, verified directly with auditor and administrator.
8. **Investor protection and exit:** AML/KYC onboarding, investor-register confirmation, unit/share evidence, complaints, redemption mechanics, reporting, governing law and a clear FSCS/FOS protection statement reviewed by independent counsel.

Failure or refusal on any of items 1-6 is a stop condition, not something cured by a polished terminal demo or a low minimum investment.

## 11. Unresolved questions and confidence

| Question | Current answer | Confidence / next proof |
|---|---|---|
| Does Fluere have lawful commercial Finnhub redistribution rights? | Unknown | Obtain written supplier-rights attestation or vendor confirmation. |
| Which US venues and quote fields are live? | Finnhub-backed live trades are clear; scope is not | Obtain feed product/venue schedule and compare timestamps with SIP/broker. |
| Does every paid panel work as shown? | Unknown | Use trial and execute a controlled acceptance test; record failures and timestamps. |
| Are the headline feeds licensed for commercial aggregation? | Unknown | Obtain per-source rights schedule. |
| Is the business sustainable at 4.99? | Plausible architecture, no financial proof | Accounts, subscriber band, vendor cost band and funding/runway statement. |
| Is the terminal inside the FCA perimeter? | Likely generic information for public features; not conclusively classified | Review actual personalized features and communications with UK regulatory counsel. |
| What is Fluere Fund? | Publicly under-documented | Full eight-item fund proof package. |
| Is the company ICO-registered or exempt? | No entry found | Registration reference or written exemption explanation. |
| Is the service secure enough for confidential positions/notes? | Not demonstrated | Independent test, architecture/control evidence and data lifecycle test. |
| Are curated datasets accurate? | Not uniformly | Complete source register, automated validation and public correction history. |

## 12. Sources

[S1] Capital Fluere, homepage and feature claims: https://capitalfluere.com/

[S2] Capital Fluere, The Architecture: https://capitalfluere.com/architecture

[S3] Capital Fluere, Terms of Service, updated 27 August 2026: https://capitalfluere.com/terms

[S4] Capital Fluere, publicly delivered dashboard source and in-product explainers: https://capitalfluere.com/fluere-dashboard

[S5] Capital Fluere, Privacy Policy, updated 27 August 2026: https://capitalfluere.com/privacy

[S6] Capital Fluere, Impressum: https://capitalfluere.com/impressum

[S7] Companies House, FLUERE TERMINAL LTD overview: https://find-and-update.company-information.service.gov.uk/company/17324799

[S8] Companies House, officers: https://find-and-update.company-information.service.gov.uk/company/17324799/officers

[S9] Companies House, persons with significant control: https://find-and-update.company-information.service.gov.uk/company/17324799/persons-with-significant-control

[S10] Companies House, incorporation document: https://find-and-update.company-information.service.gov.uk/company/17324799/filing-history/MzUzMDc4OTk0NmFkaXF6a2N4/document?format=pdf&download=0

[S11] Companies House, filing history and statement of capital: https://find-and-update.company-information.service.gov.uk/company/17324799/filing-history

[S12] Companies House disclaimer on verification: https://resources.companieshouse.gov.uk/disclaimer.shtml

[S13] Ned Neylon, public LinkedIn profile: https://www.linkedin.com/in/ned-neylon-ab1416408/

[S14] Ben Obermeyer, public LinkedIn profile: https://www.linkedin.com/in/ben-obermeyer/

[S15] Verisign RDAP, CAPITALFLUERE.COM: https://rdap.verisign.com/com/v1/domain/CAPITALFLUERE.COM

[S16] Finnhub, official API documentation: https://finnhub.io/docs/api

[S17] Finnhub, Terms of Service: https://finnhub.io/terms-of-service

[S18] TradingView, widget documentation: https://www.tradingview.com/widget-docs/getting-started/

[S19] Finnhub, public pricing page: https://finnhub.io/pricing

[S20] TradingView, widget data FAQ: https://www.tradingview.com/widget-docs/faq/data/

[S21] US SEC, EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces

[S22] US SEC, Form 13F FAQ and deadlines: https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/frequently-asked-questions-about-form-13f

[S23] US CFTC, Commitments of Traders release schedule: https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm

[S24] Federal Reserve Bank of St. Louis, FRED API: https://fred.stlouisfed.org/docs/api/fred/fred/

[S25] NASA FIRMS, active fire data and latency: https://firms.modaps.eosdis.nasa.gov/

[S26] NeuGroup, reported Bloomberg Terminal 2025 pricing: https://connect.neugroup.com/public/blogs/bloomberg-terminals-how-much-more-youll-pay-next-year

[S27] US Department of Justice purchase order summary, 2026 Bloomberg subscription: https://govtribe.com/award/federal-contract-award/purchase-order-15ja0526p00000027

[S28] UK Find a Tender, Bank of England Bloomberg contract: https://www.find-tender.service.gov.uk/procurement/ocds-h6vhtk-051f8d

[S29] Bloomberg, Terminal product overview: https://professional.bloomberg.com/products/bloomberg-terminal/

[S30] Bloomberg, B-PIPE real-time enterprise data feed: https://professional.bloomberg.com/products/data/enterprise-catalog/real-time-data-feed/

[S31] Bloomberg, Instant Bloomberg: https://professional.bloomberg.com/products/bloomberg-terminal/collaboration-tools/instant-bloomberg/

[S32] Bloomberg, 24/7 customer support: https://professional.bloomberg.com/support/customer-support/contact-numbers/

[S33] Bloomberg, AIM order management system: https://professional.bloomberg.com/products/trading/order-management-system/aim/

[S34] Nasdaq, Nasdaq Basic product description: https://www.nasdaq.com/solutions/nasdaq-basic

[S35] US SEC, 2026 description of Nasdaq Basic: https://www.sec.gov/files/rules/sro/nasdaq/2026/34-105997.pdf

[S36] Companies House, Ned Neylon appointments: https://find-and-update.company-information.service.gov.uk/officers/YbMwdN4vVtWbPgf-h0qn53Z4j7I/appointments

[S37] Companies House, FINDS APP LTD: https://find-and-update.company-information.service.gov.uk/company/17142107

[S38] Google Play, Finds app listing: https://play.google.com/store/apps/details?id=com.findsapp.finds

[S39] US SEC, Form 4 instructions: https://www.sec.gov/files/form4.pdf

[S40] Yahoo, general terms: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html

[S41] FCA Financial Services Register: https://register.fca.org.uk/s/

[S42] FCA Perimeter Guidance Manual, chapter 8: https://handbook.fca.org.uk/handbook/perg8

[S43] Fluere Fund, first-party page: https://fund.capitalfluere.com/

[S44] UK ICO, fee-payer register search: https://ico.org.uk/ESDWebPages/search/

[S45] UK ICO, data-protection fee guidance: https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/

[S46] European Commission, ODR platform discontinuation notice: https://consumer-redress.ec.europa.eu/site-relocation_en

[S47] EUR-Lex, Regulation (EU) 2024/3228: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R3228

[S48] Capital Fluere, Why 4.99 pricing page: https://capitalfluere.com/pricing

[S49] Fluere Terminal, public LinkedIn company page: https://www.linkedin.com/company/fluere-terminal/about/

[S50] Capital Fluere, public headline feed snapshot endpoint: https://capitalfluere.com/api/news

## 13. Audit trail

The public news source count and timestamps were captured directly from `https://capitalfluere.com/api/news` on 6 September 2026. Passive endpoint checks returned unauthorized responses for protected account, quote, history and fundamental routes; the public news route and service health routes responded. Header findings were observed from the production dashboard response. Source-code conclusions were based only on JavaScript delivered by the website to an ordinary unauthenticated browser.

The audit did not create an account, submit payment information, contact the founders, test the community, access non-public routes, evade controls, execute trades, verify a private data contract, or conduct a vulnerability scan. Legal and regulatory sections are due-diligence observations, not legal advice. Financial-product suitability depends on use, user status and jurisdiction.

# GEO / LLM search visibility for sortmycover.co.za

Lens: geo-llm-search. Researched 10 Oct 2026. Evidence tiers: A = vendor primary doc, B = large-sample or controlled study (usually correlational), C = single-author or vendor blog. Anything not verified is marked UNVERIFIED. Items older than 2024 are marked STALE-RISK.

## 0. Bottom line (read this first)

1. There is no separate "AI SEO" layer to build. Google's own May 2026 guide says AI Overviews and AI Mode run on core Search ranking plus query fan-out, and need no special files, schema, chunking or rewrites (A).
2. The gate for every engine is classic indexation: Google index (AI Overviews, AI Mode, Gemini), Bing index (Copilot), OpenAI's OAI-SearchBot index (ChatGPT search), Perplexity's own index, and, reportedly, Brave (Claude). Check access and indexation first (see section 2).
3. What actually moves citation in the data is off-site: branded web mentions, YouTube/Facebook/Reddit presence, referring domains (B, correlational). SortMyCover is a brand-new entity; a web search for "SortMyCover" on 10 Oct 2026 returned no pages about it. Entity building is the long pole.
4. AI referral traffic is tiny: about 0.3% of site traffic across 101,574 sites (SE Ranking, Jun 2026). For a paid-ad funnel the value of GEO is brand verification ("is SortMyCover legit?"), not lead volume.
5. This is YMYL. AI engines paraphrase and sometimes mis-cite financial content (Which?, EBU/BBC). Every extractable passage must be safe to quote out of context under FAIS: no advice, no premiums, no product comparison.
6. Skip llms.txt. No major engine uses it for search; Google says so in writing.

Live state checked 10 Oct 2026: robots.txt is `User-agent: *` / `Allow: /` / `Disallow: /staging/` plus sitemap (fine); homepage has Organization and FAQPage JSON-LD; Organization `sameAs` is an empty array; `/llms.txt` returns 404; `/turned-40/` and `/new-bond/` return 404 on the apex today; `landing/config/site.json` has `"robots": "noindex,nofollow"` with env `staging`.

## 1. How each engine picks and cites sources

| Engine | Retrieval basis (what is documented vs inferred) | Source |
|---|---|---|
| Google AI Overviews / AI Mode | Google Search index; query fan-out (many related sub-searches); pages must be indexed and snippet-eligible; "no additional requirements" (A, doc updated 10 Dec 2025). Ahrefs: only 38% of AIO citations are top-10 for the head query, 31% are outside the top 100 (B, 2 Mar 2026, 863k SERPs). | developers.google.com/search/docs/appearance/ai-features ; ahrefs.com/blog/ai-overview-citations-top-10/ |
| ChatGPT search | OAI-SearchBot must be allowed or the site "will not be shown" in ChatGPT search answers (A). Backend mix is partly undocumented: Peec AI reverse-engineered network events (May-Jul 2026) and reports an in-house index plus external providers (C, UNVERIFIED by OpenAI). | developers.openai.com/api/docs/bots ; peec.ai/blog/chatgpt-built-its-own-search-index |
| Perplexity | Own index via PerplexityBot; indexes and scores sub-document passages rather than whole pages (A/C: Perplexity research post, direct fetch returned 403, summary via search result). | docs.perplexity.ai/guides/bots ; research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api |
| Claude | Claude-SearchBot indexes for search quality (A, Apr 2026). The live search backend is widely reported to be Brave Search (Anthropic subprocessor list entry, "BraveSearchParams" in the tool schema, 20-21 Mar 2025) but Anthropic has not confirmed it (C, UNVERIFIED). | support.claude.com article 8896518 ; finance.yahoo.com/news/anthropic-appears-using-brave-power-170703042.html |
| Microsoft Copilot | Built on the Bing index; no separate consumer-Copilot crawler is documented (secondary sources, UNVERIFIED). Bing Webmaster Tools AI Performance (10 Feb 2026) shows citations and "grounding queries" (A). | blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview |
| Gemini app | Grounds on Google Search results; the Google-Extended token controls training and Gemini-app/Vertex grounding use (A, doc updated 14 Jul 2026). | developers.google.com/search/docs/crawling-indexing/google-common-crawlers |

## 2. Crawler access: exact current names and what they control

All verified against vendor docs on 10 Oct 2026 unless marked.

| Token (exact) | Operator | Controls | robots.txt applies? | Notes |
|---|---|---|---|---|
| `OAI-SearchBot` (UA `...OAI-SearchBot/1.4`) | OpenAI | Surfacing sites in ChatGPT search results | Yes | Opt-out means no ChatGPT search answers. Changes take about 24 hours to apply. |
| `GPTBot` (UA `...GPTBot/1.4`) | OpenAI | Crawling for training foundation models | Yes | Independent of search. |
| `ChatGPT-User` (UA `...ChatGPT-User/1.0`) | OpenAI | Fetches when a user asks ChatGPT, GPT Actions | "May not apply" (user-initiated) | Do not rely on robots.txt for it. |
| `OAI-AdsBot` | OpenAI | Checks pages submitted as ChatGPT ads | Not stated | New. Irrelevant unless advertising in ChatGPT. |
| `PerplexityBot` | Perplexity | Surfaces and links sites in Perplexity results; "not used for training" | Yes | IP list published (perplexitybot.json). |
| `Perplexity-User` | Perplexity | User-triggered page visits | Generally ignores robots.txt (per Perplexity) | Cloudflare (4 Aug 2025) also alleged undeclared stealth crawling by Perplexity; Perplexity disputed it. |
| `ClaudeBot` | Anthropic | Collecting web content for model training | Yes | `Crawl-delay` honoured. |
| `Claude-SearchBot` | Anthropic | Indexing to improve search result quality | Yes | Needed for Claude search inclusion. |
| `Claude-User` | Anthropic | Fetch when a user asks Claude | Yes (can be disabled) | Anthropic says directives apply per subdomain; IPs at claude.com/crawling/bots.json. |
| `Googlebot` | Google | Search index, which feeds AI Overviews and AI Mode | Yes | Snippet controls (`nosnippet`, `max-snippet`) limit AI use. |
| `Google-Extended` | Google | Product token only, no separate crawler: training future Gemini models and grounding in Gemini apps and Vertex AI | Yes | Google states it does not affect Search inclusion or ranking. |
| `Applebot` / `Applebot-Extended` | Apple | Applebot = Siri/Spotlight/Safari search. Extended = Apple foundation-model training only; it "does not crawl". | Yes | Disallowing Extended keeps you in Apple search. |
| `bingbot` | Microsoft | Bing index, which backs Copilot | Yes | Blocking it removes you from Bing and Copilot (secondary, UNVERIFIED for Copilot specifics). |

Recommendation: leave robots.txt as is (all allowed). Citation needs the retrieval tokens (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`, `Googlebot`, `bingbot`) allowed; whether to also allow training tokens (`GPTBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`, `CCBot`) is a policy choice. I found no evidence that allowing or blocking training bots changes citation (UNVERIFIED either way). The site holds nothing proprietary, so allow. Do not Disallow `Google-Extended` if you want Gemini-app grounding. IETF AIPREF `Content-Usage` signals are still Internet-Drafts (vocab draft 06, 28 Apr 2026; attachment draft expired): do not rely on them.

Two failure modes to check before launch:
- Vercel Firewall "AI Bots Managed Ruleset" is inactive by default (Allow); setting it to Deny blocks all AI bots, search bots included. Use Log to monitor instead (A, Vercel docs updated 10 Sep 2026).
- Every campaign subdomain needs its own robots.txt (robots.txt is per host; Anthropic states it per subdomain). If a page is meant to stay out of the index use `noindex`, not Disallow, because noindex only works on crawlable pages (Google, updated 10 Dec 2025). OpenAI also notes a disallowed URL can still surface as bare link and title if discovered elsewhere.

## 3. Evidence-ranked checklist (effort / impact for SortMyCover)

| # | Action | Evidence tier | Effort | Impact |
|---|---|---|---|---|
| 1 | Confirm indexability on apex: no stray `noindex`, no `nosnippet`; production build sets `robots` deliberately (apex info + learn = `index,follow`); verify in Google Search Console and Bing Webmaster Tools; submit sitemap; adopt IndexNow (Microsoft recommends it) | A | Low | High |
| 2 | Vercel Firewall: AI Bots ruleset = Allow or Log, never Deny | A | Low | High (silent failure) |
| 3 | Name the organisation and a human reviewer on About/How-we-make-money (legal entity, FSP no., reviewer name and credential); Google's "who/how/why" test and YMYL weighting | A | Low-Med | High |
| 4 | Answer-first passages: 40-60 word direct answer under each H1/H2, scope sentence ("information, not advice") in the same block, entity definition of SortMyCover on every page | B + A | Low | High |
| 5 | Third-party footprint: Facebook page (already needed for m.me link), YouTube channel with the explainer film, LinkedIn page for Lead Velocity (Pty) Ltd; fill `sameAs` with those real URLs; same one-line description everywhere | B (correlational) | Med | High, slow |
| 6 | Unique non-commodity content: aggregated, POPIA-safe quiz statistics, named adviser Q&A, SA-specific numbers each with a dated source | A (Google) + B | Med-High | Med-High |
| 7 | Measurement stack: GA4 "AI Assistant" channel, GSC Generative AI report, Bing AI Performance, monthly brand-query audit across 5 engines | A | Low | Med |
| 8 | Campaign subdomains: `noindex,follow`, out of sitemap, own robots.txt, canonical to the apex equivalent where one exists | A (doorway policy) | Low | Med |
| 9 | Freshness: visible "last reviewed" dates on learn pages; republish with real changes only | B | Low | Med |
| 10 | Keep JSON-LD accurate (Organization, Article, BreadcrumbList) but expect no AI uplift | B | Low | Low |
| 11 | llms.txt | A says unused | Low | None. Skip. |

## 4. Measuring AI referrals

- ChatGPT appends `utm_source=chatgpt.com` to links it cites (OpenAI publisher FAQ via search excerpt, direct fetch 403; Ahrefs confirms for the Sources panel).
- GA4 now has a default channel "AI Assistant": medium exactly `ai-assistant`, or referrer on Google's list (ChatGPT, Gemini, DeepSeek, Copilot, Grok). It excludes AI Overviews and AI Mode, which count as Google organic (Google Analytics help, 2026).
- Regex for Explorations or a custom channel: `chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai` (secondary guides, consistent across several).
- Blind spots: apps and some paid tiers strip referrers (Ahrefs, 26 May 2025, STALE-RISK on per-assistant detail). Expect undercounting; many AI-influenced visits arrive as Direct or as branded search.
- Google AI Mode had a `noreferrer` attribution bug that put its clicks under Direct; Google fixed it (SEJ, 2025, exact date UNVERIFIED).
- Search Console Generative AI performance report (launched 3 Jun 2026, worldwide since 31 Aug 2026): impressions by page, country, device and date for AI Overviews and AI Mode. No query data; Google's help page shows impressions only. Google also added an opt-out toggle (17 Jun 2026) that it says is not a ranking signal.
- Bing Webmaster Tools AI Performance (public preview 10 Feb 2026): total citations, cited pages, grounding queries.
- Vercel: put the AI Bots ruleset in Log mode to see which bots hit the site (A).
- Use your own UTMs on ads as normal; they do not conflict with `utm_source=chatgpt.com`.

Baseline expectations: SE Ranking (101,574 sites, Jan 2025 to Apr 2026, published 18 Jun 2026) puts AI referrals at 0.32% of traffic: ChatGPT 74.8%, Gemini 11.6%, Perplexity 7.2%, Copilot 3.5%, Claude 2.6%. Ahrefs (35k sites, 26 Mar 2025, STALE-RISK) had 0.1%.

Local usage context: Google launched AI Mode in South Africa on 21 Aug 2025 and AI Overviews were already live (TechCentral). A Stitch/Looka survey of about 3,000 digitally active South Africans (Mar 2026) reports 31-34% actively use ChatGPT; this is an online sample, not the population. An Experian survey (483 credit-active consumers, 16 Sep 2026) found most respondents would trust LLMs to compare loans. Ad-exposed prospects will plausibly ask an assistant about the brand.

## 5. YMYL caution for AI answers

- Google applies "even more weight" to strong E-E-A-T on finance topics and says trust is the most important element; its who/how/why self-check asks for visible authorship and disclosure of AI involvement (A, updated 5 Oct 2026). Google's guidance on AI-generated content requires human fact-checking and warns that mass AI pages without added value may breach the scaled content abuse policy (A). This site is being built with AI agents, so each page needs documented human (adviser/compliance) review.
- Independent audits find AI answers on money topics unreliable: Which? (Nov 2025, 40 questions, six tools incl. AI Overviews) found missed basic facts, vague or outdated citations, and rare referral to qualified advisers (B, UK). EBU/BBC (21 Oct 2025, 3,000+ answers, 18 countries) found 45% had a significant issue, 31% sourcing problems; Gemini 76% (B, news domain). A UK fintech's study (Saturn, Sep 2026) reports 57% incorrect or incomplete answers to financial questions; method not verified, treat as indicative only (C).
- BrightEdge (3 Jan 2026, US data) finds educational finance queries ("what is X") trigger AI Overviews far more than calculators or local searches. SortMyCover's explainers are in the trigger class. ZA prevalence is UNVERIFIED.
- FSCA/PA AI report (27 Nov 2025, secondary summary) says SA relies on existing frameworks (POPIA, FAIS) rather than AI-specific rules and flags inaccurate AI output as a consumer risk.
- Practical rules: (a) put the "information not advice" scope statement in the same paragraph as any definition so an extracted passage carries it; (b) no rands-per-month figures, no "you need X times salary" rules of thumb without a dated source and caveat; (c) never name or rank insurers; (d) publish "how we make money" as a plain extractable passage on the apex; (e) monthly, ask five engines "What is SortMyCover?", "Is SortMyCover legit?", "How does SortMyCover make money?" and log errors; fix the source page, then use each engine's feedback route.

## 6. Structure and content signals: what the data supports

- Position: Indig (Growth Memo, 23 Mar 2026; 18k-21k citations, sample size reported inconsistently) finds 44.2% of ChatGPT citations come from the first 30% of a page (C).
- Section length: SE Ranking (129k domains, Nov 2025) finds 120-180 word sections average 4.6 ChatGPT citations vs 2.7 under 50 words; pages with 19+ statistics 5.4 vs 2.8; expert quotes 4.1 vs 2.4; updated within 3 months 6.0 vs 3.6; referring domains the strongest predictor (B, correlational, ChatGPT only). New domains start with the lowest authority.
- Princeton/IIT Delhi GEO paper (arXiv 2311.09735, submitted Nov 2023, KDD 2024, v3 Jun 2024; STALE-RISK, tested 2023-era engines): citing sources, adding statistics and quotations raised visibility by up to 40%.
- Google says write for people, use clear headings and sections, add unique non-commodity perspective, use semantic HTML; it does not ask for chunking (A). Microsoft advises headings, tables, FAQ sections, evidence, fresh content, IndexNow (A).
- Brand: Ahrefs (75k brands, 12 Dec 2025, Spearman): YouTube mentions ~0.74, branded web mentions 0.66-0.71 across ChatGPT, AI Mode and AIO; backlinks and domain rating weaker. Ahrefs itself warns it is correlation (B). Most-cited domains in AIO (Ahrefs, 2 Sep 2026): YouTube 22.9%, Reddit 18.5%, Facebook 10.1%; no insurer or government site in the top 50 (B).

## 7. Schema and llms.txt

- Schema: Google says no special structured data is needed for AI features (A). Ahrefs tracked 1,885 pages that added JSON-LD against 4,000 controls (Aug 2025-Mar 2026): AIO -4.6%, AI Mode +2.4%, ChatGPT +2.2%, the last two not significant; caveat: pages were already heavily cited (B, 11 May 2026). OtterlyAI's 3-month test found most AI platforms could not read schema and could not answer a question present only in FAQ markup (C). Microsoft's Fabrice Canel said on stage in March 2025 that schema helps its LLMs understand content (A, spoken statement). Google FAQ rich results are limited to well-known government and health sites since Sept 2023, so the FAQPage JSON-LD on the holding pages earns no rich result. Keep markup accurate and matching visible text; do not spend more time on it. The current empty `sameAs` should be filled once real profiles exist.
- llms.txt: John Mueller, 17 Jun 2025: "no AI system currently uses llms.txt". Google's May 2026 guide says no AI text files or Markdown are needed (A, updated 10 Jul 2026). Log studies: 83 sites over 12 weeks (27 Apr-19 Jul 2026) saw 7 fetches by OpenAI's crawler, 9 by Anthropic, 0 by Perplexity (EZY, 27 Jul 2026, sample skewed to small businesses); SE Ranking's 300k-domain analysis found no correlation with citations (B). Coding agents such as Claude Code and Cursor do read llms.txt for developer docs, which does not apply to a consumer site (C).

## 8. UNVERIFIED / gaps

- No ZA-specific data on which sources AI engines cite for life-cover queries; I could not query live AI engines.
- ChatGPT's backend mix (own index vs partners) rests on reverse-engineering. Claude-on-Brave is unconfirmed by Anthropic.
- OpenAI help-centre pages returned 403; their content was taken from search excerpts and cross-checked against the OpenAI bots doc.
- The Perplexity research post and Search Engine Land pages were not directly fetchable.
- Whether blocking training tokens changes citation likelihood: no evidence found.
- Brave URL submission (search.brave.com/submit-url) comes from secondary guides only.
- Copilot having no separate crawler is from secondary sources.
- Exact publication dates are missing for the OpenAI and Perplexity bot docs and the SE Ranking llms.txt and ChatGPT-factors posts (data period Nov 2025).

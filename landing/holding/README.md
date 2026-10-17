# SortMyCover holding site (`landing/holding/`)

Static, dependency-free, about 25 KB total, no images, no JavaScript, no external requests.

**What it is:** the page set that goes live the hour `sortmycover.co.za` resolves, so Google indexes the brand and the trust layer (named entity, disclosure, contact, complaints, schema) before any ad runs.

**What it is not:** the quiz landing page. That is landing-page-builder's job from the approved reference. It collects no data (no form, no list sign-up) until compliance approves consent and privacy.

**Placeholders to replace:** the wordmark tick (inline SVG) is a stand-in for visual-producer's logo system. Also `{{CIPC_REG_NO}}`, `{{ADDRESS_*}}`, `leadvelocity.co.za`, `{{META_DOMAIN_VERIFICATION}}`, `icon-192.png`, `icon-512.png`, `og-image.png`, and the privacy text. See `deploy.md`.

## SERP plan: brand-query ownership checklist
- [ ] Exact domain `sortmycover.co.za` live on HTTPS; `.com` 301s to it
- [ ] Search Console domain property verified, sitemap submitted
- [ ] Google Business Profile claimed, NAP identical to the footer
- [ ] Organization schema (name, url, logo, parentOrganization, contactPoint, address)
- [ ] FAQPage schema on the home page, matching visible text exactly
- [ ] Social profiles @sortmycover (Facebook, Instagram), linked in `sameAs`
- [ ] About, How we make money, Privacy and Complaints live and linked from every footer
- [ ] Brand-search monitoring: weekly Search Console check of branded queries, position and CTR (target: position 1-3 for "sortmycover" by week 4)
- [ ] Later: Google Ads brand-term-only campaign once verification is confirmed

## Phase 1: 5 YMYL educational pages (titles and briefs only, not written)
1. **What is the life cover gap?** Explains work cover as a salary multiple versus bonds and debts, in third person with no figures about any person.
2. **What happens on a 30-minute call with a licensed adviser?** Step by step: who joins, what is asked, how the call runs, what happens after, no obligation.
3. **Is cover through work enough?** Plain look at what group cover is and common limits (ends with the job, set multiple of salary), without naming insurers or products.
4. **How to check a financial adviser is licensed** How to find an FSP number and look it up on the FSCA register. Trust-building and neutral.
5. **What SortMyCover does and does not do** Expands the disclosure: introductions only, flat fee from advisers, no commission, no advice, no product comparison, complaints route.

Rules for all five: Grade 5-7, no premiums, cover amounts, insurer or product names, no "best/cheapest/guaranteed", named author entity (Lead Velocity), reviewed by compliance-qa, Article and BreadcrumbList schema, internal links back to the home page. No blog farm; five pages only.

# SortMyCover / CoverKlaar: availability, legal and language checks

Version: AC-v1 · 2 Oct 2026 · Owner: brand-naming-lead · **Run by:** Jonathan (or the laptop Claude session with Jonathan logged in) · Results reviewed by brand-naming-lead + compliance-qa

**Why this is a checklist and not a set of results:** this agent's sandbox blocks outbound web access, so **no result has been filled in or guessed**. Every row says which tool to use, what to look for, and what "clear" means. Whoever runs it fills in **Result** (CLEAR / CONFLICT / OURS / BLOCKED) and **Date**, and pastes a screenshot or the whois output into `deliverables/brand-naming-lead/evidence/` named `{row-id}-{yyyymmdd}.png|txt`.

**Stop rule (identity: zero availability/legal collisions):** if any row marked **★ blocking** comes back CONFLICT, stop all public use of that name, mark `needs_human`, and tell brand-naming-lead. Do not pick a new name on the spot (0.1: the name is decided; a change is Jonathan's call). Non-blocking rows that come back CONFLICT are logged with a mitigation.

**URLs:** these are the portals as known at drafting. If one has moved, use the official replacement and note the URL you actually used in the Result cell. Do not use third-party "name checker" sites as evidence for CIPC or trademark rows.

**Human gates:** registering domains, reserving handles and filing trademarks are HUMAN GATE actions (2.2 / 4D.4). The agent prepares; Jonathan clicks. The ~R250 for domains is the only pre-payment spend allowed (0.1). **Trademark filing fees are not covered by that allowance** (NH-BN-08).

---

## A. Company register (CIPC)

| ID | Name | Tool / URL | What to look for | Pass criterion | Result | Date |
|---|---|---|---|---|---|---|
| A1 ★ | SortMyCover | CIPC BizPortal name search, https://www.bizportal.gov.za (Name search / Name reservation lookup). Search "SortMyCover", "Sort My Cover", "SortMy Cover". | Any registered or reserved company or close corporation named Sort My Cover, Sortmycover or a near-identical name, especially in financial services | No identical or confusingly similar active entity. (Lead Velocity trades as SortMyCover, so no new company is needed. A clash still matters for passing off.) | | |
| A2 | CoverKlaar | Same portal. Search "CoverKlaar", "Cover Klaar". | As A1 | As A1 | | |
| A3 | Both | Same portal: confirm **Lead Velocity (Pty) Ltd**'s own registration number and status | Active status; the exact registration number for the footer `{{CIPC_REG_NO}}` | Active. Number recorded in `build/decisions.md` and handed to search-findability-lead + contracts-drafter | | |

## B. Domains

| ID | Name | Tool / URL | What to look for | Pass criterion | Result | Date |
|---|---|---|---|---|---|---|
| B1 ★ | sortmycover.co.za | ZACR whois: `whois -h whois.registry.net.za sortmycover.co.za`, or https://www.registry.net.za (WHOIS lookup). Cross-check DNS with https://dns.google/query?name=sortmycover.co.za | Registered or available. If registered: registrant, registrar, creation date | **Available**, or **registered to Lead Velocity (Pty) Ltd / Jonathan's registrar account**. Anyone else = CONFLICT | | |
| B2 ★ | sortmycover.com | `whois sortmycover.com`, or https://lookup.icann.org | As B1 | As B1. If taken by someone else: CONFLICT on the defensive `.com` (non-fatal for launch, but log it and check for an active site in the same category) | | |
| B3 | coverklaar.co.za | As B1 | As B1 | As B1 | | |
| B4 | coverklaar.com | As B2 | As B2 | As B2 | | |
| B5 | Typos (watch list, no purchase) | whois for `sortmycovers.co.za`, `sort-my-cover.co.za`, `sortmycover.za.com`, `sortmycover.net` | Registered by an unrelated party, especially with a live site | Not registered by an unrelated party. If they are, record it for search-findability-lead monitoring. **No purchase without a gate** | | |
| B6 | sortmycover.co.za | https://dns.google after registration | A/AAAA/MX records resolve; MX ready for hello@ | Resolves. Recorded for devops-security (0.3 #6) | | |

## C. Trademarks (CIPC, classes 35 and 36)

| ID | Name | Tool / URL | What to look for | Pass criterion | Result | Date |
|---|---|---|---|---|---|---|
| C1 ★ | SortMyCover (word) | CIPC e-Services trade mark search, https://eservices.cipc.co.za (Trade Marks → Search), or the CIPC IP portal if it has moved. Search "SORTMYCOVER", "SORT MY COVER", "SORT" + "COVER" in classes **35 and 36** | Identical or confusingly similar registered or pending marks in 35/36 (for example "Sorted Cover", "MyCover", "CoverSort") | No identical mark, and no confusingly similar one for overlapping services. Similar marks found → list them and send to the trade mark attorney (D-rows) | | |
| C2 ★ | Tick device | Same portal: device or figurative search in classes 35/36 for a "tick / check mark in circle" | A circled tick already registered for financial or insurance services | No close device in 36. Ticks are common, so expect some. The test is whether ours plus the wordmark is distinguishable. Send the findings to the attorney | | |
| C3 | SortMyCover | WIPO Global Brand Database, https://branddb.wipo.int. Filter designated country ZA, classes 35/36 | International (Madrid) marks covering ZA | No identical or similar mark designating ZA | | |
| C4 | CoverKlaar (word) | As C1, with "COVERKLAAR", "COVER KLAAR", "KLAAR" | As C1 | As C1 | | |
| C5 | Both | Common-law use: Google search `"sort my cover"`, `"sortmycover"`, `"coverklaar"` (SA and global), plus the Facebook and Instagram search bar | Unregistered businesses already trading under the name in SA, particularly in insurance or finance | No SA trader in insurance or finance using it. Others → log them; passing-off risk goes to the attorney | | |

## D. Trade mark filing notes (prepared for the attorney; filing is a human gate)

| ID | Item | What to ask / prepare | Pass criterion | Result | Date |
|---|---|---|---|---|---|
| D1 | Applicant | Lead Velocity (Pty) Ltd as applicant (not Jonathan personally) | Confirmed | | |
| D2 | Marks | (a) word mark SORTMYCOVER; (b) the tick device as built by visual-producer (SVG master, with an authorship record that it is human-directed and code-built); (c) optional composite wordmark | Representations exported from `brand/logo/` | | |
| D3 | Classes | 35 (advertising, marketing and lead introduction services) and 36 per 4D.4b.5 #9 | Attorney confirms the classes | | |
| D4 ★ | Descriptiveness | Ask: "Is SORTMYCOVER at risk of an examiner objection or a later challenge as descriptive of insurance-related services in class 36? Does adding the device fix it?" | Attorney view written down. If the risk is high, file the composite or device as well (Ehrenberg-Bass: the device is what we can own) | | |
| D5 ★ | Class 36 specification | The wording must describe **providing information** and **introductions/referrals to authorised financial services providers**. It must **not** say "insurance brokerage", "insurance advice", "financial advisory" or "underwriting". Those would contradict our not-an-FSP position (2.3, *Raspberry Academy*) | Attorney-drafted spec with none of those terms; checked by contracts-drafter | | |
| D6 | ™ / ® | Use ™ from launch. ® only after registration | Noted in the bible §4 | | |
| D7 | Cost | Official CIPC fees per class per mark, plus attorney fees | Jonathan approves the spend (NH-BN-08) | | |

## E. Meta and social handles

| ID | Name | Tool / URL | What to look for | Pass criterion | Result | Date |
|---|---|---|---|---|---|---|
| E1 ★ | Facebook Page name "SortMyCover" | Facebook search "SortMyCover" / "Sort My Cover". When creating the Page, category **"Website" or "Education"**, never Insurance/Financial (4.7) | Existing Pages with the same or a confusingly similar name in insurance or finance | No such Page. Our Page created inside the Lead Velocity portfolio | | |
| E2 ★ | Facebook username @sortmycover | https://www.facebook.com/sortmycover | "Content isn't available" or a 404 means free. Free → claim it on Page creation | Free, or already ours | | |
| E3 ★ | Instagram @sortmycover | https://www.instagram.com/sortmycover/ | "Sorry, this page isn't available" means free | Free, or ours (linked to the Page, Business type) | | |
| E4 | Instagram @coverklaar | https://www.instagram.com/coverklaar/ | As E3 | Free → reserve (4.7 #3) | | |
| E5 | Facebook @coverklaar | https://www.facebook.com/coverklaar | As E2 | Free → reserve only if a second Page is created. Otherwise note it as unreserved | | |
| E6 ★ | WhatsApp display name "SortMyCover" | WhatsApp Manager → phone number → display name review (meta-operator, 4.7 #4) | Display name approved; it must match the website and Page name | Approved | | |
| E7 | TikTok @sortmycover / @coverklaar | https://www.tiktok.com/@sortmycover, https://www.tiktok.com/@coverklaar | "Couldn't find this account" means free | Free → reserve (park, no content, 4.7 #8) | | |
| E8 | YouTube @sortmycover / @coverklaar | https://www.youtube.com/@sortmycover, https://www.youtube.com/@coverklaar | 404 means free | Free → reserve on a Lead Velocity Google account | | |
| E9 | LinkedIn page sortmycover / coverklaar | https://www.linkedin.com/company/sortmycover, https://www.linkedin.com/company/coverklaar | "Page not found" means free | Free → reserve under Lead Velocity's admin | | |
| E10 | X @sortmycover / @coverklaar | https://x.com/sortmycover, https://x.com/coverklaar | "This account doesn't exist" means free | Free → reserve | | |
| E11 | Impersonation sweep | Search each platform for "sortmycover" variants (`sort_my_cover`, `sortmycover_za`, `sortmycoverza`) | Look-alike accounts | None. Look-alikes → log, report to the platform after launch | | |
| E12 | Record | All handles and IDs written to the `brands` row (4.7 #8) | — | Row complete | | |

## F. Language safety (native-speaker review)

**Who reviews:** one native speaker per language, **not** a machine translator. Ideally two per language, one urban and one rural or older register. Use people in the ICP (35–50, working, with a bond and children) found through Jonathan's and KG's networks, the same pool as 6B.3. Brokers must not review (conflict). Each reviewer gets the name **written** and **spoken aloud** (record it), the line, and the tick image.

**Questions every reviewer answers, in writing:**
1. Said aloud in your language, does "SortMyCover" (or any part: "sort", "my", "cover") sound like a word or phrase that is rude, sexual, about death or illness, unlucky, or a slur?
2. Does any part read as slang with a bad meaning? (For example, English "I'll sort you out" can mean a threat. Does that come through?)
3. Does the name sound like a scam, a loan shark, or "too good to be true"?
4. Does it sound like an insurance company or a bank? (It should not.)
5. Would you trust a WhatsApp from "SortMyCover" about a call with an adviser? Why or why not?
6. Is the tick image positive and neutral to you? Does amber or orange carry a negative meaning in your community (mourning, a political party, a taxi association, a competitor)?
7. How would you spell it if you heard it on the radio? (A typing test for Search Lift.)
8. Score 1–5: easy to say; easy to remember; feels trustworthy.

| ID | Language | Name(s) to review | Reviewer (name, age band, area) | Extra question for this language | Pass criterion | Result | Date |
|---|---|---|---|---|---|---|---|
| F1 ★ | isiZulu | SortMyCover | | Does "sort" or "cover" sound like an isiZulu word with a negative meaning? | No negative meaning; average score ≥ 3 on all three | | |
| F2 ★ | isiXhosa | SortMyCover | | As F1 | As F1 | | |
| F3 ★ | Sesotho | SortMyCover | | As F1 | As F1 | | |
| F4 ★ | Afrikaans | SortMyCover **and CoverKlaar** | | (a) Is "SortMyCover" said the same in Afrikaans as in English (4D.2 rule 3)? (b) **"klaar"** = done or finished. Next to *life cover*, does "CoverKlaar" read as "finished off / dead" ("hy is klaar")? (c) Does the English–Afrikaans mix in CoverKlaar sound natural, cheap or jokey? | SortMyCover: no issue. CoverKlaar: (b) must be a clear "no" before any public use | | |
| F5 | English (SA) | SortMyCover | | Does "sort" sound unserious for money? | Average "trustworthy" ≥ 3 | | |
| F6 | Optional: Setswana, Sepedi | SortMyCover | | As F1 | As F1 | | |

Results feed 6B.11 (language and reach) and the Phase 6 CoverKlaar decision (bible §13).

## G. Google Business Profile

| ID | Name | Tool / URL | What to look for | Pass criterion | Result | Date |
|---|---|---|---|---|---|---|
| G1 | SortMyCover | Google Maps and Search for "SortMyCover", "Sort My Cover" | An existing profile with the same or a similar name | None. Ours is not created yet | | |
| G2 ★ | Eligibility | Google Business Profile guidelines (https://support.google.com/business, "Guidelines for representing your business on Google") | Whether a **virtual-only** service (meetings only by WhatsApp, video or phone, with no in-person customer contact) is eligible, and whether a service-area business with the address hidden fits | Written finding. **If ineligible: do not create a profile with a fake address or fake service area.** Remove the GBP items from the trust layer and placements and use Organization schema + social profiles instead (NH-BN-06; search-findability-lead decides) | | |
| G3 | NAP | If eligible: name, address and phone exactly as in the site footer | — | Identical across GBP, footer and schema | | |

## H. Advertising and regulatory name exposure

| ID | Check | Tool / URL | What to look for | Pass criterion | Result | Date |
|---|---|---|---|---|---|---|
| H1 ★ | ARB misleading-name exposure | Advertising Regulatory Board, https://www.arb.org.za: (a) Code of Advertising Practice, the sections on misleading claims and implied guarantees; (b) the rulings search for "cover", "sorted", insurance-lead and comparison sites | Rulings against names or claims that imply an outcome ("sorted" read as "your cover is guaranteed done") or an insurer status | No ruling against a comparable name. Ad copy keeps "sort" as the consumer's action ("Sort your cover"), never our promise ("We'll sort your cover"). Findings added to compliance-qa's register | | |
| H2 ★ | FAIS "holding out" | Practitioner opinion (2.3) | Whether "SortMyCover" combined with "a real adviser" could be read as Lead Velocity holding itself out as an FSP | Add one question to the practitioner brief (contracts-drafter `practitioner-brief.md`). The answer is recorded | | |
| H3 | Conflict with SA financial brands (4D.3 hard exclusions) | Google search plus the Meta Ad Library (SA) for Naked, Pineapple, Simply, Hippo, 1Life, King Price, BrightRock: does any of them use "sort", "sorted" or a tick device in its brand or tagline? | Visual or verbal overlap | No overlap with the device or line. Overlap → bible review | | |
| H4 | Meta Page category | When creating the Page | Category "Website" or "Education" only (4.7) | Set correctly | | |

---

## Sign-off

| Role | Name | Date | All ★ rows CLEAR or OURS? |
|---|---|---|---|
| Ran the checks | | | |
| brand-naming-lead review | | | |
| compliance-qa review | | | |
| Jonathan (decision on any CONFLICT) | | | |

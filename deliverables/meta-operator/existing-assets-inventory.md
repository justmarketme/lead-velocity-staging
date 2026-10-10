# SortMyCover Page/IG: existing-assets inventory (Step 0)

Date 2026-10-05. Read-only. Nothing was created, clicked or changed. Meta was checked in Chrome on Jonathan's login (justmarketme@gmail.com). Public handle lookups were made from the same browser.

## Meta (Business Suite / Business Settings)

| Item | Where | Exists? | REUSE / EXTEND / NEW | Why |
|---|---|---|---|---|
| Business portfolio "jono" (ID 2933520516724270) = de facto Lead Velocity portfolio | business_id from the Lead velocity Page's Business Suite home (hidden from the switcher) | Yes. Owns the **Lead velocity** B2B Page (774748685722096) + Sanitara Page + @sanitara_mask IG; no ad accounts; legal name blank; unverified; 2FA "No one" | **REUSE, EXTEND later** | It already owns the LV B2B Page, so SMC goes in here (never a second portfolio). Legal name `Lead Velocity (Pty) Ltd` + CIPC address get filled at G1 once NH-20 details exist; a Page needs none of that. |
| Business portfolio "Just Market Me" (ID 503177970319809) | Settings > Business info | Yes. Unverified, 2FA "No one", ad-account limit 1, legal name Just Market Me | **Do not use for SMC** | Wrong legal entity. Disclosure and Business Verification must say Lead Velocity (Pty) Ltd. |
| Page "Lead velocity" (facebook.com/LeadVelocitySA, ID 774748685722096) | Portfolio "jono" > Pages | Yes, owned by "jono" | **REUSE as-is (do not touch)** | The B2B Page (runbook 0.4). |
| Page "Sort My Cover" (61595175929084) | Created 2026-10-05 from the profile | Yes (not yet in portfolio) | **NEW → done** | It doesn't exist. facebook.com/sortmycover shows "content isn't available", so the username looks free. Confirm on the username screen. |
| Page "SortMyCover South Africa" (standby, G2b) | — | No | NEW (later, optional) | Not in scope of this task's 3 goals. Flagged only. |
| Other Pages (Just Market Me agency, Sanitara, De Jager Legacy, Ohsandqa) | Just Market Me portfolio / personal | Yes | Ignore | Unrelated clients and brands. |
| Instagram @sortmycover | instagram.com/sortmycover | No ("Profile isn't available") | **NEW** | Looks free. Confirm on the create screen. |
| Instagram @coverklaar | instagram.com/coverklaar | No ("Profile isn't available") | NEW (parking only) | Looks free. Reserve as G2d says. |
| Facebook /coverklaar | facebook.com/coverklaar | No | Not needed now | The checklist only reserves IG for CK. |
| IG accounts in a portfolio | Just Market Me > Instagram accounts | None | — | Sanitara's IG (14 followers) is linked to its Page, not to SMC. Irrelevant. |
| Ad accounts | Just Market Me > Ad accounts | "Just Market Me ad account" (1482921941883783); "dejager legacy ad account" (client-owned) | **Do not use for SMC**; NEW `SortMyCover - Main` later (G3) | Wrong entity, and this portfolio's creation limit is 1. Not needed for the 3 goals here (no ads). |
| Datasets / Pixels | Just Market Me > Datasets & pixels | None | NEW later (G5) | Not needed for Page/IG/warm-up. ID recorded when created. |
| WhatsApp accounts | Just Market Me > WhatsApp accounts | None | NEW later (G4) | Out of scope for this task. |
| Apps | Just Market Me > Apps | None | NEW at G6 only on "go G6" | — |
| System users | Just Market Me > System users | None ("Add" greyed out: needs verification or app) | NEW at G6 | — |
| Existing posts, scheduled content, saved audiences for SMC | — | None (no SMC Page) | — | Nothing to reuse. |

## Repo

| Item | Where | Exists? | REUSE / EXTEND / NEW | Why |
|---|---|---|---|---|
| FB + IG profile picture | `brand/exports/profile/fb-profile-1024.png`, `ig-profile-1024.png` | Yes | **REUSE** | Built from `brand/templates/profile.html`. Exactly what G2a #10 and G2c #8 name. |
| FB cover | `brand/exports/cover/fb-cover-851x315@2x.png` | Yes | **REUSE** | G2a #11. Check the mobile crop at upload. |
| IG highlight covers (4 topics) | `brand/exports/instagram-highlights/` | Yes | REUSE (optional) | Ready if highlights are added later. |
| Feed post template | `brand/templates/feed.html` + `brand/exports/render.mjs` | Yes, parameterised (hook/sub/props/line), 1:1 and 4:5 | **EXTEND** (new `jobs[]` entries only) | The two exported samples are the C01 *ad* layout with an unsourced "2–4×" claim (NH-PCD-01) and a placeholder rand prop, so they are unfit for organic posts. Rendering 5 educational stills from the same template is new data, not new code. |
| `brand/exports/whatsapp/what-to-expect-1080x1080.png` | brand exports | Yes | **REUSE** for the "30-minute call" post | Already an educational, broker-neutral card. |
| Warm-up post sources (5 Learn articles) | `landing/holding/learn/*.html` | Yes. Compliance "PASS WITH FIXES" (phase4-review-2 §5a; P-2 depends on sourcing "2–4×") | **REUSE** as copy source | Exactly what G8 names. Drop the "2–4×" figure from the posts until it is sourced. |
| Ad creatives C01–C17 | `deliverables/visual-producer/assets/` | Yes (ads, with CTAs and end-cards) | Do not reuse for organic | These are ad creatives. Posting them organically pre-empts the ad tests. An optional video (C13/C14 myth-bust) needs a compliance check first. |
| Disclosure DISC-FULL-v1 / S97 / S148 | `deliverables/brand-naming-lead/disclosure-wording.md` | Yes | **REUSE verbatim** | Page About = FULL; Page intro = S97; IG bio = S148. |
| Warm-up post copy | anywhere | No | **NEW** | Step 3 drafts it. |
| `brands` table (`business_id`, `page_id`, `ig_user_id`, `ad_account_id`, `dataset_id`, `handles`, etc.) | `supabase/migrations/20261002020000_smc_02_core.sql` | Yes. SMC row seeded with NULL IDs | **REUSE** | IDs go here, plus `meta-ids.md`. |
| Console "Settings > Brands" screen | `src/pages/smc/` | **No** (only Today/Ads/Ask/Payments) | Gap, out of scope | The checklist says "type ID into Settings > Brands", but that screen doesn't exist. Use an SQL update or `meta-ids.md` for now. |
| W27 Meta asset health | `automation/W27.json` | Built, inactive | REUSE | Starts reading once `page_id`/`ig_user_id` are set and G6 exists. |
| W30 comments / W31 DMs | `automation/W30.json`, `W31.json` | Built, inactive | REUSE | Need Page/IG IDs plus G6 token and webhooks. |
| Console Ads API | `automation/ads/CONSOLE-ADS-API.md`, `meta-ads.js` | Contract + lib, not live | REUSE (later) | Ads only, nothing for organic. |
| CRM organic post scheduling | — | No | Not built (by design) | G8 says Jonathan posts by hand from Business Suite, with no posting scripts. |
| `meta-ids.md`, `screens/` | `deliverables/meta-operator/` | No | NEW (Step 4) | — |

## Gaps

1. **Portfolio resolved:** "jono" (2933520516724270) owns the Lead velocity B2B Page, so it is the Lead Velocity portfolio. SortMyCover Page + IG are created inside it. Still to do at G1 (not blocking Page/IG): rename to Lead Velocity (Pty) Ltd, legal name + CIPC address (NH-20), 2FA required for everyone, add KG as admin, primary Page → Lead velocity. Sanitara Page + @sanitara_mask IG also live in this portfolio. They are left untouched; move them out before Business Verification if they aren't Lead Velocity's.
2. Do not use Just Market Me: it is the wrong legal entity.
3. Handle availability is based only on public "not available" pages. Each one is confirmed on the username field during creation.
4. Organic feed images: there are no educational stills. 4 new renders come from the existing `feed.html` template; the 5th reuses `what-to-expect`.
5. The console has no Brands settings screen, so IDs go to `meta-ids.md` and the `brands` row by SQL (flag for platform-architect).

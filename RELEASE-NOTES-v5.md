# Release notes: release/v5-2026-10-22

One branch for everything SortMyCover runs on, plus W40 (built, not deployed). Made on 22 Oct 2026 from:

| Part | Source branch @ commit | State |
|---|---|---|
| n8n runtime libs + workflows, Supabase functions, migrations | `fix/smc-smoke-2026-10-21` @ `a4a2bff` (base of this branch) | **Live** |
| Site sortmycover.co.za | `feat/smc-footer-legal-2026-10-21` @ `dac29e8` (merged `--no-ff`; already contains `fix/smc-site-polish-2026-10-21` @ `35ed17a` and the `/start/` fixes `c7234e6` / `a31f635` as `e92c70d` / `30ae6c4`) | **Live** |
| CRM (leadvelocity.co.za) | same `src/` as the live CRM build `release/crm-smoke-2026-10-21` @ `425d561` (local branch in `C:\Users\Jono\lv-deploy-portal`) | **Live** (source equal, see below) |
| W40 Lindi on Facebook and Instagram | `feat/smc-social-lindi` @ `77e903a` (merged `--no-ff`) | **Built, not deployed.** Switches off |

Both merges were clean (no conflicts). The `/start/` cherry-picks merged as no-ops: `c7234e6` and `a31f635` were already in the
smoke branch, and the footer branch carries the same changes as `e92c70d` and `30ae6c4`. One extra commit fixes the `Makefile`
`test` target (it still named the billing and optimisation tests that the D5 cleanup `2c46c9d` deleted; it now runs
`automation/ads/*.test.js` and `optimisation/spc.test.js`). The Makefile is not shipped anywhere.

## Proof: this branch equals what is live (checked 22 Oct 2026, 09:00-09:45 SAST)

**n8n VPS (`/opt/leadvelocity-n8n/repo`, everything `deploy.sh` ships, `.env` excluded).** SHA-256 of every file on the VPS
against `git archive` of the same paths: 622 of 622 files equal `a4a2bff`, no extra and no missing file. Against this branch,
the only differences are the W40 files below (`automation/lib/social.mjs` new, `automation/lib/w22.mjs`, `automation/index.cjs`,
`automation/W02.json`, `automation/W40.json`, `conversation/lines.mjs`, `conversation/handoff.md`,
`conversation/prompts/lindi-social.md`, `knowledge/faq.md`, `community/*`, docs and tests) and three site files shipped with
the runtime (`sites/sortmycover/config/site.json`, `config/evidence.json`, `scripts/build.mjs`), which are the live site's own
versions from the footer branch. Every other `automation/lib` file is byte-identical.

**Supabase functions (project `cmsylaupctrbsvzrgzwy`), deployed source vs this tree (`get_edge_function`, every bundled file):**

| Function | Live version | Result |
|---|---|---|
| smc-voice | v29 | `index.ts`, `_shared/smc_voice_lib.ts`, `_shared/spoken.ts` equal. `_shared/smc_receptionist_persona.ts` differs **in a two-line comment only** (v29 was bundled from `3809fc2`; `a9fad7a` then reworded the comment about `?agent=smc-chat&apply=1`). No code or prompt difference |
| sync-voice-agents | v40 | all 3 files equal |
| smc-transcribe | v11 | equal |
| smc-client-email | v13 (redeployed 22 Oct 07:07 SAST by another session) | all 4 files equal, incl. `_shared/smc_layout.ts` |
| smc-email-send | v10 | equal |
| team-notify | v10 | equal |
| smc-lindi-chat | v11 (redeployed 22 Oct 07:11 SAST by another session) | equal |

**Site.** `npm run build` in `sites/sortmycover` (75 routes) vs `https://sortmycover.co.za`: all 75 pages, all 59 `/assets/`
files, `sitemap.xml`, `robots.txt` and the 404 page are byte-identical (the 10 campaign pages `_c/<slug>/` are served from
`https://<slug>.sortmycover.co.za/` and match there; the apex `/_c/...` path 307-redirects to them). 67 of the other 75 static
files (images, fonts, favicons, email assets) are byte-identical; the remaining 8 PNGs (`apple-touch-icon.png`, `og-image.png`,
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `mstile-150x150.png`, `email/wordmark-navy.png`,
`email/wordmark-white.png`) are re-encoded by Hostinger and are **pixel-identical** to the build (same size, zero pixel
difference).

**CRM.** `src/` differs from the live CRM source `425d561` only by one extra test file (`src/lib/adConsent.test.mjs`);
`package.json`, `package-lock.json`, `vite.config.ts`, `index.html`, `public/`, Tailwind/TS configs and `vercel.json` are
identical. The live CRM deployment is `lead-velocity-staging-4qm8twnmb` (dpl_DMeiuccH7eZNtM7k9UfuQbsQU4b6).

## Test evidence (this worktree, `C:\tmp\lv-release-v5`)

| Suite | Result |
|---|---|
| `LV_TEST_PG=docker node --test automation/tests/*.test.mjs` (incl. the `.local` Docker Postgres tests) | 1049 tests: 1048 pass, 0 fail, 1 skipped (I-42b needs native Postgres binaries) |
| Deno: all 15 `supabase/functions/**/*.test.ts` (`deno test --node-modules-dir=none --allow-read --allow-env --allow-net=127.0.0.1,localhost`, type-checked) | 153 pass, 0 fail |
| `sites/sortmycover`: `npm run verify` (build + vitest) | build OK (75 routes). First vitest run: 554 pass, 4 timed out at the default 5 s under machine load (all `tests/content.test.ts`); re-run `npx vitest run --testTimeout=30000`: 558 pass, 0 fail, 1 skipped |
| CRM: `node --test src/lib/*.test.mjs src/utils/*.test.mjs tests/*.test.mjs` | 60 pass, 0 fail (incl. the broker live-booking RLS test, PGlite) |
| CRM: `npm run typecheck:smc`, `npx tsc -p tsconfig.app.json --noEmit`, `npx vite build` | all pass |
| `node evals/run.mjs --dry-run` | PASS (FAIS 100%, tone 100%, STOP 100%, prefilter FP 0%) |
| `automation/media` | 35/35 |
| `scripts/*.test.mjs` | 25/25 |
| `automation/ads/*.test.js` + `optimisation/spc.test.js` | 35/35 + 18/18 |
| `automation/templates/check.mjs` | 66 templates, 0 errors |
| `build/validate-tasks.mjs` | valid |

Not run: the landing Playwright/axe suite (no landing change).

## Deploy commands (none of these were run for this release)

Every step is a production change and needs Jono's go. `deploy.sh` ships committed files from a git ref, so the branch must be
clean; it does not need to be pushed. `ssh emma-vps` is key-only: always `-n` or `-o BatchMode=yes`.

### n8n runtime (VPS)

Shipping this branch is **not** a no-op: it also ships the W40 lib changes. With `SOCIAL_MODE` unset W40 does nothing and W02
(until re-imported) is unchanged, but these go live at once:
- `knowledge/faq.md` FAQ-02, FAQ-09, FAQ-23 (W07 reads it at runtime: WhatsApp Lindi's answers change to "SortMyCover takes no fee
  from you for the call" wording, no "free", no licence words),
- `automation/lib/w22.mjs`: `community_escalation` now goes to both partners with W40 wording; new red signals
  `social_distress`, `social_breaker`.

Ship the live line only (what runs now): `automation/emma-vps/deploy.sh a4a2bff`.
Ship v5 (W40 inert): from `C:\tmp\lv-release-v5`, `automation/emma-vps/deploy.sh release/v5-2026-10-22`.
- Post-check: `ssh -n emma-vps 'grep -c "social-v1.0.0" /opt/leadvelocity-n8n/repo/automation/lib/social.mjs; docker ps --format "{{.Names}} {{.Status}}" | grep lv-n8n-n8n'` shows `1` and `Up`;
  `curl -s -o /dev/null -w "%{http_code}\n" https://n8n.sortmycover.co.za/healthz` returns 200.
- Rollback: `automation/emma-vps/deploy.sh a4a2bff`.
- Workflows: only after the libs, `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh <W..>'`.
  The workflow JSON on the VPS equals `a4a2bff`, and this branch changes only W02 (W40 hand-off) and W40 (new): import those
  only in the W40 window. (Which versions n8n has published was checked by the smoke deploy on 22 Oct, not by this release.)
- Synthetic test only: `ssh -n emma-vps 'bash /root/wa-smoke.sh <number on SYNTHETIC_TEST_NUMBERS> "hi"'`.

### Supabase functions

Nothing to deploy: all seven SMC functions above already run this source. If one must be redeployed, from this worktree:
`npx supabase functions deploy <name> --project-ref cmsylaupctrbsvzrgzwy --use-api` with `--no-verify-jwt` for
`smc-voice`, `smc-transcribe`, `smc-client-email`, `smc-email-send` and `smc-lindi-chat` (`team-notify` and
`sync-voice-agents` keep JWT verification on). Redeploying `smc-voice` would change only the persona comment.
After `sync-voice-agents`: `POST ?agent=smc` (phone agent) and `?agent=smc-chat` (dry-run drift check of the WhatsApp twin;
`&apply=1` pushes it), with the service-role key.

### Database

The five migrations of this line (`20261021120000` to `20261021150300`, undo files in `supabase/migrations/undo/`) are applied
live (smoke runbook steps 1-4 and 22). **Never `supabase db push`** (see `RELEASE-NOTES.md`: live history and repo do not
match). W40 needs no migration.

### Site (Hostinger)

In `sites/sortmycover`: `npm ci`, `npm run verify`, then `npm run pack -- smc-site.zip`. Back up `public_html` first
(`/site-backup-<date>`), upload the zip in hPanel > File Browser > `/public_html/`, then
`PATCH .../api/resources/public_html/smc-site.zip?action=unarchive&destination=/public_html&override=true` (retry on a 500),
delete the zip, and **flush the CDN** (hPanel > Performance > CDN > sortmycover.co.za > Flush cache). Check live pages against
`dist/` afterwards. This build is identical to the live site, so there is nothing to upload today.
Before the next upload: `config/site.json company.directors` is still empty (the build warns; `/legal/` shows no Directors row).

### CRM (Vercel)

Build from this branch (or the equal `425d561`) with `VITE_SMC_ENABLED=true` and `VITE_LEGAL_AI_ENABLED` empty, then
`npx vercel --prod --yes`. Record the current production URL first; rollback is
`npx vercel promote <previous production URL> --yes` (today's previous one: `lead-velocity-staging-ri9fxvy4q-jonos-projects-8697404e.vercel.app`).
Never deploy without the purchased-leads orders feature (it is in this tree).

## Built, not deployed: W40 Lindi on Facebook and Instagram

Runbook: `DEPLOY-RUNBOOK-SOCIAL.md` (in this branch). In short:
1. Jono's Meta clicks (runbook Part A), sign-offs from Jono and KG on `conversation/prompts/lindi-social.md` and the `SOCIAL_*` lines.
2. Env (B2): `SOCIAL_MODE=shadow`, `SOCIAL_CHANNELS=fb_comments,ig_comments,ig_dm,messenger`, `SOCIAL_HUMAN_PAUSE_HOURS=24`;
   Jono sets `SOCIAL_HASH_SALT` himself on the VPS (never printed, never rotated).
3. Libs (B3): `automation/emma-vps/deploy.sh release/v5-2026-10-22` (this branch replaces the runbook's `feat/smc-social-lindi`).
4. Import (B4): `ssh -n emma-vps 'bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W40 W02'`.
5. Signed synthetic events (B5), Meta subscriptions (B6), a 7-day shadow week (B7), then live one channel at a time (B8).
- Kill switch: `SOCIAL_MODE=off` (W40 does nothing, W02 forwards nothing). Do not use `DRY_RUN_SENDS` for the shadow week: it
  stops every live send.
- Privacy notice additions for social are already live on the site (PN-v1.6-web); the draft is
  `deliverables/social-lindi/PRIVACY-NOTICE-ADDITIONS-SOCIAL.txt`.

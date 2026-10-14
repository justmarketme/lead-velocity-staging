# Lead Velocity

CRM + broker portal (React 18, Vite, TypeScript, shadcn/ui, Supabase). Also holds the SortMyCover build
(n8n workflows, landing pages, brand, deliverables). Start with `CLAUDE.md` and `KNOWLEDGE_TRANSFER.md`.

**Work from branch `release/smc-nurture`.** `git pull` first; the repo is shared, so commit only your own files and never force-push.

## Run, build, test
```
npm ci                 # also sets core.hooksPath=.githooks (secret-scan pre-commit)
cp .env.example .env   # fill VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (anon key only)
npm run dev            # http://localhost:8080
npm run build          # production bundle -> dist/
npm run lint           # eslint (baseline: many pre-existing no-explicit-any errors)
npx tsc --noEmit -p tsconfig.app.json   # baseline: ~25 pre-existing errors, build does not depend on it
npm run typecheck:smc  # SortMyCover files
npm run tasks:validate
```
Portal login is `/broker`; admin login is `/login`. Broker pages: `/broker-elite` (dashboard), `/broker/profile`,
`/broker/messages`, `/broker/orders`, `/broker/documents`, `/broker/set-password`, `/broker/forgot-password`.

## Deploy (frontend)
`git push` deploys nothing. Production (https://leadvelocity.co.za, Vercel project `lead-velocity-staging`) is deployed by CLI
from a clean detached checkout of the pushed branch:
```
git fetch && git -C ../lv-deploy-portal checkout --detach origin/release/smc-nurture
cd ../lv-deploy-portal && npx vercel --prod      # directory already linked (.vercel/)
```
Then smoke-test `/broker` login. Edge functions: `npx supabase functions deploy <name> --project-ref cmsylaupctrbsvzrgzwy`.
Migrations: `supabase/migrations/` (see `APPLY-RUNBOOK.md` there); apply deliberately, they are not auto-run.

## Secrets (never in git)
- Browser build: only `VITE_*` public values (Supabase URL + anon key). Set in Vercel (Production). Never put a server secret in a `VITE_` var.
- Server secrets (service role, Resend, Twilio, ElevenLabs, Microsoft, Gemini): Supabase function secrets (`supabase secrets set`), n8n credentials on the VPS, and the password manager. `automation/local/CREDENTIALS.md` lists names only.
- Local `.env*`, `.vercel/`, `*.zip` are git-ignored; `.githooks/pre-commit` blocks common key formats and service-role JWTs.

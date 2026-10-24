# Mark go-live: instructions for a Claude session on Jonathan's laptop

Run Mark's go-live from this repo:

1. `git fetch origin claude/relaxed-edison-0hcidb`, check it out and fast-forward it. Stop and tell Jonathan if there are uncommitted changes.
2. Run: `GO_LIVE_YES=1 bash scripts/go-live-20261024.sh`
   It does: database visibility change + check, ships n8n to the VPS and imports W01 W03 W41, deploys the portal with `vercel --prod`, and submits the `broker_lead_routed` WhatsApp template.
3. If any step prints STOPPED, show Jonathan the exact line and what it needs. Don't work around it, and don't edit `.env` files without asking him.
4. Do NOT run `switch-on`. That waits for Meta to approve the template.
5. At the end, report: which steps passed, the template SID it printed, and whether it warned that `SMC_TEST_BROKER_IDS` isn't set.

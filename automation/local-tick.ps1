# RETIRED 11 Oct 2026: n8n no longer runs on the laptop. Its home is the EMMA VPS (76.13.252.92):
#   https://n8n.sortmycover.co.za  ->  Caddy  ->  127.0.0.1:5678 (docker compose in /opt/leadvelocity-n8n)
#   deploy / update:  automation/emma-vps/deploy.sh [git-ref]      ops:  ssh root@76.13.252.92 /opt/leadvelocity-n8n/dc ps
# The scheduled task LeadVelocity-n8n-Keeper that ran this file is disabled (kept, not deleted). This stub only
# logs and exits, so re-enabling the task by mistake starts nothing (no local n8n, no SSH or cloudflared tunnel).
# Local n8n for offline debugging, by hand only:
#   docker compose --env-file .env -f automation/docker-compose.yml up -d     (from the repo root; editor at http://localhost:5678)
# ASCII only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
$state = Join-Path $env:LOCALAPPDATA 'lv-n8n'
New-Item -ItemType Directory -Force $state | Out-Null
"$(Get-Date -Format s) local-tick.ps1 is retired - n8n runs on the EMMA VPS (https://n8n.sortmycover.co.za); nothing to do" | Add-Content (Join-Path $state 'tick.log')
exit 0

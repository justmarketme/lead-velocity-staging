#!/usr/bin/env bash
# Ship the n8n runtime to the EMMA VPS and (re)start it. Run from the repo root (Git Bash on the laptop):
#   automation/emma-vps/deploy.sh [git-ref]        # default HEAD; ships committed files only
# What lands on the VPS (/opt/leadvelocity-n8n):
#   repo/        the runtime dirs below from <git-ref> (Code nodes load them through lv-automation, read-only mount)
#   repo/.env    NOT shipped; kept across deploys. First time: copy the repo-root .env there (chmod 600, LF endings)
#                with N8N_PUBLIC_URL=https://n8n.sortmycover.co.za, WEBHOOK_URL and N8N_EDITOR_BASE_URL = that + "/",
#                N8N_HOST=n8n.sortmycover.co.za, N8N_PROTOCOL=https, no N8N_PATH.
#   dc, backup.sh, /etc/cron.d/lv-n8n-backup (nightly pg_dump, 14 kept in backups/)
# Caddy (/etc/caddy/Caddyfile) holds: n8n.sortmycover.co.za { reverse_proxy 127.0.0.1:5678 }
set -euo pipefail
REF="${1:-HEAD}"
VPS="${VPS:-root@76.13.252.92}"
KEY="${SSH_KEY:-$HOME/.ssh/emma_vps_ed25519}"
D=/opt/leadvelocity-n8n
SHIP=(automation conversation knowledge community billing analytics landing/config data supabase/migrations)
present=(); for p in "${SHIP[@]}"; do git cat-file -e "$REF:$p" 2>/dev/null && present+=("$p"); done
echo "shipping $(git rev-parse --short "$REF"): ${present[*]}"
git archive "$REF" "${present[@]}" | ssh -i "$KEY" -o BatchMode=yes "$VPS" "set -e
  mkdir -p $D && cd $D && rm -rf repo.new && mkdir repo.new && tar -x -C repo.new
  if [ -f repo/.env ]; then cp -p repo/.env repo.new/.env; fi
  rm -rf repo.old; if [ -d repo ]; then mv repo repo.old; fi; mv repo.new repo
  install -m 0755 repo/automation/emma-vps/dc.sh dc
  install -m 0755 repo/automation/emma-vps/backup.sh backup.sh
  echo '30 1 * * * root $D/backup.sh >> /var/log/lv-n8n-backup.log 2>&1' > /etc/cron.d/lv-n8n-backup
  systemctl enable --now docker >/dev/null 2>&1
  if [ -f repo/.env ]; then ./dc up -d --force-recreate n8n && ./dc up -d; else echo 'repo/.env missing: copy it first (see deploy.sh header)'; fi"

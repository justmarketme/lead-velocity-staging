#!/bin/sh
# docker compose for the n8n stack on the EMMA VPS. Installed as /opt/leadvelocity-n8n/dc by deploy.sh.
#   /opt/leadvelocity-n8n/dc ps | logs -f n8n | up -d | restart n8n
D=/opt/leadvelocity-n8n
exec docker compose -p lv-n8n --env-file "$D/repo/.env" \
  -f "$D/repo/automation/docker-compose.yml" -f "$D/repo/automation/emma-vps/compose.override.yml" "$@"

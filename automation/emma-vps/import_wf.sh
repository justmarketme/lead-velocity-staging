#!/bin/bash
# Import repo workflows into the VPS n8n, binding credential refs that have no id by name, then publish the
# ones given. Usage (on the VPS): bash /opt/leadvelocity-n8n/repo/automation/emma-vps/import_wf.sh W03 W07
set -euo pipefail
cd /opt/leadvelocity-n8n
U=$(grep -E "^POSTGRES_USER=" repo/.env | cut -d= -f2)
D=$(grep -E "^POSTGRES_DB=" repo/.env | cut -d= -f2)
docker exec lv-n8n-postgres-1 psql -U "$U" -d "$D" -Atc "select json_object_agg(name, id) from credentials_entity;" > /tmp/cred_map.json
for W in "$@"; do
  python3 - "$W" <<'PY'
import json, sys
w = sys.argv[1]
creds = json.load(open('/tmp/cred_map.json'))
wf = json.load(open(f'/opt/leadvelocity-n8n/repo/automation/{w}.json', encoding='utf-8'))
unbound = []
for n in wf['nodes']:
    for typ, c in (n.get('credentials') or {}).items():
        if not c.get('id'):
            cid = creds.get(c.get('name'))
            if cid: c['id'] = cid
            else: unbound.append((n['name'], c.get('name')))
if unbound:
    print('UNBOUND', unbound); sys.exit(1)
wf['active'] = False  # publish below activates the new version
json.dump(wf, open(f'/tmp/{w}.bound.json', 'w', encoding='utf-8'))
print(w, 'bound ok, nodes', len(wf['nodes']), 'id', wf.get('id'))
PY
  docker cp "/tmp/$W.bound.json" "lv-n8n-n8n-1:/tmp/$W.bound.json"
  docker exec lv-n8n-n8n-1 n8n import:workflow --input="/tmp/$W.bound.json" 2>&1 | grep -vE "Deprecat|trace-|N8N_RUNNERS|Remove this|task runner|deploy in external|^\s*$" | tail -3
done
for W in "$@"; do
  ID=$(python3 -c "import json;print(json.load(open('/tmp/$W.bound.json'))['id'])")
  docker exec lv-n8n-n8n-1 n8n publish:workflow --id="$ID" 2>&1 | grep -vE "Deprecat|trace-|N8N_RUNNERS|Remove this|task runner|deploy in external|^\s*$" | tail -3
done
./dc restart n8n 2>&1 | tail -2

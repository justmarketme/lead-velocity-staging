#!/usr/bin/env bash
# Runs every ```sql block in knowledge/metrics.md against the fixture database ($FIX_DB, default smc_fix). Fails on any SQL error.
# Counts the entries that have a runnable block; the ones owned by other agents carry a "not in facts" note instead and are listed, not failed.
set -euo pipefail
cd "$(dirname "$0")/../.."
FIX_DB=${FIX_DB:-smc_fix}
python3 - "$FIX_DB" <<'PY'
import re, subprocess, sys
db = sys.argv[1]
s = open('knowledge/metrics.md').read()
secs = re.split(r'\n## (M\d\d) ', s)
ok = bad = 0; none = []
for i in range(1, len(secs), 2):
    blocks = re.findall(r'```sql\n(.*?)```', secs[i + 1], re.S)
    if not blocks: none.append(secs[i])
    for b in blocks:
        r = subprocess.run(['psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', b], capture_output=True, text=True)
        if r.returncode: bad += 1; print('FAIL', secs[i], r.stderr.strip().split('\n')[0][:160])
        else: ok += 1
print(f'metrics.md SQL: {ok} blocks ran, {bad} failed; no SQL block (owned elsewhere): {", ".join(none) or "none"}')
sys.exit(1 if bad else 0)
PY

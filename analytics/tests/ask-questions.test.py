#!/usr/bin/env python3
"""Runs the 20 scripted Ask-the-data SQL statements (analytics/ask-the-data-questions.json) against the fixture and compares with expected_on_synthetic.
The fixture shifts to today, so 'B-MARK' is the synthetic adviser uuid and text with dates is compared after stripping them. Usage: ask-questions.test.py [db]"""
import json, re, subprocess, sys, os
db = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('FIX_DB', 'smc_fix')
here = os.path.dirname(os.path.abspath(__file__))
q = json.load(open(os.path.join(here, '..', 'ask-the-data-questions.json')))
UUID = '00000000-0000-4000-8000-0000000b0002'
bad = 0
for it in q['questions']:
    r = subprocess.run(['psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', it['sql'].replace("'B-MARK'", f"'{UUID}'")], capture_output=True, text=True)
    if r.returncode: bad += 1; print('FAIL', it['id'], r.stderr.strip().split('\n')[0][:140]); continue
    got = [l for l in r.stdout.strip().split('\n') if l != '']
    exp = it['expected_on_synthetic']
    norm = lambda rows: [re.sub(r'\d{4}-\d{2}-\d{2}', 'D', x).replace(UUID, 'B-MARK') for x in rows]
    if norm(got) != norm(exp):
        bad += 1; print('DIFF', it['id'], 'got', got[:3], 'expected', exp[:3])
print(f"ask-the-data: {len(q['questions']) - bad} of {len(q['questions'])} scripted questions match the fixture")
sys.exit(1 if bad else 0)

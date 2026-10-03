#!/usr/bin/env python3
"""Runs the 20 scripted Ask-the-data SQL statements (analytics/ask-the-data-questions.json) against the fixture and compares with expected_on_synthetic.
The fixture shifts to today, so 'B-MARK' is the synthetic adviser uuid and text with dates is compared after stripping them. Usage: ask-questions.test.py [db]"""
import json, re, subprocess, sys, os
db = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('FIX_DB', 'smc_fix')
here = os.path.dirname(os.path.abspath(__file__))
q = json.load(open(os.path.join(here, '..', 'ask-the-data-questions.json')))
UUID = '00000000-0000-4000-8000-0000000b0002'
bad = 0
def psql(sql):
    return subprocess.run(['psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql], capture_output=True, text=True)
def clock_expectation_q12():
    """I-50c. Q12 (days of capacity left) reads the calendar forward from today, so the open-slot count moves with the weekday the suite
    runs on (49.0|28 one day, 50.8|29 another). The pinned figure is therefore recomputed from the same clock (facts.as_of()) with a second
    query built straight on the fixture tables, not on the view: open slots in the next 14 days = sum(max(daily cap - booked, 0)), cap = 0 on
    days outside the adviser's meeting hours; booking pace = bookings made in the last 7 days / 7; booked share = next-7-day booked / cap."""
    r = psql("""with b as (select * from public.brokers where id = '%s'),
d as (select g::date as day from generate_series(facts.as_of() + 1, facts.as_of() + 14, interval '1 day') g),
x as (select d.day, case when b.meeting_hours ? lower(to_char(d.day,'Dy')) and not b.bookings_paused then b.max_meetings_per_day else 0 end as cap,
        (select count(*) from facts.fact_booking fb where fb.broker_id = b.id and fb.slot_date = d.day and fb.status in ('booked','confirmed','attended','no_show')) as sch
      from d cross join b)
select sum(greatest(cap - sch, 0)), sum(cap) filter (where day <= facts.as_of() + 7), sum(sch) filter (where day <= facts.as_of() + 7),
       (select count(*) from facts.fact_booking where booked_date between facts.as_of() - 6 and facts.as_of()) from x""" % UUID)
    n, cap7, sch7, b7 = [int(v) for v in r.stdout.strip().split('|')]
    return ['%.1f|5|green|%.3f|f|%d' % (round(n / (b7 / 7.0) + 1e-9, 1), sch7 / cap7, n)]
for it in q['questions']:
    r = subprocess.run(['psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', it['sql'].replace("'B-MARK'", f"'{UUID}'")], capture_output=True, text=True)
    if r.returncode: bad += 1; print('FAIL', it['id'], r.stderr.strip().split('\n')[0][:140]); continue
    got = [l for l in r.stdout.strip().split('\n') if l != '']
    exp = it['expected_on_synthetic']
    if it['id'] == 'Q12': exp = clock_expectation_q12()   # I-50c: clock-dependent, see above
    norm = lambda rows: [re.sub(r'\d{4}-\d{2}-\d{2}', 'D', x).replace(UUID, 'B-MARK') for x in rows]
    if norm(got) != norm(exp):
        bad += 1; print('DIFF', it['id'], 'got', got[:3], 'expected', exp[:3])
print(f"ask-the-data: {len(q['questions']) - bad} of {len(q['questions'])} scripted questions match the fixture")
sys.exit(1 if bad else 0)

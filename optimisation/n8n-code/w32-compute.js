//@use SLOS, spc
//@include common
// Computes every number the models are allowed to quote. The LLM never calculates (pulse.md rule 2).
const P = $('Plan').first().json;
const cfg = P.cfg;
const latest = addDays(P.date, -1);                       // last complete day
const days = Array.from({ length: 60 }, (_, i) => addDays(latest, i - 59));
const rows = $('Series').all().map((i) => i.json);
const by = {};
for (const r of rows) { const k = r.faculty + '/' + r.metric; (by[k] = by[k] || {})[String(r.date).slice(0, 10)] = r; }
const num = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));

const signals = [], facultyStatus = {}, evidence = {}, metricStats = {}, warming = [], noData = [];
const latestVal = {};
for (const f of SLOS.faculties) {
  const fm = [];
  for (const m of f.metrics) {
    const map = by[f.id + '/' + m.id] || {};
    const vals = days.map((d) => num(map[d] && map[d].value));
    const nums = days.map((d) => num(map[d] && map[d].numerator));
    const dens = days.map((d) => num(map[d] && map[d].denominator));
    const have = vals.filter(Number.isFinite).length;
    latestVal[m.id] = vals[vals.length - 1];
    if (!have) { noData.push(f.id + '.' + m.id); fm.push({ signals: [] }); continue; }
    const opts = { direction: m.direction };
    const isP = m.chart === 'p' && m.ratio;
    const headline = m.tier === 'headline';
    const run = (v, n, d) => isP ? (headline ? spc.detectP(n, d, opts) : spc.detectPConfirmed(n, d, opts))
                                 : (m.chart === 'imr' ? (headline ? spc.detect(v, opts) : spc.detectConfirmed(v, opts)) : { status: 'no_chart', signals: [] });
    const det = run(vals, nums, dens);
    if (det.status === 'warming_up') warming.push(f.id + '.' + m.id);
    // SLO burn
    let burn = null;
    if (m.slo && m.burn) {
      let target, direction = m.direction;
      if (m.slo.band) { target = m.slo.band; direction = 'band'; }
      else if (m.slo.op === '!=') { target = 0; direction = 'lower'; }
      else { target = m.slo.value; direction = m.slo.op.charAt(0) === '>' ? 'higher' : 'lower'; }
      burn = spc.sloBurn(vals, { target, direction, allowedBreachFraction: m.burn.allowed_breach_fraction, window: m.burn.window_days });
    }
    if (m.hard_floor) {                                        // 3.4: show < 50% for 14 days
      const w = vals.slice(-m.hard_floor.days).filter(Number.isFinite);
      if (w.length >= m.hard_floor.days && w.every((x) => x < m.hard_floor.value)) burn = { burn: Infinity, breachDays: w.length, days: w.length, burning: true, reason: 'hard_floor' };
    }
    const mine = [];
    for (const s of det.signals) {
      // days out of limit (out_of_limit rule): walk back up to 7 days
      let daysOut = s.run;
      if (s.rule === 'out_of_limit') {
        daysOut = 1;
        for (let j = 1; j <= 7; j++) {
          const d2 = isP ? spc.detectP(nums.slice(0, -j), dens.slice(0, -j), opts) : spc.detect(vals.slice(0, -j), opts);
          if (d2.signals.some((x) => x.rule === 'out_of_limit' && (x.value > x.centre) === (s.value > s.centre))) daysOut++; else break;
        }
      }
      const sig = { id: f.id + '.' + m.id + '.' + latest + '.' + s.rule, faculty: f.id, metric: m.id, plain_name: m.plain_name, unit: m.unit, tier: m.tier,
        rule: s.rule, side: s.side, value: s.value, limit: s.limit, centre: s.centre, run: s.run, days_out: daysOut,
        burning: !!(burn && burn.burning), burn: burn ? (burn.burn === Infinity ? 'inf' : Math.round(burn.burn * 10) / 10) : null, owner_agent: m.owner_agent,
        slo: m.slo ? (m.slo.band ? m.slo.band : m.slo.op + m.slo.value) : null, value_fmt: fmt(m.unit, s.value), limit_fmt: fmt(m.unit, s.limit) };
      mine.push(sig); signals.push(sig);
    }
    if (burn && burn.burning && !mine.length) {                 // burning without a chart signal (e.g. zero-tolerance, band) still surfaces
      const sig = { id: f.id + '.' + m.id + '.' + latest + '.slo_burn', faculty: f.id, metric: m.id, plain_name: m.plain_name, unit: m.unit, tier: m.tier, rule: 'slo_burn', side: 'adverse',
        value: latestVal[m.id], limit: m.slo && !m.slo.band ? m.slo.value : null, centre: null, run: burn.breachDays, days_out: burn.breachDays, burning: true,
        burn: burn.burn === Infinity ? 'inf' : Math.round(burn.burn * 10) / 10, owner_agent: m.owner_agent, slo: m.slo ? (m.slo.band ? m.slo.band : m.slo.op + m.slo.value) : null,
        value_fmt: fmt(m.unit, latestVal[m.id]), limit_fmt: m.slo && !m.slo.band ? fmt(m.unit, m.slo.value) : null };
      mine.push(sig); signals.push(sig);
    }
    fm.push({ signals: mine, burn });
    // evidence for the proposal gate
    const win = days.slice(-28).map((d) => map[d]).filter(Boolean);
    const ev = { days: win.length, spend_zar: win.reduce((s, r) => s + (num(r.spend_zar) || 0), 0), conversions: win.reduce((s, r) => s + (num(r.conversions) || num(r.numerator) || 0), 0), n: win.reduce((s, r) => s + (num(r.n) || 0), 0) };
    const policy = {};
    for (const [k, v] of Object.entries(m.min_evidence || {})) if (typeof v === 'number') policy[k] = v;
    const ev2 = Object.assign({}, ev); for (const k of Object.keys(policy)) if (!['days', 'spend_zar', 'conversions'].includes(k)) ev2[k] = ev.n;
    const gate = spc.evidenceOk(ev2, policy, { sloBurning: !!(burn && burn.burning) });
    evidence[f.id + '.' + m.id] = Object.assign({}, ev2, { needed: policy, ok: gate.ok, reason: gate.reason, missing: gate.missing || [] });
    // 7 and 28 day stats for the weekly memo
    const fin = vals.filter(Number.isFinite);
    metricStats[f.id + '.' + m.id] = { latest: vals[vals.length - 1], mean7: spc.mean(vals.slice(-7)), mean28: spc.mean(vals.slice(-28)), limits: det.limits || null, n_days: fin.length, unit: m.unit };
  }
  facultyStatus[f.id] = spc.facultyStatus(fm);
}
// ---- judge ----
const grades = $('Judge today').all().map((i) => i.json).filter((g) => g.rule);
const runs = $('Judge runs').all().map((i) => i.json).filter((g) => g.rubric);
const critical = grades.filter((g) => g.severity === 'critical');
for (const g of critical) if (g.faculty && facultyStatus[g.faculty] !== undefined) facultyStatus[g.faculty] = 'red';
const failedByRule = {};
for (const g of grades) failedByRule[g.rule] = (failedByRule[g.rule] || 0) + 1;
const judge = { sampled: runs.reduce((s, r) => s + (Number(r.sampled) || 0), 0), failed_by_rule: failedByRule, findings: grades.filter((g) => ['critical', 'high'].includes(g.severity)).slice(0, 12), critical_count: critical.length, runs };
// ---- journal ----
const jr = $('Journal').all().map((i) => i.json).filter((r) => r.id);
const today = P.date;
const declined = jr.filter((r) => r.status === 'declined' && r.decided_at && addDays(String(r.decided_at).slice(0, 10), 28) >= today).map((r) => ({ id: r.id, faculty: r.faculty, title: r.title, reason: r.decline_reason }));
const snoozed = jr.filter((r) => r.status === 'snoozed' && r.snoozed_until && String(r.snoozed_until).slice(0, 10) >= today).map((r) => ({ id: r.id, faculty: r.faculty, title: r.title, until: String(r.snoozed_until).slice(0, 10) }));
const misses = {};
const graded = jr.filter((r) => r.verdict && r.verdict !== 'not_enough_data').sort((a, b) => (a.graded_at < b.graded_at ? 1 : -1));
for (const f of SLOS.faculties) { let n = 0; for (const r of graded.filter((x) => x.faculty === f.id)) { if (r.verdict === 'missed') n++; else break; } misses[f.id] = n; }
const yesterdayChanges = jr.filter((r) => r.graded_at && String(r.graded_at).slice(0, 10) >= addDays(today, -1) && r.verdict).map((r) => ({ id: r.id, title: r.title, forecast: r.forecast, actual: r.actual, verdict: r.verdict }));
// ---- build ----
const bs = ($('Build state').first() || { json: {} }).json || {};
const tf = $('Tasks.json').first().json; const nodes = (tf && (tf.data && tf.data.nodes || tf.nodes)) || [];
const green = new Set(nodes.filter((n) => n.status === 'green').map((n) => n.id));
const blocked = nodes.filter((n) => ['red', 'needs_human'].includes(n.status)).map((n) => ({ id: n.id, title: n.title, status: n.status }));
const gates = nodes.filter((n) => n.human_gate && n.status !== 'green' && (n.depends_on || []).every((d) => green.has(d))).map((n) => ({ id: n.id, title: n.title, deep_link: 'https://leadvelocity.co.za/today#gate-' + n.id }));
const build = { active: cfg.build_active, blocked: blocked.length, blocked_list: blocked.slice(0, 5), failing_tests: Number(bs.tests_failing || 0), failed_twice: Number(bs.tests_failed_twice || 0), gates_waiting: gates, gates_oldest_hours: Number(bs.gates_oldest_hours || 0), commits_24h: bs.commits_24h == null ? null : Number(bs.commits_24h), tasks_done: green.size, tasks_total: nodes.length };
// ---- compliance (zero tolerance) ----
const C = (id) => latestVal[id];
const compliance = { consent: C('consent_stored_pct'), disclosure: C('disclosure_delivered_pct'), stop: C('stop_honoured_pct'), days_since_cleanse: C('days_since_cleanse'), advice_statements: C('advice_statements'), dsr_overdue: C('dsr_overdue') };
compliance.green = [compliance.consent, compliance.disclosure, compliance.stop].every((x) => x === 1) && compliance.days_since_cleanse <= 31 && compliance.advice_statements === 0 && (compliance.dsr_overdue || 0) === 0 && critical.length === 0;
compliance.known = [compliance.consent, compliance.disclosure, compliance.stop, compliance.days_since_cleanse, compliance.advice_statements].every(Number.isFinite);
if (!compliance.known && cfg.build_active) compliance.green = true;       // pre-launch: no leads yet, nothing to evidence
const failing = [];
if (Number.isFinite(compliance.consent) && compliance.consent < 1) failing.push('consent ' + pct(compliance.consent));
if (Number.isFinite(compliance.disclosure) && compliance.disclosure < 1) failing.push('disclosure ' + pct(compliance.disclosure));
if (Number.isFinite(compliance.stop) && compliance.stop < 1) failing.push('STOP ' + pct(compliance.stop));
if (compliance.days_since_cleanse > 31) failing.push('cleanse ' + compliance.days_since_cleanse + ' d ago');
if (compliance.advice_statements > 0) failing.push('advice statements ' + compliance.advice_statements);
if (critical.length) failing.push('judge critical findings ' + critical.length);
compliance.failing = failing;
compliance.line = failing.length ? 'NOT GREEN: ' + failing.join(' · ') : 'consent ' + (Number.isFinite(compliance.consent) ? pct(compliance.consent) : 'n/a') + ' · disclosure ' + (Number.isFinite(compliance.disclosure) ? pct(compliance.disclosure) : 'n/a') + ' · STOP ' + (Number.isFinite(compliance.stop) ? pct(compliance.stop) : 'n/a') + ' · cleanse ' + (Number.isFinite(compliance.days_since_cleanse) ? compliance.days_since_cleanse + ' d ago' : 'n/a') + ' · advice statements ' + (Number.isFinite(compliance.advice_statements) ? compliance.advice_statements : 'n/a');
// ---- watchlist (6A2 #3) ----
const wl = [['cost_per_attended', 'Cost per attended meeting vs model'], ['verified_rate', 'Leads we could reach'], ['show_rate', 'Booked to attended'], ['good_fit_rate', 'Broker good-fit rate'], ['margin_per_cycle', 'Margin this cycle'], ['calendar_fill', 'Broker capacity (calendar fill)'], ['renewal_risk', 'Renewal risk']];
const mById = {}; for (const f of SLOS.faculties) for (const m of f.metrics) mById[m.id] = Object.assign({ faculty: f.id }, m);
const watchlist = wl.map(([id, label]) => { const m = mById[id]; const st = metricStats[m.faculty + '.' + id] || {}; return { id, label, value: fmt(m.unit, st.latest), target: m.slo ? (m.slo.band ? m.slo.band.join('-') : m.slo.op + m.slo.value) : 'none yet', mean28: fmt(m.unit, st.mean28) }; });
// ---- status and quiet ----
const adverse = signals.filter((s) => s.side === 'adverse');
const anyBurning = signals.some((s) => s.burning);
const anyRedTile = Object.values(facultyStatus).includes('red');
const status = (anyBurning || anyRedTile || !compliance.green) ? 'red' : (adverse.length || judge.findings.length || build.blocked || build.failing_tests || (build.gates_waiting.length && build.gates_oldest_hours > 24) ? 'amber' : 'green');
const quiet = status === 'green' && !adverse.length && judge.findings.length === 0;   // green already implies no blockers, no failing tests, no gate older than 24 h
const cost = { cap_daily_zar: cfg.caps.daily, spent_zar: Math.round(cfg.spent.day * 100) / 100 };
const INPUT = { date: P.date, latest_day: latest, signals, faculty_status: facultyStatus, evidence, watchlist, judge, yesterday_changes: yesterdayChanges, declined, snoozed, misses, compliance, build, cost, warming_up: warming.length, no_data_metrics: noData.length, calendar: { weekday: P.weekday }, cause_hints: [] };
return [{ json: { INPUT, status, quiet, metric_stats: metricStats } }];

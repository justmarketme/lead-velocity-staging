//@use SLOS, PROMPTS
//@include common
// Validates the model's JSON (or builds the deterministic template), enforces the hard rules in code, and prepares DB rows.
const cfg = $('Plan').first().json.cfg;
const R = $('Route pulse').first().json;
const INPUT = R.INPUT;
const isMonday = INPUT.calendar.weekday === 'Mon';
const resp = $input.first().json;
const isLlm = R.route === 'llm';
const usage = isLlm ? (resp.usage || null) : null;
let out = isLlm ? parseJson(resp.content && resp.content[0] && resp.content[0].text) : null;
let fallback = null;
if (isLlm && !out) fallback = 'unparseable model output';
const verdict = R.status;
const names = {}; for (const f of SLOS.faculties) for (const m of f.metrics) names[m.id] = m;
const line = (s) => '- ' + s.plain_name + ' ' + s.value_fmt + (s.limit_fmt ? ' vs ' + s.limit_fmt : '') + ' (' + s.days_out + ' d) · owner ' + s.owner_agent;
let pulse;
if (R.route === 'quiet') {
  const t = isMonday ? QUIET_MONDAY : QUIET;
  pulse = { date: INPUT.date, status: 'green', quiet: true, working: [], not_working: [], actions: [], compliance: INPUT.compliance, build: INPUT.build, business_line: null, cost_line: null, card_markdown: t, whatsapp_text: t };
} else if (out && !fallback) {
  const actions = Array.isArray(out.actions) ? out.actions : [];
  const need = ['title', 'faculty', 'metric', 'mechanism', 'forecast', 'cost_zar', 'evidence_grade', 'test', 'kill_rule', 'owner_agent', 'check_date'];
  const keep = [], dropped = [];
  for (const a of actions) {
    const ev = INPUT.evidence[a.faculty + '.' + a.metric];
    const burning = INPUT.signals.some((s) => s.faculty === a.faculty && s.metric === a.metric && s.burning);
    const compl = a.faculty === 'compliance';
    if (need.some((k) => a[k] === undefined || a[k] === null || a[k] === '')) { dropped.push([a.title, 'missing field']); continue; }
    if (!['A', 'B', 'C', 'D'].includes(a.evidence_grade)) { dropped.push([a.title, 'bad grade']); continue; }
    if (ev && !ev.ok && !burning && !compl) { dropped.push([a.title, 'evidence gate: ' + (ev.missing || []).join(',')]); continue; }
    if (INPUT.declined.some((d) => d.title === a.title) || INPUT.snoozed.some((d) => d.title === a.title)) { dropped.push([a.title, 'in journal']); continue; }
    if ((INPUT.misses[a.faculty] || 0) >= 3) { dropped.push([a.title, '3 misses in faculty']); continue; }
    keep.push(a);
  }
  pulse = { date: INPUT.date, status: verdict, quiet: false, working: (out.working || []).slice(0, 3), not_working: out.not_working || [], actions: keep.slice(0, 3).map((a, i) => Object.assign({}, a, { id: 'act_' + INPUT.date + '_' + (i + 1), source: 'advisor' })),
    compliance: INPUT.compliance, build: INPUT.build, business_line: out.business_line || null, cost_line: out.cost_line || null, card_markdown: out.card_markdown || '', whatsapp_text: out.whatsapp_text || '', dropped_actions: dropped };
} else {
  const why = fallback || R.reason || 'AI summary skipped';
  const md = ['Pulse ' + INPUT.date + ' · ' + verdict.toUpperCase(), '', 'Compliance: ' + INPUT.compliance.line, ''];
  const adv = INPUT.signals.filter((s) => s.side === 'adverse');
  md.push(adv.length ? 'Not working' : 'No adverse signals.'); adv.slice(0, 8).forEach((s) => md.push(line(s)));
  if (INPUT.build.active) md.push('', 'Build: ' + INPUT.build.blocked + ' blocked · ' + INPUT.build.failing_tests + ' tests failing · ' + INPUT.build.gates_waiting.length + ' gate(s) waiting');
  md.push('', 'AI summary skipped (' + why + '). No new proposals today.');
  pulse = { date: INPUT.date, status: verdict, quiet: false, working: [], not_working: adv.map((s) => ({ faculty: s.faculty, metric: s.metric, plain_name: s.plain_name, value: s.value_fmt, limit: s.limit_fmt, days_out: s.days_out, cause: 'cause not established', cause_established: false, owner_agent: s.owner_agent, signal_ref: s.id })),
    actions: [], compliance: INPUT.compliance, build: INPUT.build, business_line: null, cost_line: null, card_markdown: md.join('\n'), whatsapp_text: 'Pulse ' + verdict + '. ' + (adv.length + ' signal(s)') + '. AI summary skipped.', template_fallback: why };
}
// signals rows with the cause from the model, if any
const causeOf = {}; for (const n of pulse.not_working) if (n.signal_ref) causeOf[n.signal_ref] = n.cause;
const signalRows = INPUT.signals.map((s) => ({ signal_key: s.id, faculty: s.faculty, metric: s.metric, value: Number.isFinite(Number(s.value)) ? Number(s.value) : null, limit: s.limit == null ? null : Number(s.limit), run: s.run, rule: s.rule, side: s.side, burning: s.burning, cause: causeOf[s.id] || null, owner: s.owner_agent }));
const proposalRows = pulse.actions.map((a) => ({ pulse_date: INPUT.date, faculty: a.faculty, title: String(a.title).slice(0, 200), metric: a.metric, forecast: a.forecast, cost_zar: Number(a.cost_zar) || 0, grade: a.evidence_grade, test: a.test, kill_rule: a.kill_rule, mechanism: a.mechanism, owner_agent: a.owner_agent, check_date: a.check_date, ice: a.ice || null, source: 'advisor', evidence: a.evidence || null }));
const cost = isLlm ? [{ date: INPUT.date, kind: 'llm', amount_zar: actZar(cfg, cfg.models.fast, usage), source_ref: 'optimisation-advisor:pulse' }] : [];
return [{ json: { pulse, pulse_json: JSON.stringify(pulse), signals_json: JSON.stringify(signalRows), signal_keys: signalRows.map((s) => s.signal_key), proposals_json: JSON.stringify(proposalRows), costs_json: JSON.stringify(cost) } }];

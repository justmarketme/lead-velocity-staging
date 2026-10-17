//@include common
const cfg = $('Plan').first().json.cfg;
const R = $('Retro request').first().json;
const resp = $input.first().json;
const out = R.ok ? parseJson(resp.content && resp.content[0] && resp.content[0].text) : null;
const fallback = out ? null : (R.ok ? 'unparseable model output' : 'weekly cap');
const md = out && out.retro_markdown ? out.retro_markdown : '# Monthly retro ' + R.month + ' (not written: ' + fallback + ')\n\nProduction data is in the console History. It will be re-run on the next working day.';
const html = out && out.email_html ? out.email_html : '<pre>' + md.replace(/</g, '&lt;') + '</pre>';
const bets = (out && Array.isArray(out.bets)) ? out.bets : [];
const need = ['title', 'faculty', 'metric', 'mechanism', 'forecast', 'cost_zar', 'evidence_grade', 'test', 'kill_rule', 'owner_agent', 'check_date'];
const rows = bets.filter((a) => !need.some((k) => a[k] === undefined || a[k] === null || a[k] === '') && (R.INPUT.misses[a.faculty] || 0) < 3).slice(0, 3).map((a) => ({ pulse_date: cfg.now.slice(0, 10), faculty: a.faculty, title: String(a.title).slice(0, 200), metric: a.metric, forecast: a.forecast, cost_zar: Number(a.cost_zar) || 0, grade: a.evidence_grade, test: a.test, kill_rule: a.kill_rule, mechanism: a.mechanism, owner_agent: a.owner_agent, check_date: a.check_date, ice: a.ice || null, source: 'advisor', evidence: a.evidence || null }));
const memo = { kind: 'monthly', week_start: R.month + '-01', markdown: md, fallback };
const costs = R.ok ? [{ date: cfg.now.slice(0, 10), kind: 'llm', amount_zar: actZar(cfg, cfg.models.strong, resp.usage), source_ref: 'optimisation-advisor:retro' }] : [];
const recips = $('Recipients').all().map((i) => i.json);
const to = recips[0] && recips[0].ops_email;
const msgs = to ? [{ json: { kind: 'monthly_email', to, dedupe_key: 'monthly_email:' + R.month, wait_until: next0700(cfg.now), payload: { channel: 'email', subject: 'SortMyCover monthly retro ' + R.month, html } } }] : [];
return [{ json: { memo_json: JSON.stringify(memo), proposals_json: JSON.stringify(rows), costs_json: JSON.stringify(costs), msgs } }];

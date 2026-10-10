//@include common
// Validates the memo JSON, enforces <= 3 proposals per faculty and the evidence gate, falls back to a production-data-only memo.
const cfg = $('Plan').first().json.cfg;
const R = $('Memo request').first().json;
const resp = $input.first().json;
const out = R.ok ? parseJson(resp.content && resp.content[0] && resp.content[0].text) : null;
const INPUT = R.INPUT;
const need = ['title', 'faculty', 'metric', 'mechanism', 'forecast', 'cost_zar', 'evidence_grade', 'test', 'kill_rule', 'owner_agent', 'check_date'];
let proposals = [], dropped = [];
if (out && Array.isArray(out.proposals)) {
  const perFac = {};
  for (const a of out.proposals) {
    const ev = INPUT.evidence[a.faculty + '.' + a.metric];
    const burning = INPUT.signals.some((s) => s.faculty === a.faculty && s.metric === a.metric && s.burning);
    if (need.some((k) => a[k] === undefined || a[k] === null || a[k] === '')) { dropped.push([a.title, 'missing field']); continue; }
    if (ev && !ev.ok && !burning && a.faculty !== 'compliance') { dropped.push([a.title, 'evidence gate']); continue; }
    if ((INPUT.misses[a.faculty] || 0) >= 3) { dropped.push([a.title, '3 misses']); continue; }
    if (INPUT.declined.some((d) => d.title === a.title) || INPUT.snoozed.some((d) => d.title === a.title)) { dropped.push([a.title, 'journal']); continue; }
    perFac[a.faculty] = (perFac[a.faculty] || 0) + 1;
    if (perFac[a.faculty] > 3) { dropped.push([a.title, 'max 3 per faculty']); continue; }
    proposals.push(a);
  }
}
const one = out && out.one_thing && proposals.find((p) => p.title === out.one_thing.title) ? out.one_thing : (proposals[0] || null);
let md = out && out.memo_markdown;
let wa = out && out.whatsapp_summary;
let html = out && out.pdf_html;
let fallback = null;
if (!out) {
  fallback = R.ok ? 'unparseable model output' : 'weekly cap';
  const adv = INPUT.signals.filter((s) => s.side === 'adverse');
  md = ['# Weekly memo ' + R.weekStart + ' (production data only: ' + fallback + ')', '', 'Status by faculty: ' + Object.entries(INPUT.faculty_status).map(([k, v]) => k + ' ' + v).join(' · '), '', '## Signals'].concat(adv.length ? adv.map((s) => '- ' + s.plain_name + ' ' + s.value_fmt + (s.limit_fmt ? ' vs ' + s.limit_fmt : '') + ' (' + s.days_out + ' d), owner ' + s.owner_agent) : ['None.']).concat(['', '## Watchlist'], INPUT.watchlist.map((w) => '- ' + w.label + ': ' + w.value + ' (target ' + w.target + ', 28-day ' + w.mean28 + ')'), ['', 'Scan skipped and no new proposals this week.']).join('\n');
  wa = 'Weekly memo from production data only (' + fallback + '). Nothing proposed.'; html = '<pre>' + md.replace(/</g, '&lt;') + '</pre>';
}
const costs = R.ok ? [{ date: R.weekStart, kind: 'llm', amount_zar: actZar(cfg, cfg.models.strong, resp.usage), source_ref: 'optimisation-advisor:memo' }] : [];
const scanCosts = (() => { try { return JSON.parse($('Aggregate scan').first().json.costs_json); } catch (e) { return []; } })();
const memo = { kind: 'weekly', week_start: R.weekStart, markdown: md, radar: (out && out.radar) || [], actual_vs_forecast: (out && out.actual_vs_forecast) || [], model_wrong: (out && out.model_wrong) || [], one_thing: one, dropped, fallback, scan: R.scan };
const proposalRows = proposals.map((a) => ({ pulse_date: R.weekStart, faculty: a.faculty, title: String(a.title).slice(0, 200), metric: a.metric, forecast: a.forecast, cost_zar: Number(a.cost_zar) || 0, grade: a.evidence_grade, test: a.test, kill_rule: a.kill_rule, mechanism: a.mechanism, owner_agent: a.owner_agent, check_date: a.check_date, ice: a.ice || null, source: 'advisor', evidence: a.evidence || null }));
return [{ json: { memo, memo_json: JSON.stringify(memo), proposals_json: JSON.stringify(proposalRows), costs_json: JSON.stringify(costs.concat(scanCosts)), whatsapp_summary: wa, html, one_thing_title: one ? one.title : 'none this week' } }];

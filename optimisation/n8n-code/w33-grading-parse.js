//@include common
const cfg = $('Plan').first().json.cfg;
const date = $('Plan').first().json.date;
const req = $('Build grading request').first().json;
const r = $input.first().json;
const j = parseJson(r.content && r.content[0] && r.content[0].text);
const OK = ['beat_forecast', 'within_range', 'missed', 'not_enough_data'];
const grades = [];
for (const g of ((j && j.grades) || [])) {
  const row = req.rows.find((x) => String(x.proposal_id) === String(g.proposal_id));
  if (!row || !OK.includes(g.verdict)) continue;
  grades.push({ proposal_id: row.proposal_id, verdict: g.verdict, kill_rule_hit: !!g.kill_rule_hit, note: String(g.note || '').slice(0, 300), new_check_date: g.verdict === 'not_enough_data' ? (g.new_check_date || null) : null, actual: row.actual });
}
const costs = [{ date, kind: 'llm', amount_zar: actZar(cfg, cfg.models.fast, r.usage), source_ref: 'optimisation-advisor:grading' }];
return [{ json: { grades_json: JSON.stringify(grades), costs_json: JSON.stringify(costs), n: grades.length } }];

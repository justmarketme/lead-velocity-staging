//@use PROMPTS
//@include common
const cfg = $('Plan').first().json.cfg;
const rows = $('Actuals').all().map((i) => i.json).filter((r) => r.proposal_id);
if (!rows.length) return [];
const user = 'CHANGES:\n' + JSON.stringify(rows.map((r) => ({ proposal_id: r.proposal_id, faculty: r.faculty, title: r.title, metric: r.metric, forecast: r.forecast, baseline: r.baseline, actual: r.actual, n: r.n, limits: r.limits, test: r.test, kill_rule: r.kill_rule, check_date: r.check_date })));
const est = estZar(cfg, cfg.models.fast, PROMPTS.grading_system.length + user.length, 1500);
if (!allow(cfg, 'grading', est)) return [];
charge(cfg, 'grading', est);
return [{ json: { rows, body: anthropicBody(cfg.models.fast, PROMPTS.grading_system, user, 1500) } }];

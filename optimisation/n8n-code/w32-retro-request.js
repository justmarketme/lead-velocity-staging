//@use PROMPTS
//@include common
const cfg = $('Plan').first().json.cfg;
const P = $('Plan').first().json;
const c = $('Compute signals').first().json;
const month = P.date.slice(0, 7);
const INPUT = Object.assign({}, c.INPUT, { metric_stats: c.metric_stats, cycle_economics: $('Cycle economics').all().map((i) => i.json), journal_month: $('Proposals month').all().map((i) => i.json).filter((r) => r.id), scan_summaries: $('Scan summaries').all().map((i) => i.json), judge_month: $('Judge month').all().map((i) => i.json) });
const user = 'MONTH: ' + month + '\nINPUT: ' + JSON.stringify(INPUT);
const est = estZar(cfg, cfg.models.strong, PROMPTS.retro_system.length + user.length, 7000);
const ok = allow(cfg, 'retro', est);
if (ok) charge(cfg, 'retro', est);
return [{ json: { month, ok, INPUT, body: ok ? anthropicBody(cfg.models.strong, PROMPTS.retro_system, user, 7000) : null } }];

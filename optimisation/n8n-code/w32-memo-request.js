//@use PROMPTS
//@include common
const cfg = $('Plan').first().json.cfg;
const P = $('Plan').first().json;
const c = $('Compute signals').first().json;
const agg = (() => { try { return $('Aggregate scan').first().json.scan; } catch (e) { return null; } })();
const scan = agg || { skipped: true, reason: 'weekly cap or scan not run', items: [] };
const hist = $('Proposals 4 weeks').all().map((i) => i.json).filter((r) => r.id);
const INPUT = Object.assign({}, c.INPUT, { metric_stats: c.metric_stats, scan, proposals_last_4_weeks: hist });
const weekStart = P.date;
const user = 'WEEK: ' + weekStart + ' to ' + weekStart + ' + 6\nINPUT: ' + JSON.stringify(INPUT);
const est = estZar(cfg, cfg.models.strong, PROMPTS.memo_system.length + user.length, 6000);
const ok = allow(cfg, 'memo', est);
if (ok) charge(cfg, 'memo', est);
return [{ json: { weekStart, ok, INPUT, scan, body: ok ? anthropicBody(cfg.models.strong, PROMPTS.memo_system, user, 6000) : null } }];

//@include common
const rows = $('Settings').all().map((i) => i.json);
const S = Object.fromEntries(rows.map((r) => [r.key, r.value]));
const c = $('Costs').first().json;
const cfg = {
  usd_zar: Number(S.usd_zar || 18),   // ASSUMPTION until ops.settings.usd_zar is set
  models: { fast: 'claude-haiku-4-5-20251001', strong: 'claude-sonnet-5-5' },
  rates: { 'claude-haiku-4-5-20251001': { in: 1, out: 5 }, 'claude-sonnet-5-5': { in: 2, out: 10 } },
  caps: { daily: Number(S.opt_daily_cap_zar || 15), weekly: Number(S.opt_weekly_cap_zar || 40), pulse_reserve: 3, memo_reserve: 12, soft: 0.8 },
  spent: { day: Number(c.day_zar || 0), week: Number(c.week_zar || 0) },
};
return [{ json: { cfg, date: ymdSAST(new Date()) } }];

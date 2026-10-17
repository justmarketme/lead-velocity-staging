//@use SOURCES, PROMPTS
//@include common
// Weekly fixed-source scan: <= 2 fetches per source. Pass 1 = the start URL of each source. Cap guard skips the scan (not the memo) when over budget.
const cfg = $('Plan').first().json.cfg;
const perCall = estZar(cfg, cfg.models.fast, 40000 + PROMPTS.scan_system.length, 800);
const items = [];
for (const s of SOURCES) {
  if (!allow(cfg, 'scan', perCall * 2)) break;      // reserve for the possible second fetch
  charge(cfg, 'scan', perCall);
  items.push({ json: { source_id: s.id, source: s.name, url: s.url, pass: 1 } });
}
if (!items.length) return [{ json: { skip: true, reason: 'weekly cap' } }];
return items;

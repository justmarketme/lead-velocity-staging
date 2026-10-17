//@include common
const cfg = $('Plan').first().json.cfg;
const date = $('Plan').first().json.date;
const reqsAll = $('Summarise pages').all().map((i) => i.json);
const resp = $input.all();
const items = [], sources = [], costs = [];
let blocked = [];
if (reqsAll[0] && reqsAll[0].none) blocked = reqsAll[0].blocked_list || [];
else {
  blocked = (reqsAll[0] && reqsAll[0].blocked_list) || [];
  resp.forEach((r, i) => {
    const meta = reqsAll[i] || {};
    costs.push({ date, kind: 'llm', amount_zar: actZar(cfg, cfg.models.fast, r.json && r.json.usage), source_ref: 'optimisation-advisor:scan' });
    const j = parseJson(r.json && r.json.content && r.json.content[0] && r.json.content[0].text);
    sources.push({ source_id: meta.source_id, url: meta.url, ok: !!j, blocked: !!(j && j.blocked) });
    if (j && Array.isArray(j.items)) for (const it of j.items.slice(0, 5)) items.push(Object.assign({ source_id: meta.source_id, source: meta.source, source_url: meta.url }, it));
  });
}
const scan = { run_at: cfg.now, fetches: sources.length + blocked.length, sources, blocked, items, skipped: false };
return [{ json: { scan, scan_json: JSON.stringify(scan), costs_json: JSON.stringify(costs) } }];

//@use PROMPTS
//@include common
// One Haiku request per fetched page (text truncated to ~40k characters). A blocked or failed fetch is recorded, never routed around.
const cfg = $('Plan').first().json.cfg;
const plan = $('Scan plan').all().map((i) => i.json);
const fetched = $input.all();
const reqs = [], blocked = [];
fetched.forEach((f, i) => {
  const p = plan[i] || {};
  const raw = typeof (f.json && f.json.data) === 'string' ? f.json.data : JSON.stringify(f.json || '');
  const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 40000);
  if ((f.json && f.json.error) || text.length < 200) { blocked.push({ source_id: p.source_id, source: p.source, url: p.url, reason: (f.json && f.json.error && (f.json.error.message || 'error')) || 'empty' }); return; }
  reqs.push({ json: { source_id: p.source_id, source: p.source, url: p.url, body: anthropicBody(cfg.models.fast, PROMPTS.scan_system, 'Page text: ' + text, 800) } });
});
if (!reqs.length) return [{ json: { none: true, blocked_list: blocked } }];
reqs[0].json.blocked_list = blocked;
return reqs;

//@include common
const cfg = $('Plan').first().json.cfg;
const date = $('Plan').first().json.date;
const reqs = $('Build judge requests').all();
const resp = $input.all();
const FACULTY = { 'whatsapp-conversation': 'conversation', 'comment-reply': 'comments_dms', 'pre-call-brief': 'broker', report: 'broker', creative: 'media', 'landing-page': 'page_flow' };
const SEV = ['critical', 'high', 'medium', 'low'];
const findings = [], runs = [], costs = [];
resp.forEach((r, i) => {
  const meta = (reqs[i] && reqs[i].json) || {};
  const text = r.json && r.json.content && r.json.content[0] && r.json.content[0].text;
  costs.push({ date, kind: 'llm', amount_zar: actZar(cfg, cfg.models.fast, r.json && r.json.usage), source_ref: 'optimisation-advisor:judge:' + meta.rubric });
  const j = parseJson(text);
  if (!j || !Array.isArray(j.findings)) { runs.push({ date, rubric: meta.rubric, sampled: meta.sampled || 0, passed: null, failed: null, critical: 0, status: 'unparseable' }); return; }
  let critical = 0;
  for (const f of j.findings) {
    if (!f.exact_text || !f.rule_id || !f.sample_ref || !SEV.includes(f.severity)) continue; // a finding without exact text, rule and severity is invalid (judge rule 2)
    if (f.severity === 'critical') critical++;
    findings.push({ sample_ref: String(f.sample_ref), faculty: f.faculty || FACULTY[meta.rubric], rule: f.rule_id, severity: f.severity, note: f.note || '', exact_text: String(f.exact_text).slice(0, 600), owner_agent: f.owner_agent || null, graded_at: new Date().toISOString() });
  }
  runs.push({ date, rubric: meta.rubric, sampled: j.sampled == null ? meta.sampled : j.sampled, passed: j.passed == null ? null : j.passed, failed: j.failed == null ? null : j.failed, critical, status: 'ok' });
});
const criticals = findings.filter((f) => f.severity === 'critical');
return [{ json: { findings_json: JSON.stringify(findings), runs_json: JSON.stringify(runs), costs_json: JSON.stringify(costs), critical_count: criticals.length, criticals } }];

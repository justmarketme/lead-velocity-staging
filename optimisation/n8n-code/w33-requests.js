//@use RUBRICS, PROMPTS
//@include common
const cfg = $('Plan').first().json.cfg;
const samples = $('Judge samples').all().map((i) => i.json);
const order = ['whatsapp-conversation', 'comment-reply', 'pre-call-brief', 'report', 'creative', 'landing-page'];
const jobOf = { creative: 'creative', 'landing-page': 'page' };
const out = []; const skipped = [];
for (const name of order) {
  const s = samples.find((x) => x.rubric === name);
  if (!s || !Array.isArray(s.samples) || s.samples.length === 0) { skipped.push({ rubric: name, reason: 'no_samples' }); continue; }
  const user = 'RUBRIC:\n' + RUBRICS[name] + '\n\nSHARED RULES (README):\n' + RUBRICS.README + '\n\nSAMPLES:\n' + JSON.stringify(s.samples);
  const est = estZar(cfg, cfg.models.fast, PROMPTS.judge_system.length + user.length, 2500);
  const job = jobOf[name] || 'judge';
  if (!allow(cfg, job, est)) { skipped.push({ rubric: name, reason: 'cap' }); continue; }
  charge(cfg, job, est);
  out.push({ json: { rubric: name, sampled: s.samples.length, skipped, body: anthropicBody(cfg.models.fast, PROMPTS.judge_system, user, 2500) } });
}
return out;

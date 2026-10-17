//@use PROMPTS
//@include common
// Decide how to write today's pulse: fixed quiet line (no model call), model, or deterministic template (cap hit).
const cfg = $('Plan').first().json.cfg;
const c = $('Compute signals').first().json;
const system = PROMPTS.pulse_system;
const user = 'TODAY: ' + c.INPUT.date + ' (' + c.INPUT.calendar.weekday + ')\nINPUT: ' + JSON.stringify(c.INPUT);
const est = estZar(cfg, cfg.models.fast, system.length + user.length, 1400);
let route = 'llm', reason = null;
if (c.quiet) route = 'quiet';
else if (!allow(cfg, 'pulse', est)) { route = 'template'; reason = 'daily cap'; }
if (route === 'llm') charge(cfg, 'pulse', est);
return [{ json: { route, reason, status: c.status, INPUT: c.INPUT, body: route === 'llm' ? anthropicBody(cfg.models.fast, system, user, 1400) : null } }];

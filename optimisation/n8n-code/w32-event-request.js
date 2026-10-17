//@use PROMPTS
//@include common
const cfg = $('Plan').first().json.cfg;
const e = $('Validate event').first().json;
const user = 'TRIGGER: ' + e.trigger + '   NOW: ' + e.now + '\nFACTS: ' + JSON.stringify(e.facts);
const est = estZar(cfg, cfg.models.fast, PROMPTS.event_system.length + user.length, 400);
const ok = allow(cfg, 'event', est);
if (ok) charge(cfg, 'event', est);
return [{ json: { ok, e, body: ok ? anthropicBody(cfg.models.fast, PROMPTS.event_system, user, 400) : null } }];

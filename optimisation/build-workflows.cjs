#!/usr/bin/env node
// Generates automation/W32.json and automation/W33.json from the single sources in this folder:
//   spc.js, slos.json, prompts/*.md, rubrics/*.md, fixed-sources.md, n8n-code/*.js
// so a Code node can never drift from the tested module. `node optimisation/build-workflows.cjs` writes; `--check` compares.
'use strict';
const fs = require('fs');
const path = require('path');
const here = __dirname;
const rd = (p) => fs.readFileSync(path.join(here, p), 'utf8');

// ---------------- embedded sources ----------------
const section = (txt, from, to) => { const a = txt.indexOf(from); if (a < 0) throw new Error('marker not found: ' + from); const s = a + from.length; const b = to ? txt.indexOf(to, s) : txt.length; if (to && b < 0) throw new Error('marker not found: ' + to); return txt.slice(s, b).trim(); };
const judgeMd = rd('prompts/judge.md');
const fixed = rd('fixed-sources.md');
const PROMPTS = {
  pulse_system: section(rd('prompts/pulse.md'), '# SYSTEM\n', '\n# USER'),
  judge_system: section(judgeMd, '# SYSTEM\n', '\n# USER (filled by W33)'),
  grading_system: section(judgeMd, '## SYSTEM\n'),
  memo_system: section(rd('prompts/weekly-memo.md'), '# SYSTEM\n', '\n# USER'),
  retro_system: section(rd('prompts/monthly-retro.md'), '# SYSTEM\n', '\n# USER'),
  event_system: section(rd('prompts/event-alert.md'), '# SYSTEM\n', '\n# USER'),
  scan_system: section(fixed, 'SYSTEM\n', '\nUSER\n'),
};
const RUBRICS = {};
for (const f of fs.readdirSync(path.join(here, 'rubrics'))) RUBRICS[f.replace(/\.md$/, '')] = rd('rubrics/' + f);
const SLOS = JSON.parse(rd('slos.json'));
const SOURCES = [];
for (const line of section(fixed, '## 1. The list', '**Caps:**').split('\n')) {
  const c = line.split('|').map((x) => x.trim());
  if (c.length > 6 && /^\d+$/.test(c[1])) SOURCES.push({ id: Number(c[1]), name: c[2], url: (c[3].match(/https?:\/\/[^\s)]+/) || [])[0] });
}
const SPC = '(function () { const module = { exports: {} };\n' + rd('spc.js').replace("'use strict';", '') + '\nreturn module.exports; })()';
const COMMON = rd('n8n-code/common.js');

const code = (file, extra = {}) => {
  let src = rd('n8n-code/' + file);
  for (const [k, v] of Object.entries(extra)) src = src.split(k).join(v);
  const uses = (src.match(/^\/\/@use (.*)$/m) || [null, ''])[1].split(',').map((s) => s.trim()).filter(Boolean);
  const decl = { SLOS: 'const SLOS = ' + JSON.stringify(SLOS) + ';', PROMPTS: 'const PROMPTS = ' + JSON.stringify(PROMPTS) + ';', RUBRICS: 'const RUBRICS = ' + JSON.stringify(RUBRICS) + ';', SOURCES: 'const SOURCES = ' + JSON.stringify(SOURCES) + ';', spc: 'const spc = ' + SPC + ';' };
  let out = '';
  for (const u of uses) { if (!decl[u]) throw new Error('unknown @use ' + u + ' in ' + file); out += decl[u] + '\n'; }
  src = src.replace(/^\/\/@use .*\n/m, '');
  if (/^\/\/@include common$/m.test(src)) src = src.replace(/^\/\/@include common$/m, COMMON);
  return out + src;
};

// ---------------- n8n helpers ----------------
const CRED = {
  pg: { postgres: { id: null, name: 'Supabase Postgres (ops writer)' } },
  anth: { httpHeaderAuth: { id: null, name: 'Anthropic API (SMC)' } },
  wa: { httpHeaderAuth: { id: null, name: 'WhatsApp Cloud API token (SMC ops)' } },
  hook: { httpHeaderAuth: { id: null, name: 'n8n webhook secret (SMC)' } },
  outlook: { microsoftOutlookOAuth2Api: { id: null, name: 'Microsoft Graph (howzit@)' } },
  twilio: { httpBasicAuth: { id: null, name: 'Twilio (SMC voice)' } },
};
const SQL = {
  settings: (keys) => 'select key, value, $1::text as mode from ops.settings where key in (' + keys.map((k) => "'" + k + "'").join(',') + ');',
  costs: "select coalesce(sum(amount_zar) filter (where date = current_date and source_ref ~ '^optimisation-advisor:(pulse|judge|grading|event)'), 0) as day_zar,\n coalesce(sum(amount_zar) filter (where date >= date_trunc('week', current_date)::date and source_ref ~ '^optimisation-advisor:(scan|memo|retro)'), 0) as week_zar\nfrom ops.costs where kind = 'llm' and date >= date_trunc('week', current_date)::date;",
  insCosts: 'insert into ops.costs (date, kind, brand_id, broker_id, amount_zar, source_ref)\nselect x.date::date, x.kind, null, null, round(x.amount_zar::numeric, 2), x.source_ref from json_to_recordset($1::json) as x(date text, kind text, amount_zar numeric, source_ref text)\non conflict (date, kind, brand_id, broker_id, source_ref) do update set amount_zar = ops.costs.amount_zar + excluded.amount_zar;',
  recipients: 'select wa, email, ops_email, name, pnid from ops.alert_recipients;',
  // I-34d / CONTRACTS.md "W32 approvals come from ops.notifications": the console writes, W32 polls. One statement, safe for overlapping runs.
  claimApprovals: "UPDATE ops.notifications n\n   SET status = 'sending', updated_at = now()\n WHERE n.id IN (SELECT id FROM ops.notifications\n                 WHERE kind = 'approval' AND source = 'console' AND status = 'queued'\n                 ORDER BY created_at\n                 FOR UPDATE SKIP LOCKED\n                 LIMIT 20)\nRETURNING n.id, n.proposal_id, n.payload;",
  ackApproval: "UPDATE ops.notifications SET status = 'acked', acked_at = now(), acked_by = 'w32', updated_at = now() WHERE id = $1::uuid AND status = 'sending' RETURNING id;",
  failApproval: "UPDATE ops.notifications SET status = 'send_failed', error = $2, updated_at = now() WHERE id = $1::uuid AND status = 'sending' RETURNING id;",
};
class WF {
  constructor(name) { this.name = name; this.nodes = []; this.conn = {}; this.x = 0; }
  add(name, type, typeVersion, parameters, pos, extra = {}) {
    if (this.nodes.some((n) => n.name === name)) throw new Error('duplicate node name ' + name);
    const id = require('crypto').createHash('sha1').update(this.name + '|' + name).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5');
    this.nodes.push(Object.assign({ parameters, id, name, type, typeVersion, position: pos }, extra));
    return name;
  }
  link(a, b, out = 0) { const c = this.conn; c[a] = c[a] || { main: [] }; while (c[a].main.length <= out) c[a].main.push([]); c[a].main[out].push({ node: b, type: 'main', index: 0 }); }
  chain(...names) { for (let i = 0; i < names.length - 1; i++) this.link(names[i], names[i + 1]); }
  json() { return { name: this.name, nodes: this.nodes, connections: this.conn, active: false, settings: { executionOrder: 'v1', timezone: 'Africa/Johannesburg', saveManualExecutions: true, executionTimeout: 900 }, pinData: {}, tags: [{ name: 'smc' }, { name: 'optimisation-advisor' }], meta: { templateCredsSetupCompleted: false, note: 'Generated by optimisation/build-workflows.cjs. Credentials are referenced by name only; map them on import. Never contains secrets.' } }; }
}
const cron = (expr) => ({ rule: { interval: [{ field: 'cronExpression', expression: expr }] } });
const pg = (w, name, query, pos, opts = {}) => w.add(name, 'n8n-nodes-base.postgres', 2.5, Object.assign({ operation: 'executeQuery', query, options: opts.replacement ? { queryReplacement: opts.replacement } : {} }), pos, Object.assign({ credentials: CRED.pg }, opts.node || {}));
const codeNode = (w, name, file, pos, extra, node = {}) => w.add(name, 'n8n-nodes-base.code', 2, { jsCode: code(file, extra) }, pos, node);
const cond = (left, right, type = 'boolean', op = 'equals') => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ id: 'c1', leftValue: left, rightValue: right, operator: { type, operation: op } }], combinator: 'and' }, options: {} });
const ifNode = (w, name, left, right, pos, type, op) => w.add(name, 'n8n-nodes-base.if', 2.2, cond(left, right, type, op), pos);
const anthropic = (w, name, pos) => w.add(name, 'n8n-nodes-base.httpRequest', 4.2, {
  method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }, { name: 'content-type', value: 'application/json' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}', options: { timeout: 120000 },
}, pos, { credentials: CRED.anth, retryOnFail: true, maxTries: 2, waitBetweenTries: 4000, onError: 'continueRegularOutput' });
const once = { executeOnce: true };
const once0 = { executeOnce: true, alwaysOutputData: true };

// ======================================================================
// W33 - daily judge
// ======================================================================
function buildW33() {
  const w = new WF('W33 Daily judge (LLM-as-judge)');
  w.add('Note', 'n8n-nodes-base.stickyNote', 1, { content: '## W33 daily judge (06:00 SAST)\nSamples real outputs, grades them against rubrics/*.md with Haiku 4.5, writes ops.quality_grades, then grades yesterday\'s approved changes against their forecast. Read-only on everything except ops.quality_grades / ops.judge_runs / ops.costs / ops.proposals(verdict, actual). Never grades its own or the advisor\'s outputs. No secrets here; credentials by name.', width: 520, height: 160 }, [0, -220]);
  const t = w.add('Daily 06:00 SAST', 'n8n-nodes-base.scheduleTrigger', 1.2, cron('0 6 * * *'), [0, 0]);
  const s = pg(w, 'Settings', "select key, value from ops.settings where key in ('usd_zar','opt_daily_cap_zar','opt_weekly_cap_zar');", [220, 0], { node: once });
  const c = pg(w, 'Costs', SQL.costs, [440, 0], { node: once });
  const p = codeNode(w, 'Plan', 'w33-plan.js', [660, 0]);
  const smp = pg(w, 'Judge samples', "select rubric, samples from ops.judge_samples(current_date);", [880, 0], { node: { alwaysOutputData: true, executeOnce: true } });
  const rq = codeNode(w, 'Build judge requests', 'w33-requests.js', [1100, 0]);
  const an = anthropic(w, 'Anthropic judge', [1320, 0]);
  const pr = codeNode(w, 'Parse judge', 'w33-parse.js', [1540, 0]);
  const i1 = pg(w, 'Insert grades', 'insert into ops.quality_grades (sample_ref, faculty, rule, severity, passed, note, exact_text, owner_agent, judge_model, graded_at)\nselect x.sample_ref, x.faculty, x.rule, x.severity, false, x.note, x.exact_text, x.owner_agent, \'claude-haiku-4-5-20251001\', x.graded_at::timestamptz\nfrom json_to_recordset($1::json) as x(sample_ref text, faculty text, rule text, severity text, note text, exact_text text, owner_agent text, graded_at text);', [1760, 0], { replacement: '={{ $json.findings_json }}', node: once });
  const i2 = pg(w, 'Insert judge runs', 'insert into ops.judge_runs (date, rubric, sampled, passed, failed, critical, status)\nselect x.date::date, x.rubric, x.sampled, x.passed, x.failed, x.critical, x.status\nfrom json_to_recordset($1::json) as x(date text, rubric text, sampled int, passed int, failed int, critical int, status text);', [1980, 0], { replacement: '={{ $("Parse judge").first().json.runs_json }}', node: once });
  const i3 = pg(w, 'Insert costs', SQL.insCosts, [2200, 0], { replacement: '={{ $("Parse judge").first().json.costs_json }}', node: once });
  const crit = ifNode(w, 'Critical finding?', '={{ $("Parse judge").first().json.critical_count > 0 }}', true, [2420, 0]);
  const ev = w.add('Raise out-of-cycle event (W32)', 'n8n-nodes-base.httpRequest', 4.2, { method: 'POST', url: 'http://127.0.0.1:5678/webhook/smc-w32-event', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ trigger: "compliance_control_failed", ref: "judge:" + $("Plan").first().json.date, facts: { faculty: "compliance", what: "Judge found " + $("Parse judge").first().json.critical_count + " critical finding(s) on real output", impact: "see ops.quality_grades severity=critical", first_action: "open Judge findings in the console and pause the owning path", owner_agent: $("Parse judge").first().json.criticals[0].owner_agent || "compliance-qa" } }) }}', options: { timeout: 15000 } }, [2640, -120], { credentials: CRED.hook, onError: 'continueRegularOutput' });
  const act = pg(w, 'Actuals', 'select * from ops.proposal_actuals(current_date);', [2860, 0], { node: once0 });
  const gr = codeNode(w, 'Build grading request', 'w33-grading-requests.js', [3080, 0]);
  const ag = anthropic(w, 'Anthropic grading', [3300, 0]);
  const gp = codeNode(w, 'Parse grading', 'w33-grading-parse.js', [3520, 0]);
  const up = pg(w, 'Update proposals', "update ops.proposals p set verdict = case when g.verdict = 'not_enough_data' then null else g.verdict end,\n kill_rule_hit = g.kill_rule_hit, grade_note = g.note, graded_at = case when g.verdict = 'not_enough_data' then null else now() end,\n check_date = coalesce(g.new_check_date::date, p.check_date), actual = coalesce(g.actual::text, p.actual),\n status = case when g.verdict = 'not_enough_data' then p.status else 'checked' end\nfrom json_to_recordset($1::json) as g(proposal_id uuid, verdict text, kill_rule_hit boolean, note text, new_check_date text, actual json)\nwhere p.id = g.proposal_id;", [3740, 0], { replacement: '={{ $json.grades_json }}', node: once });
  const gc = pg(w, 'Insert grading costs', SQL.insCosts, [3960, 0], { replacement: '={{ $("Parse grading").first().json.costs_json }}', node: once });
  w.chain(t, s, c, p, smp, rq, an, pr, i1, i2, i3, crit);
  w.link(crit, ev, 0); w.link(crit, act, 1); w.link(ev, act);
  w.chain(act, gr, ag, gp, up, gc);
  return w.json();
}

// ======================================================================
// W32 - pulse / memo / retro / events / approvals / escalation
// ======================================================================
function buildW32() {
  const w = new WF('W32 Optimisation pulse, memo, retro, events, approvals');
  w.add('Note', 'n8n-nodes-base.stickyNote', 1, { content: '## W32 (proposes, never changes)\nDaily 06:30 pulse (delivered 07:00) | Monday 06:00 memo | first working day retro | event webhook | Approve/Snooze/Decline webhook (WhatsApp button) | 1-min poll of console approvals in ops.notifications (I-34d) | 15-min escalation watcher.\nAll numbers are computed in the "Compute signals" Code node (spc.js inlined); the model only writes words. Caps: R15/day, R40/week (ops.settings), reserve for pulse and memo. Cap hit = pulse from production data only, scan skipped.\nApprove creates an ops.proposals decision AND appends a node to build/tasks.json (validated by build/validate-tasks.mjs). Credentials by name; no secrets.', width: 620, height: 240 }, [0, -300]);

  // ---- triggers and modes ----
  const t1 = w.add('Daily 06:30 pulse', 'n8n-nodes-base.scheduleTrigger', 1.2, cron('30 6 * * *'), [0, 0]);
  const t2 = w.add('Monday 06:00 memo', 'n8n-nodes-base.scheduleTrigger', 1.2, cron('0 6 * * 1'), [0, 160]);
  const t3 = w.add('Monthly retro (first working day)', 'n8n-nodes-base.scheduleTrigger', 1.2, cron('0 6 1-3 * 1-5'), [0, 320]);
  const m1 = w.add('Mode: pulse', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: { mode: 'pulse' } }];" }, [220, 0]);
  const m2 = w.add('Mode: weekly', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: { mode: 'weekly' } }];" }, [220, 160]);
  const guard = pg(w, 'Monthly guard', "select not exists (select 1 from ops.optimisation_memos where kind = 'monthly_retro' and period_start = date_trunc('month', current_date)::date) as todo, 'monthly'::text as mode;", [220, 320], { node: once });
  const gif = ifNode(w, 'Not yet run this month?', '={{ $json.todo }}', true, [440, 320]);
  w.chain(t1, m1); w.chain(t2, m2); w.chain(t3, guard, gif);

  const settings = pg(w, 'Settings', SQL.settings(['usd_zar', 'wa_graph_version', 'opt_daily_cap_zar', 'opt_weekly_cap_zar', 'twilio_sid', 'twilio_voice_from', 'build_active']), [660, 160], { replacement: '={{ $json.mode }}', node: once });
  w.link(m1, settings); w.link(m2, settings); w.link(gif, settings, 0);
  const costs = pg(w, 'Costs', SQL.costs, [880, 160], { node: once });
  const plan = codeNode(w, 'Plan', 'w32-plan.js', [1100, 160]);
  const recips = pg(w, 'Recipients', SQL.recipients, [1320, 160], { node: once0 });
  w.chain(settings, costs, plan, recips);

  // ---- state for pulse / weekly / monthly (shared) ----
  const series = pg(w, 'Series', 'select faculty, metric, date, value, numerator, denominator, n, spend_zar, conversions, seed from facts.pulse_daily where date >= current_date - 61 order by faculty, metric, date;', [1540, 160], { node: once0 });
  const jt = pg(w, 'Judge today', "select sample_ref, faculty, rule, severity, note, exact_text, owner_agent from ops.quality_grades where graded_at >= current_date - 1 and graded_at < current_date + 1;", [1760, 160], { node: once0 });
  const jr = pg(w, 'Judge runs', 'select rubric, sampled, passed, failed, critical, status from ops.judge_runs where date = current_date;', [1980, 160], { node: once0 });
  const jn = pg(w, 'Journal', "select id::text as id, faculty, title, status, decided_at, decline_reason, snooze_until as snoozed_until, verdict, graded_at, forecast, actual from ops.proposals where created_at >= now() - interval '60 days';", [2200, 160], { node: once0 });
  const bs = pg(w, 'Build state', 'select commits_24h, tests_failing, tests_failed_twice, gates_oldest_hours from ops.build_state_latest;', [2420, 160], { node: once0 });
  const rf = w.add('Read tasks.json file', 'n8n-nodes-base.readWriteFile', 1, { operation: 'read', fileSelector: '/home/node/repo/build/tasks.json', options: {} }, [2640, 160], { executeOnce: true, onError: 'continueRegularOutput' });
  const ex = w.add('Tasks.json', 'n8n-nodes-base.extractFromFile', 1, { operation: 'fromJson', options: {} }, [2860, 160], { executeOnce: true, alwaysOutputData: true });
  const comp = codeNode(w, 'Compute signals', 'w32-compute.js', [3080, 160]);
  const sw = w.add('By mode', 'n8n-nodes-base.switch', 3, { rules: { values: ['pulse', 'weekly', 'monthly'].map((m) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $("Plan").first().json.mode }}', rightValue: m, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: m })) }, options: {} }, [3300, 160]);
  w.chain(recips, series, jt, jr, jn, bs, rf, ex, comp, sw);

  // ---- shared tail: wait -> reserve (dedupe) -> send -> mark ----
  const needs = ifNode(w, 'Needs wait?', '={{ new Date($json.wait_until).getTime() > Date.now() + 60000 }}', true, [6200, 700]);
  const wait = w.add('Wait until 07:00 SAST', 'n8n-nodes-base.wait', 1.1, { resume: 'specificTime', dateTime: '={{ $json.wait_until }}' }, [6420, 640]);
  const reserve = pg(w, 'Reserve notification', 'insert into ops.notifications (kind, recipient, channel, dedupe_key, payload, proposal_id)\nselect $1, $2, ($4::jsonb)->>\'channel\', $3, $4::jsonb, $5::uuid\nwhere not exists (select 1 from ops.notifications where dedupe_key = $3 and created_at > now() - interval \'24 hours\')\nreturning id, kind, recipient as "to", dedupe_key, payload;', [6640, 700], { replacement: '={{ [ $json.kind, $json.to, $json.dedupe_key, JSON.stringify($json.payload), $json.proposal_id || null ] }}' });
  const chan = w.add('By channel', 'n8n-nodes-base.switch', 3, { rules: { values: ['whatsapp', 'email', 'console'].map((m) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.payload.channel }}', rightValue: m, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: m })) }, options: {} }, [6860, 700]);
  const wasend = w.add('WhatsApp send', 'n8n-nodes-base.httpRequest', 4.2, { method: 'POST', url: "={{ 'https://graph.facebook.com/' + $json.payload.ver + '/' + $json.payload.pnid + '/messages' }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.payload.body) }}', options: { timeout: 20000 } }, [7080, 640], { credentials: CRED.wa, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, onError: 'continueRegularOutput' });
  const mark = pg(w, 'Mark sent', 'update ops.notifications set sent_at = case when $2::text is null then null else now() end, external_id = $2, error = $3 where id = $1::uuid;', [7300, 640], { replacement: "={{ [ $('Reserve notification').item.json.id, ($json.messages && $json.messages[0]) ? $json.messages[0].id : null, $json.error ? JSON.stringify($json.error).slice(0, 300) : null ] }}" });
  const mail = w.add('Email send (Graph, howzit@)', 'n8n-nodes-base.microsoftOutlook', 2, { resource: 'message', operation: 'send', subject: '={{ $json.payload.subject }}', bodyContent: '={{ $json.payload.html }}', toRecipients: '={{ $json.to }}', additionalFields: { bodyContentType: 'html' } }, [7080, 780], { credentials: CRED.outlook, onError: 'continueRegularOutput' });
  const mark2 = pg(w, 'Mark email sent', 'update ops.notifications set sent_at = now() where id = $1::uuid;', [7300, 780], { replacement: "={{ [ $('Reserve notification').item.json.id ] }}" });
  const cons = pg(w, 'Console banner sent', 'update ops.notifications set sent_at = now() where id = $1::uuid;', [7080, 900], { replacement: '={{ [ $json.id ] }}' });
  w.link(needs, wait, 0); w.link(needs, reserve, 1); w.link(wait, reserve);
  w.link(reserve, chan); w.link(chan, wasend, 0); w.link(wasend, mark); w.link(chan, mail, 1); w.link(mail, mark2); w.link(chan, cons, 2);
  const direct = reserve; // immediate sends (escalations, confirmations) go straight to Reserve

  // ---- PULSE ----
  const rp = codeNode(w, 'Route pulse', 'w32-route.js', [3520, 0]);
  const sp = ifNode(w, 'Use model?', '={{ $json.route }}', 'llm', [3740, 0], 'string');
  const ap = anthropic(w, 'Anthropic pulse', [3960, -60]);
  const fp = codeNode(w, 'Finalise pulse', 'w32-pulse-finalise.js', [4180, 0]);
  const ip = pg(w, 'Insert pulse', "insert into ops.pulses (date, status, quiet, working, not_working, actions, compliance, build, card_markdown, whatsapp_text, business_line)\nselect (p->>'date')::date, p->>'status', (p->>'quiet')::boolean, (p->'working')::text, (p->'not_working')::text, p->'actions', p->'compliance', p->'build', p->>'card_markdown', p->>'whatsapp_text', p->>'business_line'\nfrom (select $1::jsonb as p) x\non conflict (date) do update set status = excluded.status, quiet = excluded.quiet, working = excluded.working, not_working = excluded.not_working, actions = excluded.actions, compliance = excluded.compliance, build = excluded.build, card_markdown = excluded.card_markdown, whatsapp_text = excluded.whatsapp_text, business_line = excluded.business_line;", [4400, 0], { replacement: '={{ $json.pulse_json }}', node: once });
  const rs = pg(w, 'Resolve signals', "update ops.signals set resolved_at = now() where resolved_at is null and rule <> 'event' and signal_key <> all (array(select jsonb_array_elements_text($1::jsonb)));", [4620, 0], { replacement: '={{ JSON.stringify($("Finalise pulse").first().json.signal_keys) }}', node: once });
  const isg = pg(w, 'Insert signals', 'insert into ops.signals (signal_key, faculty, metric, value, limit_value, run, rule, side, burning, cause, owner, detected_at)\nselect x.signal_key, x.faculty, x.metric, x.value, x."limit", x.run, x.rule, x.side, x.burning, x.cause, x.owner, now()\nfrom json_to_recordset($1::json) as x(signal_key text, faculty text, metric text, value numeric, "limit" numeric, run text, rule text, side text, burning boolean, cause text, owner text)\nwhere not exists (select 1 from ops.signals s where s.signal_key = x.signal_key);', [4840, 0], { replacement: '={{ $("Finalise pulse").first().json.signals_json }}', node: once });
  const ic = pg(w, 'Insert pulse costs', SQL.insCosts, [5060, 0], { replacement: '={{ $("Finalise pulse").first().json.costs_json }}', node: once });
  const PROP_SQL = (ret) => 'insert into ops.proposals (pulse_date, faculty, title, metric, forecast, cost_zar, grade, test, kill_rule, mechanism, owner_agent, check_date, ice, source, evidence, status, created_at)\nselect x.pulse_date::date, x.faculty, x.title, x.metric, x.forecast::text, x.cost_zar, x.grade, x.test, x.kill_rule, x.mechanism, x.owner_agent, x.check_date::date, x.ice::jsonb, x.source, x.evidence, \'proposed\', now()\nfrom json_to_recordset($1::json) as x(pulse_date text, faculty text, title text, metric text, forecast json, cost_zar numeric, grade text, test text, kill_rule text, mechanism text, owner_agent text, check_date text, ice json, source text, evidence text)\nwhere not exists (select 1 from ops.proposals p where p.pulse_date = x.pulse_date::date and p.title = x.title)' + (ret ? '\nreturning id::text as id, title, metric, forecast, cost_zar, grade, owner_agent, faculty;' : ';');
  const ipr = pg(w, 'Insert proposals', PROP_SQL(true), [5280, 0], { replacement: '={{ $("Finalise pulse").first().json.proposals_json }}', node: once0 });
  const pm = codeNode(w, 'Pulse messages', 'w32-pulse-messages.js', [5500, 0]);
  w.link(sw, rp, 0); w.chain(rp, sp); w.link(sp, ap, 0); w.link(sp, fp, 1); w.link(ap, fp); w.chain(fp, ip, rs, isg, ic, ipr, pm, needs);

  // ---- WEEKLY ----
  const p4 = pg(w, 'Proposals 4 weeks', "select id::text as id, faculty, title, status, forecast, actual, verdict, check_date, decided_at, graded_at from ops.proposals where created_at >= now() - interval '28 days';", [3520, 200], { node: once0 });
  const sp1 = codeNode(w, 'Scan plan', 'w32-scan-plan.js', [3740, 200]);
  const sk = ifNode(w, 'Scan skipped?', '={{ $json.skip === true }}', true, [3960, 200]);
  const fetch = w.add('Fetch source page', 'n8n-nodes-base.httpRequest', 4.2, { method: 'GET', url: '={{ $json.url }}', sendHeaders: true, headerParameters: { parameters: [{ name: 'User-Agent', value: 'SortMyCoverWeeklyScan/1.0' }, { name: 'Accept', value: 'text/html,application/json' }] }, options: { timeout: 20000, response: { response: { responseFormat: 'text', neverError: true } } } }, [4180, 260], { onError: 'continueRegularOutput' });
  const sm = codeNode(w, 'Summarise pages', 'w32-scan-summarise.js', [4400, 260]);
  const sany = ifNode(w, 'Any page to summarise?', '={{ !!$json.body }}', true, [4620, 260]);
  const asc = anthropic(w, 'Anthropic scan', [4840, 220]);
  const agg = codeNode(w, 'Aggregate scan', 'w32-scan-aggregate.js', [5060, 260]);
  const mq = codeNode(w, 'Memo request', 'w32-memo-request.js', [5280, 200]);
  const mok = ifNode(w, 'Memo within cap?', '={{ $json.ok }}', true, [5500, 200]);
  const amm = anthropic(w, 'Anthropic memo', [5720, 160]);
  const fm = codeNode(w, 'Finalise memo', 'w32-memo-finalise.js', [5940, 200]);
  const MEMO_SQL = "insert into ops.optimisation_memos (kind, period_start, period_end, body_md, payload)\nselect case m->>'kind' when 'weekly' then 'weekly_memo' else 'monthly_retro' end, (m->>'week_start')::date,\n case m->>'kind' when 'weekly' then (m->>'week_start')::date + 6 else ((m->>'week_start')::date + interval '1 month' - interval '1 day')::date end, m->>'markdown', m\nfrom (select $1::jsonb as m) x\non conflict (kind, period_start) do update set body_md = excluded.body_md, payload = excluded.payload;";
  const im = pg(w, 'Insert memo', MEMO_SQL, [6160, 200], { replacement: '={{ $json.memo_json }}', node: once });
  const imp = pg(w, 'Insert memo proposals', PROP_SQL(false), [6380, 200], { replacement: '={{ $("Finalise memo").first().json.proposals_json }}', node: once });
  const imc = pg(w, 'Insert memo costs', SQL.insCosts, [6600, 200], { replacement: '={{ $("Finalise memo").first().json.costs_json }}', node: once });
  const mmsg = codeNode(w, 'Memo messages', 'w32-memo-messages.js', [6820, 200]);
  w.link(sw, p4, 1); w.chain(p4, sp1, sk);
  w.link(sk, mq, 0); w.link(sk, fetch, 1); w.chain(fetch, sm, sany); w.link(sany, asc, 0); w.link(sany, agg, 1); w.link(asc, agg); w.link(agg, mq);
  w.chain(mq, mok); w.link(mok, amm, 0); w.link(mok, fm, 1); w.link(amm, fm); w.chain(fm, im, imp, imc, mmsg, needs);

  // ---- MONTHLY ----
  const ce = pg(w, 'Cycle economics', "select * from facts.fact_cycle where starts_at >= date_trunc('month', current_date - interval '2 months');", [3520, 520], { node: once0 });
  const pmn = pg(w, 'Proposals month', "select id::text as id, faculty, title, status, forecast, actual, verdict, check_date, decided_at, graded_at from ops.proposals where created_at >= now() - interval '35 days';", [3740, 520], { node: once0 });
  const ss = pg(w, 'Scan summaries', "select period_start, payload->'scan' as scan from ops.optimisation_memos where kind = 'weekly_memo' and period_start >= current_date - 35;", [3960, 520], { node: once0 });
  const jm = pg(w, 'Judge month', "select faculty, rule, severity, count(*) as n from ops.quality_grades where graded_at >= date_trunc('month', current_date - interval '1 month') and graded_at < date_trunc('month', current_date) group by 1, 2, 3;", [4180, 520], { node: once0 });
  const rq = codeNode(w, 'Retro request', 'w32-retro-request.js', [4400, 520]);
  const rok = ifNode(w, 'Retro within cap?', '={{ $json.ok }}', true, [4620, 520]);
  const ar = anthropic(w, 'Anthropic retro', [4840, 480]);
  const fr = codeNode(w, 'Finalise retro', 'w32-retro-finalise.js', [5060, 520]);
  const imr = pg(w, 'Insert retro memo', MEMO_SQL, [5280, 520], { replacement: '={{ $json.memo_json }}', node: once });
  const imrp = pg(w, 'Insert retro proposals', PROP_SQL(false), [5500, 520], { replacement: '={{ $("Finalise retro").first().json.proposals_json }}', node: once });
  const imrc = pg(w, 'Insert retro costs', SQL.insCosts, [5720, 520], { replacement: '={{ $("Finalise retro").first().json.costs_json }}', node: once });
  const emr = w.add('Emit retro messages', 'n8n-nodes-base.code', 2, { jsCode: code('emit-msgs.js', { __SRC__: 'Finalise retro' }) }, [5940, 520]);
  w.link(sw, ce, 2); w.chain(ce, pmn, ss, jm, rq, rok); w.link(rok, ar, 0); w.link(rok, fr, 1); w.link(ar, fr); w.chain(fr, imr, imrp, imrc, emr, needs);

  // ---- EVENTS ----
  const hk = w.add('Event trigger', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'smc-w32-event', authentication: 'headerAuth', responseMode: 'onReceived', options: {} }, [0, 900], { credentials: { httpHeaderAuth: { id: null, name: 'n8n webhook secret (SMC)' } }, webhookId: 'smc-w32-event' });
  const ve = codeNode(w, 'Validate event', 'w32-event-validate.js', [220, 900]);
  const vif = ifNode(w, 'Valid event?', '={{ $json.valid }}', true, [440, 900]);
  const sev = pg(w, 'Settings (event)', SQL.settings(['usd_zar', 'wa_graph_version', 'opt_daily_cap_zar', 'opt_weekly_cap_zar', 'twilio_sid', 'twilio_voice_from', 'build_active']), [660, 900], { replacement: "={{ $json.mode }}", node: once });
  const cev = pg(w, 'Costs (event)', SQL.costs, [880, 900], { node: once });
  // reuse Plan / Recipients code by pointing event chain at dedicated nodes (same code, different names)
  const pev = w.add('Plan (event)', 'n8n-nodes-base.code', 2, { jsCode: code('w32-plan.js').split("$('Settings')").join("$('Settings (event)')").split("$('Costs')").join("$('Costs (event)')") }, [1100, 900]);
  const rev = pg(w, 'Recipients (event)', SQL.recipients, [1320, 900], { node: once0 });
  // the event code nodes read Plan/Recipients by their original names, so create thin aliases through renamed copies
  const evq = w.add('Event request', 'n8n-nodes-base.code', 2, { jsCode: code('w32-event-request.js').split("$('Plan')").join("$('Plan (event)')") }, [1540, 900]);
  const eok = ifNode(w, 'Event within cap?', '={{ $json.ok }}', true, [1760, 900]);
  const aev = anthropic(w, 'Anthropic event', [1980, 860]);
  const fev = w.add('Finalise event', 'n8n-nodes-base.code', 2, { jsCode: code('w32-event-finalise.js').split("$('Plan')").join("$('Plan (event)')").split("$('Recipients')").join("$('Recipients (event)')") }, [2200, 900]);
  const iev = pg(w, 'Insert event signals', 'insert into ops.signals (signal_key, faculty, metric, value, limit_value, run, rule, side, burning, cause, owner, detected_at)\nselect x.signal_key, x.faculty, x.metric, x.value, x."limit", x.run, x.rule, x.side, x.burning, x.cause, x.owner, now()\nfrom json_to_recordset($1::json) as x(signal_key text, faculty text, metric text, value numeric, "limit" numeric, run text, rule text, side text, burning boolean, cause text, owner text)\nwhere not exists (select 1 from ops.signals s where s.signal_key = x.signal_key);', [2420, 900], { replacement: '={{ $json.signals_json }}', node: once });
  const cevi = pg(w, 'Insert event costs', SQL.insCosts, [2640, 900], { replacement: '={{ $("Finalise event").first().json.costs_json }}', node: once });
  const eem = w.add('Emit event messages', 'n8n-nodes-base.code', 2, { jsCode: code('emit-msgs.js', { __SRC__: 'Finalise event' }) }, [2860, 900]);
  const mev = w.add('Mode: event', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: { mode: 'event' } }];" }, [550, 900]);
  w.chain(hk, ve, vif); w.link(vif, mev, 0); w.chain(mev, sev, cev, pev, rev, evq, eok); w.link(eok, aev, 0); w.link(eok, fev, 1); w.link(aev, fev); w.chain(fev, iev, cevi, eem, needs);

  // ---- APPROVE / SNOOZE / DECLINE ----
  const ha = w.add('Approve decision', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'smc-w32-decision', authentication: 'headerAuth', responseMode: 'onReceived', options: {} }, [0, 1300], { credentials: { httpHeaderAuth: { id: null, name: 'n8n webhook secret (SMC)' } }, webhookId: 'smc-w32-decision' });
  const vd = codeNode(w, 'Validate decision', 'w32-approve-validate.js', [220, 1300]);
  const vdi = ifNode(w, 'Valid decision?', '={{ $json.valid }}', true, [440, 1300]);
  const ma = w.add('Mode: approve', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: { mode: 'approve' } }];" }, [550, 1300]);
  const sda = pg(w, 'Settings (decision)', SQL.settings(['usd_zar', 'wa_graph_version']), [660, 1300], { replacement: '={{ $json.mode }}', node: once });
  const cda = pg(w, 'Costs (decision)', SQL.costs, [880, 1300], { node: once });
  const pda = w.add('Plan (decision)', 'n8n-nodes-base.code', 2, { jsCode: code('w32-plan.js').split("$('Settings')").join("$('Settings (decision)')").split("$('Costs')").join("$('Costs (decision)')") }, [1100, 1300]);
  const rda = pg(w, 'Recipients (decision)', SQL.recipients, [1320, 1300], { node: once0 });
  const dec = pg(w, 'Decide', "with d as (select $1::text as decision, $2::uuid as id, $3::text as by, $4::text as reason, coalesce($5::text, 'webhook') as via)\nupdate ops.proposals p set\n status = case when d.via = 'console' then p.status when d.decision = 'approve' then 'approved' when d.decision = 'snooze' then 'snoozed' when d.decision = 'decline' then 'declined' else p.status end,\n decided_by_label = case when d.decision = 'later' or d.via = 'console' then p.decided_by_label else d.by end,\n decided_at = case when d.decision = 'later' or d.via = 'console' then p.decided_at else now() end,\n decline_reason = case when d.decision = 'decline' and d.via <> 'console' then d.reason else p.decline_reason end,\n snooze_until = case when d.decision = 'snooze' and d.via <> 'console' then current_date + 7 else p.snooze_until end\nfrom d where p.id = d.id and (\n (d.via <> 'console' and p.status in ('proposed', 'snoozed'))\n -- console path: smc_console_decide_proposal already decided the row; W32 only runs the follow-up once (task_id guard)\n or (d.via = 'console' and p.decided_by_label = 'console' and p.task_id is null\n     and p.status = case d.decision when 'approve' then 'approved' when 'snooze' then 'snoozed' when 'decline' then 'declined' end))\nreturning p.id::text as id, p.title, p.metric, p.forecast, p.test, p.kill_rule, p.owner_agent, p.check_date, p.decided_by_label as decided_by, d.decision;", [1540, 1300], { replacement: "={{ [ $('Validate decision').first().json.decision, $('Validate decision').first().json.proposal_id, $('Validate decision').first().json.decided_by, $('Validate decision').first().json.reason, $('Validate decision').first().json.via ] }}", node: once });
  const ack = pg(w, 'Ack action notifications', "update ops.notifications set acked_at = now() where proposal_id = $1::uuid and acked_at is null and $2 <> 'later';", [1760, 1300], { replacement: '={{ [ $json.id, $json.decision ] }}', node: once });
  const apif = ifNode(w, 'Approved?', "={{ $('Decide').first().json.decision === 'approve' }}", true, [1980, 1300]);
  const rf2 = w.add('Read tasks.json file (approve)', 'n8n-nodes-base.readWriteFile', 1, { operation: 'read', fileSelector: '/home/node/repo/build/tasks.json', options: {} }, [2200, 1260], { executeOnce: true });
  const ex2 = w.add('Tasks.json (approve)', 'n8n-nodes-base.extractFromFile', 1, { operation: 'fromJson', options: {} }, [2420, 1260], { executeOnce: true });
  const at = w.add('Append task node', 'n8n-nodes-base.code', 2, { jsCode: code('w32-approve-task.js') }, [2640, 1260]);
  const okif = ifNode(w, 'Task node valid?', '={{ $json.ok === true }}', true, [2860, 1260]);
  const nw = ifNode(w, 'Needs write?', '={{ $json.already !== true }}', true, [3080, 1220]);
  const wr = w.add('Write tasks.json', 'n8n-nodes-base.readWriteFile', 1, { operation: 'write', fileName: '/home/node/repo/build/tasks.json', dataPropertyName: 'data', options: { append: false } }, [3300, 1180]);
  const vv = w.add('Run validate-tasks.mjs', 'n8n-nodes-base.executeCommand', 1, { command: 'cd /home/node/repo && node build/validate-tasks.mjs' }, [3520, 1180], { onError: 'continueErrorOutput' });
  const link = pg(w, 'Link task', 'update ops.proposals set task_id = $2 where id = $1::uuid;', [3740, 1180], { replacement: "={{ [ $('Decide').first().json.id, $('Append task node').first().json.task_id ] }}", node: once });
  const cf = codeNode(w, 'Confirm to approvers', 'w32-approve-confirm.js', [3960, 1180].map((x) => x), {});
  w.nodes.find((n) => n.name === 'Confirm to approvers').parameters.jsCode = code('w32-approve-confirm.js').split("$('Plan')").join("$('Plan (decision)')").split("$('Recipients')").join("$('Recipients (decision)')");
  const rest = w.add('Restore tasks.json (binary)', 'n8n-nodes-base.code', 2, { jsCode: code('w32-approve-restore.js') }, [3740, 1320]);
  const rw = w.add('Write restored tasks.json', 'n8n-nodes-base.readWriteFile', 1, { operation: 'write', fileName: '/home/node/repo/build/tasks.json', dataPropertyName: 'data', options: { append: false } }, [3960, 1320]);
  const fail = pg(w, 'Flag task failure', "insert into ops.signals (signal_key, faculty, metric, value, limit_value, run, rule, side, burning, cause, owner, detected_at)\nselect 'event.task_append.' || $1 || '.' || extract(epoch from now())::bigint, 'build', 'approve_task_append', null, null, '1', 'event', 'adverse', false, 'tasks.json append failed validation; proposal ' || $1 || ' is approved but has no task. File restored.', 'orchestrator', now();", [4180, 1320], { replacement: "={{ [ $('Decide').first().json.id ] }}", node: once });
  w.chain(ha, vd, vdi); w.link(vdi, ma, 0); w.chain(ma, sda, cda, pda, rda, dec, ack, apif);
  w.link(apif, rf2, 0); w.chain(rf2, ex2, at, okif);
  w.link(okif, nw, 0); w.link(okif, fail, 1); w.link(nw, wr, 0); w.link(nw, link, 1); w.chain(wr, vv); w.link(vv, link, 0); w.link(vv, rest, 1); w.chain(rest, rw, fail); w.chain(link, cf); w.link(cf, direct);

  // ---- CONSOLE APPROVALS (I-30j / I-34d): poll ops.notifications every minute (LISTEN drops events across restarts).
  // Each claimed row runs the decision branch above as a sub-execution of this same workflow (so the branch's
  // $('Validate decision').first() semantics stay one-decision-per-run), then the row is set acked or send_failed.
  const tpc = w.add('Every minute: console approvals', 'n8n-nodes-base.scheduleTrigger', 1.2, cron('* * * * *'), [0, 1500]);
  const clm = pg(w, 'Claim console approvals', SQL.claimApprovals, [220, 1500]);
  const lop = w.add('Loop console approvals', 'n8n-nodes-base.splitInBatches', 3, { batchSize: 1, options: {} }, [440, 1500]);
  const cmap = codeNode(w, 'Console row to decision', 'w32-console-claim-map.js', [660, 1560]);
  const cvi = ifNode(w, 'Console row valid?', '={{ $json.valid }}', true, [880, 1560]);
  const runb = w.add('Run decision branch (sub-call)', 'n8n-nodes-base.executeWorkflow', 1.2, { source: 'database', workflowId: { __rl: true, mode: 'id', value: '={{ $workflow.id }}' }, mode: 'once', options: { waitForSubWorkflow: true } }, [1100, 1520], { onError: 'continueErrorOutput', alwaysOutputData: true });
  const ackc = pg(w, 'Ack console approval', SQL.ackApproval, [1320, 1480], { replacement: "={{ $('Loop console approvals').first().json.id }}", node: once0 });
  const failc = pg(w, 'Mark console approval send_failed', SQL.failApproval, [1320, 1620], { replacement: "={{ [ $('Loop console approvals').first().json.id, String(($json.error && ($json.error.message || $json.error)) || 'decision branch failed').slice(0, 500) ] }}", node: once0 });
  const subt = w.add('Console decision (sub-call)', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, [0, 1400]);
  w.chain(tpc, clm, lop); w.link(lop, cmap, 1); w.link(cmap, cvi); w.link(cvi, runb, 0); w.link(cvi, failc, 1);
  w.link(runb, ackc, 0); w.link(runb, failc, 1); w.link(ackc, lop); w.link(failc, lop);
  w.link(subt, vd);

  // ---- ESCALATION WATCHER (6.8b dedupe and escalation; reminders at 24 h) ----
  const te = w.add('Every 15 min', 'n8n-nodes-base.scheduleTrigger', 1.2, cron('*/15 * * * *'), [0, 1700]);
  const me = w.add('Mode: escalate', 'n8n-nodes-base.code', 2, { jsCode: "return [{ json: { mode: 'escalate' } }];" }, [220, 1700]);
  const se = pg(w, 'Settings (escalate)', SQL.settings(['usd_zar', 'wa_graph_version', 'twilio_sid', 'twilio_voice_from']), [440, 1700], { replacement: '={{ $json.mode }}', node: once });
  const ce2 = pg(w, 'Costs (escalate)', SQL.costs, [660, 1700], { node: once });
  const pe2 = w.add('Plan (escalate)', 'n8n-nodes-base.code', 2, { jsCode: code('w32-plan.js').split("$('Settings')").join("$('Settings (escalate)')").split("$('Costs')").join("$('Costs (escalate)')") }, [880, 1700]);
  const re2 = pg(w, 'Recipients (escalate)', SQL.recipients, [1100, 1700], { node: once0 });
  const du = pg(w, 'Due notifications', 'select * from ops.notifications_due();', [1320, 1700], { node: once0 });
  const ep = w.add('Escalation plan', 'n8n-nodes-base.code', 2, { jsCode: code('w32-escalate.js').split("$('Plan')").join("$('Plan (escalate)')").split("$('Recipients')").join("$('Recipients (escalate)')") }, [1540, 1700]);
  const em = w.add('Emit escalation messages', 'n8n-nodes-base.code', 2, { jsCode: code('emit-msgs.js', { __SRC__: 'Escalation plan' }) }, [1760, 1660]);
  const ec = w.add('Emit calls', 'n8n-nodes-base.code', 2, { jsCode: "const c = $('Escalation plan').first().json.calls || [];\nreturn c;" }, [1760, 1800]);
  const tw = w.add('Twilio voice call', 'n8n-nodes-base.httpRequest', 4.2, { method: 'POST', url: "={{ 'https://api.twilio.com/2010-04-01/Accounts/' + $json.sid + '/Calls.json' }}", authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth', sendBody: true, contentType: 'form-urlencoded', bodyParameters: { parameters: [{ name: 'To', value: '={{ $json.to }}' }, { name: 'From', value: '={{ $json.from }}' }, { name: 'Twiml', value: '={{ $json.twiml }}' }] }, options: { timeout: 15000 } }, [1980, 1800], { credentials: CRED.twilio, onError: 'continueRegularOutput' });
  const mk = pg(w, 'Mark escalations', 'update ops.notifications n set\n escalated_at = case when m.field = \'escalated_at\' then now() else n.escalated_at end,\n called_at = case when m.field = \'called_at\' then now() else n.called_at end,\n reminded_at = case when m.field = \'reminded_at\' then now() else n.reminded_at end\nfrom json_to_recordset($1::json) as m(id uuid, field text) where n.id = m.id;', [2200, 1700], { replacement: "={{ $('Escalation plan').first().json.marks_json }}", node: once });
  w.chain(te, me, se, ce2, pe2, re2, du, ep); w.link(ep, em); w.link(ep, ec); w.link(em, direct); w.chain(ec, tw, mk);
  return w.json();
}

function generate() { return { 'automation/W32.json': buildW32(), 'automation/W33.json': buildW33() }; }
module.exports = { generate };
if (require.main === module) {
  const root = path.join(here, '..');
  const out = generate();
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const [f, wf] of Object.entries(out)) {
    const text = JSON.stringify(wf, null, 2) + '\n';
    const p = path.join(root, f);
    if (check) { if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) { console.error('OUT OF DATE: ' + f); bad++; } else console.log('in sync: ' + f); }
    else { fs.writeFileSync(p, text); console.log('wrote ' + f + ' (' + wf.nodes.length + ' nodes)'); }
  }
  process.exit(bad ? 1 : 0);
}

// automation/patch-w07-lindi-turn.mjs - Lindi's turn: ONE model call writes the labels AND the reply (17 Oct 2026).
// Jono: "she responds like a chat bot ... not like she's connected to an LLM" -> option 1: the ElevenLabs agent
// (smc-lindi-chat, behind ANTHROPIC_BASE_URL) writes every lead-facing reply; n8n keeps the actions.
// W07.json is maintained as JSON, so this script is the reproducible record of the change. Idempotent.
// Logic: lib/w07.mjs turnRequest / parseTurn / applyModelReply; prompt: conversation/prompts/lindi-turn.md.
// Run: node automation/patch-w07-lindi-turn.mjs && node automation/patch-w07-never-silent.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./W07.json', import.meta.url);
const wf = JSON.parse(readFileSync(FILE, 'utf8'));
const node = (name) => { const n = wf.nodes.find((x) => x.name === name); if (!n) throw new Error(`W07 has no node "${name}"`); return n; };

const MEDIA = 'Media only? (never sent to a model)';
const TURNS = 'Load recent turns (Lindi memory)';
const BUILD = 'Build intent-slot request (Haiku)'; // name kept: other nodes read $('Build intent-slot request (Haiku)')
const PARSE = 'Parse NLU -> decide() -> plan';
const NEEDS = 'Needs reply LLM?';

// 1. memory: the last turns of this chat, one row (json_agg), before the request is built
wf.nodes = wf.nodes.filter((n) => n.name !== TURNS);
delete wf.connections[TURNS];
const pgCred = node('Store outbound').credentials;
const build = node(BUILD);
wf.nodes.push({
  id: 'lt-turns', name: TURNS, type: 'n8n-nodes-base.postgres', typeVersion: 2.5,
  position: [build.position[0] - 200, build.position[1] + 160], credentials: pgCred, onError: 'continueRegularOutput',
  notes: 'Lindi turn (17 Oct 2026): the recent chat so the reply picks up where it left off. Inbound text is the stored (redacted) copy; lib/w07.mjs turnLines() redacts again for the model.',
  parameters: {
    operation: 'executeQuery',
    query: `-- The last turns of this WhatsApp chat (7 days), oldest first, as ONE row. Outbound rows logged as '[text]' or
-- 'template:...' carry no words and are skipped by turnLines().
SELECT coalesce(json_agg(json_build_object('direction', t.direction, 'content', t.content) ORDER BY t.created_at), '[]'::json) AS turns
  FROM (SELECT direction, left(coalesce(content, ''), 300) AS content, created_at
          FROM public.communications
         WHERE channel = 'whatsapp' AND created_at > now() - interval '7 days'
           AND ((nullif($1, '') IS NOT NULL AND lead_id = nullif($1, '')::uuid) OR recipient_contact = $2)
         ORDER BY created_at DESC
         LIMIT 12) t;`,
    options: { queryReplacement: '={{ [ ($json.lead && $json.lead.id) || "", ($json.msg && $json.msg.from) || "" ] }}' },
  },
});
const mediaOuts = wf.connections[MEDIA].main;
mediaOuts[1] = mediaOuts[1].filter((t) => t.node !== BUILD && t.node !== TURNS).concat([{ node: TURNS, type: 'main', index: 0 }]);
wf.connections[TURNS] = { main: [[{ node: BUILD, type: 'main', index: 0 }]] };

// 2. the one request: lindi-turn.md system prompt + state block + FAQ + recent turns + the message
build.parameters.jsCode = `// Lindi turn (17 Oct 2026): ONE call returns the labels AND the reply (conversation/prompts/lindi-turn.md).
const REPO = $env.REPO_DIR || '/home/node/repo';
const L = require('lv-automation').w07;
const fs = require('fs');
const md = fs.readFileSync(REPO + '/conversation/prompts/lindi-turn.md', 'utf8');
const system = (md.split('\\u0060\\u0060\\u0060prompt')[1] || '').split('\\u0060\\u0060\\u0060')[0].trim();
const j = $('${MEDIA}').item.json;
const turns = $json && Array.isArray($json.turns) ? $json.turns : [];
const faq = L.parseFaqMd(fs.readFileSync(REPO + '/knowledge/faq.md', 'utf8'));
const t = L.turnRequest({ j, turns, faq, system, now_ms: Date.now(), model: $env.ANTHROPIC_MODEL_FAST || 'claude-haiku-4-5-20251001' });
return { json: { ...j, state: t.state, t0: Date.now(), intent_body: t.request, turn_prompt: L.TURN_PROMPT } };`;

// 3. parse the one answer, decide as before, then put Lindi's words in place of the conversational fixed lines
node(PARSE).parameters.jsCode = `const REPO = $env.REPO_DIR || '/home/node/repo';
const L = require('lv-automation').w07;
const D = require('lv-automation').logic;
const j = $('${BUILD}').item.json;
const raw = ($json.content && $json.content[0] && $json.content[0].text) || '';
const turn = L.parseTurn(raw); // { nlu, reply }: one call (lindi-turn.md)
const nlu = turn.nlu;
const fs = require('fs');
const faq = L.parseFaqMd(fs.readFileSync(REPO + '/knowledge/faq.md', 'utf8'));
const lang = ((j.lead && j.lead.language) || nlu.language) === 'af' ? 'af' : 'en';
const cs = (j.lead && j.lead.conv_state) || {};
const decision = D.decide(j.state, nlu, j.pre, { booking: j.booking, unanswered: cs.unanswered || 0 });
const plan = L.planActions(decision, { lead: j.lead, booking: L.bookingView(j.booking, lang), faq, pre: j.pre, nlu, now_ms: Date.now(), lang, state: j.state, wamid: j.msg.wamid, disclosed: !!cs.disclosed, adviser_first: j.adviser_first, unanswered: cs.unanswered || 0, text_store: j.text_store });
// deterministic gates; STOP / distress / a person / consent / qualifying stay fixed; never a second model call
const model_reply = L.applyModelReply(plan, turn.reply, { question: (j.msg && j.msg.text) || '', disclosed: !!cs.disclosed, lead_used_emoji: !!(j.pre && j.pre.lead_used_emoji), topics: nlu.topics });
return { json: { ...j, nlu, decision, plan, model_reply, latency_ms: Date.now() - j.t0 } };`;

// 4. one call per inbound: the old reply / classifier calls only run for plans that never went through applyModelReply
const cond = node(NEEDS).parameters.conditions.conditions[0];
cond.leftValue = '={{ String($json.plan.send && $json.plan.reply_actions.length > 0 && !$json.plan.no_second_call) }}';

writeFileSync(FILE, JSON.stringify(wf, null, 2) + '\n');
console.log('W07.json: Lindi turn (one call: labels + reply), recent-turns memory, no second model call');

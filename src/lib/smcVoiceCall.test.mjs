// CRM lead view of SortMyCover voice calls and missed-call callbacks (src/lib/smcVoiceCall.ts).
// Run: node --test src/lib/smcVoiceCall.test.mjs   (Node 22.18+/25 imports the .ts helper directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import { smcVoiceView, callbackStatus, SMC_VOICE_OUTCOME_LABELS } from './smcVoiceCall.ts';

const call = (metadata, extra = {}) => ({ channel: 'call', workflow: 'smc-voice', content: 'Lindi: Hi\nCaller: Hello', metadata, ...extra });

test('call rows: plain outcome label, summary, notes, full transcript', () => {
  const v = smcVoiceView(call({ kind: 'smc_voice_call', outcome: 'whatsapp_handoff', summary: ' Wants life cover. ', call_notes: 'Prefers mornings' }));
  assert.deepEqual(v, {
    kind: 'call', outcome: 'whatsapp_handoff', outcomeLabel: 'Moved to WhatsApp',
    summary: 'Wants life cover.', callNotes: 'Prefers mornings', transcript: 'Lindi: Hi\nCaller: Hello',
  });
});

test('every outcome smc-voice writes has a human label', () => {
  for (const o of ['booked', 'whatsapp_handoff', 'callback_requested', 'out_of_criteria', 'no_answer', 'missed', 'info_only']) {
    assert.ok(SMC_VOICE_OUTCOME_LABELS[o] && !SMC_VOICE_OUTCOME_LABELS[o].includes('_'), o);
    assert.equal(smcVoiceView(call({ kind: 'smc_voice_call', outcome: o })).outcomeLabel, SMC_VOICE_OUTCOME_LABELS[o]);
  }
});

test('unknown or missing outcome: no badge, still a voice row', () => {
  assert.equal(smcVoiceView(call({ kind: 'smc_voice_call' })).outcome, null);
  assert.equal(smcVoiceView(call({ kind: 'smc_voice_call', outcome: 'toString' })).outcomeLabel, null);
  assert.equal(smcVoiceView(call(null)).kind, 'call', 'workflow smc-voice + channel call is enough');
});

test('not a voice row: other workflows and the smc-voice WhatsApp handoff row', () => {
  assert.equal(smcVoiceView({ channel: 'call', workflow: null, content: 'x', metadata: {} }), null);
  assert.equal(smcVoiceView({ channel: 'whatsapp', workflow: 'smc-voice', content: 'Template', metadata: { conversation_id: 'conv_1' } }), null);
  assert.equal(smcVoiceView({ channel: 'email', content: 'x', metadata: 'oops' }), null);
});

test('callback status follows the smc-voice lifecycle', () => {
  assert.equal(callbackStatus({ state: 'scheduled' }), 'pending');
  assert.equal(callbackStatus({ state: 'dialing' }), 'pending');
  assert.equal(callbackStatus({ state: 'dialed' }), 'pending');
  assert.equal(callbackStatus({ state: 'done', outcome: 'answered' }), 'answered');
  assert.equal(callbackStatus({ state: 'done', outcome: 'no_answer' }), 'no_answer');
  assert.equal(callbackStatus({ state: 'cancelled' }), 'cancelled');
  assert.equal(callbackStatus({ state: 'dial_failed' }), 'dial_failed');
  const v = smcVoiceView(call({ kind: 'smc_voice_callback', state: 'scheduled', scheduled_for_sast: '2026-10-20T10:05:00+02:00', reason: 'hung_up_early' }));
  assert.deepEqual(v, { kind: 'callback', status: 'pending', statusLabel: 'Pending', dueSast: '2026-10-20T10:05:00+02:00', reason: 'hung_up_early' });
  assert.equal(smcVoiceView(call({ kind: 'smc_voice_callback', state: 'done', outcome: 'no_answer' })).statusLabel, 'No answer');
});

'use strict';
// The one LLM path for the non-Lindi jobs (19 Oct 2026): pre-call brief (W11), intro scripts + picture check (W23), voice-note
// summary (W29), FB/IG comment + DM drafts (W30/W31), optimisation pulse/memo/retro/events (W32), LLM judge (W33).
// There is no Anthropic API in this system. These jobs call $env.LLM_RELAY_URL with x-api-key = $env.LLM_RELAY_TOKEN, no
// fallback, model 'relay-default' (the relay picks the model). Message shape: { model, system, messages, max_tokens } in,
// { content: [{ type: 'text', text }] } out, the same shape smc-lindi-chat speaks. Lindi on WhatsApp (W07) is NOT on this
// relay: she is the ElevenLabs agent behind $env.LINDI_BRAIN_URL.
// Fails closed: an IF "LLM relay set? (<call>)" sits in front of every relay call. LLM_RELAY_URL unset -> no HTTP call; the
// item goes straight to the node after the call, exactly as a failed call would (no `content`), so each workflow's existing
// failure path (block / skip / human / deterministic fallback) runs.
// Used by automation/patch-llm-relay.mjs (hand-maintained W11/W23/W29/W30/W31) and optimisation/build-workflows.cjs (W32/W33).

const RELAY_MODEL = 'relay-default';
const RELAY_URL_EXPR = '={{ $env.LLM_RELAY_URL }}';
const RELAY_TOKEN_EXPR = '={{ $env.LLM_RELAY_TOKEN }}';
const GUARD_EXPR = "={{ String(!!String($env.LLM_RELAY_URL || '').trim()) }}";
const guardName = (call) => `LLM relay set? (${call})`;
const relayHeaders = () => [{ name: 'x-api-key', value: RELAY_TOKEN_EXPR }, { name: 'content-type', value: 'application/json' }];

/** Points an n8n httpRequest node at the relay: URL, token header, no credential, no version header. Mutates the node. */
function toRelay(node) {
  const p = node.parameters;
  p.url = RELAY_URL_EXPR;
  delete p.authentication; delete p.genericAuthType; delete node.credentials;
  p.sendHeaders = true;
  p.headerParameters = { parameters: relayHeaders() };
  return node;
}

/** The IF in front of a relay call (true -> the call, false -> what follows the call). */
function guardNode(call, position, id) {
  return {
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ id: 'c1', leftValue: GUARD_EXPR, rightValue: 'true', operator: { type: 'string', operation: 'equals' } }] }, options: {} },
    id, name: guardName(call), type: 'n8n-nodes-base.if', typeVersion: 2, position,
    notes: 'Fails closed: LLM_RELAY_URL unset -> no call; false = the same path as a failed call (lib/llm-relay.cjs).',
  };
}

/** Puts the guard in front of `call` in wf ({ nodes, connections }): every input of the call moves to the guard; guard 0 ->
    call; guard 1 -> the call's output-0 targets. Idempotent (drops an existing guard first). */
function guardCall(wf, call, id) {
  const name = guardName(call);
  wf.nodes = wf.nodes.filter((n) => n.name !== name);
  delete wf.connections[name];
  for (const src of Object.values(wf.connections)) for (const outs of src.main || []) if (Array.isArray(outs)) {
    for (const t of outs) if (t.node === name) t.node = call; // undo an earlier guard: inputs point at the call again
  }
  const n = wf.nodes.find((x) => x.name === call);
  if (!n) throw new Error(`no node "${call}"`);
  for (const [src, c] of Object.entries(wf.connections)) for (const outs of c.main || []) if (Array.isArray(outs)) {
    for (const t of outs) if (t.node === call && src !== name) t.node = name;
  }
  const after = ((wf.connections[call] || { main: [[]] }).main[0] || []).map((t) => ({ ...t }));
  wf.nodes.push(guardNode(call, [n.position[0] - 60, n.position[1] + 120], id));
  wf.connections[name] = { main: [[{ node: call, type: 'main', index: 0 }], after] };
  return name;
}

module.exports = { RELAY_MODEL, RELAY_URL_EXPR, RELAY_TOKEN_EXPR, GUARD_EXPR, guardName, relayHeaders, toRelay, guardNode, guardCall };

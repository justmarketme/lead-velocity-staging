// deno test --allow-env supabase/functions/sync-voice-agents/sync_voice_agents.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { SMC_EVALUATION, smcChatDesired, smcChatDiff, smcChatPatchBody } from "./index.ts";
import { SMC_CHAT_BASE_PROMPT, smcCallbackFirstMessage } from "../_shared/smc_receptionist_persona.ts";

Deno.test("disclosures judge (smoke test #47): told how to recognise a callback, and that the no-advice line is inbound-only", () => {
  const goal = SMC_EVALUATION.find((c) => c.id === "disclosures")!.conversation_goal_prompt;
  // The judge can't see call_type reliably, so it is given the callback opener's own words (kept in step with the persona).
  const opener = "We noticed we missed your call, so I'm just returning it";
  assert(smcCallbackFirstMessage("Thandi").includes(opener));
  assert(goal.includes(opener), goal);
  assert(/On a callback the no-advice line is not required/.test(goal));
  assert(/on an inbound call only/.test(goal));
  assert(/recorded and transcribed/.test(goal));
  assert(/spoke over the opening/.test(goal));
});

/** A live twin shaped like agent_8201 on 21 Oct 2026 (smoke test #23): phone-era settings and a 20-page KB with /advisers/. */
const DRIFTED = {
  name: "Lindi SortMyCover on WhatsApp",
  conversation_config: {
    agent: {
      first_message: "Hi, I'm Lindi, SortMyCover's virtual assistant.",
      prompt: { prompt: "old base prompt", llm: "glm-52", knowledge_base: [{ name: "SMC /" }, { name: "SMC /faq/" }, { name: "SMC /advisers/" }] },
    },
    conversation: { text_only: true },
  },
  platform_settings: {
    data_collection: { age_band: {}, budget_band: {}, consent_given: {} },
    evaluation: { criteria: [{ id: "disclosures" }, { id: "question_preface" }] },
    overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true }, conversation: { text_only: true } } },
  },
};

Deno.test("?agent=smc-chat dry run (smoke test #23): reports each drifted field of the WhatsApp twin", () => {
  const diff = smcChatDiff(DRIFTED);
  assertEquals(diff.map((d) => d.field).sort(), ["data_collection", "evaluation", "first_message", "knowledge_base", "prompt"]);
  const kb = diff.find((d) => d.field === "knowledge_base")!;
  assertEquals((kb.live as { extra: string[] }).extra, ["SMC /advisers/"]);
  assert((kb.desired as { missing: string[] }).missing.includes("SMC /learn/glossary/"));
  assertEquals(diff.find((d) => d.field === "evaluation")!.live, ["disclosures", "question_preface"]);
});

Deno.test("?agent=smc-chat dry run: a twin that matches the code is in sync", () => {
  const d = smcChatDesired();
  const live = {
    name: d.name,
    conversation_config: {
      agent: { first_message: "", prompt: { prompt: d.prompt, llm: d.llm, knowledge_base: d.knowledge_base.map((name) => ({ name, id: "x" })) } },
      conversation: { text_only: true },
    },
    platform_settings: {
      data_collection: {}, evaluation: { criteria: [] },
      overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true, language: false }, conversation: { text_only: true } } },
    },
  };
  assertEquals(smcChatDiff(live), []);
  // a missing override is drift: smc-lindi-chat replaces the prompt on every turn and must be allowed to
  live.platform_settings.overrides.conversation_config_override.agent.prompt.prompt = false;
  assertEquals(smcChatDiff(live).map((x) => x.field), ["overrides"]);
});

Deno.test("twin base prompt: fallback only, inside the client-copy rules, never names the adviser", () => {
  assert(!/\bfree\b|\blicensed\b|virtual assistant|\bAI\b/i.test(SMC_CHAT_BASE_PROMPT));
  assert(SMC_CHAT_BASE_PROMPT.includes("SortMyCover's automated assistant"));
  assert(!smcChatDesired().knowledge_base.includes("SMC /advisers/"));
});

Deno.test("?agent=smc-chat&apply=1 (smoke test #23): the PATCH sets exactly the checked fields, chat-only, and lands in sync", () => {
  const d = smcChatDesired();
  const kb = d.knowledge_base.map((name, i) => ({ type: "url", id: `doc${i}`, name, usage_mode: "auto" }));
  const body = smcChatPatchBody(kb);
  // chat twin: no phone opener, text only, no tools, voice, audio, turn-taking or webhook settings, no phone-call scoring
  assertEquals(body.conversation_config.agent.first_message, "");
  assertEquals(body.conversation_config.conversation.text_only, true);
  assertEquals(Object.keys(body.conversation_config).sort(), ["agent", "conversation"]);
  assertEquals(Object.keys(body.conversation_config.agent.prompt).sort(), ["knowledge_base", "llm", "prompt", "rag"]);
  assertEquals(Object.keys(body.platform_settings).sort(), ["data_collection", "evaluation", "overrides"]);
  assertEquals(body.platform_settings.data_collection, {});
  assertEquals(body.platform_settings.evaluation.criteria, []);
  assert(!JSON.stringify(body).includes("/advisers/"));
  // what ElevenLabs holds once the PATCH replaced those fields on the drifted twin -> the dry run is empty
  const after = {
    ...DRIFTED,
    name: body.name,
    conversation_config: {
      agent: { first_message: "", prompt: { ...body.conversation_config.agent.prompt } },
      conversation: { text_only: true },
    },
    platform_settings: { ...DRIFTED.platform_settings, data_collection: {}, evaluation: { criteria: [] } },
  };
  assertEquals(smcChatDiff(after), []);
});

// Config-as-code for Lead Velocity's two ElevenLabs agents. Admin-only:
// requires the project's service-role JWT (verify_jwt on + role check).
//
//   GET  → current config of both agents + workspace tools (read-only)
//   POST → upsert Ayanda's webhook tools, then PATCH Ayanda (prompt, first
//          message, LLM, tools) and Einstein (allow the site's per-session
//          prompt/first-message overrides). Idempotent; run after any persona edit.
//
//   curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
//     https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/sync-voice-agents
import { AYANDA_FIRST_MESSAGE, AYANDA_PROMPT } from "../_shared/ayanda_persona.ts";

const EL = "https://api.elevenlabs.io/v1/convai";
const EINSTEIN_AGENT_ID = "agent_2501m4s6nhfveywrvw9961va7sp3";
// Duplicate Einstein created by a second run of the old setup script — archived, never deleted.
const RETIRED_AGENT_IDS = ["agent_5801m4s6avaeemfr3j5k4fndext3"];
// ElevenLabs-hosted model (no Gemini/OpenAI dependency), per Jono 13 Oct 2026.
const AYANDA_LLM = "glm-52";
const TOOLS_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/ayanda-tools-bridge";

const key = () => Deno.env.get("ELEVENLABS_API_KEY")!;
const ayandaId = () => Deno.env.get("ELEVENLABS_AGENT_ID")!;

// GET/PATCH are idempotent, so retry them on ElevenLabs 5xx. POST is not:
// a 5xx can still have created the resource, and the next sync run finds it.
async function el(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${EL}${path}`, {
      ...init,
      headers: { "xi-api-key": key(), "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    if (res.status >= 500 && method !== "POST" && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
}

// Every tool gets the live conversation id (the bridge authenticates with it)
// and, on phone calls, the caller's number.
const conversationId = { type: "string", dynamic_variable: "system__conversation_id" };
// caller_number is passed by handle-inbound-call (placeholder "" otherwise).
const callerId = { type: "string", dynamic_variable: "caller_number" };

const TOOL_DEFS = [
  {
    name: "check_availability",
    description: "Get open 15-minute discovery-call slots in South African time. Call before offering any time.",
    properties: {
      preferred_date: { type: "string", description: "Optional day the caller asked for, as YYYY-MM-DD. Omit if none." },
      time_of_day: { type: "string", description: "Optional: 'morning' or 'afternoon' if the caller said so. Omit otherwise." },
      conversation_id: conversationId,
    },
    required: ["conversation_id"],
  },
  {
    name: "book_appointment",
    description: "Book the 15-minute Lead Velocity discovery call once the caller picked a slot and gave name, email and phone.",
    properties: {
      start: { type: "string", description: "The exact 'start' value of the chosen slot from check_availability." },
      name: { type: "string", description: "Caller's full name." },
      email: { type: "string", description: "Email in written form, lowercase, no spaces, e.g. jono@leadvelocity.co.za — never the words 'at' or 'dot'." },
      phone: { type: "string", description: "Number the team should call, digits only, e.g. 0825551234. Omit to use the number they're calling from." },
      company: { type: "string", description: "Company name, if given." },
      website: { type: "string", description: "Website in written form, e.g. www.example.co.za — never 'dot'. Omit if none." },
      notes: { type: "string", description: "One line on what they want (area, products, current lead source)." },
      conversation_id: conversationId,
      caller_id: callerId,
    },
    required: ["start", "name", "email", "conversation_id"],
  },
  {
    name: "send_whatsapp_link",
    description: "Text the caller a tap-to-chat link that opens WhatsApp with Lead Velocity (073 765 1664). Use when they prefer WhatsApp over booking now.",
    properties: {
      phone: { type: "string", description: "Mobile number to text, digits only. Omit to use the number they're calling from." },
      name: { type: "string", description: "Caller's first name, if known." },
      topic: { type: "string", description: "What they want info on, e.g. 'pricing', 'how it works'." },
      conversation_id: conversationId,
      caller_id: callerId,
    },
    required: ["conversation_id"],
  },
];

function toolConfig(t: (typeof TOOL_DEFS)[number]) {
  return {
    tool_config: {
      type: "webhook",
      name: t.name,
      description: t.description,
      response_timeout_secs: 20,
      api_schema: {
        url: `${TOOLS_URL}/${t.name}`,
        method: "POST",
        request_body_schema: { type: "object", description: t.description, properties: t.properties, required: t.required },
      },
    },
  };
}

async function upsertTools(): Promise<Record<string, string>> {
  const { tools = [] } = await el("/tools");
  const ids: Record<string, string> = {};
  for (const def of TOOL_DEFS) {
    const existing = tools.find((x: any) => x.tool_config?.name === def.name && x.tool_config?.api_schema?.url?.startsWith(TOOLS_URL));
    const saved = existing
      ? await el(`/tools/${existing.id}`, { method: "PATCH", body: JSON.stringify(toolConfig(def)) })
      : await el("/tools", { method: "POST", body: JSON.stringify(toolConfig(def)) });
    ids[def.name] = saved.id ?? existing.id;
  }
  return ids;
}

function summary(a: any) {
  const c = a.conversation_config ?? {};
  return {
    agent_id: a.agent_id, name: a.name,
    first_message: c.agent?.first_message,
    llm: c.agent?.prompt?.llm,
    tool_ids: c.agent?.prompt?.tool_ids,
    built_in_tools: Object.keys(c.agent?.prompt?.built_in_tools ?? {}).filter((k) => c.agent.prompt.built_in_tools[k]),
    voice_id: c.tts?.voice_id, tts_model: c.tts?.model_id,
    audio: [c.asr?.user_input_audio_format, c.tts?.agent_output_audio_format], text_normalisation: c.tts?.text_normalisation_type,
    expressive_mode: c.tts?.expressive_mode, audio_tags: (c.tts?.suggested_audio_tags ?? []).map((t: any) => t.tag),
    dynamic_variables: c.agent?.dynamic_variables?.dynamic_variable_placeholders,
    overrides: a.platform_settings?.overrides,
    prompt_head: String(c.agent?.prompt?.prompt ?? "").slice(0, 200),
  };
}

function isServiceRole(req: Request): boolean {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!isServiceRole(req)) return new Response("forbidden", { status: 403 });
  try {
    // GET ?signed=ayanda|einstein → a one-off session URL for testing an agent end to end.
    const signed = new URL(req.url).searchParams.get("signed");
    if (req.method === "GET" && signed) {
      const agentId = signed === "einstein" ? EINSTEIN_AGENT_ID : ayandaId();
      return Response.json(await el(`/conversation/get_signed_url?agent_id=${agentId}`));
    }
    if (req.method === "GET") {
      const [ayanda, einstein, tools, agents, llms] = await Promise.all([
        el(`/agents/${ayandaId()}`), el(`/agents/${EINSTEIN_AGENT_ID}`), el("/tools"), el("/agents?page_size=100"), el("/llm/list"),
      ]);
      const full = new URL(req.url).searchParams.get("full") === "1";
      return Response.json({
        llms: (llms.llms ?? []).map((l: any) => ({ llm: l.llm, deprecation: l.deprecation_info ?? undefined })),
        ayanda: full ? ayanda : summary(ayanda),
        einstein: full ? einstein : summary(einstein),
        tools: (tools.tools ?? []).map((t: any) => ({ id: t.id, name: t.tool_config?.name, url: t.tool_config?.api_schema?.url })),
        agents: (agents.agents ?? []).map((a: any) => ({ id: a.agent_id, name: a.name, created: a.created_at_unix_secs })),
      });
    }

    const toolIds = await upsertTools();
    const ayanda = await el(`/agents/${ayandaId()}`, {
      method: "PATCH",
      body: JSON.stringify({
        conversation_config: {
          agent: {
            first_message: AYANDA_FIRST_MESSAGE,
            language: "en",
            dynamic_variables: { dynamic_variable_placeholders: { caller_number: "" } },
            prompt: {
              prompt: AYANDA_PROMPT,
              llm: AYANDA_LLM,
              tool_ids: Object.values(toolIds),
              built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
            },
          },
          // Twilio register-call requires mu-law 8 kHz both ways. "elevenlabs" text
          // normalisation lets the LLM write jono@leadvelocity.co.za while the voice
          // says "at" / "dot" — so the written form is what reaches the tools.
          tts: {
            agent_output_audio_format: "ulaw_8000",
            text_normalisation_type: "elevenlabs",
            model_id: "eleven_v4_turbo",
            expressive_mode: true,
            suggested_audio_tags: [
              { tag: "Warmly", description: "Greetings, thanking the caller, and confirming a booking or WhatsApp handoff." },
              { tag: "Confidently", description: "Explaining what Lead Velocity does and offering appointment times." },
              { tag: "Patiently", description: "Collecting and reading back email addresses, phone numbers and spellings." },
              { tag: "Empathetically", description: "When a caller is frustrated, confused, or says lead generation has burned them before." },
            ],
          },
          asr: {
            user_input_audio_format: "ulaw_8000",
            keywords: ["Lead Velocity", "leadvelocity", "Ayanda", "WhatsApp", "broker", "co.za", "gmail.com", "outlook.com"],
          },
        },
        // Outbound calls (create-ayanda-call, initiate-ai-call) send per-call prompt + first message.
        platform_settings: { overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true } } } },
      }),
    });
    for (const id of RETIRED_AGENT_IDS) {
      await el(`/agents/${id}`, { method: "PATCH", body: JSON.stringify({ platform_settings: { archived: true } }) }).catch((e) => console.warn(e));
    }
    const einstein = await el(`/agents/${EINSTEIN_AGENT_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        conversation_config: {
          tts: {
            model_id: "eleven_v4_turbo",
            expressive_mode: true,
            suggested_audio_tags: [
              { tag: "Excitedly", description: "Greetings, big ideas, and when a broker is about to get more appointments." },
              { tag: "Chuckles", description: "After his own jokes and playful German-accent quips." },
              { tag: "Enthusiastically", description: "Explaining the Lead Velocity system and next steps." },
              { tag: "Confidently", description: "Giving strategy, scripts and performance advice." },
            ],
          },
        },
        // The site sends Einstein's per-page (public / broker / admin) prompt and first message.
        platform_settings: { overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true } } } },
      }),
    });
    return Response.json({ tools: toolIds, ayanda: summary(ayanda), einstein: summary(einstein) });
  } catch (e) {
    console.error("sync-voice-agents:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});

// Einstein (leadvelocity.co.za website voice agent) — config-as-code + knowledge-base refresh.
// Owns ONLY Einstein's agent; Ayanda/SMC stay in sync-voice-agents.
//
// Routes (last path segment):
//   POST /sync        push persona, LLM, voice, tools, data collection → the live ElevenLabs agent
//   POST /kb-refresh  crawl the public site, replace only changed KB docs, re-attach to the agent
//                     body (optional): { "force": ["/pricing"], "dry_run": true }
//   GET  /status      Einstein's live config + KB docs
//   GET  /voices      ?search=&accent=&age=&gender=   (voice-library search, admin helper)
//   POST /voice-add   { public_owner_id, voice_id, name }  add a library voice to the workspace
//   POST /tts         { voice_id?, text?, stability? }  → audio/mpeg sample
//   POST /simulate    ElevenLabs simulate-conversation body → result (tools mocked by ElevenLabs)
//
// Auth (verify_jwt on): the project's service-role JWT, or (kb-refresh only) any project JWT plus
// x-cron-secret = EINSTEIN_KB_CRON_SECRET
// so pg_cron and a post-deploy hook can trigger a refresh without the service-role key.
//
//   curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_JWT" \
//     https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/einstein-agent/sync
import { EINSTEIN_AGENT_ID, EINSTEIN_FIRST_MESSAGE, EINSTEIN_PROMPT } from "../_shared/einstein_persona.ts";
import {
  SITE, type KbRef, type Page, dedupePages, docName, looksEmpty, markdownLinks, pageText, planKb, sha, sitemapPaths,
} from "../_shared/site_kb.ts";

const EL = "https://api.elevenlabs.io/v1";
const TOOLS_URL = "https://cmsylaupctrbsvzrgzwy.supabase.co/functions/v1/ayanda-tools-bridge";

// ElevenLabs-hosted LLM only (Jono's rule: never Gemini/OpenAI for voice agents).
const EINSTEIN_LLM = "glm-52";
// Voice: "Einstein - Younger D (50s)", made with ElevenLabs Voice Design (prompt: German man, 55, deep warm voice,
// kind thoughtful engineer-turned-professor, strong German accent, steady pace, clear and vigorous, mature but not
// elderly), 14 Oct 2026. Replaced Professor A (CPXhqKTBUlO7LO3RX202, an "elderly professor" voice that Jono found too
// old), which had replaced Helmut (bRIX82ywyYryS8320ZVY, heard as Afrikaans). Runners-up and samples in
// docs/EINSTEIN-AGENT.md. This constant is the ONLY place Einstein's voice is set (sync-voice-agents never touches him).
export const EINSTEIN_VOICE_ID = Deno.env.get("EINSTEIN_VOICE_ID") || "hqcrZxSL16M3vTD4fiT0";
// High stability keeps the accent from drifting; v4 Turbo + Expressive Mode per Jono.
const TTS = { model_id: "eleven_v4_turbo", expressive_mode: true, stability: 0.8, similarity_boost: 0.85, speed: 0.98 };

const MAX_PAGES = 40;
const env = (k: string) => Deno.env.get(k) ?? "";

async function el(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${EL}${path}`, {
      ...init,
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json", ...(init.headers ?? {}) },
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

// ------------------------------------------------------------------ sync

const DATA_COLLECTION: Record<string, { type: string; description: string }> = {
  outcome: { type: "string", description: "Exactly one of: booked (book_appointment returned ok), whatsapp_handoff (send_whatsapp_link returned ok), info_only (questions answered, declined both), dropped (left before a next step)." },
  name: { type: "string", description: "Visitor's name, if given." },
  business: { type: "string", description: "Their company / practice name, if given." },
  need: { type: "string", description: "One line: what they need (area, products, current lead source)." },
  mobile: { type: "string", description: "Mobile number they confirmed, digits only, or empty." },
  email: { type: "string", description: "Email they confirmed, written form (name@domain.com), or empty." },
  callback_requested: { type: "boolean", description: "True if they asked to be called back." },
};

const EVALUATION = [
  { id: "cta", name: "Drove the call to action", type: "prompt",
    conversation_goal_prompt: "Success if the agent offered to book a 15-minute call, and — if the visitor declined or booking failed — offered the WhatsApp link / call-back. Failure if the conversation ended without either being offered while the visitor was engaged." },
  { id: "short_turns", name: "Short turns", type: "prompt",
    conversation_goal_prompt: "Success if every agent turn was at most about 65 words (most one or two short sentences) with at most one question. Failure if any turn exceeded about 65 words or was a monologue or list." },
  { id: "confirmed_contact", name: "Confirmed email / mobile", type: "prompt",
    conversation_goal_prompt: "Success if, before booking, the agent read back the email address and waited for confirmation, and before booking or WhatsApp read back the mobile number. Success if neither tool was used." },
];

// Einstein's own copies of the shared bridge tools (same endpoints as Ayanda's). Separate tool records
// because a website visitor has no caller_number — a tool that references an unset dynamic variable
// kills the session — and so sync-voice-agents (which matches tools by name) never touches these.
const conversationId = { type: "string", dynamic_variable: "system__conversation_id" };
const TOOL_DEFS = [
  {
    name: "einstein_check_availability", route: "check_availability",
    description: "Get open 15-minute Lead Velocity call slots in South African time. Call before offering any time.",
    properties: {
      preferred_date: { type: "string", description: "Optional day the visitor asked for, as YYYY-MM-DD (use the current date in your instructions to work it out). Omit if none." },
      time_of_day: { type: "string", description: "Optional: 'morning' or 'afternoon' if the visitor said so. Omit otherwise." },
      conversation_id: conversationId,
    },
    required: ["conversation_id"],
  },
  {
    name: "einstein_book_appointment", route: "book_appointment",
    description: "Book the 15-minute Lead Velocity call once the visitor picked a slot and CONFIRMED their email and mobile.",
    properties: {
      start: { type: "string", description: "The exact 'start' value of the chosen slot from einstein_check_availability." },
      name: { type: "string", description: "Visitor's full name." },
      email: { type: "string", description: "Confirmed email as a literal address with real @ and . characters, lowercase, no spaces, e.g. john@gmail.com. Never the words 'at' or 'dot'." },
      phone: { type: "string", description: "Confirmed mobile number, digits only, e.g. 0825551234." },
      company: { type: "string", description: "Their company / practice name." },
      website: { type: "string", description: "Website in written form, e.g. www.example.co.za, never 'dot'. Omit if none." },
      notes: { type: "string", description: "One line on what they need (area, products, current lead source)." },
      conversation_id: conversationId,
    },
    required: ["start", "name", "email", "phone", "conversation_id"],
  },
  {
    name: "einstein_send_whatsapp_link", route: "send_whatsapp_link",
    description: "Text the visitor a tap-to-chat link that opens WhatsApp with Lead Velocity (073 765 1664). Use when they prefer WhatsApp or a call-back over booking now.",
    properties: {
      phone: { type: "string", description: "Confirmed mobile number to text, digits only, e.g. 0825551234." },
      name: { type: "string", description: "Visitor's first name, if known." },
      topic: { type: "string", description: "What they want to chat about, e.g. 'pricing'. Add 'call-back requested' if they want a call." },
      conversation_id: conversationId,
    },
    required: ["phone", "conversation_id"],
  },
];

async function upsertTools(): Promise<string[]> {
  const { tools = [] } = await el("/convai/tools");
  const ids: string[] = [];
  for (const t of TOOL_DEFS) {
    const tool_config = {
      type: "webhook", name: t.name, description: t.description, response_timeout_secs: 20,
      api_schema: {
        url: `${TOOLS_URL}/${t.route}`, method: "POST",
        request_body_schema: { type: "object", description: t.description, properties: t.properties, required: t.required },
      },
    };
    const existing = tools.find((x: { tool_config?: { name?: string } }) => x.tool_config?.name === t.name);
    const saved = existing
      ? await el(`/convai/tools/${existing.id}`, { method: "PATCH", body: JSON.stringify({ tool_config }) })
      : await el("/convai/tools", { method: "POST", body: JSON.stringify({ tool_config }) });
    ids.push(saved.id ?? existing.id);
  }
  return ids;
}

async function sync() {
  const tool_ids = await upsertTools();
  const agent = await el(`/convai/agents/${EINSTEIN_AGENT_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: "Einstein-77 (Lead Velocity)",
      conversation_config: {
        agent: {
          first_message: EINSTEIN_FIRST_MESSAGE,
          language: "en",
          prompt: {
            prompt: EINSTEIN_PROMPT,
            llm: EINSTEIN_LLM,
            temperature: 0.3,
            max_tokens: -1,
            tool_ids,
            rag: { enabled: true, max_retrieved_rag_chunks_count: 8, max_documents_length: 20000 },
            built_in_tools: { end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
          },
        },
        // "elevenlabs" normalisation: the LLM writes john@gmail.com, the voice says "at" / "dot".
        tts: {
          voice_id: EINSTEIN_VOICE_ID,
          ...TTS,
          text_normalisation_type: "elevenlabs",
          suggested_audio_tags: [
            { tag: "Warmly", description: "Greetings, thanking the visitor, confirming a booking or the WhatsApp handoff." },
            { tag: "Chuckles", description: "Very occasionally, after a small joke." },
            { tag: "Confidently", description: "Explaining what Lead Velocity does and offering appointment times." },
            { tag: "Patiently", description: "Reading back email addresses and phone numbers." },
          ],
        },
        asr: { keywords: ["Lead Velocity", "leadvelocity", "Einstein", "WhatsApp", "broker", "co.za", "gmail.com", "outlook.com"] },
        turn: { turn_eagerness: "normal" },
        conversation: { max_duration_seconds: 600 },
      },
      platform_settings: {
        data_collection: DATA_COLLECTION,
        evaluation: { criteria: EVALUATION },
        // The stored prompt is the only prompt: no per-session prompt / first-message overrides.
        // text_only is the one allowed override — the typed chat in the website bubble runs this same
        // agent (persona, KB, tools) with audio off.
        overrides: {
          conversation_config_override: {
            agent: { prompt: { prompt: false }, first_message: false },
            conversation: { text_only: true },
          },
        },
      },
    }),
  });
  return summary(agent);
}

interface AgentJson {
  agent_id?: string;
  name?: string;
  conversation_config?: {
    agent?: {
      first_message?: string;
      prompt?: {
        llm?: string;
        temperature?: number;
        tool_ids?: string[];
        rag?: { enabled?: boolean };
        knowledge_base?: { name?: string }[];
        prompt?: string;
      };
    };
    tts?: {
      voice_id?: string;
      model_id?: string;
      expressive_mode?: boolean;
      stability?: number;
      similarity_boost?: number;
      speed?: number;
      text_normalisation_type?: string;
    };
  };
  platform_settings?: {
    overrides?: { conversation_config_override?: unknown };
    data_collection?: Record<string, unknown>;
  };
}

interface VoiceJson {
  name?: string;
  voice_id?: string;
  public_owner_id?: string;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  locale?: string;
  use_case?: string;
  descriptive?: string;
  category?: string;
  cloned_by_count?: number;
  usage_character_count_1y?: number;
  description?: string;
  preview_url?: string;
  verified_languages?: { language?: string; accent?: string }[];
}

function summary(a: AgentJson) {
  const c = a.conversation_config ?? {};
  return {
    agent_id: a.agent_id, name: a.name, first_message: c.agent?.first_message,
    llm: c.agent?.prompt?.llm, temperature: c.agent?.prompt?.temperature, tool_ids: c.agent?.prompt?.tool_ids,
    rag: c.agent?.prompt?.rag?.enabled,
    knowledge_base: (c.agent?.prompt?.knowledge_base ?? []).map((d: { name?: string }) => d.name),
    tts: { voice_id: c.tts?.voice_id, model_id: c.tts?.model_id, expressive_mode: c.tts?.expressive_mode, stability: c.tts?.stability, similarity_boost: c.tts?.similarity_boost, speed: c.tts?.speed, text_normalisation: c.tts?.text_normalisation_type },
    overrides: a.platform_settings?.overrides?.conversation_config_override,
    data_collection: Object.keys(a.platform_settings?.data_collection ?? {}),
    prompt_head: String(c.agent?.prompt?.prompt ?? "").slice(0, 120),
  };
}

// ------------------------------------------------------------------ knowledge base

async function read(path: string): Promise<string> {
  const headers: Record<string, string> = { "X-Return-Format": "markdown", "X-Timeout": "30" };
  if (env("JINA_API_KEY")) headers.Authorization = `Bearer ${env("JINA_API_KEY")}`;
  // The site is a client-rendered SPA: a plain fetch returns an empty shell, so render it via r.jina.ai.
  // Keyless r.jina.ai allows ~20 requests/min; a run is ~10 pages, 2 at a time. Back off on 429/5xx.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://r.jina.ai/${SITE}${path}`, { headers, signal: AbortSignal.timeout(45_000) }).catch(() => null);
    if (res?.ok) return await res.text();
    if (attempt >= 4) throw new Error(`reader ${path} → ${res?.status ?? "network error"}`);
    const retryAfter = Number(res?.headers.get("retry-after")) || 0;
    await new Promise((r) => setTimeout(r, Math.max(retryAfter * 1000, 5000 * 2 ** (attempt - 1))));
  }
}

async function crawl(): Promise<{ pages: Page[]; failed: string[] }> {
  const seeds = new Set<string>(["/"]);
  try {
    const xml = await (await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(15_000) })).text();
    sitemapPaths(xml).forEach((p) => seeds.add(p));
  } catch (e) {
    console.warn("sitemap fetch failed:", e);
  }
  const queue = [...seeds];
  const seen = new Set(queue);
  const pages: Page[] = [];
  const failed: string[] = [];
  const inlinks = new Map<string, number>();
  while (queue.length && seen.size <= MAX_PAGES) {
    const batch = queue.splice(0, 2);
    await Promise.all(batch.map(async (path) => {
      try {
        const raw = await read(path);
        for (const link of markdownLinks(raw)) {
          if (link !== path) inlinks.set(link, (inlinks.get(link) ?? 0) + 1);
          if (!seen.has(link) && seen.size < MAX_PAGES) {
            seen.add(link);
            queue.push(link);
          }
        }
        const { title, text } = pageText(raw);
        if (looksEmpty(text)) return;
        pages.push({ path, title, text, hash: await sha(text) });
      } catch (e) {
        console.warn(`crawl ${path}:`, String(e));
        failed.push(path);
      }
    }));
  }
  return { pages: dedupePages(pages, inlinks), failed };
}

async function kbRefresh(opts: { force?: string[]; dry_run?: boolean }) {
  const agent = await el(`/convai/agents/${EINSTEIN_AGENT_ID}`);
  const current: KbRef[] = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
  const { pages, failed } = await crawl();
  if (!pages.length) throw new Error(`crawl returned no pages (failed: ${failed.join(", ")}) — KB left untouched`);
  const force = new Set(opts.force ?? []);
  const plan = planKb(current.map((d) => (force.has(parseForced(d.name)) ? { ...d, name: `${d.name}-forced` } : d)), pages, failed);
  const report = {
    crawled: pages.map((p) => ({ path: p.path, hash: p.hash, chars: p.text.length })),
    failed,
    unchanged: plan.keep.map((d) => d.name),
    updated: plan.upsert.map((p) => p.path),
    removed: plan.removed.map((d) => d.name),
    dry_run: !!opts.dry_run,
  };
  if (opts.dry_run || (!plan.upsert.length && !plan.removed.length)) return { ...report, changed: false };

  const created: KbRef[] = [];
  for (const p of plan.upsert) {
    const text = `# ${p.title || p.path}\nSource: ${SITE}${p.path}\n\n${p.text}`;
    const doc = await el("/convai/knowledge-base/text", { method: "POST", body: JSON.stringify({ text, name: docName(p.path, p.hash) }) });
    created.push({ type: "text", id: doc.id, name: docName(p.path, p.hash), usage_mode: "auto" });
    await el(`/convai/knowledge-base/${doc.id}/rag-index`, { method: "POST", body: JSON.stringify({ model: "e5_mistral_7b_instruct" }) })
      .catch((e) => console.warn("rag-index:", String(e)));
  }
  const knowledge_base = [...plan.foreign, ...plan.keep, ...created].map((d) => ({
    type: d.type, id: d.id, name: d.name.replace(/-forced$/, ""), usage_mode: d.usage_mode ?? "auto",
  }));
  await el(`/convai/agents/${EINSTEIN_AGENT_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ conversation_config: { agent: { prompt: { knowledge_base } } } }),
  });
  // Old versions are detached now; delete them so the workspace KB doesn't fill with stale pages.
  const deleted: string[] = [];
  for (const d of [...plan.replaced, ...plan.removed]) {
    await el(`/convai/knowledge-base/${d.id}`, { method: "DELETE" })
      .then(() => deleted.push(d.name.replace(/-forced$/, "")))
      .catch((e) => console.warn(`delete ${d.id}:`, String(e)));
  }
  return { ...report, changed: true, created: created.map((d) => ({ id: d.id, name: d.name })), deleted };
}

// force=["/pricing"] re-uploads that page even if its hash matches (renaming it so the hash can't match).
function parseForced(name: string): string {
  return name.match(/^leadvelocity\.co\.za(\/[^\s#]*)\s#/)?.[1] ?? "";
}

// ------------------------------------------------------------------ admin helpers

async function tts(p: { voice_id?: string; text?: string; stability?: number; model_id?: string; language_code?: string }) {
  const res = await fetch(`${EL}/text-to-speech/${p.voice_id || EINSTEIN_VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({
      text: p.text || EINSTEIN_FIRST_MESSAGE,
      model_id: p.model_id || TTS.model_id,
      ...(p.language_code ? { language_code: p.language_code } : {}),
      voice_settings: { stability: p.stability ?? TTS.stability, similarity_boost: TTS.similarity_boost, speed: TTS.speed },
    }),
  });
  if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg" } });
}

// verify_jwt is ON: the gateway has already checked the JWT signature, so the role claim is trustworthy.
// pg_cron sends the (public) anon JWT to pass the gateway plus x-cron-secret.
function isServiceRole(req: Request): boolean {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

function cronAuthorized(req: Request): boolean {
  const secret = env("EINSTEIN_KB_CRON_SECRET");
  return !!secret && req.headers.get("x-cron-secret") === secret;
}

Deno.serve(async (req) => {
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  const admin = isServiceRole(req);
  if (!admin && !(route === "kb-refresh" && req.method === "POST" && cronAuthorized(req))) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const q = new URL(req.url).searchParams;
    if (route === "sync" && req.method === "POST") return Response.json(await sync());
    if (route === "kb-refresh" && req.method === "POST") {
      const result = await kbRefresh(body);
      console.log("einstein kb-refresh:", JSON.stringify({ updated: result.updated, removed: result.removed, failed: result.failed }));
      return Response.json(result);
    }
    if (route === "status") {
      const a = await el(`/convai/agents/${EINSTEIN_AGENT_ID}`);
      return Response.json(q.get("full") === "1" ? a : summary(a));
    }
    if (route === "voices") {
      const params = new URLSearchParams({ page_size: q.get("page_size") ?? "50" });
      for (const k of ["search", "accent", "age", "gender", "language", "locale", "use_cases", "category", "sort", "descriptives"]) {
        if (q.get(k)) params.set(k, q.get(k)!);
      }
      const { voices = [] } = await el(`/shared-voices?${params}`);
      return Response.json(voices.map((v: VoiceJson) => ({
        name: v.name, voice_id: v.voice_id, public_owner_id: v.public_owner_id, gender: v.gender, age: v.age,
        accent: v.accent, language: v.language, locale: v.locale, use_case: v.use_case, descriptive: v.descriptive,
        category: v.category, cloned_by: v.cloned_by_count, usage_1y: v.usage_character_count_1y,
        description: String(v.description ?? "").slice(0, 200), preview_url: v.preview_url,
        verified_languages: (v.verified_languages ?? []).map((l: { language?: string; accent?: string }) => `${l.language}/${l.accent}`),
      })));
    }
    if (route === "voice-add" && req.method === "POST") {
      return Response.json(await el(`/voices/add/${body.public_owner_id}/${body.voice_id}`, { method: "POST", body: JSON.stringify({ new_name: body.name }) }));
    }
    if (route === "tts" && req.method === "POST") return await tts(body);
    if (route === "voice-design" && req.method === "POST") {
      return Response.json(await el("/text-to-voice/design", {
        method: "POST",
        body: JSON.stringify({
          voice_description: body.voice_description, text: body.text, auto_generate_text: !body.text,
          model_id: body.model_id ?? "eleven_ttv_v3", seed: body.seed, guidance_scale: body.guidance_scale,
        }),
      }));
    }
    if (route === "voice-create" && req.method === "POST") {
      return Response.json(await el("/text-to-voice", {
        method: "POST",
        body: JSON.stringify({ voice_name: body.voice_name, voice_description: body.voice_description, generated_voice_id: body.generated_voice_id }),
      }));
    }
    if (route === "simulate" && req.method === "POST") {
      return Response.json(await el(`/convai/agents/${EINSTEIN_AGENT_ID}/simulate-conversation`, { method: "POST", body: JSON.stringify(body) }));
    }
    return Response.json({ error: `unknown route ${route}` }, { status: 404 });
  } catch (e) {
    console.error(`einstein-agent ${route}:`, e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});

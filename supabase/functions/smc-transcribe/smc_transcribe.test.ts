import { assertEquals } from "jsr:@std/assert@1";
import { allowedUrl, audioDuration, handler, secretOk } from "./index.ts";

const SECRET = "test-transcribe-secret";

/** Runs the handler with ElevenLabs stubbed; returns the response JSON and what was sent upstream. */
async function run(upstream: Record<string, unknown>, init: { auth?: string; file?: Blob } = {}) {
  Deno.env.set("SMC_TRANSCRIBE_SECRET", SECRET);
  Deno.env.set("ELEVENLABS_API_KEY", "xi-test");
  const sent: { url: string; model?: string; language?: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, opts?: RequestInit) => {
    const fd = opts?.body as FormData;
    sent.push({ url: String(input), model: String(fd.get("model_id")), language: fd.get("language_code") ? String(fd.get("language_code")) : undefined });
    return new Response(JSON.stringify(upstream), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const fd = new FormData();
    fd.append("file", init.file ?? new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" }), "note.ogg");
    fd.append("language", "en"); // W29's Whisper-shaped node
    const res = await handler(new Request("https://x/functions/v1/smc-transcribe", {
      method: "POST", headers: { Authorization: `Bearer ${init.auth ?? SECRET}` }, body: fd,
    }));
    return { status: res.status, body: await res.json(), sent };
  } finally {
    globalThis.fetch = realFetch;
  }
}

Deno.test("smc-transcribe: returns the clip duration so W29's 60-second limit can fire", async () => {
  const r = await run({ text: " Hello there ", language_code: "eng", audio_duration_secs: 72.4, words: [{ text: "Hello", start: 0, end: 0.5 }] });
  assertEquals(r.status, 200);
  assertEquals(r.body, { text: "Hello there", language: "eng", language_code: "eng", duration: 72.4 });
  assertEquals(r.sent, [{ url: "https://api.elevenlabs.io/v1/speech-to-text", model: "scribe_v1", language: "en" }]);
});

Deno.test("smc-transcribe: without audio_duration_secs the duration is the end of the last timed word", async () => {
  const r = await run({ text: "Hi", language_code: "eng", words: [{ text: "Hi", start: 0, end: 0.4 }, { text: " ", start: 0.4, end: 61.25 }] });
  assertEquals(r.body.duration, 61.25);
  assertEquals(audioDuration({ text: "", words: [] }), null);
  assertEquals(audioDuration({ audio_duration_secs: null, words: [{ end: null }] }), null);
});

Deno.test("smc-transcribe: wrong secret -> 401 and nothing sent upstream", async () => {
  const r = await run({ text: "x" }, { auth: "wrong" });
  assertEquals(r.status, 401);
  assertEquals(r.sent.length, 0);
  assertEquals(await secretOk("", SECRET), false);
});

Deno.test("smc-transcribe: audio_url must be https on an allow-listed host", () => {
  assertEquals(allowedUrl("https://n8n.sortmycover.co.za/media/a.ogg", "")?.hostname, "n8n.sortmycover.co.za");
  assertEquals(allowedUrl("http://n8n.sortmycover.co.za/media/a.ogg", ""), null);
  assertEquals(allowedUrl("https://169.254.169.254/latest", ""), null);
});

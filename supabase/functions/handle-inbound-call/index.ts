// Twilio voice webhook for Lead Velocity's line (+27 60 018 5071).
// ElevenLabs' register-call API returns the TwiML that bridges the call to
// Ayanda's agent; her prompt, voice and tools live on the agent itself
// (pushed by sync-voice-agents), so nothing is overridden per call.
const say = (text: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>${text}</Say></Response>`, {
    headers: { "Content-Type": "text/xml" },
  });

Deno.serve(async (req) => {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const agentId = Deno.env.get("ELEVENLABS_AGENT_ID");
  if (!apiKey || !agentId) {
    console.error("handle-inbound-call: ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID not set");
    return say("Sorry, we can't take your call right now. Please WhatsApp us on oh seven three, seven six five, one six six four.");
  }

  const form = await req.formData();
  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");
  const callSid = String(form.get("CallSid") ?? "");

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        agent_id: agentId, from_number: from, to_number: to, direction: "inbound",
        // Ayanda's prompt and tools default WhatsApp/booking numbers to this.
        conversation_initiation_client_data: { dynamic_variables: { caller_number: from } },
      }),
    });
    const twiml = await res.text();
    if (!res.ok || !twiml.includes("<Response")) throw new Error(`register-call ${res.status}: ${twiml.slice(0, 300)}`);
    console.log("inbound call bridged to Ayanda", { callSid, from });
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (e) {
    console.error("handle-inbound-call:", e);
    return say("Sorry, we can't take your call right now. Please WhatsApp us on oh seven three, seven six five, one six six four.");
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AYANDA_PERSONALITY } from "../_shared/ayanda_persona.ts";

const buildPersona = (callerNumber: string) => AYANDA_PERSONALITY
    .replace(/{customer_name}/g, "there")
    .replace(/{broker_name}/g, "our team")
    .replace(/{firm_name}/g, "Lead Velocity")
    .replace(/{firm_address}/g, "N/A")
    .replace(/{research_context}/g, "No prior research — this is an inbound call.")
    + `\n\nThe caller's number is ${callerNumber}. Default any SMS/WhatsApp confirmation to this number unless they give another.`;

serve(async (req) => {
  try {
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      console.error('ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not configured');
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, we're unable to take your call right now. Please try again later.</Say>
</Response>`, {
        status: 500,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const callerNumber = (formData.get('From') as string) || 'unknown';

    console.log('Inbound call received:', { callSid, callerNumber });

    // Get ElevenLabs signed URL with dynamic persona override
    const signedUrlResponse = await fetch('https://api.elevenlabs.io/v1/convai/conversation/get_signed_url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        agent_id: ELEVENLABS_AGENT_ID,
        conversation_config_override: {
          agent: {
            prompt: { prompt: buildPersona(callerNumber) },
            first_message: "Hi, thanks for calling Lead Velocity. I'm Ayanda — how can I help you today?",
          },
        },
      }),
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      throw new Error(`ElevenLabs error: ${signedUrlResponse.status}. ${errorText}`);
    }

    const { signed_url } = await signedUrlResponse.json();

    console.log('ElevenLabs signed URL obtained for call:', callSid);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Connect>
    <Stream url="${signed_url}" />
  </Connect>
</Response>`;

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in handle-inbound-call:', errorMessage);

    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, we're unable to take your call right now. Please try again later.</Say>
</Response>`, {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});

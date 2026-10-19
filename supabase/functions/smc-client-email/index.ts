// smc-client-email: the SortMyCover booking emails a client receives (confirmed / updated / cancelled), sent through
// Resend from SortMyCover <hello@sortmycover.co.za> (sortmycover.co.za is verified in Resend), Reply-To hello@.
// Called by n8n W05 for SortMyCover leads instead of the howzit@ Graph sendMail (17 Oct 2026).
//
// POST { kind: 'booking_confirmed'|'booking_updated'|'booking_cancelled', to, lead_first_name, slot_start (ISO),
//        method: teams|zoom|meet|whatsapp_call|phone, adviser_name, practice_name, fsp_number,
//        join_url?, slot_end?, booking_id?, calendar_invite?: 'adviser'|'attached', idempotency_key?, guest_email? (Teams only, != to) }
//   guest_email -> the same email to the guest as a second Resend message (key + ':guest', guest wording, POPIA line)
//   header x-api-key = n8n relay token ($env.LINDI_RELAY_TOKEN)
//   -> 200 { id } (Resend email id; + guest_id, or guest_error when only the guest copy failed) | 400 { error, fields } | 401 | 500 (no RESEND_API_KEY) | 502 { error, status }
// Auth: SHA-256 of x-api-key must equal public.relay_tokens.sha256 for name 'n8n-internal' (token only on the n8n server).
// Copy and layout: render.ts. Tests: smc_client_email.test.ts (deno test or node --test).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { makeHandler } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(makeHandler({
  relayTokenSha256: async () => {
    const { data: tok } = await db.from("relay_tokens").select("sha256").eq("name", "n8n-internal").maybeSingle();
    return tok?.sha256 ?? null;
  },
  resendKey: () => Deno.env.get("RESEND_API_KEY"),
  fetch: (input, init) => fetch(input, init),
}));

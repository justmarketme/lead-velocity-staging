
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { rawData, source = 'Scraped' } = await req.json();

    if (!rawData) {
      throw new Error('No raw data provided');
    }

    // 1. Use Gemini to normalize the data
    const prompt = `
      You are an expert data normalization agent. 
      Analyze the following raw scraped lead data and extract the essential fields for a CRM.
      
      RAW DATA:
      ${JSON.stringify(rawData)}
      
      OUTPUT JSON FORMAT:
      {
        "first_name": "string",
        "last_name": "string",
        "email": "string",
        "phone": "string (international format or standard local)",
        "notes": "string (any extra context like current provider, estimated value, etc.)",
        "metadata": "object (any other useful key-value pairs)"
      }
      
      If a field is missing, return null for that field. Be smart about names (e.g. "Jono S" -> first_name: "Jono", last_name: "S").
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    const result = await response.json();
    const normalizedData = JSON.parse(result.candidates[0].content.parts[0].text);

    // 2. Insert into leads table
    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        first_name: normalizedData.first_name,
        last_name: normalizedData.last_name,
        email: normalizedData.email || `${normalizedData.first_name?.toLowerCase()}@scraped.tmp`,
        phone: normalizedData.phone,
        notes: normalizedData.notes,
        source: source,
        current_status: 'New'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, lead: lead }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in normalize-leads:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

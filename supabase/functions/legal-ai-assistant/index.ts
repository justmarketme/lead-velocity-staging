import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Since verify_jwt: true is enabled, we only need to ensure the header exists.
        // The Supabase gateway has already verified the token is valid for this project.
        const authHeader = req.headers.get('Authorization');
        // RELAXED AUTH FOR TESTING IN DEVELOPMENT (Allow requests without User JWT if they have a valid Service Role/Anon Key or if we're in bypass)
        if (!authHeader) {
            console.warn('Request missing Authorization header. Proceeding with caution...');
        }

        // Parse the request body
        const body = await req.json();
        const { command, currentState, documentType = "Document" } = body;
        console.log(`Processing ${documentType} request. Command: "${command}"`);

        if (!command || !currentState) {
            return new Response(JSON.stringify({ error: 'Missing command or currentState in request body' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Call Gemini API
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY is not configured in Edge Function secrets.');
        }

        const prompt = `You are an expert AI assistant who specialises in business documentation and South African law.
You are helping a user draft/refine a ${documentType}. The user will provide the current ${documentType} state and a command, request, or general "vibe" they want to achieve.

Your job is to:
1. Actively interpret their intent and "vibe code" the document.
2. Make specific, high-quality recommendations that align with South African legal and business best practices.
3. Explain *why* these changes benefit the user in your conversational response.

Respond ONLY with a valid JSON object (no markdown, no backticks).
The JSON object must have exactly three keys:
1. "response": A short, confident, and professional conversational reply (max 3 sentences) summarising what you did, your recommendation, and why it benefits them. This will be spoken out loud, so keep it conversational and easy to listen to.
2. "changes": A flat object of key-value pairs representing ONLY the fields in the document state that should be updated. The keys must match the existing keys in the data, and the values should be the newly drafted text. Do NOT include fields that do not need to change. If no changes make sense, return an empty object for "changes".
3. "suggestions": An array of 2 to 3 strings, each containing a short, actionable follow-up prompt suggestion for the user (e.g., "Add a confidentiality clause", "Ensure NCA compliance", "Make the tone more formal"). These should be highly contextual to the current draft.

Current ${documentType} State:
${JSON.stringify(currentState, null, 2)}

User Command/Intent:
"${command}"`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`;

        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.2, // Low temperature for more deterministic/factual legal changes
                    responseMimeType: "application/json"
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini API Error:", errorText);
            throw new Error(`Gemini API responded with status ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();

        // Extract the JSON text from Gemini output
        const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!aiText) {
            throw new Error("Invalid response structure from Gemini API.");
        }

        // Already guaranteed to be JSON by responseMimeType
        const parsedData = JSON.parse(aiText);

        return new Response(JSON.stringify(parsedData), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err: any) {
        console.error("Legal AI Assistant Error:", err);
        return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

/**
 * Shared utility for calling the Gemini AI API directly from the frontend.
 * This bypasses the need for a Supabase Edge Function secret.
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;

interface AIAssistantResult {
    response: string;
    changes: Record<string, any>;
    suggestions: string[];
}

export async function callLegalAI(
    command: string,
    currentState: Record<string, any>,
    documentType: string = "Document"
): Promise<AIAssistantResult> {
    if (!GEMINI_API_KEY) {
        throw new Error("VITE_GEMINI_API_KEY is not set in your .env file.");
    }

    const prompt = `You are an expert AI assistant who specialises in business documentation and South African law.
You are helping a user draft/refine a ${documentType}. The user will provide the current ${documentType} state and a command, request, or general "vibe" they want to achieve.

Your job is to:
1. Actively interpret their intent and "vibe code" the document.
2. Make specific, high-quality recommendations that align with South African legal and business best practices.
3. Explain *why* these changes benefit the user in your conversational response.

Respond ONLY with a valid JSON object (no markdown, no backticks, no preamble).
The JSON object must have exactly three keys:
1. "response": A short, confident, and professional conversational reply (max 3 sentences) summarising what you did, your recommendation, and why it benefits them. This will be spoken out loud, so keep it conversational and easy to listen to.
2. "changes": A flat object of key-value pairs representing ONLY the fields in the document state that should be updated. The keys must match the existing keys in the data, and the values should be the newly drafted text. Do NOT include fields that do not need to change. If no changes make sense, return an empty object for "changes".
3. "suggestions": An array of 2 to 3 strings, each containing a short, actionable follow-up prompt suggestion for the user (e.g., "Add a confidentiality clause", "Ensure NCA compliance", "Make the tone more formal"). These should be highly contextual to the current draft.

Current ${documentType} State:
${JSON.stringify(currentState, null, 2)}

User Command/Intent:
"${command}"`;

    const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
            },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini API Error:", errText);
        throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiText) {
        console.error("Empty Gemini response:", JSON.stringify(data));
        throw new Error("No response from Gemini API.");
    }

    return JSON.parse(aiText) as AIAssistantResult;
}

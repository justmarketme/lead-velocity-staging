import { Plugin, loadEnv } from 'vite';

export function edgeFunctionsPlugin(): Plugin {
    return {
        name: 'vite-plugin-edge-functions',
        configureServer(server) {
            // Load env variables the Vite way
            const env = loadEnv(server.config.mode, process.cwd(), '');

            server.middlewares.use(async (req, res, next) => {
                if (req.url?.includes('/functions/v1/marketing-ai')) {
                    if (req.method === 'OPTIONS') {
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.setHeader('Access-Control-Allow-Headers', '*');
                        res.setHeader('Access-Control-Allow-Methods', '*');
                        res.end();
                        return;
                    }

                    try {
                        let body = '';
                        // Node handles streams
                        for await (const chunk of req) {
                            body += chunk;
                        }
                        
                        const parsedBody = body ? JSON.parse(body) : {};
                        const { action, payload } = parsedBody;
                        
                        const GEMINI_API_KEY = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
                        const TAVILY_API_KEY = env.VITE_TAVILY_API_KEY || env.TAVILY_API_KEY;
                        const OPENROUTER_API_KEY = env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;

                        console.log(`[Edge Emulator] Action: ${action} | Industry: ${payload?.industry}`);

                        let result;
                        
                        if (action === "prospect-leads") {
                            let researchData = "";
                            if (payload.provider === 'tavily' && TAVILY_API_KEY) {
                                try {
                                    const searchQuery = `List of ${payload.industry} companies in ${payload.geos || 'South Africa'}. Focus: ${payload.intent || 'General lead generation'}`;
                                    const tavilyRes = await fetch("https://api.tavily.com/search", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            api_key: TAVILY_API_KEY,
                                            query: searchQuery,
                                            search_depth: "advanced",
                                            max_results: 8
                                        })
                                    });
                                    if (tavilyRes.ok) {
                                        const tavilyData = await tavilyRes.json();
                                        researchData = JSON.stringify(tavilyData.results);
                                    }
                                } catch (e) {
                                    console.warn("Tavily lookup failed in emulator:", e);
                                }
                            }

                            const prompt = `Generate exactly 5 high-fidelity, real-life leads for the ${payload.industry} industry in ${payload.geos || 'South Africa'}.
                            Strategic Context: ${payload.intent}.
                            ${researchData ? `RESEARCH DATA: ${researchData}` : 'Proceed with neural simulation.'}.
                            Use realistic South African names (mixed ethnicities: Afrikaans, English, Zulu, Xhosa).
                            Return ONLY a JSON array of objects with these exact keys: name, role, company, email, phone (South African mobile in format 0XX XXX XXXX), address (realistic SA business address with suburb and city), source (one of: "LinkedIn", "Google Maps", "Instagram", "Twitter/X", "Facebook", "Company Website", "Industry Directory"), vibe (80-99).`;

                            const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                                method: "POST",
                                headers: {
                                    "Authorization": `Bearer ${OPENROUTER_API_KEY || GEMINI_API_KEY}`,
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    model: "google/gemini-2.0-flash-001",
                                    messages: [{ role: "user", content: prompt }],
                                    response_format: { type: "json_object" }
                                })
                            });

                            if (aiRes.ok) {
                                const aiData = await aiRes.json();
                                const content = aiData.choices?.[0]?.message?.content || "[]";
                                const parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```/g, "").trim());
                                // Unwrap if OpenRouter returns { leads: [...] } or similar wrapper
                                result = Array.isArray(parsed) ? parsed : (Object.values(parsed).find(v => Array.isArray(v)) || parsed);
                            } else {
                                // Fallback to direct Gemini
                                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                                        generationConfig: { temperature: 0.7, response_mime_type: "application/json" }
                                    })
                                });
                                const geminiData = await geminiRes.json();
                                const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
                                result = JSON.parse(content.replace(/```json\n?/g, "").replace(/```/g, "").trim());
                            }
                        } else {
                            result = { status: "success", message: "Action acknowledged by emulator." };
                        }

                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.end(JSON.stringify(result));
                        return;
                    } catch (err: any) {
                        console.error("[Emulator Error]:", err);
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: err.message }));
                        return;
                    }
                }
                next();
            });
        },
    };
}

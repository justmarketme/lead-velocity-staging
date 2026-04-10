import { Plugin, loadEnv } from 'vite';

export function edgeFunctionsPlugin(): Plugin {
    return {
        name: 'vite-plugin-edge-functions',
        configureServer(server) {
            // Load env variables the Vite way
            const env = loadEnv(server.config.mode, process.cwd(), '');

            server.middlewares.use(async (req, res, next) => {
                if (req.url?.includes('/functions/v1/')) {
                    const functionName = req.url.split('/functions/v1/')[1];
                    
                    if (req.method === 'OPTIONS') {
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.setHeader('Access-Control-Allow-Headers', '*');
                        res.setHeader('Access-Control-Allow-Methods', '*');
                        res.end();
                        return;
                    }

                    try {
                        let body = '';
                        for await (const chunk of req) {
                            body += chunk;
                        }
                        
                        const parsedBody = body ? JSON.parse(body) : {};
                        const GEMINI_API_KEY = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
                        const TAVILY_API_KEY = env.VITE_TAVILY_API_KEY || env.TAVILY_API_KEY;
                        const OPENROUTER_API_KEY = env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
                        const ULTRAVOX_API_KEY = env.ULTRAVOX_API_KEY;

                        console.log(`[Edge Emulator] Intercepted: ${functionName}`);

                        let result;
                        
                        if (functionName === 'marketing-ai') {
                            const { action, payload } = parsedBody;
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
                                    result = Array.isArray(parsed) ? parsed : (Object.values(parsed).find(v => Array.isArray(v)) || parsed);
                                } else {
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
                        } else if (functionName === 'create-einstein-call') {
                            if (!ULTRAVOX_API_KEY) {
                                throw new Error("ULTRAVOX_API_KEY is missing in local .env");
                            }

                            const ELEVENLABS_VOICE_ID = env.ELEVENLABS_EINSTEIN_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
                            
                            const ultravoxResponse = await fetch('https://api.ultravox.ai/api/calls', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-API-Key': ULTRAVOX_API_KEY,
                                },
                                body: JSON.stringify({
                                    systemPrompt: `You are Einstein, a witty, cyberpunk astronaut version of Albert Einstein. Accent: German and eccentric.`,
                                    model: 'ultravox-v0.7',
                                    externalVoice: {
                                        elevenLabs: {
                                            voiceId: ELEVENLABS_VOICE_ID,
                                            model: 'eleven_turbo_v2_5'
                                        }
                                    },
                                    medium: { webRtc: {} },
                                    firstSpeaker: 'FIRST_SPEAKER_AGENT'
                                }),
                            });

                            if (!ultravoxResponse.ok) {
                                const errText = await ultravoxResponse.text();
                                throw new Error(`Ultravox API error: ${ultravoxResponse.status}. ${errText}`);
                            }

                            const callData = await ultravoxResponse.json();
                            result = {
                                joinUrl: callData.joinUrl || callData.join_url,
                                callId: callData.callId || callData.call_id
                            };
                        } else {
                            result = { status: "success", message: `Emulating ${functionName}` };
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

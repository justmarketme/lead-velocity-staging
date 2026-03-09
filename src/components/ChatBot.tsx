import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, Send, Rocket, Sparkles, Mic, AudioLines } from "lucide-react";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatbot } from "@/hooks/useChatbot";
import ReactMarkdown from "react-markdown";
import einsteinAvatar from "@/assets/einstein-chatbot-avatar.webp";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Routes where the chatbot should NOT appear
const EXCLUDED_ROUTES = [
    "/login",
    "/admin",
    "/dashboard",
    "/broker", // This matches /broker and /broker/... (BrokerPortal, BrokerDashboard)
    "/reset-password",
    "/invite",
    "/broker-setup",
    "/notifications",
    "/broker-elite" // Premium Broker Portal
];

const ONBOARDING_PATH = "/onboarding";

// --- Audio Utility Functions ---
function decodeBase64Audio(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function encodeAudioToPCM(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function decodeAudioDataBuffer(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

export function ChatBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const [isListening, setIsListening] = useState(false);
    const aiRef = useRef<any>(null);

    // Lazily initialize the AI client on first use to avoid module-level crash
    const getAI = () => {
        if (!aiRef.current && GEMINI_API_KEY) {
            try {
                aiRef.current = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
            } catch (e) {
                console.error("GoogleGenAI init error:", e);
            }
        }
        return aiRef.current;
    };

    // Live Audio State
    const [isLiveActive, setIsLiveActive] = useState(false);
    const [isConnectingLive, setIsConnectingLive] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [liveTranscription, setLiveTranscription] = useState('');
    const liveSessionRef = useRef<any>(null);
    const audioContexts = useRef<{ input?: AudioContext; output?: AudioContext }>({});
    const nextStartTime = useRef(0);
    const sources = useRef(new Set<AudioBufferSourceNode>());

    const [permissionStatus, setPermissionStatus] = useState<PermissionState | 'prompt'>('prompt');
    const recognitionRef = useRef<any>(null);
    const location = useLocation();
    const { messages, isLoading, sendMessage, addMessage, scrollRef } = useChatbot();

    // Check permission on mount and when chat is opened
    useEffect(() => {
        if (navigator.permissions && (navigator.permissions as any).query) {
            navigator.permissions.query({ name: 'microphone' as any })
                .then((status) => {
                    setPermissionStatus(status.state);
                    status.onchange = () => setPermissionStatus(status.state);
                })
                .catch(err => {
                    console.warn("Permissions API not fully supported:", err);
                });
        }
    }, []);

    // Check if we are on an excluded route - Logic preserved, but early return removed to satisfy React Hook rules
    const isExcluded = EXCLUDED_ROUTES.some((route) =>
        location.pathname === route || location.pathname.startsWith(`${route}/`)
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        const text = input.trim();
        setInput("");

        // If a live audio session is active, route the text through it so Einstein responds with voice
        if (isLiveActive && liveSessionRef.current) {
            addMessage({ id: Date.now().toString(), role: "user", content: text });
            (liveSessionRef.current as any).send({
                clientContent: {
                    turns: [{ role: "user", parts: [{ text }] }],
                    turnComplete: true
                }
            });
        } else {
            sendMessage(text);
        }
    };

    const toggleSpeechToText = () => {
        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech-to-text is not supported in this browser. Try Chrome or Edge.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.interimResults = true;

        const originalInput = input;

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event: any) => {
            let currentTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                currentTranscript += event.results[i][0].transcript;
            }
            setInput(originalInput + (originalInput ? " " : "") + currentTranscript);
        };

        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);

        recognition.start();
    };

    const stopLiveSession = useCallback(() => {
        liveSessionRef.current?.close();
        liveSessionRef.current = null;
        setIsLiveActive(false);
        setIsConnectingLive(false);
        setIsAiSpeaking(false);
        setLiveTranscription('');
        sources.current.forEach(s => s.stop());
        sources.current.clear();
        if (audioContexts.current.input) audioContexts.current.input.close();
        if (audioContexts.current.output) audioContexts.current.output.close();
        audioContexts.current = {};
    }, []);

    // Clean up purely on unmount
    useEffect(() => {
        return () => {
            stopLiveSession();
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch { }
            }
        };
    }, [stopLiveSession]);

    const handleLiveAudio = async () => {
        if (isLiveActive) {
            stopLiveSession();
            return;
        }
        if (isConnectingLive) return;

        setIsConnectingLive(true);
        try {
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContexts.current = { input: inputAudioContext, output: outputAudioContext };
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const aiClient = getAI();
            if (!aiClient) {
                setIsConnectingLive(false);
                addMessage({ id: Date.now().toString(), role: "bot", content: "Voice systems offline. API key not configured." });
                return;
            }

            // Get role context to tailor the voice conversation
            let context = "PUBLIC MODE: Provide only general Lead Velocity info.";
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
                    if (isAdmin) {
                        context = "ADMIN MODE: You have global access. Be helpful with system-wide info.";
                    } else {
                        const { data: broker } = await supabase.from('brokers').select('id, contact_person').eq('user_id', session.user.id).single();
                        if (broker) context = `BROKER MODE: Assisting ${broker.contact_person}. Focus on their specific leads.`;
                    }
                }
            } catch (e) { console.error(e); }

            const systemInstruction = `You are Einstein, a witty cyberpunk Albert Einstein. 
            YOU MUST ALWAYS USE A THICK, COMICAL GERMAN ACCENT. 
            ${context}
            
            KNOWLEDGE BASE SUMMARY:
            - Lead Velocity: Insurance lead gen for elite brokers.
            - We don't just sell leads, we book appointments into their calendar.
            - Pricing: Bronze (R8,500), Silver (R10,500), Gold (R16,500+).
            - Main goal: Get them to click the Broker Readiness Assessment.
            
            RULES:
            1. Listen first.
            2. Be warm and witty.
            3. Keep responses to 2-3 sentences.
            4. Speak like the real Einstein.`;

            const sessionPromise = aiClient.live.connect({
                model: 'gemini-2.0-flash-exp',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
                    systemInstruction,
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        setIsLiveActive(true);
                        setIsConnectingLive(false);
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
                            const pcmBlob = {
                                data: encodeAudioToPCM(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);

                        // Trigger the AI to speak first
                        sessionPromise.then(s => {
                            (s as any).send({
                                clientContent: {
                                    turns: [{ role: "user", parts: [{ text: "Answer very quickly: Greet me as a voyager, introduce yourself as Einstein-77, and ask how you can help me scale my brokerage. Keep it under 2 sentences." }] }],
                                    turnComplete: true
                                }
                            });
                        });
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        // User's speech transcription → show as a user message bubble
                        if (message.serverContent?.inputTranscription?.text) {
                            addMessage({ id: `user-voice-${Date.now()}`, role: "user", content: `🎙️ ${message.serverContent.inputTranscription.text}` });
                        }
                        // AI's output transcription → accumulate and flush on turn complete
                        if (message.serverContent?.outputTranscription) {
                            // Strip any literal [ONBOARDING_LINK] token from the live display
                            const rawText = (message.serverContent?.outputTranscription?.text || '').replace(/\[ONBOARDING_LINK\]/g, '');
                            setLiveTranscription(prev => prev + ' ' + rawText);
                            if (message.serverContent?.turnComplete) {
                                setLiveTranscription(prev => {
                                    const text = prev.trim();
                                    if (text) {
                                        // Auto-inject the clickable onboarding link whenever Einstein mentions it
                                        const mentionsLink = /onboard|assessment|readiness|the form|link below|good fit|get started|below|click/i.test(text);
                                        const finalText = mentionsLink ? `${text}\n\n[ONBOARDING_LINK]` : text;
                                        addMessage({ id: Date.now().toString(), role: "bot", content: finalText });
                                    }
                                    return '';
                                });
                            }
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            try {
                                // Resume context in case browser suspended it (autoplay policy)
                                if (outputAudioContext.state === 'suspended') {
                                    await outputAudioContext.resume();
                                }
                                setIsAiSpeaking(true);
                                nextStartTime.current = Math.max(nextStartTime.current, outputAudioContext.currentTime);
                                const audioBuffer = await decodeAudioDataBuffer(decodeBase64Audio(base64Audio), outputAudioContext, 24000, 1);
                                const source = outputAudioContext.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(outputAudioContext.destination);
                                source.start(nextStartTime.current);
                                nextStartTime.current += audioBuffer.duration;
                                sources.current.add(source);
                                source.onended = () => {
                                    sources.current.delete(source);
                                    if (sources.current.size === 0) setIsAiSpeaking(false);
                                };
                            } catch (audioErr) {
                                console.error("Audio playback error:", audioErr);
                            }
                        }
                    },
                    onclose: () => stopLiveSession(),
                    onerror: () => stopLiveSession(),
                }
            });
            liveSessionRef.current = await sessionPromise;
        } catch (err: any) {
            console.error("Live Audio Error:", err);
            setIsConnectingLive(false);

            let errorMessage = "Voice systems offline. Please try again later.";
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setPermissionStatus('denied');
                errorMessage = "Einstein can't hear you! Please click the lock icon in your browser address bar and set Microphone to 'Allow'.";
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorMessage = "No microphone detected. Please plug in a mic and try again.";
            } else if (err.message?.includes('model')) {
                errorMessage = "Einstein's neural link is updating (Model not found). Text chat is still active!";
            }

            addMessage({ id: Date.now().toString(), role: "bot", content: errorMessage });
        }
    };

    const requestPermission = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop()); // Just to trigger prompt
            setPermissionStatus('granted');
            addMessage({ id: Date.now().toString(), role: "bot", content: "Excellent! My voice systems are now online. Click the audio icon to start speaking." });
        } catch (err: any) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setPermissionStatus('denied');
                addMessage({ id: Date.now().toString(), role: "bot", content: "Permission denied. Please click the lock icon in your address bar to allow microphone access manually." });
            }
        }
    };

    // Utility to replace our magic placeholder with a styled link
    const renderMessageContent = (content: string) => {
        // We split by the exact placeholder to inject a React component
        const parts = content.split("[ONBOARDING_LINK]");

        return (
            <>
                {parts.map((part, index) => (
                    <span key={index}>
                        <span className="prose prose-sm dark:prose-invert max-w-none inline">
                            <ReactMarkdown children={part.toString()} />
                        </span>
                        {index < parts.length - 1 && (
                            <Link
                                to={ONBOARDING_PATH}
                                className="inline-flex items-center gap-1 font-bold text-pink-500 hover:text-pink-400 no-underline bg-pink-500/10 px-2 py-0.5 rounded-md transition-colors border border-pink-500/20"
                                onClick={() => setIsOpen(false)} // Close chat when navigating
                            >
                                Let's see if we are a good fit <Rocket className="w-3 h-3" />
                            </Link>
                        )}
                    </span>
                ))}
            </>
        );
    };

    if (isExcluded) return null;

    return (
        <div className="fixed bottom-10 right-8 sm:bottom-12 sm:right-10 z-[100] flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-[350px] sm:w-[400px] h-[500px] bg-[#020617]/95 backdrop-blur-xl border border-pink-500/20 rounded-2xl shadow-2xl shadow-pink-500/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-pink-600/20 to-rose-600/20 border-b border-pink-500/20 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="absolute inset-0 bg-pink-500 blur-sm opacity-50 rounded-full animate-pulse" />
                                <img
                                    src={einsteinAvatar}
                                    alt="Einstein AI"
                                    className="w-10 h-10 rounded-full object-cover relative border-2 border-pink-500/50 shadow-lg shadow-pink-500/30"
                                />
                            </div>
                            <div>
                                <h3 className="font-bold text-white tracking-tight flex items-center gap-2">
                                    Einstein <Sparkles className="w-3 h-3 text-pink-400" />
                                </h3>
                                <p className="text-[10px] text-pink-300/70 font-mono tracking-wider uppercase">Orbital Lead Command</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-400 hover:text-white hover:bg-white/10 rounded-full"
                            onClick={() => setIsOpen(false)}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Messages Area */}
                    <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                        <div className="space-y-4 pb-4">
                            {messages.map((msg, index) => (
                                <div
                                    key={index}
                                    className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs ${msg.role === "user"
                                            ? "bg-gradient-to-br from-violet-900/60 to-pink-900/40 text-white rounded-br-none border border-pink-500/30 shadow-[0_0_12px_rgba(236,72,153,0.15)]"
                                            : "bg-pink-950/30 text-slate-300 rounded-bl-none border border-pink-500/10 shadow-[inset_0_0_20px_rgba(236,72,153,0.05)] text-sm"
                                            }`}
                                    >
                                        {renderMessageContent(msg.content)}
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 bg-pink-950/30 border border-pink-500/10 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce" />
                                    </div>
                                </div>
                            )}

                            {isConnectingLive && (
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 bg-pink-950/30 border border-pink-500/10 flex items-center gap-3">
                                        <div className="w-4 h-4 rounded-full border-2 border-pink-500 border-t-transparent animate-spin" />
                                        <span className="text-xs text-slate-400 font-medium">Establishing Neural Link...</span>
                                    </div>
                                </div>
                            )}

                            {isLiveActive && (
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 bg-pink-950/30 border border-pink-500/10 overflow-hidden relative">
                                        <div className="absolute inset-0 bg-pink-500/5 animate-pulse" />
                                        <div className="flex items-center gap-2 mb-1 relative z-10">
                                            <div className={`w-2 h-2 bg-pink-500 rounded-full ${isAiSpeaking ? 'animate-bounce' : 'animate-ping'}`} />
                                            <span className="text-[10px] font-black uppercase text-pink-500 tracking-widest">
                                                {isAiSpeaking ? 'Einstein is Speaking' : liveTranscription ? 'Processing Data...' : 'Live Audio Active'}
                                            </span>
                                        </div>
                                        {liveTranscription ? (
                                            <p className="text-xs text-slate-300 relative z-10 font-medium">"{liveTranscription}..."</p>
                                        ) : (
                                            <p className="text-xs text-slate-500 relative z-10 animate-pulse">Scanning spacetime... Speak near your microphone.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {permissionStatus !== 'granted' && !isLiveActive && !isConnectingLive && (
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 bg-pink-950/30 border border-pink-500/10 flex flex-col gap-3">
                                        <div className="flex items-center gap-2">
                                            <AudioLines className="w-4 h-4 text-pink-400" />
                                            <span className="text-xs text-slate-300 font-medium">Einstein's Voice System</span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                                            {permissionStatus === 'denied'
                                                ? "Microphone access is blocked. Please enable it in your browser settings to speak with Einstein."
                                                : "Ready to hear your thoughts? Click below to enable Einstein's interactive voice mode."}
                                        </p>
                                        {permissionStatus !== 'denied' && (
                                            <Button
                                                onClick={requestPermission}
                                                className="bg-pink-600 hover:bg-pink-500 text-white text-[10px] h-8 font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-pink-500/20"
                                            >
                                                Enable Einstein's Voice
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="p-3 bg-[#020617] border-t border-pink-500/20">
                        <form
                            onSubmit={handleSubmit}
                            className="flex items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-full p-1 pl-4 focus-within:ring-1 focus-within:ring-pink-500/50 focus-within:border-pink-500/50 transition-all"
                        >
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={isLiveActive ? "Type while Einstein speaks..." : "Transmit message to Einstein..."}
                                className="flex-1 bg-transparent border-none focus-visible:ring-0 px-0 h-9 text-slate-300 placeholder:text-slate-600 text-sm"
                                disabled={isLoading && !isLiveActive}
                            />
                            <div className="flex items-center gap-1 pr-1">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={toggleSpeechToText}
                                    className={`h-8 w-8 rounded-full ${isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-slate-400 hover:text-white hover:bg-slate-800/50"}`}
                                    title="Speech to Text"
                                >
                                    <Mic className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="button"
                                    size="icon"
                                    onClick={handleLiveAudio}
                                    className={`h-8 w-8 rounded-full ${isLiveActive || isConnectingLive ? "text-white bg-pink-600 animate-pulse shadow-[0_0_15px_rgba(236,72,153,0.5)]" : "bg-slate-800 hover:bg-slate-700 text-pink-400 border border-slate-700"}`}
                                    title={isLiveActive ? "Stop Live Agent" : "Live Agent Conversation"}
                                >
                                    <AudioLines className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={isLoading || !input.trim()}
                                    className="rounded-full bg-pink-600 hover:bg-pink-500 text-white h-9 w-9 shrink-0 shadow-[0_0_15px_rgba(236,72,153,0.4)] disabled:opacity-50 disabled:shadow-none ml-1"
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Floating Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="rounded-full w-16 h-16 overflow-hidden shadow-[0_0_30px_rgba(236,72,153,0.5)] hover:shadow-[0_0_45px_rgba(236,72,153,0.7)] border-2 border-pink-500/60 transition-all duration-300 hover:scale-110 relative group"
                >
                    <div className="absolute -inset-2 bg-pink-500/20 rounded-full blur-xl group-hover:bg-pink-500/30 transition-all duration-300" />
                    <img src={einsteinAvatar} alt="Einstein" className="w-full h-full object-cover" />
                    {/* Notification Dot */}
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 border-2 border-[#020617] rounded-full flex items-center justify-center animate-pulse">
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </div>
                </button>
            )}
        </div>
    );
}

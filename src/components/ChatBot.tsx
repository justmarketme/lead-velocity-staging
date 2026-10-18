import { errorProp } from "@/lib/groupB-errors";
import { useState, useRef, useCallback, useEffect } from "react";
import { getSpeechRecognition, type SpeechRecognitionEventLike, type SpeechRecognitionLike } from "@/lib/speechRecognition";
import { useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, Send, Rocket, Sparkles, Mic, AudioLines, Minimize2, Maximize2, Bot, User, Loader2, PhoneOff } from "lucide-react";
import { Conversation, type VoiceConversation } from "@elevenlabs/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatbot } from "@/hooks/useChatbot";
import ReactMarkdown from "react-markdown";
import einsteinAvatar from "@/assets/einstein-chatbot-avatar.webp";
import { cn } from "@/lib/utils";

// Einstein lives on the PUBLIC website only — never the broker portal, admin, console or auth
// pages. An allow-list (not a block-list) so a new portal route can never pick him up by accident.
// Keep in step with the public pages the KB crawler indexes (supabase/functions/_shared/site_kb.ts).
const PUBLIC_ROUTES = new Set([
    "/",
    "/about",
    "/services",
    "/pricing",
    "/promotions",
    "/specialized-services",
    "/contact",
    "/onboarding",
]);

const ONBOARDING_PATH = "/onboarding";

export function ChatBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [isListening, setIsListening] = useState(false);

    // ElevenLabs Voice State
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const [isConnectingVoice, setIsConnectingVoice] = useState(false);
    const [voiceStatus, setVoiceStatus] = useState<string>('');
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
    const conversationRef = useRef<VoiceConversation | null>(null);

    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const location = useLocation();
    const { messages, isLoading, sendMessage, addMessage, scrollRef } = useChatbot();

    const isPublicPage = PUBLIC_ROUTES.has(location.pathname.replace(/\/+$/, "") || "/");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        const text = input.trim();
        setInput("");
        // During a voice session, typed text goes into that same live conversation.
        if (isVoiceActive && conversationRef.current) {
            conversationRef.current.sendUserMessage(text);
            addMessage({ id: `typed-${Date.now()}`, role: "user", content: text });
            return;
        }
        sendMessage(text);
    };

    const toggleSpeechToText = () => {
        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = getSpeechRecognition();
        if (!SpeechRecognition) {
            alert("Speech-to-text is not supported in this browser. Try Chrome or Edge.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.interimResults = true;

        const originalInput = input;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: SpeechRecognitionEventLike) => {
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

    const stopVoiceSession = useCallback(() => {
        if (conversationRef.current) {
            conversationRef.current.endSession().catch(() => {});
            conversationRef.current = null;
        }
        setIsVoiceActive(false);
        setIsConnectingVoice(false);
        setIsAgentSpeaking(false);
        setVoiceStatus('');
    }, []);

    useEffect(() => {
        return () => {
            stopVoiceSession();
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch { /* already stopped */ }
            }
        };
    }, [stopVoiceSession]);

    // Leaving the public site (e.g. clicking "Broker Login") ends any live voice session.
    useEffect(() => {
        if (!isPublicPage) stopVoiceSession();
    }, [isPublicPage, stopVoiceSession]);

    const handleVoiceCall = async () => {
        if (isVoiceActive) {
            stopVoiceSession();
            addMessage({ id: Date.now().toString(), role: "bot", content: "Neural link terminated. Ze session has ended, voyager. Come back soon, ja!" });
            return;
        }
        if (isConnectingVoice) return;

        setIsConnectingVoice(true);
        try {
            const response = await supabase.functions.invoke('create-einstein-call');

            if (response.error) {
                throw new Error(response.error.message || 'Failed to create Einstein call');
            }

            // Einstein's prompt, voice and knowledge base live on his ElevenLabs agent — no overrides.
            const { signedUrl } = response.data;
            if (!signedUrl) {
                throw new Error('No signed URL returned from Einstein service');
            }

            const conversation = await Conversation.startSession({
                signedUrl,
                onConnect: () => {
                    setIsVoiceActive(true);
                    setIsConnectingVoice(false);
                    setVoiceStatus('Connected — speak now');
                },
                onDisconnect: () => {
                    stopVoiceSession();
                },
                onModeChange: ({ mode }) => {
                    setIsAgentSpeaking(mode === 'speaking');
                    setVoiceStatus(mode === 'speaking' ? 'Einstein is speaking...' : 'Listening to you...');
                },
                onMessage: ({ message, role: msgRole }) => {
                    const chatRole = msgRole === 'agent' ? 'bot' : 'user';
                    const prefix = chatRole === 'user' ? '🎙️ ' : '';
                    addMessage({
                        id: `voice-${Date.now()}-${Math.random()}`,
                        role: chatRole,
                        content: `${prefix}${message}`,
                    });
                },
                onError: (msg) => {
                    console.error('ElevenLabs voice error:', msg);
                },
            }) as VoiceConversation;

            conversationRef.current = conversation;

        } catch (err: unknown) {
            console.error("Voice Call Error:", err);
            setIsConnectingVoice(false);
            setIsVoiceActive(false);
            let errorMessage = "Ze neural link could not be established. Voice chat is unavailable — text chat is still active, ja!";
            const errName = errorProp(err, 'name');
            if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
                errorMessage = "Microphone access required for voice mode. Please check your browser settings and try again.";
            }
            addMessage({ id: Date.now().toString(), role: "bot", content: errorMessage });
        }
    };

    const renderMessageContent = (content: string) => {
        const parts = content.split("[ONBOARDING_LINK]");
        return (
            <>
                {parts.map((part, index) => (
                    <span key={index}>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown children={part.toString()} />
                        </div>
                        {index < parts.length - 1 && (
                            <Link
                                to={ONBOARDING_PATH}
                                className="mt-3 inline-flex items-center gap-2 font-bold text-white bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 rounded-xl transition-all hover:scale-105 shadow-lg shadow-pink-500/20 no-underline"
                                onClick={() => setIsOpen(false)}
                            >
                                Start Assessment <Rocket className="w-4 h-4" />
                            </Link>
                        )}
                    </span>
                ))}
            </>
        );
    };

    if (!isPublicPage) return null;

    return (
        <div className="fixed z-[100] flex flex-col items-end pointer-events-none bottom-6 right-6 sm:bottom-10 sm:right-10" data-testid="einstein-widget">
            {/* Chat Window */}
            {isOpen && (
                <div className={cn(
                    "mb-4 w-[90vw] sm:w-[420px] bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-500 ease-in-out pointer-events-auto",
                    isMinimized ? "h-[70px]" : "h-[600px] max-h-[80vh]",
                    "shadow-[0_0_50px_rgba(0,0,0,0.5)] border-pink-500/20 animate-in slide-in-from-bottom-5"
                )}>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-slate-900 to-slate-950 border-b border-white/5 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className={cn(
                                    "absolute -inset-1 rounded-full blur-sm transition-opacity",
                                    isVoiceActive ? "bg-pink-500 opacity-50 animate-pulse" : "bg-slate-500 opacity-20"
                                )} />
                                <img
                                    src={einsteinAvatar}
                                    alt="Einstein AI"
                                    className="w-10 h-10 rounded-full object-cover relative border border-white/10"
                                />
                                <div className={cn(
                                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-950",
                                    isVoiceActive ? "bg-emerald-500 animate-pulse" : "bg-emerald-400"
                                )} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                    Einstein AI-77 <Sparkles className="w-3 h-3 text-pink-400" />
                                </h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                                        {isVoiceActive ? voiceStatus || 'Neural Link Active' : 'Mission Operations'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg"
                                onClick={() => setIsMinimized(!isMinimized)}
                            >
                                {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg"
                                onClick={() => setIsOpen(false)}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {!isMinimized && (
                        <>
                            {/* Messages Area */}
                            <ScrollArea className="flex-1 p-5 overflow-x-hidden" ref={scrollRef}>
                                <div className="space-y-6 pb-4">
                                    {messages.map((msg, index) => (
                                        <div
                                            key={index}
                                            className={cn(
                                                "flex w-full animate-in fade-in slide-in-from-bottom-2",
                                                msg.role === "user" ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            <div className={cn(
                                                "flex flex-col gap-1.5 max-w-[85%]",
                                                msg.role === "user" ? "items-end" : "items-start"
                                            )}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    {msg.role === "bot" ? (
                                                        <div className="flex items-center gap-2 bg-slate-800/50 px-2 py-0.5 rounded-md text-[9px] font-bold text-slate-400 uppercase tracking-widest border border-white/5">
                                                            <Bot className="w-3 h-3" /> Einstein
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 bg-pink-500/10 px-2 py-0.5 rounded-md text-[9px] font-bold text-pink-400 uppercase tracking-widest border border-pink-500/10">
                                                            Voyager <User className="w-3 h-3" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div
                                                    className={cn(
                                                        "rounded-2xl px-4 py-3 text-sm shadow-sm transition-all duration-300",
                                                        msg.role === "user"
                                                            ? "bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-none border border-white/10"
                                                            : "bg-slate-900/50 text-slate-200 rounded-tl-none border border-white/5 backdrop-blur-sm"
                                                    )}
                                                >
                                                    {renderMessageContent(msg.content)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {isLoading && (
                                        <div className="flex justify-start animate-pulse">
                                            <div className="bg-slate-900/50 border border-white/5 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-bounce" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Live Voice Status Panel */}
                                    {isVoiceActive && (
                                        <div className="flex justify-center my-4">
                                            <div className="bg-pink-500/5 border border-pink-500/20 rounded-2xl p-4 w-full flex flex-col items-center gap-4 animate-in zoom-in-95">
                                                <div className="flex items-center gap-3">
                                                    {/* Audio visualizer bars */}
                                                    <div className="flex gap-1 items-center h-6">
                                                        {[1, 2, 3, 4, 5].map(i => (
                                                            <div key={i} className={cn(
                                                                "w-1 rounded-full transition-all duration-150",
                                                                isAgentSpeaking
                                                                    ? "bg-pink-500"
                                                                    : "bg-emerald-500",
                                                                isAgentSpeaking
                                                                    ? i % 2 === 0 ? "h-6 animate-bounce" : "h-3 animate-bounce [animation-delay:0.15s]"
                                                                    : i % 2 === 0 ? "h-4 animate-pulse" : "h-2 animate-pulse [animation-delay:0.2s]"
                                                            )} />
                                                        ))}
                                                    </div>
                                                    <span className={cn(
                                                        "text-[10px] font-black uppercase tracking-[0.2em]",
                                                        isAgentSpeaking ? "text-pink-500" : "text-emerald-500"
                                                    )}>
                                                        {isAgentSpeaking ? '🎙️ Einstein Speaking' : '👂 Listening...'}
                                                    </span>
                                                </div>
                                                <p className="text-[9px] text-slate-500 text-center font-mono">
                                                    Powered by ElevenLabs Voice AI
                                                </p>
                                                <Button
                                                    size="sm"
                                                    onClick={stopVoiceSession}
                                                    className="bg-rose-900/50 hover:bg-rose-800 text-rose-300 border border-rose-700/50 rounded-xl h-8 text-[10px] font-bold uppercase tracking-widest px-4 gap-2"
                                                >
                                                    <PhoneOff className="w-3 h-3" /> End Session
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>

                            {/* Input Area */}
                            <div className="p-4 bg-slate-950/50 border-t border-white/5">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2 pb-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleVoiceCall}
                                            disabled={isConnectingVoice}
                                            className={cn(
                                                "flex-1 h-9 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all gap-2",
                                                isVoiceActive
                                                    ? "bg-rose-700 hover:bg-rose-800 text-white shadow-lg shadow-rose-500/20"
                                                    : "bg-slate-900 hover:bg-slate-800 text-pink-500 border border-white/5"
                                            )}
                                        >
                                            {isConnectingVoice ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    Connecting Einstein...
                                                </>
                                            ) : isVoiceActive ? (
                                                <>
                                                    <PhoneOff className="w-3.5 h-3.5" />
                                                    End Voice Session
                                                </>
                                            ) : (
                                                <>
                                                    <AudioLines className="w-3.5 h-3.5" />
                                                    Speak to Einstein
                                                </>
                                            )}
                                        </Button>
                                        {/* Speech-to-text mic for typing */}
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={toggleSpeechToText}
                                            title="Dictate your message"
                                            className={cn(
                                                "h-9 w-9 rounded-xl transition-all",
                                                isListening ? "bg-rose-500/20 text-rose-500 animate-pulse" : "bg-slate-900 border border-white/5 text-slate-400 hover:text-white"
                                            )}
                                        >
                                            <Mic className="w-4 h-4" />
                                        </Button>
                                    </div>

                                    <form
                                        onSubmit={handleSubmit}
                                        className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-2xl p-1.5 pl-4 focus-within:border-pink-500/50 transition-all shadow-inner"
                                    >
                                        <Input
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            placeholder="Type a message to Einstein..."
                                            className="flex-1 bg-transparent border-none focus-visible:ring-0 px-0 h-9 text-slate-200 placeholder:text-slate-600 text-sm"
                                            disabled={isLoading}
                                        />
                                        <Button
                                            type="submit"
                                            size="icon"
                                            disabled={isLoading || !input.trim()}
                                            className="rounded-xl bg-pink-600 hover:bg-pink-500 text-white h-9 w-9 shrink-0 shadow-lg shadow-pink-500/20 transition-all disabled:opacity-50"
                                        >
                                            <Send className="w-4 h-4" />
                                        </Button>
                                    </form>

                                    <p className="text-[8px] text-slate-600 text-center uppercase tracking-[0.2em] font-mono">
                                        Lead Velocity · Einstein AI · ElevenLabs
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Floating Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => {
                        console.log("Einstein ChatBot Triggered");
                        setIsOpen(true);
                    }}
                    aria-label="Open chat"
                    className={cn(
                        "w-20 h-20 rounded-full overflow-hidden shadow-[0_20px_60px_-15px_rgba(236,72,153,0.5)] hover:shadow-[0_25px_80px_-10px_rgba(236,72,153,0.7)] border-2 border-pink-500/50 transition-all duration-500 hover:scale-110 pointer-events-auto relative group active:scale-95",
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-pink-500/20 to-transparent pointer-events-none" />
                    <img src={einsteinAvatar} alt="Einstein" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />

                    {/* Pulsing Aura */}
                    <div className="absolute inset-0 rounded-full border-2 border-pink-500 animate-ping opacity-20 scale-125" />

                    {/* Status Dot */}
                    <div className="absolute top-2 right-2 w-5 h-5 bg-slate-950 border-2 border-pink-500 rounded-full flex items-center justify-center">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    </div>
                </button>
            )}
        </div>
    );
}

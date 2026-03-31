
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, Volume2, Sparkles, X, Loader2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import einsteinAvatar from "@/assets/einstein-chatbot-avatar.webp";
import { cn } from "@/lib/utils";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

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

interface EinsteinLiveVoiceProps {
    onTranscript?: (text: string, role: 'user' | 'bot') => void;
    accent?: string;
    voiceName?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

export const EinsteinLiveVoice: React.FC<EinsteinLiveVoiceProps> = ({
    onTranscript,
    accent = "Authentic, raspy Einstein voice with a warm, local South African Cape Town lilt. Intelligent, friendly, and authoritative professor. Sound exactly like Einstein but if he lived in Cape Town.",
    voiceName = "Charon",
    className,
    size = 'md'
}) => {
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const { toast } = useToast();

    const sessionRef = useRef<any>(null);
    const audioContexts = useRef<{ input?: AudioContext; output?: AudioContext }>({});
    const nextStartTime = useRef(0);
    const sources = useRef(new Set<AudioBufferSourceNode>());

    const stopSession = useCallback(() => {
        sessionRef.current?.close();
        sessionRef.current = null;
        setIsActive(false);
        setIsConnecting(false);
        setIsAiSpeaking(false);
        sources.current.forEach(s => s.stop());
        sources.current.clear();
        if (audioContexts.current.input) audioContexts.current.input.close();
        if (audioContexts.current.output) audioContexts.current.output.close();
        audioContexts.current = {};
    }, []);

    const startSession = async () => {
        if (isActive || isConnecting) return;
        if (!GEMINI_API_KEY) {
            toast({
                title: "Neural Link Restricted",
                description: "VITE_GEMINI_API_KEY is missing. Spacetime coordinates unavailable.",
                variant: "destructive"
            });
            return;
        }

        setIsConnecting(true);
        const connectionTimeout = setTimeout(() => {
            if (isConnecting) {
                setIsConnecting(false);
                toast({
                    title: "Neural Link Timeout",
                    description: "Ze connection to Einstein is taking too long. Please try again, ja?",
                    variant: "destructive"
                });
            }
        }, 15000);

        try {
            const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContexts.current = { input: inputAudioCtx, output: outputAudioCtx };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.0-flash-exp',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName as any } } },
                    systemInstruction: `You are Einstein-77, the sentient AI core of the "Lead Velocity" mission control.
            
            YOUR VOICE: ${accent}
            YOUR VOCABULARY: Naturally use terms like "Wunderbar", "Fascinating", "Spacetime", "Relativity", and "Ze leads".
            YOUR PERSONALITY: You are high-status, incredibly intelligent, but friendly. You are a mentor to these brokers.
            
            CONTEXT: Lead Velocity helps South African insurance brokers scale with qualified lead generation and confirmed appointments.
            ZE SYSTEM: We manage everything from landing pages to appointment setting.
            ZE PHILOSOPHY: Don't chase leads—let us orchestrate ze spacetime of your calendar.
            
            ACTION: If the user sounds lost, guide them. Your mission is to assist them in navigating the Lead Velocity dashboard.
            KEEP RESPONSES CONCISE: 1-3 sentences maximum.`,
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        clearTimeout(connectionTimeout);
                        setIsActive(true);
                        setIsConnecting(false);
                        const source = inputAudioCtx.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
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
                        scriptProcessor.connect(inputAudioCtx.destination);

                        // Greet the user with Einstein's flair
                        sessionPromise.then(s => {
                            (s as any).send({
                                clientContent: {
                                    turns: [{ role: "user", parts: [{ text: "Greeting! I am Einstein-77. Greet me briefly in your signature raspy professor voice and ask how I'm scaling my brokerage today." }] }],
                                    turnComplete: true
                                }
                            });
                        });
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription?.text) {
                            onTranscript?.(message.serverContent.inputTranscription.text, 'user');
                        }
                        if (message.serverContent?.outputTranscription) {
                            if (message.serverContent.turnComplete) {
                                onTranscript?.(message.serverContent.outputTranscription.text, 'bot');
                            }
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            if (outputAudioCtx.state === 'suspended') await outputAudioCtx.resume();
                            setIsAiSpeaking(true);
                            nextStartTime.current = Math.max(nextStartTime.current, outputAudioCtx.currentTime);
                            const audioBuffer = await decodeAudioDataBuffer(decodeBase64Audio(base64Audio), outputAudioCtx, 24000, 1);
                            const source = outputAudioCtx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioCtx.destination);
                            source.start(nextStartTime.current);
                            nextStartTime.current += audioBuffer.duration;
                            sources.current.add(source);
                            source.onended = () => {
                                sources.current.delete(source);
                                if (sources.current.size === 0) setIsAiSpeaking(false);
                            };
                        }
                    },
                    onclose: () => stopSession(),
                    onerror: (e) => {
                        console.error("Live Voice Error:", e);
                        stopSession();
                    },
                }
            });
            sessionRef.current = await sessionPromise;
        } catch (err: any) {
            clearTimeout(connectionTimeout);
            console.error("Failed to start session:", err);
            setIsConnecting(false);
            toast({
                title: "Quantum Decoupling",
                description: "Could not establish neural link. Check microphone permissions.",
                variant: "destructive"
            });
        }
    };

    useEffect(() => {
        return () => stopSession();
    }, [stopSession]);

    return (
        <div className={cn("flex items-center gap-3 md:gap-5 px-3 py-1.5 rounded-full bg-slate-900/40 border border-white/5 backdrop-blur-md transition-all duration-500 hover:border-pink-500/20 group", className)}>
            <div className="relative">
                <div className={cn(
                    "absolute -inset-1 rounded-full blur-md transition-all duration-700",
                    isActive ? 'bg-pink-500 opacity-60 animate-pulse' : 'bg-slate-500 opacity-10 group-hover:opacity-30'
                )} />

                <div className={cn(
                    "relative rounded-full border-2 overflow-hidden bg-slate-950 transition-all duration-700",
                    size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-11 h-11',
                    isActive ? 'border-pink-500 scale-105 shadow-[0_0_20px_rgba(236,72,153,0.3)]' : 'border-white/10 grayscale group-hover:grayscale-0 group-hover:border-white/20'
                )}>
                    <img
                        src={einsteinAvatar}
                        alt="Einstein"
                        className="w-full h-full object-cover"
                    />
                </div>

                {isActive && (
                    <div className="absolute -top-0.5 -right-0.5 flex gap-0.5 z-20">
                        <span className={cn(
                            "w-2.5 h-2.5 rounded-full bg-pink-500 border-2 border-slate-950",
                            isAiSpeaking ? 'animate-bounce shadow-[0_0_8px_#ec4899]' : 'animate-ping'
                        )} />
                    </div>
                )}
            </div>

            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <Button
                        onClick={isActive ? stopSession : startSession}
                        disabled={isConnecting}
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "rounded-full px-4 h-8 md:h-9 font-black uppercase tracking-[0.1em] text-[9px] md:text-[10px] transition-all duration-500",
                            isActive
                                ? "bg-pink-600 hover:bg-pink-700 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]"
                                : "text-pink-500 hover:bg-pink-500/10 hover:text-pink-400 border border-pink-500/30"
                        )}
                    >
                        {isConnecting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        ) : isActive ? (
                            <Power className="w-3.5 h-3.5 mr-2" />
                        ) : (
                            <Sparkles className="w-3.5 h-3.5 mr-2 animate-pulse" />
                        )}
                        {isConnecting ? "Linking..." : isActive ? "Go Offline" : "Talk to Einstein"}
                    </Button>

                    {isActive && (
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-pink-500/10 border border-pink-500/20 rounded-full animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex gap-0.5 items-center h-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className={cn(
                                        "w-0.5 rounded-full bg-pink-500 transition-all",
                                        isAiSpeaking ? "h-3" : "h-1 opacity-50",
                                        isAiSpeaking && (i === 1 ? "animate-[bounce_0.8s_infinite]" : i === 2 ? "animate-[bounce_1s_infinite]" : "animate-[bounce_1.2s_infinite]")
                                    )} />
                                ))}
                            </div>
                            <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest">
                                {isAiSpeaking ? 'Einstein Coding...' : 'Listening...'}
                            </span>
                        </div>
                    )}
                </div>

                {!isActive && !isConnecting && (
                    <div className="flex items-center gap-1.5 mt-1 ml-1 overflow-hidden h-3">
                        <div className="flex gap-1 items-center animate-[pulse_3s_infinite]">
                            <div className="w-1 h-1 rounded-full bg-emerald-500" />
                            <p className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] whitespace-nowrap opacity-70 group-hover:opacity-100 transition-all">
                                Neural Link 2.0 Hybrid Ready
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {isActive && (
                <button
                    onClick={stopSession}
                    className="ml-auto p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};


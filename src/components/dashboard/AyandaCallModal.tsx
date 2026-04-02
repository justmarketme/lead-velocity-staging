import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UltravoxSession, UltravoxSessionStatus } from "ultravox-client";
import { supabase } from "@/integrations/supabase/client";
import { Bot, PhoneOff, Loader2, Mic, AudioLines, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AyandaCallModalProps {
    isOpen: boolean;
    onClose: () => void;
    lead: {
        id: string | number;
        name: string;
        company?: string;
        role?: string;
        phone?: string;
    } | null;
    brokerId?: string | null;
}

export function AyandaCallModal({ isOpen, onClose, lead, brokerId }: AyandaCallModalProps) {
    const [status, setStatus] = useState<string>("Initializing Ayanda...");
    const [isConnecting, setIsConnecting] = useState(true);
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
    const [duration, setDuration] = useState(0);
    const uvSessionRef = useRef<UltravoxSession | null>(null);

    useEffect(() => {
        let timer: any;
        if (isOpen && !isConnecting) {
            timer = setInterval(() => setDuration(d => d + 1), 1000);
        }
        return () => clearInterval(timer);
    }, [isOpen, isConnecting]);

    const formatDuration = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startCall = async () => {
        setIsConnecting(true);
        setStatus("Bridging Neural Link...");
        try {
            const { data, error } = await supabase.functions.invoke('create-ayanda-call', {
                body: { leadId: lead?.id, brokerId }
            });

            if (error) throw error;

            setIsConnecting(false);
            setStatus(data?.phoneDialed ? `Dialing ${lead?.phone || 'lead'}...` : "Call Session Active");

        } catch (err: any) {
            console.error(err);
            setStatus("Neural Bridge Failed");
            setTimeout(onClose, 3000);
        }
    };

    useEffect(() => {
        if (isOpen) {
            startCall();
            setDuration(0);
        } else {
            // Cleanup on close 
            // In a real app we'd want to hang up the Twilio call via backend if disconnected prematurely.
        }
    }, [isOpen]);

    return (
        <div 
            className={cn(
                "fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm transition-all animate-in fade-in",
                !isOpen && "hidden"
            )}
        >
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 w-[400px] shadow-2xl relative overflow-hidden group">
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-[80px]" />
                
                <div className="flex flex-col items-center gap-6 relative z-10">
                    {/* Avatar Circle */}
                    <div className="relative">
                        <div className={cn(
                            "absolute -inset-4 rounded-full blur-xl transition-opacity animate-pulse",
                            isAgentSpeaking ? "bg-primary opacity-40" : "bg-emerald-500 opacity-20"
                        )} />
                        <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-white/10 flex items-center justify-center relative overflow-hidden">
                            {isConnecting ? (
                                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            ) : (
                                <Bot className={cn("h-12 w-12 transition-all", isAgentSpeaking ? "text-primary scale-110" : "text-emerald-500")} />
                            )}
                        </div>
                    </div>

                    <div className="text-center space-y-1">
                        <h3 className="text-xl font-bold tracking-tight flex items-center justify-center gap-2">
                            {isConnecting ? "Connecting..." : "Ayanda On Call"} 
                            {!isConnecting && <Sparkles className="h-4 w-4 text-primary" />}
                        </h3>
                        <p className="text-muted-foreground text-sm">Target: <span className="text-white font-medium">{lead?.name || "Target Entity"}</span></p>
                        {!isConnecting && <p className="text-primary font-mono text-sm pt-2">{formatDuration(duration)}</p>}
                    </div>

                    {/* Status Indicator */}
                    <div className="w-full bg-slate-950/50 rounded-2xl p-4 border border-white/5 space-y-3">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <span>Status</span>
                            <span className={cn(isConnecting ? "text-slate-500" : (isAgentSpeaking ? "text-primary" : "text-emerald-500"))}>
                                {status}
                            </span>
                        </div>
                        
                        {/* Visualizer bars */}
                        <div className="flex items-end justify-center gap-1.5 h-8">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                                <div 
                                    key={i} 
                                    className={cn(
                                        "w-1.5 rounded-full transition-all duration-300",
                                        isAgentSpeaking ? "bg-primary" : "bg-emerald-500/50",
                                        isConnecting ? "h-1 opacity-20" : (
                                            isAgentSpeaking 
                                                ? (i % 2 === 0 ? "h-8 animate-bounce" : "h-4 animate-bounce [animation-delay:0.1s]")
                                                : "h-2 animate-pulse"
                                        )
                                    )} 
                                />
                            ))}
                        </div>
                    </div>

                    <Button 
                        variant="destructive" 
                        className="w-full rounded-2xl h-12 gap-2 shadow-lg shadow-rose-900/20"
                        onClick={onClose}
                    >
                        <PhoneOff className="h-5 w-5" />
                        End Session
                    </Button>

                    <p className="text-[8px] text-center text-slate-500 uppercase tracking-widest font-mono">
                        Ayanda AI Voice Caller · Thornton/Sandton Accent · 11KB Persona Lock
                    </p>
                </div>
            </div>
        </div>
    );
}

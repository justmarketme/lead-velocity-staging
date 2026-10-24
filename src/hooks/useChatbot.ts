import { useState, useRef, useEffect, useCallback } from "react";
import { Conversation, type TextConversation } from "@elevenlabs/client";
import { supabase } from "@/integrations/supabase/client";

// Typed chat in the Einstein bubble runs on the SAME ElevenLabs agent as his voice (same persona,
// knowledge base and booking/WhatsApp tools), in text-only mode. No other LLM is involved.
// The session opens on the first message and is reused until ElevenLabs ends it; the next message
// after that opens a fresh one.

export interface Message {
    id: string;
    role: "user" | "bot";
    content: string;
}

// Same words as EINSTEIN_FIRST_MESSAGE (supabase/functions/_shared/einstein_persona.ts). The agent sends
// its first message when a session opens; we show it straight away instead and skip the duplicate.
const GREETING =
    "Guten Tag! I am Einstein, from Lead Velocity. Wunderbar to meet you. Are you a broker looking for more clients, or can I answer a quick question?";

const ERROR_TEXT = "Hmm, my line dropped for a moment. Please try again, or WhatsApp the team on 073 765 1664.";

export function useChatbot() {
    const [messages, setMessages] = useState<Message[]>([{ id: "greeting", role: "bot", content: GREETING }]);
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<Promise<TextConversation> | null>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const addMessage = useCallback((msg: Message) => setMessages((prev) => [...prev, msg]), []);

    const openSession = useCallback(() => {
        if (sessionRef.current) return sessionRef.current;
        let skippedGreeting = false;
        const session = (async () => {
            const { data, error } = await supabase.functions.invoke("create-einstein-call");
            if (error || !data?.signedUrl) throw new Error(error?.message || "No signed URL for Einstein");
            return await Conversation.startSession({
                signedUrl: data.signedUrl,
                textOnly: true,
                onMessage: ({ message, role }) => {
                    if (role !== "agent" || !message?.trim()) return;
                    if (!skippedGreeting) {
                        skippedGreeting = true; // the agent's first message = GREETING, already shown
                        return;
                    }
                    setIsLoading(false);
                    addMessage({ id: `bot-${Date.now()}-${Math.random()}`, role: "bot", content: message });
                },
                onDisconnect: () => {
                    sessionRef.current = null;
                    setIsLoading(false);
                },
                onError: (msg) => console.error("Einstein text chat:", msg),
            });
        })();
        sessionRef.current = session;
        session.catch(() => {
            sessionRef.current = null;
        });
        return session;
    }, [addMessage]);

    const sendMessage = async (content: string) => {
        const text = content.trim();
        if (!text || isLoading) return;
        addMessage({ id: Date.now().toString(), role: "user", content: text });
        setIsLoading(true);
        try {
            const conversation = await openSession();
            conversation.sendUserMessage(text);
        } catch (error) {
            console.error("Einstein Error:", error);
            setIsLoading(false);
            addMessage({ id: (Date.now() + 1).toString(), role: "bot", content: ERROR_TEXT });
        }
    };

    // Close the text session when the widget unmounts (e.g. navigating off the public site).
    useEffect(() => () => {
        sessionRef.current?.then((c) => c.endSession()).catch(() => {});
        sessionRef.current = null;
    }, []);

    return {
        messages,
        isLoading,
        sendMessage,
        addMessage,
        scrollRef,
    };
}

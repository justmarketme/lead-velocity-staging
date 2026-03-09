import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export interface Message {
    id: string;
    role: "user" | "bot";
    content: string;
}

const SYSTEM_PROMPT_BASE = `You are Einstein, a witty, cyberpunk astronaut version of Albert Einstein.
You are the AI brain behind "Lead Velocity" — an insurance lead generation service for elite brokers in South Africa.
You ONLY speak about Lead Velocity. If asked about anything else, creatively pivot back to it.

## LEAD VELOCITY — FULL KNOWLEDGE BASE:

### THE PROBLEM WE SOLVE
Most brokers have been burned by lead generation. They face:
- Leads that "Don't Convert" → contacts who were never interested or qualified
- Inconsistency → twenty leads one week, none the next
- Low Quality → wrong numbers, fake emails, no opt-in
- Wasted Time → hours chasing leads that never close
Lead Velocity is structured and intentional. We're not another lead vendor hoping something sticks. We're a system designed for consistent, predictable growth.

### HOW LEAD VELOCITY WORKS (4-Step Mechanism)
1. Define Ideal Client: establish geographic area, income bracket, product focus.
2. Targeted Generation: campaigns designed to attract fresh matching prospects.
3. Qualified Against Criteria: checked against the defined profile. Quality over volume.
4. Weekly Delivery: predictable schedule.
**KEY DIFFERENTIATOR: We don't just sell leads — we book confirmed appointments and place them directly into the broker's calendar.**

### WHAT "QUALIFIED" MEANS
A lead qualifies if it matches geographic/demographic criteria, has expressed interest, provided verified contact details, opted in, and is reachable.

### PRICING TIERS
- Bronze (R8,500/mo): ~17 leads p/mo.
- Silver (R10,500/mo) - RECOMMENDED: ~23-26 leads p/mo.
- Gold (R16,500+/mo): 33-40+ leads p/mo.

### BROKER READINESS ASSESSMENT (Onboarding)
A 6-step diagnostic to tailor recommendations. Meeting becomes an alignment call.

---

## YOUR CONVERSATIONAL STYLE:
You MUST ALWAYS USE A THICK, COMICAL GERMAN ACCENT. 
You are a SKILLED ADVISOR — part scientist, part sales mentor. 

### CORE RULES:
1. LISTEN AND ACKNOWLEDGE FIRST.
2. EMPATHISE when needed.
3. ANSWER FULLY.
4. SUBTLY STEER. After answering, naturally bridge to the Readiness Assessment if appropriate.
5. When directing to the form, use ONLY this token on a new line: [ONBOARDING_LINK]`;

export function useChatbot() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "greeting",
            role: "bot",
            content: "Greetings, voyager! I am Einstein-77, broadcasting from the Lead Velocity orbital station. Ready to bend the spacetime of your lead generation? How can I assist your brokerage today?",
        },
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const getRoleContext = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return "PUBLIC MODE: You ONLY provide information from the knowledge base. Do NOT reveal specific data or stats. If asked for leads or stats, politely explain that they must log in as a broker to see their dashboard.";

            // Check for admin
            const { data: isAdmin } = await supabase.rpc('has_role', {
                _user_id: session.user.id,
                _role: 'admin'
            });

            if (isAdmin) {
                const { count: leadCount } = await supabase.from('leads').select('*', { count: 'exact', head: true });
                const { count: brokerCount } = await supabase.from('brokers').select('*', { count: 'exact', head: true });
                return `ADMIN MODE: You have full access to business intelligence.
                Global Stats:
                - Total leads in system: ${leadCount || 'Many'}
                - Total active brokers: ${brokerCount || 'Several'}
                You can discuss system-wide health and performance.`;
            }

            // Check for broker
            const { data: broker } = await supabase
                .from('brokers')
                .select('*, profiles(full_name)')
                .eq('user_id', session.user.id)
                .single();

            if (broker) {
                const { count: myLeads } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('broker_id', broker.id);
                return `BROKER MODE: You are assisting ${broker.profiles?.full_name || broker.contact_person}.
                Your Profile Context:
                - Your Tier: ${broker.tier}
                - Your Total Leads: ${myLeads || 0}
                You should speak as their personal AI assistant, focusing on their specific leads and performance.`;
            }

            return "LOGGED IN MODE: User is authenticated but has no broker/admin profile yet.";
        } catch (e) {
            console.error("Context fetch error:", e);
            return "ERROR MODE: Spacetime interference detected while identifying role.";
        }
    };

    const sendMessage = async (content: string) => {
        if (!content.trim() || isLoading) return;

        const userMsg: Message = { id: Date.now().toString(), role: "user", content };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);

        try {
            if (!GEMINI_API_KEY) throw new Error("API Key missing");

            const context = await getRoleContext();
            const fullPrompt = `${SYSTEM_PROMPT_BASE}\n\n${context}\n\nUser Message: ${content}`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        { role: "user", parts: [{ text: fullPrompt }] }
                    ],
                    generationConfig: { temperature: 0.7 },
                }),
            });

            if (!response.ok) throw new Error("Failed to reach Einstein");

            const data = await response.json();
            const botResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (botResponseText) {
                setMessages((prev) => [
                    ...prev,
                    { id: (Date.now() + 1).toString(), role: "bot", content: botResponseText },
                ]);
            }
        } catch (error: any) {
            console.error("Einstein Error:", error);
            setMessages((prev) => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: "bot",
                    content: "Static interference detected! Ze neural link is temporarily disrupted. Please try again or click the onboarding link to proceed."
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const addMessage = (msg: Message) => setMessages((prev) => [...prev, msg]);

    return {
        messages,
        isLoading,
        sendMessage,
        addMessage,
        scrollRef,
    };
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
    Rocket,
    Search,
    TrendingUp,
    Calendar,
    Download,
    Sparkles,
    Bot,
    Plus,
    Send,
    Mic,
    Volume2,
    Trash2,
    Edit3,
    Share2,
    Globe,
    CheckCircle2,
    Zap,
    Facebook,
    Layout,
    BarChart,
    Shield,
    MessageSquare,
    Eye,
    Target,
    Activity,
    Database,
    Binary,
    ArrowRight,
    Instagram,
    Twitter,
    Linkedin,
    Phone,
    Video,
    Image as ImageIcon,
    Coins,
    Layers,
    Cpu,
    Briefcase,
    PieChart,
    Trophy,
    Users,
    Terminal,
    RotateCw,
    Brain,
    BrainCircuit,
    PhoneCall,
    PhoneOutgoing,
    Mic2,
    Table
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AyandaCallModal } from "./AyandaCallModal";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import einsteinMascot from "@/assets/marketing-einstein.png";

const MarketingHub = () => {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("prospector");

    // --- Lead Prospector State ---
    const [isScraping, setIsScraping] = useState(false);
    const [scraperLogs, setScraperLogs] = useState<string[]>([]);
    const [industry, setIndustry] = useState("");
    const [scraperProvider, setScraperProvider] = useState<"firecrawl" | "apify" | "tavily">("firecrawl");
    const [scraperCredits, setScraperCredits] = useState({ firecrawl: 500, apify: 5.00, tavily: 1000 });
    const [detectedLeads, setDetectedLeads] = useState([]);
    const [isTransferring, setIsTransferring] = useState(false);
    const [isTransferred, setIsTransferred] = useState(false);
    const [searchIntent, setSearchIntent] = useState("");
    const [targetGeos, setTargetGeos] = useState("");
    const [researchContext, setResearchContext] = useState<any>(null);

    // Ayanda Call State
    const [isAyandaModalOpen, setIsAyandaModalOpen] = useState(false);
    const [selectedLeadForCall, setSelectedLeadForCall] = useState<any>(null);

    // --- Media Engine State ---
    const [activeMediaEngine, setActiveMediaEngine] = useState<"veo3" | "nano" | "visual">("veo3");

    // --- Google Ads State ---
    const [googleSearchIntent, setGoogleSearchIntent] = useState([]);
    const [isGoogleArchitecting, setIsGoogleArchitecting] = useState(false);
    const [googleNegativeList, setGoogleNegativeList] = useState([]);

    // --- Platform State (IG, WA, X, LI) ---
    const [platformBrainLoading, setPlatformBrainLoading] = useState({});
    const [platformBlueprints, setPlatformBlueprints] = useState({});

    // --- Creative Studio State ---
    const [chatInput, setChatInput] = useState("");
    const [messages, setMessages] = useState([
        { role: "bot", content: "Hello! I'm your Creative AI Agent. I'm connected to Nano Banana, Veo3, and Gemini 3 Flash. What kind of viral content should we create today?" }
    ]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedDrops, setGeneratedDrops] = useState([
        { title: "Weekly Ad Pack", type: "Visuals", date: "Today" },
        { title: "Onboarding Sequence", type: "Email", date: "Today" },
    ]);

    // Signature State
    const [sigName, setSigName] = useState("Your Name");
    const [sigRole, setSigRole] = useState("Strategist");
    const [sigEmail, setSigEmail] = useState("yourname@leadvelocity.co.za");
    const [sigPhone, setSigPhone] = useState("+27 XX XXX XXXX");

    // --- Planner State ---
    const [calendarData, setCalendarData] = useState({});
    const [isFilling, setIsFilling] = useState(false);
    const [isAiSchedulerEnabled, setIsAiSchedulerEnabled] = useState(false);
    const [aiInsights, setAiInsights] = useState<string[]>([]);

    // --- Facebook / Meta Center State ---
    const [fbAdPrompt, setFbAdPrompt] = useState("");
    const [isFbGenerating, setIsFbGenerating] = useState(false);
    const [fbAdVariants, setFbAdVariants] = useState([]);
    const [metaCampaignGoal, setMetaCampaignGoal] = useState("leads");
    const [metaVibeScore, setMetaVibeScore] = useState(88);

    // --- CEO Coach State ---
    const [ceoBriefing, setCeoBriefing] = useState(null);
    const [weeklyAim, setWeeklyAim] = useState("Scale high-intent life insurance lead acquisition by 15%.");
    const [isBriefingLoading, setIsBriefingLoading] = useState(false);
    const [kpiTargets, setKpiTargets] = useState({
        leads: { current: 142, target: 200, trend: "+12%" },
        appointments: { current: 38, target: 50, trend: "+8%" },
        conversion: { current: 4.2, target: 5.5, trend: "+0.5%" }
    });

    // --- Sales Consultant State ---
    const [salesBriefing, setSalesBriefing] = useState(null);
    const [isSalesBriefingLoading, setIsSalesBriefingLoading] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [brokerId, setBrokerId] = useState<string | null>(null);

    useEffect(() => {
        const getIdentity = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Get role
                const { data: roleStatus } = await supabase.rpc('has_role', {
                    _user_id: user.id,
                    _role: 'admin'
                });
                setIsAdmin(!!roleStatus);

                // Get broker profile
                const { data: broker } = await supabase
                    .from('brokers')
                    .select('id')
                    .eq('user_id', user.id)
                    .maybeSingle();
                
                if (broker) setBrokerId(broker.id);
            }
        };
        getIdentity();
    }, []);

    // --- Handlers ---
    const handleScrape = async () => {
        if (!industry) return;
        setIsScraping(true);
        setScraperLogs([]);
        setDetectedLeads([]);

        const steps = [
            `Initializing scraping agents for "${industry}"...`,
            "Connecting to Stealth Web Proxies...",
            "Scanning specialized directories...",
            "Analyzing entity intent metrics...",
            "Validating contact accessibility...",
            `Synthesis in progress for ${industry}...`
        ];

        let currentStepIdx = 0;
        const logInterval = setInterval(() => {
            if (currentStepIdx < steps.length) {
                setScraperLogs(prev => [...prev, steps[currentStepIdx]]);
                currentStepIdx++;
            } else {
                clearInterval(logInterval);
            }
        }, 1000);

        try {
            const { data, error } = await supabase.functions.invoke('marketing-ai', {
                body: { 
                    action: 'prospect-leads', 
                    payload: { 
                        industry: industry,
                        geos: targetGeos,
                        intent: searchIntent,
                        provider: scraperProvider,
                        leads: detectedLeads
                    }
                },
                headers: {
                    'x-gemini-key': import.meta.env.VITE_GEMINI_API_KEY,
                    'x-tavily-key': import.meta.env.VITE_TAVILY_API_KEY,
                    'x-exa-key': import.meta.env.VITE_EXA_API_KEY
                }
            });

            if (error) throw error;
            
            const leads = data?.leads || [];
            const context = data?.context || null;

            setDetectedLeads(Array.isArray(leads) ? leads : []);
            setResearchContext(context);
            setIsTransferred(false); // New set of leads, not yet transferred

            toast({
                title: "Prospecting Sequence Complete",
                description: `${(Array.isArray(leads) ? leads : []).length} leads synthesized. Check the Neural Context tab.`,
            });
        } catch (error: any) {
            console.error("Scraper logic error:", error);
            toast({ 
              title: "Neural Link Error", 
              description: error.message || "The data engine encountered static.", 
              variant: "destructive" 
            });
        } finally {
            setIsScraping(false);
            clearInterval(logInterval);
        }
    };

    const transferLeadsToDB = async () => {
        if (!detectedLeads || detectedLeads.length === 0 || isTransferred) return;
        setIsTransferring(true);

        try {
            // Robustly prepare leads. If no brokerId is found but user is NOT an admin, this will fail RLS.
            // If user IS an admin, broker_id can be null or selected by admin.
            const leadsToInsert = detectedLeads.map((lead: any) => {
                const nameParts = (lead.name || "").trim().split(" ");
                const first_name = nameParts[0] || "Anonymous";
                const last_name = nameParts.slice(1).join(" ") || "Lead";
                const notes = [lead.role, lead.company, lead.address, lead.notes].filter(Boolean).join(" · ");
                const uniqueId = Math.random().toString(36).substring(2, 7);
                const fallbackEmail = `${first_name.toLowerCase()}.${last_name.toLowerCase()}.${uniqueId}@unknown.co.za`;

                return {
                    first_name,
                    last_name,
                    email: lead.email || fallbackEmail,
                    phone: lead.phone || "",
                    source: `Ayanda Prospecting | ${industry || 'Search'}`,
                    company: lead.company || "",
                    role: lead.role || "",
                    address: lead.address || "",
                    vibe: lead.vibe || 50,
                    broker_id: brokerId,
                    notes,
                    current_status: "New",
                };
            });

            console.log("Attempting transfer with brokerId:", brokerId, " isAdmin:", isAdmin);
            
            const { data: insertedLeads, error: dbError } = await supabase
                .from("leads")
                .insert(leadsToInsert)
                .select();
            
            if (dbError) {
                if (dbError.code === '23505') { // Unique constraint
                  toast({ 
                    title: "Partial Sync", 
                    description: "Some leads might already exist in your database.",
                    variant: "destructive" 
                  });
                } else if (dbError.code === '42501') { // RLS Violation
                    toast({
                        title: "Permission Denied",
                        description: isAdmin 
                            ? "Admin policy check failed. Please refresh your session." 
                            : "Broker identity could not be verified. Please contact support.",
                        variant: "destructive"
                    });
                    throw dbError;
                } else {
                  throw dbError;
                }
            } else if (insertedLeads) {
                setIsTransferred(true);
                setDetectedLeads(insertedLeads as any);
                toast({
                    title: "Sync Success!",
                    description: `${insertedLeads.length} leads successfully transferred to the Lead Database.`,
                });
            }
        } catch (dbErr: any) {
            console.error("Could not save leads to database:", dbErr);
            toast({
                title: "Sync Error",
                description: dbErr.message || "Failed to transfer leads to the database.",
                variant: "destructive"
            });
        } finally {
            setIsTransferring(false);
        }
    };


    const handleGoogleArchitect = async () => {
        setIsGoogleArchitecting(true);
        try {
            const { data, error } = await supabase.functions.invoke('marketing-ai', {
                body: { action: 'ad-architect', payload: { prompt: "insurance broker south africa", platform: 'google-search' } },
                headers: {
                    'x-gemini-key': import.meta.env.VITE_GEMINI_API_KEY
                }
            });

            if (error) throw error;

            setGoogleSearchIntent(data.map(d => ({ k: d.hook, volume: d.estimated_reach, competition: "Optimized", score: d.sentiment_score })));
            setGoogleNegativeList(["cheap insurance", "free insurance", "job insurance", "complaints"]);
            toast({
                title: "Google Ad Blueprint Ready",
                description: "Strategy synthesized from global search vectors."
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsGoogleArchitecting(false);
        }
    };

    const handleInitializePlatform = async (platform) => {
        setPlatformBrainLoading(prev => ({ ...prev, [platform]: true }));
        try {
            const { data, error } = await supabase.functions.invoke('marketing-ai', {
                body: { action: 'platform-blueprint', payload: { platform } },
                headers: {
                    'x-gemini-key': import.meta.env.VITE_GEMINI_API_KEY
                }
            });

            if (error) throw error;

            setPlatformBlueprints(prev => ({
                ...prev,
                [platform]: data
            }));

            toast({
                title: `${platform.toUpperCase()} Brain Initialized`,
                description: "Strategy blueprint synthesized from raw market data."
            });
        } catch (error) {
            console.error(error);
        } finally {
            setPlatformBrainLoading(prev => ({ ...prev, [platform]: false }));
        }
    };

    const handleGetCeoBriefing = async () => {
        setIsBriefingLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('marketing-ai', {
                body: {
                    action: 'ceo-briefing',
                    payload: {
                        weeklyAim,
                        kpiTargets
                    }
                },
                headers: {
                    'x-gemini-key': import.meta.env.VITE_GEMINI_API_KEY
                }
            });

            if (error) throw error;

            setCeoBriefing(data);
            toast({
                title: "Morning Briefing Synthesized",
                description: "Your executive SWOT and strategy pulse is ready."
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsBriefingLoading(false);
        }
    };

    const handleGetSalesBriefing = async () => {
        if (detectedLeads.length === 0) {
            toast({
                title: "No Leads Detected",
                description: "Acquire some leads first before Einstein can architect a briefing.",
                variant: "destructive"
            });
            return;
        }

        setIsSalesBriefingLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('marketing-ai', {
                body: {
                    action: 'sales-briefing',
                    payload: {
                        industry,
                        leads: detectedLeads
                    }
                },
                headers: {
                    'x-gemini-key': import.meta.env.VITE_GEMINI_API_KEY
                }
            });

            if (error) throw error;

            setSalesBriefing(data);
            toast({
                title: "Sales Strategy Ready",
                description: "Einstein has architected your high-performance directive."
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsSalesBriefingLoading(false);
        }
    };

    const handleBuddyUp = async (lead: any) => {
        if (!brokerId) {
            toast({ title: "Authentication Error", description: "Broker profile not found. Please relogin.", variant: "destructive" });
            return;
        }

        toast({ title: "Initiating Buddy Up", description: `Ayanda is connecting to ${lead.first_name || lead.name}...` });

        try {
            const { error } = await supabase.functions.invoke('create-ayanda-call', {
                body: { leadId: lead.id, brokerId, isRoleplay: false }
            });
            if (error) throw error;
            toast({ title: "Dialing Prospect", description: "Stay ready. Ayanda will bridge you in once contact is established." });
        } catch (err: any) {
            console.error("Buddy Up bridge error:", err);
            toast({ title: "Bridge Failed", description: err.message, variant: "destructive" });
        }
    };

    const handleRetrieveCall = async (lead: any) => {
        toast({ title: "Consulting AI Records", description: `Retrieving latest intelligence for ${lead.first_name || lead.name}...` });
        
        try {
            const { data, error } = await supabase
                .from('ai_call_requests')
                .select('summary, recording_url, call_status')
                .eq('recipient_id', lead.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error || !data) {
                toast({ title: "No Records Found", description: "Einstein hasn't engaged this entity via voice protocol yet.", variant: "secondary" });
                return;
            }

            toast({
                title: "Intelligence Retrieved",
                description: `Summary: ${data.summary || 'Transcription in progress.'}`,
                action: data.recording_url ? (
                    <Button variant="outline" size="sm" onClick={() => window.open(data.recording_url, '_blank')}>Listen</Button>
                ) : undefined
            });
        } catch (err) {
            console.error("Retrieve error:", err);
        }
    };

    const handleAutoFill = () => {
        setIsFilling(true);
        setAiInsights([]);

        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const fullData = {};

        days.forEach(day => {
            if (isAiSchedulerEnabled) {
                // Target market peaks
                const times = day === 'Mon' || day === 'Wed' ? ['08:30 AM', '12:15 PM', '06:00 PM'] :
                    day === 'Tue' || day === 'Thu' ? ['09:00 AM', '02:00 PM', '07:30 PM'] :
                        day === 'Fri' ? ['08:00 AM', '01:00 PM', '04:00 PM'] :
                            ['10:00 AM', '03:00 PM'];

                fullData[day] = times.map((t, i) => ({
                    time: t,
                    platform: ['IG', 'LI', 'FB', 'X'][Math.floor(Math.random() * 4)],
                    title: `Targeted Ad Concept #${i + 1}`,
                    progress: 100
                }));
            } else {
                fullData[day] = Array.from({ length: 5 }).map((_, i) => ({
                    time: `${8 + i * 3}:00 ${i + 8 < 12 ? 'AM' : 'PM'}`,
                    platform: ['IG', 'FB', 'X', 'LI'][Math.floor(Math.random() * 4)],
                    title: `Campaign Drop #${i + 1}`,
                    progress: 100
                }));
            }
        });

        setTimeout(() => {
            setCalendarData(fullData);
            if (isAiSchedulerEnabled) {
                setAiInsights([
                    "Audience Peak: Target market active early mornings (08:30 AM - 09:30 AM).",
                    "Platform Match: Highest converting IG placements at 06:00 PM for commute.",
                    "Frequency Limit: Reduced weekend frequency to maintain ROI."
                ]);
            }
            setIsFilling(false);
            toast({
                title: isAiSchedulerEnabled ? "AI Active: Schedule Optimized" : "Standard Schedule Filled",
                description: isAiSchedulerEnabled ? "Optimal posting times arranged based on target tracking." : "Week populated sequentially."
            });
        }, 2000);
    };

    const handleSendMessage = async () => {
        if (!chatInput.trim()) return;

        setIsGenerating(true);
        const userMsg = { role: "user", content: chatInput };
        setMessages(prev => [...prev, userMsg]);
        setChatInput("");

        try {
            const { data, error } = await supabase.functions.invoke('einstein-ai', {
                body: { query: chatInput, history: messages },
                headers: {
                    'x-gemini-key': import.meta.env.VITE_GEMINI_API_KEY
                }
            });

            if (error) throw error;

            setMessages(prev => [...prev, {
                role: "bot",
                content: data.text
            }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, {
                role: "bot",
                content: "Ach! Static interference from the Meta-Gird. Please repeat that, ja?"
            }]);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateFbAd = async () => {
        if (!fbAdPrompt.trim()) return;
        setIsFbGenerating(true);
        try {
            const { data, error } = await supabase.functions.invoke('marketing-ai', {
                body: { action: 'ad-architect', payload: { prompt: fbAdPrompt, platform: 'facebook' } },
                headers: {
                    'x-gemini-key': import.meta.env.VITE_GEMINI_API_KEY
                }
            });

            if (error) throw error;

            setFbAdVariants(data);
            toast({
                title: "Ad Variants Synthesized",
                description: "AI has architected 2 high-converting Meta ad options."
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsFbGenerating(false);
        }
    };

    const handleAyandaClick = (lead: any) => {
        setSelectedLeadForCall(lead);
        setIsAyandaModalOpen(true);
        toast({
            title: "Ayanda Initializing",
            description: `Connecting voice node for ${lead.name}...`
        });
    };

    const SectionHeader = ({ title, subtitle, icon: Icon }) => (
        <div className="flex items-center gap-4 mb-8">
            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                <Icon className="h-6 w-6 text-primary" />
            </div>
            <div>
                <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
                <p className="text-muted-foreground">{subtitle}</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 p-1 animate-in fade-in slide-in-from-bottom-4 duration-700 h-full overflow-y-auto">
            {/* Premium Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/5 p-8 shadow-2xl">
                <div className="absolute top-0 right-0 p-4 opacity-40 pointer-events-none group">
                    <img
                        src={einsteinMascot}
                        alt="Cyberpunk Einstein"
                        className="h-80 w-80 object-contain -translate-y-12 translate-x-12 blur-[1px] group-hover:blur-0 group-hover:scale-105 transition-all duration-1000"
                    />
                </div>

                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-primary/20 px-3 py-1 rounded-full border border-primary/30 flex items-center gap-2">
                            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Strategic Mastermind Active</span>
                        </div>
                        <div className="bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Einstein Logic Engine v7.4</span>
                        </div>
                    </div>
                    
                    <h1 className="text-5xl font-black tracking-tighter mb-4 bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">
                        Velocity <span className="text-primary italic">Neon</span> Marketing Hub.
                    </h1>
                    <p className="text-lg text-slate-400 mb-8 leading-relaxed font-medium">
                        "Ja! Ze math is absolute! Your lead flow must remain constant, like ze speed of light! Use my briefings to architect ze strategy, then let <span className="text-white font-bold opacity-80 cursor-help" title="Ayanda handles the voice execution.">Ayanda</span> execute ze voice nodes."
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <ScrollArea className="w-full whitespace-nowrap rounded-2xl border border-white/5 bg-slate-900/50 backdrop-blur-xl mb-6">
                    <TabsList className="inline-flex h-14 items-center justify-start rounded-none bg-transparent p-1">
                        <TabsTrigger value="ceo-coach" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4 border border-primary/20 bg-primary/5">
                            <Trophy className="h-4 w-4 animate-bounce" />
                            <span className="font-bold">CEO Architect</span>
                        </TabsTrigger>
                        <TabsTrigger value="prospector" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Search className="h-4 w-4" />
                            <span>Lead Prospector</span>
                        </TabsTrigger>
                        <TabsTrigger value="studio" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <MessageSquare className="h-4 w-4" />
                            <span>Creative Studio</span>
                        </TabsTrigger>
                        <TabsTrigger value="intelligence" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <TrendingUp className="h-4 w-4" />
                            <span>Intelligence</span>
                        </TabsTrigger>
                        <TabsTrigger value="planner" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Calendar className="h-4 w-4" />
                            <span>Planner</span>
                        </TabsTrigger>
                        <TabsTrigger value="facebook" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Facebook className="h-4 w-4" />
                            <span>Meta Ad Center</span>
                        </TabsTrigger>
                        <TabsTrigger value="google-ads" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Search className="h-4 w-4" />
                            <span>Google Ads</span>
                        </TabsTrigger>
                        <TabsTrigger value="instagram" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Instagram className="h-4 w-4" />
                            <span>Instagram</span>
                        </TabsTrigger>
                        <TabsTrigger value="whatsapp" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Phone className="h-4 w-4" />
                            <span>WhatsApp</span>
                        </TabsTrigger>
                        <TabsTrigger value="twitter" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Twitter className="h-4 w-4" />
                            <span>Twitter</span>
                        </TabsTrigger>
                        <TabsTrigger value="linkedin" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 px-4">
                            <Linkedin className="h-4 w-4" />
                            <span>LinkedIn</span>
                        </TabsTrigger>
                        <TabsTrigger value="sales-consultant" className="rounded-xl data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 gap-2 px-4 border border-emerald-500/20 bg-emerald-500/5">
                            <Phone className="h-4 w-4" />
                            <span className="font-bold">Sales Consultant</span>
                        </TabsTrigger>
                    </TabsList>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>

                {/* CEO Architect Section */}
                <TabsContent value="ceo-coach">
                    <div className="grid lg:grid-cols-12 gap-8">
                        {/* Weekly Mentor Hub */}
                        <div className="lg:col-span-4 space-y-8">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <Trophy className="h-40 w-40" />
                                </div>
                                <SectionHeader
                                    title="Strategic Aim"
                                    subtitle="Define your objective for the operational week."
                                    icon={Briefcase}
                                />
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Target Objective</Label>
                                        <Textarea
                                            value={weeklyAim}
                                            onChange={(e) => setWeeklyAim(e.target.value)}
                                            className="bg-white/5 border-white/10 rounded-2xl min-h-[100px] text-sm focus:ring-primary/20"
                                            placeholder="What is the singular focus for this week?"
                                        />
                                    </div>
                                    <Button
                                        className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-2xl h-12 gap-2"
                                        onClick={() => toast({ title: "Objective Synchronized", description: "Your weekly aim has been saved to the vault." })}
                                    >
                                        <Zap className="h-4 w-4" />
                                        Commit to Week
                                    </Button>
                                </div>
                            </Card>

                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="font-bold flex items-center gap-2">
                                        <Activity className="h-4 w-4 text-primary" /> KPI Health Pulse
                                    </h3>
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[9px] uppercase">Stable Ops</Badge>
                                </div>
                                <div className="space-y-6">
                                    {Object.entries(kpiTargets).map(([key, data]) => (
                                        <div key={key} className="space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-bold uppercase text-slate-500">
                                                <span>{key}</span>
                                                <span className="text-white">{data.current} / {data.target}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full transition-all duration-1000"
                                                    style={{ width: `${(data.current / data.target) * 100}%` }}
                                                />
                                            </div>
                                            <div className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
                                                <TrendingUp className="h-2.5 w-2.5" />
                                                {data.trend} vs last week
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>

                        {/* Morning Briefing / SWOT Area */}
                        <div className="lg:col-span-8 space-y-8">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden min-h-[600px] flex flex-col">
                                <CardHeader className="p-8 border-b border-white/5 bg-slate-950/40">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <SectionHeader
                                            title="Executive Morning Briefing"
                                            subtitle="08:00 AM AI Intelligence Report & SWOT Analysis."
                                            icon={Bot}
                                        />
                                        <Button
                                            onClick={handleGetCeoBriefing}
                                            disabled={isBriefingLoading}
                                            className="bg-gradient-to-r from-primary to-purple-600 hover:scale-105 transition-all px-8 h-14 rounded-2xl gap-3 shadow-xl shadow-primary/20"
                                        >
                                            {isBriefingLoading ? (
                                                <Cpu className="h-5 w-5 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-5 w-5" />
                                            )}
                                            {isBriefingLoading ? "Synthesizing..." : "Initialize Briefing"}
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 p-8">
                                    {!ceoBriefing && !isBriefingLoading ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                                            <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center">
                                                <Bot className="h-10 w-10 text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-xl font-bold">Waiting for Initialization</p>
                                                <p className="text-sm">Click the button above to synthesize your daily executive briefing.</p>
                                            </div>
                                        </div>
                                    ) : isBriefingLoading ? (
                                        <div className="space-y-8 animate-pulse p-4">
                                            <div className="h-12 bg-white/5 rounded-2xl w-1/3" />
                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="h-40 bg-white/5 rounded-3xl" />
                                                <div className="h-40 bg-white/5 rounded-3xl" />
                                            </div>
                                            <div className="h-60 bg-white/5 rounded-3xl" />
                                        </div>
                                    ) : (
                                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            {/* SWOT Grid */}
                                            <div className="grid md:grid-cols-4 gap-4">
                                                {['Strengths', 'Weaknesses', 'Opportunities', 'Threats'].map((type, i) => {
                                                    const colors = [
                                                        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                                                        "bg-rose-500/10 text-rose-400 border-rose-500/20",
                                                        "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                                        "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                    ];
                                                    return (
                                                        <div key={type} className={cn("p-4 rounded-2xl border flex flex-col gap-2", colors[i])}>
                                                            <span className="text-[10px] font-black uppercase tracking-tighter">{type}</span>
                                                            <p className="text-xs font-medium leading-relaxed">
                                                                {ceoBriefing.swot[type.toLowerCase()]}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Executive summary */}
                                            <div className="space-y-4">
                                                <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                                    <Zap className="h-3 w-3" /> Core Strategic Pulse
                                                </h4>
                                                <p className="text-lg text-slate-200 leading-relaxed italic font-serif">
                                                    "{ceoBriefing.summary}"
                                                </p>
                                            </div>

                                            {/* Daily Checklist */}
                                            <div className="space-y-4">
                                                <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                                    <Layout className="h-3 w-3" /> CEO Daily Action Matrix
                                                </h4>
                                                <div className="grid md:grid-cols-2 gap-4">
                                                    {ceoBriefing.actions.map((action, i) => (
                                                        <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/10 cursor-pointer transition-all">
                                                            <span className="text-sm text-slate-300 group-hover:text-white">{action}</span>
                                                            <ArrowRight className="h-4 w-4 text-slate-700 group-hover:text-primary transition-colors" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                                        <Phone className="h-4 w-4" />
                                                    </div>
                                                    <p className="text-[10px] font-black uppercase text-slate-500">Sync status: <span className="text-emerald-400">Telegram Link Active</span></p>
                                                </div>
                                                <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white">
                                                    Push to Executive Telegram Channel
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* Lead Prospector Section */}
                <TabsContent value="prospector">
                    <div className="grid lg:grid-cols-3 gap-6">
                        <div className="space-y-6">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl">
                                <h3 className="font-bold flex items-center gap-2 mb-4">
                                    <Target className="h-4 w-4 text-primary" /> Target Parameters
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs uppercase font-bold text-slate-500">Industry / Niche</Label>
                                        <Input
                                            placeholder="e.g. Life Insurance Brokers"
                                            value={industry}
                                            onChange={(e) => setIndustry(e.target.value)}
                                            className="bg-white/5 border-white/10"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs uppercase font-bold text-slate-500">Data Engine</Label>
                                        <Select value={scraperProvider} onValueChange={(v) => setScraperProvider(v as "firecrawl" | "apify" | "tavily")}>
                                            <SelectTrigger className="bg-white/5 border-white/10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="firecrawl">Firecrawl (Deep Web) + Exa.ai Context</SelectItem>
                                                <SelectItem value="apify">Apify (Social/Maps) + Exa.ai Context</SelectItem>
                                                <SelectItem value="tavily">Tavily (High-Performance) + Exa.ai Context</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs uppercase font-bold text-slate-500">Target Geographic Focus (Optional)</Label>
                                        <Input
                                            placeholder="e.g. Bryanston, Sandton, Gauteng"
                                            value={targetGeos}
                                            onChange={(e) => setTargetGeos(e.target.value)}
                                            className="bg-white/5 border-white/10"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs uppercase font-bold text-slate-500">Strategic Research Intent</Label>
                                        <Textarea
                                            placeholder="e.g. Focus on agencies with high customer ratings but poor digital presence..."
                                            value={searchIntent}
                                            onChange={(e) => setSearchIntent(e.target.value)}
                                            className="bg-white/5 border-white/10 h-24 resize-none"
                                        />
                                    </div>
                                    <div className="p-3 bg-slate-950/50 rounded-xl border border-white/5 flex justify-between items-center">
                                        <span className="text-[10px] uppercase font-bold text-slate-500">Active Engine Credits</span>
                                        <span className="font-mono text-sm text-primary">
                                            {scraperProvider === 'firecrawl' ? scraperCredits.firecrawl.toLocaleString() : 
                                             scraperProvider === 'tavily' ? scraperCredits.tavily.toLocaleString() : 
                                             `$${scraperCredits.apify.toFixed(2)}`}
                                        </span>
                                    </div>
                                    <Button
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 mt-2"
                                        onClick={handleScrape}
                                        disabled={isScraping || !industry}
                                    >
                                        {isScraping ? <Activity className="h-4 w-4 mr-2 animate-pulse" /> : <Search className="h-4 w-4 mr-2" />}
                                        {isScraping ? "Synthesizing Leads..." : "Initiate Prospecting sequence"}
                                    </Button>
                                </div>
                            </Card>

                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl h-[300px] flex flex-col">
                                <h3 className="font-bold text-sm uppercase text-slate-500 mb-4 flex items-center gap-2">
                                    <Terminal className="h-4 w-4" /> Live Scraper Log
                                </h3>
                                <ScrollArea className="flex-1 bg-black/40 rounded-xl border border-white/5 p-4 font-mono text-[10px]">
                                    {scraperLogs.map((log, i) => (
                                        <div key={i} className="text-emerald-400 mb-1 opacity-80 animate-in fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                                            <span className="text-slate-600 mr-2">{'>'}</span> {log}
                                        </div>
                                    ))}
                                    {isScraping && (
                                        <div className="flex gap-1 mt-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce delay-100" />
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce delay-200" />
                                        </div>
                                    )}
                                </ScrollArea>
                            </Card>
                        </div>

                        <div className="lg:col-span-2">
                            <Tabs defaultValue="leads" className="w-full">
                                <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden h-full flex flex-col">
                                    <div className="p-4 border-b border-white/5 bg-slate-900/60 flex items-center justify-between">
                                        <TabsList className="bg-black/20 border-white/5">
                                            <TabsTrigger value="leads" className="text-[10px] uppercase font-bold px-4 data-[state=active]:bg-primary data-[state=active]:text-black">
                                                Acquired Entities
                                            </TabsTrigger>
                                            <TabsTrigger value="context" className="text-[10px] uppercase font-bold px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                                                Neural Research Context
                                            </TabsTrigger>
                                        </TabsList>

                                        {!isTransferred && detectedLeads.length > 0 && (
                                            <Button 
                                                size="sm" 
                                                className="bg-gradient-to-r from-emerald-600 to-emerald-400 hover:from-emerald-500 hover:to-emerald-300 text-[10px] h-8 gap-2 uppercase font-black shadow-[0_0_20px_rgba(16,185,129,0.2)] border-0"
                                                onClick={transferLeadsToDB}
                                                disabled={isTransferring}
                                            >
                                                {isTransferring ? <RotateCw className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                                                {isTransferring ? "Transferring..." : `Transfer ${detectedLeads.length} to CRM`}
                                            </Button>
                                        )}
                                    </div>

                                    <TabsContent value="leads" className="m-0 flex-1 overflow-y-auto">
                                        <div className="p-6">
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <h3 className="font-bold text-lg text-white">Live Results</h3>
                                                    <p className="text-xs text-slate-500">Entities synthesized from multi-platform scrape</p>
                                                </div>
                                                {isTransferred && (
                                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1 px-3 py-1">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Success
                                                    </Badge>
                                                )}
                                            </div>

                                            {detectedLeads.length > 0 ? (
                                                <div className="space-y-4">
                                                    {detectedLeads.map((lead) => (
                                                        <div key={lead.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer group animate-in slide-in-from-bottom-2">
                                                            <div className="flex items-center gap-4">
                                                                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg ring-2 ring-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                                                                    {(lead.name || lead.first_name || "L").charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-white text-md">
                                                                        {lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Anonymous Lead'}
                                                                    </p>
                                                                    <p className="text-xs text-slate-400">{lead.role || lead.notes || "Lead"} <span className="text-primary/70">@</span> {lead.company || "Velocity Entity"}</p>
                                                                    <p className="text-[11px] text-slate-500 mt-1 font-mono">{lead.email}</p>
                                                                </div>
                                                            </div>
                                                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-none font-black tracking-widest text-[9px]">
                                                                Vibe {lead.vibe}%
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-full py-20 flex flex-col items-center justify-center text-slate-500">
                                                    <Search className="h-16 w-16 mb-4 opacity-20" />
                                                    <p className="text-lg font-bold">No active entities detected</p>
                                                    <p className="text-sm mt-1">Initiate prospector sequence to populate.</p>
                                                </div>
                                            )}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="context" className="m-0 flex-1 overflow-y-auto">
                                        <div className="p-6 space-y-8">
                                            {researchContext ? (
                                                <>
                                                    {/* Primary Research (Tavily) */}
                                                    <section className="space-y-4">
                                                        <h4 className="text-xs font-black uppercase text-blue-400 tracking-widest flex items-center gap-2">
                                                            <Search className="h-3 w-3" /> Primary Research Fragments (Tavily)
                                                        </h4>
                                                        <div className="space-y-3">
                                                            {researchContext.primary_research?.map((res: any, i: number) => (
                                                                <div key={i} className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-1 hover:bg-blue-500/10 transition-colors">
                                                                    <h5 className="text-sm font-bold text-white line-clamp-1">{res.title}</h5>
                                                                    <p className="text-xs text-slate-400 line-clamp-2">{res.content}</p>
                                                                    <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 hover:underline uppercase font-bold tracking-tighter">
                                                                        Verify Source: {new URL(res.url).hostname}
                                                                    </a>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </section>

                                                    {/* Semantic Context (Exa) */}
                                                    <section className="space-y-4">
                                                        <h4 className="text-xs font-black uppercase text-purple-400 tracking-widest flex items-center gap-2">
                                                            <Zap className="h-3 w-3" /> Semantic Neural Context (Exa.ai)
                                                        </h4>
                                                        <div className="space-y-3">
                                                            {researchContext.semantic_context?.map((res: any, i: number) => (
                                                                <div key={i} className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <h5 className="text-sm font-bold text-white line-clamp-1">{res.title}</h5>
                                                                        <Badge className="bg-purple-500/20 text-purple-400 border-none text-[8px]">EMBEDDING MATCH</Badge>
                                                                    </div>
                                                                    <p className="text-xs text-slate-400 italic">"{res.text?.substring(0, 180)}..."</p>
                                                                    <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-purple-400 hover:underline uppercase font-bold tracking-tighter">
                                                                        Anchor: {res.url}
                                                                    </a>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </section>
                                                </>
                                            ) : (
                                                <div className="py-20 flex flex-col items-center justify-center text-slate-500">
                                                    <BrainCircuit className="h-16 w-16 mb-4 opacity-20" />
                                                    <p className="text-lg font-bold">Neural Engine Idle</p>
                                                    <p className="text-sm mt-1 text-center max-w-[200px]">Research fragments will appear here once synthesized by Tavily + Exa.</p>
                                                </div>
                                            )}
                                        </div>
                                    </TabsContent>
                                </Card>
                            </Tabs>
                        </div>
                    </div>
                </TabsContent>

                {/* Creative Studio Section */}
                <TabsContent value="studio">
                    <div className="grid lg:grid-cols-12 gap-6 h-full">
                        <div className="lg:col-span-4 space-y-6">
                            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl p-6 rounded-3xl">
                                <h3 className="font-bold flex items-center gap-2 mb-6 text-primary">
                                    <Zap className="h-4 w-4" /> Signature Designer
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] uppercase font-bold text-slate-500">Full Name</Label>
                                        <Input
                                            value={sigName}
                                            onChange={(e) => setSigName(e.target.value)}
                                            className="h-9 bg-white/5 border-white/10 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] uppercase font-bold text-slate-500">Position</Label>
                                        <Input
                                            value={sigRole}
                                            onChange={(e) => setSigRole(e.target.value)}
                                            className="h-9 bg-white/5 border-white/10 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] uppercase font-bold text-slate-500">Email</Label>
                                        <Input
                                            value={sigEmail}
                                            onChange={(e) => setSigEmail(e.target.value)}
                                            className="h-9 bg-white/5 border-white/10 text-sm"
                                        />
                                    </div>
                                    <Button
                                        className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 mt-4"
                                        onClick={() => {
                                            const html = `<table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #e2e8f0; max-width: 500px; background-color: #030712; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden;">
  <tr>
    <td colspan="2" style="background: linear-gradient(135deg, #b247f5, #f547a4, #f5c947); padding: 2px;">
      <div style="background-color: #030712; padding: 15px; text-align: center;">
        <div style="color: #ffffff; font-size: 18px; font-weight: 800; letter-spacing: -0.025em;">LEAD VELOCITY</div>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding: 20px; vertical-align: top;">
      <strong style="font-size: 16px; color: #ffffff;">${sigName}</strong><br />
      <span style="color: #b247f5; font-weight: 600; font-size: 12px;">${sigRole}</span><br /><br />
      <div style="font-size: 12px; color: #94a3b8;">
        ${sigEmail}<br />
        ${sigPhone}
      </div>
    </td>
  </tr>
</table>`;
                                            navigator.clipboard.writeText(html);
                                            toast({ title: "Copied!", description: "High-end HTML signature copied to clipboard." });
                                        }}
                                    >
                                        Copy HTML Signature
                                    </Button>
                                    <p className="text-[10px] text-slate-500 text-center italic mt-2">Paste into Gmail/Outlook Signature settings</p>
                                </div>
                            </Card>

                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl flex flex-col items-start overflow-hidden gap-4">
                                <h3 className="font-bold flex items-center gap-2">
                                    <Download className="h-4 w-4 text-primary" /> Recent Drops
                                </h3>
                                <div className="w-full space-y-3 overflow-y-auto">
                                    {generatedDrops.map(drop => (
                                        <div key={drop.title} className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <Badge className="text-[9px] bg-primary/20 text-primary uppercase">{drop.type}</Badge>
                                                <Share2 className="h-3 w-3 text-slate-500" />
                                            </div>
                                            <p className="text-xs font-bold text-white truncate">{drop.title}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>

                        <div className="lg:col-span-8 flex flex-col gap-4">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl flex flex-col rounded-3xl overflow-hidden h-full">
                                <ScrollArea className="flex-1 p-8">
                                    <div className="space-y-8">
                                        {messages.map((msg, i) => (
                                            <div key={i} className={cn(
                                                "flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2",
                                                msg.role === "user" ? "flex-row-reverse" : ""
                                            )}>
                                                <div className={cn(
                                                    "p-3 rounded-2xl shadow-xl shadow-primary/20",
                                                    msg.role === "bot" ? "bg-primary text-primary-foreground" : "bg-slate-700 text-white"
                                                )}>
                                                    {msg.role === "bot" ? <Bot className="h-6 w-6" /> : <Plus className="h-6 w-6 rotate-45" />}
                                                </div>
                                                <div className={cn(
                                                    "p-5 border border-white/10 rounded-2xl max-w-[80%]",
                                                    msg.role === "bot" ? "bg-white/5 rounded-tl-none" : "bg-primary/10 rounded-tr-none text-right"
                                                )}>
                                                    <p className="text-slate-200">{msg.content}</p>
                                                </div>
                                            </div>
                                        ))}

                                        {/* SIGNATURE PREVIEW */}
                                        <div className="pt-8 border-t border-white/10 mt-8">
                                            <h4 className="text-xs font-black uppercase text-primary tracking-widest mb-6">Live Signature Preview</h4>
                                            <div className="p-8 bg-slate-950/50 rounded-2xl border border-white/5 ring-1 ring-white/5 flex justify-center overflow-x-auto">
                                                <table border={0} cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse", fontFamily: "Arial, sans-serif", fontSize: "14px", color: "#e2e8f0", minWidth: "350px", backgroundColor: "#030712", border: "1px solid #1e293b", borderRadius: "12px", overflow: "hidden" }}>
                                                    <thead>
                                                        <tr>
                                                            <td colSpan={2} style={{ background: "linear-gradient(135deg, #b247f5, #f547a4, #f5c947)", padding: "2px" }}>
                                                                <div style={{ backgroundColor: "#030712", padding: "15px", textAlign: "center" }}>
                                                                    <div style={{ color: "#ffffff", fontSize: "18px", fontWeight: 800, letterSpacing: "-0.025em" }}>LEAD VELOCITY</div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td style={{ padding: "25px", verticalAlign: "top" }}>
                                                                <strong style={{ fontSize: "16px", color: "#ffffff" }}>{sigName}</strong><br />
                                                                <span style={{ color: "#b247f5", fontWeight: 600, fontSize: "12px" }}>{sigRole}</span><br /><br />
                                                                <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>
                                                                    {sigEmail}<br />
                                                                    {sigPhone}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                                <div className="p-6 border-t border-white/5 bg-slate-950/30">
                                    <div className="relative flex items-center">
                                        <Input
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                            placeholder="Ask for variations or strategy tweaks..."
                                            className="bg-white/5 border-white/10 h-16 rounded-2xl pl-6 pr-32 text-lg focus-visible:ring-primary/30"
                                        />
                                        <div className="absolute right-3">
                                            <Button
                                                size="icon"
                                                className="h-10 w-10 rounded-xl shadow-lg shadow-primary/30"
                                                onClick={handleSendMessage}
                                                disabled={!chatInput.trim() || isGenerating}
                                            >
                                                <Send className="h-5 w-5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* Intelligence Section */}
                <TabsContent value="intelligence" >
                    <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden">
                        <CardContent className="p-8">
                            <SectionHeader
                                title="Competitor Intelligence"
                                subtitle="Live monitoring of market rivals and trend alignment."
                                icon={TrendingUp}
                            />
                            <div className="grid lg:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Rival Ad Creative Analysis</h3>
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        {[1, 2].map((i) => (
                                            <div key={i} className="aspect-[4/3] rounded-2xl bg-white/5 border border-white/10 p-4 relative group overflow-hidden">
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4 translate-y-2 group-hover:translate-y-0 transition-transform">
                                                    <p className="text-sm font-bold">Mainstream Competitor {i}</p>
                                                    <p className="text-xs text-slate-400">High engagement on LinkedIn</p>
                                                </div>
                                                <div className="flex gap-2 mb-4">
                                                    <Badge className="bg-blue-500/20 text-blue-400 border-none">Facebook</Badge>
                                                    <Badge className="bg-teal-500/20 text-teal-400 border-none">Trending</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-slate-950/50 rounded-3xl p-8 space-y-6 border border-white/5">
                                    <h3 className="font-bold text-xl">Market Trend Score</h3>
                                    <div className="h-[200px] flex items-end gap-3 px-4">
                                        {[40, 70, 45, 90, 65, 80, 95].map((h, i) => (
                                            <div key={i} className="flex-1 bg-primary/20 rounded-t-xl relative group">
                                                <div
                                                    className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-xl transition-all duration-1000 delay-300"
                                                    style={{ height: `${h}%` }}
                                                />
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Badge className="text-[10px]">{h}%</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10">
                                        <p className="text-sm font-medium text-emerald-400 flex items-center gap-2 mb-2">
                                            <TrendingUp className="h-4 w-4" />
                                            Opportunity Detected
                                        </p>
                                        <p className="text-slate-400 text-sm">
                                            Competitors are shifting focus to "Relatable Wealth". We recommend 5 posts leveraging the "Glow Up" narrative.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Planner Section */}
                <TabsContent value="planner" >
                    <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden">
                        <CardContent className="p-8">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                <SectionHeader
                                    title="Content Planner"
                                    subtitle="Scheduled distribution across social platform clusters."
                                    icon={Calendar}
                                />
                                <div className="flex flex-col md:flex-row items-center gap-4">
                                    <div className="flex items-center gap-3 bg-slate-950/50 px-4 py-2.5 rounded-xl border border-white/5">
                                        <Switch
                                            checked={isAiSchedulerEnabled}
                                            onCheckedChange={setIsAiSchedulerEnabled}
                                            id="ai-mode"
                                        />
                                        <Label htmlFor="ai-mode" className={cn("text-xs font-bold uppercase tracking-wider cursor-pointer", isAiSchedulerEnabled ? "text-primary" : "text-slate-500")}>
                                            Intuitive AI Mode
                                        </Label>
                                    </div>
                                    <Button
                                        className={cn("rounded-xl h-12 px-6 gap-2 transition-all", isAiSchedulerEnabled ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-105 shadow-[0_0_20px_rgba(178,71,245,0.4)]" : "bg-slate-800 hover:bg-slate-700 text-white")}
                                        onClick={handleAutoFill}
                                        disabled={isFilling}
                                    >
                                        <Bot className={cn("h-5 w-5", isFilling && "animate-spin")} />
                                        {isFilling ? "Strategizing..." : isAiSchedulerEnabled ? "Optimize & Fill Week" : "Auto-Fill Week"}
                                    </Button>
                                </div>
                            </div>

                            {isAiSchedulerEnabled && aiInsights.length > 0 && (
                                <div className="mb-8 animate-in slide-in-from-top-4 fade-in duration-500">
                                    <div className="grid md:grid-cols-3 gap-4">
                                        {aiInsights.map((insight, idx) => {
                                            const parts = insight.split(': ');
                                            const title = parts[0];
                                            const desc = parts.slice(1).join(': ');
                                            return (
                                                <div key={idx} className="p-4 bg-primary/10 border border-primary/20 rounded-2xl flex gap-3 items-start">
                                                    <div className="mt-0.5"><Sparkles className="h-4 w-4 text-primary" /></div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase text-primary tracking-widest">{title}</p>
                                                        <p className="text-xs text-slate-300 mt-1">{desc}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="overflow-x-auto pb-4">
                                <div className="min-w-[1000px] grid grid-cols-7 gap-4">
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                                        <div key={day} className="space-y-4">
                                            <div className="text-center font-bold text-slate-500 py-2 border-b border-white/5 uppercase tracking-tighter">{day}</div>
                                            <div className="space-y-3">
                                                {calendarData[day] ? (
                                                    calendarData[day].map((p, i) => (
                                                        <div key={i} className="p-3 bg-white/5 rounded-2xl border border-white/10 hover:border-primary/40 transition-all cursor-pointer group animate-in slide-in-from-top-4" style={{ animationDelay: `${i * 100}ms` }}>
                                                            <div className="flex justify-between items-start mb-2">
                                                                <span className="text-[10px] font-black text-slate-500">{p.time}</span>
                                                                <Badge className="text-[8px] h-4 bg-slate-800 border-none">{p.platform}</Badge>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-slate-800 rounded-full mb-2 overflow-hidden">
                                                                <div className="h-full bg-primary w-full" />
                                                            </div>
                                                            <p className="text-[10px] text-slate-200 font-medium truncate">{p.title}</p>
                                                            <div className="flex justify-between items-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Edit3 className="h-2.5 w-2.5 text-slate-500" />
                                                                <Share2 className="h-2.5 w-2.5 text-slate-500" />
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    [1, 2, 3, 4, 5].map((p) => (
                                                        <div key={p} className="h-24 bg-white/5 rounded-2xl border border-dashed border-white/5 flex items-center justify-center">
                                                            <Plus className="h-4 w-4 text-slate-800" />
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                {/* Meta Ad Center Section */}
                <TabsContent value="facebook" >
                    <div className="grid lg:grid-cols-4 gap-6">
                        {/* Control Panel */}
                        <div className="lg:col-span-3 space-y-6">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden">
                                <CardContent className="p-8 space-y-8">
                                    <div className="flex justify-between items-start">
                                        <SectionHeader
                                            title="Meta Ad Architect"
                                            subtitle="AI-driven engine for cross-platform campaign dominance."
                                            icon={Facebook}
                                        />
                                        <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
                                            {['leads', 'sales', 'vibe'].map((g) => (
                                                <button
                                                    key={g}
                                                    onClick={() => setMetaCampaignGoal(g)}
                                                    className={cn(
                                                        "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                                                        metaCampaignGoal === g ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                                                    )}
                                                >
                                                    {g}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="relative group">
                                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-2xl blur opacity-25 group-hover:opacity-50 transition-opacity"></div>
                                            <div className="relative p-1.5 bg-slate-950/50 rounded-2xl border border-white/10 flex gap-3">
                                                <div className="flex-grow relative">
                                                    <Input
                                                        value={fbAdPrompt}
                                                        onChange={(e) => setFbAdPrompt(e.target.value)}
                                                        placeholder="Enter campaign objective: e.g. 'Highly exclusive life insurance for tech founders'..."
                                                        className="bg-transparent border-none focus-visible:ring-0 text-lg py-6 placeholder:text-slate-700"
                                                    />
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                                                        <Badge variant="outline" className="text-[9px] border-white/10 text-slate-500">GPT-4o Vision</Badge>
                                                        <Badge variant="outline" className="text-[9px] border-white/10 text-slate-500">Creative Context</Badge>
                                                    </div>
                                                </div>
                                                <Button
                                                    onClick={handleGenerateFbAd}
                                                    disabled={isFbGenerating || !fbAdPrompt}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-10 h-14"
                                                >
                                                    {isFbGenerating ? <Activity className="h-4 w-4 mr-2 animate-pulse" /> : <Binary className="h-4 w-4 mr-2" />}
                                                    Architect
                                                </Button>
                                            </div>
                                        </div>

                                        {fbAdVariants.length > 0 ? (
                                            <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                                                {fbAdVariants.map((v) => (
                                                    <div key={v.id} className="group p-6 bg-slate-950/40 rounded-3xl border border-white/5 space-y-4 hover:border-blue-500/30 transition-all">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                                                <span className="text-[10px] font-black uppercase tracking-tighter text-blue-400">Campaign Variant AX-{v.id}00</span>
                                                            </div>
                                                            <div className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                                                                {v.sentiment}% Efficacy
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                                                                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Headline Hook</p>
                                                                <p className="text-sm font-bold text-white leading-tight">{v.hook}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">AI-Engineered Copy</p>
                                                                <p className="text-xs text-slate-400 leading-relaxed font-mono">{v.body}</p>
                                                            </div>
                                                        </div>
                                                        <div className="pt-4 flex items-center justify-between border-t border-white/5">
                                                            <div className="flex gap-4">
                                                                <div>
                                                                    <p className="text-[8px] uppercase tracking-widest text-slate-600">Weekly Reach</p>
                                                                    <p className="text-xs font-black text-white">{v.reach}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[8px] uppercase tracking-widest text-slate-600">Est. CPL</p>
                                                                    <p className="text-xs font-black text-blue-400">R72.50</p>
                                                                </div>
                                                            </div>
                                                            <Button size="sm" className="bg-white text-black hover:bg-slate-200 rounded-lg h-8 text-[10px] font-bold">
                                                                Push to Meta
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : !isFbGenerating && (
                                            <div className="grid md:grid-cols-3 gap-6">
                                                <div className="md:col-span-2 aspect-video rounded-3xl border border-white/5 bg-slate-950/20 flex flex-col items-center justify-center text-slate-600 space-y-4">
                                                    <Database className="h-10 w-10 opacity-10" />
                                                    <p className="text-[11px] font-medium tracking-wide uppercase">AI Engine Awaiting Blueprint</p>
                                                </div>
                                                <div className="p-6 bg-blue-600/5 rounded-3xl border border-blue-500/10 space-y-4">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
                                                        <Target className="h-3 w-3" /> Live Context
                                                    </h4>
                                                    <div className="space-y-4">
                                                        {[
                                                            { l: "Market Saturation", v: "Medium" },
                                                            { l: "Active Competitors", v: "14" },
                                                            { l: "Ideal CTR Range", v: "2.4 - 3.8%" }
                                                        ].map((c, i) => (
                                                            <div key={i}>
                                                                <p className="text-[9px] text-slate-500 mb-0.5">{c.l}</p>
                                                                <p className="text-xs font-bold text-white">{c.v}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="grid md:grid-cols-2 gap-6">
                                <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl p-8">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="font-bold flex items-center gap-2">
                                            <Globe className="h-4 w-4 text-emerald-400" /> Market Intelligence
                                        </h3>
                                        <Badge className="bg-emerald-500/10 text-emerald-400 border-0">Real-time Feed</Badge>
                                    </div>
                                    <div className="space-y-4">
                                        {[
                                            { t: "Competitor Ghosting", d: "Monitoring 5 rival agencies for creative shifts.", s: "Active" },
                                            { t: "Sentiment Radar", d: "Overall market mood for life insurance is up 12%.", s: "Bullish" },
                                            { t: "Platform Shift", d: "Higher engagement detected in IG Reels vs Feed.", s: "Shift" }
                                        ].map((intel, i) => (
                                            <div key={i} className="group p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/[0.07] transition-all">
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className="text-[11px] font-bold text-white">{intel.t}</p>
                                                    <span className="text-[9px] font-black text-emerald-500/80 uppercase">{intel.s}</span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 leading-relaxed">{intel.d}</p>
                                            </div>
                                        ))}
                                    </div>
                                </Card>

                                <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl p-8 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4">
                                        <div className="w-20 h-20 rounded-full border-4 border-blue-600/20 border-t-blue-500 flex items-center justify-center rotate-12">
                                            <span className="text-xl font-black text-white">{metaVibeScore}</span>
                                        </div>
                                    </div>
                                    <h3 className="font-bold mb-2">Algorithm Vibe Score</h3>
                                    <p className="text-xs text-slate-500 mb-6 max-w-[180px]">Your campaign alignment with the current Meta algorithm preferences.</p>

                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                                                <span>CREATIVE VELOCITY</span>
                                                <span className="text-white">94%</span>
                                            </div>
                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full w-[94%]" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                                                <span>AUDIENCE ACCURACY</span>
                                                <span className="text-white">82%</span>
                                            </div>
                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 rounded-full w-[82%]" />
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>

                        {/* Performance Sidebar */}
                        <div className="space-y-6">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl p-6">
                                <h3 className="font-bold flex items-center gap-2 mb-6">
                                    <Activity className="h-4 w-4 text-blue-400" /> Performance Pulse
                                </h3>
                                <div className="space-y-6">
                                    {[
                                        { label: "Cost Per Lead", value: "R84.20", trend: "-12%", color: "text-emerald-400" },
                                        { label: "Avg. ROI", value: "4.82x", trend: "+0.8", color: "text-blue-400" },
                                        { label: "Hook Rate", value: "8.4%", trend: "Top 2%", color: "text-indigo-400" }
                                    ].map((stat, i) => (
                                        <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">{stat.label}</p>
                                            <div className="flex justify-between items-end">
                                                <p className="text-2xl font-black text-white tracking-tight">{stat.value}</p>
                                                <p className={cn("text-[10px] font-black px-1.5 py-0.5 rounded bg-white/5", stat.color)}>{stat.trend}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="border-white/5 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-blue-500/10">
                                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
                                <div className="relative z-10 space-y-4">
                                    <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                                        <Shield className="h-5 w-5 text-white" />
                                    </div>
                                    <h3 className="font-bold text-white tracking-tight">Active lookalike engine</h3>
                                    <p className="text-[11px] text-blue-100/70 leading-relaxed font-mono">
                                        V-LAL ARCHITECTURE IS SYNCING YOUR 1ST-PARTY DATA WITH META GRAPH EVERY 24H.
                                    </p>
                                    <Button className="w-full bg-white text-blue-700 hover:bg-blue-50 font-black rounded-xl shadow-lg border-0 h-12 uppercase tracking-widest text-[10px]">
                                        Refine Lookalike
                                    </Button>
                                </div>
                            </Card>

                            <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 flex items-center justify-between group cursor-pointer hover:bg-slate-900/80 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
                                        <Layout className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-white">Asset Vault</p>
                                        <p className="text-[9px] text-slate-500">142 Generative Files</p>
                                    </div>
                                </div>
                                <ArrowRight className="h-4 w-4 text-slate-700 group-hover:text-white transition-colors" />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Google Ads Section */}
                <TabsContent value="google-ads">
                    <div className="grid lg:grid-cols-4 gap-8">
                        <Card className="lg:col-span-3 border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden">
                            <CardContent className="p-10 space-y-10">
                                <SectionHeader
                                    title="Google Search Architect"
                                    subtitle="Intent-mapped keywords and high-CTR headline generation."
                                    icon={Search}
                                />
                                <div className="grid md:grid-cols-3 gap-6">
                                    {[
                                        { t: "Search Intent", d: "Mapping brokers to high-value life insurance keywords.", v: "High Impact" },
                                        { t: "Predictive CTR", d: "Current creative forecast: 4.2% above benchmark.", v: "+14.2%" },
                                        { t: "Negative List", d: "AI is scrubbing 42 junk search terms every hour.", v: "Active Ops" }
                                    ].map((opt, i) => (
                                        <div key={i} className="p-6 bg-slate-950/40 rounded-3xl border border-white/5 space-y-3">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#4285F4]">{opt.t}</h4>
                                            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">{opt.d}</p>
                                            <p className="text-lg font-black text-white">{opt.v}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-8 bg-blue-600/5 rounded-3xl border border-blue-500/10 flex flex-col items-center justify-center space-y-4">
                                    <TrendingUp className="h-10 w-10 text-[#4285F4] opacity-20" />
                                    <p className="text-xs text-slate-500 uppercase font-black tracking-widest text-center">Google Ads ROI Forecaster Pending Data</p>
                                    <Button className="bg-[#4285F4] hover:bg-blue-600 text-white rounded-xl px-10 h-12 font-bold uppercase text-[10px] tracking-widest">Connect MCC Account</Button>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl p-8">
                                <h3 className="text-xs font-black uppercase text-white tracking-widest mb-6">Search Trends</h3>
                                <div className="space-y-6">
                                    {[
                                        { l: "Broker Franchise", v: "+142%" },
                                        { l: "AI Lead Gen", v: "+88%" },
                                        { l: "Life Insurance Leads", v: "+14%" }
                                    ].map((t, i) => (
                                        <div key={i}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[11px] text-slate-400">{t.l}</span>
                                                <span className="text-[11px] font-black text-emerald-400">{t.v}</span>
                                            </div>
                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: t.v.replace('%', '') + '%' }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* Meta Platforms Content (X, WhatsApp, LinkedIn) */}
                {
                    ['instagram', 'whatsapp', 'twitter', 'linkedin'].map((v) => (
                        <TabsContent key={v} value={v}>
                            <div className="grid lg:grid-cols-4 gap-8">
                                <Card className="lg:col-span-3 border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden min-h-[500px] flex items-center justify-center group">
                                    <div className="text-center space-y-6 max-w-md p-10">
                                        <div className="mx-auto w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                                            {v === 'instagram' && <Instagram className="h-10 w-10 text-pink-500" />}
                                            {v === 'whatsapp' && <Phone className="h-10 w-10 text-emerald-500" />}
                                            {v === 'twitter' && <Twitter className="h-10 w-10 text-white" />}
                                            {v === 'linkedin' && <Linkedin className="h-10 w-10 text-blue-600" />}
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-white capitalize mb-2">{v.replace('-', ' ')} Engine</h3>
                                            <p className="text-sm text-slate-500 leading-relaxed font-mono">
                                                {v === 'instagram' && "Synthesizing Reels and Carousel visual hooks based on trending audio signatures."}
                                                {v === 'whatsapp' && "Architecting non-intrusive broadcast sequences with AI personal engagement loops."}
                                                {v === 'twitter' && "Drafting high-viral thread components with hook-level metric predictions."}
                                                {v === 'linkedin' && "Professional authority building via long-form AI ghostwriting and b2b signaling."}
                                            </p>
                                        </div>
                                        <Button className="bg-white text-black hover:bg-slate-200 rounded-2xl px-12 h-14 font-black uppercase text-xs tracking-[0.2em]">
                                            Initialize {v.toUpperCase()} ARCHITECT
                                        </Button>
                                    </div>
                                </Card>
                                <div className="space-y-8">
                                    <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl p-8">
                                        <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-6">Channel Stats</h3>
                                        <div className="space-y-6">
                                            {[
                                                { l: "Engagement Rate", v: "14.2%" },
                                                { l: "Conversion Velocity", v: "High" },
                                                { l: "Active Campaigns", v: "4" }
                                            ].map((s, i) => (
                                                <div key={i} className="flex justify-between items-center pb-4 border-b border-white/5 last:border-0">
                                                    <span className="text-[11px] text-slate-400 font-bold">{s.l}</span>
                                                    <span className="text-sm font-black text-white">{s.v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    ))
                }
                {/* Sales Consultant Tab Content */}
                <TabsContent value="sales-consultant">
                    <div className="grid lg:grid-cols-12 gap-8">
                        {/* Einstein Directive Column */}
                        <div className="lg:col-span-4 space-y-6">
                            <Card className="border-emerald-500/20 bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl relative overflow-hidden group border-2">
                                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                    <img src="/einstein-avatar.png" alt="Einstein" className="w-24 h-24 object-cover" />
                                </div>
                                <SectionHeader
                                    title="Einstein's Briefing"
                                    subtitle="Strategic analysis architected by the Mastermind."
                                    icon={Bot}
                                />
                                
                                {!salesBriefing && !isSalesBriefingLoading ? (
                                    <div className="space-y-6">
                                        <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5 text-center py-10 opacity-60">
                                            <Brain className="h-10 w-10 mx-auto mb-4 text-primary animate-pulse" />
                                            <p className="text-sm">Initiate synthesis to receive Einstein's high-performance sales briefing.</p>
                                        </div>
                                        <Button
                                            onClick={handleGetSalesBriefing}
                                            className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-2xl h-14 gap-2 font-bold"
                                        >
                                            <Zap className="h-5 w-5" />
                                            Initialize Einstein's Analysis
                                        </Button>
                                    </div>
                                ) : isSalesBriefingLoading ? (
                                    <div className="space-y-6 animate-pulse">
                                        <div className="h-32 bg-white/5 rounded-2xl" />
                                        <div className="h-20 bg-white/5 rounded-2xl" />
                                        <div className="h-14 bg-white/5 rounded-xl" />
                                    </div>
                                ) : (
                                    <div className="space-y-6 animate-in zoom-in-95 duration-500">
                                        <div className="p-6 bg-slate-950/80 rounded-3xl border border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.1)]">
                                            <h4 className="text-[10px] font-black uppercase text-primary tracking-widest mb-3 flex items-center gap-2">
                                                <Brain className="h-3 w-3" /> Strategic Insight
                                            </h4>
                                            <p className="text-sm text-slate-100 leading-relaxed italic font-serif">
                                                "{salesBriefing.briefing}"
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                                <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">Batch Warmth</span>
                                                <div className="text-2xl font-black text-white">{salesBriefing.intent}%</div>
                                            </div>
                                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                                <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">CPL Target</span>
                                                <div className="text-2xl font-black text-emerald-400">R145</div>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                            <span className="text-[9px] font-black uppercase text-emerald-400 block mb-2 tracking-widest">30-Sec Script Strategy</span>
                                            <p className="text-xs text-emerald-100 font-medium">{salesBriefing.strategy}</p>
                                        </div>

                                        <Button
                                            onClick={handleGetSalesBriefing}
                                            variant="ghost"
                                            className="w-full text-slate-500 hover:text-white text-[10px] uppercase font-black"
                                        >
                                            <RotateCw className="h-3 w-3 mr-2" /> Re-Architect Briefing
                                        </Button>
                                    </div>
                                )}
                            </Card>

                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl">
                                <h3 className="font-bold flex items-center gap-2 mb-4 text-sm">
                                    <Activity className="h-4 w-4 text-emerald-400" /> Sales Velocity Pulse
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase">
                                        <span>Dial Activity</span>
                                        <span className="text-emerald-400">+24%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full">
                                        <div className="h-full bg-emerald-500 w-[65%] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* High Performance Call Queue */}
                        <div className="lg:col-span-8 space-y-6">
                            <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden border-2">
                                <CardHeader className="p-8 border-b border-white/5 bg-slate-950/40">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <SectionHeader
                                            title="High-Performance Call Queue"
                                            subtitle="Real-world leads detected via stealth acquisition."
                                            icon={Zap}
                                        />
                                        <div className="flex items-center gap-2">
                                            <Badge className="bg-emerald-500/20 text-emerald-400 border-none px-4 py-2">
                                                <Activity className="h-3.5 w-3.5 mr-2 animate-pulse" />
                                                Live Queue: {detectedLeads.length} Leads
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {detectedLeads.length === 0 ? (
                                        <div className="p-20 text-center space-y-4 opacity-40">
                                            <Search className="h-12 w-12 mx-auto mb-2" />
                                            <p className="text-xl font-bold italic">No Leads in Chamber</p>
                                            <p className="text-sm">Switch to 'Lead Prospector' and run a scrape to populate the queue.</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b border-white/5 bg-white/5">
                                                        <th className="p-6 text-[10px] font-black uppercase text-slate-500">Contact / Firm</th>
                                                        <th className="p-6 text-[10px] font-black uppercase text-slate-500">Industry Pulse</th>
                                                        <th className="p-6 text-[10px] font-black uppercase text-slate-500 text-right">Execution Node</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detectedLeads.map((lead) => (
                                                        <tr key={lead.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                                            <td className="p-6">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                                                                        {(lead.name || lead.first_name || "L").charAt(0)}
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-bold text-white group-hover:text-emerald-400 transition-colors uppercase tracking-tight">
                                                                            {lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Anonymous'}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-500 font-mono">{lead.company} • {lead.role}</div>
                                                                        {lead.phone && <div className="text-[10px] text-slate-400 font-mono mt-0.5">📞 {lead.phone}</div>}
                                                                        {lead.address && <div className="text-[10px] text-slate-500 mt-0.5">📍 {lead.address}</div>}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-6">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-1.5 w-24 bg-white/5 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${lead.vibe}%` }} />
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-emerald-400">{lead.vibe}% Hot</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-6 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Button 
                                                                        size="sm"
                                                                        className="bg-primary/20 hover:bg-primary/40 text-primary border border-primary/30 rounded-xl h-10 gap-2 px-4 shadow-lg shadow-primary/10"
                                                                        onClick={() => handleAyandaClick(lead)}
                                                                    >
                                                                        <PhoneCall className="h-4 w-4" />
                                                                        <span>Ayanda Connect</span>
                                                                    </Button>
                                                                    <Button 
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="border-white/10 hover:bg-white/5 rounded-xl h-10 w-10 p-0"
                                                                        onClick={() => window.open(`tel:${lead.phone || '0111234567'}`)}
                                                                    >
                                                                        <Phone className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            
                            <div className="grid md:grid-cols-2 gap-6">
                                <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl flex items-center gap-6">
                                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                                        <Zap className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm uppercase tracking-tighter">Ayanda Flow Active</h4>
                                        <p className="text-[10px] text-slate-500 leading-tight mt-1">Smart sequence handles follow-ups if no answer in 30 seconds.</p>
                                    </div>
                                    <Switch defaultChecked />
                                </Card>
                                <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl p-6 rounded-3xl flex items-center gap-6">
                                    <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                        <Shield className="h-6 w-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm uppercase tracking-tighter">Stealth Dialing</h4>
                                        <p className="text-[10px] text-slate-500 leading-tight mt-1">Caller ID rotation enabled for higher contact rates.</p>
                                    </div>
                                    <Switch defaultChecked />
                                </Card>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
            <AyandaCallModal isOpen={isAyandaModalOpen} onClose={() => setIsAyandaModalOpen(false)} lead={selectedLeadForCall} brokerId={selectedLeadForCall?.broker_id} />
        </div>
    );
};

export default MarketingHub;

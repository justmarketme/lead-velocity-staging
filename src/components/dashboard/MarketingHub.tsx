import { useState } from "react";
import {
    Rocket,
    Search,
    MessageSquare,
    TrendingUp,
    Calendar,
    Download,
    Sparkles,
    Bot,
    Globe,
    Plus,
    Send,
    Mic,
    Volume2,
    Trash2,
    Edit3,
    Share2,
    Zap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const MarketingHub = () => {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("prospector");

    // --- Lead Prospector State ---
    const [isScraping, setIsScraping] = useState(false);
    const [scraperLogs, setScraperLogs] = useState<string[]>([]);
    const [industry, setIndustry] = useState("");

    // --- Creative Studio State ---
    const [chatInput, setChatInput] = useState("");
    const [messages, setMessages] = useState([
        { role: "bot", content: "Hello! I'm your Creative AI Agent. I'm connected to Nano Banana, Veo3, and Gemini 3 Flash. What kind of viral content should we create today?" }
    ]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedDrops, setGeneratedDrops] = useState<any[]>([
        { title: "Weekly Ad Pack", type: "Visuals", date: "Today" },
        { title: "Onboarding Sequence", type: "Email", date: "Today" },
    ]);

    // Signature State
    const [sigName, setSigName] = useState("Your Name");
    const [sigRole, setSigRole] = useState("Strategist");
    const [sigEmail, setSigEmail] = useState("yourname@leadvelocity.co.za");
    const [sigPhone, setSigPhone] = useState("+27 XX XXX XXXX");

    // --- Planner State ---
    const [calendarData, setCalendarData] = useState<any>({});
    const [isFilling, setIsFilling] = useState(false);

    // --- Handlers ---
    const handleScrape = () => {
        if (!industry) return;
        setIsScraping(true);
        setScraperLogs([]);
        const steps = [
            `Initializing scraping agents for "${industry}"...`,
            "Connecting to LinkedIn Recruiter API...",
            "Scanning global web directories...",
            "Filtering for high-intent leads...",
            "Validating contact details via proxy...",
            `Success! Found 142 new potential leads for ${industry}.`
        ];

        steps.forEach((step, i) => {
            setTimeout(() => {
                setScraperLogs(prev => [...prev, step]);
                if (i === steps.length - 1) setIsScraping(false);
            }, (i + 1) * 1500);
        });
    };

    const handleSendMessage = () => {
        if (!chatInput.trim()) return;
        const newMsg = { role: "user", content: chatInput };
        setMessages(prev => [...prev, newMsg]);
        setChatInput("");
        setIsGenerating(true);

        setTimeout(() => {
            const botResponse = {
                role: "bot",
                content: `Analyzing your request for "${newMsg.content}"... I've synchronized with Veo3 for visual aesthetic and Gemini 3 Flash for the copy. I've generated a 5-part campaign strategy for you.`
            };
            setMessages(prev => [...prev, botResponse]);
            setIsGenerating(false);

            // Add a "Drop"
            const newDrop = {
                id: Date.now(),
                type: "Instagram Reel",
                title: "Viral Hook: The Future of Finance",
                status: "Ready"
            };
            setGeneratedDrops(prev => [newDrop, ...prev]);
        }, 2000);
    };

    const handleAutoFill = () => {
        setIsFilling(true);
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const fullData: any = {};

        days.forEach(day => {
            fullData[day] = Array.from({ length: 5 }).map((_, i) => ({
                time: `${8 + i * 3}:00 ${i + 8 < 12 ? 'AM' : 'PM'}`,
                platform: ['IG', 'FB', 'X', 'LI'][Math.floor(Math.random() * 4)],
                title: `Campaign Drop #${i + 1}`,
                progress: 100
            }));
        });

        setTimeout(() => {
            setCalendarData(fullData);
            setIsFilling(false);
        }, 2000);
    };

    const SectionHeader = ({ title, subtitle, icon: Icon }: any) => (
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
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <Rocket className="h-64 w-64 -rotate-12 translate-x-1/4 -translate-y-1/4" />
                </div>
                <div className="relative z-10 max-w-2xl space-y-4">
                    <Badge className="bg-primary/20 text-primary border-primary/30 px-3 py-1 mb-2 hover:bg-primary/30 transition-colors">
                        <Bot className="h-3.5 w-3.5 mr-2 animate-pulse" />
                        Empowered by Gemini 3 Flash & Veo3
                    </Badge>
                    <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tighter text-white">
                        Marketing <span className="bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">Command Center</span>
                    </h1>
                    <p className="text-slate-400 text-lg leading-relaxed">
                        Harness the power of multi-agent AI to scrape leads, create award-winning content, and dominate your market presence across every platform.
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid grid-cols-2 md:grid-cols-4 h-14 bg-slate-900/50 border border-white/5 p-1 rounded-2xl backdrop-blur-xl">
                    <TabsTrigger value="prospector" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
                        <Search className="h-4 w-4" />
                        <span>Lead Prospector</span>
                    </TabsTrigger>
                    <TabsTrigger value="studio" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>Creative Studio</span>
                    </TabsTrigger>
                    <TabsTrigger value="intelligence" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
                        <TrendingUp className="h-4 w-4" />
                        <span>Intelligence</span>
                    </TabsTrigger>
                    <TabsTrigger value="planner" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>Planner</span>
                    </TabsTrigger>
                </TabsList>

                {/* Lead Prospector Section */}
                <TabsContent value="prospector">
                    <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl overflow-hidden rounded-3xl">
                        <CardContent className="p-8">
                            <SectionHeader
                                title="AI Lead Prospector"
                                subtitle="Intelligent scraping agents scanning LinkedIn and the global web."
                                icon={Search}
                            />
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="md:col-span-2 space-y-6">
                                    <div className="flex gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 ring-1 ring-white/5">
                                        <Input
                                            value={industry}
                                            onChange={(e) => setIndustry(e.target.value)}
                                            placeholder="Target Industries, Roles, or Company Names..."
                                            className="bg-transparent border-none focus-visible:ring-0 text-lg h-12"
                                        />
                                        <Button
                                            size="lg"
                                            className="rounded-xl px-8 shadow-lg shadow-primary/20"
                                            onClick={handleScrape}
                                            disabled={isScraping || !industry}
                                        >
                                            {isScraping ? <Sparkles className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                            {isScraping ? "Scraping..." : "Scrape Leads"}
                                        </Button>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Live Scraper Activity</h3>
                                        <div className="space-y-3">
                                            {scraperLogs.length === 0 && !isScraping && (
                                                <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl text-slate-500 text-sm">
                                                    Enter a target industry to begin deep-web prospecting
                                                </div>
                                            )}
                                            {scraperLogs.map((log, i) => (
                                                <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 animate-in fade-in slide-in-from-left-2 duration-500">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "h-2 w-2 rounded-full animate-pulse",
                                                            log.includes("Success") ? "bg-emerald-500" : "bg-primary"
                                                        )} />
                                                        <span className="text-slate-300">{log}</span>
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px] text-slate-500">Real-time</Badge>
                                                </div>
                                            ))}
                                            {isScraping && scraperLogs.length < 5 && (
                                                <div className="p-4 flex items-center gap-3 opacity-50 italic text-slate-500 animate-pulse">
                                                    Agent searching...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-primary/5 rounded-3xl border border-primary/10 p-6 space-y-6">
                                    <h3 className="font-bold flex items-center gap-2">
                                        <Globe className="h-4 w-4 text-primary" />
                                        Target Intelligence
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                                            <p className="text-xs text-slate-500 mb-1">Estimated Matches</p>
                                            <p className="text-2xl font-black text-white">{isScraping ? "..." : "4,281"}</p>
                                        </div>
                                        <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                                            <p className="text-xs text-slate-500 mb-1">Scraping Accuracy</p>
                                            <p className="text-2xl font-black text-white">{isScraping ? "Analyzing" : "98.4%"}</p>
                                        </div>
                                        <Button variant="outline" className="w-full rounded-xl border-white/10 hover:bg-white/5">
                                            Configure Filters
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Creative Studio Section */}
                <TabsContent value="studio">
                    <div className="grid lg:grid-cols-12 gap-6 h-[700px]">
                        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
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
                                        <div key={drop.id} className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors">
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
                                                    <tr>
                                                        <td colSpan={2} style={{ background: "linear-gradient(135deg, #b247f5, #f547a4, #f5c947)", padding: "2px" }}>
                                                            <div style={{ backgroundColor: "#030712", padding: "15px", textAlign: "center" }}>
                                                                <div style={{ color: "#ffffff", fontSize: "18px", fontWeight: 800, letterSpacing: "-0.025em" }}>LEAD VELOCITY</div>
                                                            </div>
                                                        </td>
                                                    </tr>
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
                <TabsContent value="intelligence">
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
                <TabsContent value="planner">
                    <Card className="border-white/5 bg-slate-900/40 backdrop-blur-xl rounded-3xl overflow-hidden">
                        <CardContent className="p-8">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                                <SectionHeader
                                    title="Content Planner"
                                    subtitle="Scheduled distribution across social platform clusters."
                                    icon={Calendar}
                                />
                                <Button
                                    className="rounded-xl h-12 px-6 gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 transition-transform"
                                    onClick={handleAutoFill}
                                    disabled={isFilling}
                                >
                                    <Bot className={cn("h-5 w-5", isFilling && "animate-spin")} />
                                    {isFilling ? "Strategizing..." : "Auto-Fill Week (35 Posts)"}
                                </Button>
                            </div>
                            <div className="overflow-x-auto pb-4">
                                <div className="min-w-[1000px] grid grid-cols-7 gap-4">
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                                        <div key={day} className="space-y-4">
                                            <div className="text-center font-bold text-slate-500 py-2 border-b border-white/5 uppercase tracking-tighter">{day}</div>
                                            <div className="space-y-3">
                                                {calendarData[day] ? (
                                                    calendarData[day].map((p: any, i: number) => (
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
            </Tabs>
        </div>
    );
};

export default MarketingHub;

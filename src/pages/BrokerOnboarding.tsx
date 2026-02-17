import React, { useState } from "react";
import {
    CheckCircle2,
    ArrowRight,
    Target,
    Users,
    Zap,
    BarChart3,
    Clock,
    TrendingUp,
    AlertCircle,
    ShieldCheck,
    Mail,
    Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { useNavigate } from "react-router-dom";
import { calculateScores, OnboardingData } from "@/lib/scoring";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";

const BrokerOnboarding = () => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Form State
    const [formData, setFormData] = useState<OnboardingData>({
        crmUsage: 'none',
        speedToContact: 'nextDay',
        teamSize: 'solo',
        followUpClarity: 'none',
        monthlySpend: 'none',
        cplAwareness: 'no',
        pricingComfort: 'sensitive',
        desiredLeadsWeekly: 10,
        maxCapacityWeekly: 20,
        productFocusClarity: 'unclear',
        geographicFocusClarity: 'undefined',
        growthGoalClarity: 'vague',
        timeline: 'exploring',
    });

    const handleInputChange = (field: keyof OnboardingData, value: string | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Animations
    const heroAnim = useScrollAnimation();
    const problemAnim = useScrollAnimation();
    const mechanismAnim = useScrollAnimation();
    const qualityAnim = useScrollAnimation();
    const investmentAnim = useScrollAnimation();
    const partnershipAnim = useScrollAnimation();
    const formAnim = useScrollAnimation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // 1. Calculate deterministic scores locally
            const results = calculateScores(formData);

            // 2. Save to Supabase
            const { data: { user } } = await supabase.auth.getUser();

            const { data: responseData, error: responseError } = await supabase
                .from('broker_onboarding_responses')
                .insert([{
                    broker_id: user?.id,
                    crm_usage: formData.crmUsage,
                    speed_to_contact: formData.speedToContact,
                    team_size: formData.teamSize,
                    follow_up_process: formData.followUpClarity,
                    monthly_lead_spend: formData.monthlySpend,
                    cpl_awareness: formData.cplAwareness,
                    pricing_comfort: formData.pricingComfort,
                    desired_leads_weekly: formData.desiredLeadsWeekly,
                    max_capacity_weekly: formData.maxCapacityWeekly,
                    product_focus_clarity: formData.productFocusClarity,
                    geographic_focus_clarity: formData.geographicFocusClarity,
                    growth_goal_clarity: formData.growthGoalClarity,
                    timeline_to_start: formData.timeline
                }])
                .select()
                .single();

            if (responseError) throw responseError;

            // 3. Save calculated results
            const { error: analysisError } = await supabase
                .from('broker_analysis')
                .insert([{
                    response_id: responseData.id,
                    broker_id: user?.id,
                    operational_score: results.operationalScore,
                    budget_score: results.budgetScore,
                    growth_score: results.growthScore,
                    intent_score: results.intentScore,
                    success_probability: results.successProbability,
                    risk_flags: results.riskFlags,
                    primary_sales_angle: results.primarySalesAngle,
                    success_band: results.successBand,
                }]);

            if (analysisError) throw analysisError;

            // 4. Trigger AI Analysis
            try {
                // This is a placeholder for the actual Edge Function call
                // In a real scenario, this would trigger an async process
                console.log("Triggering AI analysis for:", responseData.id);
                // await supabase.functions.invoke('analyze-broker-score', { ... });
            } catch (aiError) {
                console.error("AI Analysis trigger failed:", aiError);
            }

            setSubmitted(true);
            toast({
                title: "Strategy Snapshot Received",
                description: "Our consultant will review your profile and deterministic scores before our meeting.",
            });
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error: any) {
            toast({
                title: "Submission Error",
                description: error.message || "Failed to submit onboarding data.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col">
                <Navigation />
                <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
                    <ParticleBackground />
                    <div className="max-w-2xl text-center space-y-8 animate-in fade-in zoom-in duration-700 relative z-10">
                        <div className="inline-flex p-4 rounded-full bg-primary/10 border border-primary/20 mb-4">
                            <CheckCircle2 className="h-12 w-12 text-primary" />
                        </div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white font-inter">
                            Strategy Snapshot <span className="gradient-text-epiphany">Submitted</span>
                        </h1>
                        <p className="text-slate-400 text-lg leading-relaxed">
                            Thank you for providing this detailed look into your business. High-quality data leads to high-quality strategy.
                            Our system has calculated your initial **Readiness Score** and our consultant is preparing a targeted plan for our upcoming call.
                        </p>
                        <div className="p-8 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl text-left space-y-6 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Zap className="h-12 w-12 text-primary" />
                            </div>
                            <h3 className="font-bold text-xl flex items-center gap-2 text-white">
                                <Clock className="h-5 w-5 text-primary" />
                                What Happens Now:
                            </h3>
                            <ul className="space-y-4 text-slate-400">
                                <li className="flex gap-4">
                                    <div className="bg-primary/20 h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                        <div className="h-2 w-2 rounded-full bg-primary" />
                                    </div>
                                    <span><strong>AI Score Verification:</strong> Our Gemini-powered engine is currently generating your detailed readiness breakdown.</span>
                                </li>
                                <li className="flex gap-4">
                                    <div className="bg-secondary/20 h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                        <div className="h-2 w-2 rounded-full bg-secondary" />
                                    </div>
                                    <span><strong>Sales Angle Alignment:</strong> We've already assigned a primary sales strategist to your profile based on your specific operational setup.</span>
                                </li>
                                <li className="flex gap-4">
                                    <div className="bg-accent/20 h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                        <div className="h-2 w-2 rounded-full bg-accent" />
                                    </div>
                                    <span><strong>Meeting Prep:</strong> You'll receive an email within 4 hours with a summary of your risks and opportunities.</span>
                                </li>
                            </ul>
                        </div>
                        <Button
                            variant="outline"
                            className="border-white/10 text-white hover:bg-white/5 bg-white/5 rounded-xl px-8"
                            onClick={() => window.location.reload()}
                        >
                            Back to Top
                        </Button>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#030712] text-white relative overflow-hidden">
            <ParticleBackground />
            <div className="relative z-10">
                <SEO
                    title="Broker Readiness Assessment"
                    description="Assess your brokerage's readiness for high-volume lead distribution. Get your Strategy Snapshot and Success Probability Score."
                    keywords="broker assessment, insurance broker onboarding, lead readiness score, broker crm check"
                />
                <Navigation />

                {/* 1. Hero Section */}
                <header
                    ref={heroAnim.ref}
                    className={`relative py-16 lg:py-24 overflow-hidden bg-black border-b border-white/5 transition-all duration-700 ${heroAnim.isVisible ? "scroll-fade-up" : "scroll-hidden"}`}
                >
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/10 rounded-full blur-3xl hero-orb hero-orb-1"></div>
                        <div className="absolute bottom-1/4 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-secondary/10 rounded-full blur-3xl hero-orb hero-orb-2"></div>
                    </div>
                    <div className="container mx-auto px-6 relative z-10">
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            {/* Left Column - Text */}
                            <div className="space-y-6">
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-primary/90 flex items-center gap-2">
                                    <Zap className="w-4 h-4" /> For Insurance Brokers
                                </p>
                                <h1 className="text-4xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white font-inter">
                                    Consistent Leads <br />
                                    <span className="gradient-text-epiphany">Delivered Weekly</span>
                                </h1>
                                <p className="text-lg text-slate-400 leading-relaxed">
                                    This page walks you through exactly how Lead Velocity works, how pricing is structured, and whether it's a fit for your business.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                    <Button
                                        size="lg"
                                        className="bg-primary hover:bg-primary/80 text-white transition-all duration-300 hover:scale-105 active:scale-95 px-6 py-6 text-base rounded-xl shadow-lg shadow-primary/20"
                                        onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                                    >
                                        See How It Works <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        className="border-primary/30 text-white hover:bg-primary/10 px-6 py-6 text-base rounded-xl"
                                        onClick={() => document.getElementById("strategy-form")?.scrollIntoView({ behavior: "smooth" })}
                                    >
                                        Skip to Form <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            {/* Right Column - Einstein Rocket Image */}
                            <div className="relative flex justify-center lg:justify-end">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/30 via-purple-500/30 to-violet-500/30 rounded-3xl blur-3xl"></div>
                                    <img
                                        src="/src/assets/einstein-genius-neon.png"
                                        alt="Einstein - Lead Velocity Genius"
                                        className="relative w-full max-w-md lg:max-w-lg rounded-3xl shadow-2xl shadow-purple-500/20 border border-white/10"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* 2. Problem Section */}
                <section className="py-20 border-b border-white/5 bg-slate-900/30" ref={problemAnim.ref}>
                    <div className={`container mx-auto px-6 transition-all duration-700 ${problemAnim.isVisible ? "scroll-fade-up" : "scroll-hidden"}`}>
                        <div className="grid lg:grid-cols-2 gap-16 items-center mb-16">
                            {/* Left Column - Image */}
                            <div className="relative flex justify-center">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/20 via-purple-500/20 to-rose-500/20 rounded-[2rem] blur-3xl"></div>
                                    <img
                                        src="/src/assets/einstein-pointing.png"
                                        alt="Einstein pointing at solutions"
                                        className="relative w-full max-w-sm rounded-2xl"
                                    />
                                </div>
                            </div>
                            {/* Right Column - Text */}
                            <div>
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-pink-400 flex items-center gap-2 mb-4">
                                    <AlertCircle className="w-4 h-4" /> The Problem
                                </p>
                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-white font-inter">
                                    The Frustration You <br />
                                    <span className="gradient-text-epiphany">Already Know</span>
                                </h2>
                                <p className="text-lg text-slate-400">Most brokers have been burned by lead generation before. Here's what they tell us:</p>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { title: "Don't Convert", desc: "Contacts who were never interested or qualified.", icon: AlertCircle },
                                { title: "Inconsistent", desc: "Twenty leads one week, none the next.", icon: BarChart3 },
                                { title: "Low Quality", desc: "Wrong numbers. Fake emails. No opt-in.", icon: Users },
                                { title: "Wasted Time", desc: "Hours chasing leads that never close.", icon: Clock }
                            ].map((item, i) => (
                                <div key={i} className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 cursor-default hover:border-pink-500/30 hover:bg-slate-800/60 transition-all duration-300 group">
                                    <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mb-4 group-hover:bg-pink-500/20 transition-colors">
                                        <item.icon className="w-6 h-6 text-pink-400" />
                                    </div>
                                    <h3 className="font-bold text-lg mb-2 text-white">{item.title}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-violet-500/10 border border-pink-500/20">
                            <p className="text-center text-lg text-slate-300 italic">
                                "Lead Velocity is structured and intentional. We're not another lead vendor hoping something sticks. <span className="text-pink-400 font-medium">We're a system designed for consistent, predictable growth.</span>"
                            </p>
                        </div>
                    </div>
                </section>

                {/* 3. Mechanism Section */}
                <section id="how-it-works" className="py-24 border-b border-white/5" ref={mechanismAnim.ref}>
                    <div className={`container mx-auto px-6 transition-all duration-700 ${mechanismAnim.isVisible ? "scroll-fade-up" : "scroll-hidden"}`}>
                        <div className="grid lg:grid-cols-2 gap-16 items-center">
                            <div>
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-primary/90 flex items-center gap-2 mb-4">
                                    <Zap className="w-4 h-4" /> The Mechanism
                                </p>
                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-8 text-white font-inter">
                                    How <span className="gradient-text-epiphany">Lead Velocity</span> Works
                                </h2>
                                <p className="text-lg text-slate-400 mb-8">A structured approach to lead generation that puts you in control.</p>

                                <div className="space-y-8">
                                    {[
                                        { title: "Define Ideal Client", desc: "We establish exactly who you want to reach. Geographic area, income bracket, product focus." },
                                        { title: "Targeted Generation", desc: "Campaigns designed to attract prospects matching your criteria. Fresh, targeted contacts." },
                                        { title: "Qualified Against Criteria", desc: "Checked against defined profile. Quality over volume." },
                                        { title: "Weekly Delivery", desc: "Predictable schedule. No surprises." }
                                    ].map((step, i) => (
                                        <div key={i} className="flex gap-4">
                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold border border-primary/20">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg text-white mb-1">{step.title}</h3>
                                                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-purple-500/20 to-pink-500/20 rounded-3xl blur-3xl"></div>
                                <img
                                    src="/src/assets/mission-control-neon.png"
                                    alt="Lead Velocity Mission Control"
                                    className="relative w-full rounded-3xl shadow-2xl shadow-purple-500/20 border border-white/10"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. Quality Section */}
                <section className="py-20 border-b border-white/5 bg-slate-900/30" ref={qualityAnim.ref}>
                    <div className={`container mx-auto px-6 transition-all duration-700 ${qualityAnim.isVisible ? "scroll-fade-up" : "scroll-hidden"}`}>
                        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
                            <div>
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-cyan-400 flex items-center gap-2 mb-4">
                                    <ShieldCheck className="w-4 h-4" /> Quality Defined
                                </p>
                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white font-inter">
                                    What "Qualified" <br />
                                    <span className="gradient-text-epiphany">Actually Means</span>
                                </h2>
                                <p className="text-lg text-slate-400">We're specific about this because vague definitions waste everyone's time.</p>
                            </div>
                            <div className="relative flex justify-center">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/30 via-blue-500/30 to-purple-500/30 rounded-full blur-3xl"></div>
                                    <img
                                        src="/src/assets/precision-targeting.png"
                                        alt="Precision Targeting"
                                        className="relative w-full max-w-sm rounded-2xl"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                            <div className="bg-slate-900/60 p-8 rounded-3xl border border-primary/20 hover:border-primary/40 transition-colors">
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                    <CheckCircle2 className="text-primary h-6 w-6" /> What Qualifies
                                </h3>
                                <ul className="space-y-4">
                                    {[
                                        "Matches your target geographic area",
                                        "Fits the demographic criteria",
                                        "Has expressed interest involved",
                                        "Provided accurate, verified contact details",
                                        "Opted in to receive communication",
                                        "Is reachable and responsive"
                                    ].map((item, i) => (
                                        <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-background/40 border border-primary/10 text-slate-300 text-sm">
                                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" /> {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="bg-slate-900/60 p-8 rounded-3xl border border-rose-500/20 hover:border-rose-500/40 transition-colors">
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                    <AlertCircle className="text-rose-500 h-6 w-6" /> What Doesn't
                                </h3>
                                <ul className="space-y-4">
                                    {[
                                        "Cold contacts from databases",
                                        "Leads outside service area",
                                        "People who didn't opt in",
                                        "Invalid or fake contact info",
                                        "Tire-kickers with no intent",
                                        "Leads already contacted by others"
                                    ].map((item, i) => (
                                        <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-background/40 border border-rose-500/10 text-slate-300 text-sm">
                                            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" /> {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 5. Investment Section */}
                <section className="py-20 border-b border-white/5" ref={investmentAnim.ref}>
                    <div className={`container mx-auto px-6 transition-all duration-700 ${investmentAnim.isVisible ? "scroll-fade-up" : "scroll-hidden"}`}>
                        <div className="grid lg:grid-cols-2 gap-12 items-center">
                            {/* Left - Image */}
                            <div className="relative flex justify-center order-2 lg:order-1">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/30 via-orange-500/30 to-pink-500/30 rounded-3xl blur-3xl"></div>
                                    <img
                                        src="/src/assets/einstein-retention.png"
                                        alt="Einstein showing ROI growth"
                                        className="relative w-full max-w-sm rounded-2xl"
                                    />
                                </div>
                            </div>
                            {/* Right - Content */}
                            <div className="order-1 lg:order-2">
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-amber-400 mb-4 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4" /> Investment Reality
                                </p>
                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-8 text-white font-inter">
                                    Understanding <br />
                                    <span className="gradient-text-epiphany">Cost & Volume</span>
                                </h2>
                                <div className="space-y-6">
                                    <div className="p-6 bg-slate-900/60 rounded-2xl border border-white/5">
                                        <h3 className="text-lg font-bold text-white mb-2">Why Lead Costs Vary</h3>
                                        <p className="text-slate-400 text-sm">Lead costs aren't arbitrary. They're driven by market demand, targeting specificity, and product complexity. This is economics, not pricing games.</p>
                                    </div>
                                    <div className="p-6 bg-slate-900/60 rounded-2xl border border-white/5">
                                        <h3 className="text-lg font-bold text-white mb-2">Volume Matters More Than "Testing"</h3>
                                        <p className="text-slate-400 text-sm">Brokers often say, "Let me try 5 leads." But 5 leads tells you nothing. Statistical significance requires volume. Consistency drives conversion.</p>
                                    </div>
                                    <div className="p-6 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-pink-500/10 rounded-2xl border border-amber-500/20">
                                        <p className="text-lg font-medium text-white text-center">The question isn't "what does a lead cost?"—it's <span className="text-amber-400 font-bold">"what does inconsistency cost you?"</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 6. Partnership Section */}
                <section className="py-20 border-b border-white/5 bg-slate-900/30" ref={partnershipAnim.ref}>
                    <div className={`container mx-auto px-6 transition-all duration-700 ${partnershipAnim.isVisible ? "scroll-fade-up" : "scroll-hidden"}`}>
                        <div className="grid lg:grid-cols-2 gap-12 items-center mb-12">
                            <div>
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-purple-400 mb-4 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Partnership
                                </p>
                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white font-inter">
                                    What We Expect <br />
                                    <span className="gradient-text-epiphany">From You</span>
                                </h2>
                                <p className="text-lg text-slate-400">Lead Velocity delivers. But delivery without action is waste.</p>
                            </div>
                            <div className="relative flex justify-center">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/30 via-violet-500/30 to-pink-500/30 rounded-3xl blur-3xl"></div>
                                    <img
                                        src="/src/assets/einstein-calls.png"
                                        alt="Einstein on calls with team"
                                        className="relative w-full max-w-sm rounded-2xl"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="bg-slate-900/60 p-8 rounded-2xl border border-purple-500/20 hover:border-purple-500/40 transition-colors">
                                <h3 className="text-xl font-bold text-purple-400 mb-6 flex items-center gap-2">
                                    <Target className="w-5 h-5" /> Your Responsibility
                                </h3>
                                <div className="space-y-4">
                                    {[
                                        { title: "Speed-to-Contact", desc: "Leads contacted within 5 minutes convert dramatically higher." },
                                        { title: "Follow-Up Discipline", desc: "Structured follow-up sequences are non-negotiable." },
                                        { title: "CRM Usage", desc: "Track, status, and work leads systematically." }
                                    ].map((item, i) => (
                                        <div key={i} className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
                                            <h4 className="font-bold text-white mb-1">{item.title}</h4>
                                            <p className="text-sm text-slate-400">{item.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-slate-900/60 p-8 rounded-2xl border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
                                <h3 className="text-xl font-bold text-emerald-400 mb-6 flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5" /> Our Responsibility
                                </h3>
                                <div className="space-y-4">
                                    {[
                                        { title: "Quality Leads", desc: "Contacts that match your criteria with genuine interest." },
                                        { title: "Predictable Delivery", desc: "Weekly batches you can plan around. No surprises." },
                                        { title: "Ongoing Optimisation", desc: "Continuous refinement based on conversion data." }
                                    ].map((item, i) => (
                                        <div key={i} className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
                                            <h4 className="font-bold text-white mb-1">{item.title}</h4>
                                            <p className="text-sm text-slate-400">{item.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 7. Form Section */}
                <section
                    id="strategy-form"
                    ref={formAnim.ref}
                    className={`py-20 transition-all duration-700 ${formAnim.isVisible ? "scroll-fade-up" : "scroll-hidden"}`}
                >
                    <div className="container mx-auto px-6">
                        <div className="grid lg:grid-cols-2 gap-12 items-center mb-12">
                            <div className="relative flex justify-center order-2 lg:order-1">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-green-500/30 via-emerald-500/30 to-cyan-500/30 rounded-3xl blur-3xl"></div>
                                    <img
                                        src="/src/assets/einstein-cta.png"
                                        alt="Einstein pointing to Join Now"
                                        className="relative w-full max-w-sm rounded-2xl"
                                    />
                                </div>
                            </div>
                            <div className="order-1 lg:order-2">
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-emerald-400 mb-4">Strategy Diagnostic</p>
                                <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white font-inter">
                                    Lead Readiness & <br />
                                    <span className="gradient-text-epiphany">Strategy Snapshot</span>
                                </h2>
                                <p className="text-slate-400">Complete this diagnostic to help us prepare for your strategy call.</p>
                            </div>
                        </div>

                        <Card className="max-w-4xl mx-auto bg-slate-900/40 border-white/5 backdrop-blur-xl shadow-2xl rounded-[2.5rem] overflow-hidden">
                            <CardContent className="p-8 lg:p-12 relative">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                                <form onSubmit={handleSubmit} className="space-y-12 relative z-10">

                                    {/* Operational Inputs - Kept for Strategy Snapshot Value */}
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                                <Users className="h-5 w-5 text-blue-400" />
                                            </div>
                                            <h4 className="text-xl font-bold text-white">Operational Readiness</h4>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">CRM Usage</Label>
                                                <Select value={formData.crmUsage} onValueChange={(v) => handleInputChange('crmUsage', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select CRM usage" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="full">Yes – full CRM (HubSpot/Pipedrive/etc)</SelectItem>
                                                        <SelectItem value="basic">Basic Tracking (Excel/Sheets)</SelectItem>
                                                        <SelectItem value="none">None / Manual notes</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Speed to First Contact</Label>
                                                <Select value={formData.speedToContact} onValueChange={(v) => handleInputChange('speedToContact', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select contact speed" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="5min">Within 5 minutes (Industry Standard)</SelectItem>
                                                        <SelectItem value="30min">Within 30 minutes</SelectItem>
                                                        <SelectItem value="sameDay">Same day</SelectItem>
                                                        <SelectItem value="nextDay">Next day or later</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Team Size Handling Leads</Label>
                                                <Select value={formData.teamSize} onValueChange={(v) => handleInputChange('teamSize', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select team size" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="solo">Solo Operator</SelectItem>
                                                        <SelectItem value="small">Small Team (2–5 agents)</SelectItem>
                                                        <SelectItem value="dedicated">Dedicated Lead Team</SelectItem>
                                                        <SelectItem value="unclear">Currently scaling/undefined</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Follow-up Process Clarity</Label>
                                                <Select value={formData.followUpClarity} onValueChange={(v) => handleInputChange('followUpClarity', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select process clarity" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="clear">Clear (Defined touchpoints)</SelectItem>
                                                        <SelectItem value="basic">Basic (Occasional follow-up)</SelectItem>
                                                        <SelectItem value="none">None / No defined process</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Budget & Spend */}
                                    <div className="space-y-8 pt-8 border-t border-white/5">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                                <BarChart3 className="h-5 w-5 text-emerald-400" />
                                            </div>
                                            <h4 className="text-xl font-bold text-white">Budget Alignment</h4>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Monthly Lead Spend Range</Label>
                                                <Select value={formData.monthlySpend} onValueChange={(v) => handleInputChange('monthlySpend', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select spend range" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="under5k">Under R5k</SelectItem>
                                                        <SelectItem value="5k-15k">R5k – R15k</SelectItem>
                                                        <SelectItem value="15k-30k">R15k – R30k</SelectItem>
                                                        <SelectItem value="30k+">R30k+</SelectItem>
                                                        <SelectItem value="none">Not currently spending</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Cost-per-Lead Awareness</Label>
                                                <Select value={formData.cplAwareness} onValueChange={(v) => handleInputChange('cplAwareness', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select awareness" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="yes">Yes (Tracked exactly)</SelectItem>
                                                        <SelectItem value="rough">Rough idea</SelectItem>
                                                        <SelectItem value="no">No knowledge of exact CPL</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3 md:col-span-2">
                                                <Label className="text-slate-200 font-semibold">Pricing Comfort</Label>
                                                <Select value={formData.pricingComfort} onValueChange={(v) => handleInputChange('pricingComfort', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select pricing comfort" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="comfortable">Comfortable (Value over lowest price)</SelectItem>
                                                        <SelectItem value="flexible">Flexible (Willing to invest for quality)</SelectItem>
                                                        <SelectItem value="sensitive">Very price-sensitive (Need lowest cost)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Volume & Capacity */}
                                    <div className="space-y-8 pt-8 border-t border-white/5">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                                <TrendingUp className="h-5 w-5 text-amber-400" />
                                            </div>
                                            <h4 className="text-xl font-bold text-white">Volume & Capacity</h4>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Desired Leads Per Week</Label>
                                                <Input
                                                    type="number"
                                                    value={formData.desiredLeadsWeekly}
                                                    onChange={(e) => handleInputChange('desiredLeadsWeekly', parseInt(e.target.value) || 0)}
                                                    className="bg-white/5 border-white/10 h-12 rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Max Realistic Capacity Weekly</Label>
                                                <Input
                                                    type="number"
                                                    value={formData.maxCapacityWeekly}
                                                    onChange={(e) => handleInputChange('maxCapacityWeekly', parseInt(e.target.value) || 0)}
                                                    className="bg-white/5 border-white/10 h-12 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Growth & Intent */}
                                    <div className="space-y-8 pt-8 border-t border-white/5">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                                <Target className="h-5 w-5 text-purple-400" />
                                            </div>
                                            <h4 className="text-xl font-bold text-white">Growth & Intent</h4>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Product Focus Clarity</Label>
                                                <Select value={formData.productFocusClarity} onValueChange={(v) => handleInputChange('productFocusClarity', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select focus" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="clear">Clear Specific Product</SelectItem>
                                                        <SelectItem value="multiple">Multiple but defined</SelectItem>
                                                        <SelectItem value="unclear">Everything / Undefined</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Geographic Focus</Label>
                                                <Select value={formData.geographicFocusClarity} onValueChange={(v) => handleInputChange('geographicFocusClarity', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select geography" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="clear">Clear (Province/City)</SelectItem>
                                                        <SelectItem value="semi">Semi-defined</SelectItem>
                                                        <SelectItem value="undefined">National / Undefined</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Growth Goal Clarity</Label>
                                                <Select value={formData.growthGoalClarity} onValueChange={(v) => handleInputChange('growthGoalClarity', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select goals" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="numeric">Specific Numeric Goals</SelectItem>
                                                        <SelectItem value="general">General Growth</SelectItem>
                                                        <SelectItem value="vague">Vague / Uncertain</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-slate-200 font-semibold">Timeline to Start</Label>
                                                <Select value={formData.timeline} onValueChange={(v) => handleInputChange('timeline', v)}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                                        <SelectValue placeholder="Select timeline" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-white/10">
                                                        <SelectItem value="immediate">Immediate</SelectItem>
                                                        <SelectItem value="30days">Within 30 Days</SelectItem>
                                                        <SelectItem value="exploring">Just Exploring</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Submit Section */}
                                    <div className="pt-12 border-t border-white/5 space-y-8">
                                        <div className="bg-white/5 p-8 rounded-3xl text-sm text-slate-400 leading-relaxed italic border border-white/5">
                                            "Submission initiates our deterministic scoring engine. You will receive a composite success probability score based on your operational and budgetary inputs. This data remains strictly confidential."
                                        </div>
                                        <Button
                                            type="submit"
                                            size="lg"
                                            className="w-full h-20 text-xl font-black bg-primary text-white transition-all duration-500 hover:scale-[1.02] active:scale-95 rounded-2xl shadow-2xl shadow-primary/30 group uppercase tracking-widest"
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting ? (
                                                <div className="flex items-center gap-3">
                                                    <Zap className="h-6 w-6 animate-pulse" />
                                                    Crunching Analysis Data...
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    Run Readiness Analysis
                                                    <ArrowRight className="h-6 w-6 group-hover:translate-x-2 transition-transform" />
                                                </div>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <Footer />
            </div>
        </div>
    );
};

export default BrokerOnboarding;

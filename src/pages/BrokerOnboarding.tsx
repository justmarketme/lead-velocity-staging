import React, { useState } from "react";
import {
    ArrowRight, Sparkles, Target, Zap, ChevronDown, Clock, MoveRight, Users, Settings2, BarChart2, Briefcase, Mail, Phone, CheckCircle2
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { useNavigate } from "react-router-dom";
import { calculateScores, OnboardingData } from "@/lib/scoring";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import einsteinGeniusNeon from "@/assets/einstein-hero-new.png";
import einsteinPointing from "@/assets/einstein-solution-new.png";
import missionControlNeon from "@/assets/einstein-targeting-new.png";
import precisionTargeting from "@/assets/einstein-qualified-new.png";
import einsteinRetention from "@/assets/einstein-roi-new.png";
import einsteinCalls from "@/assets/einstein-expectation-new.png";
import einsteinCta from "@/assets/einstein-join-now-final.png";
import leadVelocityLogo from "@/assets/lead-velocity-logo.png";
import { Textarea } from "@/components/ui/textarea"; // Assuming Textarea is also needed

const BrokerOnboarding = () => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Contact form state (matches live site leadvelocity.co.za/onboarding)
    const [contactForm, setContactForm] = useState({
        fullName: "",
        email: "",
        phone: "",
        companyName: "",
        preferredCallTime: "",
        whatsappNumber: "",
        whatsappConsent: false,
    });
    const [receivesLeadsCurrently, setReceivesLeadsCurrently] = useState<boolean | null>(null);
    const [budgetCapacityForm, setBudgetCapacityForm] = useState({
        monthlySpend: "",
        cplAwareness: "",
        desiredLeadsWeekly: "",
        maxCapacityWeekly: "",
        teamSize: "",
    });

    const [targetMarketForm, setTargetMarketForm] = useState({
        productFocus: [] as string[],
        geographicFocus: "",
        idealClient: "",
    });
    const [systemsProcessForm, setSystemsProcessForm] = useState({
        crmUsage: "",
        speedToContact: "",
        followUpProcess: "",
    });
    const [currentLeadGenerationForm, setCurrentLeadGenerationForm] = useState({
        provider: "",
        monthlySpend: "",
        cpl: "",
        conversionRate: "",
    });
    const [goalsTargetsForm, setGoalsTargetsForm] = useState({
        monthlySalesTarget: "",
        growthGoals: "",
    });

    const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; phone?: string }>({});
    const [stepErrors, setStepErrors] = useState<string | null>(null);

    const nextStep = () => {
        setStepErrors(null);
        if (step === 1) {
            if (!validateContactForm()) return;
            setStep(2);
        } else if (step === 2) {
            if (receivesLeadsCurrently === null) {
                setStepErrors("Please select an option to continue");
                return;
            }
            if (receivesLeadsCurrently === true) {
                if (!currentLeadGenerationForm.provider || !currentLeadGenerationForm.monthlySpend || !currentLeadGenerationForm.cpl || !currentLeadGenerationForm.conversionRate) {
                    setStepErrors("Please fill out all fields.");
                    return;
                }
            }
            setStep(3);
        } else if (step === 3) {
            if (!budgetCapacityForm.monthlySpend || !budgetCapacityForm.cplAwareness || !budgetCapacityForm.desiredLeadsWeekly || !budgetCapacityForm.maxCapacityWeekly || !budgetCapacityForm.teamSize) {
                setStepErrors("Please fill out all fields.");
                return;
            }
            setStep(4);
        } else if (step === 4) {
            if (targetMarketForm.productFocus.length === 0 || !targetMarketForm.geographicFocus || !targetMarketForm.idealClient) {
                setStepErrors("Please fill out all fields.");
                return;
            }
            setStep(5);
        } else if (step === 5) {
            if (!systemsProcessForm.crmUsage || !systemsProcessForm.speedToContact || !systemsProcessForm.followUpProcess) {
                setStepErrors("Please fill out all fields.");
                return;
            }
            setStep(6);
        } else if (step === 6) {
            if (!goalsTargetsForm.monthlySalesTarget || !goalsTargetsForm.growthGoals) {
                setStepErrors("Please fill out all fields.");
                return;
            }
            // Form is valid, submit handles the rest.
        }
    };

    const prevStep = () => setStep(s => Math.max(1, s - 1));

    const defaultScoringData: OnboardingData = {
        crmUsage: "none",
        speedToContact: "nextDay",
        teamSize: "solo",
        followUpClarity: "none",
        monthlySpend: "none",
        cplAwareness: "no",
        pricingComfort: "sensitive",
        desiredLeadsWeekly: 10,
        maxCapacityWeekly: 20,
        productFocusClarity: "unclear",
        geographicFocusClarity: "undefined",
        growthGoalClarity: "vague",
        timeline: "exploring",
    };

    // Animations
    const heroAnim = useScrollAnimation();
    const problemAnim = useScrollAnimation();
    const mechanismAnim = useScrollAnimation();
    const qualityAnim = useScrollAnimation();
    const investmentAnim = useScrollAnimation();
    const partnershipAnim = useScrollAnimation();
    const formAnim = useScrollAnimation();

    const validateContactForm = (): boolean => {
        const err: { fullName?: string; email?: string; phone?: string } = {};
        if (!contactForm.fullName?.trim()) err.fullName = "Name is required";
        if (!contactForm.email?.trim()) err.email = "Valid email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email)) err.email = "Valid email is required";
        if (!contactForm.phone?.trim()) err.phone = "Please enter a valid phone number";
        setFieldErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (step !== 6) {
            // Prevent accidental submission if 'Enter' is pressed on earlier steps
            return;
        }

        if (!goalsTargetsForm.monthlySalesTarget || !goalsTargetsForm.growthGoals) {
            setStepErrors("Please fill out all Goals & Targets fields before submitting.");
            return;
        }

        setIsSubmitting(true);
        setFieldErrors({});
        setStepErrors(null);

        try {
            const scoringData: OnboardingData = {
                ...defaultScoringData,
                monthlySpend: budgetCapacityForm.monthlySpend as any,
                cplAwareness: budgetCapacityForm.cplAwareness as any,
                desiredLeadsWeekly: parseInt(budgetCapacityForm.desiredLeadsWeekly) || 10,
                maxCapacityWeekly: parseInt(budgetCapacityForm.maxCapacityWeekly) || 20,
                teamSize: budgetCapacityForm.teamSize as any,
                productFocusClarity: targetMarketForm.idealClient, // Using ideal client description for product focus clarity
                geographicFocusClarity: targetMarketForm.geographicFocus,
                crmUsage: systemsProcessForm.crmUsage as any,
                speedToContact: systemsProcessForm.speedToContact as any,
                followUpClarity: systemsProcessForm.followUpProcess as any,
                growthGoalClarity: goalsTargetsForm.growthGoals,
            };

            const results = calculateScores(scoringData);
            const { data: { user } } = await supabase.auth.getUser();

            const { data: responseData, error: responseError } = await supabase
                .from('broker_onboarding_responses')
                .insert([{
                    broker_id: user?.id,
                    full_name: contactForm.fullName.trim() || null,
                    email: contactForm.email.trim() || null,
                    phone: contactForm.phone.trim() || null,
                    company_name: contactForm.companyName.trim() || null,
                    preferred_call_time: contactForm.preferredCallTime || null,
                    whatsapp_number: contactForm.whatsappNumber.trim() || null,
                    whatsapp_consent: contactForm.whatsappConsent,
                    receives_leads_currently: receivesLeadsCurrently,
                    current_lead_provider: receivesLeadsCurrently ? currentLeadGenerationForm.provider : null,
                    current_monthly_spend: receivesLeadsCurrently ? parseFloat(currentLeadGenerationForm.monthlySpend) : null,
                    current_cpl: receivesLeadsCurrently ? parseFloat(currentLeadGenerationForm.cpl) : null,
                    current_conversion_rate: receivesLeadsCurrently ? currentLeadGenerationForm.conversionRate : null,
                    crm_usage: scoringData.crmUsage,
                    speed_to_contact: scoringData.speedToContact,
                    team_size: scoringData.teamSize,
                    follow_up_process: scoringData.followUpClarity,
                    monthly_lead_spend: scoringData.monthlySpend,
                    cpl_awareness: scoringData.cplAwareness,
                    pricing_comfort: scoringData.pricingComfort,
                    desired_leads_weekly: scoringData.desiredLeadsWeekly,
                    max_capacity_weekly: scoringData.maxCapacityWeekly,
                    product_focus_clarity: scoringData.productFocusClarity,
                    geographic_focus_clarity: scoringData.geographicFocusClarity,
                    growth_goal_clarity: scoringData.growthGoalClarity,
                    timeline_to_start: scoringData.timeline,
                    monthly_sales_target: parseFloat(goalsTargetsForm.monthlySalesTarget) || null,
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
                description: "There was a problem submitting your application. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-[#020617] text-white flex flex-col font-sans selection:bg-primary/30">
                <div className="flex-grow flex flex-col pt-20">
                    <section className="relative px-6 py-20 overflow-hidden flex-grow flex items-center justify-center">
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] opacity-50 pointer-events-none"></div>

                        <div className="relative z-10 max-w-2xl w-full mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">

                            <div className="text-center mb-10">
                                <div className="flex justify-center mb-8">
                                    <img src={leadVelocityLogo} alt="Lead Velocity Logo" className="h-20 w-auto object-contain" />
                                </div>
                                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-purple-900/20 border border-purple-500/30 mb-8 shadow-[0_0_40px_rgba(168,85,247,0.15)] relative">
                                    <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl"></div>
                                    <CheckCircle2 className="w-12 h-12 text-purple-400 relative z-10" strokeWidth={1.5} />
                                </div>
                                <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-purple-400/80 mb-4">Submission Complete</h3>
                                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold font-inter text-white leading-tight mb-1 tracking-tight">
                                    Your Strategy Snapshot
                                </h1>
                                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold font-inter bg-clip-text text-transparent bg-gradient-to-r from-[#c026d3] via-[#ec4899] to-[#fbbf24] mb-6 tracking-tight">
                                    Has Been Received
                                </h1>
                                <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed font-sans">
                                    A Lead Velocity consultant will review your answers and prepare a tailored recommendation before your meeting. Expect a follow-up within 24-48 hours.
                                </p>
                            </div>

                            <Card className="bg-[#0c0c0c] border-[#1f1f1f] mb-8 overflow-hidden rounded-2xl">
                                <CardContent className="p-8 md:p-10">
                                    <h3 className="text-lg font-bold text-center text-white mb-8">What Happens Next</h3>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4 bg-[#080808] border border-white/5 p-4 rounded-xl">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-purple-500/20">
                                                <CheckCircle2 className="w-4 h-4 text-purple-400" />
                                            </div>
                                            <p className="text-sm text-slate-300 font-medium">Your answers are reviewed by a consultant</p>
                                        </div>
                                        <div className="flex items-center gap-4 bg-[#080808] border border-white/5 p-4 rounded-xl">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-pink-500/20">
                                                <Sparkles className="w-4 h-4 text-pink-400" />
                                            </div>
                                            <p className="text-sm text-slate-300 font-medium">We prepare a tailored strategy based on your setup</p>
                                        </div>
                                        <div className="flex items-center gap-4 bg-[#080808] border border-white/5 p-4 rounded-xl">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-amber-500/20">
                                                <Zap className="w-4 h-4 text-amber-400" />
                                            </div>
                                            <p className="text-sm text-slate-300 font-medium">Your meeting becomes an alignment call</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                                <Button
                                    className="bg-gradient-to-r from-[#d946ef] to-[#f43f5e] hover:from-[#d946ef]/90 hover:to-[#f43f5e]/90 text-white font-semibold h-12 px-8 rounded-xl shadow-lg border-0 min-w-[200px]"
                                    onClick={() => navigate('/')}
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                    </svg>
                                    Go to Home Page
                                </Button>
                                <Button
                                    variant="outline"
                                    className="bg-[#0c0c0c] border-[#1f1f1f] hover:bg-[#1f1f1f] text-white hover:text-[#fbbf24] font-semibold h-12 px-8 rounded-xl min-w-[200px] transition-colors"
                                    onClick={() => {
                                        setSubmitted(false);
                                        setStep(1);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                >
                                    <MoveRight className="w-4 h-4 mr-2 rotate-180" /> Back to Onboarding
                                </Button>
                            </div>

                        </div>
                    </section>
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
                                        src={einsteinGeniusNeon}
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
                                        src={einsteinPointing}
                                        alt="Einstein pointing at solutions"
                                        className="relative w-full max-w-sm rounded-2xl"
                                    />
                                </div>
                            </div>
                            {/* Right Column - Text */}
                            <div>
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-pink-400 flex items-center gap-2 mb-4">
                                    <Sparkles className="w-4 h-4" /> The Problem
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
                                { title: "Don't Convert", desc: "Contacts who were never interested or qualified.", icon: CheckCircle2 },
                                { title: "Inconsistent", desc: "Twenty leads one week, none the next.", icon: BarChart2 },
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
                                    src={missionControlNeon}
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
                                    <CheckCircle2 className="w-4 h-4" /> Quality Defined
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
                                        src={precisionTargeting}
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
                                    <Sparkles className="text-rose-500 h-6 w-6" /> What Doesn't
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
                                            <Sparkles className="w-5 h-5 text-rose-500 shrink-0" /> {item}
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
                                        src={einsteinRetention}
                                        alt="Einstein showing ROI growth"
                                        className="relative w-full max-w-sm rounded-2xl"
                                    />
                                </div>
                            </div>
                            {/* Right - Content */}
                            <div className="order-1 lg:order-2">
                                <p className="text-sm font-medium tracking-[0.25em] uppercase text-amber-400 mb-4 flex items-center gap-2">
                                    <BarChart2 className="w-4 h-4" /> Investment Reality
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
                                        src={einsteinCalls}
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
                                        src={einsteinCta}
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

                        <Card className="max-w-3xl mx-auto bg-slate-900/40 border-white/5 backdrop-blur-xl shadow-2xl rounded-2xl sm:rounded-3xl overflow-hidden border border-primary/20 shadow-[0_20px_80px_-20px_hsl(var(--primary)/0.3)]">
                            <CardContent className="p-4 sm:p-6 md:p-8 lg:p-12 relative">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
                                <div className="flex justify-center mb-10 relative z-20">
                                    <img src={leadVelocityLogo} alt="Lead Velocity Logo" className="h-16 w-auto object-contain" />
                                </div>
                                <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                                    {/* Step indicator */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between relative mt-4">
                                            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-800 -z-10 -translate-y-1/2 rounded-full"></div>
                                            <div
                                                className="absolute top-1/2 left-0 h-0.5 bg-gradient-to-r from-primary to-purple-600 -z-10 -translate-y-1/2 transition-all duration-500 rounded-full"
                                                style={{ width: `${((step - 1) / 5) * 100}%` }}
                                            ></div>
                                            {[1, 2, 3, 4, 5, 6].map((num) => (
                                                <div
                                                    key={num}
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-500 cursor-pointer ${step >= num
                                                        ? 'bg-gradient-to-br from-primary to-purple-600 border-transparent text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                                                        : 'bg-slate-900 border-slate-700 text-slate-400'
                                                        }`}
                                                    onClick={() => step > num && setStep(num as 1 | 2 | 3 | 4 | 5 | 6)}
                                                >
                                                    {num}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Step 1: Contact Information */}
                                    {step === 1 && (
                                        <div className="p-6 sm:p-8 rounded-xl bg-slate-900/60 border border-white/5 animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="space-y-2 mb-6">
                                                <h3 className="text-xl font-semibold text-white">Contact Information</h3>
                                                <p className="text-slate-400 text-sm">Let&apos;s start with your details so we can reach you.</p>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="contact_name" className="text-sm font-medium text-slate-200">Full Name *</Label>
                                                    <Input
                                                        id="contact_name"
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                        placeholder="John Smith"
                                                        value={contactForm.fullName}
                                                        onChange={(e) => setContactForm((p) => ({ ...p, fullName: e.target.value }))}
                                                    />
                                                    {fieldErrors.fullName && <p className="text-xs text-destructive">{fieldErrors.fullName}</p>}
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="contact_email" className="text-sm font-medium text-slate-200">Email Address *</Label>
                                                    <Input
                                                        id="contact_email"
                                                        type="email"
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                        placeholder="john@example.com"
                                                        value={contactForm.email}
                                                        onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                                                    />
                                                    {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="contact_phone" className="text-sm font-medium text-slate-200">Phone Number *</Label>
                                                    <Input
                                                        id="contact_phone"
                                                        type="tel"
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                        placeholder="+27 82 123 4567"
                                                        value={contactForm.phone}
                                                        onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                                                    />
                                                    {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="company_name" className="text-sm font-medium text-slate-200">Company / Brokerage Name</Label>
                                                    <Input
                                                        id="company_name"
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                        placeholder="ABC Insurance Brokers"
                                                        value={contactForm.companyName}
                                                        onChange={(e) => setContactForm((p) => ({ ...p, companyName: e.target.value }))}
                                                    />
                                                </div>
                                                <div className="pt-4 border-t border-white/5 space-y-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-medium text-slate-200">Preferred Time for a Call</Label>
                                                        <Select value={contactForm.preferredCallTime} onValueChange={(v) => setContactForm((p) => ({ ...p, preferredCallTime: v }))}>
                                                            <SelectTrigger className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md">
                                                                <SelectValue placeholder="When would you prefer we call?" />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-slate-900 border-white/10">
                                                                <SelectItem value="morning">Morning (8am - 12pm)</SelectItem>
                                                                <SelectItem value="early-afternoon">Early Afternoon (12pm - 2pm)</SelectItem>
                                                                <SelectItem value="late-afternoon">Late Afternoon (2pm - 5pm)</SelectItem>
                                                                <SelectItem value="evening">Evening (5pm - 7pm)</SelectItem>
                                                                <SelectItem value="anytime">Anytime during business hours</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="whatsapp_number" className="text-sm font-medium text-slate-200">WhatsApp Number</Label>
                                                        <Input
                                                            id="whatsapp_number"
                                                            type="tel"
                                                            className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                            placeholder="+27 82 123 4567"
                                                            value={contactForm.whatsappNumber}
                                                            onChange={(e) => setContactForm((p) => ({ ...p, whatsappNumber: e.target.value }))}
                                                        />
                                                        <p className="text-xs text-muted-foreground">Leave blank if same as phone number above</p>
                                                    </div>
                                                    <div className="flex items-start space-x-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                                                        <Checkbox
                                                            id="whatsapp_consent"
                                                            checked={contactForm.whatsappConsent}
                                                            onCheckedChange={(checked) => setContactForm((p) => ({ ...p, whatsappConsent: checked === true }))}
                                                            className="mt-0.5 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                                        />
                                                        <div className="space-y-1">
                                                            <Label htmlFor="whatsapp_consent" className="cursor-pointer text-sm font-medium text-slate-200">I&apos;m happy to be contacted via WhatsApp</Label>
                                                            <p className="text-xs text-muted-foreground">We&apos;ll use WhatsApp to send quick updates and coordinate your strategy call.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 2: Current Lead Generation */}
                                    {step === 2 && (
                                        <div className="p-6 sm:p-8 rounded-xl bg-slate-900/60 border border-white/5 animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="space-y-2 mb-6">
                                                <h3 className="text-xl font-semibold text-white">Current Lead Generation</h3>
                                                <p className="text-slate-400 text-sm">Tell us about your current lead situation.</p>
                                            </div>
                                            <div className="space-y-6">
                                                <div className="space-y-4">
                                                    <Label className="text-sm font-medium text-slate-200 block text-lg mb-4">Do you currently receive leads from any provider?</Label>
                                                    <div className="flex items-center space-x-6">
                                                        <div className="flex items-center space-x-2">
                                                            <div
                                                                className={`w-5 h-5 rounded-full border border-primary flex items-center justify-center cursor-pointer transition-colors ${receivesLeadsCurrently === true ? 'border-primary' : 'border-slate-500 hover:border-primary/50'}`}
                                                                onClick={() => setReceivesLeadsCurrently(true)}
                                                            >
                                                                {receivesLeadsCurrently === true && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                                                            </div>
                                                            <Label className="cursor-pointer text-white text-base" onClick={() => setReceivesLeadsCurrently(true)}>Yes</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <div
                                                                className={`w-5 h-5 rounded-full border border-primary flex items-center justify-center cursor-pointer transition-colors ${receivesLeadsCurrently === false ? 'border-primary' : 'border-slate-500 hover:border-primary/50'}`}
                                                                onClick={() => setReceivesLeadsCurrently(false)}
                                                            >
                                                                {receivesLeadsCurrently === false && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                                                            </div>
                                                            <Label className="cursor-pointer text-white text-base" onClick={() => setReceivesLeadsCurrently(false)}>No</Label>
                                                        </div>
                                                    </div>
                                                </div>

                                                {receivesLeadsCurrently === true && (
                                                    <div className="space-y-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-4 duration-500">
                                                        <div className="space-y-2">
                                                            <Label className="text-sm font-medium text-slate-200 block">Who provides your leads?</Label>
                                                            <Input
                                                                className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                                placeholder="e.g., XYZ Leads, Facebook Ads, Referrals"
                                                                value={currentLeadGenerationForm.provider}
                                                                onChange={(e) => setCurrentLeadGenerationForm(p => ({ ...p, provider: e.target.value }))}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-sm font-medium text-slate-200 block">Average Monthly Spend (R)</Label>
                                                                <Input
                                                                    type="number"
                                                                    className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                                    placeholder="5000"
                                                                    value={currentLeadGenerationForm.monthlySpend}
                                                                    onChange={(e) => setCurrentLeadGenerationForm(p => ({ ...p, monthlySpend: e.target.value }))}
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-sm font-medium text-slate-200 block">Est. Cost Per Lead (R)</Label>
                                                                <Input
                                                                    type="number"
                                                                    className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                                    placeholder="150"
                                                                    value={currentLeadGenerationForm.cpl}
                                                                    onChange={(e) => setCurrentLeadGenerationForm(p => ({ ...p, cpl: e.target.value }))}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-sm font-medium text-slate-200 block">Conversion Rate (if known)</Label>
                                                            <Select value={currentLeadGenerationForm.conversionRate} onValueChange={(v) => setCurrentLeadGenerationForm(p => ({ ...p, conversionRate: v }))}>
                                                                <SelectTrigger className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md">
                                                                    <SelectValue placeholder="Select your conversion rate" />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-slate-900 border-white/10">
                                                                    <SelectItem value="Under 2%">Under 2%</SelectItem>
                                                                    <SelectItem value="2% - 5%">2% - 5%</SelectItem>
                                                                    <SelectItem value="5% - 10%">5% - 10%</SelectItem>
                                                                    <SelectItem value="10% - 20%">10% - 20%</SelectItem>
                                                                    <SelectItem value="20%+">20%+</SelectItem>
                                                                    <SelectItem value="Not tracked">Not tracked</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 3: Budget & Capacity */}
                                    {step === 3 && (
                                        <div className="p-6 sm:p-8 rounded-xl bg-slate-900/60 border border-white/5 animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="space-y-2 mb-6">
                                                <h3 className="text-xl font-semibold text-white">Budget & Capacity</h3>
                                                <p className="text-slate-400 text-sm">Help us understand your investment capacity.</p>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200">Monthly Lead Generation Budget (R)</Label>
                                                    <Input
                                                        type="number"
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                        placeholder="10000"
                                                        value={budgetCapacityForm.monthlySpend}
                                                        onChange={(e) => setBudgetCapacityForm(p => ({ ...p, monthlySpend: e.target.value }))}
                                                    />
                                                    <p className="text-xs text-muted-foreground">What can you comfortably allocate monthly?</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200">Comfort Range Per Lead</Label>
                                                    <Select value={budgetCapacityForm.cplAwareness} onValueChange={(v) => setBudgetCapacityForm(p => ({ ...p, cplAwareness: v }))}>
                                                        <SelectTrigger className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md">
                                                            <SelectValue placeholder="Select your comfort range" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-white/10">
                                                            <SelectItem value="R50 - R100">R50 - R100</SelectItem>
                                                            <SelectItem value="R100 - R200">R100 - R200</SelectItem>
                                                            <SelectItem value="R200 - R350">R200 - R350</SelectItem>
                                                            <SelectItem value="R350 - R500">R350 - R500</SelectItem>
                                                            <SelectItem value="R500+">R500+</SelectItem>
                                                            <SelectItem value="Depends on quality">Depends on quality</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-medium text-slate-200">Ideal Leads Per Week</Label>
                                                        <Input
                                                            type="number"
                                                            className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                            placeholder="20"
                                                            value={budgetCapacityForm.desiredLeadsWeekly}
                                                            onChange={(e) => setBudgetCapacityForm(p => ({ ...p, desiredLeadsWeekly: e.target.value }))}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-medium text-slate-200">Max Leads You Can Handle</Label>
                                                        <Input
                                                            type="number"
                                                            className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                            placeholder="40"
                                                            value={budgetCapacityForm.maxCapacityWeekly}
                                                            onChange={(e) => setBudgetCapacityForm(p => ({ ...p, maxCapacityWeekly: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200">Team Size (including you)</Label>
                                                    <Select value={budgetCapacityForm.teamSize} onValueChange={(v) => setBudgetCapacityForm(p => ({ ...p, teamSize: v }))}>
                                                        <SelectTrigger className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md">
                                                            <SelectValue placeholder="Select team size" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-white/10">
                                                            <SelectItem value="Just me">Just me</SelectItem>
                                                            <SelectItem value="2 people">2 people</SelectItem>
                                                            <SelectItem value="3-5 people">3-5 people</SelectItem>
                                                            <SelectItem value="6-10 people">6-10 people</SelectItem>
                                                            <SelectItem value="10+ people">10+ people</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 4: Target Market */}
                                    {step === 4 && (
                                        <div className="p-6 sm:p-8 rounded-xl bg-slate-900/60 border border-white/5 animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="space-y-2 mb-6">
                                                <h3 className="text-xl font-semibold text-white">Target Market</h3>
                                                <p className="text-slate-400 text-sm">Define who you want to reach.</p>
                                            </div>
                                            <div className="space-y-6">
                                                <div className="space-y-4">
                                                    <Label className="text-sm font-medium text-slate-200 block">Product Focus (select all that apply)</Label>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {['Life Insurance', 'Medical Aid', 'Retirement Planning', 'Business Insurance', 'Other', 'Short-term Insurance', 'Gap Cover', 'Investment Products', 'Funeral Cover'].map(product => (
                                                            <div key={product} className="flex items-center space-x-3">
                                                                <div
                                                                    className={`w-5 h-5 rounded-full border border-primary flex items-center justify-center cursor-pointer transition-colors ${targetMarketForm.productFocus.includes(product) ? 'border-primary' : 'border-slate-500 hover:border-primary/50'}`}
                                                                    onClick={() => {
                                                                        const prev = targetMarketForm.productFocus;
                                                                        setTargetMarketForm(p => ({
                                                                            ...p,
                                                                            productFocus: prev.includes(product) ? prev.filter(x => x !== product) : [...prev, product]
                                                                        }))
                                                                    }}
                                                                >
                                                                    {targetMarketForm.productFocus.includes(product) && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                                                                </div>
                                                                <Label className="cursor-pointer text-white text-sm font-medium" onClick={() => {
                                                                    const prev = targetMarketForm.productFocus;
                                                                    setTargetMarketForm(p => ({
                                                                        ...p,
                                                                        productFocus: prev.includes(product) ? prev.filter(x => x !== product) : [...prev, product]
                                                                    }))
                                                                }}>{product}</Label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-2 pt-2">
                                                    <Label className="text-sm font-medium text-slate-200 block">Geographic Focus</Label>
                                                    <Input
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                        placeholder="e.g., Gauteng, Western Cape, Nationwide"
                                                        value={targetMarketForm.geographicFocus}
                                                        onChange={(e) => setTargetMarketForm(p => ({ ...p, geographicFocus: e.target.value }))}
                                                    />
                                                </div>
                                                <div className="space-y-2 pt-2">
                                                    <Label className="text-sm font-medium text-slate-200 block">Describe Your Ideal Client</Label>
                                                    <Textarea
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 rounded-md min-h-[80px]"
                                                        placeholder="e.g., Professionals aged 35-55, household income R40k+, employed, interested in life cover and retirement planning"
                                                        value={targetMarketForm.idealClient}
                                                        onChange={(e) => setTargetMarketForm(p => ({ ...p, idealClient: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 5: Systems & Process */}
                                    {step === 5 && (
                                        <div className="p-6 sm:p-8 rounded-xl bg-slate-900/60 border border-white/5 animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="space-y-2 mb-6">
                                                <h3 className="text-xl font-semibold text-white">Systems & Process</h3>
                                                <p className="text-slate-400 text-sm">Tell us about your operational setup.</p>
                                            </div>
                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200">CRM System Used</Label>
                                                    <Select value={systemsProcessForm.crmUsage} onValueChange={(v) => setSystemsProcessForm(p => ({ ...p, crmUsage: v }))}>
                                                        <SelectTrigger className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md">
                                                            <SelectValue placeholder="Select your CRM" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-white/10">
                                                            <SelectItem value="None / Spreadsheets">None / Spreadsheets</SelectItem>
                                                            <SelectItem value="Salesforce">Salesforce</SelectItem>
                                                            <SelectItem value="HubSpot">HubSpot</SelectItem>
                                                            <SelectItem value="Zoho">Zoho</SelectItem>
                                                            <SelectItem value="Pipedrive">Pipedrive</SelectItem>
                                                            <SelectItem value="Other CRM">Other CRM</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200">Typical Speed to First Contact</Label>
                                                    <Select value={systemsProcessForm.speedToContact} onValueChange={(v) => setSystemsProcessForm(p => ({ ...p, speedToContact: v }))}>
                                                        <SelectTrigger className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md">
                                                            <SelectValue placeholder="How fast do you contact new leads?" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-white/10">
                                                            <SelectItem value="Under 5 minutes">Under 5 minutes</SelectItem>
                                                            <SelectItem value="5-30 minutes">5-30 minutes</SelectItem>
                                                            <SelectItem value="1-2 hours">1-2 hours</SelectItem>
                                                            <SelectItem value="Same day">Same day</SelectItem>
                                                            <SelectItem value="Next business day">Next business day</SelectItem>
                                                            <SelectItem value="Varies significantly">Varies significantly</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200">Follow-Up Process</Label>
                                                    <Textarea
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 rounded-md min-h-[100px]"
                                                        placeholder="Describe your follow up process..."
                                                        value={systemsProcessForm.followUpProcess}
                                                        onChange={(e) => setSystemsProcessForm(p => ({ ...p, followUpProcess: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 6: Goals & Targets */}
                                    {step === 6 && (
                                        <div className="p-6 sm:p-8 rounded-xl bg-slate-900/60 border border-white/5 animate-in fade-in slide-in-from-right-4 duration-500">
                                            <div className="space-y-2 mb-6">
                                                <h3 className="text-xl font-semibold text-white">Goals & Targets</h3>
                                                <p className="text-slate-400 text-sm">What are you working towards?</p>
                                            </div>
                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200">Monthly Sales Target (R)</Label>
                                                    <Input
                                                        type="number"
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 h-10 rounded-md"
                                                        placeholder="100000"
                                                        value={goalsTargetsForm.monthlySalesTarget}
                                                        onChange={(e) => setGoalsTargetsForm(p => ({ ...p, monthlySalesTarget: e.target.value }))}
                                                    />
                                                    <p className="text-xs text-muted-foreground">in premium value or commission, whichever you track</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-medium text-slate-200 block">Growth Goals (Next 3-6 Months)</Label>
                                                    <Textarea
                                                        className="bg-background/50 border-border/50 focus:border-primary/50 rounded-md min-h-[100px]"
                                                        placeholder="What does success look like for you in the next 3-6 months? (e.g., double my client base, hire another advisor, reach R200k monthly premium)"
                                                        value={goalsTargetsForm.growthGoals}
                                                        onChange={(e) => setGoalsTargetsForm(p => ({ ...p, growthGoals: e.target.value }))}
                                                    />
                                                </div>
                                                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mt-8">
                                                    <p className="text-sm text-slate-300 leading-relaxed">
                                                        <span className="font-bold text-white">What happens after you submit:</span> This form does not commit you to anything. Your answers are used to prepare for your meeting. A consultant will review and advise the best approach for your specific situation.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {stepErrors && <p className="text-sm text-destructive font-medium">{stepErrors}</p>}

                                    <div className="flex justify-between pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="gap-2"
                                            onClick={prevStep}
                                            disabled={step === 1 || isSubmitting}
                                        >
                                            <ArrowRight className="h-4 w-4 rotate-180" /> Previous
                                        </Button>

                                        {step < 6 ? (
                                            <Button
                                                type="button"
                                                className="gap-2"
                                                onClick={nextStep}
                                                disabled={isSubmitting}
                                            >
                                                Next
                                                <ArrowRight className="h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <Button type="submit" className="gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white border-0" disabled={isSubmitting || !goalsTargetsForm.monthlySalesTarget || !goalsTargetsForm.growthGoals}>
                                                {isSubmitting ? "Submitting..." : "Submit Snapshot"}
                                                <ArrowRight className="h-4 w-4" />
                                            </Button>
                                        )}
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

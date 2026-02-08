import { useEffect } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";
import { Check, Rocket, Shield, XCircle, Clock } from "lucide-react";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { Link } from "react-router-dom";
import SEO from "@/components/SEO";

const Promotions = () => {
    const headerAnim = useScrollAnimation();
    const cardAnim = useScrollAnimation();

    // Ensure page starts at top when navigated to
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <SEO
                title="Pilot Program Promotion"
                description="Start your 30-day pilot program today. R6,000 for 10 guaranteed qualified business insurance leads. Risk-free validation."
                keywords="pilot program leads, insurance leads promotion, guaranteed leads, broker pilot campaign"
            />
            <ParticleBackground />
            <Navigation />

            {/* Header */}
            <div className="pt-32 pb-16 px-6 container mx-auto text-center" ref={headerAnim.ref}>
                <div className={`inline-block mb-4 px-4 py-1.5 rounded-full border border-secondary/30 bg-secondary/10 text-secondary text-sm font-bold uppercase tracking-widest ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
                    Limited Time Offer
                </div>
                <h1 className={`text-4xl md:text-6xl font-black mb-6 tracking-tight ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.1s' }}>
                    <span className="text-white">Pilot </span>
                    <span className="gradient-text">Program</span>
                </h1>
                <p className={`text-xl text-slate-400 max-w-2xl mx-auto ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}>
                    A structured, low-risk starting point to prove our value. Generate real performance data with zero long-term commitment.
                </p>
            </div>

            {/* Pilot Offer Card */}
            <div className="container mx-auto px-6 pb-32">
                <div className="max-w-4xl mx-auto" ref={cardAnim.ref}>
                    <div className={`relative rounded-3xl border border-secondary/30 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-[0_0_50px_-20px_rgba(236,72,153,0.3)] ${cardAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`}>

                        {/* Top Banner */}
                        <div className="bg-gradient-to-r from-secondary/20 to-secondary/5 border-b border-secondary/20 p-4 text-center">
                            <p className="text-secondary font-bold uppercase tracking-widest text-sm">30-Day Performance Campaign</p>
                        </div>

                        <div className="grid md:grid-cols-2">
                            {/* Left Side: Features & Value */}
                            <div className="p-8 md:p-12 border-b md:border-b-0 md:border-r border-white/10">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="p-3 rounded-xl bg-secondary/10 text-secondary">
                                        <Rocket className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white">Pilot Partnership</h3>
                                        <p className="text-slate-400">Validate our quality risk-free</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">What You Get</h4>
                                        <ul className="space-y-3">
                                            <li className="flex items-start gap-3 text-slate-300">
                                                <Check className="w-5 h-5 text-secondary shrink-0" />
                                                <span><strong className="text-white">10 Guaranteed</strong> Qualified Business Leads</span>
                                            </li>
                                            <li className="flex items-start gap-3 text-slate-300">
                                                <Check className="w-5 h-5 text-secondary shrink-0" />
                                                <span>Verified Decision Makers (Directors/Owners)</span>
                                            </li>
                                            <li className="flex items-start gap-3 text-slate-300">
                                                <Check className="w-5 h-5 text-secondary shrink-0" />
                                                <span>Min. Value: <strong className="text-white">R1M+ Contents</strong> or <strong className="text-white">R4M+ Building</strong></span>
                                            </li>
                                            <li className="flex items-start gap-3 text-slate-300">
                                                <Check className="w-5 h-5 text-secondary shrink-0" />
                                                <span>Target Sectors: Logistics, Engineering, SMEs</span>
                                            </li>
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Strictly Excluded</h4>
                                        <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
                                            <ul className="space-y-2">
                                                <li className="flex items-center gap-2 text-sm text-rose-200/80">
                                                    <XCircle className="w-4 h-4 text-rose-500" />
                                                    <span>Micro businesses below threshold</span>
                                                </li>
                                                <li className="flex items-center gap-2 text-sm text-rose-200/80">
                                                    <XCircle className="w-4 h-4 text-rose-500" />
                                                    <span>Personal lines enquiries</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: Pricing & CTA */}
                            <div className="p-8 md:p-12 flex flex-col justify-center bg-white/[0.02]">
                                <div className="mb-8">
                                    <p className="text-slate-400 font-medium mb-2 uppercase tracking-wide">One-time Investment</p>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-5xl font-black text-white">R6,000</span>
                                        <span className="text-xl text-slate-500">once-off</span>
                                    </div>
                                    <div className="mt-4 flex items-center gap-2 text-slate-400 text-sm">
                                        <Clock className="w-4 h-4" />
                                        <span>30 Days Duration</span>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-8">
                                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                                        <span className="text-slate-400">Cost Per Lead</span>
                                        <span className="text-white font-bold">R600</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-white/10">
                                        <span className="text-slate-400">Commission</span>
                                        <span className="text-white font-bold text-right text-sm">10% of broker commission <br /><span className="text-xs font-normal text-slate-500">(on placed business)</span></span>
                                    </div>
                                </div>

                                <Link to="/onboarding" className="w-full group relative px-8 py-4 bg-secondary hover:bg-secondary/90 text-white font-bold rounded-xl transition-all duration-300 shadow-[0_0_20px_-5px_hsl(330,85%,60%,0.5)] hover:shadow-[0_0_30px_-5px_hsl(330,85%,60%,0.7)] text-center overflow-hidden">
                                    <span className="relative z-10">Start Your Pilot</span>
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                </Link>

                                <p className="mt-6 text-center text-xs text-slate-500 max-w-xs mx-auto">
                                    "We guarantee conservatively and aim to overdeliver rather than inflate volume at the expense of lead quality."
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FAQ / Context */}
                <div className="mt-24 max-w-3xl mx-auto">
                    <h2 className="text-2xl font-bold text-white mb-8 text-center">Why Start with a Pilot?</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-xl bg-slate-900/50 border border-white/5">
                            <h3 className="font-bold text-white mb-2">Prove Quality First</h3>
                            <p className="text-slate-400 text-sm">Don't commit to a long-term contract until you've verified our lead quality for yourself.</p>
                        </div>
                        <div className="p-6 rounded-xl bg-slate-900/50 border border-white/5">
                            <h3 className="font-bold text-white mb-2">Calibrate Targeting</h3>
                            <p className="text-slate-400 text-sm">Use the first 30 days to refine specific geographic and niche targeting preferences.</p>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default Promotions;

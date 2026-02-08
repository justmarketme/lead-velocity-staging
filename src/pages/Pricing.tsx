import { useEffect } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";
import { Check, Zap, Shield, TrendingUp, Star } from "lucide-react";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import SEO from "@/components/SEO";

const PricingTier = ({
    title,
    price,
    leads,
    cpl,
    description,
    features,
    commission,
    notes,
    icon: Icon,
    popular = false,
    colorClass = "text-slate-200",
    borderColor = "border-slate-800",
    animation
}: any) => (
    <div
        ref={animation.ref}
        className={`relative p-8 rounded-2xl border ${borderColor} bg-slate-900/50 backdrop-blur-sm hover:transform hover:scale-105 transition-all duration-300 flex flex-col h-full ${animation.isVisible ? 'animate-fade-up' : 'opacity-0'} ${popular ? 'shadow-[0_0_50px_-12px_rgba(168,85,247,0.5)]' : ''}`}
    >
        {popular && (
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                Recommended
            </div>
        )}

        <div className={`mb-6 p-3 rounded-xl bg-slate-800/50 w-fit ${colorClass}`}>
            <Icon className="w-8 h-8" />
        </div>

        <h3 className={`text-2xl font-bold mb-2 ${colorClass}`}>{title}</h3>
        <p className="text-sm text-slate-400 mb-6 font-medium uppercase tracking-wide">{description}</p>

        <div className="mb-6 pb-6 border-b border-white/10">
            <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{price}</span>
                <span className="text-slate-500">/mo</span>
            </div>
            <div className="mt-2 text-sm space-y-1">
                <p className="flex justify-between text-slate-400">
                    <span>Est. Leads</span>
                    <span className="text-white font-medium">{leads}</span>
                </p>
                <p className="flex justify-between text-slate-400">
                    <span>Effective CPL</span>
                    <span className="text-white font-medium">{cpl}</span>
                </p>
            </div>
        </div>

        <div className="flex-1 space-y-6">
            <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Included</p>
                <ul className="space-y-3">
                    {features.map((feature: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {commission && (
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Commission</p>
                    <div className="flex items-start gap-3 text-sm text-slate-300 bg-slate-800/30 p-3 rounded-lg border border-white/5">
                        <Shield className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                        <span>{commission}</span>
                    </div>
                </div>
            )}
        </div>

        {notes && (
            <div className="mt-6 pt-4 border-t border-white/5 text-xs text-slate-500">
                <p className="font-semibold mb-1">Note:</p>
                <p>{notes}</p>
            </div>
        )}
    </div>
);

const Pricing = () => {
    const headerAnim = useScrollAnimation();
    const bronzeAnim = useScrollAnimation();
    const silverAnim = useScrollAnimation();
    const goldAnim = useScrollAnimation();
    const positioningAnim = useScrollAnimation();

    // Ensure page starts at top when navigated to
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <SEO
                title="Broker Pricing Plans"
                description="Transparent, structured pricing plans for insurance brokers. Choose from Bronze, Silver, or Gold tiers to scale your business."
                keywords="insurance broker pricing, lead generation pricing, bronze silver gold plans, insurance leads cost"
            />
            <ParticleBackground />
            <Navigation />

            {/* Header */}
            <div className="pt-32 pb-20 px-6 container mx-auto text-center" ref={headerAnim.ref}>
                <h1 className={`text-4xl md:text-6xl font-black mb-6 tracking-tight ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
                    <span className="text-white">Structured, Premium, </span>
                    <span className="gradient-text">Scalable.</span>
                </h1>
                <p className={`text-xl text-slate-400 max-w-2xl mx-auto ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.1s' }}>
                    Transparent pricing designed to anchor value and grow with you. From consistent deal flow to a full revenue partnership.
                </p>
            </div>

            {/* Pricing Ladder */}
            <div className="container mx-auto px-6 pb-32">
                <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">

                    {/* Bronze */}
                    <PricingTier
                        title="Bronze"
                        price="R8,500"
                        leads="± 17"
                        cpl="± R500"
                        description="Growth Starter"
                        icon={Zap}
                        colorClass="text-secondary"
                        borderColor="border-secondary/30"
                        features={[
                            "Qualified SME decision-maker leads",
                            "Core targeting & messaging",
                            "Monthly performance check-in",
                            "Standard delivery priority"
                        ]}
                        /* commission prop removed */
                        notes="Minimum recommended post-pilot. Best for brokers refining their process."
                        animation={bronzeAnim}
                    />

                    {/* Silver */}
                    <PricingTier
                        title="Silver"
                        price="R10,500"
                        leads="± 23-26"
                        cpl="± R400-R450"
                        description="Scale & Optimise"
                        icon={Star}
                        popular={true}
                        colorClass="text-white"
                        borderColor="border-violet-500 shadow-[0_0_30px_-5px_hsl(280,90%,60%,0.3)] hover:shadow-[0_0_40px_-5px_hsl(280,90%,60%,0.5)]"
                        features={[
                            "Higher lead volume",
                            "Ongoing optimisation & targeting",
                            "Messaging testing & iteration",
                            "Bi-weekly performance reviews",
                            "Priority delivery"
                        ]}
                        /* commission prop removed */
                        notes="Our most popular tier. Enough volume for real data and faster learning cycles."
                        animation={silverAnim}
                    />

                    {/* Gold */}
                    <PricingTier
                        title="Gold"
                        price="R16,500+"
                        leads="33-40+"
                        cpl="± R350-R400"
                        description="Performance Partner"
                        icon={TrendingUp}
                        colorClass="text-accent"
                        borderColor="border-accent/30"
                        features={[
                            "Maximum lead volume",
                            "Advanced qualification filters",
                            "Dedicated campaign management",
                            "Priority + protected delivery",
                            "Strategy & conversion support"
                        ]}
                        commission="Option to renegotiate for volume/exclusivity"
                        notes="For high-performing teams ready to dominate a niche."
                        animation={goldAnim}
                    />

                </div>

                {/* Positioning Section */}
                <div className="mt-24 max-w-4xl mx-auto text-center" ref={positioningAnim.ref}>
                    <div className={`p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 ${positioningAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
                        <h2 className="text-3xl font-bold gradient-text mb-8">Broker Positioning</h2>
                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="space-y-2">
                                <p className="text-secondary font-bold uppercase text-sm tracking-wider">Bronze</p>
                                <p className="text-slate-300 font-medium">"Where we prove consistency."</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-slate-300 font-bold uppercase text-sm tracking-wider">Silver</p>
                                <p className="text-white font-medium text-lg">"Where results become predictable."</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-accent font-bold uppercase text-sm tracking-wider">Gold</p>
                                <p className="text-slate-300 font-medium">"Where we operate as a revenue partner."</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Connection Section */}
                <div className="mt-24 text-center">
                    <h3 className="text-lg font-bold text-slate-500 uppercase tracking-widest mb-12">Progression Path</h3>
                    <div className="flex flex-wrap justify-center gap-4 text-sm font-medium text-slate-400">
                        <span className="px-4 py-2 rounded-full border border-white/10 bg-white/5">Pilot Phase</span>
                        <span className="text-slate-600 self-center">→</span>
                        <span className="px-4 py-2 rounded-full border border-secondary/30 bg-secondary/10 text-secondary">Bronze</span>
                        <span className="text-slate-600 self-center">→</span>
                        <span className="px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 shadow-[0_0_15px_-5px_hsl(270,50%,50%)]">Silver</span>
                        <span className="text-slate-600 self-center">→</span>
                        <span className="px-4 py-2 rounded-full border border-accent/30 bg-accent/10 text-accent">Gold</span>
                    </div>
                </div>

            </div>

            <Footer />
        </div>
    );
};

export default Pricing;

import { useEffect } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";
import { Check, Zap, TrendingUp, Star, type LucideIcon } from "lucide-react";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import SEO from "@/components/SEO";
import {
    TIERS, TERMS, TOPUP, QUALIFIED, zar, perLead, topupMinimumZar,
    PILOT, PILOT_OFFERED, VAT_NOTE, QUALIFIED_LEAD_TEXT, NO_GUARANTEE_TEXT, BUDGET_TARGET_TEXT, SHORTFALL_TEXT, LATE_PAYMENT_TEXT, type PricingTier,
} from "@/lib/pricing";

// Every number on this page comes from automation/billing/pricing.seed.json via src/lib/pricing.ts (3.6).
// Wording: MASTER-PROMPT 3.5a, updated to Jonathan's 2026-10-05 decisions (Qualified Lead = booked + confirmed
// attendance; 7 days' notice; top-ups). Nothing here may imply sales or policies are promised, or that the fee
// depends on them (FAIS, Raspberry Academy v Oaksure).

// Display-only styling per tier (not pricing data).
const STYLE: Record<string, { icon: LucideIcon; tagline: string; colorClass: string; borderColor: string; popular?: boolean }> = {
    SMC_BRONZE: { icon: Zap, tagline: "Start here", colorClass: "text-secondary", borderColor: "border-secondary/30" },
    SMC_SILVER: {
        icon: Star, tagline: "More volume", colorClass: "text-white", popular: true,
        borderColor: "border-violet-500 shadow-[0_0_30px_-5px_hsl(280,90%,60%,0.3)] hover:shadow-[0_0_40px_-5px_hsl(280,90%,60%,0.5)]",
    },
    SMC_GOLD: { icon: TrendingUp, tagline: "Most volume", colorClass: "text-accent", borderColor: "border-accent/30" },
};
const FALLBACK_STYLE = STYLE.SMC_BRONZE;

const PricingTierCard = ({ tier, animation }: { tier: PricingTier; animation: ReturnType<typeof useScrollAnimation> }) => {
    const s = STYLE[tier.tier_code] || FALLBACK_STYLE;
    const Icon = s.icon;
    const features = [
        `${tier.committed_leads} Qualified Leads per ${TERMS.cycle_days}-day cycle`,
        "Ad spend included — we run and pay for the ads",
        "AI WhatsApp follow-up, booking and reminders included",
        "A pre-call brief for every booked appointment",
        "Live lead tracking in your broker portal",
    ];
    return (
        <div
            ref={animation.ref}
            data-tier={tier.tier_code}
            className={`relative p-8 rounded-2xl border ${s.borderColor} bg-slate-900/50 backdrop-blur-sm hover:transform hover:scale-105 transition-all duration-300 flex flex-col h-full ${animation.isVisible ? 'animate-fade-up' : 'opacity-0'} ${s.popular ? 'shadow-[0_0_50px_-12px_rgba(168,85,247,0.5)]' : ''}`}
        >
            {s.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                    Recommended
                </div>
            )}

            <div className={`mb-6 p-3 rounded-xl bg-slate-800/50 w-fit ${s.colorClass}`}>
                <Icon className="w-8 h-8" />
            </div>

            <h3 className={`text-2xl font-bold mb-2 ${s.colorClass}`}>{tier.name}</h3>
            <p className="text-sm text-slate-400 mb-6 font-medium uppercase tracking-wide">{s.tagline}</p>

            <div className="mb-6 pb-6 border-b border-white/10">
                <div className="flex items-baseline gap-1 flex-wrap">
                    <span className="text-3xl font-bold text-white">{zar(tier.price_zar)}</span>
                    <span className="text-slate-500">/ month, excl. VAT</span>
                </div>
                <div className="mt-2 text-sm space-y-1">
                    <p className="flex justify-between text-slate-400">
                        <span>Qualified Leads per cycle</span>
                        <span className="text-white font-medium">{tier.committed_leads}</span>
                    </p>
                    <p className="flex justify-between text-slate-400">
                        <span>Effective price per lead</span>
                        <span className="text-white font-medium">{zar(perLead(tier))}</span>
                    </p>
                </div>
            </div>

            <div className="flex-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Included</p>
                <ul className="space-y-3">
                    {features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-xs text-slate-500">
                <p>
                    {tier.committed_leads} Qualified Leads per cycle — committed, not estimated. Short at cycle end? We keep
                    delivering for up to {TERMS.shortfall_rollover_days} more days (only for delays outside our control), then roll the
                    balance into your next cycle on top of its number, or refund {zar(perLead(tier))} per undelivered lead on request.{" "}
                    <a href="#what-qualified-means" className="underline hover:text-slate-300">What qualified means</a>
                </p>
            </div>

            <Link
                to="/contact"
                className="mt-6 block text-center px-6 py-3 bg-secondary hover:bg-secondary/90 text-white font-bold rounded-xl transition-all duration-300"
            >
                Start on {tier.name}
            </Link>
        </div>
    );
};

const FAQ: { id?: string; q: string; a: string }[] = [
    { id: "what-qualified-means", q: "What is a Qualified Lead?", a: `${QUALIFIED_LEAD_TEXT} Age and budget are what the consumer tells us — we don't check income or underwrite. An A-tier lead counts toward your number once they have booked and confirmed; a B-tier lead counts only if you accept it. Every lead is labelled A or B. What happens in the appointment is up to you. ${BUDGET_TARGET_TEXT}` },
    { q: "Do I need my own ad account?", a: "No. We run the ads and pay for them. Ad spend is part of your monthly price." },
    { q: "What if I want more leads in a cycle?", a: `Once your cycle's leads are delivered, you can top up at ${zar(TOPUP.price_per_lead_zar)} per Qualified Lead, minimum ${TOPUP.min_leads} (${zar(topupMinimumZar())}). Give us ${TOPUP.notice_days} days' notice so we can scale the ads. Top-ups are paid in advance. Or move up to the next plan.` },
    { q: "What if you fall short?", a: SHORTFALL_TEXT(TIERS[0]) + " On other plans the refund is that plan's effective price per lead." },
    { q: "What if a payment is late?", a: LATE_PAYMENT_TEXT },
    { q: "What if a lead doesn't show up?", a: `Out of goodwill, we replace up to ${TERMS.goodwill_replacements_per_week} no-shows a week (no-shows only), if you send proof straight after waiting 10 minutes. We never replace a lead because they didn't buy. Invalid contact details never count in the first place.` },
    { q: "What does the AI do, and what does it never do?", a: "It replies on WhatsApp, books the appointment into your calendar and sends reminders. It never gives advice, compares products or talks about premiums or cover. Those questions go to you." },
    { q: "Is there a contract?", a: `You sign a short, plain-language agreement. It runs month to month with no minimum term. Either side can stop with ${TERMS.cancel_notice_days} days' written notice before the next cycle.` },
    { q: "Is this compliant with FAIS and POPIA?", a: "We are a marketing and lead-generation agency, not a financial services provider. We never advise. Consumers opt in, and you receive their details with their consent. Our fee is a flat monthly price — never tied to sales, applications or policies." },
];

const Pricing = () => {
    const headerAnim = useScrollAnimation();
    const cardAnims = [useScrollAnimation(), useScrollAnimation(), useScrollAnimation()];
    const includesAnim = useScrollAnimation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <SEO
                title="Broker Pricing Plans"
                description={`Month-to-month plans for licensed advisers. A set number of Qualified Leads every ${TERMS.cycle_days}-day cycle, ad spend included. Prices excl. VAT. No commission.`}
                keywords="life cover leads pricing, qualified leads, bronze silver gold plans, month to month leads"
                canonicalUrl="https://www.leadvelocity.co.za/pricing"
            />
            <ParticleBackground />
            <Navigation />

            {/* Header */}
            <div className="pt-32 pb-20 px-6 container mx-auto text-center" ref={headerAnim.ref}>
                <h1 className={`text-4xl md:text-6xl font-black mb-6 tracking-tight ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
                    <span className="text-white">Committed, All-In, </span>
                    <span className="gradient-text">Month to Month.</span>
                </h1>
                <p className={`text-xl text-slate-400 max-w-2xl mx-auto ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.1s' }}>
                    You pay upfront for one month and get a set number of Qualified Leads — people aged {QUALIFIED.age_min}–{QUALIFIED.age_max} who
                    told us they can budget for cover, agreed to be contacted, booked an appointment with you and confirmed they'll attend.
                    Not clicks. Not raw form fills.
                </p>
            </div>

            {/* Tier cards — generated from the pricing source */}
            <div className="container mx-auto px-6 pb-12">
                {/* Pilot: once-off introductory cycle, shown only while the seed offers it (withdrawn 2026-10-07) */}
                {PILOT_OFFERED && (
                <div data-tier={PILOT.tier_code} className="max-w-7xl mx-auto mb-10 p-5 md:p-6 rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-sm flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                    <div className="md:w-48 shrink-0">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Try us first</p>
                        <p className="text-xl font-bold text-white">{PILOT.name}</p>
                    </div>
                    <div className="md:w-56 shrink-0">
                        <span className="text-2xl font-bold text-white">{zar(PILOT.price_zar)}</span>
                        <span className="text-slate-500 text-sm"> once-off, excl. VAT</span>
                        <p className="text-sm text-slate-400">{PILOT.committed_leads} Qualified Leads · {zar(perLead(PILOT))} per lead</p>
                    </div>
                    <p className="text-sm text-slate-400 flex-1">
                        One introductory {TERMS.cycle_days}-day cycle for first-time clients, paid upfront as a flat fee with ad spend
                        included. Same rollover and replacement rules as every plan. Then continue on {PILOT.continue_on}.
                    </p>
                    <Link
                        to="/contact"
                        className="shrink-0 text-center px-5 py-2.5 rounded-xl border border-secondary/40 text-secondary hover:bg-secondary/10 font-bold text-sm transition-all duration-300"
                    >
                        Start with a {PILOT.name}
                    </Link>
                </div>
                )}

                <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
                    {TIERS.map((tier, i) => (
                        <PricingTierCard key={tier.tier_code} tier={tier} animation={cardAnims[i] || cardAnims[0]} />
                    ))}
                </div>

                <div className="max-w-3xl mx-auto mt-12 text-center space-y-3">
                    <p className="text-white font-semibold">
                        Month to month. Pay upfront for a {TERMS.cycle_days}-day cycle, get your leads, decide again next month.
                        Cancel with {TERMS.cancel_notice_days} days' written notice before your next cycle.
                    </p>
                    <p className="text-slate-400 text-sm" data-testid="topup-line">
                        Need more in a cycle? Once your cycle's leads are delivered, top up at {zar(TOPUP.price_per_lead_zar)} per Qualified Lead,
                        minimum {TOPUP.min_leads} ({zar(topupMinimumZar())}), with {TOPUP.notice_days} days' notice.
                    </p>
                    <p className="text-slate-500 text-xs">{VAT_NOTE} Pay by EFT or card (Paystack). {NO_GUARANTEE_TEXT}</p>
                </div>
            </div>

            {/* What every plan includes (was "Broker Positioning") */}
            <div className="container mx-auto px-6 pb-12">
                <div className="mt-12 max-w-5xl mx-auto text-center" ref={includesAnim.ref}>
                    <div className={`p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 ${includesAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
                        <h2 className="text-3xl font-bold gradient-text mb-8">What Every Plan Includes</h2>
                        <div className="grid md:grid-cols-3 gap-8 text-left md:text-center">
                            <div className="space-y-2">
                                <p className="text-secondary font-bold uppercase text-sm tracking-wider">AI follow-up</p>
                                <p className="text-slate-300">Every lead is followed up on WhatsApp by our AI assistant, booked straight into your calendar and reminded before the appointment. You get a pre-call brief on who they are.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-slate-300 font-bold uppercase text-sm tracking-wider">What we don't do</p>
                                <p className="text-slate-300">We don't give financial advice, compare products or quote premiums. You're the licensed adviser; we fill your diary.</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-accent font-bold uppercase text-sm tracking-wider">All-in pricing</p>
                                <p className="text-slate-300">Ad spend, landing pages, WhatsApp automation and reporting are included. No setup fee. No per-policy commission — ever.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* How a cycle works (was "Progression Path") */}
                <div className="mt-24 text-center">
                    <h3 className="text-lg font-bold text-slate-500 uppercase tracking-widest mb-12">How a Cycle Works</h3>
                    <div className="flex flex-wrap justify-center gap-4 text-sm font-medium text-slate-400">
                        <span className="px-4 py-2 rounded-full border border-white/10 bg-white/5">{PILOT_OFFERED ? "Pilot or pick a plan" : "Pick a plan"}</span>
                        <span className="text-slate-600 self-center">→</span>
                        <span className="px-4 py-2 rounded-full border border-secondary/30 bg-secondary/10 text-secondary">Pay for one cycle</span>
                        <span className="text-slate-600 self-center">→</span>
                        <span className="px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300">Qualified Leads book in</span>
                        <span className="text-slate-600 self-center">→</span>
                        <span className="px-4 py-2 rounded-full border border-accent/30 bg-accent/10 text-accent">Renew, top up, change plan or stop</span>
                    </div>
                </div>

                {/* FAQ */}
                <div className="mt-24 max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-white text-center mb-10">Questions brokers ask</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        {FAQ.map((f) => (
                            <div key={f.q} id={f.id} className="p-6 rounded-2xl border border-white/10 bg-slate-900/50 scroll-mt-32">
                                <h3 className="text-white font-bold mb-2">{f.q}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">{f.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="pb-32" />
            <Footer />
        </div>
    );
};

export default Pricing;

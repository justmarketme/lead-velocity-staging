import { useEffect } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import SEO from "@/components/SEO";

// NH-14 (Option A): the legacy B2B tier pricing is withdrawn from the public site.
// The route is kept (and /promotions redirects here) so existing links keep working.
const Pricing = () => {
    const headerAnim = useScrollAnimation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <SEO
                title="Talk to Us"
                description="Every brokerage is different. Talk to Lead Velocity about what fits your business."
                keywords="insurance broker lead generation, Lead Velocity, contact"
            />
            <ParticleBackground />
            <Navigation />

            <div className="pt-32 pb-32 px-6 container mx-auto text-center" ref={headerAnim.ref}>
                <h1 className={`text-4xl md:text-6xl font-black mb-6 tracking-tight ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
                    <span className="text-white">Let's find what </span>
                    <span className="gradient-text">fits you.</span>
                </h1>
                <p className={`text-xl text-slate-400 max-w-2xl mx-auto mb-10 ${headerAnim.isVisible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '0.1s' }}>
                    Every brokerage is different. Tell us about yours and we will talk you through the options.
                </p>
                <Link
                    to="/contact"
                    className="inline-block px-8 py-4 bg-secondary hover:bg-secondary/90 text-white font-bold rounded-xl transition-all duration-300"
                >
                    Talk to us
                </Link>
            </div>

            <Footer />
        </div>
    );
};

export default Pricing;

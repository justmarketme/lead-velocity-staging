 import Hero from "@/components/Hero";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ParticleBackground from "@/components/ParticleBackground";
import TrustBar from "@/components/TrustBar";
import { Target, Zap, Shield, TrendingUp } from "lucide-react";
import einsteinGeniusNeon from "@/assets/einstein-genius-neon.png";
import missionControlNeon from "@/assets/mission-control-neon.png";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { useParallax } from "@/hooks/use-parallax";
import SEO from "@/components/SEO";

const Home = () => {
  const featuresAnim = useScrollAnimation();
  const brandStoryAnim = useScrollAnimation();
  const brandStoryImageAnim = useScrollAnimation();
  const missionControlAnim = useScrollAnimation();
  const missionControlImageAnim = useScrollAnimation();

  const parallaxSlow = useParallax(0.3);
  const parallaxMedium = useParallax(0.5);
  const parallaxFast = useParallax(0.7);

  const features = [
    {
      icon: Target,
      title: "High-Intent Prospects",
      description: "We don't just find people; we find prospects ready to talk. Our internal algorithms help you reach the right people.",
    },
    {
      icon: Zap,
      title: "Predictable Pipeline",
      description: "Stop guessing where your next deal is coming from. Get a steady flow of verified leads delivered weekly.",
    },
    {
      icon: Shield,
      title: "Broker-Verified",
      description: "Every lead is reviewed by a team that understands the insurance journey, not just a generic call center.",
    },
    {
      icon: TrendingUp,
      title: "Scalable Growth",
      description: "When you're ready to grow, our infrastructure scales with you. Build a more consistent sales calendar.",
    },
  ];

  return (
    <div className="min-h-screen relative">
      <SEO
        title="High-Performance Insurance Leads"
        description="Connect with qualified business insurance prospects. Lead Velocity provides structured, verified leads for brokers in South Africa."
      />
      <ParticleBackground />
      <div className="relative z-10">
        <Navigation />
        <Hero />
        <TrustBar />

        {/* Features Section */}
        <section className="py-24 relative overflow-hidden">
          {/* Parallax background orbs */}
          <div
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
            style={{ transform: `translate(${parallaxSlow * 0.5}px, ${parallaxSlow * 0.8}px)` }}
          ></div>
          <div
            className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-secondary/10 rounded-full blur-3xl"
            style={{ transform: `translate(${-parallaxMedium * 0.4}px, ${parallaxMedium * 0.6}px)` }}
          ></div>
          <div
            ref={featuresAnim.ref}
            className={`container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 transition-all duration-700 ${featuresAnim.isVisible ? 'scroll-fade-up' : 'scroll-hidden'
              }`}
          >
            <div className="text-center space-y-4 mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold">
                Why Choose <span className="gradient-text">Lead Velocity</span>
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                We combine cutting-edge technology with industry expertise to deliver results that matter.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className={`group p-6 rounded-xl neon-border bg-card hover:bg-card/80 transition-all duration-300 glow-hover active:scale-95 ${featuresAnim.isVisible ? 'card-slide-up' : 'opacity-0'
                    }`}
                  style={{
                    animationDelay: `${index * 0.12}s`,
                  }}
                >
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4 group-hover:scale-110 group-active:scale-95 transition-transform duration-300">
                    <feature.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Brand Story Section */}
        <section className="py-16 sm:py-24 relative overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background pointer-events-none"
            style={{ transform: `translateY(${parallaxSlow}px)` }}
          ></div>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Content - Always first on mobile */}
              <div
                ref={brandStoryAnim.ref}
                className={`space-y-6 order-2 lg:order-1 transition-all duration-700 ${brandStoryAnim.isVisible ? 'scroll-fade-right' : 'scroll-hidden'
                  }`}
              >
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center lg:text-left">
                  The <span className="gradient-text">Epiphany</span> That Changed Everything.
                </h2>
                <p className="text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed text-center lg:text-left">
                  We spent years in the field as brokers. We know the frustration of spending thousands on "hot leads" that turned out to be cold numbers. We realized that the industry didn't need faster bots—it needed a system built by people who have actually sold a policy. We combined our broker expertise with smart technology to build what we always wished we had.
                </p>
                <div className="space-y-4">
                  <div className="flex items-start space-x-4 p-4 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Consistent Delivery</h3>
                      <p className="text-muted-foreground text-sm sm:text-base">Build a reliable pipeline with qualified leads delivered weekly directly to your inbox.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4 p-4 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-secondary to-accent flex items-center justify-center flex-shrink-0">
                      <Target className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Precision Quality</h3>
                      <p className="text-muted-foreground text-sm sm:text-base">Our AI-powered verification system ensures every lead meets your high standards.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Image - Before content on mobile for visual hierarchy */}
              <div
                ref={brandStoryImageAnim.ref}
                className={`w-full order-1 lg:order-2 transition-all duration-700 ${brandStoryImageAnim.isVisible ? 'scroll-fade-left' : 'scroll-hidden'
                  }`}
              >
                <div className="relative max-w-xs sm:max-w-sm md:max-w-md mx-auto lg:max-w-none overflow-hidden rounded-2xl">
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-secondary/30 via-primary/30 to-accent/30 blur-3xl rounded-full pointer-events-none"
                  ></div>
                  <img
                    src={einsteinGeniusNeon}
                    alt="Einstein as futuristic genius scientist representing breakthrough innovation in lead generation"
                    className="relative z-10 w-full h-auto rounded-2xl neon-border"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mission Control Section */}
        <section className="py-16 sm:py-24 relative overflow-hidden">
          {/* Parallax background elements */}
          <div
            className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none"
            style={{ transform: `translateY(${parallaxSlow * 0.4}px)` }}
          ></div>
          <div
            className="absolute top-1/3 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl pointer-events-none"
            style={{ transform: `translate(${parallaxFast * 0.3}px, ${-parallaxFast * 0.5}px)` }}
          ></div>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Content - Second on mobile (image first for visual flow) */}
              <div
                ref={missionControlAnim.ref}
                className={`space-y-6 order-2 lg:order-1 transition-all duration-700 ${missionControlAnim.isVisible ? 'scroll-fade-left' : 'scroll-hidden'
                  }`}
              >
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center lg:text-left">
                  Your <span className="gradient-text">Mission Control</span> for Growth
                </h2>
                <p className="text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed text-center lg:text-left">
                  Navigate the complex world of lead generation with confidence. Our team monitors, optimizes, and delivers results while you focus on closing deals.
                </p>
                <ul className="space-y-3">
                  {[
                    { color: 'primary', text: 'Real-time lead tracking and analytics' },
                    { color: 'secondary', text: 'Dedicated account manager support' },
                    { color: 'accent', text: 'Continuous optimization for maximum ROI' },
                  ].map((item, index) => (
                    <li
                      key={index}
                      className={`flex items-center space-x-3 p-3 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 transition-all duration-300 active:scale-[0.98] ${missionControlAnim.isVisible ? 'list-item-reveal' : 'opacity-0'
                        }`}
                      style={{ animationDelay: `${0.3 + index * 0.1}s` }}
                    >
                      <div className={`w-6 h-6 rounded-full bg-${item.color}/20 flex items-center justify-center flex-shrink-0`}>
                        <div className={`w-2 h-2 rounded-full bg-${item.color}`}></div>
                      </div>
                      <span className="text-foreground text-sm sm:text-base">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Image - First on mobile for visual hierarchy */}
              <div
                ref={missionControlImageAnim.ref}
                className={`w-full order-1 lg:order-2 transition-all duration-700 ${missionControlImageAnim.isVisible ? 'scroll-fade-right' : 'scroll-hidden'
                  }`}
              >
                <div className="relative max-w-xs sm:max-w-sm md:max-w-md mx-auto lg:max-w-none overflow-hidden rounded-2xl">
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/30 to-secondary/30 blur-3xl rounded-full pointer-events-none"
                  ></div>
                  <img
                    src={missionControlNeon}
                    alt="Futuristic mission control cockpit with analytics dashboards representing business growth management"
                    className="relative z-10 w-full h-auto rounded-2xl neon-border"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  );
};

export default Home;

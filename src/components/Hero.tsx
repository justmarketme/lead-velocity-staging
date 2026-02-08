import { ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import heroVelocity from "@/assets/hero-velocity.png";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-12 md:pb-0">
      {/* Animated background elements with parallax */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/20 rounded-full blur-3xl hero-orb hero-orb-1"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-secondary/20 rounded-full blur-3xl hero-orb hero-orb-2"></div>
        <div className="absolute top-1/2 right-1/3 w-48 md:w-64 h-48 md:h-64 bg-accent/20 rounded-full blur-3xl hero-orb hero-orb-3"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6 md:space-y-8 text-center lg:text-left order-2 lg:order-1">
            {/* Badge - First to appear */}
            <div
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-sm animate-fade-in"
              style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
            >
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Built by Former Brokers</span>
            </div>

            {/* Main Heading - Second */}
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight animate-fade-in"
              style={{ animationDelay: '0.4s', animationFillMode: 'both' }}
            >
              Stop Chasing{" "}
              <span className="gradient-text animate-glow">
                Bad Leads.
              </span>{" "}
              Get Verified Prospects You Can Actually Close.
            </h1>

            {/* Subheading - Third */}
            <p
              className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0 animate-fade-in"
              style={{ animationDelay: '0.6s', animationFillMode: 'both' }}
            >
              We were tired of buying leads that never answered. So we built the system we always wanted. Verified, high-intent prospects delivered weekly—built by former brokers who know the game.
            </p>

            {/* CTA Buttons - Fourth */}
            <div
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 animate-fade-in"
              style={{ animationDelay: '0.8s', animationFillMode: 'both' }}
            >
              <Link to="/contact">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)] active:scale-95 btn-glow-pulse group"
                >
                  Get Started Today
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/services">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto border-primary/50 hover:bg-primary/10 transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  View Services
                </Button>
              </Link>
            </div>

            {/* Stats - Fifth with staggered children */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 md:pt-8">
              <div
                className="space-y-1 sm:space-y-2 p-4 rounded-xl bg-card/30 backdrop-blur-sm sm:bg-transparent sm:p-0 animate-fade-in"
                style={{ animationDelay: '1s', animationFillMode: 'both' }}
              >
                <div className="text-xl sm:text-2xl font-bold gradient-text">Built by Brokers</div>
                <div className="text-xs sm:text-sm text-muted-foreground italic">Created by Former Agents</div>
              </div>
              <div
                className="space-y-1 sm:space-y-2 p-4 rounded-xl bg-card/30 backdrop-blur-sm sm:bg-transparent sm:p-0 animate-fade-in"
                style={{ animationDelay: '1.15s', animationFillMode: 'both' }}
              >
                <div className="text-xl sm:text-2xl font-bold gradient-text">Quality Verified</div>
                <div className="text-xs sm:text-sm text-muted-foreground italic">Smart Tech + Human Review</div>
              </div>
              <div
                className="space-y-1 sm:space-y-2 p-4 rounded-xl bg-card/30 backdrop-blur-sm sm:bg-transparent sm:p-0 animate-fade-in"
                style={{ animationDelay: '1.3s', animationFillMode: 'both' }}
              >
                <div className="text-xl sm:text-2xl font-bold gradient-text">Consistent Flow</div>
                <div className="text-xs sm:text-sm text-muted-foreground italic">Weekly Lead Delivery</div>
              </div>
            </div>
          </div>

          {/* Right Image - Appears early for visual hierarchy */}
          <div
            className="relative order-1 lg:order-2 animate-fade-in"
            style={{ animationDelay: '0.1s', animationFillMode: 'both' }}
          >
            <div className="relative w-full max-w-sm sm:max-w-md lg:max-w-lg mx-auto">
              {/* Glow effect behind image */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-secondary/30 to-accent/30 blur-3xl rounded-full"></div>
              {/* Image */}
              <img
                src={heroVelocity}
                alt="Futuristic astronaut launching through neon cityscape symbolizing speed and lead generation acceleration"
                className="relative z-10 w-full h-auto rounded-2xl animate-float"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

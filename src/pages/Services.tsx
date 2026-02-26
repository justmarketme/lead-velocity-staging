import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, Sparkles, Users, Briefcase, ArrowRight } from "lucide-react";

const Services = () => {
  const services = [
    {
      icon: Users,
      title: "Insurance Leads",
      description: "High-quality leads for life, health, and short-term insurance brokers.",
      features: [
        "Pre-qualified prospects",
        "Verified contact information",
        "Consistent weekly delivery",
        "Industry-specific targeting",
      ],
      link: "/onboarding",
    },
    {
      icon: Briefcase,
      title: "Financial Advisory Leads",
      description: "Connect with individuals seeking investment and retirement planning advice.",
      features: [
        "Wealth management prospects",
        "Retirement planning leads",
        "Investment advisory contacts",
        "High-net-worth targeting",
      ],
      link: "/onboarding",
    },
    {
      icon: Sparkles,
      title: "Specialized Services",
      description: "Complete support system including wills, retentions, and lead generation from your existing book.",
      features: [
        "Wills with Capital Legacy partnership",
        "Retention & arrears management",
        "Professional after-sales calls",
        "Referral generation system",
      ],
      link: "/specialized-services",
    },
  ];

  return (
    <div className="min-h-screen">
      <Navigation />

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-48 sm:w-96 h-48 sm:h-96 bg-accent/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/3 w-48 sm:w-96 h-48 sm:h-96 bg-primary/10 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold">
              Our <span className="gradient-text">Services</span>
            </h1>
            <p className="text-base sm:text-xl text-muted-foreground px-2">
              Comprehensive lead generation solutions designed to accelerate your growth.
            </p>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8 max-w-7xl mx-auto">
            {services.map((service, index) => (
              <div
                key={index}
                className="p-5 sm:p-8 rounded-2xl neon-border bg-card hover:bg-card/80 transition-all glow-hover space-y-4 sm:space-y-6"
              >
                <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
                  <service.icon className="w-6 sm:w-8 h-6 sm:h-8 text-primary-foreground" />
                </div>

                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">{service.title}</h3>
                  <p className="text-sm sm:text-base text-muted-foreground">{service.description}</p>
                </div>

                <ul className="space-y-2 sm:space-y-3">
                  {service.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start space-x-2 sm:space-x-3">
                      <Check className="w-4 sm:w-5 h-4 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link to={service.link} className="block">
                  <Button className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90 transition-opacity group text-sm sm:text-base">
                    Learn More
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto neon-border rounded-2xl p-6 sm:p-12 bg-card text-center space-y-4 sm:space-y-6">
            <h2 className="text-2xl sm:text-4xl font-bold">
              Ready to <span className="gradient-text">Accelerate</span> Your Growth?
            </h2>
            <p className="text-base sm:text-xl text-muted-foreground px-2">
              Join forward-thinking brokers who are building consistent lead flow with Lead Velocity.
            </p>
            <Link to="/contact">
              <Button
                size="lg"
                className="bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground hover:opacity-90 transition-all glow-hover text-sm sm:text-base"
              >
                Get Started Today
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Services;

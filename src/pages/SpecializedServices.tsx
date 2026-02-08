import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { FileText, Shield, Users, RefreshCw, Phone, TrendingUp, CheckCircle } from "lucide-react";
import dashboardNeon from "@/assets/dashboard-neon.png";

const SpecializedServices = () => {
  const services = [
    {
      icon: FileText,
      title: "Wills with Capital Legacy",
      description: "Keep up to 80% of your book",
      price: "R3,500 once-off fee",
      features: [
        "Partner with Capital Legacy",
        "Retain majority of your client book",
        "Professional will drafting service",
        "Secure document storage",
      ],
    },
    {
      icon: Shield,
      title: "Safe Custody",
      description: "Wills signed and brought into safe custody",
      price: "R100 per will",
      features: [
        "Secure will storage",
        "Professional handling",
        "Document verification",
        "Easy access when needed",
      ],
    },
    {
      icon: Users,
      title: "Lead Generation",
      description: "Generate leads from your existing book",
      price: "Custom pricing",
      features: [
        "After-sales calls to clients",
        "Collect 5 referrals per client",
        "Capital Legacy consultant visits",
        "Referrals pushed back to you",
        "Book clients directly in your calendar",
      ],
    },
    {
      icon: RefreshCw,
      title: "Retentions & Arrears",
      description: "Reinstate lapsed policies efficiently",
      price: "R200 per case or 10% of commission",
      features: [
        "Professional policy reinstatement",
        "Client outreach and follow-up",
        "Payment arrangement assistance",
        "Detailed case reporting",
      ],
    },
    {
      icon: Phone,
      title: "After-Sales Calls",
      description: "Professional follow-up to ensure client satisfaction",
      price: "Included in service packages",
      features: [
        "Weekly feedback reports",
        "Client engagement tracking",
        "Satisfaction monitoring",
        "Issue resolution support",
      ],
    },
  ];

  const growthSteps = [
    { step: 1, title: "Initial Client Contact", description: "Professional outreach to your existing clients" },
    { step: 2, title: "Referral Collection", description: "Gather 5 quality referrals from each satisfied client" },
    { step: 3, title: "Capital Legacy Consultation", description: "Expert consultants meet with referrals" },
    { step: 4, title: "Additional Referrals", description: "Generate even more leads from new contacts" },
    { step: 5, title: "Leads Returned", description: "All qualified leads pushed back to you" },
    { step: 6, title: "Calendar Booking", description: "Assistance with scheduling appointments" },
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
          <div className="max-w-4xl mx-auto text-center space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold">
              Our <span className="gradient-text">Specialized Services</span>
            </h1>
            <p className="text-base sm:text-xl text-muted-foreground px-2">
              Everything you need to grow your client book
            </p>
          </div>
        </div>
      </section>

      {/* Video/Introduction Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card className="neon-border bg-card/50 backdrop-blur">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl font-bold mb-2">
                  Track Leads, <span className="gradient-text">Earn More</span>
                </CardTitle>
                <CardDescription className="text-lg">
                  Watch how our specialized services help you maximize your revenue while maintaining strong client relationships
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-video rounded-lg overflow-hidden neon-border bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20">
                  <img 
                    src={dashboardNeon}
                    alt="Lead Velocity Dashboard showing neon-themed analytics and lead tracking interface"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  Your command center for tracking leads and maximizing revenue
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8 max-w-7xl mx-auto">
            {services.map((service, index) => (
              <Card
                key={index}
                className="neon-border bg-card hover:bg-card/80 transition-all glow-hover"
              >
                <CardHeader className="p-4 sm:p-6">
                  <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center mb-3 sm:mb-4">
                    <service.icon className="w-6 sm:w-8 h-6 sm:h-8 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-xl sm:text-2xl">{service.title}</CardTitle>
                  <CardDescription className="text-sm sm:text-base">{service.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-base sm:text-lg font-semibold text-primary">{service.price}</span>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                  <ul className="space-y-2 sm:space-y-3">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start space-x-2 sm:space-x-3">
                        <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-xs sm:text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Growth Process */}
      <section className="py-12 sm:py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto space-y-8 sm:space-y-12">
            <div className="text-center space-y-3 sm:space-y-4">
              <h2 className="text-2xl sm:text-4xl font-bold">
                Our Proven <span className="gradient-text">Growth Process</span>
              </h2>
              <p className="text-base sm:text-xl text-muted-foreground px-2">
                A systematic approach to expanding your client base
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {growthSteps.map((step) => (
                <div
                  key={step.step}
                  className="relative p-4 sm:p-6 rounded-xl neon-border bg-card space-y-2 sm:space-y-3"
                >
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground font-bold text-lg sm:text-xl">
                    {step.step}
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold">{step.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Weekly Feedback Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card className="neon-border bg-gradient-to-br from-card via-card to-primary/5">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl font-bold mb-2">
                  Weekly Feedback & <span className="gradient-text">Support</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-center text-lg text-muted-foreground">
                  We provide comprehensive weekly feedback on all leads, ensuring you stay informed and connected with your growing client base.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-primary" />
                      <span>Regular Updates</span>
                    </h4>
                    <p className="text-sm text-muted-foreground pl-7">
                      Receive detailed reports on lead status, engagement levels, and conversion progress.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-primary" />
                      <span>Performance Insights</span>
                    </h4>
                    <p className="text-sm text-muted-foreground pl-7">
                      Track your growth metrics and understand which strategies are delivering the best results.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto neon-border rounded-2xl p-6 sm:p-12 bg-card text-center space-y-4 sm:space-y-6">
            <h2 className="text-2xl sm:text-4xl font-bold">
              Ready to <span className="gradient-text">Transform</span> Your Practice?
            </h2>
            <p className="text-base sm:text-xl text-muted-foreground px-2">
              Let us help you unlock the full potential of your client book.
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

export default SpecializedServices;

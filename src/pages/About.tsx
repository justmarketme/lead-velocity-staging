import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Users, Award, Globe, Rocket } from "lucide-react";

const About = () => {
  const values = [
    {
      icon: Users,
      title: "Client-Centric",
      description: "Your success is our mission. We tailor our approach to your unique business needs.",
    },
    {
      icon: Award,
      title: "Excellence",
      description: "We maintain the highest standards in lead quality and service delivery.",
    },
    {
      icon: Globe,
      title: "Innovation",
      description: "Leveraging cutting-edge technology to stay ahead of market trends.",
    },
    {
      icon: Rocket,
      title: "Speed",
      description: "Fast, efficient lead generation that keeps your pipeline full.",
    },
  ];

  return (
    <div className="min-h-screen">
      <Navigation />

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-48 sm:w-96 h-48 sm:h-96 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 sm:w-96 h-48 sm:h-96 bg-secondary/10 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold">
              About <span className="gradient-text">Lead Velocity</span>
            </h1>
            <p className="text-base sm:text-xl text-muted-foreground px-2">
              Revolutionizing lead generation for South Africa's insurance and financial advisory industry.
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="neon-border rounded-2xl p-8 bg-card">
              <h2 className="text-3xl font-bold mb-6">The Success We Wished We Had</h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  Lead Velocity didn't start in a tech lab—it started in the trenches of the insurance industry. As former brokers and advisors, we spent years dealing with the same "junk leads" and inconsistent pipelines that you're facing today.
                </p>
                <p>
                  We knew there had to be a better way than cold calling or praying for referrals. We spent 18 months building an internal system to verify prospects using real human intelligence and smart algorithms. It worked so well for our team that we decided to turn it into a platform for the entire industry.
                </p>
                <p>
                  Today, we guide forward-thinking brokers through the transition from "hustling for leads" to "managing a predictable business." We aren't just a lead provider; we are your growth partners who have actually walked in your shoes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 sm:space-y-4 mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-4xl font-bold">Our Values</h2>
            <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
              The principles that guide everything we do.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8 max-w-6xl mx-auto">
            {values.map((value, index) => (
              <div
                key={index}
                className="p-4 sm:p-6 rounded-xl neon-border bg-card text-center space-y-3 sm:space-y-4 hover:bg-card/80 transition-all glow-hover"
              >
                <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto">
                  <value.icon className="w-6 sm:w-8 h-6 sm:h-8 text-primary-foreground" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold">{value.title}</h3>
                <p className="text-muted-foreground text-sm">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;

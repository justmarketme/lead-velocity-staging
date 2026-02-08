import { useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin, Send, MessageCircle } from "lucide-react";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  phone: z.string().trim().min(1, "Phone number is required").max(20),
  company: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1, "Message is required").max(1000),
});

const Contact = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      // Validate form data
      contactSchema.parse(formData);

      // Simulate form submission
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: "Message Sent!",
        description: "We'll get back to you within 24 hours.",
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        phone: "",
        company: "",
        message: "",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        toast({
          title: "Validation Error",
          description: "Please check the form and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navigation />
      
      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-16 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-secondary/10 rounded-full blur-3xl"></div>
        </div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold">
              Get in <span className="gradient-text">Touch</span>
            </h1>
            <p className="text-base sm:text-xl text-muted-foreground px-2">
              Ready to supercharge your lead generation? Let's talk.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 max-w-6xl mx-auto">
            {/* Contact Info */}
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">Let's Connect</h2>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Have questions about our services? Want to discuss a custom lead generation program? Our team is here to help.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <div className="flex items-start space-x-3 sm:space-x-4 p-4 sm:p-6 rounded-xl neon-border bg-card">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 sm:w-6 h-5 sm:h-6 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold mb-1 text-sm sm:text-base">Email Us</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground break-all">howzit@leadvelocity.co.za</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 sm:space-x-4 p-4 sm:p-6 rounded-xl neon-border bg-card">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-lg bg-gradient-to-br from-secondary to-accent flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 sm:w-6 h-5 sm:h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1 text-sm sm:text-base">Call Us</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">+27 10 976 5618</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 sm:space-x-4 p-4 sm:p-6 rounded-xl neon-border bg-card">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-lg bg-gradient-to-br from-accent to-secondary flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 sm:w-6 h-5 sm:h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1 text-sm sm:text-base">WhatsApp</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">+27 73 765 1664</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 sm:space-x-4 p-4 sm:p-6 rounded-xl neon-border bg-card">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 sm:w-6 h-5 sm:h-6 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold mb-1 text-sm sm:text-base">Visit Us</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria, 0184</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="neon-border rounded-2xl p-5 sm:p-8 bg-card">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-2">
                    Full Name *
                  </label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className={errors.name ? "border-destructive" : ""}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive mt-1">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email Address *
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive mt-1">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium mb-2">
                    Phone Number *
                  </label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+27 11 123 4567"
                    className={errors.phone ? "border-destructive" : ""}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive mt-1">{errors.phone}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="company" className="block text-sm font-medium mb-2">
                    Company (Optional)
                  </label>
                  <Input
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Your Company"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium mb-2">
                    Message *
                  </label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us about your lead generation needs..."
                    rows={5}
                    className={errors.message ? "border-destructive" : ""}
                  />
                  {errors.message && (
                    <p className="text-sm text-destructive mt-1">{errors.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground hover:opacity-90 transition-all glow-hover group"
                >
                  {isSubmitting ? "Sending..." : "Send Message"}
                  <Send className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Contact;

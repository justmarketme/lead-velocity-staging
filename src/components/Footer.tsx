import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, MessageCircle } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold gradient-text">Lead Velocity</h3>
            <p className="text-sm text-muted-foreground">
              Premium lead generation for insurance brokers and financial advisors in South Africa.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link to="/services" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Services
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/promotions" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Promotions
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/onboarding" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Broker Onboarding
                </Link>
              </li>
              <li>
                <Link to="/broker" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                  Broker Login Portal →
                </Link>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Services</h4>
            <ul className="space-y-2">
              <li className="text-sm text-muted-foreground">Insurance Leads</li>
              <li className="text-sm text-muted-foreground">Financial Advisory Leads</li>
              <li className="text-sm text-muted-foreground">Qualified Prospects</li>
              <li className="text-sm text-muted-foreground">Lead Management</li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Mail size={16} className="text-primary" />
                <span>howzit@leadvelocity.co.za</span>
              </li>
              <li className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Phone size={16} className="text-secondary" />
                <span>+27 10 976 5618</span>
              </li>
              <li className="flex items-center space-x-2 text-sm text-muted-foreground">
                <MessageCircle size={16} className="text-primary" />
                <a href="https://wa.me/27737651664" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                  +27 73 765 1664 (WhatsApp)
                </a>
              </li>
              <li className="flex items-center space-x-2 text-sm text-muted-foreground">
                <MapPin size={16} className="text-accent" />
                <span>210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria, 0184</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-border text-center">
          <p className="text-xs sm:text-sm text-muted-foreground">
            © {new Date().getFullYear()} Lead Velocity. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

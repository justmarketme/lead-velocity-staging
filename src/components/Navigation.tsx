import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import leadVelocityLogo from "@/assets/lead-velocity-logo.png";

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Services", path: "/services" },
    { name: "Contact", path: "/contact" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ease-out ${
      scrolled 
        ? 'bg-background/90 backdrop-blur-xl border-b border-primary/20 shadow-[0_4px_30px_rgba(0,0,0,0.3)]' 
        : 'bg-background/60 backdrop-blur-md border-b border-border/50'
    }`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between transition-all duration-500 ${
          scrolled ? 'h-16' : 'h-20'
        }`}>
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            {/* Logo image on mobile */}
            <img 
              src={leadVelocityLogo} 
              alt="Lead Velocity" 
              className="h-12 w-auto md:hidden"
            />
            {/* Text on desktop */}
            <div className="hidden md:block text-2xl font-bold gradient-text">
              Lead Velocity
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.path)
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.name}
              </Link>
            ))}
            <Link to="/contact">
              <Button className="bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_hsl(var(--primary)/0.5)] active:scale-95">
                Get Started
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-foreground"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 space-y-4 animate-fade-in">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsOpen(false)}
                className={`block text-sm font-medium transition-colors ${
                  isActive(link.path)
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.name}
              </Link>
            ))}
            <Link to="/contact" onClick={() => setIsOpen(false)}>
              <Button className="w-full bg-gradient-to-r from-primary via-secondary to-accent text-primary-foreground transition-all duration-300 active:scale-95 hover:shadow-[0_0_25px_hsl(var(--primary)/0.5)]">
                Get Started
              </Button>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;

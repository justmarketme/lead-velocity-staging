import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Database, BarChart3, Menu, X, LogOut, FolderOpen, UserPlus, Calendar, UserCircle, ShoppingBag, PlayCircle } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.webp";
import { useToast } from "@/hooks/use-toast";
import NotificationBell from "@/components/notifications/NotificationBell";
import SEO from "@/components/SEO";

interface BrokerLayoutProps {
  children: React.ReactNode;
}

const BrokerLayout = ({ children }: BrokerLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Note: brokers log in with the temporary password and use it until payment is made.
  // Changing to a personal password is only offered after their leads unlock (see Purchased Leads).

  // Streamlined nav for a leads-buyer: their purchased leads are home, plus
  // documents (contract/invoice), calendar and settings. The full-broker items
  // (My Leads upload, Referrals, Reports) are hidden as they don't apply here.
  const menuItems = [
    { id: "explainer", label: "Start Here", icon: PlayCircle, path: "/broker/explainer" },
    { id: "orders", label: "Purchased Leads", icon: ShoppingBag, path: "/broker/orders" },
    { id: "documents", label: "Documents", icon: FolderOpen, path: "/broker/documents" },
    { id: "calendar", label: "Calendar", icon: Calendar, path: "/broker/calendar" },
    { id: "profile", label: "Settings", icon: UserCircle, path: "/broker/profile" },
  ];

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Broker Portal" description="Lead Velocity broker portal." noIndex />
      {/* Top Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-background/95 backdrop-blur-lg border-b border-border">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                className="lg:hidden text-foreground"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              <img src={logo} alt="Lead Velocity" className="h-10 w-auto" />
              <span className="text-xl font-bold gradient-text hidden sm:inline">Broker Portal</span>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/broker/explainer")}
                className="hidden md:inline-flex text-muted-foreground hover:text-foreground"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                How it works
              </Button>
              <div className="flex items-center gap-2">
                <NotificationBell userRole="broker" />
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-card border-r border-border transition-transform duration-300 z-40 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
      >
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = window.location.pathname === item.path;
            return (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  item.id === "explainer"
                    ? "bg-gradient-to-r from-primary to-purple-500 text-white font-semibold shadow-lg shadow-primary/30 hover:opacity-90"
                    : isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default BrokerLayout;

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, Upload, BarChart3, Menu, X, LogOut, Database, UserPlus, FolderOpen, UserCheck, Calendar, FileText, Bot, Workflow, Sparkles, Target } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.png";
import { useToast } from "@/hooks/use-toast";
import NotificationBell from "@/components/notifications/NotificationBell";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const DashboardLayout = ({ children, activeTab, setActiveTab }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const menuItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "workflow", label: "Manage Workflow", icon: Workflow },
    { id: "marketing", label: "Marketing Hub", icon: Sparkles },
    { id: "leads", label: "Lead Database", icon: Database },
    { id: "referrals", label: "Referrals", icon: UserCheck },
    { id: "broker-analysis", label: "Onboarding", icon: Target },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "upload", label: "Upload Leads", icon: Upload },
    { id: "documents", label: "Documents", icon: FolderOpen },
    { id: "templates", label: "Message Templates", icon: FileText },
    { id: "ai-calls", label: "AI Calls", icon: Bot },
    { id: "team", label: "Team Management", icon: Users },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "invites", label: "Admin Invites", icon: UserPlus },
    { id: "broker-invites", label: "Broker Invites", icon: UserPlus },
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
              <span className="text-xl font-bold gradient-text hidden sm:inline">Dashboard</span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell userRole="admin" onNavigateToAICalls={() => setActiveTab('ai-calls')} />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-card border-r border-border transition-transform duration-300 z-40 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
      >
        <nav className="p-4 space-y-2 h-full overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === item.id
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


export default DashboardLayout;
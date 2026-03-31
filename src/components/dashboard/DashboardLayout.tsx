import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, Upload, BarChart3, Menu, X, LogOut, Database, UserPlus, FolderOpen, UserCheck, Calendar, FileText, Bot, Workflow, Sparkles, Target, PhoneCall } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.webp";
import { useToast } from "@/hooks/use-toast";
import NotificationBell from "@/components/notifications/NotificationBell";
import { EinsteinLiveVoice } from "@/components/voice/EinsteinLiveVoice";

import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const DashboardLayout = ({ children, activeTab, setActiveTab }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [brokers, setBrokers] = useState<any[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedBrokerId = searchParams.get("brokerId") || "all";

  useEffect(() => {
    fetchBrokers();
  }, []);

  const fetchBrokers = async () => {
    const { data } = await supabase.from("broker_onboarding_responses").select("*").order("created_at", { ascending: false });
    setBrokers(data || []);
  };

  const handleBrokerChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete("brokerId");
    } else {
      params.set("brokerId", value);
    }
    setSearchParams(params);
  };

  const menuItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "workflow", label: "Manage Workflow", icon: Workflow },
    { id: "marketing", label: "Marketing Hub", icon: Sparkles },
    { id: "sales", label: "Sales Console", icon: PhoneCall },
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
              <div className="hidden md:flex items-center gap-2 border-l border-white/10 pl-4 ml-4">
                <Search className="h-4 w-4 text-slate-500" />
                <Select value={selectedBrokerId} onValueChange={handleBrokerChange}>
                  <SelectTrigger className="w-[240px] h-9 bg-slate-900/50 border-white/10 text-xs font-bold ring-0 focus:ring-0">
                    <SelectValue placeholder="Global Partner Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-white/10 text-white w-[300px]">
                    <SelectItem value="all">Global Admin View</SelectItem>
                    {brokers.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <div className="flex flex-col py-1">
                          <span className="font-bold">{b.firm_name || b.company_name || 'Independent Partner'}</span>
                          <span className="text-[10px] text-slate-500">{b.full_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <EinsteinLiveVoice />
              <div className="flex items-center gap-2">
                <NotificationBell userRole="admin" onNavigateToAICalls={() => setActiveTab('ai-calls')} />
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
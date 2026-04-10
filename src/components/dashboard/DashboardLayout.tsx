import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, Upload, BarChart3, Menu, X, LogOut, Database, UserPlus, FolderOpen, UserCheck, Calendar, FileText, Bot, Workflow, Sparkles, Target } from "lucide-react";
import logo from "@/assets/lead-velocity-logo.webp";
import { useToast } from "@/hooks/use-toast";
import NotificationBell from "@/components/notifications/NotificationBell";
import { EinsteinLiveVoice } from "@/components/voice/EinsteinLiveVoice";

import { useSearchParams } from "react-router-dom";

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
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizingRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
    document.body.style.cursor = "col-resize";
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { startX, startWidth } = resizingRef.current;
    const delta = e.clientX - startX;
    const newWidth = Math.max(180, Math.min(450, startWidth + delta));
    setSidebarWidth(newWidth);
  };

  const stopResizing = () => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", stopResizing);
    document.body.style.cursor = "";
  };

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

  const leadSourcingItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "workflow", label: "Manage Workflow", icon: Workflow },
    { id: "marketing", label: "Marketing Hub", icon: Sparkles },
    { id: "leads", label: "Lead Database", icon: Database },
  ];

  const brokerManagementItems = [
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
        style={{ width: `${sidebarWidth}px` }}
        className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-card border-r border-border transition-transform duration-300 lg:transition-none z-40 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
      >
        <nav className="p-4 space-y-2 h-full overflow-y-auto custom-scrollbar relative">
          <div className="mb-4">
            <h3 className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Lead Sourcing
            </h3>
            <div className="space-y-1">
              {leadSourcingItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors text-sm ${activeTab === item.id
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <h3 className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Broker Management
            </h3>
            <div className="space-y-1">
              {brokerManagementItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors text-sm ${activeTab === item.id
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Resizer Handle */}
        <div
          onMouseDown={startResizing}
          className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize z-50 group hidden lg:block"
        >
          <div className="h-full w-[3px] mx-auto bg-border/40 group-hover:bg-primary transition-all duration-200" />
          <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors" />
        </div>
      </aside>

      {/* Main Content */}
      <main
        style={{ paddingLeft: sidebarOpen ? 0 : `${sidebarWidth}px` }}
        className="pt-16 transition-all duration-300 lg:transition-none"
      >
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
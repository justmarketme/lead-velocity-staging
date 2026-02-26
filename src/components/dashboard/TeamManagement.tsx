import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  UserPlus,
  Mail,
  Zap,
  ShieldCheck,
  Settings2,
  Send,
  Lock,
  Eye,
  EyeOff,
  Search,
  ChevronRight,
  RefreshCw,
  Trophy,
  Filter
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const TeamManagement = () => {
  const [brokers, setBrokers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const { toast } = useToast();

  // Onboarding Form State
  const [formData, setFormData] = useState({
    firmName: "",
    contactPerson: "",
    email: "",
    tier: "Pilot",
    isLeadLoading: true,
    leadQuota: 6,
    tempPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchBrokers();
  }, []);

  const fetchBrokers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brokers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to fetch brokers.", variant: "destructive" });
    } else {
      setBrokers(data || []);
    }
    setLoading(false);
  };

  const generateTempPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, tempPassword: password }));
  };

  const handleOnboardBroker = async () => {
    setLoading(true);
    try {
      // 1. Create User in Auth
      // Note: In a real app, this might be a custom signup function or admin API.
      // For this demo, we'll use a mock/simplified approach.

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.tempPassword,
        options: {
          data: {
            full_name: formData.contactPerson,
            must_reset_password: true,
            temp_password_set_at: new Date().toISOString(),
          }
        }
      });

      if (authError) throw authError;

      // 2. Create Broker Profile
      if (authData.user) {
        const { error: brokerError } = await supabase
          .from("brokers")
          .insert({
            user_id: authData.user.id,
            firm_name: formData.firmName,
            contact_person: formData.contactPerson,
            email: formData.email,
            tier: formData.tier,
            is_lead_loading: formData.isLeadLoading,
            lead_quota: formData.leadQuota,
            status: 'Active'
          });

        if (brokerError) throw brokerError;

        // 3. Assign Role
        await supabase.from("user_roles").insert({
          user_id: authData.user.id,
          role: 'broker'
        });

        toast({
          title: "Broker Onboarded",
          description: `Login details sent to ${formData.email}. Password reset flag enabled.`
        });

        setInviteDialogOpen(false);
        fetchBrokers();
      }
    } catch (e: any) {
      toast({ title: "Onboarding Failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredBrokers = brokers.filter(b =>
    b.firm_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.contact_person.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Premium Broker Network</h1>
          <p className="text-slate-500 text-sm">Onboard, manage, and scale your professional lead partners.</p>
        </div>
        <Button
          onClick={() => {
            generateTempPassword();
            setInviteDialogOpen(true);
          }}
          className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 h-11 px-6 rounded-xl font-bold"
        >
          <UserPlus className="w-4 h-4 mr-2" /> Onboard New Broker
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
              <Users className="w-4 h-4" /> Network Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{brokers.length} <span className="text-sm font-medium text-slate-600">Active Partners</span></div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" /> Active Scaling
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{brokers.filter(b => b.is_lead_loading).length} <span className="text-sm font-medium text-slate-600">Lead Loading</span></div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2">
              <Trophy className="w-4 h-4 text-pink-500" /> Gold Partners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{brokers.filter(b => b.tier === 'Gold').length} <span className="text-sm font-medium text-slate-600">Elite Tier</span></div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/30 border-white/5">
        <CardHeader className="border-b border-white/5 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-white">Professional Partners</CardTitle>
          <div className="flex gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search firm or contact..."
                className="bg-slate-950 border-white/10 pl-9 h-9 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 border-white/10 text-slate-400">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-slate-500">Syncing network data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-slate-500 tracking-widest bg-white/5">
                    <th className="px-6 py-4">Broker Firm & Tier</th>
                    <th className="px-6 py-4">Contact Person</th>
                    <th className="px-6 py-4">Lead Status</th>
                    <th className="px-6 py-4">Quota Usage</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredBrokers.map((broker) => (
                    <tr key={broker.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-sm">{broker.firm_name}</span>
                          <span className={`text-[10px] font-black uppercase tracking-tighter ${broker.tier === 'Gold' ? 'text-yellow-500' :
                              broker.tier === 'Silver' ? 'text-slate-400' :
                                broker.tier === 'Bronze' ? 'text-orange-500' : 'text-slate-500'
                            }`}>{broker.tier}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-200">{broker.contact_person}</span>
                          <span className="text-xs text-slate-500">{broker.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${broker.is_lead_loading ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
                          <span className="text-xs font-bold text-slate-300">
                            {broker.is_lead_loading ? 'Active Loading' : 'Ready / Inactive'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 w-32">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400">
                            <span>{broker.leads_used || 0} / {broker.lead_quota}</span>
                            <span>{Math.round(((broker.leads_used || 0) / broker.lead_quota) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(100, ((broker.leads_used || 0) / broker.lead_quota) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white">
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Onboarding Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="bg-slate-950 border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Elite Broker Onboarding</DialogTitle>
            <DialogDescription className="text-slate-400">Deploy a new professional portal instance and credentials.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Firm Name</Label>
                <Input value={formData.firmName} onChange={e => setFormData({ ...formData, firmName: e.target.value })} className="bg-slate-900 border-white/10" placeholder="Nexus Capital" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Contact Person</Label>
                <Input value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} className="bg-slate-900 border-white/10" placeholder="John Smith" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Email Address</Label>
              <Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} type="email" className="bg-slate-900 border-white/10" placeholder="john@nexus.com" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Portal Tier</Label>
                <Select value={formData.tier} onValueChange={v => setFormData({ ...formData, tier: v })}>
                  <SelectTrigger className="bg-slate-900 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white">
                    <SelectItem value="Pilot">Pilot (Free Trial)</SelectItem>
                    <SelectItem value="Bronze">Bronze (Entry)</SelectItem>
                    <SelectItem value="Silver">Silver (Mid-Scale)</SelectItem>
                    <SelectItem value="Gold">Gold (Enterprise)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Lead Quota</Label>
                <Input value={formData.leadQuota} onChange={e => setFormData({ ...formData, leadQuota: parseInt(e.target.value) || 0 })} type="number" className="bg-slate-900 border-white/10" />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="space-y-1">
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${formData.isLeadLoading ? 'text-emerald-400' : 'text-slate-600'}`} />
                  Lead Loading Mode
                </p>
                <p className="text-[10px] text-slate-500">Enable automated lead distribution for this partner.</p>
              </div>
              <Switch checked={formData.isLeadLoading} onCheckedChange={v => setFormData({ ...formData, isLeadLoading: v })} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Temporary Password</Label>
              <div className="relative">
                <Input
                  value={formData.tempPassword}
                  type={showPassword ? "text" : "password"}
                  className="bg-slate-900 border-white/10 pr-24"
                  readOnly
                />
                <div className="absolute right-1 top-1 flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={generateTempPassword}>
                    <RefreshCw size={14} />
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic flex items-center gap-1">
                <Lock className="w-3 h-3" /> Partner will be prompted for a new password on first login.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button variant="ghost" onClick={() => setInviteDialogOpen(false)} className="text-slate-500 hover:text-white">Cancel</Button>
            <Button onClick={handleOnboardBroker} className="bg-primary hover:bg-primary/90 text-white font-bold px-8 shadow-xl shadow-primary/20">
              <Send className="w-4 h-4 mr-2" /> Finalize & Send Portal Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamManagement;

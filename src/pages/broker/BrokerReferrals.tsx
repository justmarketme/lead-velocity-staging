import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrokerLayout from "@/components/broker/BrokerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Search, Calendar, Phone, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import ScheduleAppointmentDialog from "@/components/leads/ScheduleAppointmentDialog";

interface Referral {
  id: string;
  first_name: string;
  phone_number: string;
  will_status: string | null;
  broker_appointment_scheduled: boolean | null;
  appointment_date: string | null;
  created_at: string | null;
  parent_lead_id: string;
  lead?: {
    first_name: string | null;
    last_name: string | null;
  };
}

const BrokerReferrals = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const checkAuthAndFetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/login");
      return;
    }

    // Check if user is a broker
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "broker")
      .maybeSingle();

    if (!roleData) {
      navigate("/login");
      return;
    }

    fetchReferrals();
  };

  const fetchReferrals = async () => {
    setLoading(true);
    try {
      // Fetch all referrals from broker's leads with lead info
      const { data, error } = await supabase
        .from("referrals")
        .select(`
          *,
          lead:leads!parent_lead_id(first_name, last_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setReferrals(data || []);
    } catch (error: any) {
      console.error("Error fetching referrals:", error);
      toast({
        title: "Error",
        description: "Failed to load referrals",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case "Completed":
        return "default";
      case "In Progress":
        return "secondary";
      case "Pending":
        return "outline";
      default:
        return "outline";
    }
  };

  const filteredReferrals = referrals.filter((referral) => {
    const searchLower = searchQuery.toLowerCase();
    const leadName = `${referral.lead?.first_name || ""} ${referral.lead?.last_name || ""}`.toLowerCase();
    return (
      referral.first_name.toLowerCase().includes(searchLower) ||
      referral.phone_number.includes(searchQuery) ||
      leadName.includes(searchLower)
    );
  });

  const stats = {
    total: referrals.length,
    pending: referrals.filter((r) => r.will_status === "Pending").length,
    scheduled: referrals.filter((r) => r.broker_appointment_scheduled).length,
    completed: referrals.filter((r) => r.will_status === "Completed").length,
  };

  return (
    <BrokerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Referrals</h1>
          <p className="text-muted-foreground">
            Track all referrals from your leads in one place
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scheduled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <div className="h-2 w-2 rounded-full bg-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or parent lead..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Referrals Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredReferrals.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No referrals found</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? "Try adjusting your search"
                    : "Add referrals from your leads to see them here"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referral Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Parent Lead</TableHead>
                    <TableHead>Will Status</TableHead>
                    <TableHead>Appointment</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReferrals.map((referral) => (
                    <TableRow key={referral.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {referral.first_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {referral.phone_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        {referral.lead
                          ? `${referral.lead.first_name || ""} ${referral.lead.last_name || ""}`.trim() || "N/A"
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(referral.will_status?.includes('|') ? referral.will_status.split('|')[1] : referral.will_status)}>
                          {(referral.will_status?.includes('|') ? referral.will_status.split('|')[1] : referral.will_status) || "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {referral.broker_appointment_scheduled && referral.appointment_date ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4 text-green-500" />
                            {format(new Date(referral.appointment_date), "MMM d, yyyy h:mm a")}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not scheduled</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {referral.created_at
                          ? format(new Date(referral.created_at), "MMM d, yyyy")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        <ScheduleAppointmentDialog
                          referralId={referral.id}
                          referralName={referral.first_name}
                          currentAppointment={referral.appointment_date}
                          onAppointmentScheduled={fetchReferrals}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </BrokerLayout>
  );
};

export default BrokerReferrals;

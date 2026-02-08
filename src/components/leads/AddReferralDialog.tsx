import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const referralSchema = z.object({
  first_name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  phone_number: z.string().trim().min(1, "Phone is required").max(20, "Phone must be less than 20 characters"),
  email: z.string().trim().email("Invalid email address").optional().or(z.literal("")),
  referral_reason: z.enum(["estate_planning", "financial_advice"]),
});

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stethoscope, Landmark } from "lucide-react";

interface AddReferralDialogProps {
  leadId: string;
  leadName?: string;
  onReferralAdded?: () => void;
}

const AddReferralDialog = ({ leadId, leadName, onReferralAdded }: AddReferralDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    phone_number: "",
    email: "",
    referral_reason: "estate_planning" as "estate_planning" | "financial_advice",
  });
  const { toast } = useToast();

  const sendAdminNotification = async (referralName: string, referralPhone: string, leadDisplayName: string, referralEmail?: string) => {
    try {
      // Get current broker info
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: broker } = await supabase
        .from("brokers")
        .select("contact_person, firm_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!broker) return;

      await supabase.functions.invoke("send-referral-notification", {
        body: {
          referralName,
          referralPhone,
          referralEmail,
          leadName: leadDisplayName,
          brokerName: broker.contact_person,
          brokerFirm: broker.firm_name,
        },
      });
    } catch (error) {
      console.error("Failed to send admin notification:", error);
      // Don't show error to user - notification is secondary
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validatedData = referralSchema.parse(formData);

      const { error } = await supabase.from("referrals").insert({
        parent_lead_id: leadId,
        first_name: validatedData.first_name,
        phone_number: validatedData.phone_number,
        email: validatedData.email || null,
        will_status: `${validatedData.referral_reason}|Pending`,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Referral added successfully",
        });

        // Get lead name if not provided
        let leadDisplayName = leadName;
        if (!leadDisplayName) {
          const { data: lead } = await supabase
            .from("leads")
            .select("first_name, last_name")
            .eq("id", leadId)
            .maybeSingle();

          leadDisplayName = lead
            ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown"
            : "Unknown";
        }

        // Send notification to admins (non-blocking)
        sendAdminNotification(
          validatedData.first_name,
          validatedData.phone_number,
          leadDisplayName,
          validatedData.email
        );

        setFormData({ first_name: "", phone_number: "", email: "", referral_reason: "estate_planning" });
        setOpen(false);
        onReferralAdded?.();
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
        });
      }
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Referral
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Client Referral</DialogTitle>
          <DialogDescription>
            Add a referral from this client. They will be tracked and you can schedule appointments with them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referral_name">Referral Name</Label>
            <Input
              id="referral_name"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              placeholder="Enter the referral's name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="referral_phone">Phone Number</Label>
            <Input
              id="referral_phone"
              type="tel"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              placeholder="+27..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="referral_email">Email Address (Optional)</Label>
            <Input
              id="referral_email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="referral@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>What is this referral for?</Label>
            <Select
              value={formData.referral_reason}
              onValueChange={(v) => setFormData({ ...formData, referral_reason: v as any })}
            >
              <SelectTrigger className="w-full h-12">
                <SelectValue placeholder="Select purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="estate_planning" className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                      <Stethoscope className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-semibold text-sm">Estate Planning Professional</span>
                      <span className="text-[10px] text-muted-foreground leading-none">Wills, Trusts & Legacy protection</span>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="financial_advice" className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                      <Landmark className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-semibold text-sm">Professional Financial Advisor</span>
                      <span className="text-[10px] text-muted-foreground leading-none">Wealth, Investments & Planning</span>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Referral"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddReferralDialog;
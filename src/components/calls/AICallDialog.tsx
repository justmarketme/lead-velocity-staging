import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Bot, User, Loader2, Calendar, RefreshCw, MessageSquare, Bell, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

const COUNTRY_CODES = [
  { code: '+27', name: 'South Africa' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+1', name: 'USA/Canada' },
  { code: '+61', name: 'Australia' },
  { code: '+353', name: 'Ireland' },
  { code: '+264', name: 'Namibia' },
  { code: '+267', name: 'Botswana' },
  { code: '+260', name: 'Zambia' },
  { code: '+263', name: 'Zimbabwe' },
];

interface AICallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientType: 'lead' | 'referral' | 'broker';
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  brokerName?: string;
  brokerPhone?: string;
}

const CALL_PURPOSES = [
  { value: "appointment_scheduling", label: "Schedule Appointment", icon: Calendar, description: "Set up a new appointment with the contact" },
  { value: "appointment_rescheduling", label: "Reschedule Appointment", icon: RefreshCw, description: "Change an existing appointment date/time" },
  { value: "follow_up", label: "Follow-up Call", icon: MessageSquare, description: "Check in after previous interaction" },
  { value: "voice_note", label: "Leave Voice Note", icon: MessageSquare, description: "Leave a recorded message" },
  { value: "reminder", label: "Appointment Reminder", icon: Bell, description: "Remind about upcoming appointment" },
  { value: "general_inquiry", label: "General Inquiry", icon: HelpCircle, description: "General outreach or questions" },
];

export function AICallDialog({
  open,
  onOpenChange,
  recipientType,
  recipientId,
  recipientName,
  recipientPhone,
  brokerName,
  brokerPhone,
}: AICallDialogProps) {
  const [callType, setCallType] = useState<'manual' | 'ai'>('manual');
  const [callTarget, setCallTarget] = useState<'client' | 'broker'>('client');
  const [callPurpose, setCallPurpose] = useState<string>('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [editedPhone, setEditedPhone] = useState(recipientPhone || '');
  const [countryCode, setCountryCode] = useState('+27');

  useEffect(() => {
    if (recipientPhone) {
      const foundMatch = COUNTRY_CODES.find(c => recipientPhone?.startsWith(c.code));
      if (foundMatch) {
        setCountryCode(foundMatch.code);
        setEditedPhone(recipientPhone.slice(foundMatch.code.length));
      } else {
        setEditedPhone(recipientPhone);
      }
    }
  }, [recipientPhone]);

  const handleManualCall = () => {
    const basePhone = callTarget === 'broker' && brokerPhone ? brokerPhone : editedPhone;
    const fullCountryCode = callTarget === 'broker' ? '' : countryCode;
    const fullNumber = `${fullCountryCode}${basePhone}`.replace(/\s/g, '');
    window.open(`tel:${fullNumber}`, '_self');
    onOpenChange(false);
  };

  const handleAICall = async () => {
    if (!callPurpose) {
      toast.error('Please select a call purpose');
      return;
    }

    setIsInitiating(true);
    try {
      const basePhone = callTarget === 'broker' && brokerPhone ? brokerPhone : editedPhone;
      const fullCountryCode = callTarget === 'broker' ? '' : countryCode;
      const fullNumber = `${fullCountryCode}${basePhone}`.replace(/\s/g, '');
      const name = callTarget === 'broker' && brokerName ? brokerName : recipientName;

      const { data, error } = await supabase.functions.invoke('initiate-ai-call', {
        body: {
          recipient_type: callTarget === 'broker' ? 'broker' : recipientType,
          recipient_id: recipientId,
          recipient_name: name,
          recipient_phone: fullNumber,
          call_purpose: callPurpose,
          call_purpose_details: additionalDetails,
        },
      });

      if (error) throw error;

      toast.success('AI call initiated! You will be notified when the call is complete.');
      onOpenChange(false);

      // Reset form
      setCallType('manual');
      setCallTarget('client');
      setCallPurpose('');
      setAdditionalDetails('');
    } catch (error) {
      console.error('Error initiating AI call:', error);
      toast.error('Failed to initiate AI call. Please try again.');
    } finally {
      setIsInitiating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Make a Call
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Call Type Selection */}
          <div className="space-y-3">
            <Label>How would you like to call?</Label>
            <RadioGroup
              value={callType}
              onValueChange={(value: 'manual' | 'ai') => setCallType(value)}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="manual" id="manual" className="peer sr-only" />
                <Label
                  htmlFor="manual"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <User className="mb-3 h-6 w-6" />
                  <span className="font-medium">Manual Call</span>
                  <span className="text-xs text-muted-foreground mt-1">Call yourself</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="ai" id="ai" className="peer sr-only" />
                <Label
                  htmlFor="ai"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <Bot className="mb-3 h-6 w-6" />
                  <span className="font-medium">AI Agent</span>
                  <span className="text-xs text-muted-foreground mt-1">Automated call</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Who to Call */}
          <div className="space-y-3">
            <Label>Who to call?</Label>
            <RadioGroup
              value={callTarget}
              onValueChange={(value: 'client' | 'broker') => setCallTarget(value)}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="client" id="client" className="peer sr-only" />
                <Label
                  htmlFor="client"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <User className="mb-2 h-5 w-5" />
                  <span className="font-medium text-sm">Client</span>
                  <span className="text-xs text-muted-foreground mt-1 truncate max-w-full">{recipientName}</span>
                  <span className="text-xs text-muted-foreground">{countryCode} {editedPhone}</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="broker"
                  id="broker"
                  className="peer sr-only"
                  disabled={!brokerPhone}
                />
                <Label
                  htmlFor="broker"
                  className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer ${!brokerPhone ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <User className="mb-2 h-5 w-5" />
                  <span className="font-medium text-sm">Broker</span>
                  {brokerName ? (
                    <>
                      <span className="text-xs text-muted-foreground mt-1 truncate max-w-full">{brokerName}</span>
                      <span className="text-xs text-muted-foreground">{brokerPhone || 'No phone'}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground mt-1">No broker assigned</span>
                  )}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Phone Number Editing */}
          {callTarget === 'client' && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <Label htmlFor="edit-phone">Verify Phone Number</Label>
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="edit-phone"
                  value={editedPhone}
                  onChange={(e) => setEditedPhone(e.target.value)}
                  placeholder="72 000 0000"
                  className="flex-1 bg-white dark:bg-zinc-950"
                />
              </div>
            </div>
          )}

          {/* AI Call Options */}
          {callType === 'ai' && (
            <>
              <div className="space-y-3">
                <Label>Call Purpose *</Label>
                <Select value={callPurpose} onValueChange={setCallPurpose}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select the purpose of this call..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CALL_PURPOSES.map((purpose) => {
                      const Icon = purpose.icon;
                      return (
                        <SelectItem key={purpose.value} value={purpose.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <div>
                              <span className="font-medium">{purpose.label}</span>
                              <p className="text-xs text-muted-foreground">{purpose.description}</p>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label htmlFor="details">Additional Details (Optional)</Label>
                <Textarea
                  id="details"
                  placeholder="Any specific information the AI should mention during the call..."
                  value={additionalDetails}
                  onChange={(e) => setAdditionalDetails(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                <p className="font-medium">What happens next?</p>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  <li>• The AI agent will call the selected contact</li>
                  <li>• A recording and summary will be generated</li>
                  <li>• If any changes are requested, you'll be notified for approval</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {callType === 'manual' ? (
            <Button onClick={handleManualCall}>
              <Phone className="h-4 w-4 mr-2" />
              Call Now
            </Button>
          ) : (
            <Button onClick={handleAICall} disabled={isInitiating || !callPurpose}>
              {isInitiating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bot className="h-4 w-4 mr-2" />
              )}
              {isInitiating ? 'Initiating...' : 'Start AI Call'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

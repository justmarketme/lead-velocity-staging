import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, setHours, setMinutes } from "date-fns";
import { cn } from "@/lib/utils";

interface ScheduleAppointmentDialogProps {
  referralId: string;
  referralName: string;
  currentAppointment?: string | null;
  onAppointmentScheduled?: () => void;
}

const timeSlots = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

const ScheduleAppointmentDialog = ({
  referralId,
  referralName,
  currentAppointment,
  onAppointmentScheduled,
}: ScheduleAppointmentDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    currentAppointment ? new Date(currentAppointment) : undefined
  );
  const [selectedTime, setSelectedTime] = useState<string>(
    currentAppointment ? format(new Date(currentAppointment), "HH:mm") : "09:00"
  );
  const { toast } = useToast();

  const handleSchedule = async () => {
    if (!selectedDate) {
      toast({
        title: "Error",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const appointmentDateTime = setMinutes(setHours(selectedDate, hours), minutes);

      const { error } = await supabase
        .from("referrals")
        .update({
          appointment_date: appointmentDateTime.toISOString(),
          broker_appointment_scheduled: true,
        })
        .eq("id", referralId);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `Appointment scheduled for ${format(appointmentDateTime, "MMMM d, yyyy 'at' h:mm a")}`,
        });
        setOpen(false);
        onAppointmentScheduled?.();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleCancelAppointment = async () => {
    setLoading(true);

    try {
      const { error } = await supabase
        .from("referrals")
        .update({
          appointment_date: null,
          broker_appointment_scheduled: false,
        })
        .eq("id", referralId);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Appointment cancelled",
        });
        setSelectedDate(undefined);
        setSelectedTime("09:00");
        setOpen(false);
        onAppointmentScheduled?.();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {currentAppointment ? "Reschedule" : "Schedule"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Schedule Appointment</DialogTitle>
          <DialogDescription>
            Schedule an appointment with {referralName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Select Time</Label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger className="w-full">
                <Clock className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((time) => (
                  <SelectItem key={time} value={time}>
                    {format(setMinutes(setHours(new Date(), parseInt(time.split(":")[0])), parseInt(time.split(":")[1])), "h:mm a")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDate && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Appointment will be scheduled for:</p>
              <p className="font-medium">
                {format(selectedDate, "EEEE, MMMM d, yyyy")} at{" "}
                {format(setMinutes(setHours(new Date(), parseInt(selectedTime.split(":")[0])), parseInt(selectedTime.split(":")[1])), "h:mm a")}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          {currentAppointment && (
            <Button
              variant="destructive"
              onClick={handleCancelAppointment}
              disabled={loading}
            >
              Cancel Appointment
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={handleSchedule} disabled={loading || !selectedDate}>
              {loading ? "Scheduling..." : "Schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleAppointmentDialog;
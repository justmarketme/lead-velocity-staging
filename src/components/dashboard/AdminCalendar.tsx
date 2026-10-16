import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, Phone, Loader2, Building2, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isToday,
  parseISO,
} from "date-fns";

interface ReferralRow {
  id: string;
  first_name: string;
  phone_number: string;
  appointment_date: string;
  will_status: string | null;
  parent_lead_id: string;
  lead?: {
    first_name: string | null;
    last_name: string | null;
    broker_id?: string | null;
    brokers?: {
      firm_name: string;
      contact_person: string;
    } | null;
  } | null;
}

/** SortMyCover booking (appointments.brand_id not null, written by W05). Admins read it through "smc_sec admins manage appointments". */
interface SmcRow {
  id: string;
  broker_id: string;
  appointment_date: string;
  method: string | null;
  status: string;
  lead: { first_name: string | null } | null;
  broker: { firm_name: string | null; contact_person: string | null } | null;
}

/** One calendar entry: a will referral (legacy) or a SortMyCover booking. */
interface Appointment {
  id: string;
  kind: "referral" | "smc";
  appointment_date: string;
  first_name: string;
  phone_number: string | null;
  broker_id: string | null;
  broker_name: string | null;
  status: string;
  method: string | null;
  from: string | null;
}

const METHOD_LABEL: Record<string, string> = { teams: "Teams", zoom: "Zoom", meet: "Google Meet", whatsapp_call: "WhatsApp call", phone: "Phone" };
const ALL = "all";

type ViewMode = "month" | "week";

const AdminCalendar = () => {
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [brokerFilter, setBrokerFilter] = useState<string>(ALL);

  useEffect(() => {
    fetchAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const [ref, smc] = await Promise.all([
        supabase
          .from("referrals")
          .select(`
            id,
            first_name,
            phone_number,
            appointment_date,
            will_status,
            parent_lead_id,
            lead:leads!parent_lead_id(
              first_name,
              last_name,
              broker_id,
              brokers(firm_name, contact_person)
            )
          `)
          .eq("broker_appointment_scheduled", true)
          .not("appointment_date", "is", null)
          .order("appointment_date", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("appointments")
          .select("id, broker_id, appointment_date, method, status, lead:leads!client_id(first_name), broker:brokers!broker_id(firm_name, contact_person)")
          .not("brand_id", "is", null)
          .not("appointment_date", "is", null) // requests awaiting allocation have no date yet
          .order("appointment_date", { ascending: true }),
      ]);

      if (ref.error) throw ref.error;
      if (smc.error) {
        console.error("SortMyCover appointments:", smc.error);
        toast({ title: "SortMyCover bookings not loaded", description: smc.error.message, variant: "destructive" });
      }

      const referrals: Appointment[] = ((ref.data || []) as unknown as ReferralRow[]).map((r) => ({
        id: `ref-${r.id}`, kind: "referral", appointment_date: r.appointment_date, first_name: r.first_name,
        phone_number: r.phone_number, broker_id: r.lead?.broker_id ?? null, broker_name: r.lead?.brokers?.firm_name ?? null,
        status: r.will_status || "Pending", method: null,
        from: r.lead ? [r.lead.first_name, r.lead.last_name].filter(Boolean).join(" ") || null : null,
      }));
      const bookings: Appointment[] = ((smc.data || []) as SmcRow[]).map((a) => ({
        id: `smc-${a.id}`, kind: "smc", appointment_date: a.appointment_date, first_name: a.lead?.first_name || "Client",
        phone_number: null, broker_id: a.broker_id, broker_name: a.broker?.firm_name || a.broker?.contact_person || null,
        status: a.status, method: a.method, from: null,
      }));
      setAppointments(
        [...referrals, ...bookings]
          .filter((x) => !!x.appointment_date)
          .sort((x, y) => x.appointment_date.localeCompare(y.appointment_date)),
      );
    } catch (error: unknown) {
      console.error("Error fetching appointments:", error);
      toast({
        title: "Error",
        description: "Failed to load appointments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const brokerOptions = Object.entries(
    appointments.reduce<Record<string, string>>((m, a) => { if (a.broker_id) m[a.broker_id] = a.broker_name || "Unnamed broker"; return m; }, {}),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const shown = brokerFilter === ALL ? appointments : appointments.filter((a) => a.broker_id === brokerFilter);

  const getCalendarDays = () => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    } else {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }
  };

  const getAppointmentsForDay = (day: Date) => {
    return shown.filter((apt) =>
      isSameDay(parseISO(apt.appointment_date), day)
    );
  };

  const navigatePrevious = () => {
    if (viewMode === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(subWeeks(currentDate, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addWeeks(currentDate, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const calendarDays = getCalendarDays();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const selectedDayAppointments = selectedDate
    ? getAppointmentsForDay(selectedDate)
    : [];

  const upcomingAppointments = shown
    .filter((apt) => new Date(apt.appointment_date) >= new Date())
    .slice(0, 5);

  const stats = {
    total: shown.length,
    upcoming: shown.filter((apt) => new Date(apt.appointment_date) >= new Date()).length,
    today: shown.filter((apt) => isSameDay(parseISO(apt.appointment_date), new Date())).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Appointments Calendar</h1>
          <p className="text-muted-foreground">
            Will referrals and SortMyCover bookings across all brokers
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={brokerFilter} onValueChange={setBrokerFilter}>
            <SelectTrigger className="h-9 w-56" aria-label="Filter by broker"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All brokers</SelectItem>
              {brokerOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("month")}
          >
            Month
          </Button>
          <Button
            variant={viewMode === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("week")}
          >
            Week
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcoming}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today}</div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {viewMode === "month"
                    ? format(currentDate, "MMMM yyyy")
                    : `Week of ${format(startOfWeek(currentDate), "MMM d")} - ${format(endOfWeek(currentDate), "MMM d, yyyy")}`}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={goToToday}>
                    Today
                  </Button>
                  <Button variant="ghost" size="icon" onClick={navigatePrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={navigateNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Day names header */}
              <div className="grid grid-cols-7 mb-2">
                {dayNames.map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className={`grid grid-cols-7 gap-1 ${viewMode === "week" ? "min-h-[200px]" : ""}`}>
                {calendarDays.map((day) => {
                  const dayAppointments = getAppointmentsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isTodayDate = isToday(day);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        min-h-[80px] md:min-h-[100px] p-1 border rounded-lg text-left transition-colors
                        ${!isCurrentMonth && viewMode === "month" ? "bg-muted/30 text-muted-foreground" : "bg-card"}
                        ${isSelected ? "ring-2 ring-primary" : ""}
                        ${isTodayDate ? "border-primary" : "border-border"}
                        hover:bg-accent
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-medium ${
                            isTodayDate
                              ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                              : ""
                          }`}
                        >
                          {format(day, "d")}
                        </span>
                        {dayAppointments.length > 0 && (
                          <Badge variant="secondary" className="text-xs h-5">
                            {dayAppointments.length}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1 overflow-hidden">
                        {dayAppointments.slice(0, 2).map((apt) => (
                          <div
                            key={apt.id}
                            className={`text-xs rounded px-1 py-0.5 truncate ${apt.kind === "smc" ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/10 text-primary"}`}
                          >
                            {format(parseISO(apt.appointment_date), "h:mm a")} - {apt.first_name}
                          </div>
                        ))}
                        {dayAppointments.length > 2 && (
                          <div className="text-xs text-muted-foreground">
                            +{dayAppointments.length - 2} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Selected Day Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  {selectedDate
                    ? format(selectedDate, "EEEE, MMMM d")
                    : "Select a Day"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedDate ? (
                  <p className="text-muted-foreground text-sm">
                    Click on a day to see appointments
                  </p>
                ) : selectedDayAppointments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No appointments scheduled
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedDayAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="p-3 bg-muted/50 rounded-lg space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          <span className="font-medium">
                            {format(parseISO(apt.appointment_date), "h:mm a")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{apt.first_name}</span>
                        </div>
                        {apt.phone_number && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <span>{apt.phone_number}</span>
                          </div>
                        )}
                        {apt.method && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Video className="h-4 w-4" />
                            <span>{METHOD_LABEL[apt.method] || apt.method}</span>
                          </div>
                        )}
                        {apt.from && (
                          <div className="text-xs text-muted-foreground">
                            From: {apt.from}
                          </div>
                        )}
                        {apt.broker_name && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {apt.broker_name}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">{apt.kind === "smc" ? "SortMyCover" : "Will referral"}</Badge>
                          <Badge variant="outline" className="text-xs capitalize">{apt.status.replace(/_/g, " ")}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Appointments */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Upcoming</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No upcoming appointments
                  </p>
                ) : (
                  <div className="space-y-3">
                    {upcomingAppointments.map((apt) => (
                      <button
                        key={apt.id}
                        onClick={() => setSelectedDate(parseISO(apt.appointment_date))}
                        className="w-full text-left p-2 rounded-lg hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{apt.first_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {format(parseISO(apt.appointment_date), "MMM d")}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(parseISO(apt.appointment_date), "h:mm a")}
                          {apt.kind === "smc" && " • SortMyCover"}
                          {apt.broker_name && ` • ${apt.broker_name}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCalendar;

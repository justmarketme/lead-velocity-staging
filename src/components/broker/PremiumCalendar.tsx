import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
    Users,
    Clock,
    MapPin,
    Phone,
    ExternalLink,
    MoreVertical,
    AlertCircle,
    CheckCircle2,
    XCircle,
    MessageSquare,
    ChevronRight,
    ChevronLeft,
    Calendar as CalendarIcon,
    Sparkles,
    Send
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PremiumCalendarProps {
    appointments: any[];
    onUpdateStatus: (id: string, status: string, notes: string) => void;
}

const PremiumCalendar = ({ appointments, onUpdateStatus }: PremiumCalendarProps) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [notes, setNotes] = useState<any[]>([]);
    const [newNote, setNewNote] = useState("");
    const { toast } = useToast();

    const [tempStatus, setTempStatus] = useState<string>("");
    const [tempNote, setTempNote] = useState<string>("");

    const getStatusBadge = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'completed': return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-black uppercase text-[10px]">Completed</Badge>;
            case 'no-show': return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-black uppercase text-[10px]">No-show</Badge>;
            case 'late': return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-black uppercase text-[10px]">Late Arrival</Badge>;
            case 'other': return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-black uppercase text-[10px]">Rescheduled</Badge>;
            case 'scheduled': return <Badge className="bg-pink-500/10 text-pink-400 border-pink-500/20 font-black uppercase text-[10px]">Upcoming</Badge>;
            default: return <Badge variant="outline" className="font-black uppercase text-[10px]">{status}</Badge>;
        }
    };

    const handleOpenEdit = async (appt: any) => {
        setSelectedAppointment(appt);
        setTempStatus(appt.appointment_status?.toLowerCase() || "scheduled");
        setTempNote(appt.reason_notes || "");
        setEditDialogOpen(true);
        fetchNotes(appt.client_id);
    };

    const fetchNotes = async (leadId: string) => {
        const { data } = await supabase
            .from("broker_notes")
            .select("*")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: true });
        setNotes(data || []);
    };

    const handleAddNote = async () => {
        if (!newNote.trim() || !selectedAppointment) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.from("broker_notes").insert({
            lead_id: selectedAppointment.client_id,
            author_id: user.id,
            author_role: 'broker',
            content: newNote
        });

        if (!error) {
            setNewNote("");
            fetchNotes(selectedAppointment.client_id);
            toast({ title: "Note Transmitted", description: "Admin has been notified of your update." });
        }
    };

    const dayAppointments = appointments.filter(a =>
        a.appointment_date && format(new Date(a.appointment_date), 'yyyy-MM-dd') === (date ? format(date, 'yyyy-MM-dd') : '')
    );

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-10 animate-in slide-in-from-bottom-10 duration-1000">
            {/* Calendar Control */}
            <Card className="xl:col-span-1 bg-[#020617] border-white/5 backdrop-blur-3xl overflow-hidden h-fit sticky top-32 rounded-[40px] shadow-2xl">
                <CardContent className="p-0">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        className="p-6 bg-transparent text-white"
                        classNames={{
                            day_selected: "bg-gradient-to-br from-pink-500 to-rose-600 text-white hover:bg-pink-700 focus:bg-pink-600 rounded-2xl shadow-xl shadow-pink-500/20",
                            day_today: "bg-white/5 text-pink-400 font-black",
                            head_cell: "text-slate-600 font-black uppercase text-[9px] tracking-[0.2em] pb-4",
                            nav_button: "border-white/5 hover:bg-white/5 rounded-xl transition-all",
                            day: "h-10 w-10 p-0 font-bold aria-selected:opacity-100 rounded-2xl",
                        }}
                    />
                    <div className="p-8 border-t border-white/[0.03] space-y-6 bg-white/[0.01]">
                        <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] italic">Daily Performance</h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Load</span>
                                <span className="text-lg font-black text-white italic">{dayAppointments.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Completed</span>
                                <span className="text-lg font-black text-emerald-400 italic">8</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Appointment Feed */}
            <div className="xl:col-span-3 space-y-8">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-6">
                    <div>
                        <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-1">{date ? format(date, 'MMMM do, yyyy') : 'Select timing'}</h2>
                        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Client engagement management portal</p>
                    </div>
                    <Button className="bg-white text-black hover:bg-slate-200 font-black rounded-2xl px-8 h-14 uppercase tracking-widest text-[10px] shadow-2xl shadow-white/10 group">
                        <CalendarIcon className="w-4 h-4 mr-3 group-hover:rotate-12 transition-transform" /> Sync External Systems
                    </Button>
                </div>

                {dayAppointments.length > 0 ? (
                    <div className="space-y-6">
                        {dayAppointments.map((appt, i) => (
                            <Card key={appt.id || i} className="bg-[#020617] border-white/5 hover:border-pink-500/20 transition-all duration-500 group overflow-hidden rounded-[32px] shadow-xl">
                                <CardContent className="p-0">
                                    <div className="flex flex-col md:flex-row">
                                        <div className="md:w-40 bg-white/[0.01] p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/5 group-hover:bg-pink-500/5 transition-colors">
                                            <Clock className="w-6 h-6 text-slate-700 mb-3 group-hover:text-pink-500 transition-colors" />
                                            <span className="text-3xl font-black text-white italic tracking-tighter">{appt.appointment_time || "09:00"}</span>
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mt-1 italic">UTC+2</span>
                                        </div>
                                        <div className="flex-1 p-8 relative">
                                            <div className="absolute top-0 right-0 p-8">
                                                <Button variant="ghost" size="icon" className="text-slate-600 hover:text-white hover:bg-white/5 rounded-xl h-10 w-10" onClick={() => handleOpenEdit(appt)}>
                                                    <MoreVertical className="w-5 h-5" />
                                                </Button>
                                            </div>

                                            <div className="mb-6">
                                                <div className="flex flex-wrap items-center gap-4 mb-3">
                                                    <h3 className="text-2xl font-black text-white tracking-tighter uppercase italic">{appt.first_name} {appt.last_name}</h3>
                                                    {getStatusBadge(appt.appointment_status || "Scheduled")}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-6 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                                    <span className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer"><Phone className="w-3.5 h-3.5 text-pink-500" /> {appt.phone}</span>
                                                    <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-blue-500" /> Secure Digital Boardroom</span>
                                                </div>
                                            </div>

                                            {appt.reason_notes && (
                                                <div className="bg-white/[0.02] p-4 rounded-2xl border-l-4 border-slate-700 mb-6 group-hover:border-pink-500 transition-all">
                                                    <p className="text-sm text-slate-400 font-medium italic leading-relaxed">"{appt.reason_notes}"</p>
                                                </div>
                                            )}

                                            <div className="flex gap-3">
                                                <Button size="sm" variant="outline" className="bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10 h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all" onClick={() => handleOpenEdit(appt)}>
                                                    <MessageSquare className="w-4 h-4 mr-2" /> Collaborate
                                                </Button>
                                                <Button size="sm" variant="outline" className="bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10 h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                                    <ExternalLink className="w-4 h-4 mr-2" /> Elite CRM Profile
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="bg-[#020617]/40 border-2 border-dashed border-white/5 rounded-[40px] py-32 flex flex-col items-center text-center backdrop-blur-3xl shadow-2xl">
                        <div className="bg-slate-900/50 p-6 rounded-[32px] mb-8 ring-8 ring-white/[0.02]">
                            <CalendarIcon className="w-16 h-16 text-slate-800" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-500 italic uppercase tracking-tighter">Agenda Void Detected</h3>
                        <p className="text-slate-600 max-w-[320px] mt-4 text-sm font-bold uppercase tracking-widest leading-relaxed">No engagements detected for this cycle. Review your queue or initiate loading.</p>
                    </div>
                )}
            </div>

            {/* Interaction Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="bg-[#020617] border-white/5 text-white max-w-2xl rounded-[40px] p-0 overflow-hidden shadow-[0_0_100px_rgba(236,72,153,0.1)]">
                    <div className="p-10 pb-6 bg-gradient-to-br from-pink-500/10 to-transparent border-b border-white/5">
                        <DialogTitle className="text-4xl font-black italic tracking-tighter uppercase mb-2">ENGAGEMENT HUB</DialogTitle>
                        <DialogDescription className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Active collaboration for <span className="text-white font-black">{selectedAppointment?.first_name}</span></DialogDescription>
                    </div>

                    <Tabs defaultValue="status" className="p-10 pt-6">
                        <TabsList className="bg-white/[0.03] border border-white/5 p-1.5 rounded-2xl mb-8">
                            <TabsTrigger value="status" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-600 data-[state=active]:to-rose-600 data-[state=active]:text-white font-black text-[10px] uppercase tracking-widest h-11 px-8 rounded-xl transition-all">Outcome Status</TabsTrigger>
                            <TabsTrigger value="notes" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-600 data-[state=active]:to-rose-600 data-[state=active]:text-white font-black text-[10px] uppercase tracking-widest h-11 px-8 rounded-xl transition-all">Elite Notes Thread</TabsTrigger>
                        </TabsList>

                        <TabsContent value="status" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase text-slate-600 tracking-[0.3em] italic mb-4 block">Select Operational Outcome</Label>
                                <RadioGroup value={tempStatus} onValueChange={setTempStatus} className="grid grid-cols-2 gap-4">
                                    {[
                                        { id: 'completed', label: 'Closed / Done', icon: CheckCircle2, color: 'text-emerald-400', bg: 'hover:border-emerald-500/30' },
                                        { id: 'no-show', label: 'Ghost / No-Show', icon: XCircle, color: 'text-rose-500', bg: 'hover:border-rose-500/30' },
                                        { id: 'late', label: 'Late Arrival', icon: Clock, color: 'text-amber-500', bg: 'hover:border-amber-500/30' },
                                        { id: 'other', label: 'Reschedule Req', icon: AlertCircle, color: 'text-blue-500', bg: 'hover:border-blue-500/30' },
                                    ].map((s) => (
                                        <div key={s.id}>
                                            <RadioGroupItem value={s.id} id={s.id} className="peer sr-only" />
                                            <Label
                                                htmlFor={s.id}
                                                className={`flex flex-col items-center justify-between rounded-3xl border-2 border-white/5 bg-white/[0.01] p-6 ${s.bg} peer-data-[state=checked]:border-pink-500 peer-data-[state=checked]:bg-pink-500/5 peer-data-[state=checked]:shadow-2xl peer-data-[state=checked]:shadow-pink-500/10 cursor-pointer transition-all duration-300 group`}
                                            >
                                                <s.icon className={`mb-4 h-8 w-8 ${s.color} group-hover:scale-110 transition-transform`} />
                                                <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-white">{s.label}</span>
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>

                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase text-slate-600 tracking-[0.3em] italic block">Intelligence Entry</Label>
                                <Textarea
                                    placeholder="Brief reason or context for the outcome..."
                                    className="bg-white/[0.02] border-white/5 min-h-[120px] text-sm rounded-[24px] focus:ring-pink-500/20 focus:border-pink-500/50 transition-all font-medium p-6"
                                    value={tempNote}
                                    onChange={(e) => setTempNote(e.target.value)}
                                />
                            </div>

                            <div className="flex justify-end gap-4 pt-4">
                                <Button variant="ghost" onClick={() => setEditDialogOpen(false)} className="text-slate-500 hover:text-white font-black uppercase text-[10px] tracking-widest">Abort</Button>
                                <Button
                                    className="bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black uppercase text-[10px] tracking-widest h-14 px-10 rounded-2xl shadow-2xl shadow-pink-600/20"
                                    onClick={() => {
                                        onUpdateStatus(selectedAppointment.id, tempStatus, tempNote);
                                        setEditDialogOpen(false);
                                    }}
                                >
                                    Sync Intelligence
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="notes" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="bg-white/[0.01] rounded-[32px] p-8 border border-white/5 space-y-6 h-[350px] overflow-y-auto custom-scrollbar">
                                {notes.length > 0 ? notes.map((note) => (
                                    <div key={note.id} className={`flex gap-4 ${note.author_role === 'admin' ? 'flex-row-reverse' : ''}`}>
                                        <div className={`h-10 w-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 shadow-xl ${note.author_role === 'admin' ? 'bg-blue-600' : 'bg-pink-600'}`}>
                                            {note.author_role === 'admin' ? 'AD' : 'BP'}
                                        </div>
                                        <div className={`flex-1 max-w-[80%] ${note.author_role === 'admin' ? 'text-right' : ''}`}>
                                            <div className={`flex items-center gap-3 mb-2 ${note.author_role === 'admin' ? 'flex-row-reverse' : ''}`}>
                                                <span className="text-[10px] font-black text-white uppercase tracking-widest">{note.author_role === 'admin' ? 'CENTRAL COMMAND' : 'YOU'}</span>
                                                <span className="text-[9px] text-slate-600 uppercase font-black">{format(new Date(note.created_at), 'h:mm a')}</span>
                                            </div>
                                            <p className={`text-sm font-medium leading-relaxed p-5 rounded-[24px] border ${note.author_role === 'admin'
                                                    ? 'bg-blue-600/10 text-blue-100 border-blue-500/20 rounded-tr-none shadow-xl shadow-blue-900/10'
                                                    : 'bg-white/[0.03] text-slate-200 border-white/5 rounded-tl-none shadow-xl shadow-black/20'
                                                }`}>
                                                {note.content}
                                            </p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
                                        <MessageSquare className="w-12 h-12 mb-4" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Establish comms thread</p>
                                    </div>
                                )}
                            </div>

                            <div className="relative group p-1 bg-white/[0.02] border border-white/5 rounded-[24px] focus-within:border-pink-500/50 transition-all shadow-2xl shadow-black/40">
                                <Textarea
                                    placeholder="Enter encrypted message for Central Admin..."
                                    className="bg-transparent border-none pr-16 min-h-[100px] rounded-[24px] focus-visible:ring-0 text-white font-medium p-5"
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                />
                                <Button
                                    size="icon"
                                    className="absolute right-4 bottom-4 bg-gradient-to-br from-pink-500 to-rose-600 hover:scale-105 transition-transform h-12 w-12 rounded-2xl shadow-xl shadow-pink-500/20"
                                    onClick={handleAddNote}
                                >
                                    <Send className="w-5 h-5" />
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PremiumCalendar;

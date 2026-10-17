import { useEffect, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Star, StickyNote, MessageSquarePlus, GripVertical, MapPin, Loader2 } from "lucide-react";

// ── Pipeline data contract (broker_get_pipeline) ────────────────────────────
export interface PipelineLead {
  lead_id: string;
  company: string | null;
  role: string | null;
  area: string | null;
  phone: string | null;
  email: string | null;
  vibe: number | null;
  pipeline_stage: string;
  latest_note: string | null;
}

// The 6 broker pipeline stages. Kept SEPARATE from leads.current_status — these
// are stored on lead_order_items.pipeline_stage and validated server-side by
// broker_set_lead_stage.
const STAGES = ["New", "Contacted", "Interested", "Meeting Set", "Won", "Lost"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_ACCENT: Record<Stage, string> = {
  New: "border-t-slate-400",
  Contacted: "border-t-sky-500",
  Interested: "border-t-violet-500",
  "Meeting Set": "border-t-amber-500",
  Won: "border-t-emerald-500",
  Lost: "border-t-rose-500",
};

interface PipelineBoardProps {
  orderId: string;
}

const PipelineBoard = ({ orderId }: PipelineBoardProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [noteLead, setNoteLead] = useState<PipelineLead | null>(null);
  const [fbLead, setFbLead] = useState<PipelineLead | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("broker_get_pipeline", { p_order_id: orderId });
    if (error) {
      console.error("broker_get_pipeline error:", error);
      toast({ title: "Error", description: "Failed to load your pipeline.", variant: "destructive" });
      setLeads([]);
    } else {
      setLeads(((data || []) as PipelineLead[]).map((l) => ({ ...l, pipeline_stage: l.pipeline_stage || "New" })));
    }
    setLoading(false);
  }, [orderId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Drag → optimistic move, revert on error ───────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newStage = destination.droppableId as Stage;
    const prev = leads;
    setLeads((cur) => cur.map((l) => (l.lead_id === draggableId ? { ...l, pipeline_stage: newStage } : l)));

    const { error } = await (supabase as any).rpc("broker_set_lead_stage", {
      p_order_id: orderId,
      p_lead_id: draggableId,
      p_stage: newStage,
    });
    if (error) {
      console.error("broker_set_lead_stage error:", error);
      toast({ title: "Couldn't move lead", description: error.message || "Reverted.", variant: "destructive" });
      setLeads(prev); // revert
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const byStage = (stage: Stage) => leads.filter((l) => (l.pipeline_stage as Stage) === stage);

  return (
    <TooltipProvider delayDuration={200}>
      <DragDropContext onDragEnd={onDragEnd}>
        {/* Columns scroll horizontally on mobile; cards stack within each column. */}
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x">
          {STAGES.map((stage) => {
            const items = byStage(stage);
            return (
              <Droppable droppableId={stage} key={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-shrink-0 w-[280px] snap-start rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm transition-colors ${
                      snapshot.isDraggingOver ? "bg-primary/10 border-primary/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
                      <span className="text-sm font-semibold">{stage}</span>
                      <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                    </div>
                    <div className="p-2 space-y-2 min-h-[120px]">
                      {items.map((lead, index) => (
                        <Draggable draggableId={lead.lead_id} index={index} key={lead.lead_id}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`rounded-lg border-t-2 border border-border/60 bg-background/80 p-3 shadow-sm ${
                                STAGE_ACCENT[stage]
                              } ${dragSnapshot.isDragging ? "ring-2 ring-primary/50 shadow-lg" : ""}`}
                            >
                              <div className="flex items-start gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      {...dragProvided.dragHandleProps}
                                      className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
                                      aria-label="Drag to another stage"
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Drag to move between stages</TooltipContent>
                                </Tooltip>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">{lead.company || "—"}</p>
                                  <p className="text-xs text-muted-foreground truncate">{lead.role || "—"}</p>
                                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5">
                                    {lead.area && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3" /> {lead.area}
                                      </span>
                                    )}
                                    {lead.vibe != null && (
                                      <span
                                        title="Data Quality (0–99): how complete & verified this lead's contact info is — phone, matching-domain email, website, an established, relevant business. Higher = more actionable (contactability, not buying intent)."
                                        className="inline-flex items-center gap-1 text-xs cursor-help"
                                      >
                                        <Star className="h-3 w-3 text-yellow-500" /> {lead.vibe}
                                      </span>
                                    )}
                                  </div>
                                  {lead.latest_note && (
                                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2 border-l-2 border-border pl-2">
                                      {lead.latest_note}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/60">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setNoteLead(lead)}>
                                      <StickyNote className="h-3.5 w-3.5 mr-1" /> Note
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Add or view a private note</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFbLead(lead)}>
                                      <MessageSquarePlus className="h-3.5 w-3.5 mr-1" /> Message LV
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Message Lead Velocity about this lead</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {items.length === 0 && (
                        <p className="text-xs text-muted-foreground/60 text-center py-6">Drop leads here</p>
                      )}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Note dialog — reuses broker_add_lead_note / latest_note from pipeline */}
      <NoteDialog
        orderId={orderId}
        lead={noteLead}
        onClose={() => setNoteLead(null)}
        onSaved={(leadId, content) =>
          setLeads((cur) => cur.map((l) => (l.lead_id === leadId ? { ...l, latest_note: content } : l)))
        }
      />

      {/* Feedback dialog — broker_send_feedback */}
      <FeedbackDialog orderId={orderId} lead={fbLead} onClose={() => setFbLead(null)} />
    </TooltipProvider>
  );
};

// ── Note dialog ─────────────────────────────────────────────────────────────
const NoteDialog = ({
  orderId,
  lead,
  onClose,
  onSaved,
}: {
  orderId: string;
  lead: PipelineLead | null;
  onClose: () => void;
  onSaved: (leadId: string, content: string) => void;
}) => {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText("");
  }, [lead]);

  const save = async () => {
    if (!lead) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("broker_add_lead_note", {
      p_order_id: orderId,
      p_lead_id: lead.lead_id,
      p_note: trimmed,
    });
    setSaving(false);
    if (error) {
      console.error("broker_add_lead_note error:", error);
      toast({ title: "Couldn't save note", description: error.message || "Please try again.", variant: "destructive" });
      return;
    }
    onSaved(lead.lead_id, trimmed);
    toast({ title: "Note saved" });
    onClose();
  };

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Private note{lead?.company ? ` — ${lead.company}` : ""}</DialogTitle>
          <DialogDescription>Only you can see notes on your leads.</DialogDescription>
        </DialogHeader>
        {lead?.latest_note && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">Latest note</p>
            {lead.latest_note}
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note (call outcome, next step, etc.)"
          rows={4}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !text.trim()}>{saving ? "Saving…" : "Save note"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Feedback ("Message Lead Velocity") dialog ───────────────────────────────
const FeedbackDialog = ({
  orderId,
  lead,
  onClose,
}: {
  orderId: string;
  lead: PipelineLead | null;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText("");
  }, [lead]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("broker_send_feedback", {
      p_order_id: orderId,
      p_message: trimmed,
      p_lead_id: lead?.lead_id ?? null,
    });
    setSaving(false);
    if (error) {
      console.error("broker_send_feedback error:", error);
      toast({ title: "Couldn't send", description: error.message || "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Message sent to Lead Velocity", description: "Thanks — we'll take a look." });
    onClose();
  };

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message Lead Velocity</DialogTitle>
          <DialogDescription>
            Flag an issue or give feedback{lead?.company ? ` about ${lead.company}` : ""} — bad number, wrong info,
            already a client, etc.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell us what's up with this lead…"
          rows={4}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={saving || !text.trim()}>{saving ? "Sending…" : "Send message"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PipelineBoard;

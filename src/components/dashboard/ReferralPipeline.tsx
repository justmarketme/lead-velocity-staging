import { useState, useMemo } from "react";
import {
    DragDropContext,
    Droppable,
    Draggable,
    DropResult,
} from "@hello-pangea/dnd";
import {
    User,
    Phone,
    Calendar as CalendarIcon,
    FileCheck,
    CheckCircle2,
    Clock,
    Building2,
    GripVertical,
    Bot,
    MessageSquare,
    ChevronRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

interface Referral {
    id: string;
    first_name: string;
    phone_number: string;
    email?: string | null;
    will_status: string | null;
    broker_appointment_scheduled: boolean | null;
    appointment_date: string | null;
    created_at: string | null;
    parent_lead_id: string;
    lead?: {
        first_name: string | null;
        last_name: string | null;
        broker_id: string | null;
        brokers?: {
            firm_name: string;
            contact_person: string;
            email: string | null;
        } | null;
    } | null;
}

const PIPELINE_STAGES = [
    { id: "Pending", label: "Qualified", icon: Bot, gradient: "from-blue-500 to-cyan-400", bgGlow: "shadow-blue-500/20" },
    { id: "In Progress", label: "In Contact", icon: Phone, gradient: "from-violet-500 to-purple-400", bgGlow: "shadow-violet-500/20" },
    { id: "Scheduled", label: "Appointment", icon: CalendarIcon, gradient: "from-amber-500 to-orange-400", bgGlow: "shadow-amber-500/20" },
    { id: "Completed", label: "Converted", icon: CheckCircle2, gradient: "from-emerald-500 to-green-400", bgGlow: "shadow-emerald-500/20" },
];

interface ReferralPipelineProps {
    referrals: Referral[];
    onUpdateStatus: (id: string, status: string) => Promise<void>;
    onViewDetails: (referral: Referral) => void;
    onAICall?: (referral: Referral) => void;
}

export const ReferralPipeline = ({ referrals, onUpdateStatus, onViewDetails, onAICall }: ReferralPipelineProps) => {
    const groupedReferrals = useMemo(() => {
        const grouped: Record<string, Referral[]> = {
            "Pending": [],
            "In Progress": [],
            "Scheduled": [],
            "Completed": [],
        };

        referrals.forEach((ref) => {
            let rawStatus = ref.will_status || "Pending";
            let status = rawStatus.includes('|') ? rawStatus.split('|')[1] : rawStatus;

            if (ref.broker_appointment_scheduled && status !== "Completed") {
                status = "Scheduled";
            }
            if (grouped[status]) {
                grouped[status].push(ref);
            } else {
                grouped["Pending"].push(ref);
            }
        });

        return grouped;
    }, [referrals]);

    const handleDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination || destination.droppableId === source.droppableId) return;

        onUpdateStatus(draggableId, destination.droppableId);
    };

    return (
        <TooltipProvider>
            <DragDropContext onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-h-[600px]">
                    {PIPELINE_STAGES.map((stage) => {
                        const stageReferrals = groupedReferrals[stage.id] || [];
                        const Icon = stage.icon;

                        return (
                            <div key={stage.id} className="flex flex-col gap-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("p-1.5 rounded-lg bg-gradient-to-br", stage.gradient)}>
                                            <Icon className="h-3.5 w-3.5 text-white" />
                                        </div>
                                        <h3 className="font-semibold text-sm">{stage.label}</h3>
                                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
                                            {stageReferrals.length}
                                        </Badge>
                                    </div>
                                </div>

                                <Droppable droppableId={stage.id}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className={cn(
                                                "flex-1 rounded-xl p-2 transition-colors min-h-[200px] border border-transparent",
                                                snapshot.isDraggingOver ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                                            )}
                                        >
                                            <div className="space-y-3">
                                                {stageReferrals.map((referral, index) => (
                                                    <Draggable key={referral.id} draggableId={referral.id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                className={cn(
                                                                    "group relative p-3 rounded-xl border bg-card transition-all cursor-pointer hover:shadow-lg",
                                                                    snapshot.isDragging ? "shadow-2xl ring-2 ring-primary border-primary" : "border-border/50"
                                                                )}
                                                                onClick={() => onViewDetails(referral)}
                                                            >
                                                                <div className="space-y-2">
                                                                    <div className="flex items-start justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <Avatar className="h-6 w-6">
                                                                                <AvatarFallback className={cn("text-[10px] text-white bg-gradient-to-br", stage.gradient)}>
                                                                                    {referral.first_name[0].toUpperCase()}
                                                                                </AvatarFallback>
                                                                            </Avatar>
                                                                            <span className="font-bold text-xs truncate max-w-[100px]">{referral.first_name}</span>
                                                                        </div>
                                                                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                    </div>

                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                                            <Phone className="h-2.5 w-2.5" />
                                                                            {referral.phone_number}
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                                            <Building2 className="h-2.5 w-2.5" />
                                                                            <span className="truncate">{referral.lead?.brokers?.firm_name || "Unassigned"}</span>
                                                                        </div>
                                                                    </div>

                                                                    {referral.broker_appointment_scheduled && (
                                                                        <Badge variant="outline" className="w-full justify-start text-[9px] gap-1.5 bg-amber-500/5 text-amber-600 border-amber-500/20 py-0.5">
                                                                            <CalendarIcon className="h-2.5 w-2.5" />
                                                                            {referral.appointment_date ? format(new Date(referral.appointment_date), "MMM d, h:mm a") : "Scheduled"}
                                                                        </Badge>
                                                                    )}

                                                                    <div className="pt-2 flex items-center justify-between border-t border-border/30 mt-2">
                                                                        <span className="text-[9px] text-muted-foreground opacity-60">
                                                                            via {referral.lead?.first_name}
                                                                        </span>
                                                                        <div className="flex gap-1">
                                                                            <div
                                                                                className="h-5 w-5 rounded-full bg-green-500/10 flex items-center justify-center border border-background cursor-pointer hover:bg-green-500/20 transition-colors"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    window.open(`tel:${referral.phone_number}`, '_self');
                                                                                }}
                                                                                title="Call Referral"
                                                                            >
                                                                                <Phone className="h-2.5 w-2.5 text-green-500" />
                                                                            </div>
                                                                            {onAICall && (
                                                                                <div
                                                                                    className="h-5 w-5 rounded-full bg-violet-500/10 flex items-center justify-center border border-background cursor-pointer hover:bg-violet-500/20 transition-colors"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        onAICall(referral);
                                                                                    }}
                                                                                    title="AI Agent Call"
                                                                                >
                                                                                    <Bot className="h-2.5 w-2.5 text-violet-500" />
                                                                                </div>
                                                                            )}
                                                                            <div
                                                                                className="h-5 w-5 rounded-full bg-blue-500/10 flex items-center justify-center border border-background cursor-pointer hover:bg-blue-500/20 transition-colors"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    onViewDetails(referral);
                                                                                }}
                                                                                title="View Details"
                                                                            >
                                                                                <MessageSquare className="h-2.5 w-2.5 text-blue-500" />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </Droppable>
                            </div>
                        );
                    })}
                </div>
            </DragDropContext>
        </TooltipProvider>
    );
};

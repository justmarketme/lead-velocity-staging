import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, Mail, MessageCircle, Send, ZoomIn, ZoomOut, Maximize, Monitor, Save, Loader2, Mic, MicOff, Bot, Check, X, Paperclip, AudioLines, SendHorizonal } from "lucide-react";
import { generateSmartPDF, blobToBase64 } from "@/utils/pdfUtils";
import logo from "@/assets/lead-velocity-logo.webp";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { getProposalEmailSignature } from "@/utils/emailSignature";
import { callLegalAI } from "@/utils/legalAI";
import { BrokerSelector } from "./BrokerSelector";

interface ProposalGeneratorProps {
    onBack: () => void;
    initialData?: any;
}

// Helper component for inline editing
const Editable = ({
    value,
    onChange,
    className = "",
    tag: Tag = "p",
    html = false
}: {
    value: string;
    onChange: (val: string) => void;
    className?: string;
    tag?: any;
    html?: boolean;
}) => {
    const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
        const text = html ? e.currentTarget.innerHTML : e.currentTarget.textContent;
        if (text !== null && text !== value) {
            onChange(text);
        }
    };

    return (
        <Tag
            contentEditable
            suppressContentEditableWarning
            className={`${className} hover:bg-pink-50/50 hover:outline-dashed hover:outline-1 hover:outline-pink-300 rounded px-0.5 -mx-0.5 transition-all outline-none focus:bg-pink-50 focus:outline focus:outline-2 focus:outline-pink-500 cursor-text`}
            onBlur={handleBlur}
            dangerouslySetInnerHTML={html ? { __html: value } : undefined}
        >
            {html ? undefined : value}
        </Tag>
    );
};

const ProposalGenerator = ({ onBack, initialData }: ProposalGeneratorProps) => {
    const { toast } = useToast();
    const reportRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(0.65);
    const [isGenerating, setIsGenerating] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(340);
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(0);

    const handleDividerMouseDown = (e: React.MouseEvent) => {
        isDraggingRef.current = true;
        dragStartXRef.current = e.clientX;
        dragStartWidthRef.current = sidebarWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const delta = e.clientX - dragStartXRef.current;
            const newWidth = Math.max(260, Math.min(600, dragStartWidthRef.current + delta));
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const [isListening, setIsListening] = useState(false);
    const [aiInput, setAiInput] = useState("");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isConversational, setIsConversational] = useState(false);
    const [aiResponse, setAiResponse] = useState("");
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([
        "Make it sound more premium",
        "Shorten the qualification criteria",
        "Emphasize the performance guarantee"
    ]);
    const [pendingChanges, setPendingChanges] = useState<any>(null);

    const [formData, setFormData] = useState({
        // Variables
        clientName: "Valued Partner",
        date: new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        investment: "R8,500 (p/m)",
        guaranteedLeads: "± 17 qualified business leads",
        costPerLead: "R500 per lead",
        contentsCover: "R1,000,000 or more",
        buildingValue: "R4,000,000 or more",
        commissionRate: "9%",

        // Static Text Blocks
        // Token Model Aligned
        title: "Your <span class='text-[#D035D0]'>Mission</span> <span class='text-[#F48C57]'>Control</span> for Growth",
        subtitle: "Growth Starter Lead Strategy (Bronze Tier)",

        purposeTitle: "Strategic Lead Generation",
        purposeText: "Our core solution provides a <strong class='text-pink-900 bg-pink-50 px-1 rounded'>Lead Token</strong> engine. If you exhaust your tokens early, you can Top-Up at <strong>R500 per lead (minimum 5 tokens / R2,500)</strong> with 1 week's notice.",
        purposeSubText: "Engagement is month-to-month. Subscription pauses automatically upon non-payment at the end of a cycle. Resume anytime by renewing payment. Premature cancellation within a cycle is non-refundable.",

        overviewTitle: "Campaign Overview",
        quoteText: `"Each qualified lead is one token. Minimum top-up is 5 tokens. Cancellation is immediate upon cessation of payment with no-refund policy for the active cycle."`,

        criteriaTitle: "Qualification Criteria",
        criteria1: "<strong>Decision Maker:</strong> Business owner, director, or key decision-maker.",
        criteria2: "<strong>SME Value Threshold:</strong> Contents cover of <strong>R1,000,000+</strong> or Building value of <strong>R4,000,000+</strong>.",
        criteria3: "<strong>Target Sectors:</strong> Logistics, Engineering, and Established SMEs.",

        excludedTitle: "Strictly Excluded",
        excludedText: "Personal lines, micro businesses below threshold, and qualified enquiry replacements.",

        alignmentTitle: "Performance Alignment",
        alignmentText: "Tokens are paid monthly in advance. Top-Ups require one (1) week's notice. Service pauses automatically if not renewed.",
        alignmentBoxText: "Additional placed policies attract a <span class='text-pink-400 font-bold'>9% commission</span> on the first-year premium."
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const [history, setHistory] = useState<any[]>([]);

    const fetchHistory = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
            .from('admin_documents')
            .select('*')
            .eq('category', 'proposals')
            .eq('uploaded_by', user.id)
            .order('created_at', { ascending: false })
            .limit(5);
        if (data && !error) setHistory(data);
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const [searchParams] = useSearchParams();
    const globalBrokerId = searchParams.get("brokerId");

    useEffect(() => {
        if (globalBrokerId) {
            const fetchGlobalBroker = async () => {
                const { data, error } = await supabase
                    .from('broker_onboarding_responses')
                    .select('*')
                    .eq('id', globalBrokerId)
                    .single();

                if (data && !error) {
                    handleBrokerSelect(data);
                }
            };
            fetchGlobalBroker();
        }
    }, [globalBrokerId]);

    const [recipientEmail, setRecipientEmail] = useState("");
    const [recipientPhone, setRecipientPhone] = useState("");

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Broker selector populate
    const handleBrokerSelect = (broker: any) => {
        const clientName = broker.full_name || "Valued Partner";
        const clientCompany = broker.firm_name || broker.company_name || "Client Company (Pty) Ltd";
        const leads = broker.desired_leads_weekly || 0;

        let tierData = {
            subtitle: "Bronze: Growth Starter",
            investment: "R8,500 (p/m)",
            leads: "± 17 qualified business leads",
            cost: "± R500",
            comm: "9%",
            alignment: "Where we prove consistency. Qualified SME decision-maker leads, core targeting & messaging, monthly performance check-in.",
            purposeTitle: "Strategic Lead Generation",
            purposeText: "Our core solution provides a consistent lead engine delivering qualified prospects directly to your sales pipeline. We operate on a Lead Token model (paid monthly in advance).",
            purposeSubText: "Month-to-month engagement. Subscription pauses automatically upon non-payment. Premature cancellation within a 30-day cycle is non-refundable."
        };

        if (leads <= 10 && leads > 0) {
            tierData = {
                subtitle: "Pilot Phase: Where We Prove Consistency",
                investment: "R6,000 (once-off)",
                leads: "± 10 qualified business leads",
                cost: "R600",
                comm: "10%",
                alignment: "The pilot investment covers the delivery of the first ten qualified business leads. Beyond that, we align with your success.",
                purposeTitle: "Purpose of the Pilot",
                purposeText: "This 30-day pilot is designed to provide a structured, low-risk starting point while generating enough real performance data to assess quality and ROI.",
                purposeSubText: "Lead Velocity operates as a lead partner focused on qualified decision-makers."
            };
        } else if (leads > 32) {
            tierData = {
                subtitle: "Gold: Performance Partner",
                investment: "R16,500+ (p/m)",
                leads: "33-40+ qualified business leads",
                cost: "± R350-R400",
                comm: "6%",
                alignment: "Where we operate as a revenue partner. Maximum lead volume, advanced qualification, and dedicated campaign management.",
                purposeTitle: "Revenue Partnership",
                purposeText: "Our premium tier where we operate as a full revenue partner. Token-based delivery ensures consistent ROI and inventory management.",
                purposeSubText: "Month-to-month engagement. Account pauses automatically if the current cycle ends without payment. Early exit within a cycle is non-refundable."
            };
        } else if (leads >= 20) {
            tierData = {
                subtitle: "Silver: Scale & Optimise",
                investment: "R10,500 (p/m)",
                leads: "± 23-26 qualified business leads",
                cost: "± R400-R450",
                comm: "8%",
                alignment: "Where results become predictable. Higher lead volume, ongoing optimisation, messaging testing, and bi-weekly reviews.",
                purposeTitle: "Predictable Scaling",
                purposeText: "The Silver tier provides systematic growth for scaling brokers. Delivery follows the Lead Token model, ensuring transparency and inventory control.",
                purposeSubText: "Month-to-month engagement. Subscription pauses upon non-payment at cycle-end. Resume anytime by renewing payment. No refunds for early exit."
            };
        }

        setFormData(prev => ({
            ...prev,
            clientName,
            clientCompany,
            subtitle: tierData.subtitle,
            investment: tierData.investment,
            guaranteedLeads: tierData.leads,
            costPerLead: tierData.cost,
            commissionRate: tierData.comm,
            alignmentText: tierData.alignment,
            purposeTitle: tierData.purposeTitle,
            purposeText: tierData.purposeText,
            purposeSubText: tierData.purposeSubText,
            alignmentBoxText: `Additional placed policies attract a <span class='text-pink-400 font-bold'>${tierData.comm} commission</span> calculated on the first-year premium.`
        }));

        if (broker.email) setRecipientEmail(broker.email);
        if (broker.phone_number || broker.phone) setRecipientPhone(broker.phone_number || broker.phone);
        toast({ title: "Broker & Tier Loaded", description: `Selected ${tierData.subtitle.split(':')[0]} based on ${leads} leads.` });
    };

    // Robust PDF Generation with Clone Strategy
    const handleGenerate = async (action: 'download' | 'save' | 'email') => {
        if (!reportRef.current) return;

        try {
            setIsGenerating(true);
            const actionLabel = action === 'email' ? "Preparing Email..." : action === 'save' ? "Saving Proposal..." : "Generating PDF...";
            toast({
                title: actionLabel,
                description: "Creating your high-quality proposal...",
            });

            const element = reportRef.current;
            const clone = element.cloneNode(true) as HTMLElement;

            // Setup clone for A4 Capture
            clone.style.transform = "none";
            clone.style.position = "fixed";
            clone.style.top = "-9999px";
            clone.style.left = "0";
            clone.style.margin = "0";
            clone.style.width = "210mm";
            clone.style.minHeight = "297mm";
            clone.style.height = "auto";
            clone.style.zIndex = "-9999";

            // Remove interactive styles
            const editables = clone.querySelectorAll('[contenteditable]');
            editables.forEach(el => {
                el.removeAttribute('contenteditable');
                el.className = el.className.replace(/hover:\S+/g, '').replace(/focus:\S+/g, '');
            });

            // Add page-break styles to prevent content from being cut
            const style = document.createElement('style');
            style.textContent = `
                section, .proposal-section { page-break-inside: avoid !important; break-inside: avoid !important; }
                .content-block { page-break-inside: avoid !important; break-inside: avoid !important; }
                header { page-break-after: avoid !important; }
                h1, h2, h3 { page-break-after: avoid !important; }
            `;
            clone.appendChild(style);

            document.body.appendChild(clone);

            const pdf = await generateSmartPDF(clone);

            document.body.removeChild(clone);

            const fileName = `Lead_Velocity_Proposal_${formData.clientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;

            if (action === 'download') {
                pdf.save(fileName);
                toast({ title: "Success", description: "PDF downloaded." });
            } else {
                // For 'save' and 'email', we upload to Supabase
                const pdfBlob = pdf.output('blob');
                const filePath = `proposals/${fileName}`;

                // Upload to Storage
                const { error: uploadError } = await supabase.storage
                    .from('admin-documents')
                    .upload(filePath, pdfBlob, {
                        upsert: false,
                        contentType: 'application/pdf'
                    });

                if (uploadError) throw uploadError;

                // Get Public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('admin-documents')
                    .getPublicUrl(filePath);

                // Get Current User
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    // Save to Database
                    const { error: dbError } = await supabase
                        .from('admin_documents')
                        .insert({
                            name: fileName,
                            description: `Proposal for ${formData.clientName}`,
                            file_path: filePath,
                            file_type: 'pdf',
                            file_size: pdfBlob.size,
                            category: 'proposals',
                            uploaded_by: user.id,
                            content_data: formData
                        });

                    if (dbError) throw dbError;

                    fetchHistory(); // Refresh history
                }

                if (action === 'email') {
                    if (!recipientEmail) {
                        toast({ title: "Email required", description: "Enter recipient email.", variant: "destructive" });
                    } else {
                        toast({ title: "Sending Email", description: "Attaching PDF to email..." });
                        const base64Pdf = await blobToBase64(pdfBlob);

                        const subject = `Proposal: ${formData.clientName} - Lead Velocity`;
                        const emailBody = `<p>Hi ${formData.clientName},</p><p>Please find the proposal for the Premium Business Insurance Lead Pilot attached to this email.</p><p>I'd be happy to walk you through the details at your convenience.</p><br/>${getProposalEmailSignature()}`;

                        const { error: fnError } = await supabase.functions.invoke('send-communication', {
                            body: {
                                channel: 'email',
                                recipient_contact: recipientEmail,
                                recipient_type: 'lead',
                                subject: subject,
                                content: emailBody,
                                attachments: [
                                    {
                                        filename: fileName,
                                        content: base64Pdf
                                    }
                                ]
                            }
                        });

                        if (fnError) throw new Error("Failed to send email. Ensure the edge function is deployed.");

                        toast({ title: "Email Sent!", description: "Document sent successfully with attachment." });
                    }
                } else {
                    toast({ title: "Saved", description: "Proposal saved to documents library." });
                }
            }
        } catch (error: any) {
            console.error(error);
            toast({ title: "Error", description: error.message || "Failed to generate PDF.", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleWhatsAppShare = async () => {
        if (!recipientPhone) {
            toast({ title: "Phone required", description: "Enter WhatsApp number.", variant: "destructive" });
            return;
        }

        toast({ title: "Uploading...", description: "Preparing WhatsApp link..." });

        // For WhatsApp, we also want to send a link if possible
        // We'll reuse the 'save' logic essentially to get a link
        try {
            // This is a bit redundant but ensures we have a link
            // We'll trigger a 'save' action to get the file into storage
            // In a real production app, we'd refactor handleGenerate to return the URL

            // For now, let's just open WhatsApp with the text
            const cleanPhone = recipientPhone.replace(/[^\d]/g, "");
            const text = encodeURIComponent(`Hi ${formData.clientName}, I've prepared the proposal for the Premium Business Insurance Lead Pilot. Sending it to you now.`);

            window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
            toast({ title: "Opening WhatsApp...", description: "Don't forget to attach the downloaded PDF!" });
        } catch (e) {
            console.error(e);
        }
    };

    const adjustZoom = (delta: number) => {
        setZoom(prev => Math.max(0.3, Math.min(1.5, prev + delta)));
    };

    // Voice Synthesis (TTS) - Improved Voice Selection (Hand-picked for ZA)
    const speak = (text: string) => {
        if (!('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();

        const getPreferredVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) return null;

            const naturalZA = voices.find(v => (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('google')) && v.lang === 'en-ZA');
            if (naturalZA) return naturalZA;

            const premiumFemale = voices.find(v => (v.name.toLowerCase().includes('ayanda') || v.name.toLowerCase().includes('hazel') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('susan')));
            if (premiumFemale) return premiumFemale;

            const femaleZA = voices.find(v => v.lang === 'en-ZA' && v.name.toLowerCase().includes('female'));
            if (femaleZA) return femaleZA;

            const anyZA = voices.find(v => v.lang === 'en-ZA');
            if (anyZA) return anyZA;

            const genericNaturalFemale = voices.find(v => v.name.toLowerCase().includes('natural') && v.name.toLowerCase().includes('female'));
            if (genericNaturalFemale) return genericNaturalFemale;

            return voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) || voices[0];
        };

        const executeSpeak = () => {
            const voice = getPreferredVoice();
            const utterance = new SpeechSynthesisUtterance(text);

            if (voice) {
                utterance.voice = voice;
                if (!voice.name.toLowerCase().includes('natural') && !voice.name.toLowerCase().includes('google')) {
                    utterance.pitch = 1.05;
                    utterance.rate = 0.92;
                }
            }

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance);
        };

        if (window.speechSynthesis.getVoices().length > 0) {
            executeSpeak();
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                executeSpeak();
                window.speechSynthesis.onvoiceschanged = null;
            };
        }
    };

    const toggleListening = () => {
        if (isListening) { setIsListening(false); return; }
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast({ title: "Not Supported", description: "Voice input is not supported.", variant: "destructive" });
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-ZA';
        recognition.onstart = () => { setIsListening(true); toast({ title: "Listening..." }); };
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setAiInput(transcript);
            processAICommand(transcript);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
    };

    const processAICommand = async (command: string) => {
        setIsThinking(true);
        setAiResponse("Let me review the proposal...");
        try {
            const result = await callLegalAI(command, formData, "Proposal");
            const { response, changes, suggestions } = result;

            setAiResponse(response || "I've reviewed the request.");
            if (changes && Object.keys(changes).length > 0) {
                setPendingChanges(changes);
            }
            if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
                setAiSuggestions(suggestions);
            }
            if (response && isConversational) speak(response);
            if (response && !isConversational) setAiResponse(response);
        } catch (error: any) {
            console.error("AI Assistant Error:", error);
            const errorMsg = "I'm sorry, I couldn't connect to the AI. Please check your internet connection.";
            setAiResponse(errorMsg);
            toast({ title: "AI Error", description: error.message, variant: "destructive" });
        } finally {
            setIsThinking(false);
        }
    };

    const applyPendingChanges = () => {
        if (!pendingChanges) return;
        setFormData(prev => ({ ...prev, ...pendingChanges }));
        setPendingChanges(null);
        setAiResponse("Changes applied to the proposal.");
        toast({ title: "Applied", description: "Proposal updated." });
    };

    const handleAISubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiInput.trim()) return;
        processAICommand(aiInput);
        setAiInput("");
    };

    return (
        <div className="relative -m-4 sm:-m-6 lg:-m-8 h-[calc(100vh-64px)] flex flex-col font-sans animate-in fade-in duration-500 overflow-hidden text-white bg-[#020617]">
            {/* Header / Top Toolbar */}
            <div className="flex items-center justify-between shrink-0 mb-4 px-6 py-4 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-white/10 rounded-xl">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-pink-400">Proposal Console</h2>
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Performance-Based Agreement v4.0</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="ghost" className="text-slate-400 hover:text-white hover:bg-white/5 border border-white/5 rounded-xl px-4 h-10">
                        <Save className="mr-2 h-4 w-4" />Save
                    </Button>
                    <Button onClick={() => handleGenerate('download')} disabled={isGenerating} className="bg-pink-600 hover:bg-pink-700 text-white rounded-xl px-6 h-10 shadow-lg shadow-pink-600/20 border-t border-white/10 font-bold">
                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
            </div>

            <div className="flex flex-row flex-1 overflow-hidden gap-0 min-h-0 px-4 pb-4">
                {/* Resizable Sidebar */}
                <div style={{ width: sidebarWidth, minWidth: 260, maxWidth: 600, flexShrink: 0 }} className="h-full flex flex-col gap-4 overflow-hidden">
                    <Card className="bg-slate-900/50 border-white/5 flex-1 overflow-y-auto custom-scrollbar rounded-2xl">
                        <CardContent className="p-6 space-y-6">
                            <BrokerSelector onSelect={handleBrokerSelect} />

                            <div className="space-y-4">
                                <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest flex items-center gap-2">
                                    <Send className="h-4 w-4 text-pink-400" />
                                    Proposal Details
                                </h3>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Client Name</label>
                                    <Input value={formData.clientName} onChange={(e) => updateField('clientName', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm rounded-lg" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 uppercase font-bold">Investment</label>
                                        <Input value={formData.investment} onChange={(e) => updateField('investment', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm rounded-lg" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 uppercase font-bold">Leads</label>
                                        <Input value={formData.guaranteedLeads} onChange={(e) => updateField('guaranteedLeads', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm rounded-lg" />
                                    </div>
                                </div>
                            </div>

                            <Separator className="bg-white/5" />

                            <div className="space-y-3">
                                <h3 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Pricing Tiers</h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        {
                                            name: "Pilot Phase",
                                            subtitle: "Pilot Phase: Where We Prove Consistency",
                                            investment: "R6,000 (once-off)",
                                            leads: "± 10 qualified business leads",
                                            cost: "R600",
                                            comm: "10%",
                                            alignment: "The pilot investment covers the delivery of the first ten qualified business leads. Beyond that, we align with your success.",
                                            purposeTitle: "Purpose of the Pilot",
                                            purposeText: "This 30-day pilot is designed to provide a structured, low-risk starting point while generating enough real performance data to assess quality and ROI.",
                                            purposeSubText: "Lead Velocity operates as a lead partner focused on qualified decision-makers.",
                                            color: "border-pink-500/20 hover:border-pink-500/50 hover:bg-pink-500/10 text-pink-200"
                                        },
                                        {
                                            name: "Bronze",
                                            subtitle: "Bronze: Growth Starter",
                                            investment: "R8,500 (p/m)",
                                            leads: "± 17 qualified business leads",
                                            cost: "± R500",
                                            comm: "9%",
                                            alignment: "Where we prove consistency. Qualified SME decision-maker leads, core targeting & messaging, monthly performance check-in.",
                                            purposeTitle: "Strategic Lead Generation",
                                            purposeText: "Our core solution provides a consistent lead engine delivering qualified prospects directly to your sales pipeline. We operate on a Lead Token model (paid monthly in advance).",
                                            purposeSubText: "Month-to-month engagement. Subscription pauses automatically upon non-payment. Premature cancellation within a 30-day cycle is non-refundable.",
                                            color: "border-orange-500/20 hover:border-orange-500/50 hover:bg-orange-500/10 text-orange-200"
                                        },
                                        {
                                            name: "Silver",
                                            subtitle: "Silver: Scale & Optimise",
                                            investment: "R10,500 (p/m)",
                                            leads: "± 23-26 qualified business leads",
                                            cost: "± R400-R450",
                                            comm: "8%",
                                            alignment: "Where results become predictable. Higher lead volume, ongoing optimisation, messaging testing, and bi-weekly reviews.",
                                            purposeTitle: "Predictable Scaling",
                                            purposeText: "The Silver tier provides systematic growth for scaling brokers. Delivery follows the Lead Token model, ensuring transparency and inventory control.",
                                            purposeSubText: "Month-to-month engagement. Subscription pauses upon non-payment at cycle-end. Resume anytime by renewing payment. No refunds for early exit.",
                                            color: "border-slate-400/20 hover:border-slate-400/50 hover:bg-slate-400/10 text-slate-200"
                                        },
                                        {
                                            name: "Gold",
                                            subtitle: "Gold: Performance Partner",
                                            investment: "R16,500+ (p/m)",
                                            leads: "33-40+ qualified business leads",
                                            cost: "± R350-R400",
                                            comm: "6%",
                                            alignment: "Where we operate as a revenue partner. Maximum lead volume, advanced qualification, and dedicated campaign management.",
                                            purposeTitle: "Revenue Partnership",
                                            purposeText: "Our premium tier where we operate as a full revenue partner. Token-based delivery ensures consistent ROI and inventory management.",
                                            purposeSubText: "Month-to-month engagement. Account pauses automatically if the current cycle ends without payment. Early exit within a cycle is non-refundable.",
                                            color: "border-yellow-500/20 hover:border-yellow-500/50 hover:bg-yellow-500/10 text-yellow-200"
                                        }
                                    ].map((tier) => (
                                        <button
                                            key={tier.name}
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    subtitle: tier.subtitle,
                                                    investment: tier.investment,
                                                    guaranteedLeads: tier.leads,
                                                    costPerLead: tier.cost,
                                                    commissionRate: tier.comm,
                                                    alignmentText: tier.alignment,
                                                    purposeTitle: tier.purposeTitle,
                                                    purposeText: tier.purposeText,
                                                    purposeSubText: tier.purposeSubText,
                                                    alignmentBoxText: `Additional placed policies attract a <span class='text-pink-400 font-bold'>${tier.comm} commission</span> calculated on the first-year premium.`
                                                }));
                                                toast({ title: `${tier.name} Applied`, description: "Proposal template updated." });
                                            }}
                                            className={`w-full text-left p-3 rounded-xl border ${tier.color} transition-all duration-200 text-xs font-medium`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span>{tier.name}</span>
                                                <span className="opacity-60 font-mono">{tier.investment.split(' ')[0]}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Separator className="bg-white/5" />

                            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest flex items-center gap-2">
                                <MessageCircle className="h-4 w-4 text-pink-400" />
                                Dispatch
                            </h3>
                            <div className="space-y-3 p-4 bg-slate-800/20 rounded-xl border border-white/5">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Recipient Email</label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={recipientEmail}
                                            onChange={(e) => setRecipientEmail(e.target.value)}
                                            placeholder="client@company.co.za"
                                            className="bg-slate-950/50 border-white/10 h-9 text-sm rounded-lg"
                                        />
                                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 hover:bg-white/10 rounded-lg" onClick={() => handleGenerate('email')}>
                                            <Mail className="h-4 w-4 text-slate-400" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">WhatsApp Number</label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={recipientPhone}
                                            onChange={(e) => setRecipientPhone(e.target.value)}
                                            placeholder="+27 82 123 4567"
                                            className="bg-slate-950/50 border-white/10 h-9 text-sm rounded-lg"
                                        />
                                        <Button size="sm" className="h-9 w-9 p-0 bg-[#25D366] hover:bg-[#128C7E] rounded-lg" onClick={handleWhatsAppShare}>
                                            <MessageCircle className="h-4 w-4 text-white" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Premium AI Assistant UI (Grok Style) */}
                            <Card className="bg-[#151719]/80 backdrop-blur-xl border border-white/5 shadow-2xl overflow-hidden shrink-0 rounded-2xl">
                                <CardContent className="p-4 space-y-4">
                                    {(aiResponse || isThinking) && (
                                        <div className="animate-in slide-in-from-bottom-2 duration-300">
                                            <div className="flex gap-3">
                                                <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0 border border-pink-500/20">
                                                    <Bot className="h-4 w-4 text-pink-500" />
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    {isThinking ? (
                                                        <div className="flex gap-1.5 items-center py-2">
                                                            <div className="w-2 h-2 bg-pink-500/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                            <div className="w-2 h-2 bg-pink-500/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                            <div className="w-2 h-2 bg-pink-500/50 rounded-full animate-bounce" />
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-slate-200 leading-relaxed font-medium">
                                                            {aiResponse}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {pendingChanges && (
                                                <div className="flex gap-2 mt-4 ml-11">
                                                    <Button size="sm" onClick={applyPendingChanges} className="flex-1 bg-pink-600 hover:bg-pink-700 h-9 text-[11px] font-bold rounded-xl shadow-lg shadow-pink-600/20 border-t border-white/10">
                                                        Commit Changes
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setPendingChanges(null)} className="h-9 w-9 p-0 rounded-xl hover:bg-white/5 text-slate-400">
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {aiSuggestions.length > 0 && !isThinking && (
                                        <div className="flex flex-wrap gap-2 animate-in fade-in duration-500">
                                            {aiSuggestions.map((suggestion, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => {
                                                        setAiInput(suggestion);
                                                        processAICommand(suggestion);
                                                    }}
                                                    className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 rounded-full px-3 py-1.5 transition-all duration-200"
                                                >
                                                    {suggestion}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="relative group mt-2 bg-black/40 rounded-2xl border border-white/5 p-1.5 transition-all duration-300 focus-within:border-pink-500/30 focus-within:bg-black/60 shadow-inner">
                                        <form onSubmit={handleAISubmit} className="flex items-center gap-1">
                                            <div className="flex items-center gap-0.5 px-2 text-slate-500">
                                                <Paperclip className="h-4 w-4 hover:text-slate-300 cursor-pointer transition-colors" />
                                            </div>
                                            <Input
                                                value={aiInput}
                                                onChange={(e) => setAiInput(e.target.value)}
                                                placeholder="Ask the assistant..."
                                                className="bg-transparent border-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-9 text-slate-200 placeholder:text-slate-600 shadow-none px-1"
                                            />
                                            <div className="flex items-center gap-1 pr-1">
                                                <Button type="button" size="icon" variant="ghost" onClick={() => setIsConversational(!isConversational)} className={`h-8 w-8 rounded-xl ${isConversational ? 'bg-pink-500/20 text-pink-500' : 'text-slate-500'}`}>
                                                    <AudioLines className="h-4 w-4" />
                                                </Button>
                                                <Button type="button" size="icon" variant="ghost" onClick={toggleListening} className={`h-8 w-8 rounded-xl ${isListening ? 'bg-red-500/20 text-red-500' : 'text-slate-500'}`}>
                                                    <Mic className="h-4 w-4" />
                                                </Button>
                                                <Button type="submit" size="icon" disabled={!aiInput.trim() || isThinking} className={`h-8 w-8 rounded-xl ${aiInput.trim() ? 'bg-white text-black' : 'bg-white/5 text-slate-700'}`}>
                                                    <SendHorizonal className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </CardContent>
                            </Card>
                            {/* Document History */}
                            {history.length > 0 && (
                                <div className="space-y-3 mt-6">
                                    <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest flex items-center gap-2">
                                        <Save className="h-4 w-4 text-pink-400" />
                                        Saved History
                                    </h3>
                                    <div className="space-y-2">
                                        {history.map((doc, idx) => (
                                            <div key={idx} className="bg-slate-950/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1 text-sm">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-medium text-slate-200 truncate pr-2">{doc.name}</span>
                                                    <a href={`${supabase.storage.from('admin-documents').getPublicUrl(doc.file_path).data.publicUrl}`} target="_blank" rel="noreferrer" className="text-pink-400 hover:text-pink-300 shrink-0 bg-pink-400/10 px-2 py-0.5 rounded cursor-pointer whitespace-nowrap text-xs">
                                                        View PDF
                                                    </a>
                                                </div>
                                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                                                    {new Date(doc.created_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </CardContent>
                    </Card >
                </div >

                {/* Resizable Divider Bar */}
                < div
                    onMouseDown={handleDividerMouseDown}
                    className="w-1.5 flex-shrink-0 cursor-col-resize bg-white/5 hover:bg-pink-500/40 active:bg-pink-500/60 transition-colors duration-150 relative group mx-1 rounded-full"
                    title="Drag to resize"
                >
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                </div >

                {/* Live Preview Area */}
                < div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950/80 rounded-2xl border border-white/5 overflow-hidden relative group" >
                    <div className="absolute top-4 right-4 z-50 bg-slate-900/90 backdrop-blur border border-white/10 rounded-xl flex items-center p-1.5 shadow-2xl space-x-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => adjustZoom(-0.1)}><ZoomOut className="h-4 w-4" /></Button>
                        <span className="text-xs font-mono font-bold text-white w-12 text-center">{Math.round(zoom * 100)}%</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => adjustZoom(0.1)}><ZoomIn className="h-4 w-4" /></Button>
                        <Separator orientation="vertical" className="h-4 mx-2 bg-white/20" />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => setZoom(0.55)} title="Fit to Screen"><Monitor className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => setZoom(1.0)} title="Actual Size"><Maximize className="h-4 w-4" /></Button>
                    </div>

                    <div className="flex-1 overflow-auto p-8 flex justify-center items-start custom-scrollbar bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900/50 to-transparent">
                        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }} className="shrink-0">
                            <div ref={reportRef} className="w-[210mm] font-inter bg-white text-slate-900 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col" style={{ minHeight: '297mm' }}>
                                {/* Top Accent */}
                                <div className="h-2 w-full bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600"></div>

                                <div className="p-[20mm] py-[15mm] flex-1 flex flex-col">
                                    {/* Header */}
                                    <header className="border-b-2 border-slate-100 pb-6 mb-8 flex justify-between items-end">
                                        <div>
                                            <div className="flex items-center gap-3 mb-6">
                                                <img src={logo} alt="Lead Velocity" className="h-20 w-auto object-contain" />
                                            </div>
                                            <Editable tag="h1" html={true} className="text-3xl font-extrabold text-[#0F172A] tracking-tight leading-tight" value={formData.title} onChange={(val) => updateField('title', val)} />
                                            <Editable tag="p" className="text-slate-500 font-medium mt-1" value={formData.subtitle} onChange={(val) => updateField('subtitle', val)} />
                                        </div>
                                        <div className="text-right">
                                            <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                                                <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">Prepared For</p>
                                                <Editable tag="p" className="font-bold text-lg text-slate-900" value={formData.clientName} onChange={(val) => updateField('clientName', val)} />
                                                <Editable tag="p" className="text-sm text-slate-500 font-medium" value={formData.date} onChange={(val) => updateField('date', val)} />
                                            </div>
                                        </div>
                                    </header>

                                    {/* Content */}
                                    <main className="space-y-6 text-[15px] leading-relaxed text-slate-600 font-medium flex-1">

                                        {/* Purpose */}
                                        <section>
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="h-6 w-1 bg-pink-600 rounded-full"></div>
                                                <Editable tag="h2" className="text-lg font-bold text-[#0F172A]" value={formData.purposeTitle} onChange={(val) => updateField('purposeTitle', val)} />
                                            </div>
                                            <Editable tag="div" html={true} className="mb-2" value={formData.purposeText} onChange={(val) => updateField('purposeText', val)} />
                                            <Editable tag="div" html={true} className="text-sm italic text-slate-500" value={formData.purposeSubText} onChange={(val) => updateField('purposeSubText', val)} />
                                        </section>

                                        {/* Overview Grid */}
                                        <section className="bg-slate-50 rounded-xl p-6 border border-slate-100 shadow-sm">
                                            <Editable tag="h3" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4" value={formData.overviewTitle} onChange={(val) => updateField('overviewTitle', val)} />
                                            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Duration</p>
                                                    <p className="text-slate-900 font-bold text-base">30 Days</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Investment</p>
                                                    <Editable className="text-pink-600 font-bold text-xl" value={formData.investment} onChange={(val) => updateField('investment', val)} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Guaranteed Output</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-100 text-pink-700 text-[10px] font-bold">✓</span>
                                                        <Editable className="text-slate-900 font-bold" value={formData.guaranteedLeads} onChange={(val) => updateField('guaranteedLeads', val)} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Est. Cost per Lead</p>
                                                    <Editable className="text-slate-900 font-bold" value={formData.costPerLead} onChange={(val) => updateField('costPerLead', val)} />
                                                </div>
                                            </div>
                                        </section>

                                        <div className="border-l-4 border-pink-500 pl-4 py-2 bg-gradient-to-r from-pink-50 to-transparent">
                                            <Editable tag="p" className="italic text-slate-700 text-sm font-medium leading-relaxed" value={formData.quoteText} onChange={(val) => updateField('quoteText', val)} />
                                        </div>

                                        {/* Criteria & Exclusions */}
                                        <div className="grid grid-cols-3 gap-6 align-top">
                                            <div className="col-span-2">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="h-6 w-1 bg-pink-600 rounded-full"></div>
                                                    <Editable tag="h2" className="text-lg font-bold text-[#0F172A]" value={formData.criteriaTitle} onChange={(val) => updateField('criteriaTitle', val)} />
                                                </div>
                                                <ul className="space-y-2">
                                                    <li className="flex items-start gap-2">
                                                        <div className="mt-1.5 h-1 w-1 rounded-full bg-pink-600 shrink-0" />
                                                        <Editable html tag="span" value={formData.criteria1} onChange={(val) => updateField('criteria1', val)} />
                                                    </li>
                                                    <li className="flex items-start gap-2">
                                                        <div className="mt-1.5 h-1 w-1 rounded-full bg-pink-600 shrink-0" />
                                                        <Editable html tag="span" value={formData.criteria2} onChange={(val) => updateField('criteria2', val)} />
                                                    </li>
                                                    <li className="flex items-start gap-2">
                                                        <div className="mt-1.5 h-1 w-1 rounded-full bg-pink-600 shrink-0" />
                                                        <Editable html tag="span" value={formData.criteria3} onChange={(val) => updateField('criteria3', val)} />
                                                    </li>
                                                </ul>
                                            </div>

                                            <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 h-fit">
                                                <Editable tag="h4" className="text-rose-700 font-bold uppercase text-[10px] tracking-wider mb-2" value={formData.excludedTitle} onChange={(val) => updateField('excludedTitle', val)} />
                                                <Editable tag="p" className="text-xs text-rose-900/80 leading-snug" value={formData.excludedText} onChange={(val) => updateField('excludedText', val)} />
                                            </div>
                                        </div>

                                        {/* Performance Alignment */}
                                        <section>
                                            <div className="bg-[#0F172A] text-white p-6 rounded-xl relative overflow-hidden shadow-xl">
                                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                                    <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                                                </div>
                                                <div className="flex items-center gap-2 mb-2 relative z-10">
                                                    <span className="text-pink-400 text-lg">⚡</span>
                                                    <Editable tag="h2" className="text-lg font-bold text-white uppercase tracking-tight" value={formData.alignmentTitle} onChange={(val) => updateField('alignmentTitle', val)} />
                                                </div>
                                                <Editable tag="p" className="text-slate-300 text-sm mb-4 relative z-10 font-normal leading-relaxed" value={formData.alignmentText} onChange={(val) => updateField('alignmentText', val)} />
                                                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/10 relative z-10">
                                                    <Editable tag="p" html={true} className="font-bold text-white text-sm" value={formData.alignmentBoxText} onChange={(val) => updateField('alignmentBoxText', val)} />
                                                </div>
                                            </div>
                                        </section>
                                    </main>

                                    {/* Footer */}
                                    <div className="mt-8 pt-6 border-t-2 border-slate-100 flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                                        <div>
                                            <p className="text-[#0F172A]">Lead Velocity Team</p>
                                            <p>Performance-First Business Insurance leads</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-pink-600">www.leadvelocity.co.za</p>
                                            <p>Strictly Confidential Proposal</p>
                                        </div>
                                    </div>
                                    <div className="h-1.5 w-full bg-[#0F172A] mt-4 rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div >
            </div >
        </div >
    );
};

export default ProposalGenerator;

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, Mail, MessageCircle, Send, ZoomIn, ZoomOut, Maximize, Monitor, Save, Loader2, Mic, MicOff, Bot, Check, X, Paperclip, AudioLines, SendHorizonal } from "lucide-react";
import { generateSmartPDF } from "@/utils/pdfUtils";
import logo from "@/assets/lead-velocity-logo.webp";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { getContractEmailSignature } from "@/utils/emailSignature";
import { BrokerSelector } from "./BrokerSelector";
import { callLegalAI } from "@/utils/legalAI";

interface ContractGeneratorProps {
    onBack: () => void;
    initialData?: any;
}

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
            className={`${className} hover:bg-slate-100 rounded px-1 -mx-1 transition-all outline-none focus:bg-slate-50 focus:outline focus:outline-2 focus:outline-pink-500 cursor-text`}
            onBlur={handleBlur}
            dangerouslySetInnerHTML={html ? { __html: value } : undefined}
        >
            {html ? undefined : value}
        </Tag>
    );
};

const ContractGenerator = ({ onBack, initialData }: ContractGeneratorProps) => {
    const { toast } = useToast();
    const reportRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(0.55);
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
        "Make this more formal",
        "Simplify the terms",
        "Ensure South African legal compliance"
    ]);
    const [pendingChanges, setPendingChanges] = useState<any>(null);

    const [contractData, setContractData] = useState({
        // Service Provider Details
        providerName: "Lead Velocity",
        providerCompany: "Lead Velocity (Pty) Ltd",
        providerAddressLine: "Address: 210 Amarand Avenue, Pegasus Building 1, Menlyn Maine, Pretoria, 0184",
        providerEmailLine: "Email: howzit@leadvelocity.co.za",
        providerPhoneLine: "Tel: +27 10 976 5618",
        providerRepresentativeLine: "Represented by: Authorised Representative",
        // Client Details
        clientName: "Valued Partner",
        clientCompany: "Client Company (Pty) Ltd",
        clientAddressLine: "Address:",
        clientEmailLine: "Email:",
        clientPhoneLine: "Tel:",
        clientRepresentativeLine: "Represented by: Authorised Signatory",
        effectiveDate: new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        endDate: "",
        serviceFee: "R8,500 (p/m)",
        leadTarget: "± 17 Qualified Leads per Month",
        commissionText: "In addition to the monthly service fee, the Client agrees to pay Lead Velocity a commission of nine percent (9%) of the gross first-year premium value of any insurance policy sold as a direct or indirect result of Lead Velocity's lead generation efforts. This commission obligation applies to: (a) all policies placed on leads delivered under this Agreement; (b) any policies placed on referrals obtained from leads sourced through Lead Velocity; and (c) any secondary sales arising from relationships initiated through Lead Velocity's efforts. This commission obligation shall survive the termination of this Agreement for a period of twenty-four (24) months following the last lead delivered.",
        bankName: "First National Bank",
        accountHolder: "Lead Velocity",
        accountNumber: "63174286724",
        branchCode: "250655",
        title: "Service Level Agreement",
        subtitle: "Bronze: Growth Starter",
        scopeText: "Lead Velocity shall provide qualified lead tokens as specified in the selected tier. Allocation is paid monthly in advance. Additional leads can be Top-Ups (min 5 tokens) at R500 each.",
        deliverablesText: "1. Weekly delivery of qualified decision-maker contact details. 2. Brief business profile for each prospect. 3. Monthly performance report summarizing lead volume and feedback trends.",
        termsText: "Terms and Payment: Fees are due upfront for each monthly cycle. Delivery is on a Lead Token basis. Top-Up tokens require one week's notice.",
        breachText: "Should the Client terminate this Agreement without providing the full 30-day (one calendar month) written notice, the Client shall be liable for an immediate 50% Breach Penalty based on their current tier value.",
        refundText: "No refunds are provided for service fees or pre-purchased Lead Tokens, as these allocations cover the variable cost of digital inventory and campaign management.",
        confidentialityText: "Both Parties agree to maintain strict confidentiality regarding all non-public information, lead data, and proprietary campaign methodologies. This NDA remains in force for 36 months following termination.",
        disputeText: "Disputes regarding lead qualification must be submitted in writing within 48 business hours. Valid disputes will be resolved via a replacement token within 5 business days.",
        pilotEligibilityText: "Promotion: Once-off pilot plan for first-time clients. Not available for recurring accounts. Participants must upgrade to Bronze or higher to continue service.",
        renewalText: "Month-to-month. Requires one (1) full calendar month notice for exit. Failure to provide notice incurs the 50% Breach Penalty.",
        forceMajeureText: "Lead Velocity is not liable for delays caused by national infrastructure failures (load shedding), civil unrest, or major digital platform outages (Meta/Google).",
        liabilityText: "Maximum liability of Lead Velocity is limited to the fees paid by the Client in the month preceding the claim. We are not liable for lost profit or indirect business damages.",
        indemnityText: "The Client indemnifies Lead Velocity against any claims arising from the Client's conduct after receiving a lead or from the Client's advice provided to prospects.",
        entireAgreementText: "This document constitutes the entire agreement between the parties and supersedes all prior verbal or written understandings.",
        recitalsText: "WHEREAS the Service Provider is in the business of providing professional lead generation and business development services; AND WHEREAS the Client wishes to engage the Service Provider to provide such services on the terms and conditions set out herein; NOW THEREFORE, in consideration of the mutual covenants hereinafter set forth and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:",
        definitionsText: "Qualified Business Lead: Initial business enquiry from a South African registered entity meeting the agreed minimum revenue or insurance cover threshold. Lead Tokens: Pre-purchased credits representing the delivery of a singular qualified business lead. Top-Up: Additional tokens purchased above the monthly tier allocation.",
        intellectualPropertyText: "Lead Velocity retains ownership of all campaign assets, landing pages, and proprietary ad-copy. The Client owns all lead data for which full payment has been received.",
        dataProtectionText: "POPIA Compliance: Lead Velocity warrants that all lead generation activities are compliant with the Protection of Personal Information Act. Both parties agree to handle prospect data securely.",
        nonSolicitationText: "The Client shall not solicit or hire any Lead Velocity personnel or recurring contractors for 12 months following termination without written consent and a placement fee.",
        warrantiesText: "Lead Velocity warrants that it has the legal right to provide the services. Use of services is at the Client's own risk beyond the agreed lead qualification criteria.",
        terminationText: "Either Party may terminate this Agreement by giving the other Party not less than one (1) calendar month's written notice. Notice of termination must be delivered to the other Party's registered email address and is effective from the date of confirmed receipt. Termination shall take effect at the end of the then-current Delivery Cycle following expiry of the notice period. Upon termination: (i) all outstanding fees for leads already delivered become immediately due and payable; (ii) clauses relating to confidentiality, intellectual property, non-solicitation, commission obligations, and limitation of liability shall survive termination.",
        assignmentText: "Neither Party may assign, transfer, or delegate any of its rights or obligations under this Agreement without the prior written consent of the other Party, which consent shall not be unreasonably withheld. Notwithstanding the foregoing, Lead Velocity may assign this Agreement to any affiliate or successor entity without requiring the Client's consent, provided the Client is notified in writing within 30 days of such assignment. Any purported assignment in contravention of this clause shall be null and void.",
        noticesText: "All notices, requests, and communications under this Agreement shall be in writing and shall be deemed delivered: (a) immediately upon personal delivery; (b) upon written confirmation of receipt if sent by email; or (c) five (5) Business Days after posting if sent by registered mail. Notices shall be addressed to the contact details set out in the Parties section of this Agreement, or to such other address as a Party designates by written notice.",
        relationshipText: "Nothing in this Agreement shall be construed as creating a partnership, joint venture, agency, franchise, or employment relationship between the Parties. Lead Velocity acts as an independent contractor and shall have sole control over the manner and means of performing the Services. Neither Party has authority to bind the other or to incur any obligation on behalf of the other without prior written consent.",
    });

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

    useEffect(() => {
        if (initialData) {
            setContractData(initialData);
        }
    }, [initialData]);

    const handleBrokerSelect = (broker: any) => {
        const clientName = broker.full_name || "Valued Partner";
        const clientCompany = broker.firm_name || broker.company_name || "Client Company (Pty) Ltd";
        const leads = broker.desired_leads_weekly || 0;

        let tierData = {
            subtitle: "Bronze: Growth Starter",
            fee: "R8,500 (p/m)",
            target: "± 17 Qualified Leads per Month",
            comm: "",
            pilot: "",
            scope: "17 tokens per month. Top-Ups (min 5) at R500 each. 1 week notice for additional leads. Delivery managed on a weekly schedule. Minimum 5-token Top-Up applies.",
            renewal: "Continues month-to-month. Termination requires 1 full calendar month notice in writing. Breach of notice period triggers a 50% penalty (R4,250).",
            termination: "1 calendar month notice required. Immediate exit incurs 50% Breach Penalty (R4,250). All delivered leads remain payable.",
            color: "Bronze"
        };

        if (leads <= 6 && leads > 0) {
            tierData = {
                subtitle: "Pilot Phase: Where We Prove Consistency",
                fee: "R6,000 (once-off)",
                target: "± 6 Qualified Leads (Once-off)",
                comm: "ten percent (10%)",
                pilot: "Promotion: Once-off pilot plan for first-time clients. Not available for recurring accounts. Participants must upgrade to Bronze or higher to continue service.",
                scope: "Once-off introductory campaign. Delivery follows a 'Lead Token' model; Top-Ups may be requested (minimum 5 tokens at R2,500) with 1 week notice.",
                renewal: "Terminates automatically after 30 days. No refund for early exit. Commission obligations survive for 24 months. Standard 3-year NDA and POPIA compliance applies.",
                termination: "Terminates automatically after 30 days. No refund for early exit. Commission obligations survive for 24 months. Standard 3-year NDA and POPIA compliance applies.",
                color: "Pilot"
            };
        } else if (leads > 32) {
            tierData = {
                subtitle: "Gold: Performance Partner",
                fee: "R16,500+ (p/m)",
                target: "33-40+ Qualified Leads per Month",
                comm: "",
                pilot: "",
                scope: "40+ tokens per month. Top-Ups (min 5) at R500 each. Advanced targeting, dedicated campaign management, and conversion support.",
                renewal: "Continues month-to-month. Termination requires 1 full calendar month notice in writing. Breach triggers a 50% penalty of the monthly service fee.",
                termination: "1 calendar month notice required. Immediate exit incurs 50% Breach Penalty (min R8,250). All data protection clauses survive.",
                color: "Gold"
            };
        } else if (leads >= 21) {
            tierData = {
                subtitle: "Silver: Scale & Optimise",
                fee: "R10,500 (p/m)",
                target: "± 23-26 Qualified Leads per Month",
                comm: "",
                pilot: "",
                scope: "23-26 tokens per month. Top-Ups (min 5) at R500 each. 1 week notice for additional leads. Includes bi-weekly performance updates and messaging optimisation.",
                renewal: "Continues month-to-month. Termination requires 1 full calendar month notice in writing. Breach of notice triggers a 50% penalty (R5,250).",
                termination: "1 calendar month notice required. Immediate exit incurs 50% Breach Penalty (R5,250). Outstanding commissions survive.",
                color: "Silver"
            };
        }

        setContractData(prev => ({
            ...prev,
            clientName,
            clientCompany,
            subtitle: tierData.subtitle,
            serviceFee: tierData.fee,
            leadTarget: tierData.target,
            scopeText: tierData.scope,
            renewalText: tierData.renewal,
            terminationText: tierData.termination,
            pilotEligibilityText: tierData.pilot || "",
            commissionText: tierData.comm ? `In addition to the monthly service fee, the Client agrees to pay Lead Velocity a commission of ${tierData.comm} of the gross first-year premium value of any insurance policy sold as a direct or indirect result of Lead Velocity's lead generation efforts. This commission obligation applies to: (a) all policies placed on leads delivered under this Agreement; (b) any policies placed on referrals obtained from leads sourced through Lead Velocity; and (c) any secondary sales arising from relationships initiated through Lead Velocity's efforts. This commission obligation shall survive the termination of this Agreement for a period of twenty-four (24) months following the last lead delivered.` : "",
            clientEmailLine: `Email: ${broker.email || ""} `,
            clientPhoneLine: `Tel: ${broker.phone_number || broker.phone || broker.whatsapp_number || ""} `,
        }));

        if (broker.email) setRecipientEmail(broker.email);
        toast({ title: "Broker & Tier Loaded", description: `Selected ${tierData.color} based on ${leads} leads.` });
    };

    const updateField = (field: string, value: string) => {
        setContractData(prev => ({ ...prev, [field]: value }));
    };

    // Voice Synthesis (TTS) - Improved Voice Selection (Hand-picked for ZA)
    const speak = (text: string) => {
        if (!('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();

        const getPreferredVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) return null;

            // Strict Priority: 
            // 1. Natural Google/Microsoft ZA voices 
            // 2. High quality English Female (Natural)
            // 3. Any ZA voice
            // 4. Any Female English voice

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
                // Humanize the standard voices if not using a "Natural" one
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
        setAiResponse("Let me review the contract...");
        try {
            const result = await callLegalAI(command, contractData, "Contract");
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
        setContractData(prev => ({ ...prev, ...pendingChanges }));
        setPendingChanges(null);
        setAiResponse("Changes applied.");
        toast({ title: "Applied", description: "Contract updated." });
    };

    const handleAISubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiInput.trim()) return;
        processAICommand(aiInput);
        setAiInput("");
    };

    const handleGenerate = async (action: 'download' | 'save' | 'email') => {
        if (!reportRef.current) return;
        try {
            setIsGenerating(true);
            toast({ title: action === 'email' ? "Emailing..." : action === 'save' ? "Saving..." : "Generating..." });

            const element = reportRef.current;
            const clone = element.cloneNode(true) as HTMLElement;
            clone.style.transform = "none";
            clone.style.position = "fixed";
            clone.style.top = "-9999px";
            clone.style.left = "0";
            clone.style.width = "210mm";
            clone.style.minHeight = "297mm";
            clone.style.zIndex = "-9999";

            // Add page-break styles to prevent content from being cut
            const style = document.createElement('style');
            style.textContent = `
                section { page-break-inside: avoid!important; break-inside: avoid!important; margin-bottom: 8px!important; }
                .signature-section { page-break-inside: avoid!important; break-inside: avoid!important; }
                header { page-break-after: avoid!important; }
                h1, h2, h3 { page-break-after: avoid!important; }
            `;
            clone.appendChild(style);

            clone.querySelectorAll('[contenteditable]').forEach(el => {
                el.removeAttribute('contenteditable');
                el.className = el.className.replace(/hover:\S+/g, '').replace(/focus:\S+/g, '');
            });

            document.body.appendChild(clone);

            const pdf = await generateSmartPDF(clone);

            document.body.removeChild(clone);

            const fileName = `Contract_${contractData.clientCompany.replace(/\s+/g, "_")}_${Date.now()}.pdf`;

            if (action === 'download') {
                pdf.save(fileName);
                toast({ title: "Downloaded" });
            } else {
                // For 'save' and 'email', we upload to Supabase
                const pdfBlob = pdf.output('blob');
                const filePath = `contracts/${fileName}`;

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
                            description: `Contract for ${contractData.clientCompany}`,
                            file_path: filePath,
                            file_type: 'pdf',
                            file_size: pdfBlob.size,
                            category: 'contracts',
                            uploaded_by: user.id,
                            content_data: contractData
                        });

                    if (dbError) throw dbError;
                }

                if (action === 'email') {
                    if (!recipientEmail) {
                        toast({ title: "Email Required", variant: "destructive" });
                    } else {
                        const subject = encodeURIComponent(`Contract: ${contractData.title} - ${contractData.clientCompany}`);
                        const emailBody = `Dear ${contractData.clientName}, \n\nPlease find the Service Level Agreement for your review at the link below: \n\n${publicUrl} \n\nWe look forward to a successful partnership.\n\n${getContractEmailSignature()} `;
                        const body = encodeURIComponent(emailBody);
                        window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
                        toast({ title: "Email Drafted", description: "Link included in body!" });
                    }
                } else {
                    toast({ title: "Saved to Library" });
                }
            }
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const adjustZoom = (delta: number) => setZoom(prev => Math.max(0.3, Math.min(1.5, prev + delta)));

    return (
        <div className="space-y-6 animate-in fade-in duration-500 h-[calc(100vh-100px)] flex flex-col font-sans">
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Contract Generator <span className="text-slate-500 font-normal">v2.0</span></h1>
                        <p className="text-slate-400 text-sm">AI-assisted legal drafting.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-pink-500/20 text-slate-300" onClick={() => handleGenerate('email')} disabled={isGenerating}><Mail className="mr-2 h-4 w-4" />Email</Button>
                    <Button variant="outline" className="border-white/10 text-slate-300" onClick={() => handleGenerate('save')} disabled={isGenerating}><Save className="mr-2 h-4 w-4" />Save</Button>
                    <Button onClick={() => handleGenerate('download')} disabled={isGenerating} className="bg-pink-600 hover:bg-pink-700"><Download className="mr-2 h-4 w-4" />Download</Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden gap-0">
                {/* Sidebar Panel */}
                <div style={{ width: sidebarWidth, minWidth: 260, maxWidth: 600, flexShrink: 0 }} className="h-full flex flex-col gap-4 overflow-hidden">
                    <Card className="bg-slate-900/50 border-white/5 flex-1 overflow-y-auto custom-scrollbar">
                        <CardContent className="p-6 space-y-6">
                            <BrokerSelector onSelect={handleBrokerSelect} />
                            <div className="space-y-4">
                                <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Contract Details</h3>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Client Name</label>
                                    <Input value={contractData.clientName} onChange={(e) => updateField('clientName', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Service Fee</label>
                                    <Input value={contractData.serviceFee} onChange={(e) => updateField('serviceFee', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                </div>
                                <Separator className="bg-white/5" />

                                {/* Tier Selection Section */}
                                <div className="space-y-3">
                                    <h3 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Apply Preset Tier</h3>
                                    <div className="grid grid-cols-1 gap-2">
                                        {[
                                            {
                                                name: "Pilot Phase",
                                                fee: "R6,000 (once-off)",
                                                target: "± 6 Qualified Leads (Once-off)",
                                                subtitle: "Pilot Phase: Where We Prove Consistency",
                                                comm: "ten percent (10%)",
                                                pilot: "Promotion: Once-off pilot plan for first-time clients. Not available for recurring accounts. Participants must upgrade to Bronze or higher to continue service.",
                                                color: "border-pink-500/20 hover:bg-pink-500/10 text-pink-200"
                                            },
                                            {
                                                name: "Bronze",
                                                fee: "R8,500 (p/m)",
                                                target: "± 17 Qualified Leads per Month",
                                                subtitle: "Bronze: Growth Starter",
                                                comm: "",
                                                pilot: "",
                                                color: "border-orange-500/20 hover:bg-orange-500/10 text-orange-200"
                                            },
                                            {
                                                name: "Silver",
                                                fee: "R10,500 (p/m)",
                                                target: "± 23-26 Qualified Leads per Month",
                                                subtitle: "Silver: Scale & Optimise",
                                                comm: "",
                                                pilot: "",
                                                color: "border-slate-400/20 hover:bg-slate-400/10 text-slate-200"
                                            },
                                            {
                                                name: "Gold",
                                                fee: "R16,500+ (p/m)",
                                                target: "33-40+ Qualified Leads per Month",
                                                subtitle: "Gold: Performance Partner",
                                                comm: "",
                                                pilot: "",
                                                color: "border-yellow-500/20 hover:bg-yellow-500/10 text-yellow-200"
                                            }
                                        ].map((tier) => (
                                            <button
                                                key={tier.name}
                                                onClick={() => {
                                                    setContractData(prev => ({
                                                        ...prev,
                                                        serviceFee: tier.fee,
                                                        leadTarget: tier.target,
                                                        subtitle: tier.subtitle,
                                                        pilotEligibilityText: tier.pilot || "",
                                                        commissionText: tier.comm ? `In addition to the monthly service fee, the Client agrees to pay Lead Velocity a commission of ${tier.comm} of the gross first-year premium value of any insurance policy sold as a direct or indirect result of Lead Velocity's lead generation efforts. This commission obligation applies to: (a) all policies placed on leads delivered under this Agreement; (b) any policies placed on referrals obtained from leads sourced through Lead Velocity; and (c) any secondary sales arising from relationships initiated through Lead Velocity's efforts. This commission obligation shall survive the termination of this Agreement for a period of twenty-four (24) months following the last lead delivered.` : ""
                                                    }));
                                                    toast({ title: `${tier.name} Applied`, description: "Contract terms updated." });
                                                }}
                                                className={`w-full text-left p-2.5 rounded-xl border ${tier.color} transition-all text-xs font-medium`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span>{tier.name}</span>
                                                    <span className="opacity-60 font-normal">{tier.fee.split(' ')[0]}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <Separator className="bg-white/5" />
                                <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Dispatch</h3>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Recipient Email</label>
                                    <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="client@company.co.za" className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                </div>
                            </div>
                            {/* Premium AI Assistant UI (Grok Style) */}
                            <Card className="bg-[#151719]/80 backdrop-blur-xl border border-white/5 shadow-2xl overflow-hidden shrink-0 rounded-2xl">
                                <CardContent className="p-4 space-y-4">
                                    {/* AI Message Bubble */}
                                    {(aiResponse || isThinking) && (
                                        <div className="animate-in slide-in-from-bottom-2 duration-300">
                                            <div className="flex gap-3">
                                                <div className="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0">
                                                    <Bot className="h-3.5 w-3.5 text-pink-500" />
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    {isThinking ? (
                                                        <div className="flex gap-1 items-center py-1">
                                                            <div className="w-1.5 h-1.5 bg-pink-500/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                            <div className="w-1.5 h-1.5 bg-pink-500/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                            <div className="w-1.5 h-1.5 bg-pink-500/50 rounded-full animate-bounce" />
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-slate-200 leading-relaxed font-medium">
                                                            {aiResponse}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {pendingChanges && (
                                                <div className="flex gap-2 mt-4 ml-9">
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

                                    {/* Contextual Suggestions Pills */}
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

                                    {/* Premium Input Bar */}
                                    <div className="relative group mt-2 bg-black/40 rounded-2xl border border-white/5 p-1.5 transition-all duration-300 focus-within:border-pink-500/30 focus-within:bg-black/60 shadow-inner">
                                        <form onSubmit={handleAISubmit} className="flex items-center gap-1">
                                            <div className="flex items-center gap-0.5 px-2 text-slate-500">
                                                <Paperclip className="h-4 w-4 hover:text-slate-300 cursor-pointer transition-colors" />
                                            </div>

                                            <Input
                                                value={aiInput}
                                                onChange={(e) => setAiInput(e.target.value)}
                                                placeholder="What's on your mind?"
                                                className="bg-transparent border-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-9 text-slate-200 placeholder:text-slate-600 shadow-none px-1"
                                            />

                                            <div className="flex items-center gap-1 pr-1">
                                                {/* Conversational Toggle */}
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => setIsConversational(!isConversational)}
                                                    className={`h-8 w-8 rounded-xl transition-all ${isConversational ? 'bg-pink-500/20 text-pink-500 shadow-lg shadow-pink-500/10' : 'text-slate-500 hover:text-slate-200'}`}
                                                    title="Conversational Mode"
                                                >
                                                    <AudioLines className={`h-4 w-4 ${isSpeaking ? 'animate-pulse scale-110' : ''}`} />
                                                </Button>

                                                {/* STT Toggle */}
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={toggleListening}
                                                    className={`h-8 w-8 rounded-xl transition-all ${isListening ? 'bg-red-500/20 text-red-500 shadow-lg shadow-red-500/10' : 'text-slate-500 hover:text-slate-200'}`}
                                                    title="Voice Input"
                                                >
                                                    <Mic className={`h-4 w-4 ${isListening ? 'animate-pulse' : ''}`} />
                                                </Button>

                                                {/* Submit Button */}
                                                <Button
                                                    type="submit"
                                                    size="icon"
                                                    disabled={!aiInput.trim() || isThinking}
                                                    className={`h-8 w-8 rounded-xl transition-all ${aiInput.trim() ? 'bg-white text-black hover:bg-white/90 scale-105 shadow-xl' : 'bg-white/5 text-slate-700'}`}
                                                >
                                                    <SendHorizonal className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </CardContent>
                            </Card>
                        </CardContent>
                    </Card>


                </div>

                {/* Resizable Divider Bar */}
                <div
                    onMouseDown={handleDividerMouseDown}
                    className="w-1.5 flex-shrink-0 cursor-col-resize bg-white/5 hover:bg-pink-500/40 active:bg-pink-500/60 transition-colors duration-150 relative group"
                    title="Drag to resize"
                >
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-0.5 h-3 bg-pink-400/60 rounded-full" />
                        <div className="w-0.5 h-3 bg-pink-400/60 rounded-full" />
                        <div className="w-0.5 h-3 bg-pink-400/60 rounded-full" />
                    </div>
                </div>

                {/* Document Preview Panel */}
                <div className="flex-1 h-full flex flex-col bg-slate-950 rounded-xl border border-white/5 overflow-hidden relative group">
                    <div className="absolute top-4 right-4 z-50 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-full flex items-center px-4 py-1.5 shadow-2xl space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => adjustZoom(-0.1)}><ZoomOut className="h-4 w-4" /></Button>
                        <span className="text-[10px] font-mono font-bold text-slate-500">{Math.round(zoom * 100)}%</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => adjustZoom(0.1)}><ZoomIn className="h-4 w-4" /></Button>
                        <Separator orientation="vertical" className="h-3 bg-white/10" />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => setZoom(0.55)}><Monitor className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => setZoom(1.0)}><Maximize className="h-4 w-4" /></Button>
                    </div>

                    <div className="flex-1 overflow-auto p-12 flex justify-center items-start custom-scrollbar">
                        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} className="shrink-0 ring-1 ring-white/5 shadow-2xl">
                            <div ref={reportRef} className="w-[210mm] font-sans bg-white text-slate-900 relative overflow-hidden flex flex-col min-h-[297mm]">
                                <div className="h-2 w-full bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600" />
                                <div className="p-[20mm] flex-1 flex flex-col">
                                    <header className="border-b-2 border-slate-100 pb-6 mb-8 flex justify-between items-end">
                                        <div>
                                            <img src={logo} alt="Lead Velocity" className="h-20 w-auto object-contain mb-4" />
                                            <Editable tag="h1" className="text-3xl font-extrabold text-slate-900" value={contractData.title} onChange={(val) => updateField('title', val)} />
                                            <Editable tag="p" className="text-slate-500 font-medium mt-1" value={contractData.subtitle} onChange={(val) => updateField('subtitle', val)} />
                                        </div>
                                        <div className="text-right">
                                            <div className="bg-slate-50 px-4 py-2 rounded-lg border">
                                                <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">The Client</p>
                                                <Editable tag="p" className="font-bold text-lg text-slate-900" value={contractData.clientName} onChange={(val) => updateField('clientName', val)} />
                                                <Editable tag="p" className="text-sm text-slate-500" value={contractData.clientCompany} onChange={(val) => updateField('clientCompany', val)} />
                                            </div>
                                        </div>
                                    </header>

                                    <main className="space-y-6 text-[15px] leading-relaxed text-slate-600 flex-1">
                                        <section className="bg-slate-50 border rounded-xl p-6" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-4"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">Parties to this Agreement</h2></div>
                                            <p className="text-sm text-slate-500 mb-4">This Service Level Agreement ("Agreement") is entered into as of the Effective Date set out below, by and between:</p>

                                            <div className="grid md:grid-cols-2 gap-6">
                                                <div className="bg-white border border-pink-200 rounded-lg p-4">
                                                    <p className="text-[10px] font-black text-pink-600 uppercase tracking-widest mb-3">The Service Provider</p>
                                                    <Editable tag="p" className="font-bold text-slate-900 text-lg" value={contractData.providerCompany} onChange={(val) => updateField('providerCompany', val)} />
                                                    <div className="mt-2 space-y-1 text-sm">
                                                        <Editable tag="p" className="text-slate-600" value={contractData.providerAddressLine} onChange={(val) => updateField('providerAddressLine', val)} />
                                                        <Editable tag="p" className="text-slate-600" value={contractData.providerEmailLine} onChange={(val) => updateField('providerEmailLine', val)} />
                                                        <Editable tag="p" className="text-slate-600" value={contractData.providerPhoneLine} onChange={(val) => updateField('providerPhoneLine', val)} />
                                                        <Editable tag="p" className="text-slate-600" value={contractData.providerRepresentativeLine} onChange={(val) => updateField('providerRepresentativeLine', val)} />
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-3 italic">(hereinafter referred to as "Lead Velocity" or "the Service Provider")</p>
                                                </div>

                                                <div className="bg-white border border-slate-200 rounded-lg p-4">
                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">The Client</p>
                                                    <Editable tag="p" className="font-bold text-slate-900 text-lg" value={contractData.clientCompany} onChange={(val) => updateField('clientCompany', val)} />
                                                    <div className="mt-2 space-y-1 text-sm">
                                                        <Editable tag="p" className="text-slate-600" value={contractData.clientAddressLine} onChange={(val) => updateField('clientAddressLine', val)} />
                                                        <Editable tag="p" className="text-slate-600" value={contractData.clientEmailLine} onChange={(val) => updateField('clientEmailLine', val)} />
                                                        <Editable tag="p" className="text-slate-600" value={contractData.clientPhoneLine} onChange={(val) => updateField('clientPhoneLine', val)} />
                                                        <Editable tag="p" className="text-slate-600" value={contractData.clientRepresentativeLine} onChange={(val) => updateField('clientRepresentativeLine', val)} />
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-3 italic">(hereinafter referred to as "the Client")</p>
                                                </div>
                                            </div>

                                            <p className="text-sm text-slate-600 mt-4 pt-4 border-t border-slate-200">The Service Provider and the Client are collectively referred to as "the Parties" and individually as a "Party".</p>
                                        </section>

                                        <section className="bg-slate-50 border border-slate-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-slate-500 rounded-full" /><h2 className="text-lg font-bold text-slate-900">Recitals</h2></div>
                                            <Editable tag="p" className="text-slate-700 text-sm italic" value={contractData.recitalsText} onChange={(val) => updateField('recitalsText', val)} />
                                        </section>

                                        <section className="border border-pink-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">Definitions & Interpretation</h2></div>
                                            <Editable tag="p" className="text-slate-600 text-sm" value={contractData.definitionsText} onChange={(val) => updateField('definitionsText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">1. Scope of Services</h2></div>
                                            <Editable tag="p" className="pl-4" value={contractData.scopeText} onChange={(val) => updateField('scopeText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">2. Deliverables</h2></div>
                                            <Editable tag="p" className="pl-4 whitespace-pre-wrap" value={contractData.deliverablesText} onChange={(val) => updateField('deliverablesText', val)} />
                                        </section>

                                        <section className="bg-slate-50 rounded-xl p-6 border" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <h3 className="text-xs font-black text-slate-400 uppercase mb-4">Commercial Terms</h3>
                                            <div className="grid grid-cols-3 gap-8 mb-4">
                                                <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Service Fee</p><Editable className="text-pink-600 font-bold text-xl" value={contractData.serviceFee} onChange={(val) => updateField('serviceFee', val)} /></div>
                                                <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Lead Target</p><Editable className="text-slate-900 font-bold" value={contractData.leadTarget} onChange={(val) => updateField('leadTarget', val)} /></div>
                                                <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Duration</p><p className="text-slate-900 font-bold">30 Days</p></div>
                                            </div>
                                            {contractData.commissionText && (
                                                <div className="pt-4 border-t border-slate-200">
                                                    <p className="text-[10px] font-bold text-pink-600 uppercase mb-2">Commission Structure</p>
                                                    <Editable tag="p" className="text-xs text-slate-600 leading-relaxed" value={contractData.commissionText} onChange={(val) => updateField('commissionText', val)} />
                                                </div>
                                            )}
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">3. Terms & Conditions</h2></div>
                                            <Editable tag="p" className="pl-4" value={contractData.termsText} onChange={(val) => updateField('termsText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">4. Confidentiality</h2></div>
                                            <Editable tag="p" className="pl-4" value={contractData.confidentialityText} onChange={(val) => updateField('confidentialityText', val)} />
                                        </section>

                                        <section className="bg-red-50 border border-red-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-red-600 rounded-full" /><h2 className="text-lg font-bold text-red-900">5. Breach & No-Refund Policy</h2></div>
                                            <Editable tag="p" className="text-red-800 text-sm" value={contractData.breachText} onChange={(val) => updateField('breachText', val)} />
                                            <div className="mt-3 pt-3 border-t border-red-200">
                                                <Editable tag="p" className="text-red-700 text-sm" value={contractData.refundText} onChange={(val) => updateField('refundText', val)} />
                                            </div>
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">6. Governing Law & Disputes</h2></div>
                                            <Editable tag="p" className="pl-4" value={contractData.disputeText} onChange={(val) => updateField('disputeText', val)} />
                                        </section>

                                        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-amber-600 rounded-full" /><h2 className="text-lg font-bold text-amber-900">7. Pilot Eligibility</h2></div>
                                            <Editable tag="p" className="text-amber-800 text-sm" value={contractData.pilotEligibilityText} onChange={(val) => updateField('pilotEligibilityText', val)} />
                                        </section>

                                        <section className="bg-green-50 border border-green-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-green-600 rounded-full" /><h2 className="text-lg font-bold text-green-900">8. Renewal & Upgrade Options</h2></div>
                                            <Editable tag="p" className="text-green-800 text-sm" value={contractData.renewalText} onChange={(val) => updateField('renewalText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">9. Force Majeure</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.forceMajeureText} onChange={(val) => updateField('forceMajeureText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">10. Limitation of Liability</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.liabilityText} onChange={(val) => updateField('liabilityText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">11. Indemnification</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.indemnityText} onChange={(val) => updateField('indemnityText', val)} />
                                        </section>

                                        <section className="bg-slate-100 border rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-slate-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">12. General Provisions</h2></div>
                                            <Editable tag="p" className="text-slate-700 text-sm" value={contractData.entireAgreementText} onChange={(val) => updateField('entireAgreementText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">13. Intellectual Property</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.intellectualPropertyText} onChange={(val) => updateField('intellectualPropertyText', val)} />
                                        </section>

                                        <section className="bg-blue-50 border border-blue-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-blue-600 rounded-full" /><h2 className="text-lg font-bold text-blue-900">14. Data Protection & POPIA Compliance</h2></div>
                                            <Editable tag="p" className="text-blue-800 text-sm" value={contractData.dataProtectionText} onChange={(val) => updateField('dataProtectionText', val)} />
                                        </section>

                                        <section className="bg-purple-50 border border-purple-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-purple-600 rounded-full" /><h2 className="text-lg font-bold text-purple-900">15. Non-Solicitation & Protection of Methods</h2></div>
                                            <Editable tag="p" className="text-purple-800 text-sm" value={contractData.nonSolicitationText} onChange={(val) => updateField('nonSolicitationText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">16. Warranties & Representations</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.warrantiesText} onChange={(val) => updateField('warrantiesText', val)} />
                                        </section>

                                        <section className="bg-orange-50 border border-orange-200 rounded-xl p-5" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-orange-600 rounded-full" /><h2 className="text-lg font-bold text-orange-900">17. Termination</h2></div>
                                            <Editable tag="p" className="text-orange-800 text-sm" value={contractData.terminationText} onChange={(val) => updateField('terminationText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">18. Assignment</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.assignmentText} onChange={(val) => updateField('assignmentText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">19. Notices</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.noticesText} onChange={(val) => updateField('noticesText', val)} />
                                        </section>

                                        <section>
                                            <div className="flex items-center gap-3 mb-2"><div className="h-6 w-1 bg-pink-600 rounded-full" /><h2 className="text-lg font-bold text-slate-900">20. Relationship of Parties</h2></div>
                                            <Editable tag="p" className="pl-4 text-sm" value={contractData.relationshipText} onChange={(val) => updateField('relationshipText', val)} />
                                        </section>

                                        <section className="bg-slate-900 text-white p-6 rounded-xl">
                                            <h3 className="font-bold mb-2">Payment Details</h3>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div><span className="text-slate-400">Bank:</span> <Editable tag="span" className="font-bold" value={contractData.bankName} onChange={(val) => updateField('bankName', val)} /></div>
                                                <div><span className="text-slate-400">Account Holder:</span> <Editable tag="span" className="font-bold" value={contractData.accountHolder} onChange={(val) => updateField('accountHolder', val)} /></div>
                                                <div><span className="text-slate-400">Account #:</span> <Editable tag="span" className="font-bold" value={contractData.accountNumber} onChange={(val) => updateField('accountNumber', val)} /></div>
                                                <div><span className="text-slate-400">Branch Code:</span> <Editable tag="span" className="font-bold" value={contractData.branchCode} onChange={(val) => updateField('branchCode', val)} /></div>
                                            </div>
                                        </section>

                                        <section className="grid grid-cols-2 gap-12 pt-8 mt-8 border-t-2">
                                            <div>
                                                <p className="text-xs text-slate-400 uppercase font-bold mb-6">For Lead Velocity</p>
                                                <div className="border-b-2 border-slate-300 mb-2 h-12" />
                                                <p className="text-sm text-slate-600">Authorised Signatory</p>
                                                <Editable tag="p" className="text-sm text-slate-400" value={contractData.effectiveDate} onChange={(val) => updateField('effectiveDate', val)} />
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-400 uppercase font-bold mb-6">For The Client</p>
                                                <div className="border-b-2 border-slate-300 mb-2 h-12" />
                                                <Editable tag="p" className="text-sm text-slate-600" value={contractData.clientName} onChange={(val) => updateField('clientName', val)} />
                                                <p className="text-sm text-slate-400">Date: _______________</p>
                                            </div>
                                        </section>
                                    </main>
                                </div>
                                <div className="h-2 w-full bg-slate-900 mt-auto" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContractGenerator;

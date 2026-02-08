import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, Mail, ZoomIn, ZoomOut, Maximize, Monitor, Save, Mic, MicOff, Bot, Check, X } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import logo from "@/assets/lead-velocity-logo.png";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { getContractEmailSignature } from "@/utils/emailSignature";

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

    const [isListening, setIsListening] = useState(false);
    const [aiInput, setAiInput] = useState("");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [aiResponse, setAiResponse] = useState("");
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
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        serviceFee: "R6,000",
        leadTarget: "6 Qualified Leads",
        commissionText: "In addition to the guaranteed lead deliverables set out above, the Client agrees to pay Lead Velocity a commission of ten percent (10%) of the gross premium value of any insurance policy or financial product sold as a direct or indirect result of Lead Velocity's lead generation efforts. This commission obligation shall extend to: (a) any policies sold to leads delivered in excess of the six (6) guaranteed qualified leads; (b) any policies sold to referrals obtained from clients originally sourced through Lead Velocity; and (c) any secondary or tertiary sales arising from relationships initiated by Lead Velocity's efforts. This commission obligation shall survive the termination of this Agreement and shall remain in effect for a period of twenty-four (24) months following the delivery of the relevant lead.",
        bankName: "First National Bank",
        accountHolder: "Lead Velocity",
        accountNumber: "63174286724",
        branchCode: "250655",
        title: "Service Level Agreement",
        subtitle: "Lead Generation Pilot Campaign",
        scopeText: "Lead Velocity agrees to provide lead generation services focusing on identifying and qualifying B2B decision-makers in the logistics and engineering sectors.",
        deliverablesText: "1. Setup of multi-channel outreach campaigns.\n2. Qualification of prospects against agreed criteria.\n3. Delivery of 6 qualified meeting-ready leads.\n4. Weekly performance reporting.",
        termsText: "This Agreement shall commence on the Effective Date and shall remain in force for a period of thirty (30) calendar days ('Contract Period'). The Service Fee is payable in full upfront prior to campaign commencement. Lead Velocity guarantees the replacement of any leads that do not meet the agreed qualification criteria, provided such dispute is raised in writing within 48 hours of lead delivery.",
        breachText: "In the event of a material breach of this Agreement by the Client, including but not limited to: (a) failure to provide necessary cooperation or information; (b) disparagement of Lead Velocity; (c) direct solicitation of Lead Velocity's sources or methods; or (d) termination by the Client prior to the expiry of the Contract Period, no refund of the Service Fee shall be due or payable. Lead Velocity reserves the right to immediately terminate this Agreement and retain all fees paid.",
        refundText: "Refunds shall only be considered where Lead Velocity fails to deliver the minimum guaranteed leads within the Contract Period, and only after the Client has provided reasonable cooperation. Any refund shall be pro-rata based on leads not delivered and shall exclude setup and administration costs.",
        confidentialityText: "Both parties agree to treat all shared information, including but not limited to business strategies, client lists, pricing structures, and proprietary methodologies, as strictly confidential. This obligation shall survive the termination of this Agreement for a period of two (2) years. Client data remains the sole property of the Client.",
        disputeText: "Any dispute arising from this Agreement shall be governed by the laws of the Republic of South Africa. The parties agree to attempt resolution through mediation before pursuing litigation. The jurisdiction for any legal proceedings shall be the High Court of South Africa, Gauteng Division.",
        pilotEligibilityText: "This Pilot Campaign is a once-off introductory offer available exclusively to first-time clients of Lead Velocity. The discounted pilot rate and terms contained herein are not available to existing or returning clients and may not be combined with any other offer or promotion.",
        renewalText: "Upon successful completion of the 30-day Pilot Campaign, the Client shall have the option to upgrade to one of Lead Velocity's standard service tiers (Bronze, Silver, Gold, or Bespoke). Standard tier pricing and terms shall apply to any ongoing engagement. Lead Velocity will provide tier recommendations based on pilot performance data. There is no obligation to continue after the pilot period.",
        forceMajeureText: "Neither party shall be liable for any failure or delay in performing their obligations where such failure or delay results from circumstances beyond the reasonable control of that party, including but not limited to acts of God, natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities, fire, floods, accidents, pandemic, strikes, or shortages of transportation, facilities, fuel, energy, labour, or materials.",
        liabilityText: "To the maximum extent permitted by law, Lead Velocity's total liability under this Agreement shall not exceed the total Service Fee paid by the Client. In no event shall Lead Velocity be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, revenue, business opportunities, or goodwill, regardless of whether such damages were foreseeable.",
        indemnityText: "The Client agrees to indemnify, defend, and hold harmless Lead Velocity, its directors, employees, and agents from and against any and all claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in connection with: (a) the Client's breach of this Agreement; (b) the Client's use of leads provided; or (c) any third-party claims relating to the Client's business operations.",
        entireAgreementText: "This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, warranties, and agreements between the parties. No amendment or modification of this Agreement shall be valid unless made in writing and signed by both parties. If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.",
        // Additional Standard Legal Clauses
        recitalsText: "WHEREAS the Service Provider is in the business of providing professional lead generation and business development services; AND WHEREAS the Client wishes to engage the Service Provider to provide such services on the terms and conditions set out herein; NOW THEREFORE, in consideration of the mutual covenants and agreements hereinafter set forth and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:",
        definitionsText: "In this Agreement, unless the context indicates otherwise: 'Qualified Lead' means a prospective client who meets the agreed qualification criteria and has expressed genuine interest in the Client's services; 'Effective Date' means the date on which the Service Fee is received in full; 'Contract Period' means the thirty (30) calendar day period commencing on the Effective Date; 'Confidential Information' means all non-public information disclosed by either Party; 'Business Day' means any day other than a Saturday, Sunday, or public holiday in South Africa; 'POPIA' means the Protection of Personal Information Act 4 of 2013.",
        intellectualPropertyText: "All intellectual property, methodologies, systems, processes, templates, and proprietary tools used or developed by Lead Velocity in the performance of this Agreement shall remain the exclusive property of Lead Velocity. The Client shall have no claim to any intellectual property of Lead Velocity. Lead data generated shall be jointly owned, with Lead Velocity retaining the right to use anonymised and aggregated data for benchmarking and service improvement purposes.",
        dataProtectionText: "Both Parties undertake to comply with all applicable data protection legislation, including the Protection of Personal Information Act (POPIA). Lead Velocity shall: (a) process personal information only as necessary to perform the Services; (b) implement appropriate technical and organisational security measures; (c) notify the Client within 72 hours of becoming aware of any data breach; (d) ensure that any sub-processors are bound by equivalent data protection obligations. The Client warrants that it has obtained all necessary consents for Lead Velocity to contact prospects on its behalf.",
        nonSolicitationText: "During the Contract Period and for a period of twelve (12) months thereafter, the Client shall not, directly or indirectly: (a) solicit, recruit, or employ any employee, contractor, or agent of Lead Velocity; (b) attempt to reverse-engineer, replicate, or otherwise discover Lead Velocity's proprietary lead generation methods, sources, or technologies; (c) contact or solicit any of Lead Velocity's other clients or prospects. Any breach of this clause shall entitle Lead Velocity to liquidated damages equal to R50,000 (fifty thousand Rand) per breach, without prejudice to any other remedies available at law.",
        warrantiesText: "Lead Velocity warrants that: (a) it has the right and authority to enter into this Agreement; (b) the Services will be performed with reasonable skill and care; (c) it holds all necessary licences and permits. The Client warrants that: (a) it has the authority to enter into this Agreement; (b) all information provided to Lead Velocity is accurate and complete; (c) it will respond to qualified leads within 48 business hours; (d) it will not use leads for any unlawful purpose. EXCEPT AS EXPRESSLY SET OUT HEREIN, ALL WARRANTIES, CONDITIONS, AND REPRESENTATIONS, WHETHER EXPRESS OR IMPLIED, ARE EXCLUDED TO THE MAXIMUM EXTENT PERMITTED BY LAW.",
        terminationText: "Either Party may terminate this Agreement: (a) by giving thirty (30) days' written notice to the other Party; (b) immediately upon material breach by the other Party which is not remedied within seven (7) days of written notice; (c) immediately if the other Party becomes insolvent, enters liquidation, or has a receiver appointed. Upon termination: (i) all outstanding fees become immediately due; (ii) the Client shall pay for all leads delivered up to the termination date; (iii) clauses relating to confidentiality, intellectual property, non-solicitation, and limitation of liability shall survive termination.",
        assignmentText: "Neither Party may assign, transfer, or delegate any of its rights or obligations under this Agreement without the prior written consent of the other Party, which consent shall not be unreasonably withheld. Notwithstanding the foregoing, Lead Velocity may assign this Agreement to any affiliate or successor entity without consent. Any purported assignment in violation of this clause shall be null and void.",
        noticesText: "All notices, requests, and other communications under this Agreement shall be in writing and shall be deemed delivered: (a) upon personal delivery; (b) upon confirmation of receipt if sent by email; (c) three (3) Business Days after posting if sent by registered mail. Notices shall be sent to the addresses and email addresses set out in the Parties section of this Agreement, or to such other address as a Party may designate by written notice.",
        relationshipText: "Nothing in this Agreement shall be construed as creating a partnership, joint venture, agency, or employment relationship between the Parties. Lead Velocity is an independent contractor and shall have sole control over the manner and means of performing the Services. Neither Party has any authority to bind the other or to incur any obligation on behalf of the other without prior written consent.",
    });

    const [recipientEmail, setRecipientEmail] = useState("");

    useEffect(() => {
        if (initialData) {
            setContractData(initialData);
        }
    }, [initialData]);

    const updateField = (field: string, value: string) => {
        setContractData(prev => ({ ...prev, [field]: value }));
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            let voice = voices.find(v => v.lang === 'en-ZA');
            if (!voice) voice = voices.find(v => v.lang.includes('en-GB'));
            if (voice) {
                utterance.voice = voice;
                utterance.pitch = 1.1;
                utterance.rate = 0.95;
            }
            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance);
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

    const processAICommand = (command: string) => {
        const lowerCmd = command.toLowerCase();
        let response = "I've noted your request.";
        let changes: any = {};

        if (lowerCmd.includes("change client to") || lowerCmd.includes("client name is")) {
            const newName = command.replace(/change client to|client name is/i, "").trim();
            changes = { clientName: newName, clientCompany: `${newName} (Pty) Ltd` };
            response = `I've drafted the client name as "${newName}". Click Submit to apply.`;
        } else if (lowerCmd.includes("fee") || lowerCmd.includes("price")) {
            const match = command.match(/(\d+(?:,\d{3})*(?:\.\d+)?)/);
            if (match) {
                changes = { serviceFee: `R${match[0]}` };
                response = `Service fee drafted as R${match[0]}. Submit to confirm.`;
            }
        } else if (lowerCmd.includes("formal")) {
            changes = {
                scopeText: contractData.scopeText.replace("agrees to provide", "hereby covenants to render professional"),
                termsText: contractData.termsText.replace("valid for", "shall remain in full force and effect for")
            };
            response = "I've made the language more formal. Submit to apply.";
        } else if (lowerCmd.includes("simplify")) {
            changes = {
                scopeText: "Lead Velocity will provide lead generation services to find decision-makers.",
                termsText: "This agreement lasts for 30 days. You pay upfront. We replace bad leads within 48 hours."
            };
            response = "Simplified the contract. Submit to confirm.";
        } else {
            response = "Try 'Change client to...' or 'Set fee to R5000'.";
        }

        setAiResponse(response);
        if (Object.keys(changes).length > 0) setPendingChanges(changes);
        speak(response);
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
                section { page-break-inside: avoid !important; break-inside: avoid !important; margin-bottom: 8px !important; }
                .signature-section { page-break-inside: avoid !important; break-inside: avoid !important; }
                header { page-break-after: avoid !important; }
                h1, h2, h3 { page-break-after: avoid !important; }
            `;
            clone.appendChild(style);

            clone.querySelectorAll('[contenteditable]').forEach(el => {
                el.removeAttribute('contenteditable');
                el.className = el.className.replace(/hover:\S+/g, '').replace(/focus:\S+/g, '');
            });

            document.body.appendChild(clone);
            await new Promise(r => setTimeout(r, 100));

            const canvas = await html2canvas(clone, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 });
            document.body.removeChild(clone);

            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            if (imgHeight <= pageHeight) {
                pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
            } else {
                let heightLeft = imgHeight, position = 0;
                pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
            }

            const fileName = `Contract_${contractData.clientCompany.replace(/\s+/g, "_")}_${Date.now()}.pdf`;

            if (action === 'download') {
                pdf.save(fileName);
                toast({ title: "Downloaded" });
            } else if (action === 'email') {
                if (!recipientEmail) {
                    toast({ title: "Email Required", variant: "destructive" });
                } else {
                    const subject = encodeURIComponent(`Contract: ${contractData.title} - ${contractData.clientCompany}`);
                    const emailBody = `Dear ${contractData.clientName},

Please find attached the Service Level Agreement for your review.

We look forward to a successful partnership.
${getContractEmailSignature()}`;
                    const body = encodeURIComponent(emailBody);
                    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
                    toast({ title: "Email Drafted" });
                }
            } else {
                const pdfBlob = pdf.output('blob');
                const filePath = `contracts/${fileName}`;
                const { error: uploadError } = await supabase.storage.from('admin-documents').upload(filePath, pdfBlob, { upsert: false, contentType: 'application/pdf' });
                if (uploadError) throw uploadError;

                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { error: dbError } = await supabase.from('admin_documents').insert({
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
                toast({ title: "Saved to Library" });
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

            <div className="grid lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
                <div className="lg:col-span-4 xl:col-span-3 h-full flex flex-col gap-4 overflow-hidden">
                    <Card className="bg-slate-900/50 border-white/5 flex-1 overflow-y-auto custom-scrollbar">
                        <CardContent className="p-6 space-y-6">
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
                                <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Dispatch</h3>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Recipient Email</label>
                                    <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="client@company.co.za" className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-slate-900 via-slate-950 to-black border-pink-500/20 shadow-2xl shrink-0">
                        <div className="bg-pink-500/10 px-4 py-2 border-b border-pink-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-pink-400" />
                                <span className="text-[10px] font-bold text-pink-400 uppercase">AI Legal Assistant (ZA)</span>
                            </div>
                            {isSpeaking && <div className="flex gap-0.5 items-end h-3"><div className="w-1 h-3 bg-pink-500 animate-pulse" /><div className="w-1 h-2 bg-pink-500 animate-pulse delay-75" /><div className="w-1 h-2.5 bg-pink-500 animate-pulse delay-150" /></div>}
                        </div>
                        <CardContent className="p-4 space-y-4">
                            {aiResponse && (
                                <div className="animate-in slide-in-from-bottom-2 duration-300">
                                    <p className="text-xs text-slate-300 leading-relaxed bg-white/5 p-3 rounded-lg border-l-2 border-pink-500">"{aiResponse}"</p>
                                    {pendingChanges && (
                                        <div className="flex gap-2 mt-2">
                                            <Button size="sm" onClick={applyPendingChanges} className="flex-1 bg-pink-600 hover:bg-pink-700 h-8 text-[11px] font-bold"><Check className="h-3 w-3 mr-1" /> Submit Changes</Button>
                                            <Button size="sm" variant="outline" onClick={() => setPendingChanges(null)} className="h-8 border-white/10 text-slate-400 hover:text-white"><X className="h-3 w-3" /></Button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <form onSubmit={handleAISubmit} className="relative group">
                                <Input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Change client, fee, or tone..." className="bg-black/60 border-white/10 text-xs pr-12 focus-visible:ring-pink-500/30 h-10" />
                                <div className="absolute right-1 top-1 flex gap-1">
                                    <Button type="button" size="icon" variant="ghost" className={`h-8 w-8 ${isListening ? 'bg-red-500/20 text-red-500' : 'text-slate-500 hover:text-white'}`} onClick={toggleListening}>
                                        {isListening ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-8 xl:col-span-9 h-full flex flex-col bg-slate-950 rounded-xl border border-white/5 overflow-hidden relative group">
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
                                            <div className="pt-4 border-t border-slate-200">
                                                <p className="text-[10px] font-bold text-pink-600 uppercase mb-2">Commission Structure</p>
                                                <Editable tag="p" className="text-xs text-slate-600 leading-relaxed" value={contractData.commissionText} onChange={(val) => updateField('commissionText', val)} />
                                            </div>
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

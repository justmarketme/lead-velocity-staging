import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, Mail, MessageCircle, Send, ZoomIn, ZoomOut, Maximize, Monitor, Save, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import logo from "@/assets/lead-velocity-logo.png";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { getProposalEmailSignature } from "@/utils/emailSignature";

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

    const [formData, setFormData] = useState({
        // Variables
        clientName: "Valued Partner",
        date: new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        investment: "R6,000 (once-off)",
        guaranteedLeads: "6 qualified business leads",
        costPerLead: "R1,000 per lead",
        contentsCover: "R1,000,000 or more",
        buildingValue: "R4,000,000 or more",
        commissionRate: "10%",

        // Static Text Blocks
        // UPDATED: Exact colour match for Mission Control
        title: "Your <span class='text-[#D035D0]'>Mission</span> <span class='text-[#F48C57]'>Control</span> for Growth",
        subtitle: "30-Day Performance-Aligned Campaign",

        purposeTitle: "Purpose of the Pilot",
        purposeText: "This 30-day pilot is designed to provide a <strong class='text-pink-900 bg-pink-50 px-1 rounded'>structured, low-risk starting point</strong> while generating enough <strong class='text-pink-900'>real performance data</strong> to assess lead quality, conversion potential, and return on investment.",
        purposeSubText: "Lead Velocity operates as a <strong>performance-aligned lead partner</strong>, focused on delivering qualified decision-makers rather than high-volume, unfiltered enquiries.",

        overviewTitle: "Pilot Overview",
        quoteText: `"We guarantee conservatively and aim to overdeliver rather than inflate volume at the expense of lead quality."`,

        criteriaTitle: "Qualification Criteria",
        criteria1: "<strong>Decision Maker:</strong> Business owner, director, or key decision-maker.",
        criteria2: "<strong>SME Value Threshold:</strong> Contents cover of <strong>R1,000,000 or more</strong> or Building value of <strong>R4,000,000 or more</strong>.",
        criteria3: "<strong>Target Sectors:</strong> Logistics, Engineering, and established SMEs.",

        excludedTitle: "Strictly Excluded",
        excludedText: "Personal lines, micro businesses below threshold, and qualified price-shopping generic enquiries.",

        alignmentTitle: "Performance Alignment",
        alignmentText: "The pilot investment covers the delivery of the first six qualified business leads. Beyond that, we align with your success.",
        alignmentBoxText: "Additional placed policies attract a <span class='text-pink-400 font-bold'>10% commission</span> calculated on the first-year premium."
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const [recipientEmail, setRecipientEmail] = useState("");
    const [recipientPhone, setRecipientPhone] = useState("");

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
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
            await new Promise(resolve => setTimeout(resolve, 100)); // Slight delay for rendering

            const canvas = await html2canvas(clone, {
                scale: 1.5,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
                windowWidth: 794,
            });

            document.body.removeChild(clone);

            const imgData = canvas.toDataURL("image/jpeg", 0.85); // Use JPEG with 85% quality
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
                compress: true, // Enable compression
            });

            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            if (imgHeight <= pageHeight) {
                pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
            } else {
                let heightLeft = imgHeight;
                let position = 0;

                pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;

                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }
            }

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
                }

                if (action === 'email') {
                    if (!recipientEmail) {
                        toast({ title: "Email required", description: "Enter recipient email.", variant: "destructive" });
                    } else {
                        const subject = encodeURIComponent(`Proposal: ${formData.clientName} - Lead Velocity`);
                        const emailBody = `Hi ${formData.clientName},\n\nPlease find the proposal for the Premium Business Insurance Lead Pilot at the link below:\n\n${publicUrl}\n\nI'd be happy to walk you through the details at your convenience.\n\n${getProposalEmailSignature()}`;
                        const body = encodeURIComponent(emailBody);
                        window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
                        toast({ title: "Email Drafted", description: "Link included in body!" });
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

    return (
        <div className="space-y-6 animate-in fade-in duration-500 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Proposal Generator</h1>
                        <p className="text-slate-400">Values update instantly. Click any text in preview to edit.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => handleGenerate('save')} disabled={isGenerating}>
                        <Save className="mr-2 h-4 w-4" />
                        {isGenerating ? "Saving..." : "Save to System"}
                    </Button>
                    <Button onClick={() => handleGenerate('download')} disabled={isGenerating} className="bg-primary hover:bg-primary/90">
                        <Download className="mr-2 h-4 w-4" />
                        {isGenerating ? "Generating..." : "Download PDF"}
                    </Button>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
                {/* Editor Panel */}
                <div className="lg:col-span-4 xl:col-span-3 h-full overflow-y-auto pr-2 custom-scrollbar">
                    <Card className="bg-slate-900/50 border-white/10 h-fit">
                        <CardContent className="p-6 space-y-8">
                            {/* Customization Section */}
                            <div className="space-y-4">
                                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                    <Send className="h-4 w-4 text-pink-400" />
                                    Share & Distribute
                                </h3>
                                <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl border border-white/5">
                                    <div>
                                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 block">Recipient Email</label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={recipientEmail}
                                                onChange={(e) => setRecipientEmail(e.target.value)}
                                                placeholder="broker@example.com"
                                                className="bg-slate-900/50 border-white/10 text-sm h-9"
                                            />
                                            <Button size="sm" variant="secondary" onClick={() => handleGenerate('email')} disabled={isGenerating}>
                                                {isGenerating && recipientEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <Separator className="bg-white/5" />
                                    <div>
                                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 block">WhatsApp Number</label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={recipientPhone}
                                                onChange={(e) => setRecipientPhone(e.target.value)}
                                                placeholder="+27 82 123 4567"
                                                className="bg-slate-900/50 border-white/10 text-sm h-9"
                                            />
                                            <Button size="sm" className="bg-[#25D366] hover:bg-[#128C7E] text-white border-0" onClick={handleWhatsAppShare}>
                                                <MessageCircle className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Tier Selection Section */}
                            <div className="space-y-4">
                                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                    <Monitor className="h-4 w-4 text-pink-400" />
                                    Pricing Tier
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        {
                                            name: "Bronze (Pilot)",
                                            subtitle: "30-Day Performance-Aligned Campaign",
                                            investment: "R6,000 (once-off)",
                                            leads: "6 qualified business leads",
                                            cost: "R1,000 per lead",
                                            comm: "10%",
                                            alignment: "The pilot investment covers the delivery of the first six qualified business leads. Beyond that, we align with your success.",
                                            color: "border-orange-500/30 hover:bg-orange-500/10 text-orange-200"
                                        },
                                        {
                                            name: "Silver",
                                            subtitle: "Monthly Scaled Acquisition Strategy",
                                            investment: "R15,000 (p/m)",
                                            leads: "18 qualified business leads",
                                            cost: "R833 per lead",
                                            comm: "8%",
                                            alignment: "This monthly engagement ensures a consistent flow of high-value prospects. Our performance alignment keeps costs predictable while scaling.",
                                            color: "border-slate-400/30 hover:bg-slate-400/10 text-slate-200"
                                        },
                                        {
                                            name: "Gold",
                                            subtitle: "Enterprise High-Velocity Lead Engine",
                                            investment: "R30,000 (p/m)",
                                            leads: "40 qualified business leads",
                                            cost: "R750 per lead",
                                            comm: "6%",
                                            alignment: "The Gold tier is built for maximum market penetration, delivering the highest volume of qualified decision-makers at our most efficient rate.",
                                            color: "border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-200"
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
                                                    alignmentBoxText: `Additional placed policies attract a <span class='text-pink-400 font-bold'>${tier.comm} commission</span> calculated on the first-year premium.`
                                                }));
                                                toast({ title: `${tier.name} Applied`, description: "Full template context updated." });
                                            }}
                                            className={`w-full text-left p-3 rounded-xl border ${tier.color} transition-all group`}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-sm tracking-tight">{tier.name}</span>
                                                <span className="text-[10px] font-black opacity-40 uppercase tracking-tighter">{tier.comm} Comm.</span>
                                            </div>
                                            <div className="text-[10px] opacity-60 flex justify-between">
                                                <span>{tier.investment}</span>
                                                <span>{tier.leads.split(' ')[0]} Leads</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Separator className="bg-white/10" />

                            {/* Variables Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-lg text-white">Variables</h3>
                                    <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-1 rounded">Auto-syncs with doc</span>
                                </div>
                                <p className="text-xs text-slate-500">Edit below OR click directly on the document to edit.</p>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Client Name</label>
                                    <Input
                                        value={formData.clientName}
                                        onChange={(e) => updateField('clientName', e.target.value)}
                                        className="bg-slate-800 border-white/10"
                                    />
                                </div>
                                {/* Reduced spacing in sidebar inputs */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Investment</label>
                                        <Input value={formData.investment} onChange={(e) => updateField('investment', e.target.value)} className="bg-slate-800 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Leads</label>
                                        <Input value={formData.guaranteedLeads} onChange={(e) => updateField('guaranteedLeads', e.target.value)} className="bg-slate-800 border-white/10" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Live Preview Area - TIGHTER LAYOUT FOR 1-PAGE FIT */}
                <div className="lg:col-span-8 xl:col-span-9 h-full flex flex-col bg-slate-900/30 rounded-xl border border-white/10 overflow-hidden relative group">
                    <div className="absolute top-4 right-4 z-50 bg-slate-900/90 backdrop-blur border border-white/10 rounded-lg flex items-center p-1.5 shadow-xl space-x-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => adjustZoom(-0.1)}><ZoomOut className="h-4 w-4" /></Button>
                        <span className="text-xs font-mono font-bold text-white w-12 text-center">{Math.round(zoom * 100)}%</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => adjustZoom(0.1)}><ZoomIn className="h-4 w-4" /></Button>
                        <Separator orientation="vertical" className="h-4 mx-2 bg-white/20" />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => setZoom(0.55)} title="Fit to Screen"><Monitor className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white" onClick={() => setZoom(1.0)} title="Actual Size"><Maximize className="h-4 w-4" /></Button>
                    </div>

                    <div className="flex-1 overflow-auto p-8 flex justify-center items-start custom-scrollbar">
                        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease-out' }} className="shrink-0">
                            <div ref={reportRef} className="w-[210mm] font-inter bg-white text-slate-900 shadow-2xl relative overflow-hidden flex flex-col" style={{ minHeight: '297mm' }}>
                                {/* Top Accent - REMOVED ORANGE */}
                                <div className="h-2 w-full bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600"></div>

                                <div className="p-[20mm] py-[15mm] flex-1 flex flex-col">
                                    {/* Header - Reduced top padding */}
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

                                    {/* Content - Compacted Spacing */}
                                    <main className="space-y-6 text-[15px] leading-relaxed text-slate-600 font-medium flex-1">

                                        {/* Purpose */}
                                        <section>
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="h-6 w-1 bg-pink-600 rounded-full"></div>
                                                <Editable tag="h2" className="text-lg font-bold text-[#0F172A]" value={formData.purposeTitle} onChange={(val) => updateField('purposeTitle', val)} />
                                            </div>
                                            <Editable tag="div" html={true} className="mb-2" value={formData.purposeText} onChange={(val) => updateField('purposeText', val)} />
                                            <Editable tag="div" html={true} value={formData.purposeSubText} onChange={(val) => updateField('purposeSubText', val)} />
                                        </section>

                                        {/* Overview Grid - Compact Padding */}
                                        <section className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                                            <Editable tag="h3" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4" value={formData.overviewTitle} onChange={(val) => updateField('overviewTitle', val)} />
                                            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Duration</p>
                                                    <p className="text-slate-900 font-semibold text-base">30 Days</p>
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
                                                    <Editable className="text-slate-900 font-semibold" value={formData.costPerLead} onChange={(val) => updateField('costPerLead', val)} />
                                                </div>
                                            </div>
                                        </section>

                                        <div className="border-l-4 border-pink-500 pl-4 py-1 bg-gradient-to-r from-pink-50 to-transparent">
                                            <Editable tag="p" className="italic text-slate-700 text-sm font-medium" value={formData.quoteText} onChange={(val) => updateField('quoteText', val)} />
                                        </div>

                                        {/* Criteria & Exclusions - Compact Listing */}
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

                                            {/* REVERTED TO ROSE (RED) */}
                                            <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 h-fit">
                                                <Editable tag="h4" className="text-rose-700 font-bold uppercase text-[10px] tracking-wider mb-2" value={formData.excludedTitle} onChange={(val) => updateField('excludedTitle', val)} />
                                                <Editable tag="p" className="text-xs text-rose-900/80 leading-snug" value={formData.excludedText} onChange={(val) => updateField('excludedText', val)} />
                                            </div>
                                        </div>

                                        {/* Performance Alignment */}
                                        <section>
                                            <div className="bg-[#0F172A] text-white p-6 rounded-xl relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                                    <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                                                </div>
                                                <div className="flex items-center gap-2 mb-2 relative z-10">
                                                    <span className="text-pink-400 text-lg">⚡</span>
                                                    <Editable tag="h2" className="text-lg font-bold text-white" value={formData.alignmentTitle} onChange={(val) => updateField('alignmentTitle', val)} />
                                                </div>
                                                <Editable tag="p" className="text-slate-300 text-sm mb-4 relative z-10 font-normal" value={formData.alignmentText} onChange={(val) => updateField('alignmentText', val)} />
                                                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-lg border border-white/10 relative z-10">
                                                    <Editable tag="p" html={true} className="font-medium text-white text-sm" value={formData.alignmentBoxText} onChange={(val) => updateField('alignmentBoxText', val)} />
                                                </div>
                                            </div>
                                        </section>
                                    </main>

                                    {/* Footer */}
                                    <div className="mt-8 pt-6 border-t-2 border-slate-100 flex justify-between items-center text-xs text-slate-500">
                                        <div>
                                            <p className="font-bold text-[#0F172A]">Lead Velocity Team</p>
                                            <p>Performance-First Business Insurance Leads</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-pink-600 font-bold mb-1">www.leadvelocity.co.za</p>
                                            <p>confidential proposal</p>
                                        </div>
                                    </div>
                                    <div className="h-2 w-full bg-[#0F172A] mt-4 rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProposalGenerator;

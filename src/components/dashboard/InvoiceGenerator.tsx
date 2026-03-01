import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, Mail, ZoomIn, ZoomOut, Maximize, Monitor, Plus, Trash2, Save, Mic, MicOff, Bot, Sparkles, Check, X, Loader2, Paperclip, AudioLines, SendHorizonal } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import logo from "@/assets/lead-velocity-logo.png";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { getInvoiceEmailSignature } from "@/utils/emailSignature";
import { BrokerSelector } from "./BrokerSelector";
import { callLegalAI } from "@/utils/legalAI";

interface InvoiceGeneratorProps {
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
            className={`${className} hover:bg-slate-100 rounded px-1 -mx-1 transition-all outline-none focus:bg-slate-50 focus:outline focus:outline-2 focus:outline-pink-500 cursor-text`}
            onBlur={handleBlur}
            dangerouslySetInnerHTML={html ? { __html: value } : undefined}
        >
            {html ? undefined : value}
        </Tag>
    );
};

const InvoiceGenerator = ({ onBack, initialData }: InvoiceGeneratorProps) => {
    const { toast } = useToast();
    const reportRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(0.55);
    const [isGenerating, setIsGenerating] = useState(false);

    // AI & Voice State
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isConversational, setIsConversational] = useState(false);
    const [aiResponse, setAiResponse] = useState("");
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([
        "Ensure standard payment terms",
        "Add a late fee clause",
        "Make it sound more professional"
    ]);
    const [pendingChanges, setPendingChanges] = useState<any>(null);

    const [invoiceData, setInvoiceData] = useState({
        invoiceNumber: "INV-2024-001",
        date: new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        clientName: "Client Company Name",
        clientAddress: "123 Client Street, City, Country",
        clientVat: "VAT: 4000123456",
        items: [
            { description: "Lead Generation Pilot Campaign (30 Days)", quantity: 1, price: 6000 },
            { description: "Platform Setup & Configuration", quantity: 1, price: 0 }
        ],
        notes: "Thank you for your business. Payment is due within 7 days.",
        bankName: "First National Bank",
        accountName: "Lead Velocity Pty Ltd",
        accountNumber: "63174286724", // Updated to match requested banking details
        branchCode: "250655",
        reference: "INV-2024-001",
        companyAddressLine1: "100 West Street, Sandton",
        companyAddressLine2: "Johannesburg, 2196",
        companyEmail: "howzit@leadvelocity.co.za",
        companyRegNumber: "Reg: 2024/123456/07"
    });

    useEffect(() => {
        if (initialData) {
            setInvoiceData(initialData);
        }
    }, [initialData]);
    const [recipientEmail, setRecipientEmail] = useState("");

    const handleBrokerSelect = (broker: any) => {
        const name = broker.full_name || "Client Name";
        const company = broker.firm_name || broker.company_name || "";
        const clientName = company || name;

        const weeklyLeads = broker.desired_leads_weekly || 6;
        const monthlyLeads = Math.round(weeklyLeads * 4.33);
        let itemDescription = "Lead Generation Pilot Campaign (30 Days)";
        let itemPrice = 6000;

        if (monthlyLeads <= 6) {
            itemDescription = "Lead Generation Pilot Campaign (30 Days)";
            itemPrice = 6000;
        } else if (monthlyLeads <= 20) {
            itemDescription = "Growth Starter Lead Strategy (Bronze)";
            itemPrice = 8500;
        } else if (monthlyLeads <= 32) {
            itemDescription = "Scale & Optimise Lead Engine (Silver)";
            itemPrice = 10500;
        } else {
            itemDescription = "Performance Partner Enterprise Tier (Gold)";
            itemPrice = 16500;
        }

        setInvoiceData(prev => ({
            ...prev,
            clientName,
            clientAddress: broker.office_address || "To be updated",
            clientVat: "VAT: To be updated",
            items: [
                { description: itemDescription, quantity: 1, price: itemPrice },
                { description: "Platform Setup & Configuration", quantity: 1, price: 0 }
            ]
        }));

        if (broker.email) setRecipientEmail(broker.email);

        toast({
            title: "Broker Data Applied",
            description: `Auto-filled details and set item to ${itemPrice} based on ${monthlyLeads} leads/mo.`,
        });
    };

    const updateField = (field: string, value: string) => {
        setInvoiceData(prev => ({ ...prev, [field]: value }));
    };

    const updateItem = (index: number, field: string, value: string | number) => {
        const newItems = [...invoiceData.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setInvoiceData(prev => ({ ...prev, items: newItems }));
    };

    const addItem = () => {
        setInvoiceData(prev => ({
            ...prev,
            items: [...prev.items, { description: "New Item", quantity: 1, price: 0 }]
        }));
    };

    const removeItem = (index: number) => {
        const newItems = invoiceData.items.filter((_, i) => i !== index);
        setInvoiceData(prev => ({ ...prev, items: newItems }));
    };

    const calculateTotal = () => {
        return invoiceData.items.reduce((acc, item) => acc + (item.quantity * item.price), 0);
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

    // Speech Recognition (STT)
    const toggleListening = () => {
        if (isListening) {
            setIsListening(false);
            return;
        }
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast({ title: "Not Supported", description: "Voice input is not supported in this browser.", variant: "destructive" });
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-ZA';
        recognition.onstart = () => {
            setIsListening(true);
            toast({ title: "Listening...", description: "Speak your command clearly." });
        };
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
        setAiResponse("Let me review the invoice...");
        try {
            const result = await callLegalAI(command, invoiceData, "Invoice");
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
        setInvoiceData(prev => ({ ...prev, ...pendingChanges }));
        setPendingChanges(null);
        setAiResponse("Invoice updated. You can still manual edit any field below.");
        toast({ title: "Applied", description: "Invoice updated with AI suggestions." });
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
            const actionText = action === 'email' ? 'Sharing' : action === 'save' ? 'Saving' : 'Generating';
            toast({ title: `${actionText} Invoice...`, description: "Processing document..." });

            const element = reportRef.current;
            const clone = element.cloneNode(true) as HTMLElement;

            clone.style.transform = "none";
            clone.style.position = "fixed";
            clone.style.top = "-9999px";
            clone.style.left = "0";
            clone.style.width = "210mm";
            clone.style.minHeight = "297mm";
            clone.style.height = "auto";
            clone.style.zIndex = "-9999";

            const editables = clone.querySelectorAll('[contenteditable]');
            editables.forEach(el => {
                el.removeAttribute('contenteditable');
                el.className = el.className.replace(/hover:\S+/g, '').replace(/focus:\S+/g, '');
            });

            // Remove buttons from clone
            const buttons = clone.querySelectorAll('button');
            buttons.forEach(btn => btn.remove());

            // Add page-break styles to prevent content from being cut
            const style = document.createElement('style');
            style.textContent = `
                section, .invoice-section { page-break-inside: avoid !important; break-inside: avoid !important; }
                table { page-break-inside: avoid !important; break-inside: avoid !important; }
                tr { page-break-inside: avoid !important; break-inside: avoid !important; }
                header { page-break-after: avoid !important; }
                h1, h2, h3 { page-break-after: avoid !important; }
            `;
            clone.appendChild(style);

            document.body.appendChild(clone);
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(clone, {
                scale: 1.5,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
                windowWidth: 794,
            });

            document.body.removeChild(clone);

            const imgData = canvas.toDataURL("image/jpeg", 0.85);
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
                compress: true,
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

            const fileName = `Invoice_${invoiceData.invoiceNumber}_${Date.now()}.pdf`;
            if (action === 'download') {
                pdf.save(fileName);
                toast({ title: "Success", description: "Invoice downloaded." });
            }
            else {
                // For 'save' and 'email', we upload to Supabase
                const pdfBlob = pdf.output('blob');
                const filePath = `invoices/${fileName}`;

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
                            description: `Invoice for ${invoiceData.clientName}`,
                            file_path: filePath,
                            file_type: 'pdf',
                            file_size: pdfBlob.size,
                            category: 'invoices',
                            uploaded_by: user.id,
                            content_data: invoiceData
                        });

                    if (dbError) throw dbError;
                }

                if (action === 'email') {
                    if (!recipientEmail) {
                        toast({ title: "Email Required", description: "Please enter a recipient email address in the sidebar.", variant: "destructive" });
                    } else {
                        const subject = encodeURIComponent(`Invoice: ${invoiceData.invoiceNumber} from Lead Velocity`);
                        const emailBody = `Hi ${invoiceData.clientName},\n\nPlease find the invoice ${invoiceData.invoiceNumber} at the link below:\n\n${publicUrl}\n\nTotal Due: R${calculateTotal().toLocaleString()}\nDue Date: ${invoiceData.dueDate}\n\nThank you for your business.\n\n${getInvoiceEmailSignature()}`;
                        const body = encodeURIComponent(emailBody);
                        window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
                        toast({ title: "Email Drafted", description: "Link included in body!" });
                    }
                } else {
                    toast({ title: "Saved", description: "Invoice saved to documents library." });
                }
            }
        } catch (error: any) {
            console.error(error);
            toast({ title: "Error", description: error.message || "Failed to process document.", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const adjustZoom = (delta: number) => {
        setZoom(prev => Math.max(0.3, Math.min(1.5, prev + delta)));
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 h-[calc(100vh-100px)] flex flex-col font-sans">
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Invoice Center <span className="text-slate-500 font-normal">v2.0</span></h1>
                        <p className="text-slate-400 text-sm">Professional billing & document automation.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-green-500/20 text-slate-300 hover:bg-green-500/10" onClick={() => handleGenerate('email')} disabled={isGenerating}>
                        <Mail className="mr-2 h-4 w-4" />
                        Email
                    </Button>
                    <Button variant="outline" className="border-white/10 text-slate-300" onClick={() => handleGenerate('save')} disabled={isGenerating}>
                        <Save className="mr-2 h-4 w-4" />
                        Save to System
                    </Button>
                    <Button onClick={() => handleGenerate('download')} disabled={isGenerating} className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20">
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                    </Button>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
                {/* Editor Panel */}
                <div className="lg:col-span-4 xl:col-span-3 h-full flex flex-col gap-4 overflow-hidden">
                    <Card className="bg-slate-900/50 border-white/5 flex-1 overflow-y-auto custom-scrollbar">
                        <CardContent className="p-6 space-y-6">
                            <BrokerSelector onSelect={handleBrokerSelect} />

                            <div className="space-y-4">
                                <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Invoice Meta</h3>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Invoice #</label>
                                    <Input value={invoiceData.invoiceNumber} onChange={(e) => updateField('invoiceNumber', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Date</label>
                                        <Input value={invoiceData.date} onChange={(e) => updateField('date', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Due Date</label>
                                        <Input value={invoiceData.dueDate} onChange={(e) => updateField('dueDate', e.target.value)} className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                    </div>
                                </div>
                                <Separator className="bg-white/5" />
                                <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Dispatch</h3>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Recipient Email</label>
                                    <Input
                                        value={recipientEmail}
                                        onChange={(e) => setRecipientEmail(e.target.value)}
                                        placeholder="accounts@client.co.za"
                                        className="bg-slate-950/50 border-white/10 h-9 text-sm"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Premium AI Assistant UI (Grok Style) */}
                    <Card className="bg-[#151719]/80 backdrop-blur-xl border border-white/5 shadow-2xl overflow-hidden shrink-0 rounded-2xl">
                        <CardContent className="p-4 space-y-4">
                            {/* AI Message Bubble */}
                            {(aiResponse || isThinking) && (
                                <div className="animate-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex gap-3">
                                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                                            <Bot className="h-3.5 w-3.5 text-green-500" />
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            {isThinking ? (
                                                <div className="flex gap-1 items-center py-1">
                                                    <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                    <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                    <div className="w-1.5 h-1.5 bg-green-500/50 rounded-full animate-bounce" />
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
                                            <Button size="sm" onClick={applyPendingChanges} className="flex-1 bg-green-600 hover:bg-green-700 h-9 text-[11px] font-bold rounded-xl shadow-lg shadow-green-600/20 border-t border-white/10">
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
                            <div className="relative group mt-2 bg-black/40 rounded-2xl border border-white/5 p-1.5 transition-all duration-300 focus-within:border-green-500/30 focus-within:bg-black/60 shadow-inner">
                                <form onSubmit={handleAISubmit} className="flex items-center gap-1">
                                    <div className="flex items-center gap-0.5 px-2 text-slate-500">
                                        <Paperclip className="h-4 w-4 hover:text-slate-300 cursor-pointer transition-colors" />
                                    </div>

                                    <Input
                                        value={aiInput}
                                        onChange={(e) => setAiInput(e.target.value)}
                                        placeholder="Ask the finance assistant..."
                                        className="bg-transparent border-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-9 text-slate-200 placeholder:text-slate-600 shadow-none px-1"
                                    />

                                    <div className="flex items-center gap-1 pr-1">
                                        {/* Conversational Toggle */}
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => setIsConversational(!isConversational)}
                                            className={`h-8 w-8 rounded-xl transition-all ${isConversational ? 'bg-green-500/20 text-green-500 shadow-lg shadow-green-500/10' : 'text-slate-500 hover:text-slate-200'}`}
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
                </div>

                {/* Preview Engine */}
                <div className="lg:col-span-8 xl:col-span-9 h-full flex flex-col bg-slate-950 rounded-xl border border-white/5 overflow-hidden relative group">
                    <div className="absolute top-4 right-4 z-50 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-full flex items-center px-4 py-1.5 shadow-2xl space-x-3 transition-opacity opacity-0 group-hover:opacity-100">
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
                                {/* Header / Letterhead */}
                                <div className="p-[20mm] pb-8 flex justify-between items-start border-b-2 border-slate-100">
                                    <div>
                                        <img src={logo} alt="Lead Velocity" className="h-28 w-auto object-contain mb-6" />
                                        <h1 className="text-5xl font-black text-slate-900 tracking-tight">INVOICE</h1>
                                    </div>
                                    <div className="text-right">
                                        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Lead Velocity</h2>
                                        <div className="text-[11px] text-slate-500 mt-3 space-y-0.5 leading-tight">
                                            <Editable tag="p" className="font-bold text-slate-800" value={invoiceData.companyRegNumber} onChange={(val) => updateField('companyRegNumber', val)} />
                                            <Editable tag="p" value={invoiceData.companyAddressLine1} onChange={(val) => updateField('companyAddressLine1', val)} />
                                            <Editable tag="p" value={invoiceData.companyAddressLine2} onChange={(val) => updateField('companyAddressLine2', val)} />
                                            <Editable tag="p" className="text-green-600 font-medium" value={invoiceData.companyEmail} onChange={(val) => updateField('companyEmail', val)} />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-[20mm] py-10 flex-1">
                                    <div className="flex justify-between mb-16">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Client Recipient</p>
                                            <Editable tag="h3" className="font-black text-2xl text-slate-900 mb-1" value={invoiceData.clientName} onChange={(val) => updateField('clientName', val)} />
                                            <Editable tag="div" className="text-slate-500 text-sm whitespace-pre-wrap leading-relaxed" value={invoiceData.clientAddress} onChange={(val) => updateField('clientAddress', val)} />
                                            <Editable tag="p" className="text-slate-400 text-xs mt-3 font-mono" value={invoiceData.clientVat} onChange={(val) => updateField('clientVat', val)} />
                                        </div>
                                        <div className="text-right space-y-3">
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">Reference</span>
                                                <Editable tag="span" className="font-mono font-bold text-slate-900 bg-slate-50 px-2 py-1" value={invoiceData.invoiceNumber} onChange={(val) => updateField('invoiceNumber', val)} />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">Issue Date</span>
                                                <Editable tag="span" className="text-sm font-medium text-slate-900" value={invoiceData.date} onChange={(val) => updateField('date', val)} />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">Deadline</span>
                                                <Editable tag="span" className="text-sm font-bold text-red-600 underline decoration-red-200" value={invoiceData.dueDate} onChange={(val) => updateField('dueDate', val)} />
                                            </div>
                                            <div className="pt-2">
                                                <span className="inline-block px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-bold text-[10px] uppercase tracking-tighter">Settlement Pending</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Items Table */}
                                    <div className="mb-16">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b-2 border-slate-950">
                                                    <th className="text-left py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/2">Service Description</th>
                                                    <th className="text-center py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/6">Qty</th>
                                                    <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/6">Unit Price</th>
                                                    <th className="text-right py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/6">Subtotal</th>
                                                    <th className="w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {invoiceData.items.map((item, index) => (
                                                    <tr key={index} className="group transition-colors hover:bg-slate-50/50">
                                                        <td className="py-5">
                                                            <Editable
                                                                className="font-bold text-slate-900 text-sm"
                                                                value={item.description}
                                                                onChange={(val) => updateItem(index, 'description', val)}
                                                            />
                                                        </td>
                                                        <td className="py-5 text-center">
                                                            <Editable
                                                                className="text-slate-500 font-mono text-xs"
                                                                value={item.quantity.toString()}
                                                                onChange={(val) => updateItem(index, 'quantity', parseInt(val) || 0)}
                                                            />
                                                        </td>
                                                        <td className="py-5 text-right">
                                                            <Editable
                                                                className="text-slate-500 font-mono text-xs"
                                                                value={item.price.toString()}
                                                                onChange={(val) => updateItem(index, 'price', parseFloat(val) || 0)}
                                                            />
                                                        </td>
                                                        <td className="py-5 text-right font-bold text-slate-900 text-sm">
                                                            R{(item.quantity * item.price).toLocaleString()}
                                                        </td>
                                                        <td className="py-5 text-center">
                                                            <button onClick={() => removeItem(index)} className="text-red-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <button onClick={addItem} className="mt-6 flex items-center text-[10px] font-black uppercase tracking-widest text-green-600 hover:text-green-700 transition-all">
                                            <Plus className="h-3 w-3 mr-1" /> Add Service Line
                                        </button>
                                    </div>

                                    {/* Totals Section */}
                                    <div className="flex justify-end mb-16">
                                        <div className="w-1/3 bg-slate-950 text-white p-8 rounded-2xl shadow-xl">
                                            <div className="flex justify-between mb-3">
                                                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Net Subtotal</span>
                                                <span className="font-bold text-sm">R{calculateTotal().toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between mb-6 pb-6 border-b border-white/10">
                                                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">VAT (0%)</span>
                                                <span className="font-bold text-sm">R0.00</span>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <span className="font-black text-xs uppercase tracking-widest text-green-400">Total Due</span>
                                                <span className="font-black text-2xl text-white">R{calculateTotal().toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Banking & Notes */}
                                    <div className="grid grid-cols-2 gap-12">
                                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                                            <h4 className="font-black text-slate-900 text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                                EFT Payment Details
                                            </h4>
                                            <div className="space-y-2 text-xs text-slate-600 leading-tight">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400 font-bold uppercase text-[9px]">Bank</span>
                                                    <Editable tag="span" className="font-bold text-slate-900" value={invoiceData.bankName} onChange={(val) => updateField('bankName', val)} />
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400 font-bold uppercase text-[9px]">Account</span>
                                                    <Editable tag="span" className="font-bold text-slate-900" value={invoiceData.accountName} onChange={(val) => updateField('accountName', val)} />
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400 font-bold uppercase text-[9px]">Acc #</span>
                                                    <Editable tag="span" className="font-bold text-slate-900" value={invoiceData.accountNumber} onChange={(val) => updateField('accountNumber', val)} />
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400 font-bold uppercase text-[9px]">Branch</span>
                                                    <Editable tag="span" className="font-bold text-slate-900" value={invoiceData.branchCode} onChange={(val) => updateField('branchCode', val)} />
                                                </div>
                                                <div className="flex justify-between pt-2 border-t border-slate-200">
                                                    <span className="text-slate-400 font-bold uppercase text-[9px]">Ref</span>
                                                    <Editable tag="span" className="font-black text-green-600" value={invoiceData.reference} onChange={(val) => updateField('reference', val)} />
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-900 text-[10px] uppercase tracking-widest mb-4">Terms & Notes</h4>
                                            <Editable tag="p" className="text-xs text-slate-500 leading-relaxed italic" value={invoiceData.notes} onChange={(val) => updateField('notes', val)} />
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="mt-auto relative">
                                    <div className="h-2 w-full bg-gradient-to-r from-green-600 via-emerald-500 to-green-600" />
                                    <div className="bg-slate-950 px-[20mm] py-4 flex justify-between items-center text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                        <p>Strictly Private & Confidential</p>
                                        <p>Electronic Tax Invoice System | Lead Velocity</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceGenerator;

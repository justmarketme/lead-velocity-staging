// CRM Contract Generator: produces the Lead Generation Services Agreement and nothing else.
// Wording: deliverables/contracts-drafter/lead-generation-agreement/lead-velocity-services-agreement.md
// (via src/lib/contract/agreement.ts). Plan numbers: src/lib/pricing.ts. This screen only fills the
// template's [PLACEHOLDERS] and picks the Plan; it never edits clause text. No commission, success fee
// or any payment linked to a policy, premium or sale exists anywhere in the agreement (clause 8.3).
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Printer, AudioLines, Bot, Download, FileText, Mail, Maximize, Mic, Monitor, Paperclip, Save, SendHorizonal, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generateSmartPDF, blobToBase64 } from "@/utils/pdfUtils";
import { buildContractDocx } from "@/utils/contractToDocx";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getContractEmailSignature } from "@/utils/emailSignature";
import { BrokerSelector } from "./BrokerSelector";
import { renderAgreementHtml } from "@/lib/contract/renderHtml";
import contractLogo from "@/assets/lead-velocity-logo-contract.png";
import { callLegalAI } from "@/utils/legalAI";
import { ALL_PLANS, isPilot, perLead, pricingSummaryText, zar } from "@/lib/pricing";
import {
    AGREEMENT_TITLE,
    PRIMARY_FIELDS,
    TEMPLATE_VERSION,
    defaultFields,
    otherPlaceholderTokens,
    resolveAgreement,
    suggestedValue,
    type AgreementFields,
} from "@/lib/contract/agreement";

interface ContractGeneratorProps {
    onBack: () => void;
    initialData?: any;
}

const EMAIL_SUBJECT = `${AGREEMENT_TITLE} — draft for your review`;
const OTHER_TOKENS = otherPlaceholderTokens();
const ALL_TOKENS = new Set([...PRIMARY_FIELDS.map((f) => f.token), ...OTHER_TOKENS]);
const tokenLabel = (t: string) => t.slice(1, -1);

const AI_GUIDANCE =
    `The document is Lead Velocity's attorney-drafted ${AGREEMENT_TITLE} (template ${TEMPLATE_VERSION}). Its clause wording is fixed and cannot be changed here: ` +
    `you may only propose values for the placeholder keys (the keys in square brackets), "plan" (one of ${ALL_PLANS.map((t) => t.name).join(", ")}; never choose it from how many leads the client wants) and "client_phone". ` +
    `Commercial model, from the pricing source:\n${pricingSummaryText()}\n` +
    `Never propose or mention any commission, success fee, bonus, share of premium or any payment linked to a policy, application, sale or appointment outcome: ` +
    `the fee is flat per Billing Cycle (clause 8.3; FAIS, Raspberry Academy v Oaksure). For questions about the clauses, answer in "response" and return empty "changes".`;

/** content_data saved by the old Service Level Agreement screen: carry the client details over. */
function fromLegacy(old: Record<string, any>): AgreementFields {
    const strip = (v: unknown, prefix: RegExp, junk: string[] = []) => {
        const s = String(v ?? "").replace(prefix, "").trim();
        return junk.includes(s) ? "" : s;
    };
    const f = defaultFields();
    const p: Record<string, string> = {};
    const name = strip(old.clientName, /^$/, ["Valued Partner"]);
    const company = strip(old.clientCompany, /^$/, ["Client Company (Pty) Ltd"]);
    const email = strip(old.clientEmailLine, /^Email:\s*/i);
    const address = strip(old.clientAddressLine, /^Address:\s*/i);
    if (name) p["[CLIENT FULL NAME]"] = name;
    if (company) p["[PRACTICE NAME]"] = company;
    if (email) p["[CLIENT EMAIL]"] = email;
    if (address) p["[CLIENT PHYSICAL ADDRESS]"] = address;
    return { ...f, client_phone: strip(old.clientPhoneLine, /^Tel:\s*/i), placeholders: p };
}

const ContractGenerator = ({ onBack, initialData }: ContractGeneratorProps) => {
    const { toast } = useToast();
    const [previewHeight, setPreviewHeight] = useState(1123);
    const [zoom, setZoom] = useState(0.55);
    const [isGenerating, setIsGenerating] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(360);
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(0);

    const [fields, setFields] = useState<AgreementFields>(defaultFields);
    const doc = useMemo(() => resolveAgreement(fields), [fields]);
    const [recipientEmail, setRecipientEmail] = useState("");
    const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<null | "save" | "email">(null);
    const [history, setHistory] = useState<any[]>([]);

    const [isListening, setIsListening] = useState(false);
    const [aiInput, setAiInput] = useState("");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isConversational, setIsConversational] = useState(false);
    const [aiResponse, setAiResponse] = useState("");
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([
        "Which details are still missing?",
        "Explain clause 8.3 in plain words",
        "What does the client get on this plan?",
    ]);
    const [pendingChanges, setPendingChanges] = useState<Record<string, string> | null>(null);

    const placeholder = (token: string) => fields.placeholders[token] || "";
    const setPlaceholder = (token: string, value: string) => setFields((prev) => ({ ...prev, placeholders: { ...prev.placeholders, [token]: value } }));
    const clientLabel = placeholder("[PRACTICE NAME]") || placeholder("[CLIENT FULL NAME]") || "Client";

    const handleDividerMouseDown = (e: React.MouseEvent) => {
        isDraggingRef.current = true;
        dragStartXRef.current = e.clientX;
        dragStartWidthRef.current = sidebarWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const handleMouseMove = (ev: MouseEvent) => {
            if (!isDraggingRef.current) return;
            setSidebarWidth(Math.max(280, Math.min(640, dragStartWidthRef.current + ev.clientX - dragStartXRef.current)));
        };
        const handleMouseUp = () => {
            isDraggingRef.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    };

    const fetchHistory = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
            .from("admin_documents")
            .select("*")
            .eq("category", "contracts")
            .eq("uploaded_by", user.id)
            .order("created_at", { ascending: false })
            .limit(5);
        if (data && !error) setHistory(data);
    };

    // Fills client details only. The Plan is never inferred from desired leads: Bronze by default, the user picks.
    const handleBrokerSelect = (broker: any) => {
        const phone = broker.phone_number || broker.phone || broker.whatsapp_number || "";
        setFields((prev) => ({
            ...prev,
            client_phone: phone || prev.client_phone,
            placeholders: {
                ...prev.placeholders,
                ...(broker.full_name ? { "[CLIENT FULL NAME]": broker.full_name } : {}),
                ...(broker.firm_name || broker.company_name ? { "[PRACTICE NAME]": broker.firm_name || broker.company_name } : {}),
                ...(broker.email ? { "[CLIENT EMAIL]": broker.email } : {}),
            },
        }));
        if (broker.email) setRecipientEmail(broker.email);
        if (broker.id) setSelectedBrokerId(broker.id);
        toast({ title: "Broker details applied", description: "Name, practice, email and phone filled. Choose the plan yourself." });
    };

    const [searchParams] = useSearchParams();
    const globalBrokerId = searchParams.get("brokerId");
    useEffect(() => {
        if (!globalBrokerId) return;
        (async () => {
            const { data, error } = await supabase.from("broker_onboarding_responses").select("*").eq("id", globalBrokerId).single();
            if (data && !error) handleBrokerSelect(data);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalBrokerId]);

    useEffect(() => {
        if (!initialData) return;
        if (initialData.template_version && initialData.fields) {
            const saved = initialData.fields as Partial<AgreementFields>;
            setFields({ ...defaultFields(), ...saved, placeholders: { ...(saved.placeholders || {}) } });
            if (initialData.template_version !== TEMPLATE_VERSION)
                toast({ title: "Newer agreement wording", description: `Saved against ${initialData.template_version}; now shown on ${TEMPLATE_VERSION}. Review before sending.` });
        } else {
            setFields(fromLegacy(initialData));
            toast({ title: "Old-format contract", description: `Client details carried into the ${AGREEMENT_TITLE}. The old SLA terms were not carried over.` });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData]);

    useEffect(() => {
        fetchHistory();
    }, []);

    // ---------------------------------------------------------------- AI assistant (placeholder values only)
    const speak = (text: string) => {
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const go = () => {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find((v) => v.lang === "en-ZA") || voices.find((v) => v.lang.startsWith("en")) || voices[0];
            const u = new SpeechSynthesisUtterance(text);
            if (voice) u.voice = voice;
            u.onstart = () => setIsSpeaking(true);
            u.onend = () => setIsSpeaking(false);
            window.speechSynthesis.speak(u);
        };
        if (window.speechSynthesis.getVoices().length > 0) go();
        else window.speechSynthesis.onvoiceschanged = () => { go(); window.speechSynthesis.onvoiceschanged = null; };
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
        recognition.lang = "en-ZA";
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

    const aiState = () => {
        const state: Record<string, string> = { plan: fields.plan, client_phone: fields.client_phone };
        for (const t of ALL_TOKENS) state[t] = fields.placeholders[t] || "";
        return state;
    };

    const processAICommand = async (command: string) => {
        setIsThinking(true);
        setAiResponse("Let me look at the agreement...");
        try {
            const { response, changes, suggestions } = await callLegalAI(command, aiState(), AGREEMENT_TITLE, AI_GUIDANCE);
            setAiResponse(response || "I've reviewed the request.");
            // only placeholder values, plan and phone may change; clause wording never does
            const allowed: Record<string, string> = {};
            for (const [k, v] of Object.entries(changes || {})) {
                if (typeof v !== "string") continue;
                if (k === "plan" && !ALL_PLANS.some((t) => t.name === v)) continue;
                if (k === "plan" || k === "client_phone" || ALL_TOKENS.has(k)) allowed[k] = v;
            }
            if (Object.keys(allowed).length > 0) setPendingChanges(allowed);
            if (Array.isArray(suggestions) && suggestions.length > 0) setAiSuggestions(suggestions);
            if (response && isConversational) speak(response);
        } catch (error: any) {
            console.error("AI Assistant Error:", error);
            setAiResponse("I'm sorry, I couldn't connect to the AI. Please check your internet connection.");
            toast({ title: "AI Error", description: error.message, variant: "destructive" });
        } finally {
            setIsThinking(false);
        }
    };

    const applyPendingChanges = () => {
        if (!pendingChanges) return;
        setFields((prev) => {
            const next = { ...prev, placeholders: { ...prev.placeholders } };
            for (const [k, v] of Object.entries(pendingChanges)) {
                if (k === "plan") next.plan = v;
                else if (k === "client_phone") next.client_phone = v;
                else next.placeholders[k] = v;
            }
            return next;
        });
        setPendingChanges(null);
        setAiResponse("Changes applied.");
        toast({ title: "Applied", description: "Agreement details updated." });
    };

    const handleAISubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiInput.trim()) return;
        processAICommand(aiInput);
        setAiInput("");
    };

    // ---------------------------------------------------------------- output
    const safeName = () =>
        `Lead_Generation_Services_Agreement_${clientLabel.replace(/[\s/\\:*?"<>|]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "Client"}_${Date.now()}`;

    const download = (blob: Blob, fileName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "Downloaded", description: fileName });
    };

    // House-style HTML (src/lib/contract/renderHtml.ts) is the single rendering of the agreement:
    // preview iframe, Print (vector PDF via the browser) and the attached/downloaded PDF all use it.
    const houseHtml = (f: AgreementFields) => renderAgreementHtml(resolveAgreement(f), f, { logoSrc: contractLogo });
    const previewHtml = useMemo(() => houseHtml(fields), [fields]);
    const clientFields = (): AgreementFields => ({ ...fields, include_notes: false }); // email + save: never internal notes

    const loadInFrame = async (html: string, width = 794) => {
        const frame = document.createElement("iframe");
        frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:1200px;border:0;visibility:hidden;`;
        document.body.appendChild(frame);
        await new Promise<void>((resolve) => { frame.onload = () => resolve(); frame.srcdoc = html; });
        const fdoc = frame.contentDocument!;
        await Promise.all(Array.from(fdoc.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
        if ((fdoc as any).fonts?.ready) await (fdoc as any).fonts.ready;
        return frame;
    };

    // Browsers cannot print to a PDF file without a dialog, so the downloadable / attachable PDF is a
    // compressed raster of the same house HTML (about 1-2 MB). For a small vector PDF use "Print" here,
    // or scripts/export-contract-pdf.mjs (headless Chrome, ~450 KB).
    const renderPdf = async (f: AgreementFields) => {
        const frame = await loadInFrame(houseHtml(f));
        try {
            const page = frame.contentDocument!.querySelector(".page") as HTMLElement;
            frame.style.visibility = "visible";
            return await generateSmartPDF(page, { scale: 1.05, quality: 0.55 });
        } finally {
            document.body.removeChild(frame);
        }
    };

    const printVector = async () => {
        const frame = await loadInFrame(previewHtml);
        frame.contentWindow!.focus();
        frame.contentWindow!.print();
        setTimeout(() => frame.remove(), 60000);
    };
    const handleDownload = async (kind: "pdf" | "word") => {
        try {
            setIsGenerating(true);
            toast({ title: kind === "pdf" ? "Generating PDF..." : "Generating Word..." });
            const suffix = fields.include_notes ? "_INTERNAL-NOTES" : "";
            if (kind === "word") download(await buildContractDocx(doc, { logoUrl: contractLogo }), `${safeName()}${suffix}.docx`);
            else download((await renderPdf(fields)).output("blob"), `${safeName()}${suffix}.pdf`);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const requestConfirm = (action: "save" | "email") => {
        if (action === "email" && !recipientEmail.trim()) {
            toast({ title: "Email required", description: "Add a recipient email under Dispatch first.", variant: "destructive" });
            return;
        }
        setConfirmAction(action);
    };

    // Runs only from the confirm dialog: nothing is saved or sent without an explicit click.
    const saveOrSend = async (action: "save" | "email") => {
        setConfirmAction(null);
        try {
            setIsGenerating(true);
            toast({ title: action === "email" ? "Preparing email..." : "Saving..." });
            const pdfBlob = (await renderPdf(clientFields())).output("blob");
            const fileName = `${safeName()}.pdf`;
            const filePath = `contracts/${fileName}`;
            const { error: uploadError } = await supabase.storage.from("admin-documents").upload(filePath, pdfBlob, { upsert: false, contentType: "application/pdf" });
            if (uploadError) throw uploadError;

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error: dbError } = await supabase.from("admin_documents").insert({
                    name: fileName,
                    description: `${AGREEMENT_TITLE} for ${clientLabel}`,
                    file_path: filePath,
                    file_type: "pdf",
                    file_size: pdfBlob.size,
                    category: "contracts",
                    uploaded_by: user.id,
                    content_data: { template_version: doc.templateVersion, fields: clientFields() } as any,
                });
                if (dbError) throw dbError;
                fetchHistory();
            }

            if (action === "email") {
                const greeting = placeholder("[CLIENT SIGNATORY NAME]") || placeholder("[CLIENT FULL NAME]") || "Sir or Madam";
                const emailBody =
                    `<p>Dear ${greeting},</p>` +
                    `<p>Please find attached the ${EMAIL_SUBJECT}.</p>` +
                    `<p>Let us know if anything needs to change before signing.</p><br/>${getContractEmailSignature()}`;
                const { error: fnError } = await supabase.functions.invoke("send-communication", {
                    body: {
                        channel: "email",
                        recipient_contact: recipientEmail.trim(),
                        recipient_type: selectedBrokerId ? "broker" : "lead",
                        broker_id: selectedBrokerId || undefined,
                        subject: EMAIL_SUBJECT,
                        content: emailBody,
                        attachments: [{ content: await blobToBase64(pdfBlob), filename: fileName, type: "application/pdf" }],
                    },
                });
                if (fnError) throw new Error("Failed to send email. Ensure the edge function is deployed.");
                toast({ title: "Draft sent", description: `Sent to ${recipientEmail.trim()} and saved to the library.` });
            } else {
                toast({ title: "Saved to Library" });
            }
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const adjustZoom = (delta: number) => setZoom((prev) => Math.max(0.3, Math.min(1.5, prev + delta)));
    const unfilledOthers = OTHER_TOKENS.filter((t) => !placeholder(t));
    const suggestable = unfilledOthers.filter((t) => suggestedValue(t) !== null);

    const fieldInput = (f: (typeof PRIMARY_FIELDS)[number]) => {
        const value = placeholder(f.token);
        const missing = !value.trim();
        const ring = missing ? "border-amber-500/40" : "border-white/10";
        if (f.options)
            return (
                <Select value={value || undefined} onValueChange={(v) => setPlaceholder(f.token, v)}>
                    <SelectTrigger className={`bg-slate-950/50 ${ring} h-9 text-sm`}><SelectValue placeholder="Choose..." /></SelectTrigger>
                    <SelectContent>{f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
            );
        return (
            <Input
                type={f.date ? "date" : f.email ? "email" : "text"}
                value={value}
                placeholder={f.hint}
                onChange={(e) => setPlaceholder(f.token, e.target.value)}
                className={`bg-slate-950/50 ${ring} h-9 text-sm`}
            />
        );
    };

    return (
        <div className="relative -m-4 sm:-m-6 lg:-m-8 h-[calc(100vh-64px)] flex flex-col font-sans animate-in fade-in duration-500 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Contract Generator</h1>
                        <p className="text-slate-400 text-sm">{AGREEMENT_TITLE} · {doc.templateVersion}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="border-pink-500/20 text-slate-300" onClick={() => requestConfirm("email")} disabled={isGenerating}><Mail className="mr-2 h-4 w-4" />Email draft</Button>
                    <Button variant="outline" className="border-white/10 text-slate-300" onClick={() => requestConfirm("save")} disabled={isGenerating}><Save className="mr-2 h-4 w-4" />Save</Button>
                    <Button variant="outline" className="border-white/10 text-slate-300" onClick={printVector} disabled={isGenerating} title="Print, or save as a small vector PDF"><Printer className="mr-2 h-4 w-4" />Print</Button>
                    <Button onClick={() => handleDownload("pdf")} disabled={isGenerating} className="bg-pink-600 hover:bg-pink-700"><Download className="mr-2 h-4 w-4" />Download PDF</Button>
                    <Button onClick={() => handleDownload("word")} disabled={isGenerating} className="bg-pink-600 hover:bg-pink-700"><FileText className="mr-2 h-4 w-4" />Download Word</Button>
                </div>
            </div>

            <div className="flex flex-row flex-1 overflow-hidden gap-0 min-h-0">
                <div style={{ width: sidebarWidth, minWidth: 280, maxWidth: 640, flexShrink: 0 }} className="h-full flex flex-col gap-4 overflow-hidden">
                    <Card className="bg-slate-900/50 border-white/5 flex-1 overflow-y-auto custom-scrollbar">
                        <CardContent className="p-6 space-y-6">
                            <BrokerSelector onSelect={handleBrokerSelect} />

                            {doc.warnings.length > 0 && (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 space-y-1">
                                    <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Template and pricing disagree</p>
                                    {doc.warnings.map((w) => <p key={w}>{w}</p>)}
                                </div>
                            )}

                            <div className="space-y-3">
                                <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Plan</h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {ALL_PLANS.map((t) => (
                                        <button
                                            key={t.tier_code}
                                            type="button"
                                            onClick={() => setFields((prev) => ({ ...prev, plan: t.name }))}
                                            className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs font-medium ${fields.plan === t.name ? "border-pink-500 bg-pink-500/10 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span>{t.name}</span>
                                                <span className="opacity-70 font-normal">{zar(t.price_zar)}{isPilot(t) ? " once-off" : ""} · {t.committed_leads} leads · {zar(perLead(t))}/lead</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-500">Flat fee per 30-day cycle, excl. VAT. Never linked to policies, premiums or sales. Pilot is a once-off introductory cycle for first-time clients. Pick the plan yourself; it is never chosen from desired leads.</p>
                            </div>

                            <Separator className="bg-white/5" />

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Client details</h3>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${doc.unfilled.length ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                                        {doc.unfilled.length ? `${doc.unfilled.length} unfilled` : "All filled"}
                                    </span>
                                </div>
                                {PRIMARY_FIELDS.map((f) => (
                                    <div key={f.token} className="space-y-1">
                                        <label className="text-[10px] text-slate-500 uppercase font-bold">{f.label}</label>
                                        {fieldInput(f)}
                                    </div>
                                ))}
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Phone <span className="normal-case font-normal">(CRM only; the agreement has no client phone line)</span></label>
                                    <Input value={fields.client_phone} onChange={(e) => setFields((prev) => ({ ...prev, client_phone: e.target.value }))} className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                                </div>
                            </div>

                            <details className="group rounded-xl border border-white/5 bg-slate-950/30 p-3">
                                <summary className="cursor-pointer text-xs font-bold text-slate-300 uppercase tracking-widest">
                                    Other placeholders ({unfilledOthers.length} of {OTHER_TOKENS.length} unfilled)
                                </summary>
                                <div className="mt-3 space-y-3">
                                    {suggestable.length > 0 && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="w-full border-white/10 text-slate-300 text-xs"
                                            onClick={() => setFields((prev) => {
                                                const p = { ...prev.placeholders };
                                                for (const t of suggestable) p[t] = suggestedValue(t)!;
                                                return { ...prev, placeholders: p };
                                            })}
                                        >
                                            Accept {suggestable.length} suggested defaults ({suggestable.slice(0, 3).join(" ")}{suggestable.length > 3 ? " ..." : ""})
                                        </Button>
                                    )}
                                    {OTHER_TOKENS.map((t) => (
                                        <div key={t} className="space-y-1">
                                            <label className="text-[10px] text-slate-500 font-bold break-words">{tokenLabel(t)}</label>
                                            <Input value={placeholder(t)} onChange={(e) => setPlaceholder(t, e.target.value)} className={`bg-slate-950/50 h-8 text-xs ${placeholder(t) ? "border-white/10" : "border-amber-500/40"}`} />
                                        </div>
                                    ))}
                                </div>
                            </details>

                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-bold text-slate-300">Internal: attorney notes</p>
                                    <p className="text-[10px] text-slate-500">[LAWYER REVIEW] notes in the preview and your own downloads only. Never in Save or Email.</p>
                                </div>
                                <Switch checked={fields.include_notes} onCheckedChange={(v) => setFields((prev) => ({ ...prev, include_notes: v }))} />
                            </div>

                            <Separator className="bg-white/5" />
                            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest">Dispatch</h3>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Recipient Email</label>
                                <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="client@company.co.za" className="bg-slate-950/50 border-white/10 h-9 text-sm" />
                            </div>

                            <Card className="bg-[#151719]/80 backdrop-blur-xl border border-white/5 shadow-2xl overflow-hidden shrink-0 rounded-2xl">
                                <CardContent className="p-4 space-y-4">
                                    <p className="text-[10px] text-slate-500">The assistant can explain clauses and fill details. It cannot change the agreement's wording.</p>
                                    {(aiResponse || isThinking) && (
                                        <div className="animate-in slide-in-from-bottom-2 duration-300">
                                            <div className="flex gap-3">
                                                <div className="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0"><Bot className="h-3.5 w-3.5 text-pink-500" /></div>
                                                <div className="flex-1 space-y-2">
                                                    {isThinking ? (
                                                        <div className="flex gap-1 items-center py-1">
                                                            <div className="w-1.5 h-1.5 bg-pink-500/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                            <div className="w-1.5 h-1.5 bg-pink-500/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                            <div className="w-1.5 h-1.5 bg-pink-500/50 rounded-full animate-bounce" />
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-slate-200 leading-relaxed font-medium">{aiResponse}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {pendingChanges && (
                                                <div className="mt-3 ml-9 space-y-2">
                                                    <ul className="text-[11px] text-slate-400 space-y-0.5">
                                                        {Object.entries(pendingChanges).map(([k, v]) => <li key={k}><span className="text-slate-500">{k}:</span> {v}</li>)}
                                                    </ul>
                                                    <div className="flex gap-2">
                                                        <Button size="sm" onClick={applyPendingChanges} className="flex-1 bg-pink-600 hover:bg-pink-700 h-9 text-[11px] font-bold rounded-xl">Apply</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setPendingChanges(null)} className="h-9 w-9 p-0 rounded-xl hover:bg-white/5 text-slate-400"><X className="h-4 w-4" /></Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {aiSuggestions.length > 0 && !isThinking && (
                                        <div className="flex flex-wrap gap-2">
                                            {aiSuggestions.map((s, idx) => (
                                                <button key={idx} type="button" onClick={() => { setAiInput(s); processAICommand(s); }} className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 rounded-full px-3 py-1.5 transition-all duration-200">{s}</button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="relative mt-2 bg-black/40 rounded-2xl border border-white/5 p-1.5 focus-within:border-pink-500/30">
                                        <form onSubmit={handleAISubmit} className="flex items-center gap-1">
                                            <div className="flex items-center gap-0.5 px-2 text-slate-500"><Paperclip className="h-4 w-4" /></div>
                                            <Input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask about the agreement..." className="bg-transparent border-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-9 text-slate-200 placeholder:text-slate-600 shadow-none px-1" />
                                            <div className="flex items-center gap-1 pr-1">
                                                <Button type="button" size="icon" variant="ghost" onClick={() => setIsConversational(!isConversational)} className={`h-8 w-8 rounded-xl ${isConversational ? "bg-pink-500/20 text-pink-500" : "text-slate-500 hover:text-slate-200"}`} title="Conversational Mode">
                                                    <AudioLines className={`h-4 w-4 ${isSpeaking ? "animate-pulse scale-110" : ""}`} />
                                                </Button>
                                                <Button type="button" size="icon" variant="ghost" onClick={toggleListening} className={`h-8 w-8 rounded-xl ${isListening ? "bg-red-500/20 text-red-500" : "text-slate-500 hover:text-slate-200"}`} title="Voice Input">
                                                    <Mic className={`h-4 w-4 ${isListening ? "animate-pulse" : ""}`} />
                                                </Button>
                                                <Button type="submit" size="icon" disabled={!aiInput.trim() || isThinking} className={`h-8 w-8 rounded-xl ${aiInput.trim() ? "bg-white text-black hover:bg-white/90" : "bg-white/5 text-slate-700"}`}>
                                                    <SendHorizonal className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </CardContent>
                            </Card>

                            {history.length > 0 && (
                                <div className="space-y-3 mt-6">
                                    <h3 className="font-bold text-slate-100 text-sm uppercase tracking-widest flex items-center gap-2"><Save className="h-4 w-4 text-pink-400" />Saved History</h3>
                                    <div className="space-y-2">
                                        {history.map((h, idx) => (
                                            <div key={idx} className="bg-slate-950/40 p-3 rounded-xl border border-white/5 flex flex-col gap-1 text-sm">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-medium text-slate-200 truncate pr-2">{h.name}</span>
                                                    <a href={supabase.storage.from("admin-documents").getPublicUrl(h.file_path).data.publicUrl} target="_blank" rel="noreferrer" className="text-pink-400 hover:text-pink-300 shrink-0 bg-pink-400/10 px-2 py-0.5 rounded whitespace-nowrap text-xs">View PDF</a>
                                                </div>
                                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{new Date(h.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div onMouseDown={handleDividerMouseDown} className="w-1.5 flex-shrink-0 cursor-col-resize bg-white/5 hover:bg-pink-500/40 active:bg-pink-500/60 transition-colors duration-150 relative" title="Drag to resize">
                    <div className="absolute inset-y-0 -left-1 -right-1" />
                </div>

                <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 rounded-xl border border-white/5 overflow-hidden relative group">
                    <div className="absolute top-4 right-4 z-50 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-full flex items-center px-4 py-1.5 shadow-2xl space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => adjustZoom(-0.1)}><ZoomOut className="h-4 w-4" /></Button>
                        <span className="text-[10px] font-mono font-bold text-slate-500">{Math.round(zoom * 100)}%</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => adjustZoom(0.1)}><ZoomIn className="h-4 w-4" /></Button>
                        <Separator orientation="vertical" className="h-3 bg-white/10" />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => setZoom(0.55)}><Monitor className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => setZoom(1.0)}><Maximize className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex-1 overflow-auto p-12 flex justify-center items-start custom-scrollbar">
                        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} className="shrink-0 ring-1 ring-white/5 shadow-2xl">
                            <iframe
                                title="Agreement preview"
                                srcDoc={previewHtml}
                                style={{ width: "210mm", height: previewHeight, border: 0, display: "block", background: "#fff" }}
                                onLoad={(e) => {
                                    const d = e.currentTarget.contentDocument;
                                    if (d) setPreviewHeight(d.documentElement.scrollHeight + 8);
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <AlertDialog open={confirmAction !== null} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
                <AlertDialogContent className="max-w-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmAction === "email" ? "Send this draft?" : "Save this agreement?"}</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3 text-sm">
                                {confirmAction === "email" && (
                                    <p>To <b>{recipientEmail.trim()}</b> · subject "{EMAIL_SUBJECT}". The PDF is also saved to the library.</p>
                                )}
                                <p>{AGREEMENT_TITLE} {doc.templateVersion} · {doc.tier.name} Plan ({zar(doc.tier.price_zar)}, {doc.tier.committed_leads} leads) · client copy (no internal notes, no drafting banner).</p>
                                {doc.unfilled.length > 0 ? (
                                    <div>
                                        <p className="font-semibold text-amber-600">{doc.unfilled.length} placeholder{doc.unfilled.length === 1 ? " is" : "s are"} still unfilled and will show highlighted:</p>
                                        <ul className="mt-1 max-h-40 overflow-y-auto text-xs list-disc pl-5">
                                            {doc.unfilled.map((t) => <li key={t}>{t}</li>)}
                                        </ul>
                                    </div>
                                ) : (
                                    <p className="text-emerald-600 font-semibold">Every placeholder is filled.</p>
                                )}
                                {doc.warnings.length > 0 && <p className="text-red-600 font-semibold">{doc.warnings.length} template/pricing mismatch warning(s) are open.</p>}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => confirmAction && saveOrSend(confirmAction)}>
                            {confirmAction === "email" ? (doc.unfilled.length ? "Send draft anyway" : "Send draft") : doc.unfilled.length ? "Save anyway" : "Save"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ContractGenerator;

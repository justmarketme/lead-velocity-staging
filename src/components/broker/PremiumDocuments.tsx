import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    FileText,
    Search,
    Download,
    Eye,
    Filter,
    ChevronRight,
    Clock,
    CheckCircle2,
    FileBadge2,
    Lock,
    ArrowDownToLine,
    CreditCard,
    FileSignature,
    TrendingUp,
    Sparkles
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface PremiumDocumentsProps {
    documents: any[];
}

const PremiumDocuments = ({ documents }: PremiumDocumentsProps) => {
    const [filter, setFilter] = useState("all");

    const categories = [
        { id: 'all', label: 'All Intel', count: 12 },
        { id: 'proposals', label: 'Strategy Deck', count: 4 },
        { id: 'invoices', label: 'Settlements', count: 3 },
        { id: 'contracts', label: 'Executed Deeds', count: 5 },
    ];

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-right-10 duration-1000 pb-20">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-pink-500/10 p-2.5 rounded-2xl">
                            <Lock className="w-5 h-5 text-pink-500" />
                        </div>
                        <span className="text-[10px] font-black uppercase text-pink-500 tracking-[0.3em] bg-pink-500/5 px-4 py-1.5 rounded-full border border-pink-500/10">Secure Vault Session</span>
                    </div>
                    <h2 className="text-5xl font-black text-white tracking-tighter italic uppercase">Vault & Ledger</h2>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Access high-level documentation and financial settlements</p>
                </div>
                <div className="relative w-full xl:w-96 group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700 group-focus-within:text-pink-500 transition-colors" />
                    <Input
                        placeholder="Search encrypted records..."
                        className="bg-[#020617] border-white/5 pl-14 h-16 text-sm rounded-[24px] focus:ring-pink-500/20 focus:border-pink-500/50 transition-all font-medium italic shadow-2xl"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                {/* Sidebar categories */}
                <div className="lg:col-span-1 space-y-3">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setFilter(cat.id)}
                            className={`w-full flex items-center justify-between px-6 py-5 rounded-[24px] transition-all duration-500 group relative overflow-hidden ${filter === cat.id
                                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-2xl shadow-pink-600/30'
                                : 'bg-[#020617] text-slate-500 hover:text-white border border-white/5 hover:border-white/10'
                                }`}
                        >
                            <div className="flex items-center gap-4 relative z-10">
                                <FolderIcon category={cat.id} active={filter === cat.id} />
                                <span className="text-[10px] font-black uppercase tracking-widest">{cat.label}</span>
                            </div>
                            <span className={`text-[10px] font-black px-4 py-1.5 rounded-full relative z-10 ${filter === cat.id ? 'bg-white/20' : 'bg-white/[0.03] border border-white/5'}`}>
                                {cat.count}
                            </span>
                            {filter === cat.id && <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />}
                        </button>
                    ))}

                    <div className="pt-10">
                        <Card className="bg-[#020617] border-white/5 overflow-hidden rounded-[40px] shadow-2xl relative group">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                            <CardContent className="p-8 space-y-6">
                                <div className="flex items-center gap-3 text-indigo-400 font-black text-[10px] uppercase tracking-[0.3em] italic">
                                    <Sparkles className="w-4 h-4" /> Military Grade
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed font-bold italic">
                                    Documents are audited for compliance and secured with <span className="text-white">AES-256</span> encryption protocols.
                                </p>
                                <Button className="w-full bg-white text-black hover:bg-slate-200 font-black h-12 rounded-2xl text-[9px] uppercase tracking-widest">
                                    Audit Manifest
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Document Grid/List */}
                <div className="lg:col-span-3 space-y-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Card key={i} className="bg-[#020617] border-white/5 hover:border-pink-500/20 transition-all duration-500 group overflow-hidden rounded-[32px] shadow-2xl">
                            <CardContent className="p-0">
                                <div className="flex items-center p-6 sm:p-8">
                                    <div className={`p-4 rounded-3xl mr-6 transition-all duration-700 shadow-2xl group-hover:scale-110 group-hover:rotate-6 ${i % 2 === 0 ? 'bg-pink-500/10' : i % 3 === 0 ? 'bg-blue-500/10' : 'bg-emerald-500/10'
                                        }`}>
                                        {i % 2 === 0 ? <FileBadge2 className="w-8 h-8 text-pink-500" /> : i % 3 === 0 ? <CreditCard className="w-8 h-8 text-blue-500" /> : <FileSignature className="w-8 h-8 text-emerald-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-3 mb-2">
                                            <h4 className="text-xl font-black text-white truncate italic uppercase tracking-tighter">
                                                {i % 2 === 0 ? `NEO_STRATEGY_DECK_${i}.LV` : i % 3 === 0 ? `SETTLEMENT_TX_${i}.INV` : `EXECUTED_NDA_CLIENT_${i}.DOC`}
                                            </h4>
                                            {i === 1 && <Badge className="bg-pink-600 text-[9px] font-black uppercase tracking-widest px-3 h-5 rounded-full shadow-lg shadow-pink-500/20 animate-pulse">Classified</Badge>}
                                        </div>
                                        <div className="flex items-center gap-6 text-[10px] text-slate-600 font-black uppercase tracking-widest">
                                            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 2h 45m</span>
                                            <Separator orientation="vertical" className="h-3 bg-white/5" />
                                            <span>2.4 MB</span>
                                            <Separator orientation="vertical" className="h-3 bg-white/5" />
                                            <span className="text-pink-500 italic">Level 4 Access</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-6">
                                        <Button variant="ghost" size="icon" className="h-14 w-14 text-slate-700 hover:text-white hover:bg-white/5 rounded-2xl border border-white/5 group-hover:border-pink-500/30 transition-all">
                                            <Eye className="w-5 h-5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-14 w-14 text-slate-700 hover:text-white hover:bg-white/5 rounded-2xl border border-white/5 group-hover:border-emerald-500/30 transition-all">
                                            <ArrowDownToLine className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    <Button variant="outline" className="w-full border-dashed border-white/5 bg-white/[0.01] text-slate-600 hover:text-white hover:bg-white/5 py-12 h-auto rounded-[32px] font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-700 shadow-2xl">
                        Retrieve Archive History
                    </Button>
                </div>
            </div>
        </div>
    );
};

const FolderIcon = ({ category, active }: { category: string, active: boolean }) => {
    const color = active ? 'text-white' : 'text-slate-700 group-hover:text-pink-400 transition-colors';
    switch (category) {
        case 'proposals': return <TrendingUp size={22} className={color} />;
        case 'invoices': return <CreditCard size={22} className={color} />;
        case 'contracts': return <FileSignature size={22} className={color} />;
        default: return <FileText size={22} className={color} />;
    }
};

export default PremiumDocuments;

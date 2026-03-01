import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface BrokerOnboardingResponse {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    phone_number: string | null;
    firm_name: string | null;
    company_name: string | null;
    desired_leads_weekly: number;
    // adding other fields that might be used
    [key: string]: any;
}

interface BrokerSelectorProps {
    onSelect: (broker: BrokerOnboardingResponse) => void;
}

export const BrokerSelector = ({ onSelect }: BrokerSelectorProps) => {
    const { toast } = useToast();
    const [brokers, setBrokers] = useState<BrokerOnboardingResponse[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchBrokers = async () => {
            try {
                const { data, error } = await supabase
                    .from('broker_onboarding_responses')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                if (data) setBrokers(data);
            } catch (error: any) {
                toast({
                    title: "Error fetching brokers",
                    description: error.message,
                    variant: "destructive",
                });
            } finally {
                setIsLoading(false);
            }
        };

        fetchBrokers();
    }, [toast]);

    return (
        <div className="space-y-2 mb-6 p-4 bg-slate-800/50 rounded-xl border border-white/5">
            <label className="text-[10px] text-pink-400 uppercase font-black tracking-widest block">
                Auto-Fill from Onboarding
            </label>
            {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 h-10 px-3 bg-[#020617] border border-white/10 rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading brokers...
                </div>
            ) : (
                <Select onValueChange={(id) => {
                    const selected = brokers.find(b => b.id === id);
                    if (selected) onSelect(selected);
                }}>
                    <SelectTrigger className="w-full bg-[#020617] border border-white/10 text-slate-200 focus:ring-pink-500/50">
                        <SelectValue placeholder="Select a broker..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-slate-200">
                        <SelectGroup>
                            <SelectLabel className="text-slate-400 text-xs uppercase font-bold tracking-wider">Recent Submissions</SelectLabel>
                            {brokers.map((broker) => {
                                const name = broker.full_name || 'Anonymous';
                                const company = broker.firm_name || broker.company_name || 'Independent';
                                return (
                                    <SelectItem key={broker.id} value={broker.id} className="focus:bg-slate-800 focus:text-white cursor-pointer">
                                        <div className="flex flex-col">
                                            <span className="font-bold">{company}</span>
                                            <span className="text-[10px] text-slate-400">{name} - {broker.desired_leads_weekly} leads/wk</span>
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            )}
        </div>
    );
};

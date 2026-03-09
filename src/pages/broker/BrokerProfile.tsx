import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import BrokerLayout from "@/components/broker/BrokerLayout";

const BrokerProfile = () => {
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const { toast } = useToast();

    const fetchProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();
            setProfile(data);
        }
        setLoading(false);
    };

    const generateCode = async (type: 'discord' | 'telegram') => {
        setGenerating(true);
        try {
            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const column = type === 'discord' ? 'discord_pairing_code' : 'telegram_pairing_code';

            const { error } = await supabase
                .from("profiles")
                .update({ [column]: newCode })
                .eq("id", profile.id);

            if (error) throw error;

            setProfile({ ...profile, [column]: newCode });
            toast({
                title: "Code Generated",
                description: `Use this code with the /auth command in ${type === 'discord' ? 'Discord' : 'Telegram'}.`,
            });
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    if (loading) return <BrokerLayout><div>Loading profile...</div></BrokerLayout>;

    return (
        <BrokerLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                <h1 className="text-4xl font-bold gradient-text">Profile Settings</h1>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Discord Integration */}
                    <Card className="bg-card/50 backdrop-blur border-border/50">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#5865F2]/10 rounded-lg">
                                    <MessageSquare className="w-5 h-5 text-[#5865F2]" />
                                </div>
                                <CardTitle>Discord Admin Integration</CardTitle>
                            </div>
                            <CardDescription>
                                Pair Discord to manage leads and receive notifications.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {profile?.discord_enabled ? (
                                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <span className="font-semibold text-sm">Discord Connected</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">Discord Pairing Code</label>
                                        <div className="flex items-center justify-between">
                                            <span className="text-3xl font-mono font-black tracking-widest">{profile?.discord_pairing_code || "------"}</span>
                                            <Button variant="outline" size="sm" onClick={() => generateCode('discord')} disabled={generating} className="gap-2">
                                                <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
                                                {profile?.discord_pairing_code ? 'Regenerate' : 'Generate'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Telegram Integration */}
                    <Card className="bg-card/50 backdrop-blur border-border/50">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#0088cc]/10 rounded-lg">
                                    <MessageSquare className="w-5 h-5 text-[#0088cc]" />
                                </div>
                                <CardTitle>Telegram Admin Integration</CardTitle>
                            </div>
                            <CardDescription>
                                Pair Telegram to receive alerts and chat with Einstein.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {profile?.telegram_enabled ? (
                                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <span className="font-semibold text-sm">Telegram Connected</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2">Telegram Pairing Code</label>
                                        <div className="flex items-center justify-between">
                                            <span className="text-3xl font-mono font-black tracking-widest">{profile?.telegram_pairing_code || "------"}</span>
                                            <Button variant="outline" size="sm" onClick={() => generateCode('telegram')} disabled={generating} className="gap-2">
                                                <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
                                                {profile?.telegram_pairing_code ? 'Regenerate' : 'Generate'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Account Details */}
                    <Card className="bg-card/50 backdrop-blur border-border/50 md:col-span-2">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <ShieldCheck className="w-5 h-5 text-primary" />
                                </div>
                                <CardTitle>Account Details</CardTitle>
                            </div>
                            <CardDescription>Your basic account information.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Full Name</label>
                                <p className="font-semibold">{profile?.full_name || 'Not set'}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Role</label>
                                <p className="font-semibold capitalize text-primary">Broker Elite</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </BrokerLayout>
    );
};

export default BrokerProfile;

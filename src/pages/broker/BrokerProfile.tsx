import type { Tables } from "@/integrations/supabase/types";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import BrokerLayout from "@/components/broker/BrokerLayout";
import OwnBroker from "@/components/broker/smc/OwnBroker";
import IntroCardEditor from "@/components/broker/smc/IntroCardEditor";

const BrokerProfile = () => {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);

    const fetchProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from("profiles")
                .select("*")
                .eq("user_id", user.id) // profiles keys on user_id; profiles.id is its own uuid (not always the auth id)
                .maybeSingle();
            setProfile(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    if (loading) return <BrokerLayout><div>Loading profile...</div></BrokerLayout>;

    return (
        <BrokerLayout>
            <div className="max-w-6xl mx-auto space-y-8">
                <h1 className="text-3xl sm:text-4xl font-bold gradient-text">Profile Settings</h1>

                <section id="intro-card" aria-label="Your intro card">
                    <OwnBroker>{(b, reload) => <IntroCardEditor broker={b} reload={reload} />}</OwnBroker>
                </section>

                <div className="grid md:grid-cols-2 gap-8">
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

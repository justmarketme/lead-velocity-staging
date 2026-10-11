import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import BrokerLayout from "@/components/broker/BrokerLayout";

const BrokerProfile = () => {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<any>(null);

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

    useEffect(() => {
        fetchProfile();
    }, []);

    if (loading) return <BrokerLayout><div>Loading profile...</div></BrokerLayout>;

    return (
        <BrokerLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                <h1 className="text-4xl font-bold gradient-text">Profile Settings</h1>

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

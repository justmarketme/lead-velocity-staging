import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Zap } from "lucide-react";

/**
 * EMERGENCY SETUP PAGE
 * This page uses the current 'Public access' RLS policies to initialize the first admin.
 * Once done, this route should be removed for security.
 */
const Setup = () => {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const adminEmail = "howzit@leadvelocity.co.za";

    const handleSetup = async () => {
        setLoading(true);
        try {
            // 1. SIGN UP (this works with anon key)
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: adminEmail,
                password: password,
                options: {
                    data: { full_name: "Lead Velocity Admin", user_type: "admin" }
                }
            });

            if (signUpError && !signUpError.message.includes("already registered")) {
                throw signUpError;
            }

            const userId = signUpData?.user?.id || (await supabase.auth.signInWithPassword({ email: adminEmail, password })).data?.user?.id;

            if (!userId) {
                // If it already exists, let's try to just promote it
                const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                    email: adminEmail,
                    password: password
                });
                if (signInError) throw new Error("Could not verify user. Ensure the password matches if account exists.");
            }

            // 2. PROMOTE - This only works if Public RLS is active on user_roles
            const { error: roleError } = await supabase
                .from('user_roles')
                .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });

            if (roleError) throw roleError;

            toast({
                title: "Setup Complete!",
                description: `Admin account for ${adminEmail} is now ready. You can log in!`,
            });

        } catch (error: any) {
            toast({
                title: "Setup Failed",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
            <Card className="max-w-md w-full border-rose-500/50 bg-slate-900 shadow-2xl">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center mb-2">
                        <ShieldAlert className="text-rose-500 h-6 w-6" />
                    </div>
                    <CardTitle className="text-white text-2xl font-black">Emergency Admin Setup</CardTitle>
                    <CardDescription className="text-slate-400">
                        Initializes the admin account for <span className="text-white font-bold">{adminEmail}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                        <p className="text-amber-500 text-xs leading-relaxed font-medium">
                            <Zap className="h-3 w-3 inline mr-1" />
                            This tool uses public registration rules to promote your email to Admin. Use a secure, permanent password.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-white text-xs uppercase font-black">Set Admin Password</Label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-slate-950 border-white/10 text-white"
                            />
                        </div>

                        <Button
                            onClick={handleSetup}
                            disabled={loading || !password}
                            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest h-12 shadow-lg shadow-rose-900/20"
                        >
                            {loading ? "Initializing..." : "Run Setup Now"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default Setup;

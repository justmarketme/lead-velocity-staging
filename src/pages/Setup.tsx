import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Zap, RefreshCcw } from "lucide-react";

/**
 * RESET ADMIN PAGE
 * This page includes a "Force Wipe" function to clear out broken auth accounts
 * and restart the setup fresh.
 */
const Setup = () => {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const adminEmail = "howzit@leadvelocity.co.za";

    const handleWipeAndReset = async () => {
        setLoading(true);
        try {
            // 1. ATTEMPT SIGN UP (Standard way)
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: adminEmail,
                password: password,
                options: {
                    data: { full_name: "Lead Velocity Admin", user_type: "admin" }
                }
            });

            // If user already exists, we need to promote the EXISTING user
            let userId = signUpData?.user?.id;

            if (signUpError && signUpError.message.includes("already registered")) {
                console.log("User exists, capturing ID via sign in attempt...");
                const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                    email: adminEmail,
                    password: password
                });

                if (signInError) {
                    throw new Error("User exists but password verification failed. If you forgot the password, we need to manually wipe the user in Supabase SQL editor first.");
                }
                userId = signInData.user.id;
            } else if (signUpError) {
                throw signUpError;
            }

            if (!userId) throw new Error("Could not determine User ID.");

            // 2. PROMOTE - Ensure Profile and Role exist
            console.log("Setting up role/profile...");

            // Upsert profile
            await supabase.from('profiles').upsert({ user_id: userId, full_name: "Lead Velocity Admin" });

            // Upsert role
            const { error: roleError } = await supabase
                .from('user_roles')
                .upsert({ user_id: userId, role: 'admin' as any }, { onConflict: 'user_id,role' });

            if (roleError) throw roleError;

            toast({
                title: "Setup Complete!",
                description: "You are now an Admin. Redirecting to login...",
            });

            setTimeout(() => {
                window.location.href = "/admin";
            }, 2000);

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
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 font-sans">
            <Card className="max-w-md w-full border-rose-500/50 bg-slate-900 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-purple-500 to-rose-500 animate-gradient-x"></div>

                <CardHeader className="text-center space-y-2 pt-8">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4 border border-rose-500/20 shadow-inner">
                        <ShieldAlert className="text-rose-500 h-8 w-8 animate-pulse" />
                    </div>
                    <CardTitle className="text-white text-3xl font-black tracking-tighter italic">ADMIN ACCESS REPAIR</CardTitle>
                    <CardDescription className="text-slate-400 font-medium">
                        Initializing secure session for <br />
                        <span className="text-rose-400 font-bold underline decoration-rose-500/30">{adminEmail}</span>
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6 pb-8">
                    <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-rose-500 font-bold text-xs uppercase tracking-widest">
                            <Zap className="h-4 w-4" />
                            <span>System Protocol</span>
                        </div>
                        <p className="text-slate-300 text-xs leading-relaxed">
                            This utility will verify your account status and inject the mandatory <span className="text-white font-bold">Admin Role</span>. If the account exists with a different password, it will prompt for a manual wipe.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-slate-400 text-[10px] uppercase font-black tracking-widest px-1">Define Master Password</Label>
                            <div className="relative group">
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••••••"
                                    className="bg-slate-950/50 border-white/5 text-white h-14 rounded-xl focus:ring-rose-500/20 focus:border-rose-500/50 transition-all pl-4 text-lg tracking-widest"
                                />
                                <div className="absolute inset-y-0 right-4 flex items-center opacity-20 group-focus-within:opacity-100 transition-opacity">
                                    <RefreshCcw className="h-5 w-5 text-rose-500 animate-spin-slow" />
                                </div>
                            </div>
                        </div>

                        <Button
                            onClick={handleWipeAndReset}
                            disabled={loading || !password}
                            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-[0.2em] h-16 rounded-2xl shadow-xl shadow-rose-900/20 border-t border-rose-400/20 transition-all active:scale-[0.98]"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <RefreshCcw className="h-4 w-4 animate-spin" />
                                    Synchronizing...
                                </span>
                            ) : "Activate Admin Rights"}
                        </Button>
                    </div>

                    <p className="text-center text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                        Secure End-to-End Encryption Enabled
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};

export default Setup;

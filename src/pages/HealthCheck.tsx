
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity, Shield, AlertTriangle } from "lucide-react";

export default function BuildHealthDashboard() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async () => {
        const { data, error } = await supabase
            .from('system_logs' as any)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            setLogs(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
        const subscription = supabase
            .channel('system_logs_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_logs' }, () => {
                fetchLogs();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    return (
        <div className="p-8 space-y-6 bg-slate-950 min-h-screen text-slate-100">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Activity className="text-blue-500" /> System Health Monitor
                </h1>
                <Badge variant="outline" className="border-blue-500 text-blue-500 animate-pulse">
                    Live Feed Active
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-slate-400">Total Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{logs.length}</div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-slate-400">Failures</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">
                            {logs.filter(l => l.event_type.includes('ERROR') || l.event_type.includes('FAILURE')).length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium text-slate-400">Success Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">
                            {logs.length > 0 ? Math.round((logs.filter(l => l.event_type.includes('SUCCESS') || l.event_type.includes('INVOKED')).length / logs.length) * 100) : 0}%
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                <CardHeader className="bg-slate-800/50">
                    <CardTitle className="text-lg">Real-time Event Stream</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="text-slate-400">Event</TableHead>
                                <TableHead className="text-slate-400">Message</TableHead>
                                <TableHead className="text-slate-400">Timestamp</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={3} className="text-center py-8">Monitoring sync...</TableCell></TableRow>
                            ) : logs.map((log) => (
                                <TableRow key={log.id} className="border-slate-800 hover:bg-slate-800/30">
                                    <TableCell>
                                        <Badge className={
                                            log.event_type.includes('ERROR') ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                log.event_type.includes('SUCCESS') ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                    "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                        }>
                                            {log.event_type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{log.message}</TableCell>
                                    <TableCell className="text-slate-500 text-xs">
                                        {new Date(log.created_at).toLocaleTimeString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

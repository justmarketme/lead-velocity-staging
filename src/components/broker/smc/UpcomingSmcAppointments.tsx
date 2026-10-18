/**
 * Upcoming SortMyCover appointments (appointments.brand_id IS NOT NULL) with their Teams join links (appointments.join_url,
 * written by W05 when it books into the broker's Outlook). RLS: a broker reads only his own appointments.
 * Before the crm-nurture migrations are applied the SMC columns do not exist; the query then fails and nothing is shown.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, Phone, CalendarClock } from "lucide-react";
import { fmtDay, fmtTime, methodLabel, smcDb } from "@/lib/smc";
import { safeJoinUrl } from "@/lib/smcMsConnect";
import { Tone, toneClasses } from "./tone";

export interface SmcAppt {
  id: string;
  appointment_date: string;
  ends_at: string | null;
  method: string | null;
  status: string | null;
  join_url: string | null;
  allocated_at?: string | null;
  client?: { first_name: string | null; last_name: string | null } | null;
}

const UPCOMING = ["booked", "confirmed", "rescheduled"];

/** The broker's next SortMyCover appointments (from 1 hour ago so a call in progress keeps its link). */
export function useUpcomingSmcAppointments(brokerId: string | null | undefined, limit = 10) {
  const [rows, setRows] = useState<SmcAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!brokerId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await smcDb.from("appointments")
        .select("id, appointment_date, ends_at, method, status, join_url, allocated_at, client:leads(first_name, last_name)")
        .eq("broker_id", brokerId).not("brand_id", "is", null).in("status", UPCOMING)
        .gte("appointment_date", since).order("appointment_date", { ascending: true }).limit(limit);
      if (!alive) return;
      setUnavailable(!!error);
      setRows(error ? [] : ((data as unknown as SmcAppt[]) || []));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [brokerId, limit]);
  return { rows, loading, unavailable };
}

export const clientName = (a: SmcAppt) => [a.client?.first_name, a.client?.last_name].filter(Boolean).join(" ") || "SortMyCover client";

export default function UpcomingSmcAppointments({ brokerId, tone = "theme", hideWhenEmpty = false }: { brokerId: string | null | undefined; tone?: Tone; hideWhenEmpty?: boolean }) {
  const c = toneClasses(tone);
  const { rows, loading, unavailable } = useUpcomingSmcAppointments(brokerId);
  if (unavailable || (hideWhenEmpty && !loading && rows.length === 0)) return null;
  return (
    <Card className={`min-w-0 ${c.card}`}>
      <CardHeader className={tone === "elite" ? "p-6 pb-3" : undefined}>
        <CardTitle className={`text-lg flex items-center gap-2 ${c.title}`}><CalendarClock className="h-5 w-5" />Upcoming SortMyCover calls</CardTitle>
        <CardDescription className={c.muted}>Booked by clients or allocated by Lead Velocity. Join from here or from the calendar invite.</CardDescription>
      </CardHeader>
      <CardContent className={tone === "elite" ? "p-6 pt-0" : undefined}>
        {loading ? <p className={`text-sm ${c.muted}`}>Loading…</p> : rows.length === 0 ? (
          <p className={`text-sm ${c.muted}`}>No calls booked yet. New bookings appear here with their Teams link.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((a) => {
              const link = safeJoinUrl(a.join_url);
              const isTeams = (a.method || "teams") === "teams";
              return (
                <li key={a.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="w-[7.5rem] shrink-0">
                    <div className="font-semibold">{fmtDay(a.appointment_date)}</div>
                    <div className={`text-sm ${c.muted}`}>{fmtTime(a.appointment_date)}{a.ends_at ? `–${fmtTime(a.ends_at)}` : ""}</div>
                  </div>
                  <div className="flex-1 min-w-[9rem]">
                    <div className="font-medium break-words">{clientName(a)}</div>
                    <div className={`text-xs ${c.muted}`}>{methodLabel(a.method) || "Teams"} call · {a.status === "confirmed" ? "client confirmed" : a.status === "rescheduled" ? "rescheduled" : "booked"}</div>
                  </div>
                  {link ? (
                    <Button asChild size="sm" className={c.primary}>
                      <a href={link} target="_blank" rel="noopener noreferrer"><Video className="mr-1.5 h-4 w-4" />{isTeams ? "Join Teams call" : "Join call"}</a>
                    </Button>
                  ) : (
                    <span className={`text-xs inline-flex items-center gap-1 ${c.muted}`}>
                      {isTeams ? <><Video className="h-3.5 w-3.5" />{a.allocated_at ? "Teams link: see your invite" : "Teams link on its way"}</> : <><Phone className="h-3.5 w-3.5" />No link needed</>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

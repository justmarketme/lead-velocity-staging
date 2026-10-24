import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

// public.lead_optins is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const OPTIN_CHANNELS = {
  facebook_ad: "Facebook ad",
  instagram_ad: "Instagram ad",
  facebook_post: "Facebook post",
  instagram_post: "Instagram post",
  website: "Website",
  whatsapp_direct: "WhatsApp direct",
  voice_call: "Phone call (Lindi)",
} as const;

export type OptinChannel = keyof typeof OPTIN_CHANNELS;

export interface LeadOptin {
  id: string;
  lead_id: string;
  channel: OptinChannel;
  ref_code: string | null;
  via_source: string | null;
  via_campaign: string | null;
  via_content: string | null;
  referral_source_type: string | null;
  referral_source_id: string | null;
  referral_source_url: string | null;
  referral_headline: string | null;
  ctwa_clid: string | null;
  consent_version: string;
  consent_text: string | null;
  opener_text: string | null;
  message_sid: string | null;
  received_at: string;
  recorded_by: string | null;
}

export const channelLabel = (c: string) => OPTIN_CHANNELS[c as OptinChannel] ?? c;

/** Every lead's opt-in channels, first opt-in first. `available` is false until the lead_optins migration is applied. */
export function useLeadOptinChannels() {
  const [available, setAvailable] = useState(false);
  const [byLead, setByLead] = useState<Map<string, OptinChannel[]>>(new Map());

  const reload = async () => {
    const { data, error } = await db
      .from("lead_optins")
      .select("lead_id, channel")
      .order("received_at", { ascending: true });
    if (error) {
      setAvailable(false);
      return;
    }
    const map = new Map<string, OptinChannel[]>();
    for (const row of data as Pick<LeadOptin, "lead_id" | "channel">[]) {
      const list = map.get(row.lead_id) ?? [];
      if (!list.includes(row.channel)) list.push(row.channel);
      map.set(row.lead_id, list);
    }
    setByLead(map);
    setAvailable(true);
  };

  useEffect(() => {
    reload();
  }, []);

  return { available, byLead, reload };
}

const Field = ({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) =>
  value ? (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs break-all" : "font-medium break-words"}>{value}</p>
    </div>
  ) : null;

/** The lead's permanent opt-in record: where each consent came from. */
export function LeadOptinPanel({ leadId }: { leadId: string }) {
  const [optins, setOptins] = useState<LeadOptin[] | null>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    setOptins(null);
    db.from("lead_optins")
      .select("*")
      .eq("lead_id", leadId)
      .order("received_at", { ascending: true })
      .then(({ data, error }: { data: LeadOptin[] | null; error: unknown }) => {
        if (error) setAvailable(false);
        setOptins(data ?? []);
      });
  }, [leadId]);

  if (!available || optins === null) return null;

  return (
    <div className="p-4 bg-muted/50 rounded-lg border space-y-4">
      <p className="text-sm text-muted-foreground">Opt-in</p>
      {optins.length === 0 && <p className="text-sm">No opt-in recorded for this lead.</p>}
      {optins.map((o) => {
        const via = [o.via_source, o.via_campaign, o.via_content].filter(Boolean).join(" / ");
        return (
          <div key={o.id} className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4 first:border-t-0 first:pt-0">
            <div className="col-span-2 flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/5">{channelLabel(o.channel)}</Badge>
              <span className="text-sm text-muted-foreground">
                {format(new Date(o.received_at), "d MMM yyyy, HH:mm")}
              </span>
            </div>
            <Field label="Campaign / ad" value={via || o.referral_headline} />
            <Field label="Page" value={o.ref_code} mono />
            <Field label="Ad or post ID" value={o.referral_source_id} mono />
            <Field label="Ad or post link" value={o.referral_source_url} mono />
            <Field label="Consent version" value={o.consent_version} mono />
            <Field label="Message SID" value={o.message_sid} mono />
            {o.consent_text && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Consent wording</p>
                <p className="text-sm">{o.consent_text}</p>
              </div>
            )}
            {o.opener_text && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Message sent</p>
                <p className="text-sm italic">{o.opener_text}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

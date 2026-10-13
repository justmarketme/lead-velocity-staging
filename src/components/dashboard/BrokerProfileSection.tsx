/**
 * Admin broker drawer: what the broker filled in himself in his portal (practice name, FSP number, business WhatsApp number,
 * intro-card photo, bio, languages). Same brokers columns the portal, routing and the intro card read.
 */
import { useEffect, useState } from "react";
import { BadgeCheck, Camera, IdCard, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fmtZa } from "@/lib/brokerProfile";
import { MEDIA_BUCKET } from "@/lib/smc";
import { bioReviewView, fspVerifiedBadge, readBioReview } from "@/lib/brokerReview";

interface ProfileRow {
  firm_name: string | null; fsp_number: string | null; whatsapp_number: string | null; whatsapp_confirmed_at: string | null;
  headshot_url: string | null; bio_short: string | null; languages: string[] | null;
  fsp_check: { status?: string; checked_at?: string; register_name?: string; register_status?: string } | null; fsp_verified_at: string | null;
  onboarding_progress: Record<string, unknown> | null;
}

const mediaKey = (stored: string | null) => {
  if (!stored) return null;
  const s = stored.replace(/^\/+/, "");
  return s.startsWith(`${MEDIA_BUCKET}/`) ? s.slice(MEDIA_BUCKET.length + 1) : /^https?:/i.test(s) ? null : s;
};

export default function BrokerProfileSection({ brokerId }: { brokerId: string }) {
  const [row, setRow] = useState<ProfileRow | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setRow(null); setPhoto(null);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("brokers")
        .select("firm_name, fsp_number, whatsapp_number, whatsapp_confirmed_at, headshot_url, bio_short, languages, fsp_check, fsp_verified_at, onboarding_progress").eq("id", brokerId).maybeSingle();
      if (!alive) return;
      setRow((data as ProfileRow) || null);
      const key = mediaKey((data as ProfileRow | null)?.headshot_url || null);
      if (key) {
        const s = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(key, 600);
        if (alive) setPhoto(s.data?.signedUrl || null);
      }
    })();
    return () => { alive = false; };
  }, [brokerId]);

  if (!row) return null;
  const missing = <span className="text-muted-foreground">Not entered yet</span>;
  const fspBadge = fspVerifiedBadge(row.fsp_check, row.fsp_verified_at);
  const review = readBioReview(row.onboarding_progress);
  const reviewView = bioReviewView(review, row.bio_short);
  const REVIEW_TEXT = { suggestion: "Suggested bio sent: waiting for the broker", rewrite: "Broker is rewriting his bio: intro card waits", approved: "Broker approved the suggested bio" } as const;
  return (
    <div>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><IdCard className="h-4 w-4 text-primary" /> From the broker's portal</h3>
      <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 flex gap-3">
        {photo ? <img src={photo} alt="Broker headshot" className="h-16 w-16 rounded-full object-cover shrink-0" />
          : <div className="h-16 w-16 rounded-full bg-white/5 grid place-items-center shrink-0"><Camera className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></div>}
        <div className="min-w-0 text-sm space-y-1">
          <p><span className="text-muted-foreground">Practice:</span> {row.firm_name || missing}</p>
          <p><span className="text-muted-foreground">FSP:</span> {row.fsp_number || missing}</p>
          {fspBadge && <p className="inline-flex items-center gap-1 text-xs text-emerald-400"><BadgeCheck className="h-3.5 w-3.5" />{fspBadge.title}</p>}
          <p className="flex flex-wrap items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">WhatsApp:</span>
            {row.whatsapp_number ? fmtZa(row.whatsapp_number) : missing}
            {row.whatsapp_confirmed_at && <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><BadgeCheck className="h-3.5 w-3.5" />confirmed {format(new Date(row.whatsapp_confirmed_at), "d MMM")}</span>}
          </p>
          <p className="break-words"><span className="text-muted-foreground">Bio:</span> {row.bio_short || missing}</p>
          {reviewView && <p className={`text-xs ${reviewView === "approved" ? "text-emerald-400" : "text-amber-300"}`}>{REVIEW_TEXT[reviewView]}</p>}
          {row.languages?.length ? <p><span className="text-muted-foreground">Languages:</span> {row.languages.join(", ")}</p> : null}
        </div>
      </div>
    </div>
  );
}

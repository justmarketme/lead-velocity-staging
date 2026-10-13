/**
 * The intro card Lead Velocity prepared for the broker (latest broker_media row, kind 'card'). The broker does not build
 * it; his only action is "Approve my intro card", which runs broker_approve_intro_card() (migration 20261013160000):
 * broker_media approved/current, brokers.intro_card_url, onboarding_progress.card and an audit row, in one call.
 * Until approved the card shows greyed out with "Waiting for your approval"; once approved, full colour.
 * Approval is refused (and the button disabled) while a Lead Velocity bio review is open or declined.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerPreview } from "@/lib/brokerPreview";
import { profileErrorText } from "@/lib/brokerProfile";
import { MEDIA_BUCKET } from "@/lib/smc";
import { cardApprovable, fmtDaySast, readBioReview } from "@/lib/brokerReview";

interface CardRow { id: string; version: number; url: string | null; state: string | null; is_current: boolean; approved_at: string | null }

/** https links are used as they are; anything else is a path in the private broker-media bucket and gets signed. */
async function viewUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (/^https?:/i.test(url)) return url;
  const key = url.replace(/^\/+/, "").replace(new RegExp(`^${MEDIA_BUCKET}/`), "");
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(key, 600);
  return data?.signedUrl || null;
}

export default function PreparedIntroCard({ broker, reload }: {
  broker: { id: string; contact_person?: string | null; onboarding_progress?: unknown }; reload: () => unknown;
}) {
  const preview = !!useBrokerPreview();
  const [card, setCard] = useState<CardRow | null | undefined>(undefined);
  const [src, setSrc] = useState<string | null>(null);
  const [tick, setTick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("broker_media").select("id, version, url, state, is_current, approved_at")
        .eq("broker_id", broker.id).eq("kind", "card").not("state", "in", "(superseded,rejected)")
        .order("version", { ascending: false }).limit(1);
      const row = ((data as CardRow[] | null) || [])[0] || null;
      if (!alive) return;
      setCard(row);
      const u = row?.state === "processing" ? null : await viewUrl(row?.url || null);
      if (alive) setSrc(u);
    })();
    return () => { alive = false; };
  }, [broker.id, nonce]);

  if (card === undefined) return null;
  const approved = !!card && card.state === "approved" && card.is_current && !!card.approved_at;
  const bioOk = cardApprovable(readBioReview(broker.onboarding_progress));

  async function approve() {
    if (!card) return;
    setErr(null);
    if (preview) { setErr("Preview only: nothing is saved."); return; }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("broker_approve_intro_card", { p_media_id: card.id });
    setBusy(false);
    if (error) {
      const code = (error as { code?: string }).code;
      setErr(code === "PGRST202" ? "Approving cards isn't switched on yet. Please email howzit@leadvelocity.co.za." : profileErrorText(error));
      return;
    }
    setNonce((n) => n + 1);
    void reload();
  }

  return (
    <section aria-labelledby="prep-card-h" className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 space-y-3 text-slate-200">
      <h3 id="prep-card-h" className="text-base font-bold text-white">Your intro card</h3>
      {!card || card.state === "processing" ? (
        <p className="text-sm text-slate-400">Lead Velocity is preparing your intro card from your details. It appears here for you to approve.</p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {src ? (
              <img src={src} alt={`Intro card for ${broker.contact_person || "you"}`}
                className={`block w-full aspect-square object-cover transition-[filter,opacity] duration-500 ${approved ? "" : "grayscale opacity-50"}`} />
            ) : (
              <div className="aspect-square grid place-items-center text-sm text-slate-500">Card image unavailable</div>
            )}
            {!approved && (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-slate-950/80 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                Waiting for your approval
              </span>
            )}
          </div>
          {approved ? (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Approved{card.approved_at ? ` on ${fmtDaySast(card.approved_at)}` : ""}. Clients get this card on WhatsApp when they book a call with you.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-400">Lead Velocity prepared this card. Check your name, practice, FSP number and bio, then approve it.</p>
              {!bioOk && <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">Approve your bio first (see "Your bio needs a small change"). Then you can approve your card.</p>}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={tick} disabled={!bioOk} onChange={(e) => setTick(e.target.checked)} />
                I have read my card and the disclosure wording. I approve both.
              </label>
              {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
              <button type="button" onClick={approve} disabled={!tick || !bioOk || busy || preview}
                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}Approve my intro card
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

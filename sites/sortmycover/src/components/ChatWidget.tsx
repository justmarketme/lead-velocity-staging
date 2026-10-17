/* Floating WhatsApp chat widget (Jono, 17 Oct 2026): the launcher sits bottom right on every page; any WhatsApp CTA opens it with
   that CTA's context. The panel introduces Lindi (AI booking assistant, a person on request), asks for the approved consent tick
   (spec: consent before WhatsApp), then opens WhatsApp with the prefilled opener. WhatsApp is the
   only way to book (no booking on the site). Rendered closed on the server; nothing here hides content or a disclosure. */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CHAT_EVENT, CONSENT_TEXT, WA_LABEL, WA_STEPS, openChat, waHref, type ChatContext } from "@/lib/whatsapp";
import { provider } from "@/lib/site";
import { beacon } from "@/lib/api";
import { beaconOff, track } from "@/lib/pixel";

/** WhatsApp glyph (Simple Icons, CC0). */
export function WaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** A WhatsApp call to action. With JavaScript it opens the widget (consent first); without, it links straight to WhatsApp
    (the prefilled opener carries the consent statement in the person's own words). */
export function WhatsAppCta({ ctx, className = "btn", children }: { ctx: ChatContext; className?: string; children?: ReactNode }) {
  return (
    <a href={waHref(ctx)} className={`${className} btn-wa`} onClick={(e) => { e.preventDefault(); openChat(ctx); }}>
      <WaIcon size={18} />{children ?? WA_LABEL}
    </a>
  );
}

export default function ChatWidget({ base }: { base: ChatContext }) {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [nudge, setNudge] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const hid = useId();
  const c = ctx ?? base;

  const show = useCallback((next: ChatContext | null) => { setCtx(next); setNudge(false); setOpen(true); }, []);
  const hide = useCallback(() => { setOpen(false); launcher.current?.focus(); }, []);

  useEffect(() => {
    const on = (e: Event) => show((e as CustomEvent<ChatContext>).detail ?? null);
    window.addEventListener(CHAT_EVENT, on);
    return () => window.removeEventListener(CHAT_EVENT, on);
  }, [show]);
  useEffect(() => { setCtx(null); setOpen(false); }, [base.ref, base.topic]); // a new page: back to that page's context, closed
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    if (panel.current && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      const el = panel.current;
      import("@/lib/motion").then((m) => m.popIn(el));
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, hide]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!agreed) { e.preventDefault(); setNudge(true); return; }
    track("Contact", { content_name: c.ref });
    beacon(c.ref, "wa", undefined, beaconOff);
  };

  const with_ = c.wills ? `a ${provider.name} consultant` : "an authorised adviser";
  return (
    <div className="chat" data-chat>
      {open && (
        <div ref={panel} id="chat-panel" className="chat-panel" role="dialog" aria-modal="false" aria-labelledby={hid}>
          <div className="chat-head">
            <span className="chat-avatar" aria-hidden="true">L</span>
            <div className="chat-who">
              <p id={hid} className="chat-name">Lindi from SortMyCover</p>
              <p className="chat-sub">Books your 30-minute call on WhatsApp</p>
            </div>
            <button ref={close} type="button" className="chat-x" aria-label="Close the chat panel" onClick={hide}>×</button>
          </div>
          <div className="chat-body">
            <p className="chat-bubble">Hi, I'm Lindi. Tell me what you need help with, and I'll find a time for a 30-minute call with {with_}.</p>
            <div className="chat-expect">
              <p className="chat-expect-h">What happens on WhatsApp</p>
              <ol>{WA_STEPS(c.wills).map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
            <p className="chat-ai">Lindi is SortMyCover's AI booking assistant. You can ask for a person at any time, or reply STOP to stop.</p>
            <label className={"chat-consent" + (nudge && !agreed ? " is-missing" : "")}>
              <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setNudge(false); }} />
              <span>{CONSENT_TEXT} <a href="/privacy/">Privacy notice</a></span>
            </label>
            {nudge && !agreed && <p className="chat-err" role="alert">Please tick the box to continue on WhatsApp.</p>}
            <a className="btn btn-wa chat-go" href={waHref(c)} target="_blank" rel="noopener noreferrer" aria-disabled={!agreed} onClick={go}>
              <WaIcon size={18} />Open WhatsApp
            </a>
            <p className="chat-fine">Please do not send ID numbers, bank details or health details in a message.</p>
          </div>
        </div>
      )}
      <button ref={launcher} type="button" className="chat-launch" aria-expanded={open} aria-controls="chat-panel" onClick={() => (open ? hide() : show(null))}>
        <WaIcon size={26} /><span className="chat-launch-label">Chat to Lindi</span>
      </button>
    </div>
  );
}

/* Tiny inline-markup renderer for content strings: [label](/internal/) [label](https://external) **bold**. Nothing else is parsed. */
import { Fragment, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { contextFor, openChat, waHref, type ChatContext } from "./whatsapp";

const TOKEN = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;
const WA = /^https:\/\/wa\.me\//;

export interface InlinePart { kind: "text" | "link" | "bold"; text: string; href?: string }

export function parseInline(s: string): InlinePart[] {
  return s.split(TOKEN).filter(Boolean).map((p): InlinePart => {
    const l = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (l) return { kind: "link", text: l[1], href: l[2] };
    const b = /^\*\*([^*]+)\*\*$/.exec(p);
    if (b) return { kind: "bold", text: b[1] };
    return { kind: "text", text: p };
  });
}

/** Plain text of a content string (markup removed). Used for word counts and tests. */
export function plainText(s: string): string {
  return parseInline(s).map((p) => p.text).join("");
}

/** A WhatsApp link in content goes through the page's chat context, like every other WhatsApp CTA: the widget (consent first)
    with JavaScript, the page's prefilled opener and Ref without. `chat` overrides the context of the page's path (campaign pages). */
export function Inline({ text, chat }: { text: string; chat?: ChatContext }) {
  const pathname = useLocation().pathname;
  return (
    <>
      {parseInline(text).map((p, i): ReactNode => {
        if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
        if (p.kind === "link") {
          if (WA.test(p.href!)) {
            const c = chat ?? contextFor(pathname);
            return <a key={i} href={waHref(c)} onClick={(e) => { e.preventDefault(); openChat(c); }}>{p.text}</a>;
          }
          const external = /^https?:\/\//.test(p.href!);
          return external ? <a key={i} href={p.href} rel="noopener noreferrer">{p.text}</a> : <Link key={i} to={p.href!}>{p.text}</Link>;
        }
        return <Fragment key={i}>{p.text}</Fragment>;
      })}
    </>
  );
}

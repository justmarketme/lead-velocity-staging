/* Tiny inline-markup renderer for content strings: [label](/internal/) [label](https://external) **bold**. Nothing else is parsed. */
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

const TOKEN = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;

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

export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i): ReactNode => {
        if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
        if (p.kind === "link") {
          const external = /^https?:\/\//.test(p.href!);
          return external ? <a key={i} href={p.href} rel="noopener noreferrer">{p.text}</a> : <Link key={i} to={p.href!}>{p.text}</Link>;
        }
        return <Fragment key={i}>{p.text}</Fragment>;
      })}
    </>
  );
}

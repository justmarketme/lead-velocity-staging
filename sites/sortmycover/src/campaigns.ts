import angles from "../config/angles.json";
import { campaignOrigin } from "@/lib/site";

export interface Angle {
  slug: string;
  meta_code: string;
  host: boolean;
  hold?: boolean;
  /** Host label override where the slug breaks the S28 word list (spec C.3). */
  host_label?: string;
  status?: string;
  ad_hook: string;
  legacy_ad_hook: string;
  h1: string;
  sub: string;
  title: string;
  description: string;
}

export const ANGLES: Angle[] = angles as Angle[];
export const angleBySlug = (slug: string) => ANGLES.find((a) => a.slug === slug);
/** Host label rule from the subdomain research (D10): lowercase letters, digits, hyphens; starts with a letter; ends with letter or digit; no double hyphen. */
export const HOST_LABEL = /^[a-z]([a-z0-9-]{0,28}[a-z0-9])?$/;
/** Host label: equals the slug unless host_label overrides it (c13-check-not-buy -> looking-is-not-buying). */
export const hostLabel = (a: Pick<Angle, "slug" | "host_label">) => a.host_label || a.slug;
export const campaignHost = (a: Pick<Angle, "slug" | "host_label">) => new URL(campaignOrigin(hostLabel(a))).host;
/** Held angles are built under /_c/ but get no host route (reserved, not attached). */
export const isAttached = (a: Angle) => a.host && !a.hold;
/** Labels never used as campaign hosts (spec C.3) and words a label may not contain (rule S28). */
export const RESERVED_LABELS = ["www", "mail", "autodiscover", "hello", "howzit", "api", "n8n", "app", "go", "link", "staging", "stage", "preview", "dev", "cdn", "status", "ftp", "smtp", "imap", "pop", "webmail"];
export const LABEL_BANNED = /quote|compare|cheap|best|rates|claims|fsca|insurer|bank/;
export const campaignPath = (slug: string, view: "landing" | "thanks") => (view === "landing" ? `/_c/${slug}/` : `/_c/${slug}/thanks/`);

/** "*word*" = amber emphasis, "\n" = line break. Returns segments for rendering without innerHTML. */
export function h1Segments(h1: string): { text: string; em: boolean; br?: boolean }[] {
  const out: { text: string; em: boolean; br?: boolean }[] = [];
  h1.split("\n").forEach((line, i) => {
    if (i > 0) out.push({ text: "", em: false, br: true });
    line.split(/(\*[^*]+\*)/).filter(Boolean).forEach((p) => {
      const m = /^\*([^*]+)\*$/.exec(p);
      out.push({ text: m ? m[1] : p, em: !!m });
    });
  });
  return out;
}
export const h1Plain = (h1: string) => h1.replace(/\*/g, "").replace(/\n/g, " ");

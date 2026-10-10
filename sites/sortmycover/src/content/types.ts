/** Content model for /learn/ articles and the glossary. Pure data, no JSX, so it renders the same on server and client and is testable. */

/** Inline markup allowed inside any `text` / `items[]` string: [label](/internal/path/) or [label](https://external), **bold**. Nothing else. */
export type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

export interface Source {
  /** Page or document title as shown by the publisher. */
  title: string;
  publisher: string;
  url: string;
  /** Month the page was seen, "YYYY-MM". Shown on the page (rule S15). */
  accessed: string;
  /** What the article takes from it, one short phrase. */
  used_for?: string;
}

export interface Reviewer {
  name: string;
  /** ISO date the person was verified as independent of any broker SortMyCover routes leads to. */
  verified_on: string;
  /** Link to their FSCA register entry. */
  fsca_url: string;
}

export interface ArticleMeta {
  slug: string;
  /** H1. The question or topic, plain words. */
  title: string;
  /** <meta description>, 120-160 characters. */
  description: string;
  /** 1 life events, 2 reading your cover, 3 the call and trust, 4 myths and definitions. */
  hub: 1 | 2 | 3 | 4;
  /** 40-60 words, ends with the scope sentence "This is information, not advice." (rule: B.6 item 3). */
  answer: string;
  datePublished: string; // ISO date
  lastReviewed: string; // ISO date; equals JSON-LD dateModified and sitemap lastmod
  author: { kind: "organization" | "person"; name: string };
  fact_checked_by: string;
  fact_checked_on: string; // ISO date
  /** Only after a real review by someone who is not a broker SortMyCover routes leads to. Absent = no reviewer block. */
  reviewer?: Reviewer;
  sources: Source[];
  /** Ids from config/evidence.json. Required when the body or answer contains any %, multiple of salary, or rand figure. */
  evidence?: string[];
  /** Up to two sibling article slugs (B.6 item 6). */
  related: string[];
  /** Estimated read time in minutes (computed in tests, informational). */
  readMinutes?: number;
}

export interface Article {
  meta: ArticleMeta;
  body: Block[];
}

export interface GlossaryTerm {
  term: string;
  /** one to three sentences, objective, no insurer or brand names, no "you should". */
  definition: string;
  /** optional slug of an article under /learn/ that explains more (only if it is published). */
  see?: string;
}

export interface FaqItem { id: string; q: string; a: string }

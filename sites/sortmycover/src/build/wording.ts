/* Compliance wording scan shared by the tests (rules S1, S2, S4, S9-S16, S25 of research/compliance-sa.md section 5).
   SortMyCover never checks, sorts, reviews, arranges or matches cover; "free" and every other price phrase are never used: copy ends on the call itself (18 Oct 2026). */
export const BANNED: [RegExp, string][] = [
  [/\bfree\b/i, "free"],
  [/\bguarantee/i, "guarantee"],
  [/\bcheapest\b/i, "cheapest"],
  [/\bbest\b/i, "best"],
  [/\bindependent\b/i, "independent"],
  [/\b(we|SortMyCover)\s+(check|sort|review|arrange|match|find|compare|recommend|rank)\b/i, "SortMyCover as subject of check/sort/review/arrange/match"],
  [/\byou (should|need to)\b|\byou must (?!be 18)/i, "you should"], // "You must be 18 or older" is part of FOOTER-v2
  [/2\s?[-–]\s?4\s?[x×]/i, "2-4x salary"],
  [/!/, "exclamation mark"],
  [/\b(regulated|approved) by\b/i, "regulated/approved by"],
  [/\btrusted by\b/i, "trusted by"],
  [/\bthousands of\b/i, "thousands of"],
  // no price wording to clients (Jono, 16 Oct 2026; site 18 Oct): copy ends on the call itself, never on what it costs
  [/\bcosts? (you )?nothing\b/i, "costs nothing"],
  [/\bpays? nothing\b/i, "pay nothing"],
  [/\bno cost\b/i, "no cost"],
  [/\bat no charge\b/i, "at no charge"],
  [/\bfree of charge\b/i, "free of charge"],
];

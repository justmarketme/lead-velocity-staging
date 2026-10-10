/* Compliance wording scan shared by the tests (rules S1, S2, S4, S9-S16, S25 of research/compliance-sa.md section 5).
   SortMyCover never checks, sorts, reviews, arranges or matches cover; "free" is never used (the approved line is "The call costs you nothing."). */
export const BANNED: [RegExp, string][] = [
  [/\bfree\b/i, "free"],
  [/\bguarantee/i, "guarantee"],
  [/\bcheapest\b/i, "cheapest"],
  [/\bbest\b/i, "best"],
  [/\bindependent\b/i, "independent"],
  [/\b(we|SortMyCover)\s+(check|sort|review|arrange|match|find|compare|recommend|rank)\b/i, "SortMyCover as subject of check/sort/review/arrange/match"],
  [/\byou (should|need to|must)\b/i, "you should"],
  [/2\s?[-–]\s?4\s?[x×]/i, "2-4x salary"],
  [/!/, "exclamation mark"],
  [/\b(regulated|approved) by\b/i, "regulated/approved by"],
  [/\btrusted by\b/i, "trusted by"],
  [/\bthousands of\b/i, "thousands of"],
];

/* Blocks shared by the four cover type pages (hub 6). Kept outside articles/ so the content glob never treats it as an article. */
import type { Block } from "./types";

/** Sources: fsca-life-insurance-booklet (consumer rights) and ppr-ltia-cooling-off (rule 4, 31 days). */
export const BEFORE_SIGNING: Block[] = [
  { type: "h2", text: "What happens before and after signing?" },
  {
    type: "p",
    text: "The FSCA's consumer guide says a person can take a policy away to read before signing, ask for the contract to be explained in plain language, and ask an adviser for proof of their qualifications and for full details of fees and commission.",
  },
  {
    type: "p",
    text: "After signing there is a cooling-off period. Under the Policyholder Protection Rules for long-term insurance, a new policy can be cancelled within 31 days of receiving the policy summary or the disclosure information, whichever comes later, as long as nothing has been claimed or paid and no insured event has happened. Premiums are refunded, less the cost of any cover already enjoyed.",
  },
];

export const WHERE_SORTMYCOVER_FITS: Block[] = [
  { type: "h2", text: "Where does SortMyCover fit in?" },
  {
    type: "p",
    text: "SortMyCover does not sell cover, give advice or quote premiums. It books a 30-minute call with an adviser from an FSCA-authorised financial services provider, who can talk about cover for your situation. [How to check an adviser](/learn/how-to-check-an-adviser/) shows how to look them up first, and [what happens on a 30-minute call](/learn/what-happens-on-a-30-minute-call/) describes the call.",
  },
];

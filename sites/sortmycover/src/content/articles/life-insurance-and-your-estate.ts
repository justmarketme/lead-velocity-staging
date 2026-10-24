import type { Block } from "../types";
import { ON_THE_CALL } from "../learn-shared";

/* Sources: config/evidence.json sam-what-is-life-cover, nfo-beneficiary-nomination, master-faq, master-wills, master-guardians-fund,
   sars-estate-duty, sars-estate-duty-guide-buy-sell, sars-deceased-faq, nca-s106, act-wills-act. Cession is explained, with its source, on the home-loan guide this page links to; no bank is named here. Wills facts are
   government-sourced (Master, SARS, the Wills Act). Income tax on a payout is not stated: no SARS page was read on it. */
export const body: Block[] = [
  {
    type: "p",
    text: "Three documents meet when someone dies: the life policy, the will and the estate's account. The search questions show the confusion: does a will override a beneficiary, does the policy form part of the estate, is the payout taxed, who pays the debts. Each document has one job. This page sets out the three jobs using what the Master of the High Court, SARS and the National Financial Ombud publish.",
  },
  {
    type: "p",
    text: "It is information, not advice. SortMyCover does not draft wills, does not give advice and is not a financial services provider.",
  },
  { type: "h2", text: "Who gets the payout: the nomination, not the will" },
  {
    type: "p",
    text: "ASISA's consumer site says a life policy pays either the beneficiaries named on the policy or the estate. The naming is done by a **beneficiary nomination**, a written instruction held by the insurer. The National Financial Ombud, in a case note of February 2025, explains the effect: when there is a valid beneficiary nomination on a policy, the policy does not form part of the estate. The proceeds are paid directly to the beneficiary, which the Ombud notes saves time and money on executor's fees.",
  },
  {
    type: "p",
    text: "A will disposes of the estate. A payout that a valid nomination sends straight to a person never enters the estate, so in general the will does not reach it. The practical consequence is that the nomination needs the same care as the will. In the Ombud's case, a policyholder had signed a new nomination form that his broker never sent on; it was found in a desk drawer after his death. The appeal tribunal held that a nomination has to be communicated to the insurer to count, and the earlier nomination stood.",
  },
  { type: "h2", text: "If there is no nomination" },
  {
    type: "p",
    text: "Without a valid nomination, or if the nominated person has died, the payout goes into the estate. The Master's pages describe what happens next. The executor lodges a liquidation and distribution account within six months of appointment, the account lies open for inspection, and the estate is distributed within two months after that. Debts and the costs of administration are paid before heirs inherit.",
  },
  {
    type: "p",
    text: "One of those costs is the executor's fee. The Master's prescribed fee is **3.5%** of the gross value of the assets, plus 6% of income collected after death, unless the will sets a different fee. A policy paid into the estate forms part of those assets. If an heir is a minor and the will makes no other arrangement, such as a trust, the child's inheritance is paid to the Guardian's Fund, which holds it until the child turns 18 or the age the will sets. [What a will does](/wills/what-a-will-does/) and [the Guardian's Fund](/wills/guardians-fund/) explain both.",
  },
  { type: "h2", text: "Estate duty: a direct payout is not outside it" },
  {
    type: "p",
    text: "Staying out of the estate's administration is not the same as staying out of estate duty. SARS's guide on estate duty says that under section 3(3)(a) of the Estate Duty Act, any amount recoverable under a domestic policy on the life of the deceased is **deemed property** of the deceased. The test is not who owned the policy but whose life was insured, and it applies whether the proceeds go to the estate, to a cessionary or to a nominated beneficiary.",
  },
  {
    type: "p",
    text: "SARS's estate duty page gives the arithmetic. Estate duty is 20% on the first R30 million of the dutiable value of an estate and 25% above that, after an abatement of R3.5 million against the net value. The executor normally pays it from the estate. Where a policy is paid directly to a beneficiary, the estate duty attributable to that policy is payable by the beneficiary, not by the estate. SARS's deceased-estates FAQ adds that what is left to a surviving spouse is deductible under section 4(q), and the SARS guide notes that policy proceeds paid to a surviving spouse qualify for that deduction. Any part of the abatement a person did not use rolls over to the surviving spouse's estate, up to R7 million in total.",
  },
  {
    type: "p",
    text: "In plain words: a policy on the deceased's life counts towards the estate duty calculation whoever receives it, many estates fall under the abatement and pay no duty, and a beneficiary who receives a large payout directly may have a duty bill to settle. Income tax on a payout is a separate question that this page leaves to SARS and the adviser. [Estate duty in South Africa](/learn/estate-duty-south-africa/) has the rates on their own.",
  },
  { type: "h2", text: "What happens to debt" },
  {
    type: "p",
    text: "Debts do not pass to the family, but they are paid before the family inherits. The Master's FAQ sets out the order: the executor settles the estate's debts and costs through the liquidation and distribution account, and heirs receive what remains. A policy paid directly to a beneficiary is outside that account, which is one reason a nomination matters for a household with debt.",
  },
  {
    type: "p",
    text: "Two kinds of policy are built around debt. Under section 106 of the National Credit Act, credit life insurance on a loan is capped at what is still owed and pays towards the loan. And a personal policy can be ceded to a lender, in which case the lender is paid before the people named as beneficiaries, who receive whatever is left; [life cover and a home loan](/learn/life-cover-and-a-home-loan/) sets out what ceding means, with its source. [Estate costs, and why a will does not pay them](/wills/estate-costs-and-a-will/) goes further on the estate's side.",
  },
  { type: "h2", text: "Divorce, copies and other traps" },
  {
    type: "ul",
    items: [
      "**Divorce.** The Master's page says a bequest to a former spouse is deemed revoked if the person dies within three months of the divorce. After three months the will stands as written. A beneficiary nomination is a separate instruction, held by the insurer, and is changed only by telling the insurer.",
      "**Copies.** A copy of a will is not deemed a valid will. The original is what the Master accepts.",
      "**Witnesses.** Under the Wills Act, a person who signs as a witness, or who writes the will, is disqualified from benefiting under it, and being named as executor, trustee or guardian counts as a benefit.",
      "**Out-of-date nominations.** A nomination stays as it was until the insurer is told otherwise.",
    ],
  },
  { type: "h2", text: "Three documents, three jobs" },
  {
    type: "ul",
    items: [
      "**The beneficiary nomination** tells the insurer who is paid. A valid one keeps the payout out of the estate's administration.",
      "**The will** names the heirs, the executor and any guardian or trust, and disposes of the estate.",
      "**The estate's account** pays the debts, the costs, the executor's fee and any estate duty before heirs inherit. A policy on the deceased's life counts for estate duty wherever it is paid.",
    ],
  },
  { type: "h2", text: "Questions a household can take to an adviser" },
  {
    type: "ul",
    items: [
      "Who is named on each policy, and does the insurer hold the current nomination?",
      "Is any policy ceded to a lender, and what would be left for the family after the lender is paid?",
      "Would the estate have enough cash for debts, the executor's fee and estate duty without selling property?",
      "If a child is a beneficiary, is there a trust or guardian arrangement, or would the money go to the Guardian's Fund?",
      "How is a policy paid directly to a beneficiary treated for estate duty in our case?",
      "How are you paid, and does that change if we take a product?",
    ],
  },
  ...ON_THE_CALL("life cover, beneficiary nominations and the estate"),
];

import type { Block } from "../types";
import { ON_THE_CALL } from "../learn-shared";

/* Sources: config/evidence.json cansa-ncr-2024, statssa-p03093-2024, cms-pmb, cms-industry-2024, statssa-mype-2025 (the "about 14%"
   is 9.04m / 63.1m), sam-what-is-severe-illness, sam-severe-illness-conditions, asisa-critical-illness-standard-2025, sam-underwriting.
   Medical schemes and gap cover are described, never recommended; no scheme or insurer is named. */
export const body: Block[] = [
  {
    type: "p",
    text: "\"Does medical aid cover cancer treatment?\" is a question people type at two in the morning. The short answer is that a medical scheme pays for treatment, under its rules. The longer answer is that treatment is only one of the bills a serious diagnosis brings. The bond, the school fees and the income that stops for six months are not medical costs, and a medical scheme is not built to pay them.",
  },
  {
    type: "p",
    text: "This page puts the two kinds of cover side by side, with the South African numbers that explain why the question comes up. It describes medical schemes using the Council for Medical Schemes' own page and does not recommend any scheme, option or product. SortMyCover is not a financial services provider and gives no advice.",
  },
  { type: "h2", text: "How common is a serious diagnosis?" },
  {
    type: "p",
    text: "The Cancer Association of South Africa (CANSA), citing the National Cancer Registry's 2024 report, puts the estimated lifetime risk of a cancer diagnosis at **1 in 7 for men** and **1 in 8 for women**. For single cancers the registry's figures are 1 in 17 for prostate cancer, 1 in 28 for breast cancer and 1 in 39 for cervical cancer. CANSA notes that pathology-based registration under-reports some cancers, so the true figures may be higher.",
  },
  {
    type: "p",
    text: "Stats SA's release on 2024 deaths, published on 22 September 2026, counts 474 366 deaths in that year. The leading underlying natural causes were diabetes (6.1% of deaths), hypertensive diseases (5.5%) and cerebrovascular diseases, which include strokes (5.4%). Neoplasms, the group that includes cancers, were 9.8% of all deaths. Among people aged 45 to 64, diabetes was the leading cause of death at 7.9%.",
  },
  {
    type: "p",
    text: "Those are the conditions at the centre of severe illness cover. ASISA says the original core conditions of these policies are cancer, heart attack, stroke and coronary bypass surgery.",
  },
  { type: "h2", text: "What a medical scheme pays" },
  {
    type: "p",
    text: "A medical scheme pays for health care under its rules and the option the member chose. By law every scheme has to cover the **Prescribed Minimum Benefits** (PMBs). The Council for Medical Schemes describes them as any emergency medical condition, a list of 271 diagnosis-and-treatment pairs, and 26 chronic conditions on the Chronic Disease List. Treatment at the scheme's designated service provider, following its protocols and formularies, is covered in full under the PMB rules. If a member uses a provider outside the designated network, the Council says a co-payment may apply: a percentage, or the difference between the designated provider's tariff and what the other provider charges.",
  },
  {
    type: "p",
    text: "Two things follow. The scheme pays providers, hospitals, doctors and pharmacies, for treatment that falls within its rules. And treatment outside the PMBs, outside the designated network, or above the option's limits can leave a gap that the member pays. Gap cover is a separate short-term product designed around that shortfall; it is mentioned here only so the picture is complete.",
  },
  {
    type: "p",
    text: "Medical schemes also cover a minority of people. Council data reported in June 2026 put the industry at 9.04 million beneficiaries across 70 schemes in 2024. Against Stats SA's 2025 mid-year population estimate of 63.1 million, that is about 14% of the people in the country.",
  },
  { type: "h2", text: "What severe illness cover pays" },
  {
    type: "p",
    text: "Severe illness cover, also sold as dread disease or critical illness cover, pays a **lump sum on diagnosis** of a condition listed in the policy. ASISA's consumer site makes two points that separate it from everything above. Unlike lump-sum disability cover, it can pay even when a full recovery is expected. And the money is the policyholder's to use for anything: a bond, time off work, a spouse who stops working to help, travel to treatment, or costs a scheme does not pay.",
  },
  {
    type: "p",
    text: "The detail is in the condition list. ASISA says policies now list anywhere from under a hundred to about three hundred conditions, each with its own definition and tiered payment levels, which makes policies hard to compare. Many pay only if the person survives a set number of days after diagnosis, often 14 or 28. Since 2025 ASISA's members follow a standard that defines heart attack, cancer, stroke and coronary bypass surgery at four severity levels, from A (most severe) to D (least). Each insurer's quote and policy show what share of the benefit it pays at each level, and a claimant declined under an insurer's own definition can ask for the claim to be assessed against the standard definitions. [Severe illness cover, in plain words](/cover/severe-illness-cover/) explains the lists in more detail.",
  },
  { type: "h2", text: "Side by side" },
  {
    type: "ul",
    items: [
      "**Who gets paid.** A medical scheme pays the providers. Severe illness cover pays the insured person.",
      "**What triggers it.** A scheme pays when treatment is given under its rules. Severe illness cover pays on diagnosis of a listed condition, at the severity level the policy defines.",
      "**What it can be used for.** Scheme benefits are for health care. A severe illness lump sum can be used for anything.",
      "**What it does not do.** A scheme does not replace income or pay the bond. Severe illness cover does not pay hospital accounts unless the policyholder chooses to use it that way.",
      "**How it is priced.** A scheme has monthly contributions set by the option. A policy has premiums set after health questions; a condition that is not disclosed can lead to a claim being rejected.",
    ],
  },
  { type: "h2", text: "Where income protection fits" },
  {
    type: "p",
    text: "An illness that keeps someone off work for months raises a third question: who pays the salary? That is the job of income protection, which pays a monthly amount after a waiting period while the person cannot work, as the policy defines it. [Income protection vs disability cover](/learn/income-protection-vs-disability-cover/) sets the products side by side, and [when sick leave runs out](/learn/when-sick-leave-runs-out/) walks through the timeline.",
  },
  { type: "h2", text: "What this page does not do" },
  {
    type: "p",
    text: "It does not say whether any household needs severe illness cover, a particular scheme option or gap cover, and it does not compare products. Advice about a particular person's cover is work for an authorised financial services provider. SortMyCover's own scope is the long-term cover: life, disability, severe illness and income protection, and introductions to one authorised adviser who can talk about them.",
  },
  { type: "h2", text: "Questions a household can take to an adviser" },
  {
    type: "ul",
    items: [
      "Which conditions does this policy list, and at which severity levels does it pay the full amount?",
      "Is there a survival period, and how long is it?",
      "Does my group scheme at work include a severe illness benefit, and does it end if I leave?",
      "What would a lump sum need to cover in our household: the bond, lost income, a partner's time off?",
      "How does this policy sit alongside our medical scheme option, and what falls between them?",
      "How are you paid, and does that change if we take a product?",
    ],
  },
  ...ON_THE_CALL("severe illness cover and the other kinds of cover"),
];

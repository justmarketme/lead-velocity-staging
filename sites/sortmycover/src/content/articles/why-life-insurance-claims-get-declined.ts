import type { Block } from "../types";
import { ON_THE_CALL } from "../learn-shared";

/* Sources: config/evidence.json asisa-death-claims-2025 (every claims figure), asisa-lt-stats-2025 (lapses), sam-underwriting,
   sam-what-is-life-cover, fsca-life-insurance-booklet, ppr-ltia-cooling-off. No claim turnaround time is stated (no SA primary
   source publishes one) and no grace-period length is quoted (the PPR rule was not re-read by 24 Oct 2026). No insurer is named. */
export const body: Block[] = [
  {
    type: "p",
    text: "Behind the search \"can life insurance refuse to pay out\" is a plain worry: that a family will pay premiums for years and then be turned away. The published numbers are better than that worry suggests, and the declines that do happen cluster around a short list of causes. Knowing the list is most of the protection.",
  },
  {
    type: "p",
    text: "This page uses the claims statistics the Association for Savings and Investment South Africa (ASISA) released on 10 June 2026 for the 2025 year, and ASISA's own consumer explanations. It names no insurer and gives no advice. SortMyCover is not a financial services provider.",
  },
  { type: "h2", text: "How many claims are paid?" },
  {
    type: "p",
    text: "In 2025, South Africa's life insurers processed 1 080 930 death claims and paid 1 016 794 of them, which is **94.1%**, worth R44.2 billion. The figure covers every kind of risk policy. For claims against life policies on their own, the rate was **96%**: 254 377 claims paid, worth R29.3 billion. Universal life policies were at 99.9%. ASISA says that for the past five years the average payout rate for life and funeral policies has stayed between 94% and 96%.",
  },
  {
    type: "p",
    text: "So the starting point for the question is this: roughly nineteen out of twenty claims against life policies were paid. The rest is about why the remaining ones were not.",
  },
  { type: "h2", text: "The most common reason: material non-disclosure" },
  {
    type: "p",
    text: "ASISA's release puts it in one sentence: when a claim against a life insurance policy is declined, it is most often due to material non-disclosure. In plain words, the person who took out the policy did not tell the insurer something the insurer asked about and would have used to decide whether to offer cover, or on what terms.",
  },
  {
    type: "p",
    text: "ASISA's consumer site explains where this comes from. Fully underwritten cover asks detailed medical and family-history questions, and may need tests. Limited underwriting asks a few questions. The outcome can be cover on standard terms, cover with exclusions, a higher premium, or no cover. Limited-underwriting policies often exclude pre-existing conditions, and some have a waiting period before deaths from natural causes are covered. A condition that is not disclosed can lead to a claim being rejected.",
  },
  {
    type: "p",
    text: "The practical point is that the answers on the application form are part of the contract. A smoker's habit, a diagnosis, medication, a parent's heart condition: if the form asks, the answer belongs on it.",
  },
  { type: "h2", text: "The other reasons ASISA lists" },
  {
    type: "ul",
    items: [
      "**Fraud.** A claim that misrepresents the facts.",
      "**Contractual exclusions.** ASISA gives the example of suicide within the first two years of the policy being taken out.",
      "**Premiums that stopped.** For credit life policies, ASISA says claims are most commonly declined because the cover lapsed through non-payment of premiums. For funeral policies, the main reasons are waiting periods, fraud and unpaid premiums.",
    ],
  },
  {
    type: "p",
    text: "Each of these is written into the policy wording. None of them is a surprise to someone who has read the schedule and the exclusions, which is why the FSCA's consumer booklet says a person can take a policy away to read before signing, and ask for it to be explained in plain language.",
  },
  { type: "h2", text: "What happens if premiums stop?" },
  {
    type: "p",
    text: "A life policy is a risk policy: it has no savings value, so it only works while premiums are paid. ASISA's statistics for 2025, released on 31 March 2026, record **8.7 million** risk policies lapsing in that year, up from 8.2 million in 2024. ASISA defines a lapse as the policyholder stopping premiums on a risk policy, resulting in no fund value.",
  },
  {
    type: "p",
    text: "What happens after a missed premium is set out in the policy wording, and the Policyholder Protection Rules also deal with late premiums. The period that applies to a particular policy, and whether it can be reinstated, is in the wording and with the insurer. This page does not quote a number of days, because that rule has not been re-read at source for this article. A debit order that bounces when bank details change is a common way a policy lapses without anyone deciding it should.",
  },
  { type: "h2", text: "Three habits that keep a claim payable" },
  {
    type: "ol",
    items: [
      "**The whole truth on the form, and again when asked.** Answer every health, lifestyle and family-history question in full, and if the insurer asks for an update or a test, give it. A policy taken out on a form with gaps is the one most likely to end in a dispute.",
      "**A live premium.** Keep the debit order alive, tell the insurer when bank details change, and read what the wording says about missed premiums and reinstatement. A lapsed policy cannot pay a claim.",
      "**A policy the family can find and understand.** Know the exclusions and any waiting period, keep the beneficiary nomination current with the insurer, and tell the people named on the policy where the schedule is kept.",
    ],
  },
  { type: "h2", text: "How long does a claim take?" },
  {
    type: "p",
    text: "No South African primary source publishes an average claim turnaround time, so this page does not state one. Each insurer sets its own claim documents and timelines in the policy wording and on its claims page. In general a claim needs a completed claim form, proof of death and identity, and the policy details; the insurer may ask for medical records where the death is within an exclusion or waiting period. Having the schedule to hand, and a nomination the insurer already holds, removes the delays a family can control.",
  },
  { type: "h2", text: "If a claim is declined" },
  {
    type: "p",
    text: "The first step is the insurer's own complaints process, which the policy documents describe. If that does not resolve it, the National Financial Ombud deals with complaints about long-term insurance claims, and the FAIS Ombud deals with complaints about advice. [How to complain](/learn/how-to-complain/) sets out the routes and what to send.",
  },
  {
    type: "p",
    text: "For a new policy there is also a cooling-off period. Under the Policyholder Protection Rules, a long-term policy can usually be cancelled within 31 days of receiving the policy summary or the disclosure information, as long as no claim has been made and no insured event has happened. That is the window in which to read the exclusions properly.",
  },
  { type: "h2", text: "Questions a household can take to an adviser" },
  {
    type: "ul",
    items: [
      "Which exclusions and waiting periods apply to this policy, and for how long?",
      "Is the cover fully underwritten or limited, and what does that mean for pre-existing conditions?",
      "What does the wording say happens after a missed premium, and can the policy be reinstated?",
      "Who is named as beneficiary, and does the insurer hold the current nomination?",
      "What documents would the family need to claim, and where will they be kept?",
      "How are you paid, and does that change if we take a product?",
    ],
  },
  {
    type: "p",
    text: "Life cover itself is explained in [life cover, in plain words](/cover/life-cover/). [Questions to ask a financial adviser](/learn/questions-to-ask-a-financial-adviser/) lists what an adviser must tell you.",
  },
  ...ON_THE_CALL("life cover and what a policy's conditions mean"),
];

# SortMyCover FAQ corpus (single source, 6B.9)

| Field | Value |
|---|---|
| Version | `faq-v1.0.1` (2026-10-02). Changelog at the end of this file. |
| Owner | conversation-designer |
| Used by | Thandi / W07 (WhatsApp), W30/W31 comment and DM replies (4.14), the landing-page FAQ block, the broker explainer |
| Change rule | Any edit runs `node evals/run.mjs --dry-run` (and the live eval when `ANTHROPIC_API_KEY` is set) in CI and cannot merge below the baseline (6B.1). Bump the version on every change. |
| **Compliance sign-off** | compliance-qa: `PENDING` (v1.0.0 withheld in phase4-review-2; v1.0.1 applies K-1…K-7 for re-review) · name: ______ · date: ______ · version signed: ______ |
| Practitioner review (2.3) | `PENDING`, within 30 days of launch |

**How this file is read by code.** `evals/run.mjs` and W07 parse every `### ` entry. Each entry has `topic` (the intent model's topic label, see `conversation/prompts/intent-slot.md`), `type` (`answer` = Thandi may send it, `defer` = Thandi must send the fixed deferral line), `en` and `af`. Placeholders are filled from the `brokers` row: `{adviser_first}`, `{adviser}`, `{practice}`, `{fsp}`, `{city}`, `{methods}`, `{adviser_languages}`.

**Writing rules (checked by the eval).** At most 2 sentences. Reading grade 5 to 7. No emoji, no exclamation marks. No premium, rand amount, cover amount, product, insurer, comparison, suitability, tax or health words: the output gate in `conversation/guardrail.mjs` must pass every `answer` entry unchanged. Thandi may shorten an answer when she phrases it, but may not add a fact that is not here.

---

## Part A: questions Thandi answers (25)

### FAQ-01 · How long is the call?
- topic: call_length
- type: answer
- asked as: "How long will it take?" · "Is it a long call?" · "Hoe lank duur dit?"
- en: About 30 minutes. You can join from your phone.
- af: Omtrent 30 minute. Jy kan van jou foon af aansluit.

### FAQ-02 · Does the call cost anything?
- topic: call_cost
- type: answer
- asked as: "Do I pay for the call?" · "Is it free?" · "Kos die oproep iets?"
- en: No, the call is free, and there's no obligation to buy anything.
- af: Nee, die oproep is gratis, en jy is nie verplig om iets te koop nie.

### FAQ-03 · Who is the adviser?
- topic: adviser_who
- type: answer
- asked as: "Who is Mark?" · "Who will I be talking to?" · "Waar is hy?"
- en: {adviser} is from {practice}, an authorised financial services provider (FSP {fsp}) based in {city}. {adviser_first} will be the one on the call with you.
- af: {adviser} is van {practice}, 'n gemagtigde finansiële diensverskaffer (FSP {fsp}) in {city}. {adviser_first} sal self met jou op die oproep wees.

### FAQ-04 · Am I talking to a bot?
- topic: bot_identity
- type: answer
- asked as: "Is this a real person?" · "Are you a robot?" · "Is jy 'n mens?"
- en: I'm Thandi, an AI booking assistant run by Lead Velocity. I can help with your booking, and you can ask for a person at any time.
- af: Ek is Thandi, 'n KI-besprekingsassistent van Lead Velocity. Ek help met jou bespreking, en jy kan enige tyd vra om met 'n mens te praat.

### FAQ-05 · What happens to my information?
- topic: privacy
- type: answer
- asked as: "What do you do with my details?" · "Is my info safe?" · "Wat doen julle met my inligting?"
- en: We share your details with {practice} only, never with other advisers, and you can ask us to delete them at any time. The service providers we use are listed at sortmycover.co.za/privacy.
- af: Ons deel jou besonderhede net met {practice}, nooit met ander adviseurs nie, en jy kan ons enige tyd vra om dit uit te vee. Die diensverskaffers wat ons gebruik, is by sortmycover.co.za/privacy gelys.

### FAQ-06 · Can I cancel or move my call?
- topic: cancel_move
- type: answer
- asked as: "What if I can't make it?" · "Can I change the time?" · "Kan ek die tyd skuif?"
- en: Yes, at any time. Tap Reschedule or Cancel, or just tell me what works for you.
- af: Ja, enige tyd. Tik Reschedule of Cancel, of sê net vir my wat jou pas.

### FAQ-07 · Do I need documents?
- topic: documents
- type: answer
- asked as: "Must I bring anything?" · "Do I need to prepare?" · "Moet ek iets voorberei?"
- en: Nothing is needed. Some people like to have a recent payslip or a current policy schedule nearby, but it is up to you.
- af: Niks is nodig nie. Sommige mense hou graag 'n onlangse salarisstrokie of polisskedule byderhand, maar dit is jou keuse.

### FAQ-08 · Is this a scam?
- topic: scam
- type: answer
- asked as: "How do I know this is real?" · "Is this legit?" · "Is dit 'n swendelary?"
- en: Fair question. SortMyCover is run by Lead Velocity (Pty) Ltd, and you can look up {practice} on the FSCA website with FSP number {fsp}.
- af: Regverdige vraag. SortMyCover word deur Lead Velocity (Edms) Bpk bestuur, en jy kan {practice} op die FSCA se webwerf naslaan met FSP-nommer {fsp}.

### FAQ-09 · How do you make money?
- topic: business_model
- type: answer
- asked as: "What's in it for you?" · "Who pays you?" · "Hoe maak julle geld?"
- en: Advisers pay Lead Velocity the same flat fee for each 30-day cycle, and you pay nothing. It is never a commission and never a share of any policy.
- af: Adviseurs betaal Lead Velocity dieselfde vaste fooi vir elke siklus van 30 dae, en jy betaal niks. Dit is nooit kommissie nie en nooit 'n deel van enige polis nie.

### FAQ-10 · Will I be sold something?
- topic: sales_pressure
- type: answer
- asked as: "Will he try sell me something?" · "Is this a sales call?" · "Gaan hy my iets probeer verkoop?"
- en: There's no obligation to buy anything. {adviser_first} goes through where you are, and any next step is your choice.
- af: Jy is nie verplig om iets te koop nie. {adviser_first} kyk saam met jou waar jy staan, en enige volgende stap is jou keuse.

### FAQ-11 · What if I already have cover?
- topic: existing_cover
- type: answer
- asked as: "I already have a policy" · "I have cover through work" · "Ek het klaar 'n polis"
- en: That's fine. The call is a chance to talk it through with {adviser_first}.
- af: Dit is reg so. Die oproep is 'n kans om dit met {adviser_first} deur te praat.

### FAQ-12 · What if I'm older than 50?
- topic: age_over
- type: answer
- asked as: "I'm 54, can I still book?" · "Is there an age limit?" · "Ek is ouer as 50"
- en: Right now, the advisers on this service work with people aged 35 to 50. You can still talk to any licensed financial adviser yourself.
- af: Die adviseurs op hierdie diens werk tans met mense van 35 tot 50. Jy is welkom om enige gelisensieerde finansiële adviseur self te kontak.

### FAQ-13 · What if I'm younger than 35?
- topic: age_under
- type: answer
- asked as: "I'm 29, can I book?" · "Ek is 30"
- en: Right now, the advisers on this service work with people aged 35 to 50. You can still talk to any licensed financial adviser yourself.
- af: Die adviseurs op hierdie diens werk tans met mense van 35 tot 50. Jy is welkom om enige gelisensieerde finansiële adviseur self te kontak.

### FAQ-14 · How did you get my number?
- topic: number_source
- type: answer
- asked as: "Who gave you my number?" · "Waar kry julle my nommer?"
- en: You shared it on the SortMyCover form or in this chat and agreed that we may contact you. Reply STOP at any time and we won't message again.
- af: Jy het dit op die SortMyCover-vorm of in hierdie klets gedeel en ingestem dat ons jou mag kontak. Antwoord STOP enige tyd en ons sal nie weer boodskap nie.

### FAQ-15 · Who is Lead Velocity?
- topic: lead_velocity
- type: answer
- asked as: "What is SortMyCover?" · "Who are you guys?" · "Wie is Lead Velocity?"
- en: Lead Velocity (Pty) Ltd runs SortMyCover and books calls with licensed advisers. We don't give advice or sell anything ourselves.
- af: Lead Velocity (Edms) Bpk bestuur SortMyCover en bespreek oproepe met gelisensieerde adviseurs. Ons gee nie self raad nie en verkoop niks nie.

### FAQ-16 · What will the adviser ask?
- topic: call_content
- type: answer
- asked as: "What happens on the call?" · "What will we talk about?" · "Waaroor gaan ons praat?"
- en: {adviser_first} will ask a few simple questions about your home, your family and what you have through work. It's a conversation, and any next step is your choice.
- af: {adviser_first} sal 'n paar eenvoudige vrae vra oor jou huis, jou gesin en wat jy deur die werk het. Dit is 'n gesprek, en enige volgende stap is jou keuse.

### FAQ-17 · How can we meet?
- topic: methods
- type: answer
- asked as: "Can it be a phone call?" · "Can we do WhatsApp video?" · "Kan dit per telefoon wees?"
- en: {adviser_first} can do {methods}. Pick the one that works for you and I'll set it up.
- af: {adviser_first} kan {methods} doen. Kies wat jou pas, dan reël ek dit.

### FAQ-18 · Do I need Teams installed?
- topic: teams_install
- type: answer
- asked as: "I don't have Teams" · "Do I need an account?" · "Moet ek Teams aflaai?"
- en: No, you can join from your phone's browser or the Teams app, and you don't need an account. The link comes here before the call.
- af: Nee, jy kan van jou foon se blaaier of die Teams-toep aansluit, sonder 'n rekening. Die skakel kom hier voor die oproep.

### FAQ-19 · Can my partner join?
- topic: partner_join
- type: answer
- asked as: "Can my wife be on the call?" · "Kan my man ook inskakel?"
- en: Yes, your partner is welcome to join. Just let {adviser_first} know at the start.
- af: Ja, jou lewensmaat is welkom om in te skakel. Laat {adviser_first} net aan die begin weet.

### FAQ-20 · Can the call be in my language?
- topic: language_call
- type: answer
- asked as: "Can we do the call in Afrikaans?" · "Does he speak isiZulu?" · "Kan die oproep in Afrikaans wees?"
- en: {adviser_first} speaks {adviser_languages}. Tell me which you prefer and I'll let {adviser_first} know.
- af: {adviser_first} praat {adviser_languages}. Sê vir my wat jy verkies, dan laat ek {adviser_first} weet.

### FAQ-21 · What if I miss the call?
- topic: missed_call
- type: answer
- asked as: "What if something comes up?" · "Wat as ek dit mis?"
- en: No stress, things happen. I'll send you new times to choose from.
- af: Geen stres nie, dinge gebeur. Ek stuur vir jou nuwe tye om van te kies.

### FAQ-22 · How do I stop the messages?
- topic: stop_how
- type: answer
- asked as: "How do I unsubscribe?" · "Hoe stop ek die boodskappe?"
- en: Reply STOP at any time and we won't message you again.
- af: Antwoord STOP enige tyd en ons sal jou nie weer boodskap nie.

### FAQ-23 · Do you share my details with other companies?
- topic: data_sharing
- type: answer
- asked as: "Will I get calls from other people?" · "Do you sell my number?" · "Verkoop julle my nommer?"
- en: No. We share them with {practice} only, and we never sell them or pass them to other advisers.
- af: Nee. Ons deel dit net met {practice}, en ons verkoop dit nooit of gee dit vir ander adviseurs nie.

### FAQ-24 · Why do you need my email?
- topic: email_why
- type: answer
- asked as: "Why the email?" · "Hoekom wil julle my e-pos hê?"
- en: Only to send the invite for your video call. We don't use it for anything else.
- af: Net om die uitnodiging vir jou video-oproep te stuur. Ons gebruik dit vir niks anders nie.

### FAQ-25 · What happens after the call?
- topic: after_call
- type: answer
- asked as: "Will he follow up?" · "Then what?" · "Wat gebeur daarna?"
- en: {adviser_first} will follow up with you directly after the call. Apart from one quick question about how the call went, we won't send you anything else.
- af: {adviser_first} sal na die oproep self met jou opvolg. Behalwe vir een vinnige vraag oor hoe die oproep was, stuur ons niks verder nie.

---

## Part B: questions Thandi ALWAYS defers (FAIS 2.1.1, 2.1.7)

Every entry below is answered with the fixed deferral line from `conversation/lines.mjs`, verbatim, followed by the "I've made a note" line. The question (or, for health and ID, only the words "has a health question for you") goes into the pre-call brief. Thandi never adds a sentence about the topic itself.

**FAQ-05 / FAQ-23 note (K-1, K-2, NH-17).** "{practice} only" means the only *adviser* who gets the lead. The service providers who process data for us (hosting, WhatsApp, the AI model, and Meta, which receives a hashed contact for ad measurement as the consent sentence says) are listed in the privacy notice. Thandi never says "only to {practice}" without the provider line, and never says "nobody else".

**Self-harm and bereavement are not in this file.** A message that suggests self-harm, or tells us someone has died, gets no FAQ entry and no deferral line: the bot pauses and Jonathan and KG are alerted at once (`conversation/handoff.md`, trigger 6).

### DEF-01 · What would cover cost me?
- topic: premium
- type: defer
- asked as: "How much is the premium?" · "Roughly what would it cost for someone my age?" · "Wat is die premie?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-02 · How much cover do I need?
- topic: cover_amount
- type: defer
- asked as: "Is R2 million enough?" · "Should I have 10 times my salary?" · "Hoeveel dekking het ek nodig?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-03 · Which type of policy should I get?
- topic: product
- type: defer
- asked as: "Do I need funeral cover or life cover?" · "What about disability?" · "Watter soort polis?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-04 · Is X better than Y? Which insurer?
- topic: comparison
- type: defer
- asked as: "Is Discovery better than Old Mutual?" · "Who's cheapest?" · "Watter maatskappy is die beste?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-05 · Is my cover enough?
- topic: suitability
- type: defer
- asked as: "Is my work cover enough?" · "Am I underinsured?" · "Is my dekking genoeg?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-06 · Should I cancel or switch my current policy?
- topic: switching
- type: defer
- asked as: "Should I cancel my old policy first?" · "Can I move my cover?" · "Moet ek my polis kanselleer?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-07 · Tax questions
- topic: tax
- type: defer
- asked as: "Is it tax deductible?" · "Will my family pay tax on it?" · "Is daar belasting op?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-08 · Health questions (and any ID number)
- topic: health
- type: defer
- asked as: "I'm diabetic, will that be a problem?" · "I smoke, does it matter?" · any message with an ID number
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.
- extra: the stored transcript keeps `[health detail removed]`; the brief says only "has a health question for you"; an ID number also triggers the fixed ID warning line.

### DEF-09 · Will they pay out? Claims
- topic: claims
- type: defer
- asked as: "Will they actually pay my family?" · "How do claims work?" · "Sal hulle uitbetaal?" · problem form: "My late husband's policy isn't paying" (see extra)
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.
- extra: a claim that is being refused or not paid on an existing policy (topic `claim_problem`) also hands off to a person (`DEFER` + handoff). If the message says someone has died, trigger 6 in `handoff.md` wins: no deferral line, a person at once.

### DEF-10 · Investments, retirement annuities, savings, medical aid
- topic: investments
- type: defer
- asked as: "Should I put money in an RA instead?" · "Is my medical aid enough?" · "What about my pension fund?" · "Moet ek eerder belê?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-11 · Wills, estate, beneficiaries
- topic: estate
- type: defer
- asked as: "Do I need a will first?" · "Who should be my beneficiary?" · "What happens to my estate?" · "Moet ek 'n testament hê?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.

### DEF-12 · How much does the adviser earn?
- topic: commission
- type: defer
- asked as: "How much does Mark earn on this?" · "Does he get commission?" · "Kry hy kommissie?"
- en: That's exactly what {adviser_first} will go through with you on the call.
- af: Dit is presies wat {adviser_first} saam met jou op die oproep sal deurgaan.
- extra: disclosing the adviser's remuneration is the adviser's FAIS duty, so it is his to answer. A question about how *we* are paid is FAQ-09 (business_model), not this entry.

---

## Changelog

| Version | Date | Change | Source |
|---|---|---|---|
| `faq-v1.0.1` | 2026-10-02 | FAQ-05 and FAQ-23: "only to {practice}" replaced; details go to {practice} as the only adviser, providers listed at /privacy (K-1, K-2, NH-17). FAQ-09: flat fee per 30-day cycle, never a commission or a share of any policy (K-3, 2.1.1). FAQ-25: names the one follow-up question after the call (W35 lead pulse) (K-4). FAQ-11: unsourced "many people who book already have some cover" removed (K-5, 2.1.5). FAQ-02, FAQ-10, FAQ-16: "nothing to buy / no selling / not a sale" replaced with "no obligation to buy" / "any next step is your choice" (K-6, NH-new-B default b). Part B: DEF-09 claims (+ a person for refused claims), DEF-10 investments / RAs / savings / medical aid, DEF-11 wills / estate / beneficiaries, DEF-12 adviser commission (K-7). Self-harm and bereavement note. | compliance-qa phase4-review-2 §3a |
| `faq-v1.0.0` | 2026-10-02 | First version: 25 answers, 8 defer topics. | conversation-designer |

# Reply corpus: public and private templates (EN + AF)

Owner: community-response-lead. Read at runtime by `automation/W30.json` and `automation/W31.json` (node "Read corpus", parsed by "Parse corpus"). Compliance-qa signs off every line; the FAIS lint and the shared guardrail run on every send anyway.

Parser contract (do not change the layout): a template starts with a line `#### <id> | <lang>` and each variant is one line starting with `- `. Variants rotate (least recently used per Page) so identical text is never posted twice in a row, which keeps Meta's spam signal quiet. Everything outside `####` blocks is ignored by the parser.

Placeholders: `{first_name}` (omitted with its trailing comma if not visible), `{ctwa_link}` (CTWA link with `ref=cmt_{ad_id}`), `{page_link}` (page with `utm_source=meta&utm_medium=comment&utm_campaign=cmt_{ad_id}`), `{adviser_line}` (empty while there is one broker).

Dependency note (stub): `knowledge/faq.md` and `conversation/prompts/guardrail.md` are being written by conversation-designer and did not exist when this was written. Until they land, the "FAQ topics" block below is the only grounding for Haiku drafts and the lint in W30 is the only gate. When they exist, W30 reads them through the nodes "Read faq" and "Read guardrail" (both already wired, both `continueOnFail`, both fail closed to fixed templates). Do not copy faq.md text into this file; add a topic key here only when faq.md has the answer.

## Hard rules for every template

- Public: at most 2 sentences, Grade 5 to 7 plain South African English or Afrikaans, no exclamation marks, no emojis (the sender may add one only if the commenter used one), no link of any kind, no rand amount, no product, insurer, premium, cover amount, comparison, "you should", "guaranteed", "financial advice", "appointment".
- Private: the first message always says it is SortMyCover's assistant (an AI) and that a person is one message away. One link only. No qualifying question until the person replies.
- Never claim a result. "Nothing to buy on the call" and "the person pays nothing" are the only price statements allowed. The adviser pays a flat fee; that is stated only in the objection answer.

## FAQ topics (ground truth for Haiku public drafts until knowledge/faq.md exists)

| topic | answer in one plain sentence |
|---|---|
| duration | The call is about 30 minutes. |
| cost | The call costs the person nothing and there is nothing to buy on it. |
| who | SortMyCover connects people with a licensed financial adviser who calls them. |
| how | The person picks a time, then the licensed adviser phones or video-calls at that time. |
| who_calls | A licensed adviser, not a call centre. |
| privacy | Details go only to the adviser the person is booked with, and the person can say STOP at any time. |
| money | The adviser pays SortMyCover a flat fee, nothing is sold on the call, and the person pays nothing. |
| hours | The person chooses a time that suits them. |

## Public replies

#### question_process | en
- {first_name}, the call is about 30 minutes with a licensed adviser, and there is nothing to buy on it. Happy to send the details privately.
- {first_name}, a licensed adviser phones at a time the person picks, and it costs nothing to book. Happy to send the details privately.
- Good question, {first_name}. The call is 30 minutes and nothing is sold on it, and we can send the details privately.

#### question_process | af
- {first_name}, die gesprek is ongeveer 30 minute met 'n gelisensieerde adviseur, en daar is niks om te koop nie. Ons stuur graag die besonderhede privaat.
- {first_name}, 'n gelisensieerde adviseur bel op 'n tyd wat die persoon kies, en dit kos niks om te bespreek nie. Ons stuur graag die besonderhede privaat.
- Goeie vraag, {first_name}. Die gesprek is 30 minute en niks word daar verkoop nie, en ons kan die besonderhede privaat stuur.

#### interest_thanks | en
- Thanks, {first_name}. We have sent you a message with the next step.
- Thank you, {first_name}. Check your messages, we have sent the details.
- Thanks, {first_name}, we have sent you a short message about the call.

#### interest_thanks | af
- Dankie, {first_name}. Ons het 'n boodskap met die volgende stap gestuur.
- Baie dankie, {first_name}. Kyk in jou boodskappe, ons het die besonderhede gestuur.
- Dankie, {first_name}, ons het 'n kort boodskap oor die gesprek gestuur.

#### objection_calm | en
- Fair question, {first_name}. SortMyCover connects people with licensed advisers for a flat fee paid by the adviser, nothing is sold on the call, and it is explained on our website under How we make money.
- Fair to ask, {first_name}. The person pays nothing, the adviser pays SortMyCover a flat fee, and the call is not a sales pitch, so we have sent you a message with more.

#### objection_calm | af
- Regverdige vraag, {first_name}. SortMyCover bring mense in kontak met gelisensieerde adviseurs vir 'n vaste fooi wat die adviseur betaal, niks word op die gesprek verkoop nie, en dit staan op ons webwerf onder How we make money.
- Goed dat jy vra, {first_name}. Die persoon betaal niks nie, die adviseur betaal SortMyCover 'n vaste fooi, en die gesprek is nie 'n verkoopspraatjie nie, so ons het 'n boodskap met meer gestuur.

#### deferral_advice | en
- That is exactly what a licensed adviser goes through on the call, we don't quote or advise. {first_name}, we have sent you a message with the next step.
- Good question, {first_name}. A licensed adviser covers that on the call, and we don't quote or advise, so we have sent you a message.
- That is for the licensed adviser to go through, {first_name}, we don't quote or advise. Check your messages for how to book.

#### deferral_advice | af
- Dis presies wat 'n gelisensieerde adviseur op die gesprek deurgaan, ons kwoteer of adviseer nie. {first_name}, ons het 'n boodskap met die volgende stap gestuur.
- Goeie vraag, {first_name}. 'n Gelisensieerde adviseur dek dit op die gesprek, en ons kwoteer of adviseer nie, so ons het 'n boodskap gestuur.
- Dis vir die gelisensieerde adviseur om deur te gaan, {first_name}, ons kwoteer of adviseer nie. Kyk in jou boodskappe vir hoe om te bespreek.

#### complaint_ack | en
- {first_name}, thank you for telling us, and we are sorry this happened. We have sent you a message so a person can look into it.
- Thank you for raising this, {first_name}. We have sent you a message and a person will follow up.

#### complaint_ack | af
- {first_name}, dankie dat jy ons laat weet, en ons is jammer dit het gebeur. Ons het 'n boodskap gestuur sodat 'n persoon dit kan ondersoek.
- Dankie dat jy dit opper, {first_name}. Ons het 'n boodskap gestuur en 'n persoon sal opvolg.

#### praise_thanks | en
- Thank you, {first_name}.
- Thanks, {first_name}, much appreciated.
- Thank you {first_name}, glad it helped.

#### praise_thanks | af
- Dankie, {first_name}.
- Baie dankie, {first_name}, ons waardeer dit.
- Dankie {first_name}, bly dit help.

#### continue_privately | en
- Let's carry on in private, {first_name}. We have sent you a message.

#### continue_privately | af
- Kom ons gaan privaat voort, {first_name}. Ons het 'n boodskap gestuur.

## Private replies (first message after a comment; sent once, within 7 days)

All private replies start with the disclosure line. `{disclosure}` below expands to the text in `disclosure_line`.

#### disclosure_line | en
- Hi {first_name}, this is SortMyCover's assistant (an AI). A person is one message away, just reply "person".

#### disclosure_line | af
- Hallo {first_name}, dit is SortMyCover se assistent (KI). 'n Persoon is net een boodskap weg, antwoord net "persoon".

#### private_question | en
- {disclosure} Thanks for asking under our post. The call is about 30 minutes with a licensed adviser, nothing to buy, and you pick a time that suits you: {ctwa_link}

#### private_question | af
- {disclosure} Dankie vir die vraag onder ons plasing. Die gesprek is ongeveer 30 minute met 'n gelisensieerde adviseur, niks om te koop nie, en jy kies 'n tyd wat jou pas: {ctwa_link}

#### private_interest | en
- {disclosure} Here is how it works: 30 minutes with a licensed adviser, nothing to buy, pick a time that suits you: {ctwa_link}

#### private_interest | af
- {disclosure} Só werk dit: 30 minute met 'n gelisensieerde adviseur, niks om te koop nie, kies 'n tyd wat jou pas: {ctwa_link}

#### private_objection | en
- {disclosure} Happy to answer privately. SortMyCover connects people with licensed advisers, the adviser pays us a flat fee, you pay nothing and nothing is sold on the call. If you want to see for yourself: {ctwa_link}

#### private_objection | af
- {disclosure} Ons antwoord graag privaat. SortMyCover bring mense in kontak met gelisensieerde adviseurs, die adviseur betaal ons 'n vaste fooi, jy betaal niks en niks word op die gesprek verkoop nie. As jy self wil kyk: {ctwa_link}

#### private_advice | en
- {disclosure} A licensed adviser goes through prices, amounts and what suits a person on the call. We don't quote or advise. 30 minutes, nothing to buy, pick a time that suits you: {ctwa_link}

#### private_advice | af
- {disclosure} 'n Gelisensieerde adviseur gaan op die gesprek deur wat dinge kos en wat iemand pas. Ons kwoteer of adviseer nie. 30 minute, niks om te koop nie, kies 'n tyd wat jou pas: {ctwa_link}

#### private_complaint | en
- {disclosure} We are sorry about your experience. Please tell us what happened and a person will read it and come back to you. No link needed, just reply here.

#### private_complaint | af
- {disclosure} Ons is jammer oor jou ervaring. Vertel ons asseblief wat gebeur het, en 'n persoon sal dit lees en terugkom na jou. Geen skakel nodig nie, antwoord net hier.

#### private_own_data | en
- {disclosure} We have hidden your comment to protect your personal details, please don't post them in public. If you want a call with a licensed adviser, continue here: {ctwa_link}

#### private_own_data | af
- {disclosure} Ons het jou kommentaar versteek om jou persoonlike besonderhede te beskerm, moet asseblief nie dit in die openbaar plaas nie. As jy 'n gesprek met 'n gelisensieerde adviseur wil hê, gaan hier voort: {ctwa_link}

#### private_sensitive_human_template | en
- (Written and sent by a person, never by automation. Fill the brackets, keep it short, no product talk.) Hi {first_name}, it is [name] from SortMyCover. Thank you for sharing that with us, and I am sorry for what you are going through. A licensed adviser can speak with you about your situation when you are ready, there is no pressure, and you can reply here whenever suits you.

#### private_sensitive_human_template | af
- (Deur 'n persoon geskryf en gestuur, nooit deur outomatisering nie. Vul die hakies in, hou dit kort, geen produkpraatjies nie.) Hallo {first_name}, dit is [naam] van SortMyCover. Dankie dat jy dit met ons gedeel het, en ek is jammer oor wat jy deurmaak. 'n Gelisensieerde adviseur kan met jou oor jou situasie praat wanneer jy gereed is, daar is geen druk nie, en jy kan hier antwoord wanneer dit jou pas.

## DM flow (W31, Messenger and Instagram)

#### dm_opener | en
- Hi {first_name}, this is SortMyCover's assistant (an AI). A person is one message away, just say "person". What would you like to know about the call?

#### dm_opener | af
- Hallo {first_name}, dit is SortMyCover se assistent (KI). 'n Persoon is net een boodskap weg, sê net "persoon". Wat wil jy oor die gesprek weet?

#### dm_qualifying_age | en
- One quick question so the adviser is the right fit: which age band are you in? Under 35, 35 to 44, 45 to 50, or 51 and over.

#### dm_qualifying_age | af
- Een vinnige vraag sodat die adviseur reg pas: in watter ouderdomsgroep is jy? Onder 35, 35 tot 44, 45 tot 50, of 51 en ouer.

#### dm_cta | en
- Thanks. To book, continue on WhatsApp, it is where the calendar and reminders live. 30 minutes with a licensed adviser, nothing to buy: {ctwa_link}

#### dm_cta | af
- Dankie. Om te bespreek, gaan voort op WhatsApp, daar is die kalender en onthounotas. 30 minute met 'n gelisensieerde adviseur, niks om te koop nie: {ctwa_link}

#### dm_handoff | en
- Understood. A person from the SortMyCover team will message you here, we have let them know.

#### dm_handoff | af
- Verstaan. 'n Persoon van die SortMyCover-span sal jou hier boodskap stuur, ons het hulle laat weet.

#### dm_advice_deferral | en
- That is exactly what a licensed adviser goes through on the call, we don't quote or advise. If you would like that call: {ctwa_link}

#### dm_advice_deferral | af
- Dis presies wat 'n gelisensieerde adviseur op die gesprek deurgaan, ons kwoteer of adviseer nie. As jy daardie gesprek wil hê: {ctwa_link}

(Sensitive DMs get no automated text at all: W31 pauses the bot and a person writes using private_sensitive_human_template.)

## Ice-breakers (Page and Instagram, set by the Chrome agent, human-gated)

1. How long is the call?
2. Does it cost anything?
3. Who is SortMyCover?

Afrikaans set (if the Afrikaans variant Page is live): Hoe lank is die gesprek? Kos dit iets? Wie is SortMyCover?

## Not sent by community-response-lead (listed so nobody adds them)

No "comment YES" prompts, no "DM us" lines, no emoji-only replies, no replies to spam or abuse, no price, no named insurer, no pinned praise, no reply to a reply-to-a-reply.

# Gate test summaries for Jonathan (GATE-TEST: W01, W04, W05, W06, W09, W12, W13, W15)

Each test below has been drafted and passes today against the draft logic, using made-up leads only. No workflow is built until you approve its test. "Open default" means the test assumes an answer you haven't confirmed yet; if you stay silent, that default stands.

---

## W01 - Intake: a new lead arrives from a page or ad

**What it does:** checks a new lead is real, consented and not a repeat, picks the broker, and only then lets the first WhatsApp go.

- A South African mobile number is tidied into one standard format; anything else is refused.
- Landline and online-phone numbers get a friendly "Please use a mobile number" and nothing is stored.
- The exact consent wording the person saw, the time, the page and the ad source are stored word for word.
- An unticked or missing consent is refused and nothing is saved.
- With named consent, the broker named in the wording must be the broker we route to. If not, the lead is held and not messaged.
- The same person within 90 days is merged: no new lead, no new WhatsApp, no new Meta event. Day 91 counts as a new lead.
- A double-click on submit makes one lead. A bot that fills the hidden trap field looks accepted but nothing is stored or sent.
- Too many submissions from one place in an hour are blocked.
- If the phone-checking service is down, the lead is still accepted and flagged (speed beats a dead service).
- A number that replied STOP is stored but never messaged. WhatsApp-ad leads follow the same rules, and "No thanks" keeps only a scrambled copy of the number.

**Open defaults:** NH-40, the WhatsApp-ad consent: the old test fixture expected generic wording, but while we have one broker the default is named wording (the practice and FSP number are in the consent). NH-60: the default treats the WhatsApp consent as also covering ad measurement; the practitioner may disagree, in which case WhatsApp-ad leads stop reporting to Meta.

**Tests:** 31 (all pass offline). File: W01.test.mjs

---

## W04 - Slots: which meeting times we offer

**What it does:** offers a lead three meeting times the broker can actually keep.

- Every offered time is inside the broker's hours, on the half hour, 30 minutes long, on a weekday.
- Nothing is offered sooner than 2 hours from now or more than 14 days away.
- There is a 15-minute gap around every Outlook event and every existing booking.
- A day that already has 3 meetings offers nothing; a week with 12 offers nothing until next Monday. Cancelled meetings don't count.
- South African public holidays are blocked (checked with 16 and 25 December 2026).
- The three offers fall on three different days when possible, so the broker's week fills evenly.
- The WhatsApp calendar shows at most 20 times a day and greys out days with no room.
- If bookings are paused, nothing is offered. If the calendar can't be read, the lead is told to "pick on WhatsApp" instead of seeing an error.
- Two hand-worked examples (leads L02 and L03) match exactly.

**Open defaults:** none specific to this test.

**Tests:** 18 (all pass offline). File: W04.test.mjs

---

## W05 - Book: locking in a meeting

**What it does:** turns a chosen time into one confirmed booking on the broker's calendar, with the right invite.

- If two people tap the same time at the same moment, exactly one gets it and the other is shown three new times. Zero double-bookings.
- A time taken in Outlook after it was offered gets a polite "taken, here are 3 more", not an error page.
- Pressing the button twice (a retry) returns the same booking and creates one calendar event.
- Times that break the rules (too soon, outside hours, a holiday) are refused even if sent directly.
- The calendar event has the right title, Teams link, number and consent reference. The lead is not added as an attendee.
- Email is asked for only when the meeting type needs an invite (Teams, Zoom, Meet). Phone and WhatsApp-call bookings never ask for or store it.
- Emails are checked for typos, throw-away addresses and dead domains; invites go from howzit@. A bounced invite prompts the lead on WhatsApp with the likely fix.
- A method the broker doesn't offer (e.g. Zoom) is refused with the list of what he does offer.
- The broker is told about the booking with the lead's first name only. The booking form is guarded against bots and fails closed if the bot check is down (NH-32).

**Open defaults:** NH-53: if the lead taps a time in chat without choosing a meeting type, we use the type they said they prefer, else the broker's first phone option. Confirm or name another rule.

**Tests:** 27 (all pass offline). File: W05.test.mjs

---

## W06 - First touch: the disclosure WhatsApp

**What it does:** sends each routed lead their first WhatsApp, naming the practice, FSP number and adviser, inside 60 seconds.

- 100% of the made-up routed leads receive it inside 60 seconds. This is the number we are held to.
- The right message goes out for each situation: already booked, wants to pick on WhatsApp, or the calendar-button version.
- A page lead who neither books nor skips gets the slots message when a short wait ends, still under 60 seconds.
- A booking that arrives after the slots message gets a short confirmation, never a second introduction.
- The real message text shows the practice, FSP number, adviser and the STOP line, and matches the text submitted to Meta word for word.
- The message ID and delivery time are logged against the lead as proof of disclosure.
- If WhatsApp can't deliver, an SMS goes out with the same disclosure words.
- Nothing is sent to out-of-range, repeat, STOPped, opted-out or un-routed leads.
- Message fields follow Meta's formatting rules, so templates aren't rejected.

**Open defaults:** none specific to this test (the AI-sentence wording in these messages is decided separately under NH-38b).

**Tests:** 22 (all pass offline). File: W06.test.mjs

---

## W09 - Reminders: getting the lead to show up

**What it does:** sends a lead a timed run of useful reminders before the meeting, each one once.

- Five example leads each get exactly the hand-worked schedule: full if booked a day or more ahead, shortened if booked less than 24 hours ahead.
- Every reminder falls between the booking and the meeting, in order.
- The broker's intro video goes 48 hours before only if booked 3+ days out; otherwise shortly after booking. A voice note replaces it if there's no approved video, and nothing is sent if neither exists.
- A meeting booked exactly 2 hours ahead skips the separate 2-hour reminder; the 10-minute one still goes.
- Tapping Confirm marks the booking confirmed.
- Rescheduling cancels the old reminders and builds new ones without repeating the intro.
- STOP cancels every pending reminder; an opted-out lead gets none.
- If the scheduler runs twice, each reminder still goes once.
- Reminders due between 8pm and 8am wait until 8am (the 10-minute one is exempt).
- A lead never receives more than the agreed maximum number of messages.

**Open defaults:** none specific to this test.

**Tests:** 26 (all pass offline). File: W09.test.mjs

---

## W12 - Outcome: what happened on the call

**What it does:** asks the broker and the lead what happened, so a no-show is only counted when both sides agree.

- The broker is asked 15 minutes after the slot ends, the lead 30 minutes after, with one nudge at about 3 hours.
- Broker says Attended and lead says yes: marked attended, thank-you sent, Meta told, broker asked for a result and a 1-5 quality score.
- Broker says No-show but the lead says "No, not yet": a conflict goes to the console for KG. Neither side's no-show is automatic and no replacement is given.
- Broker says No-show and the lead is silent: held until the 2-hour window closes, then a lead no-show.
- Nobody answers by 24 hours: marked attended, flagged "unconfirmed".
- Broker never marks and the lead says the adviser didn't call: treated as a broker no-show (not auto-attended). The lead gets an apology and a rebooking offer at our cost.
- The six result buttons map one-to-one to the six result codes; only "unreachable" and "doesn't fit criteria" can lead to a replacement.
- Quality must be 1-5, and there is no result on a no-show. An opted-out lead gets no thank-you.
- Two unconfirmed outcomes in one cycle prompts you to call the broker.

**Open defaults:** NH-54: the "adviser didn't call" reading and the draft apology wording (English and Afrikaans) need your confirmation before this test is approved.

**Tests:** 26 (all pass offline). File: W12.test.mjs

---

## W13 - Replacement: when a broker gets a replacement lead

**What it does:** decides when a broker is owed a replacement lead and enforces the per-cycle cap.

- A lead no-show with no rebooking or reply for 48 hours becomes "replacement due", opens a 48-hour dispute window, then is approved.
- Rebooking or replying inside 48 hours means no replacement. A second no-show is due at once.
- Only "unreachable" and "doesn't fit criteria" results qualify. "Budget", "already covered" or "didn't buy" never do.
- A broker no-show never earns a replacement.
- An uncontactable lead only qualifies if they were verified first.
- Caps come from the pricing table: Bronze 4, Silver 6, Gold 9 per cycle. One more is refused and you are alerted. No weekly cap.
- A claim rejected on dispute frees its place; other cycles don't count.
- You can dispute at 47 hours but not at 49. One replacement per lead.
- A short cycle extends up to 14 days; any remaining shortfall is credited pro rata, never above the cycle price. The word used is "committed", never "guaranteed".

**Open defaults:** NH-42: if a lead cancels and never rebooks, the default counts them as replaceable (uncontactable, or "would not take a call"). That is a money decision and is not yet in Schedule C.

**Tests:** 18 (all pass offline). File: W13.test.mjs

---

## W15 - STOP: opting out

**What it does:** honours a STOP from a lead anywhere, immediately and everywhere.

- STOP in any case or punctuation is caught. "Don't stop" and the booking "Cancel" button are not.
- The lead is marked opted out, all reminders and post-call checks are cancelled, and a live booking is released.
- The broker is told by WhatsApp and email, first name only, with "do not call". The number is never shown.
- The number is blocked Lead Velocity-wide, stored as a scrambled copy only.
- Exactly one confirmation goes to the lead, then nothing more, even through the original meeting time.
- A second STOP does nothing new: no second block, notice or confirmation.
- STOP works mid-WhatsApp-quiz and mid-follow-up. If the lead isn't routed yet, no broker is told.
- STOP from a number we have no record of is still blocked and confirmed, with no lead created.
- A later form from a STOPped number is blocked. Text-message and console opt-outs are accepted.

**Open defaults:** NH-52 (NH-28b): STOP cancels a live booking and tells the broker. A switch can instead keep the booking; say so only if you want that.

**Tests:** 18 (all pass offline). File: W15.test.mjs

---

**To approve:** reply "GATE-TEST approve all as drafted", or name the ones you want changed.

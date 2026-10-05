# P14 breach drill #2, desk exercise, 2026-10-05

Type: table-top, plus one scripted check (the real W34 B2 detector code run against synthetic emails). All data is synthetic: Test Lead 15, +27600000115, "Test Broker A" / "Test Broker B". No system was changed and nothing was sent. Runbook under test: `deliverables/contracts-drafter/compliance-register.md` Part 3, `docs/breach-notification-drafts.md`, W34 B2 → W22 `popia_breach`. This drill also re-checks the 8 gaps from drill #1 (`breach-drill-P14-2026-10-03.md`).

## Scenario (new: wrong recipient, the most common real breach type)
Monday 2026-10-05 07:40 SAST. A routing bug sends Test Lead 15's pre-call brief (name, WhatsApp number, age band, budget band, best time) to Test Broker B instead of Test Broker A. At 08:05 Broker B emails howzit@: "I received a lead that is not mine. The client details were sent to me by mistake." Broker B has the details; nothing is public.

## Walk-through
| Step (Part 3) | What happens with today's build | Result |
|---|---|---|
| Detect | W34 B2 detector run on the email: **no match.** The patterns need words like leaked/exposed/compromised/breach/unauthorised. "Sent to me by mistake" / "not mine" match nothing. Script: `build/evidence/S7-28-2026-10-05/detector-check.cjs`. | **FAIL → G9** |
| Detect (fallback) | Jonathan reads howzit@ by hand at about 09:00 (T+55 min). | Late but caught |
| 1 Contain | Ask Broker B in writing to delete the brief and confirm deletion (agreement 9.8); pause routing for the affected campaign; find the routing bug. | T+1 h 20 |
| 2 Alert | `incidents` row opened by hand (no console button, G5). | Done by hand |
| 3 Assess | 1 person, 1 unintended recipient who is a bound, FAIS-regulated broker. Ordinary PI only. Under POPIA s22, a disclosure to an unauthorised person is still a compromise. Decision: notify, low severity. | T+3 h |
| 4 Tell brokers | Broker A told; Broker B's deletion confirmation logged. | Draft C adapted |
| 5 Regulator | `docs/breach-notification-drafts.md` A fits with edits ("sent to the wrong adviser" instead of "public web page"). | Ready T+4 h |
| 6 Subject | Draft B adapted. The lead is inside the 24 h window (they replied that morning), so it can go as a free-form WhatsApp; the held template `breach_subject_notice` covers the out-of-window case. | Ready |
| 7–8 Fix, record | Root cause plus a test on routing; fill in the `incidents` timestamps. | Planned |

## Gaps from drill #1, re-checked today
| # | Status 2026-10-05 | Evidence |
|---|---|---|
| G1 howzit@ breach alert | **Closed** for "breach / leak / exposed" wording. W34 B2 → `popia_breach` red, both phones. `node --test automation/tests/W34.test.mjs` 31/31 pass; W22 20/20 pass, 2 skipped. | W34.json "Detect breach report", W22.json registry |
| G2 night DND | **Open.** `popia_breach` is not always_send; waits on NH-29(d) (Jonathan). | W22.json comment |
| G3 notice templates | **Closed.** `docs/breach-notification-drafts.md` + `automation/templates/breach_subject_notice.json` (HELD). Register Part 3 l.132 still says "templates live in W34": stale wording (contracts-drafter). | |
| G4 72 h wording | **Closed.** Steps 5/6 now say "as soon as reasonably possible". | register Part 3 |
| G5 incidents columns / console button | **Open** (platform-architect). W34 notes it as known. | smc_03 migration l.225 |
| G6 access-log evidence | **Open** (devops-security). Step 3 still doesn't require it. | register Part 3 |
| G7 practitioner review | **Open** (GATE-OPINION). | |
| G8 system-level drill | **Open.** Scheduled 2027-01-21. | drill-calendar.md |

## New gaps
| # | Gap | Fix | Owner |
|---|---|---|---|
| G9 | W34 B2 misses wrong-recipient reports (EN and AF): "sent to me by mistake", "not my lead/client", "someone else's client", "wrong broker/adviser/person", "per ongeluk aan my gestuur". Detector check: 0 of 4 wrong-recipient emails matched; the DSR control email correctly did not match. | Add a `misdirected` pattern pair (EN + AF), with tests in W34.test.mjs. Accept some false positives: they only open a draft for a person to read. Not edited here, because W34 is under active edit by automation-engineer. | automation-engineer |
| G10 | Brokers report problems by WhatsApp to support, not by email to howzit@. B2 only watches howzit@. | Route a broker "wrong lead" / "not mine" WhatsApp reply (W03/W05 broker side) to the same detector. | automation-engineer, conversation-designer |
| G11 | Register Part 3 step 9 says "twice a year" but the calendar is quarterly; l.132 points to W34 for templates. | Reword both lines. | contracts-drafter |

## Verdict
Desk drill complete. Timing against targets: contained T+1 h 20 (target 1 h from *knowing*: met from 09:00, missed from the email's arrival because of G9); assessment and drafts T+4 h (met). **G9 should be fixed before the first live lead**, alongside G2. The system-level drill (G8) is still due on 2027-01-21.

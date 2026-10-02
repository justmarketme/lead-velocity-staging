// Hand-authored art direction per concept variant: the ON text (hook zone), which generic picture a row uses, and the still key-frame.
// Everything else (row times, captions, end-card time, duration) is parsed from performance-creative-director/creative-briefs/C{nn}.md by render-concepts.mjs.
// ON line syntax: **amber** ~~strike~~ ; "---" rule ; "@chips" Video/WhatsApp/Phone ; "[x] text" ticked box, "[ ] text" empty box ; "text|pram@0.5" line with a drawing icon.
const CH = { on: ['@chips'] }, DEC = { on: ['You decide after.'] }, W30 = { on: ['30 minutes.'], v: 'wedge' }, REAL = { on: ['Real numbers.'] };
export const ART = {
  C01: [{ vid: 'C01', hid: 'H1', hook: 'Most work life cover stops at 2–4× salary.', tabs: 0, status: 'rendered', teal: true,
    rows: [{ on: ['Most work life', 'cover stops at', '**2–4× salary.**'] }, { on: ["The bond and", "the bills don't."] }, { on: ['**the gap**'] }, { on: ['Easy to miss.'] }, CH, REAL, DEC], still: { row: 2, lt: .6 } }],
  C02: [
    { vid: 'C02A', hid: 'H2', hook: 'R1.4m bond. 3× salary cover. Do the maths.', tabs: 0, status: 'hold (NH-PCD-02)', tag: 'Illustrative example. Not advice.',
      rows: [{ on: ['R1.4m bond', '3× salary cover', '---', '**= ?**'], ruleAt: .4 }, { on: ['R1.4m bond', '3× salary cover', '---', '**= a gap**'], flipLine: 3 }, { on: ["Every family's", 'numbers differ.'] }, { on: ['30 minutes.'] }, CH], still: { row: 1, lt: 1, onRow: 1, noVis: true } },
    { vid: 'C02B', hid: 'H12', hook: '3 lines on a payslip worth a look.', tabs: 1, status: 'rendered', variant: 'h12',
      rows: [{ on: ['3 lines on a payslip worth a look.'] }, { on: ['1. Gross vs net'] }, { on: ['2. Retirement fund'] }, { on: ['**3. Group life cover**'] }, { on: ['Enough for a bond and the bills?'] }, CH, DEC], still: { row: 3, lt: .8, onRow: 0 } }],
  C03: [{ vid: 'C03', hid: 'H3', hook: 'Bond approved. Champagne open. Cover checked?', tabs: 0, status: 'rendered',
    rows: [{ on: ['[x] Bond approved', '[x] Champagne open', '[ ] **Cover checked?**'], tick: [.2, .5], pulse: { line: 2, at: 1.5 }, size: 84 }, { on: ['[ ] **Cover checked?**'], size: 100 }, { on: ['A new bond can outgrow old cover.'] }, W30, CH, REAL, { on: ['[x] Bond approved', '[x] Champagne open', '[x] **Cover checked**'], tick: [0, 0, .3], size: 84 }], still: { row: 0, lt: 2, onRow: 0, noVis: true } }],
  C04: [{ vid: 'C04', hid: 'H4', hook: 'New baby. New bond. Same old cover?', tabs: 0, status: 'rendered',
    rows: [{ on: ['New baby.|pram@.5', 'New bond.|house@.7', 'Same **old** cover?'], beats: [0, .2, .4] }, { on: ['Same ~~old~~ cover?', 'Check it.'], beats: [0, .5], strikeAt: .15 }, { on: ['Who depends on the income?'] }, W30, CH, DEC], still: { row: 1, lt: 1.5, on: ['New baby.|pram', 'New bond.|house', 'Same ~~old~~ cover?', '**Check it.**'], noVis: true } }],
  C05: [{ vid: 'C05', hid: 'H5', hook: 'Cover set up at 28. Life at 40.', tabs: 0, status: 'rendered',
    rows: [{ on: ['Cover set up', 'at **28**.', 'Life at 40.'] }, { on: ['A bond.', 'Kids. School.'] }, { on: ['The cover did not grow with it.'] }, W30, CH, REAL, DEC], still: { row: 2, lt: 1, onRow: 0 } }],
  C06: [{ vid: 'C06', hid: 'H9', hook: 'Many families carry more than one household.', tabs: 0, status: 'rendered',
    rows: [{ on: ['Many families carry more than one household.'] }, { on: [] }, { on: ['Often all on one income.'] }, { on: ['Cover set up for one roof.'] }, { on: ['30 minutes.'] }, CH, DEC], still: { row: 2, lt: 1, onRow: 0 } }],
  C07: [{ vid: 'C07', hid: 'H13', hook: "Parents, kids, a sister's fees. One payslip.", tabs: 0, status: 'rendered',
    rows: [{ on: ["Parents, kids, a sister's fees. One payslip."] }, { on: ['One payslip.'] }, { on: ['More people than a form shows.'] }, { on: ['Worth counting.'] }, W30, CH, DEC], still: { row: 0, lt: 2.3, onRow: 0 } }],
  C08: [{ vid: 'C08', hid: 'H6', hook: 'No sales visit. No jargon. 30 minutes.', tabs: 0, status: 'rendered',
    rows: [{ on: ['No sales visit.', 'No jargon.', '**30 minutes.**'] }, { on: ['**30 minutes.**'], size: 140 }, CH, { on: ['Pick a time in WhatsApp.'], v: 'picker', slots: ['Tue 10:00', 'Wed 12:30', 'Thu 15:00'] }, { on: ['Plain words. Real numbers.'] }, DEC], still: { row: 0, lt: 2.2, on: ['**30 minutes.**'] } }],
  C09: [{ vid: 'C09', hid: 'H14', hook: 'Lunch break. Phone or video. 30 minutes.', tabs: 0, status: 'rendered',
    rows: [{ on: ['Lunch break.', 'Phone or video.', '**30 minutes.**'], v: 'wedge', wedgeFrom: 0, wedgeDelay: .3 }, { on: ['30 minutes. Done.'], v: 'wedge', wedgeFrom: 0, wedgeDelay: .3 }, { on: ['No office. No traffic.'] }, { on: ['Picked in WhatsApp.'], v: 'picker', slots: ['10:00', '12:30', '15:00'] }, { on: ['A reminder first.'], v: 'reminder', text: 'Reminder: call at 12:30 today' }, DEC], still: { row: 0, lt: 2, onRow: 0, wedge: true } }],
  C10: [{ vid: 'C10', hid: 'H7', hook: 'No boss. No payslip. No group cover.', tabs: 0, status: 'rendered',
    rows: [{ on: ['No boss.', 'No payslip.', '**No group cover.**'], beats: [0, .2, .4], slide: 'left' }, { on: ['**No group cover.**'], size: 110 }, { on: ['The only cover is the one they set up.'] }, W30, CH, DEC], still: { row: 0, lt: 1, onRow: 0, noVis: true } }],
  C11: [{ vid: 'C11', hid: 'H15', hook: 'Business owners: nobody sets up their cover.', tabs: 0, status: 'rendered',
    rows: [{ on: ['Business owners: nobody sets up their cover.'] }, { on: ['**Own cover**'], size: 120 }, { on: ['The owner is the business.'] }, W30, { on: ['Book around the work.'], v: 'picker', slots: ['Tue 10:00', 'Wed 12:30', 'Thu 15:00'] }, { on: [] }], still: { row: 0, lt: 2, onRow: 0 } }],
  C12: [
    { vid: 'C12A', hid: 'H18', hook: 'No price in this ad. On purpose.', tabs: 0, status: 'rendered', variant: 'h18',
      rows: [{ on: ['No price in this ad. **On purpose.**'] }, { on: ['The real cost depends on…'] }, { on: ['A guess is not a number.'] }, W30, CH, DEC], still: { row: 0, lt: 1, onRow: 0 } },
    { vid: 'C12B', hid: 'H8', hook: 'Life cover costs less than most people think.', tabs: 1, status: 'hold (NH-PCD-04)', variant: 'h8',
      rows: [{ on: ['Life cover costs less than most people think.'] }, { on: [] }, { on: ['No price in this ad. On purpose.'] }, W30, CH, DEC], still: { row: 1, lt: 1, onRow: 0 } }],
  C13: [{ vid: 'C13', hid: 'H16', hook: 'Checking cover is not the same as buying.', tabs: 0, status: 'rendered',
    rows: [{ on: ['Checking cover is not the same as buying.'] }, { on: ['A check = 30 minutes.'] }, { on: ['Real numbers. Where the gaps are.'] }, { on: ['Then you decide.'] }, { on: ["'Not now' is a normal answer."] }], still: { row: 3, lt: 1, onRow: 0 } }],
  C14: [{ vid: 'C14', hid: 'H10', hook: "Here's exactly what happens on the call.", tabs: 0, status: 'rendered',
    rows: [{ on: ["Here's exactly what happens on the call."] }, { on: ['1. A few quick questions.'] }, { on: ['2. A WhatsApp in about a minute.'] }, { on: ['3. Pick a time in WhatsApp.'] }, { on: ['4. A 30-minute call.'] }, { on: ['The gap, in plain words.'] }, { on: ['5. You decide after.'] }, { on: ['A reminder before the call.'], v: 'reminder', text: 'Reminder: call at 12:30 today' }, { on: ["That's every step."] }], still: { row: 2, lt: 1, onRow: 0 } }],
  C15: [{ vid: 'C15', hid: 'H17', hook: 'Real numbers. A licensed adviser. Decide after.', tabs: 0, status: 'rendered',
    rows: [{ on: ['Real numbers.', 'A licensed adviser.', 'Decide after.'], beats: [0, .2, .4], ul: [0, .6, 1.2] }, { on: ['That is the whole call.'] }, { on: ["We don't sell cover."] }, { on: ['We find the time.'], v: 'picker', slots: ['Tue 10:00', 'Wed 12:30', 'Thu 15:00'] }, { on: ['Bond. Income. Who depends on it.'] }, { on: ['Free to check.'] }], still: { row: 0, lt: 2, on: ['Real numbers.', 'A licensed adviser.', 'Decide after.'], ul: [0, 1, 2], ulFinal: 1, noVis: true, disclosure: true } }],
};

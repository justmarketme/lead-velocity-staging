# W10 notes

R5-11 (verified, no bug): in "Decide no-call", `op: 'cancel_all'` only labels the item; the IF "Booking still live? (confirm cancel first)" sends a live booking to "Cancel confirm buttons" alone (nothing is cancelled yet), and only the no-live-booking branch runs "W09 cancel all (no call)".
The booking itself is cancelled (and W09 reminders cancelled via applyCancel `w09: 'cancel_all'`) only after the lead taps `cancel_yes`, so the lead is never asked to confirm a cancellation that already happened (asserted in tests/W10.test.mjs "R5-11").

# Rubric: pre-call brief to the adviser — faculty `broker`

Sample: 5 briefs per day (all briefs for leads who asked a deferred question or volunteered a health detail, then random). Owner: `conversation-designer`. Sources: 4.11, 2.1.7, 4.12a.

| ID | Rule | Pass test | Severity |
|---|---|---|---|
| B-01 | **Bands only** | Age and budget appear only as bands; no exact income, ID number or address | high |
| B-02 | **The lead's own words** | When the lead wrote any free text, the "what mattered" line quotes it (short, verbatim, redacted); empty only if there was none | high |
| B-03 | **Health and ID** | Says only "has a health question for you"; never the detail | critical |
| B-04 | **Everything needed to make the call** | Method and join link or number to call, alternative number, best time to reach, preferred language, SAST time and date | high |
| B-05 | **No advice, no steering** | No suggested product, cover amount, premium, or "you should recommend" | critical |
| B-06 | **Questions the bot deferred** | Every deferred question appears, in the lead's words | high |
| B-07 | **Correct people and time** | Lead first name, broker, time and method match the booking row; sent about 15 minutes before | high |
| B-08 | **Readable in 30 seconds** | <= 120 words, Grade 5-7, headings consistent with the template | medium |
| B-09 | **Consent and source line** | Shows how they came in (ad angle, never spend or CPL) and that consent is on file | medium |
| B-10 | **No other broker, no cost data** | Never mentions other brokers, ad spend, CPL, creative names | high |

# Mark · How your leads work

Recovered and completed on 7 October 2026 from the interrupted Claude Code `mark-flow-film` build. This is the four-chapter film with 63 narration clips, not the 6 October onboarding video or the separate internal status film.

The requested deliverable is `video/Mark-How-Your-Leads-Work-WhatsApp.mp4`. It includes Andrew's narration, visible captions and four chapter markers. The HD copy and SRT subtitles are in the same folder. The recovered thumbnail is available in three sizes.

Chapters: the client's WhatsApp journey; Mark's side and A/B leads; the nine requests and agreement v0.2; onboarding and payment.

## Visual and payment revision

The filmed UI now carries the thumbnail’s dark plum background, pink and purple accents, dotted texture and bright typography through the WhatsApp, portal and agreement scenes. A bespoke closing card uses the same visual language. The three-working-day delivery claim is removed from the script, audio, captions and illustrated screen; work begins once payment is made.

## Requested revision

The MP4 now opens with the supplied thumbnail and embeds it as attached cover artwork. WhatsApp screens use a narrow iPhone-style frame with a camera cutout and home indicator. The goodwill explanation covers consistent WhatsApp nurturing, opt-in/opt-out, early attendance signals, rescheduling first and replacement through the goodwill process. The website-update reference was removed and that narration regenerated.

## Source and changes

- Source script, source cross-check and all narration clips recovered from the Claude Code scratchpad. The completed A-tier pronunciation fix is preserved.
- The signing beat now follows contract clause 24.1: sign the PDF and return it by email. Its narration was regenerated in the same voice and rate.
- The portal introduction describes the setup journey without claiming that the unfinished production login routing has already been changed. Its narration was regenerated.
- The practice name was explicitly unconfirmed in the recovered source. The MP4 masks that name rather than naming an unconfirmed firm. FSP 28418 and Mark Weston remain visible.
- Calendar event subject follows the updated code: SortMyCover call – Sipho – Teams.
- All data shown is illustrative. The video does not send messages, sign anything, take payments or make bookings.

The full implementation discrepancies remain documented in `script-sources.md`. This task completes the explainer; it does not deploy the WhatsApp flow or change the production portal. Nothing has been sent to Mark.

## Rebuild

`node build.mjs` checks and regenerates changed narration using installed edge-tts, then builds `index.html` from `src/template.html`. `node build.mjs --page` reuses audio. The local interactive review version asks for the confirmed practice name before displaying those screens.

Serve this folder at `http://127.0.0.1:8766/` with `python -m http.server 8766 --bind 127.0.0.1`, then run `node export-video.mjs`. Requires ffmpeg, ffprobe, Chrome, and puppeteer-core from the existing onboarding-film build. The exporter captures each illustrated screen and its selected outcome, joins narration, normalises loudness, and writes a smaller WhatsApp file.

## Verification

`node qa/check.mjs` checks every beat at desktop and 390px phone width, key interaction branches, media playback, reduced motion, pause/resume and all 63 narration files. Its report is in `qa/verification.json`. Final MP4 verification is in `video/verification.json`.

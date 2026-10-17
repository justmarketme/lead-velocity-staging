# Shared production spec for C01–C15 (read with each brief)

**Pipeline (4D.5):** HTML/SVG composition from `/brand/tokens.css` + `/brand/templates/`. Stills are headless Chromium screenshots. Motion is Playwright frame capture at 30 fps, then ffmpeg (H.264, yuv420p, faststart). No photography. No people. No Flow in cycle 1.

**AI label:** none. Cycle 1 has no photoreal or AI imagery, so `ai_label=false` on every asset. If a Flow scene is ever dropped in (the week-3 experiment only), the label becomes mandatory on that asset, and the asset gets a new concept suffix (`C01F`).

## Format set (every concept unless the brief says otherwise)
| Asset | Size | Placement | Notes |
|---|---|---|---|
| **9:16 motion** (master) | 1080×1920, 15–30 s | Reels, Stories | The timeline in each brief. The end card is the last 3 s (`reels-endcard.html`) |
| **4:5 motion** | 1080×1350, same timeline | Feed placement of the same video ad | Re-laid out: type ×0.88, visuals rearranged as each brief says. 4:5 end card = `reels-endcard` with `layout:"r4x5"` (template owed) |
| **4:5 still** | 1080×1350 | Feed (static ads, cycle-2 static arm) | The end state of the payoff frame: hook + visual + line + wordmark |
| **1:1 still** | 1080×1080 | Feed, right column, WhatsApp share | Same as 4:5, tighter |
| **6-s motion still** (some concepts only) | 1080×1350, 6.0 s loop | Feed | Hook at 0.0, the one motion beat by 0.5 s, payoff by 4 s, line + wordmark on screen throughout. Concepts: C01, C02, C08, C12 |

## 9:16 grid (y px)
- 0–250: no text. Background only.
- 266–330: **tick mark** 64 px at x 72. On every frame except the end card, where the full mark takes over.
- 360–900: **hook / kinetic headline zone.** DM Sans 800, 96 px, line-height 1.05, max 4 lines, left-aligned at x 72, max width 936.
- 900–1300: **visual zone** (bars, checklist, icons, phone mock).
- 1330–1560: **caption lane.** DM Sans 500, 44 px, `--sm-off-white` on a `--sm-charcoal-2` rounded block (radius 12, padding 16/24). Max 2 lines, max width 860, left at x 72.
- 1580–1920: no text.

## 4:5 / 1:1 still grid
Follows `brand/templates/feed.html`. The hook sits top at 72 px margins (78 px in 1:1, 88 px in 4:5). The visual takes the middle. The line (36 px, 800) sits at bottom 112. The wordmark is bottom-left at bottom 44. The bottom-right stays empty.

## Motion vocabulary (two styles only, 4D.5)
- **K (kinetic type):** words slam in (scale 1.08→1.0, 180 ms, ease-out) or slide up 40 px (220 ms). One phrase per beat.
- **G (gap bars):** horizontal bars grow from the left (400–600 ms, ease-out). An amber bar is the thing the hook is about. Off-white outlined bars (4 px stroke) are the comparison. The bracket "the gap" draws in 300 ms.
- **Cut** = hard cut. No crossfades longer than 120 ms. No camera shake, no glitch effects, no whooshes.
- **Ticks inside checklists** are generic off-white strokes in square boxes, and they **pop** in (120 ms scale). They never draw: the draw belongs to the brand tick on the end card.

## End card (all videos, last 3.0 s)
`reels-endcard.html` defaults: the tick draws (400 ms) → the wordmark fades up (200 ms) → the line "Sort your cover. / 30 minutes. / **A real adviser.**" → the amber pill "Tap to check your cover" → the fine line "SortMyCover is a service of Lead Velocity (Pty) Ltd". The end card has no caption lane.

## Captions
- Every timeline row below gives `CAP`. That is the burned-in caption text, verbatim. The kinetic headline (`ON`) and the caption never say the same words in the same frame.
- **Audio:** the master is silent. There is no voiceover. meta-operator may add a Meta Sound Collection track at upload (ASSUMPTION: confirm availability). Silence is acceptable.

## File naming and manifest
- **Ad name (media-buyer §2):** `C{nn}_{H#}_{fmt}-{col}_{YYYYMMDD upload}`. `fmt` ∈ `vid|sta|mot|car`, `col` ∈ `amb|teal`. One video ad carries both its 9:16 and its 4:5 motion (placement asset customisation).
- **File name:** `C{nn}_{H#}_{fmt}-{col}-{ratio}_{YYYYMMDD render}.{mp4|png}`, with `ratio` ∈ `9x16|4x5|1x1`. Example: `C01_H1_vid-amb-9x16_20261012.mp4`.
- **Captions sidecar** (for QA, not uploaded): `…_captions.srt` next to each video.
- **Manifest:** `deliverables/visual-producer/assets/manifest.csv`, one row per file. Columns:
  `file,concept,hook_id,angle,fmt,colour,ratio,width,height,duration_s,size_kb,template,timeline_ref,frame1_text,end_card_line,ai_label,status,compliance_qa,meta_review,ad_name,render_date`
  `status` ∈ `rendered|qa_pass|submitted|approved|live|hold|replaced`.

## QA before hand-off (visual-producer self-check; compliance-qa re-checks)
1. The frame at t = 0.0 s shows hook text (the first phrase at least), and the full hook is on screen by 0.5 s. Three-beat hooks (C04, C10, C15) stagger in at 0.0 / 0.2 / 0.4 s.
2. Something moves between 0.2 and 0.5 s.
3. The payoff is on screen by 6.0 s.
4. No gap between cuts is longer than 3.0 s, excluding the end card.
5. No text sits in y < 250 or y > 1580 (9:16).
6. The tick is on every frame.
7. The line appears once, verbatim.
8. No hex outside tokens. No "you/your" except the line ("Sort your cover…"), "Tap to check your cover", "you decide after" and "your own time".
9. No exclamation marks.
10. File sizes are within limits.

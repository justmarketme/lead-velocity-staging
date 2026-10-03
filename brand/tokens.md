# SortMyCover tokens v1.0.0

Generated from `tokens.json` by `npm run tokens`. Edit the JSON, never this file.

## Palette

| Token | Hex | RGB | CMYK (naive) | Role |
|---|---|---|---|---|
| `amber` | #F5A623 | 245, 166, 35 | 0, 32, 86, 4 | brand accent: the device, highlights, CTA fill |
| `charcoal` | #1F2933 | 31, 41, 51 | 39, 20, 0, 80 | brand ground and body text on light |
| `offWhite` | #FBF8F2 | 251, 248, 242 | 0, 1, 4, 2 | brand paper and text on dark |
| `accentText` | #2A1B02 | 42, 27, 2 | 0, 36, 95, 84 | text and tick ink on amber |
| `black` | #000000 | 0, 0, 0 | 0, 0, 0, 100 | one-colour (mono) logo only |
| `white` | #FFFFFF | 255, 255, 255 | 0, 0, 0, 0 | one-colour (mono) logo only; cards on light surfaces |
| `charcoal2` | #2B3845 | 43, 56, 69 | 38, 19, 0, 73 | raised surface on charcoal |
| `offWhite2` | #F1ECE2 | 241, 236, 226 | 0, 2, 6, 5 | raised surface on off-white |
| `muted` | #5C6672 | 92, 102, 114 | 19, 11, 0, 55 | secondary text on off-white |
| `rule` | #DCD6CB | 220, 214, 203 | 0, 3, 8, 14 | hairlines and borders on off-white |
| `amberDark` | #B86E0A | 184, 110, 10 | 0, 40, 95, 28 | amber as text on off-white, large text only |
| `darkBg` | #15181C | 21, 24, 28 | 25, 14, 0, 89 | dark-mode page background (web) |
| `darkCard` | #1C2027 | 28, 32, 39 | 28, 18, 0, 85 | dark-mode surface (web) |
| `darkMuted` | #A9AFB7 | 169, 175, 183 | 8, 4, 0, 28 | dark-mode secondary text (web) |
| `darkText` | #F1EDE5 | 241, 237, 229 | 0, 2, 5, 5 | dark-mode text (web) |

Notes: `accentText` #2A1B02 is the ink on amber for text and for the tick (the approved ad mock-up and landing page draw the tick in this near-black brown, not in charcoal). Mono logos use `black`/`white` only. Semantic colours for the console (success, warn, danger) are separate and never used in brand; the one status green that appears in the approved landing reference belongs to the web app, not to this palette.

## Semantic roles

| Role | Maps to |
|---|---|
| `bg` | `offWhite` |
| `text` | `charcoal` |
| `bgInverse` | `charcoal` |
| `textInverse` | `offWhite` |
| `accent` | `amber` |
| `surface` | `white` |
| `surfaceRaised` | `offWhite2` |
| `textMuted` | `muted` |
| `border` | `rule` |
| `bgDark` | `darkBg` |
| `surfaceDark` | `darkCard` |
| `textDark` | `darkText` |
| `textMutedDark` | `darkMuted` |

## WCAG 2.x contrast (computed from the hex values)

| Foreground on background | Ratio | AA body (4.5) | AA large (3.0) | Rule |
|---|---|---|---|---|
| Body text on off-white (default) (#1F2933 on #FBF8F2) | 13.92:1 | pass | pass | OK for all text |
| Body text on charcoal (default) (#FBF8F2 on #1F2933) | 13.92:1 | pass | pass | OK for all text |
| CTA text and tick ink on amber (#2A1B02 on #F5A623) | 8.25:1 | pass | pass | OK for all text |
| Charcoal on amber (#1F2933 on #F5A623) | 7.28:1 | pass | pass | OK for all text |
| Amber on charcoal: highlights and headline emphasis (#F5A623 on #1F2933) | 7.28:1 | pass | pass | Passes AA for all text (7.28:1). Brand policy, not a WCAG limit: large text and device only, never body copy. |
| Amber on off-white (#F5A623 on #FBF8F2) | 1.91:1 | fail | fail | DO NOT USE for text. Device and fills only. |
| Dark amber on off-white (#B86E0A on #FBF8F2) | 3.76:1 | fail | pass | Large text only (18.66 px bold / 24 px). |
| Muted text on off-white (#5C6672 on #FBF8F2) | 5.51:1 | pass | pass | OK for all text |
| Off-white on amber (#FBF8F2 on #F5A623) | 1.91:1 | fail | fail | DO NOT USE. |
| Dark-mode text on dark background (#F1EDE5 on #15181C) | 15.25:1 | pass | pass | OK for all text |
| Amber on dark-mode background (#F5A623 on #15181C) | 8.79:1 | pass | pass | Passes AA. Same brand policy: large text and device only. |
| Off-white on raised charcoal (#FBF8F2 on #2B3845) | 11.29:1 | pass | pass | OK for all text |

**Rules that follow:** body text is always off-white (on charcoal) or charcoal (on off-white). Amber is for the device, highlights and CTA fills; text on amber is `accentText` (or charcoal). Amber text on charcoal is a brand policy limit (24 px and up, or 18.66 px bold and up): the computed ratio is 7.28:1, which passes WCAG AA at every size, so the master prompt's wording "passes AA for large text only" (4D.4b.4) is stricter than the arithmetic; we keep the stricter rule as house style and flag the wording for correction. Amber never carries text on off-white.

## Type

- Family: "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
- SIL Open Font License 1.1 (fonts/OFL-DM-Sans.txt); self-hosted, no third-party request.
- Weights: 800 headlines, 500 body. Tabular numerals for every figure.
- UI scale (px): 32 / 24 / 18 / 16 / 14 (CSS vars `--sm-text-xl` to `--sm-text-sm`).
- Canvas scale for 1080-wide creative (UI x 3): 96 / 72 / 54 / 48 / 42 px (`--sm-canvas-*`). No creative text below 33 px on a 1080 canvas (11 CSS px on a phone).
- Line height 1.05 headlines, 1.4 body; headline letter-spacing -0.015em.

## Space and radius

Space (px): 1=4, 2=8, 3=12, 4=16, 5=24, 6=32, 7=48, 8=64, 9=96. Radius (px): sm=8, md=12, lg=16, xl=24, pill=999.

## Logo

Clear space: height of the tick circle on all sides. Minimum width: wordmark 96 px, tick 16 px. Paths are listed under `logo.paths` in tokens.json.

## Test-arm palette (teal variant): option B chosen

Test-arm only (experiment.tealOnCream); amber stays the default for every brand role. PCD chose option B on 2026-10-02: teal (`--sm-test-teal-accent`) on cream (`--sm-test-cream`) (ink on teal is the same cream). Option A (the earlier teal on off-white) is superseded.

| Option | Foreground on background | Ratio | AA body (4.5) | AA large (3.0) | Status |
|---|---|---|---|---|---|
| A | earlier teal on off-white (values in the 2026-10-02 PCD note) | 5.16:1 | pass | pass | superseded |
| **B (chosen)** | **`--sm-test-teal-accent` on `--sm-test-cream`** | **5.30:1** | pass | pass | **in tokens now (`--sm-test-teal-accent`, `--sm-test-teal-ink`, `--sm-test-cream`)** |

Both pass AA at every size. Test-arm assets use the cream ground; the logo shapes are unchanged except the tick (teal disc, cream check).

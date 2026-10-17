# SortMyCover site imagery: Google Flow + Canva brief (16 Oct 2026)

Jono's direction: no stock photography. Generate the site's people scenes in **Google Flow** (images) and finish them in **Canva Premium** (crop, colour grade, brand frame). Together the scenes must show **Black, Coloured, Indian and white South African** households, roughly 35–50 years old, middle-income homes in Joburg, Pretoria, Durban and Cape Town.

Each file replaces one entry in `sites/sortmycover/src/content/imagery.ts`. Export WebP, 1440 px wide, under 250 KB.

## Shared style (append to every prompt)
> Photorealistic editorial lifestyle photograph, natural window light, warm neutral palette with a soft amber accent (#F5A623) somewhere in the scene, shallow depth of field, candid and unposed, modern South African suburban home, 35mm lens, no text, no logos, no watermarks, no visible screens with readable content, no money, no hospital, no distress.

## Scenes
All 25 slots (13 home, 10 campaign pages, 2 hubs) with their prompt cores are in `sites/sortmycover/src/content/imagery.ts`. The first full set was generated in Higgsfield on 16 Oct 2026 (Chrome was not reachable for Flow); see `image-sources.md`.

## Rules (CODEX-BRIEF section 6, site compliance)
- These are decorative life scenes. Never captioned or presented as clients, advisers, testimonials or outcomes.
- **Decided by Jono, 16 Oct 2026:** no image on the site carries an AI-generated label, and no stock photography is used. Every image slot has its own fresh scene, never reused (enforced by tests/imagery.test.ts). The full slot list and each Flow prompt live in sites/sortmycover/src/content/imagery.ts.
- Check each Flow output for extra fingers, warped text and uncanny faces before use; regenerate rather than retouch faces.
- Generation date, tool and file sizes are recorded in `image-sources.md`.

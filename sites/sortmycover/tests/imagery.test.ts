/* Every image slot has its own scene (Jono, 16 Oct 2026): no file is used twice, every file exists, every campaign has one,
   and no page source points at an image outside src/content/imagery.ts. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_SCENES, HERO_MOSAIC, SCENES } from "../src/content/imagery";
import { ANGLES } from "../src/campaigns";

const pub = path.resolve(__dirname, "../public");
const scenes = Object.values(SCENES);

describe("imagery", () => {
  it("no two slots share an image, and every image file exists", () => {
    const srcs = scenes.map((s) => s.src);
    expect(new Set(srcs).size).toBe(srcs.length);
    for (const s of srcs) expect(fs.existsSync(path.join(pub, s)), s).toBe(true);
  });
  it("every campaign page has its own scene, and campaign scenes are not reused elsewhere", () => {
    for (const a of ANGLES) expect(CAMPAIGN_SCENES[a.slug], a.slug).toBeTruthy();
    const c = Object.values(CAMPAIGN_SCENES).map((s) => s.src);
    expect(new Set(c).size).toBe(c.length);
    expect(HERO_MOSAIC.some((h) => c.includes(h.src))).toBe(false);
  });
  it("pages take people images only from imagery.ts", () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const offenders = walk(path.resolve(__dirname, "../src")).filter((f) => /\.tsx?$/.test(f) && !f.endsWith("imagery.ts") && /["']\/[^"']+\.(webp|jpe?g|avif)["']/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("no image is labelled as AI-generated on the page (Jono's decision, 16 Oct 2026)", () => {
    for (const s of scenes) expect(s.alt).not.toMatch(/AI|generated/i);
  });
});

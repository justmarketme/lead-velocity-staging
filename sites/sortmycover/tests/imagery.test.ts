/* Every image slot has its own scene (Jono, 16 Oct 2026): no file is used twice, every file exists, every campaign has one,
   and no page source points at an image outside src/content/imagery.ts. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AD_SCENES, ARTICLE_SCENES, CAMPAIGN_SCENES, HERO_MOSAIC, PAGE_SCENES, SCENES } from "../src/content/imagery";
import { articleMetas } from "../src/content";
import { DIAGRAM_SLUGS } from "../src/components/Visuals";
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
  it("ad continuity (Jono, 18 Oct 2026): each ad's photo is on its campaign page and on the guide the ad links to", () => {
    for (const [angle, { scene, article }] of Object.entries(AD_SCENES)) {
      expect(CAMPAIGN_SCENES[angle], angle).toBe(scene);
      expect(ARTICLE_SCENES[article], article).toBe(scene);
      // Jono, 18 Oct 2026: an ad's photo belongs to its own post only, never to a second post or page
      const posts = Object.entries(ARTICLE_SCENES).filter(([, v]) => v.src === scene.src).map(([k]) => k);
      expect(posts, angle).toEqual([article]);
      expect(Object.values(PAGE_SCENES).some((v) => v.src === scene.src), angle).toBe(false);
    }
  });
  it("every guide has a photo, and apart from the ad pairs no photo is used for two guides or pages", () => {
    // a photo, or (once the ad stills ran out, 18 Oct 2026) the guide's own code-drawn diagram
    for (const a of articleMetas) expect(ARTICLE_SCENES[a.slug] || DIAGRAM_SLUGS.includes(a.slug), a.slug).toBeTruthy();
    const adSrcs = new Set(Object.values(AD_SCENES).map((x) => x.scene.src));
    const used = [...Object.values(ARTICLE_SCENES), ...Object.values(PAGE_SCENES)].map((x) => x.src).filter((x) => !adSrcs.has(x));
    expect(new Set(used).size).toBe(used.length);
    const others = Object.entries(CAMPAIGN_SCENES).filter(([k]) => !AD_SCENES[k]).map(([, v]) => v.src);
    for (const o of others) expect(used, o).not.toContain(o);
  });
  it("the home mosaic tiles ship at about 720px wide (a tile shows at 460px at most), with their real sizes in imagery.ts", () => {
    // WebP size from the RIFF header: lossy 'VP8 ', lossless 'VP8L' or extended 'VP8X'
    const size = (f: string) => {
      const b = fs.readFileSync(f);
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
      if (kind === "VP8L") { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
      return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    };
    for (const h of HERO_MOSAIC) {
      expect(size(path.join(pub, h.src)), h.src).toEqual([h.w, h.h]);
      expect(h.w, h.src).toBeLessThanOrEqual(800);
      expect(fs.statSync(path.join(pub, h.src)).size, h.src).toBeLessThan(80_000);
    }
  });
  it("no image is labelled as AI-generated on the page (Jono's decision, 16 Oct 2026)", () => {
    for (const s of scenes) expect(s.alt).not.toMatch(/AI|generated/i);
  });
});

/* Phone layout rules in the source CSS that jsdom cannot measure: where a guide deep link lands under the pinned
   "On this page" box, the TOC marker's padding, and 44px tap targets (Apple / Android guidance; WCAG 2.5.8 is met already). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (f: string) => fs.readFileSync(path.resolve(__dirname, "../src", f), "utf8");
/** Every rule as [media query or "", selector, declarations], in source order. */
function rules(css: string) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: [string, string, Record<string, string>][] = [];
  const walk = (s: string, media: string) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf("{", i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (depth && j < s.length) { if (s[j] === "{") depth++; else if (s[j] === "}") depth--; j++; }
      const body = s.slice(open + 1, j - 1);
      if (head.startsWith("@media")) walk(body, head.replace(/\s+/g, ""));
      else if (!head.startsWith("@")) {
        const decls: Record<string, string> = {};
        for (const d of body.split(";")) { const k = d.indexOf(":"); if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
        for (const sel of head.split(",")) out.push([media, sel.trim(), decls]);
      }
      i = j;
    }
  };
  walk(css, "");
  return out;
}
/** The value that wins for selector + property in that media context (later rules win; equal specificity assumed). */
const value = (css: string, sel: string, prop: string, media = "") =>
  rules(css).filter(([m, s, d]) => m === media && s === sel && prop in d).map(([, , d]) => d[prop]).pop();

const index = src("index.css"), visuals = src("styles/visuals.css"), home = src("styles/home-redesign.css");
const PHONE = "@media(max-width:1239px)";

describe("guide sections on phones", () => {
  it("deep links land under the pinned box: scroll-margin 58px on top of html's 72px scroll-padding (130px, as a tap in the box)", () => {
    expect(index).toMatch(/scroll-padding-top:\s*72px/);
    expect(value(visuals, '.prose-sm h2[id^="s-"]', "scroll-margin-top", PHONE)).toBe("58px");
    expect(value(visuals, '.prose-sm h2[id^="s-"]', "scroll-margin-top")).toBeUndefined(); // the wide rail sits beside the text
  });
  it("the TOC marker (now an <li>) has no padding of its own", () => {
    expect(value(visuals, ".prose-sm .toc-list .toc-ind", "padding")).toBe("0");
  });
});

describe("tap targets of 44px or more", () => {
  it("TOC links on phones only: 15px x 1.35 + 2 x 12px", () => {
    expect(value(visuals, ".prose-sm .toc-list a", "padding", PHONE)).toBe("12px 0");
    expect(value(visuals, ".prose-sm .toc-list li", "padding", PHONE)).toBe("0");
    expect(value(visuals, ".prose-sm .toc-list a", "padding")).toBeUndefined();
  });
  it("header logo, home service links and home text links", () => {
    expect(value(index, ".site-header .logo", "padding-block")).toBe("10px");
    expect(value(index, ".smc-home .svc-list a", "min-height")).toBe("44px");
    for (const sel of [".hx-how-link", ".hx-panel-copy ul a"]) expect(value(home, sel, "min-height"), sel).toBe("44px");
    expect(value(index, ".home-text-link", "min-height")).toBe("44px");
  });
  it("breadcrumb links: 14px inline padding around the 12px text", () => {
    expect(value(index, ".breadcrumb a", "padding")).toBe("14px 0");
  });
  it("'Full wording' grows by 3px only, so it never covers the consent tick-box label above it", () => {
    expect(value(index, ".chat-more summary", "padding")).toBe("3px 0");
    expect(value(index, ".chat-more summary", "margin")).toBe("-3px 0");
  });
});

/* Brand palette guard (Jono, 18 Oct 2026: the site's darks must match the ads, which are flat charcoal #1F2933 with amber
   #F5A623). Off-palette values that crept in before: a bluer #2B3845 lift, navy #14212D / rgb(17,27,34) photo scrims,
   WhatsApp green #25D366 and cream #F6EFE0. The generated tokens.css still defines some of them and is not scanned. */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BANNED = [/#e9e2d5/i, /#0f151b/i, /#2b3845/i, /#14212d/i, /17\s*,\s*27\s*,\s*34/, /#25d366/i, /#f6efe0/i];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(css|tsx?)$/.test(f) && !p.endsWith("tokens.css") ? [p] : [];
  });
}

describe("brand palette", () => {
  it("no off-palette dark, navy, green or cream in the site source", () => {
    const hits: string[] = [];
    for (const f of files("src")) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((l, i) => { if (!/^\s*(\/\*|\/\/)/.test(l) && BANNED.some((r) => r.test(l))) hits.push(`${f}:${i + 1}`); });
    }
    expect(hits).toEqual([]);
  });
});

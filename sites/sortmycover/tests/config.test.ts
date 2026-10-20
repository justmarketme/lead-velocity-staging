import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { campaignAngles, csp, htaccess, vercelConfig } from "../src/build/hosts";
import { API_BASE } from "../src/lib/site";
import { hostLabel } from "../src/campaigns";

const root = path.resolve(__dirname, "..");

describe("deployment config", () => {
  it("committed vercel.json equals the generator output (drift guard: run npm run build)", () => {
    const committed = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
    expect(JSON.parse(committed)).toEqual(JSON.parse(JSON.stringify(vercelConfig())));
  });
  it("committed hostinger/.htaccess equals the generator output", () => {
    expect(fs.readFileSync(path.join(root, "hostinger/.htaccess"), "utf8")).toBe(htaccess());
  });
  it(".htaccess: apex /c/<id> and /j/<id> (W05 calendar file and join link) redirect 302 to n8n with ?k= kept, before the campaign host rules", () => {
    const lines = htaccess().split("\n");
    const apex = "RewriteCond %{HTTP_HOST} ^sortmycover\\.co\\.za$ [NC]";
    const ics = lines.indexOf("RewriteRule ^c/([^/]+)/?$ https://n8n.sortmycover.co.za/webhook/w05-ics-get/c/$1 [R=302,L,QSA]");
    const join = lines.indexOf("RewriteRule ^j/([^/]+)/?$ https://n8n.sortmycover.co.za/webhook/w05-join-get/j/$1 [R=302,L,QSA]");
    expect(ics).toBeGreaterThan(0);
    expect(join).toBeGreaterThan(0);
    expect(lines[ics - 1]).toBe(apex); // apex host only
    expect(lines[join - 1]).toBe(apex);
    const firstCampaign = lines.findIndex((l) => l.startsWith("RewriteRule ^$ /_c/"));
    expect(firstCampaign).toBeGreaterThan(join);
    // the patterns take one path segment (with or without a trailing slash) and nothing else
    const re = /^c\/([^/]+)\/?$/;
    expect(re.exec("c/bk_7f3a-91")?.[1]).toBe("bk_7f3a-91");
    expect(re.test("c/bk_7f3a-91/")).toBe(true);
    expect(re.test("c/a/b")).toBe(false);
    expect(re.test("_c/new-bond/")).toBe(false);
  });
  it("CSP allows only self, the Pixel domains, the n8n host and Turnstile; no unsafe-inline or unsafe-eval", () => {
    const c = csp();
    expect(c).not.toMatch(/unsafe-/);
    expect(c).toMatch(/script-src 'self' https:\/\/connect\.facebook\.net https:\/\/challenges\.cloudflare\.com(;|$)/);
    expect(c).toMatch(/style-src 'self';/);
    expect(c).toContain("connect-src 'self' https://n8n.sortmycover.co.za https://www.facebook.com https://connect.facebook.net");
    expect(c).toContain("frame-ancestors 'none'");
    expect(API_BASE.startsWith("https://n8n.sortmycover.co.za/")).toBe(true);
  });
  it("has one host root and one thanks route per campaign angle, before the filesystem handler", () => {
    const routes = vercelConfig().routes as Record<string, any>[];
    const fsIdx = routes.findIndex((r) => r.handle === "filesystem");
    for (const a of campaignAngles()) {
      const host = `${hostLabel(a)}.sortmycover.co.za`.replace(/\./g, "\\.");
      const root = routes.findIndex((r) => r.src === "^/$" && r.has?.[0]?.value === host);
      const thanks = routes.findIndex((r) => r.src === "^/thanks/?$" && r.has?.[0]?.value === host);
      expect(root, a.slug).toBeGreaterThanOrEqual(0);
      expect(root).toBeLessThan(fsIdx);
      expect(thanks).toBeGreaterThanOrEqual(0);
      expect(routes[root].dest).toBe(`/_c/${a.slug}/index.html`);
    }
  });
  it("noindex header on campaign hosts, none on the apex rule set", () => {
    const routes = vercelConfig().routes as Record<string, any>[];
    const r = routes.find((x) => x.headers?.["X-Robots-Tag"] === "noindex, nofollow")!;
    expect(r.has[0].value).toContain("sortmycover\\.co\\.za");
  });
  it("uses a single n8n base config value (switchable between n8n.leadvelocity.co.za and n8n.sortmycover.co.za)", () => {
    const site = JSON.parse(fs.readFileSync(path.join(root, "config/site.json"), "utf8"));
    expect(site.n8n_base).toMatch(/^https:\/\/n8n\./);
    const src = ["src/lib/site.ts", "src/lib/whatsapp.ts", "src/components/ChatWidget.tsx"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
    expect(src).not.toMatch(/https:\/\/n8n\.(leadvelocity|sortmycover)/);
  });
});

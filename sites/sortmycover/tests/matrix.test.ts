/* Acceptance matrix (spec B-02, B-06, B-11) run locally: a small emulator of Vercel's legacy `routes` semantics applied to the
   generated vercel.json against the real dist/ file list. It is not Vercel (the real check is a curl matrix against a deployment,
   spec C.5 / B-00A) but it proves the rule set does what the spec table says. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { vercelConfig, SECURITY_HEADERS } from "../src/build/hosts";
import { OLD_URL_MAP } from "../src/build/redirects";
import { ANGLES, hostLabel } from "../src/campaigns";

const dist = path.resolve(__dirname, "../dist");
const have = fs.existsSync(path.join(dist, "index.html"));
const files = new Set<string>();
const walk = (d: string, rel = "") => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name), rel + e.name + "/") : files.add("/" + rel + e.name); };
if (have) walk(dist);

interface Res { status: number; headers: Record<string, string>; served?: string }
function request(host: string, url: string): Res {
  const routes = vercelConfig().routes as Record<string, any>[];
  const headers: Record<string, string> = {};
  let p = url;
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (r.handle === "filesystem") {
      const f = files.has(p) ? p : files.has(p.replace(/\/$/, "") + "/index.html") && p.endsWith("/") ? p + "index.html" : null;
      if (f) return { status: 200, headers, served: f };
      continue;
    }
    const m = new RegExp(r.src).exec(p);
    if (!m) continue;
    if (r.has && !r.has.every((h: any) => new RegExp("^(?:" + h.value + ")$").test(host))) continue;
    for (const [k, v] of Object.entries(r.headers || {})) { if (!r.status) headers[k] = v as string; }
    if (r.status && r.status >= 300 && r.status < 400) return { status: r.status, headers: { ...headers, Location: (r.headers.Location as string).replace(/\$(\d)/g, (_: string, n: string) => m[+n] ?? "") } };
    if (r.dest && !r.status) { p = r.dest; const f = files.has(p) ? p : null; if (f) return { status: 200, headers, served: f }; continue; }
    if (r.status === 404) return { status: 404, headers, served: "/404.html" };
    if (r.continue) continue;
  }
  return { status: 404, headers };
}
const csp = (r: Res) => r.headers["Content-Security-Policy"];

describe.skipIf(!have)("routing acceptance matrix (emulated)", () => {
  it("B-02: every old .html URL returns 301 to the folder URL", () => {
    for (const o of OLD_URL_MAP) { const r = request("sortmycover.co.za", o.from); expect(r.status, o.from).toBe(301); expect(r.headers.Location).toBe(o.to); }
  });
  it("B-02: folder URLs serve with and without the trailing slash handled (slashless -> 308 to the slash)", () => {
    expect(request("sortmycover.co.za", "/about/").served).toBe("/about/index.html");
    const r = request("sortmycover.co.za", "/about");
    expect(r.status).toBe(308);
    expect(r.headers.Location).toBe("/about/");
  });
  it("www and .com redirect to the apex, keeping the path", () => {
    expect(request("www.sortmycover.co.za", "/learn/").headers.Location).toBe("https://sortmycover.co.za/learn/");
    expect(request("sortmycover.com", "/").status).toBe(301);
  });
  it("B-11: apex / serves the home page with one CSP header and no x-robots-tag", () => {
    const r = request("sortmycover.co.za", "/");
    expect(r.served).toBe("/index.html");
    expect(csp(r)).toBeTruthy();
    expect(r.headers["X-Robots-Tag"]).toBeUndefined();
    expect(r.headers["Content-Security-Policy"]).toBe(SECURITY_HEADERS["Content-Security-Policy"]);
  });
  it("B-11: a preview (*.vercel.app) is noindexed", () => expect(request("sortmycover-abc.vercel.app", "/book/").headers["X-Robots-Tag"]).toMatch(/noindex/));
  for (const a of ANGLES.filter((x) => x.host && !x.hold)) {
    it(`B-06: ${hostLabel(a)}.sortmycover.co.za serves / and /thanks/ with noindex and the CSP; other paths go to the apex`, () => {
      const host = `${hostLabel(a)}.sortmycover.co.za`;
      const root = request(host, "/");
      expect(root.served).toBe(`/_c/${a.slug}/index.html`);
      expect(root.headers["X-Robots-Tag"]).toMatch(/noindex/);
      expect(csp(root)).toBeTruthy();
      expect(request(host, "/thanks/").served).toBe(`/_c/${a.slug}/thanks/index.html`);
      expect(request(host, "/thanks").served).toBe(`/_c/${a.slug}/thanks/index.html`);
      const other = request(host, "/about/");
      expect(other.status).toBe(307);
      expect(other.headers.Location).toBe("https://sortmycover.co.za/about/");
      expect(request(host, "/robots.txt").served).toBe("/robots.txt");
      expect(files.has("/assets/" + fs.readdirSync(path.join(dist, "assets"))[0])).toBe(true);
      expect(request(host, "/assets/" + fs.readdirSync(path.join(dist, "assets")).find((f) => f.endsWith(".js"))!).served).toBeTruthy();
    });
    it(`B-06: apex /${a.slug}/ redirects 307 to its host with the query kept by the platform`, () => {
      const r = request("sortmycover.co.za", `/${a.slug}/`);
      expect(r.status).toBe(307);
      expect(r.headers.Location).toBe(`https://${hostLabel(a)}.sortmycover.co.za/`);
    });
  }
  it("a held angle (employer-gap) gets no host and no apex redirect", () => {
    const r = request("employer-gap.sortmycover.co.za", "/");
    expect(r.served).not.toBe("/_c/employer-gap/index.html");
    expect(request("sortmycover.co.za", "/employer-gap/").status).toBe(404);
  });
  it("unknown paths return the 404 page", () => expect(request("sortmycover.co.za", "/nope/x.html").status).toBe(404));
  it("the Hostinger .htaccess carries the same host mappings", () => {
    const h = fs.readFileSync(path.resolve(__dirname, "../hostinger/.htaccess"), "utf8");
    for (const a of ANGLES.filter((x) => x.host && !x.hold)) expect(h).toContain(`RewriteRule ^$ /_c/${a.slug}/index.html [L]`);
    expect(h).not.toContain("employer-gap");
  });
});

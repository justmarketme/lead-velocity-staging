#!/usr/bin/env node
/* Build = Vite client build, then pre-render every route to finished HTML (src/entry-server.tsx loaded through Vite's SSR loader),
   then sitemap.xml, robots.txt and the deployment config. No framework beyond Vite and React:
   see README "Why a custom pre-render script". */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
process.chdir(root);

await build({ root, logLevel: "warn" });
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(dist, ".vite/manifest.json"), "utf8"));
const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
const entry = manifest[entryKey];

const server = await createServer({ root, appType: "custom", server: { middlewareMode: true }, logLevel: "error", optimizeDeps: { noDiscovery: true } });
let failed = 0;
try {
  const mod = await server.ssrLoadModule("/src/entry-server.tsx");
  const seo = await server.ssrLoadModule("/src/build/seo.ts");
  const { site } = await server.ssrLoadModule("/src/lib/site.ts");
  const { missingTargets, OLD_URL_MAP } = await server.ssrLoadModule("/src/build/redirects.ts");
  const hosts = await server.ssrLoadModule("/src/build/hosts.ts");

  // chunk preload: the route's own chunk starts downloading with the HTML instead of after the entry script has run
  const PAGE = { '/': 'Home', '/book/': 'Book', '/book/thanks/': 'BookThanks', '/how-it-works/': 'HowItWorks', '/how-we-make-money/': 'HowWeMakeMoney', '/advisers/': 'Advisers', '/about/': 'About', '/contact/': 'Contact', '/complaints/': 'Complaints', '/faq/': 'Faq', '/learn/': 'Learn', '/learn/glossary/': 'Glossary', '/editorial-policy/': 'EditorialPolicy', '/accessibility/': 'Accessibility', '/privacy/': 'Legal', '/terms/': 'Legal', '/paia/': 'Legal' };
  const chunkFor = (r) => {
    let keys;
    if (r.campaign) keys = ['src/pages/Campaign.tsx'];
    else if (PAGE[r.path]) keys = ['src/pages/' + PAGE[r.path] + '.tsx'];
    else if (/^\/learn\/(life-events|reading-your-cover|the-call-and-trust|myths-and-definitions)\/$/.test(r.path) && r.path !== '/learn/life-events/') keys = ['src/pages/Learn.tsx'];
    else if (r.path.startsWith('/learn/')) keys = ['src/pages/ArticlePage.tsx', 'src/content/articles/' + (r.path === '/learn/life-events/' ? 'life-events' : r.path.split('/')[2]) + '.ts'];
    else keys = [];
    if (r.path === '/' || r.campaign || r.path === '/book/') keys.push('src/components/Quiz.tsx');
    return keys.map((k) => manifest[k]).filter(Boolean);
  };
  const preloadTags = (r) => {
    const seen = new Set();
    const out = [];
    const walk = (c) => { if (!c || seen.has(c.file)) return; seen.add(c.file); out.push(`<link rel="modulepreload" crossorigin href="/${c.file}">`); (c.imports || []).forEach((i) => walk(manifest[i])); };
    chunkFor(r).forEach(walk);
    return out.filter((t) => !t.includes(entry.file)).join("\n");
  };

  let count = 0;
  for (const r of mod.allRoutes) {
    try {
      const { html, head, campaign } = await mod.render(r);
      let page = template.replace("<!--app-head-->", head + "\n" + preloadTags(r)).replace("<!--app-html-->", html);
      if (campaign) page = page.replace('<div id="root">', `<div id="root" data-campaign="${campaign.slug}" data-view="${campaign.view}">`);
      const file = path.join(dist, mod.fileFor(r));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, page);
      count++;
    } catch (e) {
      failed++;
      console.error(`PRERENDER FAILED ${r.path}:`, e);
    }
  }

  const apexPaths = new Set(mod.allRoutes.filter((r) => r.kind === "apex").map((r) => r.path));
  const bad = missingTargets(OLD_URL_MAP, apexPaths);
  if (bad.length) { failed++; console.error("Redirect targets that are not routes:", bad); }

  // production guards (spec B-03, B-09): identity and measurement config must be complete
  if (site.env === "production") {
    const miss = [["company.registration", site.company.registration], ["pixel_id", site.pixel_id], ["domain_verification", site.domain_verification], ["n8n_base", site.n8n_base], ["whatsapp_number", site.whatsapp_number]].filter(([, v]) => !v).map(([k]) => k);
    if (miss.length) { failed++; console.error("production build needs config/site.json: " + miss.join(", ")); }
  }
  // CORS allow-list for n8n (its Webhook node takes exact origins only): the apex plus every attached campaign host
  const angles = JSON.parse(fs.readFileSync(path.join(root, "config/angles.json"), "utf8"));
  const origins = [site.site_url, ...angles.filter((a) => a.host && !a.hold).map((a) => "https://" + (a.host_label || a.slug) + site.campaign_host_suffix)];
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/N8N-CORS-ORIGINS.txt"), origins.join(",") + "\n");
  const origin = site.site_url.replace(/\/$/, "");
  fs.writeFileSync(path.join(dist, "sitemap.xml"), seo.buildSitemap(mod.allRoutes.map((r) => ({ path: r.path, lastmod: r.lastmod, indexable: r.indexable, campaign: r.kind === "campaign" })), origin));
  fs.writeFileSync(path.join(dist, "robots.txt"), seo.buildRobots(origin));
  fs.writeFileSync(path.join(root, "vercel.json"), JSON.stringify(hosts.vercelConfig(), null, 2) + "\n");
  fs.mkdirSync(path.join(root, "hostinger"), { recursive: true });
  fs.writeFileSync(path.join(root, "hostinger/.htaccess"), hosts.htaccess());
  fs.copyFileSync(path.join(root, "hostinger/.htaccess"), path.join(dist, ".htaccess"));
  const ev = JSON.parse(fs.readFileSync(path.join(root, "config/evidence.json"), "utf8")).find((x) => x.id === "fee-model");
  if (!ev || ev.status !== "signed") console.warn("WARNING: config/evidence.json fee-model is " + (ev ? ev.status : "missing") + ": the fee sentence cites the unsigned LGSA draft (spec C.1 item 5). Fix before the first paid click.");
  console.log(`pre-rendered ${count} pages -> dist/ (${mod.allRoutes.length} routes)`);
} finally {
  await server.close();
}
if (failed) process.exit(1);

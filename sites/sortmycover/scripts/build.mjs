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
  const chunkFor = (r) => {
    const keys = r.campaign ? ["src/pages/Campaign.tsx"] : Object.keys(manifest).filter((k) => {
      const base = r.path === "/" ? "Home" : null;
      return base && k.endsWith(`pages/${base}.tsx`);
    });
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

  const origin = site.site_url.replace(/\/$/, "");
  fs.writeFileSync(path.join(dist, "sitemap.xml"), seo.buildSitemap(mod.allRoutes.map((r) => ({ path: r.path, lastmod: r.lastmod, indexable: r.indexable, campaign: r.kind === "campaign" })), origin));
  fs.writeFileSync(path.join(dist, "robots.txt"), seo.buildRobots(origin));
  fs.writeFileSync(path.join(root, "vercel.json"), JSON.stringify(hosts.vercelConfig(), null, 2) + "\n");
  fs.mkdirSync(path.join(root, "hostinger"), { recursive: true });
  fs.writeFileSync(path.join(root, "hostinger/.htaccess"), hosts.htaccess());
  fs.copyFileSync(path.join(root, "hostinger/.htaccess"), path.join(dist, ".htaccess"));
  console.log(`pre-rendered ${count} pages -> dist/ (${mod.allRoutes.length} routes)`);
} finally {
  await server.close();
}
if (failed) process.exit(1);

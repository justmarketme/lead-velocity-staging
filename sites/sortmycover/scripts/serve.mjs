#!/usr/bin/env node
/* Minimal static server for dist/ that behaves like the deployment: folder URLs, 404.html, and the host-based campaign mapping
   (send a Host header like new-bond.sortmycover.co.za, or use new-bond.localhost). Usage: node scripts/serve.mjs [port]. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.argv[2] || process.env.PORT || 4173);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".webmanifest": "application/manifest+json" };
const cfg = JSON.parse(fs.readFileSync(path.resolve(root, "..", "config/site.json"), "utf8"));
const csp = fs.readFileSync(path.resolve(root, "..", "vercel.json"), "utf8");
const CSP = JSON.parse(csp).routes.find((r) => r.headers && r.headers["Content-Security-Policy"]).headers;

function resolve(host, p) {
  const slug = (host || "").split(":")[0].endsWith(cfg.campaign_host_suffix) || /\.localhost$/.test((host || "").split(":")[0]) ? (host || "").split(".")[0] : null;
  if (slug && fs.existsSync(path.join(root, "_c", slug))) {
    if (p === "/") return { file: `_c/${slug}/index.html`, campaign: true };
    if (/^\/thanks\/?$/.test(p)) return { file: `_c/${slug}/thanks/index.html`, campaign: true };
    if (/^\/(assets|fonts)\//.test(p) || /\.(png|ico|svg|txt|webmanifest|xml)$/.test(p)) return { file: p.slice(1), campaign: true };
    return { redirect: `${cfg.site_url}${p}` };
  }
  return { file: p.endsWith("/") ? p.slice(1) + "index.html" : p.slice(1) };
}
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);
  const r = resolve(req.headers.host, p);
  const send = (status, file, extra = {}) => {
    const full = path.join(root, file);
    const type = TYPES[path.extname(full)] || "application/octet-stream";
    let body = fs.readFileSync(full);
    const headers = { "Content-Type": type, ...CSP, ...extra };
    if (r.campaign) headers["X-Robots-Tag"] = "noindex, nofollow";
    if (/^(text|application\/(javascript|json|xml))|svg/.test(type) || type.startsWith("text/")) { body = zlib.gzipSync(body); headers["Content-Encoding"] = "gzip"; }
    res.writeHead(status, headers); res.end(body);
  };
  if (r.redirect) { res.writeHead(307, { Location: r.redirect }); return res.end(); }
  const full = path.join(root, r.file);
  if (!full.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return send(200, r.file);
  // slashless folder -> trailing slash
  if (!path.extname(p) && fs.existsSync(path.join(root, p.slice(1), "index.html"))) { res.writeHead(308, { Location: p + "/" + url.search }); return res.end(); }
  send(404, "404.html");
}).listen(port, () => console.log(`serving dist/ on http://localhost:${port}  (campaign hosts: http://new-bond.localhost:${port}/)`));

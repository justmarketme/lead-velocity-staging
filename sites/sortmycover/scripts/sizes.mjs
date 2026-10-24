#!/usr/bin/env node
/* Prints raw / gzip / brotli sizes of every JS and CSS file in dist/assets, and the JS a given route downloads (entry + its modulepreloads). */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const sz = (f) => { const b = fs.readFileSync(path.join(dist, f)); return { raw: b.length, gz: zlib.gzipSync(b, { level: 9 }).length, br: zlib.brotliCompressSync(b).length }; };
const kb = (n) => (n / 1024).toFixed(1).padStart(6) + " KB";
const files = fs.readdirSync(path.join(dist, "assets")).map((f) => "assets/" + f);
console.log("file".padEnd(52), "raw".padStart(9), "gzip".padStart(9), "brotli".padStart(9));
for (const f of files) { const s = sz(f); console.log(f.padEnd(52), kb(s.raw), kb(s.gz), kb(s.br)); }
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/book/", "/how-it-works/", "/faq/", "/learn/", "/learn/how-to-check-an-adviser/", "/learn/glossary/", "/privacy/", "/_c/new-bond/"];
console.log("\nJS + CSS downloaded per route (entry script, its modulepreloads, stylesheet; the HTML itself excluded):");
for (const r of routes) {
  const html = fs.readFileSync(path.join(dist, r === "/" ? "index.html" : r.slice(1) + "index.html"), "utf8");
  const refs = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
  const t = refs.reduce((a, f) => { const s = sz(f); return { gz: a.gz + s.gz, br: a.br + s.br, raw: a.raw + s.raw }; }, { gz: 0, br: 0, raw: 0 });
  const h = fs.readFileSync(path.join(dist, r === "/" ? "index.html" : r.slice(1) + "index.html"));
  console.log(r.padEnd(40), `${refs.length} files`.padEnd(9), "gzip", kb(t.gz), " brotli", kb(t.br), " | html gzip", kb(zlib.gzipSync(h).length));
}

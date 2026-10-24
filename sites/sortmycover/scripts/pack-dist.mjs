#!/usr/bin/env node
/* Packs dist/ into a real .zip for the Hostinger File Browser upload, then checks the zip it wrote.
   Why this exists (18 Oct 2026): `tar -a -cf x.zip` in Git Bash is GNU tar, which ignores -a and writes a TAR with a .zip name.
   Hostinger happened to extract those, but nothing guaranteed it. No dependencies: deflate + crc32 from node:zlib.
   Usage: node scripts/pack-dist.mjs [out.zip]   (default: <repo root>/smc-dist-<date>.zip) */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(site, "dist");
const out = path.resolve(process.argv[2] ?? path.join(site, "..", "..", `smc-dist-${new Date().toISOString().slice(0, 10)}.zip`));
const SKIP = new Set([".vite"]); // build manifest, not served
const REQUIRED = [".htaccess", "index.html", "start/index.html", "404.html"];

function walk(dir, rel = "") {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!rel && SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...walk(path.join(dir, e.name), r));
    else if (e.isFile()) files.push(r);
  }
  return files.sort();
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

if (!fs.existsSync(path.join(dist, "index.html"))) { console.error(`no build at ${dist}; run npm run build first`); process.exit(1); }
const names = walk(dist);
const parts = [];
const central = [];
let offset = 0;
for (const name of names) {
  const full = path.join(dist, ...name.split("/"));
  const data = fs.readFileSync(full);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const stored = deflated.length >= data.length; // already-compressed images: store as is
  const body = stored ? data : deflated;
  const crc = zlib.crc32(data) >>> 0;
  const { time, date } = dosTime(fs.statSync(full).mtime);
  const fname = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(stored ? 0 : 8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fname.length, 26); local.writeUInt16LE(0, 28);
  parts.push(local, fname, body);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(stored ? 0 : 8, 10); c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(fname.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, fname);
  offset += 30 + fname.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(out, Buffer.concat([...parts, cd, end]));

// Check the file on disk, not the buffers: real zip magic, every entry inflates to its CRC, required files present.
const zip = fs.readFileSync(out);
const fail = (m) => { console.error(`PACK CHECK FAILED: ${m}`); fs.rmSync(out, { force: true }); process.exit(1); };
if (zip.readUInt32LE(0) !== 0x04034b50) fail("first bytes are not PK\\x03\\x04");
const eocd = zip.length - 22;
if (zip.readUInt32LE(eocd) !== 0x06054b50) fail("no end-of-central-directory record");
const count = zip.readUInt16LE(eocd + 10);
let p = zip.readUInt32LE(eocd + 16);
const listed = new Map();
for (let i = 0; i < count; i++) {
  if (zip.readUInt32LE(p) !== 0x02014b50) fail(`bad central entry ${i}`);
  const method = zip.readUInt16LE(p + 10), crc = zip.readUInt32LE(p + 16), csize = zip.readUInt32LE(p + 20);
  const nlen = zip.readUInt16LE(p + 28), elen = zip.readUInt16LE(p + 30), klen = zip.readUInt16LE(p + 32), lo = zip.readUInt32LE(p + 42);
  const name = zip.toString("utf8", p + 46, p + 46 + nlen);
  const start = lo + 30 + zip.readUInt16LE(lo + 26) + zip.readUInt16LE(lo + 28);
  const raw = zip.subarray(start, start + csize);
  const data = method === 0 ? raw : zlib.inflateRawSync(raw);
  if ((zlib.crc32(data) >>> 0) !== crc) fail(`CRC mismatch in ${name}`);
  listed.set(name, data);
  p += 46 + nlen + elen + klen;
}
if (count !== names.length) fail(`${count} entries, expected ${names.length}`);
for (const r of REQUIRED) if (!listed.has(r)) fail(`missing ${r}`);
const index = listed.get("index.html").toString("utf8");
const entry = index.match(/\/(assets\/index-[\w-]+\.js)/)?.[1];
if (!entry || !listed.has(entry)) fail(`index.html entry script ${entry ?? "(none)"} is not in the zip`);

const sha = crypto.createHash("sha256").update(zip).digest("hex");
console.log(`zip    ${out}`);
console.log(`files  ${count} (incl. ${REQUIRED.join(", ")})`);
console.log(`size   ${zip.length} bytes, sha256 ${sha.slice(0, 16)}`);
console.log(`index  /${entry}`);

// Import generated scene images into public/img/<key>.webp (1440 px wide max, WebP q78) and print each file's real size,
// so src/content/imagery.ts can carry the true width/height (no layout shift). Needs ffmpeg with libwebp on PATH.
// Usage: node scripts/import-scenes.mjs map.json   where map.json is { "<scene-key>": "<https image url>", ... }
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const map = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = path.resolve(import.meta.dirname, "../public/img");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scenes-"));
for (const [key, url] of Object.entries(map)) {
  const res = await fetch(url);
  if (!res.ok) { console.error(`${key}: download failed ${res.status}`); continue; }
  const src = path.join(tmp, key + path.extname(new URL(url).pathname));
  fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
  const dst = path.join(out, key + ".webp");
  execFileSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", src, "-vf", "scale='min(1440,iw)':-2", "-c:v", "libwebp", "-quality", "78", dst]);
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", dst]).toString().trim().split(",").map(Number);
  console.log(JSON.stringify({ key, w, h, kb: Math.round(fs.statSync(dst).size / 1024) }));
}
fs.rmSync(tmp, { recursive: true, force: true });

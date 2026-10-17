// Google Trends (South Africa, past 12 months): average relative interest per group + top/rising related queries per term.
// Usage: node trends.mjs out.json "a,b,c,d,e" "f,g,h" ...  (max 5 terms per group; each group is normalised on its own)
import fs from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cookie = "";
async function get(url) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
    const sc = r.headers.getSetCookie?.() || [];
    if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
    if (r.status === 200) return JSON.parse((await r.text()).replace(/^\)\]\}',?\n?/, ""));
    await sleep(8000 * (i + 1));
  }
  throw new Error("failed " + url.slice(0, 90));
}
const base = "https://trends.google.com/trends/api";
const [out, ...groups] = process.argv.slice(2);
await get("https://trends.google.com/trends/explore?geo=ZA").catch(() => {});
const result = [];
for (const g of groups) {
  const kws = g.split(",").map((s) => s.trim());
  const req = { comparisonItem: kws.map((k) => ({ keyword: k, geo: "ZA", time: "today 12-m" })), category: 0, property: "" };
  const ex = await get(`${base}/explore?hl=en-ZA&tz=-120&req=${encodeURIComponent(JSON.stringify(req))}`);
  await sleep(3000);
  const ts = ex.widgets.find((w) => w.id === "TIMESERIES");
  const line = await get(`${base}/widgetdata/multiline?hl=en-ZA&tz=-120&req=${encodeURIComponent(JSON.stringify(ts.request))}&token=${ts.token}`);
  const pts = line.default.timelineData;
  const avg = kws.map((_, i) => Math.round(pts.reduce((s, p) => s + p.value[i], 0) / pts.length));
  const related = {};
  for (const w of ex.widgets.filter((w) => w.id.startsWith("RELATED_QUERIES"))) {
    const kw = w.request.restriction?.complexKeywordsRestriction?.keyword?.[0]?.value || "?";
    await sleep(1200);
    try {
      const d = await get(`${base}/widgetdata/relatedsearches?hl=en-ZA&tz=-120&req=${encodeURIComponent(JSON.stringify(w.request))}&token=${w.token}`);
      const [top, rising] = d.default.rankedList;
      related[kw] = { top: (top?.rankedKeyword || []).slice(0, 10).map((k) => `${k.query} (${k.value})`), rising: (rising?.rankedKeyword || []).slice(0, 10).map((k) => `${k.query} (${k.formattedValue})`) };
    } catch (e) { related[kw] = { error: String(e.message) }; }
  }
  result.push({ terms: kws, average: Object.fromEntries(kws.map((k, i) => [k, avg[i]])), related });
  console.log(JSON.stringify(result.at(-1).average));
  await sleep(2000);
}
fs.writeFileSync(out, JSON.stringify({ geo: "ZA", period: "past 12 months", fetched: new Date().toISOString(), groups: result }, null, 2));

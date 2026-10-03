#!/usr/bin/env bash
# Lighthouse mobile run for the laptop / CI. Budget: performance >= 90, LCP < 2500 ms, CLS < 0.1, accessibility >= 95.
# Needs network to install lighthouse once (npx) and Chrome. Not run in the offline build sandbox (see README).
# Usage: landing/lighthouse.sh [slug|URL]   e.g. landing/lighthouse.sh employer-gap
set -euo pipefail
cd "$(dirname "$0")"
TARGET="${1:-employer-gap}"
node build.mjs >/dev/null
mkdir -p reports
if [[ "$TARGET" =~ ^https?:// ]]; then URL="$TARGET"; SERVER_PID=""; else
  npx --yes http-server dist -p 4173 -s -g >/dev/null 2>&1 & SERVER_PID=$!
  trap '[[ -n "${SERVER_PID}" ]] && kill ${SERVER_PID} 2>/dev/null || true' EXIT
  sleep 2; URL="http://127.0.0.1:4173/${TARGET}/"
fi
# Mobile emulation + simulated Slow 4G are Lighthouse's defaults for --preset=perf with form-factor mobile.
npx --yes lighthouse@13 "$URL" \
  --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate \
  --throttling.rttMs=150 --throttling.throughputKbps=1638 --throttling.cpuSlowdownMultiplier=4 \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output=html --output-path="reports/lighthouse-${TARGET//[^a-zA-Z0-9]/_}" \
  --chrome-flags="--headless=new --no-sandbox" --quiet
J="reports/lighthouse-${TARGET//[^a-zA-Z0-9]/_}.report.json"
node -e '
const r=require(process.argv[1]); const a=r.audits, c=r.categories;
const perf=Math.round(c.performance.score*100), acc=Math.round(c.accessibility.score*100);
const lcp=a["largest-contentful-paint"].numericValue, cls=a["cumulative-layout-shift"].numericValue, tbt=a["total-blocking-time"].numericValue;
console.log(`performance ${perf} | accessibility ${acc} | LCP ${Math.round(lcp)} ms | CLS ${cls.toFixed(3)} | TBT ${Math.round(tbt)} ms`);
const ok=perf>=90 && lcp<2500 && cls<0.1 && acc>=95; console.log(ok?"PASS":"FAIL"); process.exit(ok?0:1);' "$PWD/$J"

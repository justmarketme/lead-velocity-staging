/** 28-day sparkline, inline SVG (no chart lib). Optional target line. Nulls break the line. */
interface Props { points: (number | null)[]; target?: number | null; tone?: "green" | "amber" | "red" | "grey" | null; className?: string; label?: string }

const TONE: Record<string, string> = { green: "hsl(142 60% 40%)", amber: "hsl(32 90% 50%)", red: "hsl(0 75% 55%)", grey: "hsl(240 5% 55%)" };

export default function Sparkline({ points, target, tone, className, label }: Props) {
  const vals = points.filter((p): p is number => p !== null && Number.isFinite(p));
  const all = target !== null && target !== undefined ? [...vals, target] : vals;
  if (vals.length < 2) {
    return <svg viewBox="0 0 100 28" className={className} role="img" aria-label={label || "not enough points"}><line x1="0" x2="100" y1="14" y2="14" stroke="currentColor" strokeOpacity=".2" strokeDasharray="2 2" /></svg>;
  }
  let mn = Math.min(...all), mx = Math.max(...all);
  if (mx === mn) { mx = mn + 1; mn = mn - 1; }
  const n = points.length;
  const x = (i: number) => (n === 1 ? 50 : (i * 100) / (n - 1));
  const y = (v: number) => 26 - ((v - mn) / (mx - mn)) * 22;
  const segs: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p === null || !Number.isFinite(p)) { if (cur.length) segs.push(cur.join(" ")); cur = []; return; }
    cur.push(`${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur.join(" "));
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={className} role="img" aria-label={label || "28-day trend"}>
      {target !== null && target !== undefined && (
        <line x1="0" x2="100" y1={y(target)} y2={y(target)} stroke="currentColor" strokeOpacity=".35" strokeDasharray="2 2" />
      )}
      {segs.map((s, i) => (
        <polyline key={i} points={s} fill="none" stroke={TONE[tone || "grey"] || TONE.grey} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

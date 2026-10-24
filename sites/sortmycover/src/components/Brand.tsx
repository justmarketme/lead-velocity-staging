import { Link } from "react-router-dom";

export function Tick() {
  return (
    <span className="tick" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#2A1B02" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
    </span>
  );
}

/** Wordmark: SortMyC(tick)ver. `href` null renders a non-link (campaign pages have no navigation). */
export function Wordmark({ to = "/", plain = false }: { to?: string; plain?: boolean }) {
  const inner = (<>SortMyC<Tick />ver</>);
  if (plain) return <span className="logo" role="img" aria-label="SortMyCover">{inner}</span>;
  return <Link className="logo" to={to} aria-label="SortMyCover home">{inner}</Link>;
}

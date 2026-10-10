/* Old .html URLs (live on the holding site since 5 Oct 2026) -> new folder URLs. Spec B.3. Kept forever (cheap). */
export interface Redirect { from: string; to: string; status: 301 }

export const OLD_URL_MAP: Redirect[] = [
  ["/about.html", "/about/"],
  ["/book.html", "/book/"],
  ["/how-we-make-money.html", "/how-we-make-money/"],
  ["/complaints.html", "/complaints/"],
  ["/privacy.html", "/privacy/"],
  ["/terms.html", "/terms/"],
  ["/learn/what-is-a-life-cover-gap.html", "/learn/what-is-a-life-cover-gap/"],
  ["/learn/what-happens-on-a-30-minute-call.html", "/learn/what-happens-on-a-30-minute-call/"],
  ["/learn/how-to-read-your-payslips-cover-line.html", "/learn/how-to-read-your-payslips-cover-line/"],
  ["/learn/how-sortmycover-works.html", "/learn/how-sortmycover-works/"],
  ["/learn/life-events-that-change-what-you-need.html", "/learn/life-events/"],
  ["/index.html", "/"],
  ["/learn/index.html", "/learn/"],
].map(([from, to]) => ({ from, to, status: 301 as const }));

/** Every redirect target must be a real route. Used by tests and the build. */
export function missingTargets(map: Redirect[], paths: Set<string>): Redirect[] {
  return map.filter((r) => !paths.has(r.to));
}

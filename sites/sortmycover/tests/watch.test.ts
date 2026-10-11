/* The Capital Legacy change watcher (scripts/capital-legacy-watch.mjs): offline tests with fixtures, no network. */
import { describe, expect, it } from "vitest";
import evidence from "../config/evidence.json";
import angles from "../config/angles.json";
import site from "../config/site.json";
import watch from "../config/capital-legacy-watch.json";
// @ts-expect-error plain ESM module without types
import { affectedAngles, compare, lineDiff, masterRef, normaliseFaq, normalisePage, report, requestPlan, sha256 } from "../scripts/capital-legacy-watch.mjs";

const PAGE = (body: string) => `<html><head><title>x</title><script>var t=Date.now()</script></head><body><nav><a href="/">Home</a><a href="/wills">Wills</a></nav>
<main><h1>Don&#x27;t wait</h1><p>We do not   charge for <strong>drafting</strong>.</p>${body}<svg><text>icon</text></svg></main>
<footer><a href="/privacy">Privacy</a><p>Capital Legacy Solutions (Pty) Ltd is an Authorised Financial Services Provider.</p></footer></body></html>`;

describe("normalising", () => {
  it("keeps the text of <main> and the footer's regulatory line; drops navigation, scripts and SVG", () => {
    const t = normalisePage(PAGE("<ul><li>One</li><li>Two</li></ul>"));
    expect(t).toContain("Don't wait");
    expect(t).toContain("We do not charge for drafting");
    expect(t).toContain("One\nTwo");
    expect(t).toContain("Authorised Financial Services Provider");
    expect(t).not.toMatch(/Date\.now|icon|Privacy|Home/);
  });
  it("is stable: the same page hashes the same, a changed sentence does not", () => {
    expect(sha256(normalisePage(PAGE("<p>A</p>")))).toBe(sha256(normalisePage(PAGE("<p>A</p>"))));
    expect(sha256(normalisePage(PAGE("<p>A</p>")))).not.toBe(sha256(normalisePage(PAGE("<p>B</p>"))));
  });
  it("reads one FAQ from the content API by uid, and fails when it is gone", () => {
    const body = JSON.stringify({ results: [{ uid: "x", data: { title: [{ type: "heading1", text: "Do I need a will?" }], body: [{ type: "paragraph", text: "Yes,  always." }, { type: "list-item", text: "Item" }] } }] });
    expect(normaliseFaq(body)).toBe("Do I need a will?\nYes, always.\nItem");
    expect(() => normaliseFaq(JSON.stringify({ results: [] }))).toThrow(/faq_not_found/);
    expect(masterRef(JSON.stringify({ refs: [{ ref: "abc", isMasterRef: true }] }))).toBe("abc");
  });
  it("plans FAQ requests by uid with the master ref, pages by URL", () => {
    const plan = requestPlan(watch, "REF1");
    expect(plan).toHaveLength(watch.sources.length);
    const faq = plan.find((p: { id: string }) => p.id === "faq-no-assets");
    expect(faq.url).toContain("ref=REF1");
    expect(decodeURIComponent(faq.url)).toContain('[[at(my.faq.uid,"do-i-need-a-will-if-i-have-no-assets")]]');
    expect(plan.find((p: { id: string }) => p.id === "wills").url).toBe("https://capitallegacy.co.za/wills");
  });
});

describe("watch list", () => {
  const ev = evidence as { id: string; status: string; url?: string }[];
  it("every watched evidence id exists, and every Capital Legacy fact our pages use is watched", () => {
    const watched = new Set(watch.sources.flatMap((s) => s.evidence));
    for (const id of watched) expect(ev.find((e) => e.id === id), id).toBeTruthy();
    const used = new Set([
      ...site.will_provider.evidence,
      ...(angles as { theme?: string; sources?: string[]; proof?: { evidence: string } }[]).filter((a) => a.theme === "B").flatMap((a) => [...(a.sources || []), ...(a.proof ? [a.proof.evidence] : [])]),
    ]);
    for (const id of used) expect(watched.has(id), `${id} is used on a page but no watched source backs it`).toBe(true);
    for (const e of ev.filter((x) => x.id.startsWith("cl-"))) expect(watched.has(e.id), `${e.id} recorded but not watched`).toBe(true);
  });
  it("every source has a committed baseline hash and unique id", () => {
    expect(new Set(watch.sources.map((s) => s.id)).size).toBe(watch.sources.length);
    for (const s of watch.sources) expect(s.hash, s.id).toMatch(/^[0-9a-f]{64}$/);
    expect(watch.checked).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
  it("maps a source to the pages it affects: provider facts reach every theme B page, page facts only theirs", () => {
    const B = ["children-guardian", "where-is-the-will", "will-and-cover", "will-myth"];
    expect(affectedAngles(["cl-no-charge-will"]).sort()).toEqual(B);
    expect(affectedAngles(["cl-eri-2026"])).toEqual(["will-myth"]);
    expect(affectedAngles(["cl-safe-custody"])).toEqual(["where-is-the-will"]);
    expect(affectedAngles(["cl-company-stats"])).toEqual([]);
  });
});

describe("compare and report", () => {
  const W = { sources: [
    { id: "wills", kind: "page", url: "https://capitallegacy.co.za/wills", evidence: ["cl-will-names-guardian"], hash: sha256("a\nb") },
    { id: "why-us", kind: "page", url: "https://capitallegacy.co.za/why-us", evidence: ["cl-no-charge-will"], hash: "" },
    { id: "trusts", kind: "page", url: "https://capitallegacy.co.za/trusts", evidence: ["cl-testamentary-trust"], hash: sha256("t") },
  ] };
  const html = (lines: string[]) => `<main>${lines.map((l) => `<p>${l}</p>`).join("")}</main>`;
  it("unchanged, changed (with a line diff from the stored text), new, failed", () => {
    const state = { sources: { wills: { hash: sha256("a\nb"), text: "a\nb" } } };
    const c = compare(W, state, [
      { id: "wills", ok: true, status: 200, body: html(["a", "c"]) },
      { id: "why-us", ok: true, status: 200, body: html(["x"]) },
      { id: "trusts", ok: false, status: 404 },
    ], "2026-10-12T05:00:00Z");
    const by = Object.fromEntries(c.results.map((r: { id: string }) => [r.id, r]));
    expect(by.wills.status).toBe("changed");
    expect(by.wills.diff).toEqual({ removed: ["b"], added: ["c"] });
    expect(by.wills.affects).toEqual(["children-guardian"]);
    expect(by["why-us"].status).toBe("new");
    expect(by.trusts.status).toBe("failed");
    expect(c.state.sources.wills.text).toBe("a\nc");
    expect(c.state.sources.trusts).toBeUndefined();
    // next week, same text: nothing to report
    const c2 = compare(W, c.state, [
      { id: "wills", ok: true, status: 200, body: html(["a", "c"]) },
      { id: "why-us", ok: true, status: 200, body: html(["x"]) },
      { id: "trusts", ok: true, status: 200, body: html(["t"]) },
    ]);
    expect(c2.changed).toHaveLength(0);
    expect(c2.failed).toHaveLength(0);
    expect(report(c2)).toBeNull();
  });
  it("the report names the changed page, our affected pages, the facts taken from it and the diff", () => {
    const c = compare(W, { sources: { wills: { hash: sha256("a\nb"), text: "a\nb" } } }, [{ id: "wills", ok: true, status: 200, body: html(["a", "c"]) }, { id: "why-us", ok: true, status: 200, body: html(["x"]) }, { id: "trusts", ok: true, status: 200, body: html(["t"]) }]);
    const r = report(c, { now: "2026-10-12T05:00:00Z" });
    expect(r.subject).toMatch(/Capital Legacy changed 1 page/);
    expect(r.text).toContain("CHANGED: wills");
    expect(r.text).toContain("children-guardian (children-guardian.sortmycover.co.za)");
    expect(r.text).toContain("cl-will-names-guardian:");
    expect(r.text).toContain("  - b");
    expect(r.text).toContain("  + c");
    expect(r.text).toContain("check-capital-legacy.mjs --update");
  });
  it("without stored text (first run against the committed hash) it still reports, without a line diff", () => {
    const c = compare(W, {}, [{ id: "wills", ok: true, status: 200, body: html(["z"]) }, { id: "why-us", ok: true, status: 200, body: html(["x"]) }, { id: "trusts", ok: true, status: 200, body: html(["t"]) }]);
    expect(c.changed.map((x: { id: string }) => x.id)).toEqual(["wills"]);
    expect(report(c).text).toMatch(/No earlier text stored/);
  });
  it("lineDiff handles inserts, deletes and empty input", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual({ removed: ["b"], added: ["d"] });
    expect(lineDiff("", "x")).toEqual({ removed: [""], added: ["x"] });
  });
});

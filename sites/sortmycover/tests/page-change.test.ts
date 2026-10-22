// @vitest-environment jsdom
/* Page changes inside the app (Layout's ScrollToTop): focus moves to <main> without scrolling, a new page starts at the top, and
   Back / Forward leave the scroll position to the browser, which restores the reader's place (21 Oct 2026). */
import { createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Layout from "../src/components/Layout";
import * as pm from "../src/lib/pageMotion";

// the on-demand motion chunk, recorded instead of run (FOOTER-DISCLOSURE-SPEC-SMC-2026-10-21: /legal/ joined NO_MOTION)
vi.mock("../src/lib/pageMotion", () => ({ pageMotion: vi.fn(() => () => {}), footerMotion: vi.fn(() => () => {}) }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let go: ReturnType<typeof useNavigate> = () => {};
let scrolls: unknown[][];
let focusOpts: unknown[];

function Nav() { go = useNavigate(); return null; }

beforeEach(() => {
  // reduced motion: the layout loads no Motion chunk
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
  scrolls = [];
  window.scrollTo = ((...a: unknown[]) => { scrolls.push(a); }) as any;
  focusOpts = [];
  const focus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, o?: FocusOptions) { if (this.id === "main") focusOpts.push(o); focus.call(this, o); });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(MemoryRouter, { initialEntries: ["/learn/"] }, h(Layout, null, h(Nav)))));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const main = () => document.getElementById("main")!;

describe("page change", () => {
  it("first load: no scroll and no focus move (the pre-rendered page is already in place)", () => {
    expect(scrolls).toEqual([]);
    expect(focusOpts).toEqual([]);
  });

  it("a new page: focus moves to <main> without scrolling, and the page starts at the top", () => {
    act(() => go("/about/"));
    expect(document.activeElement).toBe(main());
    expect(focusOpts).toEqual([{ preventScroll: true }]);
    expect(scrolls).toEqual([[0, 0]]);
  });

  it("Back and Forward: no scroll to the top, so the browser restores the place; focus still moves to <main>", () => {
    act(() => go("/about/"));
    scrolls = []; focusOpts = []; main().blur();
    act(() => go(-1));
    expect(scrolls).toEqual([]);
    expect(document.activeElement).toBe(main());
    expect(focusOpts).toEqual([{ preventScroll: true }]);
    act(() => go(1));
    expect(scrolls).toEqual([]);
  });

  it("the same page with a new #hash keeps focus where it is and scrolls to the section", () => {
    const sec = document.createElement("h2");
    sec.id = "sec";
    const into = vi.fn();
    sec.scrollIntoView = into;
    main().appendChild(sec);
    act(() => go("/learn/#sec"));
    expect(into).toHaveBeenCalled();
    expect(focusOpts).toEqual([]);
    sec.remove();
  });
});

describe("motion chunk requests (NO_MOTION and reduced motion)", () => {
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const remount = async (path: string, reduce: boolean) => {
    act(() => root.unmount());
    vi.mocked(pm.pageMotion).mockClear();
    vi.mocked(pm.footerMotion).mockClear();
    window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
    root = createRoot(host);
    act(() => root.render(h(MemoryRouter, { initialEntries: [path] }, h(Layout, null, h(Nav)))));
    await flush();
  };
  it("/legal/ requests no motion chunk; a normal page then requests pageMotion and footerMotion (with the apex footer)", async () => {
    await remount("/legal/", false);
    expect(pm.pageMotion).not.toHaveBeenCalled();
    expect(pm.footerMotion).not.toHaveBeenCalled();
    act(() => go("/about/"));
    await flush();
    expect(pm.pageMotion).toHaveBeenCalledTimes(1);
    expect(pm.footerMotion).toHaveBeenCalledTimes(1);
    expect((vi.mocked(pm.footerMotion).mock.calls[0][0] as HTMLElement).matches(".site-footer[data-footer]")).toBe(true);
  });
  it("reduced motion requests neither pageMotion nor footerMotion", async () => {
    await remount("/about/", true);
    act(() => go("/contact/"));
    await flush();
    expect(pm.pageMotion).not.toHaveBeenCalled();
    expect(pm.footerMotion).not.toHaveBeenCalled();
  });
});

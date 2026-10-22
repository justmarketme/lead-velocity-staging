// @vitest-environment jsdom
/* "Opt out of ad measurement" points at a #fragment on another page. As a router <Link> the click was handled in-app and the
   reader landed at a random scroll position on a first visit; as a plain <a> the browser loads the pre-rendered /privacy/
   page and scrolls to #opt-out itself. */
import { createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Footer } from "../src/components/Footer";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(MemoryRouter, { initialEntries: ["/"] }, h(Footer))));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

it("the opt-out link is left to the browser (not intercepted by the router)", () => {
  const a = [...host.querySelectorAll("a")].find((x) => x.textContent === "Opt out of ad measurement")!;
  expect(a.getAttribute("href")).toBe("/privacy/#opt-out");
  // React handles clicks at the root container, so read the result one level up (document), then stop jsdom from
  // attempting (and logging) the real navigation
  let handledByRouter = true;
  const seen = (e: Event) => { handledByRouter = e.defaultPrevented; e.preventDefault(); };
  document.addEventListener("click", seen);
  act(() => { a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })); });
  document.removeEventListener("click", seen);
  expect(handledByRouter).toBe(false);
});

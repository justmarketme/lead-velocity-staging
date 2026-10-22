// @vitest-environment jsdom
/* The chat panel's pop-in respects NO_MOTION (reviewer finding, 21 Oct 2026): the static legal pages (/legal/, /privacy/, /terms/,
   /paia/) play no motion at all, so opening the panel there (header CTA or the footer's "Chat on WhatsApp") shows it without the
   spring. Other pages keep the pop-in; reduced motion is covered in tests/chat-widget.test.ts. */
import { createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anim = vi.fn((..._a: unknown[]) => ({ finished: Promise.resolve(), cancel() {} }));
vi.mock("motion/mini", () => ({ animate: (...a: unknown[]) => anim(...a) }));

import ChatWidget from "../src/components/ChatWidget";
import { openChat } from "../src/lib/whatsapp";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  anim.mockClear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function openOn(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(h(MemoryRouter, { initialEntries: [path] }, h(ChatWidget, { base: { topic: "cover for my family", ref: "w-test" } }))));
  act(() => openChat({ topic: "cover for my family", ref: "w-test" }));
  const panel = host.querySelector("#chat-panel");
  expect(panel, path).not.toBeNull();
  return panel!;
}
const popped = (panel: Element) => anim.mock.calls.some((c) => c[0] === panel);

describe("chat panel pop-in", () => {
  for (const path of ["/legal/", "/privacy/", "/terms/", "/paia/"]) {
    it(`no animation on ${path} (NO_MOTION)`, () => {
      expect(popped(openOn(path))).toBe(false);
    });
  }
  it("springs in on an ordinary page", () => {
    expect(popped(openOn("/about/"))).toBe(true);
  });
});

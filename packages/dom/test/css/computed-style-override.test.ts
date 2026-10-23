/**
 * `getComputedStyleOverride` (@rtd/dom/internal): detecting a user-replaced
 * `window.getComputedStyle`, which the upper layers (@rtd/aria, @rtd/testing-library) must read
 * styles through, as the stock packages do.
 *
 * Spec: CSSOM §9 "Extensions to the Window Interface" —
 *   https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle
 * plus https://html.spec.whatwg.org/#dom-document-defaultview (the window a node's styles are
 * read from is `ownerDocument.defaultView`, the host global while installed).
 *
 * Contract: null while the window's own implementation is in place (its prototype method on a
 * plain Window, the bound method installGlobals defines on a host global); otherwise the
 * replacement bound to that window, including Vitest spies (which may call through).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWindow, installGlobals, type Window } from "@rtd/dom";
import { $impl, getComputedStyleOverride } from "@rtd/dom/internal";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.restoreAllMocks();
});

function setup(): { window: Window; el: any } {
  const window = createWindow();
  window.document.body!.innerHTML = "<div class=x></div>";
  return { window, el: window.document.querySelector(".x") };
}

describe("getComputedStyleOverride — https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle", () => {
  test("own Window.prototype.getComputedStyle: null", () => {
    const { el } = setup();
    expect(getComputedStyleOverride(el[$impl])).toBe(null);
  });

  test("replaced on a plain window: the replacement, called with this = window", () => {
    const { window, el } = setup();
    let self: unknown = null;
    (window as any).getComputedStyle = function (this: unknown, e: any) {
      self = this;
      return e.style;
    };
    const gcs = getComputedStyleOverride(el[$impl])!;
    expect(gcs).not.toBe(null);
    expect(gcs(el)).toBe(el.style);
    expect(self).toBe(window);
  });

  test("restored after replacement: null again", () => {
    const { window, el } = setup();
    (window as any).getComputedStyle = (e: any) => e.style;
    expect(getComputedStyleOverride(el[$impl])).not.toBe(null);
    delete (window as any).getComputedStyle;
    expect(getComputedStyleOverride(el[$impl])).toBe(null);
  });

  test("installed on a host global: installGlobals' bound method is ours (null), a replacement is not", () => {
    const window = createWindow();
    const target: Record<PropertyKey, unknown> = {};
    const uninstall = installGlobals(window, target);
    cleanup = () => {
      uninstall();
      window.close();
    };
    window.document.body!.innerHTML = "<p></p>";
    const p = window.document.querySelector("p") as any;
    expect(getComputedStyleOverride(p[$impl])).toBe(null);
    target.getComputedStyle = (e: any) => e.style;
    expect(getComputedStyleOverride(p[$impl])!(p)).toBe(p.style);
  });

  test("vi.spyOn calling through is an override that returns the real computed style", () => {
    const { window, el } = setup();
    const spy = vi.spyOn(window, "getComputedStyle");
    const gcs = getComputedStyleOverride(el[$impl])!;
    expect(gcs).not.toBe(null);
    expect(gcs(el)).toBe(window.getComputedStyle(el));
    spy.mockImplementation((e: any) => e.style);
    expect(gcs(el)).toBe(el.style);
  });

  test("document without a browsing context (defaultView null): null", () => {
    const { window } = setup();
    const doc = window.document.implementation.createHTMLDocument("x");
    expect(getComputedStyleOverride((doc.body as any)[$impl])).toBe(null);
  });
});

/**
 * matchMedia and MediaQueryList.
 *
 * Spec:
 *   CSSOM View §4.2 "The MediaQueryList interface"
 *     https://drafts.csswg.org/cssom-view/#the-mediaquerylist-interface
 *     https://drafts.csswg.org/cssom-view/#evaluate-media-queries-and-report-changes
 *   Media Queries Level 5 (fallback evaluator)
 *     https://drafts.csswg.org/mediaqueries-5/#media
 *     https://drafts.csswg.org/mediaqueries-5/#mq-range-context
 *     https://drafts.csswg.org/mediaqueries-5/#mq-boolean-context
 *
 * The fallback evaluator is used until the css area registers windowHooks.evaluateMediaQuery.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWindow, MediaQueryList, type Window } from "@ctrl/dom";
import { evaluateMediaQueryList, windowHooks } from "@ctrl/dom/internal";

let window: Window;

beforeEach(() => {
  window = createWindow({ width: 1024, height: 768 });
});

afterEach(() => {
  window.close();
});

const env = { width: 1024, height: 768, devicePixelRatio: 1, mediaType: "screen", features: null };
const ev = (q: string, features?: Record<string, string | number>) => evaluateMediaQueryList(q, env, features);

describe("matchMedia — https://drafts.csswg.org/cssom-view/#dom-window-matchmedia", () => {
  test("returns a MediaQueryList with media and live matches", () => {
    const mql = window.matchMedia("(min-width: 800px)");
    expect(mql).toBeInstanceOf(MediaQueryList);
    expect(mql.media).toBe("(min-width: 800px)");
    expect(mql.matches).toBe(true);
    window.innerWidth = 700;
    expect(mql.matches).toBe(false);
  });

  test("requires an argument", () => {
    expect(() => (window.matchMedia as unknown as () => void)()).toThrow(TypeError);
  });

  test("windowHooks.evaluateMediaQuery takes over evaluation", () => {
    const previous = windowHooks.evaluateMediaQuery;
    windowHooks.evaluateMediaQuery = (query, e) => query === "custom" && e.width === 1024;
    try {
      expect(window.matchMedia("custom").matches).toBe(true);
      expect(window.matchMedia("(min-width: 1px)").matches).toBe(false);
    } finally {
      windowHooks.evaluateMediaQuery = previous;
    }
  });

  test("the evaluator receives the window's mediaFeatures overrides in its environment", () => {
    const previous = windowHooks.evaluateMediaQuery;
    const seen: unknown[] = [];
    windowHooks.evaluateMediaQuery = (_query, e) => (seen.push(e.features), true);
    try {
      expect(createWindow({ mediaFeatures: { "prefers-color-scheme": "dark" } }).matchMedia("(x)").matches).toBe(true);
      expect(seen).toEqual([{ "prefers-color-scheme": "dark" }]);
    } finally {
      windowHooks.evaluateMediaQuery = previous;
    }
  });

  test("mediaFeatures window option overrides discrete features (matchMedia and @media rules)", () => {
    const dark = createWindow({ mediaFeatures: { "prefers-color-scheme": "dark" } });
    expect(dark.matchMedia("(prefers-color-scheme: dark)").matches).toBe(true);
    expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);
    const doc = dark.document;
    const style = doc.createElement("style");
    style.textContent = "@media (prefers-color-scheme: dark) { p { display: none } }";
    doc.head!.appendChild(style);
    const p = doc.body!.appendChild(doc.createElement("p"));
    expect(dark.getComputedStyle(p).display).toBe("none");
  });
});

describe("change events — https://drafts.csswg.org/cssom-view/#evaluate-media-queries-and-report-changes", () => {
  test("assigning innerWidth fires change on lists whose result flipped", () => {
    const mql = window.matchMedia("(max-width: 600px)");
    const listener = vi.fn();
    mql.addEventListener("change", listener);
    window.innerWidth = 1000; // still false: no event
    expect(listener).not.toHaveBeenCalled();
    window.innerWidth = 500;
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe("change");
    expect(event.matches).toBe(true);
    expect(event.media).toBe("(max-width: 600px)");
  });

  test("addListener/removeListener and onchange", () => {
    const mql = window.matchMedia("(orientation: portrait)");
    const legacy = vi.fn();
    const handler = vi.fn();
    mql.addListener(legacy);
    mql.onchange = handler;
    window.resizeTo(500, 900);
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    mql.removeListener(legacy);
    mql.onchange = null;
    window.resizeTo(1024, 768);
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("resizeTo fires resize on the window", () => {
    const spy = vi.fn();
    window.addEventListener("resize", spy);
    window.resizeTo(800, 600);
    expect(window.innerWidth).toBe(800);
    expect(window.innerHeight).toBe(600);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("devicePixelRatio changes are reported", () => {
    const mql = window.matchMedia("(min-resolution: 2dppx)");
    const spy = vi.fn();
    mql.addEventListener("change", spy);
    window.devicePixelRatio = 2;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("fallback evaluator — https://drafts.csswg.org/mediaqueries-5/#media", () => {
  test("media types and the empty list", () => {
    expect(ev("")).toBe(true);
    expect(ev("all")).toBe(true);
    expect(ev("screen")).toBe(true);
    expect(ev("print")).toBe(false);
    expect(ev("only screen")).toBe(true);
    expect(ev("not print")).toBe(true);
    expect(ev("unknowntype")).toBe(false);
  });

  test("comma-separated lists match if any query matches", () => {
    expect(ev("print, (min-width: 100px)")).toBe(true);
    expect(ev("print, (max-width: 100px)")).toBe(false);
  });

  test("min-/max- prefixed width and height with units", () => {
    expect(ev("(min-width: 1024px)")).toBe(true);
    expect(ev("(min-width: 1025px)")).toBe(false);
    expect(ev("(max-width: 64em)")).toBe(true);
    expect(ev("(max-height: 767px)")).toBe(false);
    expect(ev("screen and (min-width: 768px) and (max-width: 1100px)")).toBe(true);
  });

  test("range context — https://drafts.csswg.org/mediaqueries-5/#mq-range-context", () => {
    expect(ev("(width >= 1024px)")).toBe(true);
    expect(ev("(width > 1024px)")).toBe(false);
    expect(ev("(400px <= width <= 1100px)")).toBe(true);
    expect(ev("(1100px < width)")).toBe(false);
    expect(ev("(height < 800px)")).toBe(true);
  });

  test("boolean context and discrete features", () => {
    expect(ev("(color)")).toBe(true);
    expect(ev("(monochrome)")).toBe(false);
    expect(ev("(hover: hover)")).toBe(true);
    expect(ev("(pointer: coarse)")).toBe(false);
    expect(ev("(prefers-reduced-motion: no-preference)")).toBe(true);
    expect(ev("(prefers-reduced-motion)")).toBe(false);
    expect(ev("(prefers-color-scheme: dark)")).toBe(false);
    expect(ev("(prefers-color-scheme: dark)", { "prefers-color-scheme": "dark" })).toBe(true);
  });

  test("orientation, aspect-ratio and resolution", () => {
    expect(ev("(orientation: landscape)")).toBe(true);
    expect(ev("(min-aspect-ratio: 4/3)")).toBe(true);
    expect(ev("(min-aspect-ratio: 16/9)")).toBe(false);
    expect(ev("(min-resolution: 1dppx)")).toBe(true);
    expect(ev("(min-resolution: 192dpi)")).toBe(false);
    expect(ev("(-webkit-min-device-pixel-ratio: 2)")).toBe(false);
  });

  test("not / and / or conditions", () => {
    expect(ev("not all and (monochrome)")).toBe(true);
    expect(ev("(not (min-width: 2000px))")).toBe(true);
    expect(ev("((min-width: 2000px) or (orientation: landscape))")).toBe(true);
    expect(ev("(min-width: 2000px) or (orientation: portrait)")).toBe(false);
  });

  test("unknown features evaluate to false", () => {
    expect(ev("(made-up-feature: 1)")).toBe(false);
    expect(ev("not (made-up-feature: 1)")).toBe(false);
  });
});

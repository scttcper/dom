/**
 * Media queries through matchMedia() and @media.
 *
 * Specs:
 *   Media Queries 5 — https://drafts.csswg.org/mediaqueries-5/
 *     §3 syntax, §3.1 combining (and/or/not), §2.4 range context — #media-descriptor-table, #mq-range-context
 *     §3.2 evaluating (Kleene logic, unknown features) — https://drafts.csswg.org/mediaqueries-5/#evaluating
 *     §4-12 media features (width, height, aspect-ratio, orientation, resolution, prefers-*, hover, pointer)
 *   CSSOM §4.1 serializing media queries — https://drafts.csswg.org/cssom/#serialize-a-media-query-list
 *   CSSOM View §4.2 matchMedia / MediaQueryList — https://drafts.csswg.org/cssom-view/#dom-window-matchmedia
 *
 * The environment is a 1024×768 screen at devicePixelRatio 1, light scheme, fine hovering
 * pointer, no reduced motion (src/css/media.ts); createWindow options change it.
 */
import { describe, expect, test } from "vitest";
import { createWindow } from "@ctrl/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
function mm(query: string, options: Record<string, unknown> = {}): boolean {
  return (createWindow(options as any) as any).matchMedia(query).matches;
}

describe("media types — https://drafts.csswg.org/mediaqueries-5/#media-types", () => {
  test("screen and all match; print and unknown types do not; type is ASCII case-insensitive", () => {
    expect([mm("screen"), mm("all"), mm("SCREEN"), mm("print"), mm("tv"), mm("bogus")]).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  test("an empty query list matches; an invalid one does not (https://drafts.csswg.org/cssom-view/#dom-window-matchmedia)", () => {
    expect([mm(""), mm("(")]).toEqual([true, false]);
  });

  test("only is ignored; not negates the whole query", () => {
    expect([mm("only screen"), mm("not print"), mm("not screen"), mm("not screen and (min-width: 2000px)")]).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });
});

describe("combining — https://drafts.csswg.org/mediaqueries-5/#media-conditions", () => {
  test("comma lists match if any query matches", () => {
    expect([mm("print, (min-width: 100px)"), mm("print, (min-width: 5000px)")]).toEqual([true, false]);
  });

  test("and / or / not inside conditions, with parentheses", () => {
    expect([
      mm("(min-width: 100px) and (max-width: 2000px)"),
      mm("(min-width: 5000px) or (orientation: landscape)"),
      mm("not (min-width: 5000px)"),
      mm("((min-width: 100px) and (hover)) or (pointer: coarse)"),
    ]).toEqual([true, true, true, true]);
  });

  test("mixing and/or at one level is invalid (never matches)", () => {
    expect(mm("(min-width: 1px) and (hover) or (pointer: fine)")).toBe(false);
  });
});

describe("evaluating — https://drafts.csswg.org/mediaqueries-5/#evaluating", () => {
  test("unknown features are unknown: false, and not(unknown) is still false", () => {
    expect([mm("(made-up-feature)"), mm("not (made-up-feature)"), mm("(made-up: 1)")]).toEqual([false, false, false]);
  });

  test("unknown or true is true; unknown and true is false (Kleene logic)", () => {
    expect([mm("(made-up) or (min-width: 1px)"), mm("(made-up) and (min-width: 1px)")]).toEqual([true, false]);
  });

  test("min-/max- with a range operator is invalid", () => {
    expect(mm("(min-width > 10px)")).toBe(false);
  });
});

describe("range context — https://drafts.csswg.org/mediaqueries-5/#mq-range-context", () => {
  test("width comparisons in both directions and the two-sided form", () => {
    expect([
      mm("(width >= 1024px)"),
      mm("(width > 1024px)"),
      mm("(1000px < width)"),
      mm("(400px <= width <= 1100px)"),
      mm("(1100px >= width > 1023px)"),
      mm("(width = 1024px)"),
    ]).toEqual([true, false, true, true, true, true]);
  });

  test("min-width/max-width are inclusive", () => {
    expect([mm("(min-width: 1024px)"), mm("(max-width: 1024px)"), mm("(max-width: 1023.5px)")]).toEqual([
      true,
      true,
      false,
    ]);
  });

  test("relative and absolute length units (em = 16px)", () => {
    expect([
      mm("(min-width: 64em)"),
      mm("(min-width: 64.1em)"),
      mm("(max-width: 10in)"),
      mm("(min-height: 48rem)"),
    ]).toEqual([true, false, false, true]);
  });
});

describe("viewport features — https://drafts.csswg.org/mediaqueries-5/#width", () => {
  test("width/height follow the createWindow viewport", () => {
    expect([
      mm("(max-width: 500px)", { width: 400, height: 900 }),
      mm("(min-height: 800px)", { width: 400, height: 900 }),
    ]).toEqual([true, true]);
  });

  test("orientation: portrait when height >= width (https://drafts.csswg.org/mediaqueries-5/#orientation)", () => {
    expect([mm("(orientation: landscape)"), mm("(orientation: portrait)", { width: 500, height: 500 })]).toEqual([
      true,
      true,
    ]);
  });

  test("aspect-ratio compares width/height ratios (https://drafts.csswg.org/mediaqueries-5/#aspect-ratio)", () => {
    expect([mm("(aspect-ratio: 4/3)"), mm("(min-aspect-ratio: 16/9)"), mm("(max-aspect-ratio: 2)")]).toEqual([
      true,
      false,
      true,
    ]);
  });

  test("resolution in dppx/x/dpi (https://drafts.csswg.org/mediaqueries-5/#resolution)", () => {
    expect([
      mm("(resolution: 1dppx)"),
      mm("(min-resolution: 2x)", { devicePixelRatio: 2 }),
      mm("(min-resolution: 192dpi)", { devicePixelRatio: 2 }),
      mm("(min-resolution: 2dppx)"),
    ]).toEqual([true, true, true, false]);
  });

  test("-webkit-device-pixel-ratio and its min-/max- forms (https://compat.spec.whatwg.org/#css-media-queries-webkit-device-pixel-ratio)", () => {
    expect([
      mm("(-webkit-device-pixel-ratio: 1)"),
      mm("(-webkit-min-device-pixel-ratio: 1)"),
      mm("(-webkit-min-device-pixel-ratio: 2)"),
      mm("(-webkit-max-device-pixel-ratio: 1.5)"),
      mm("(-webkit-min-device-pixel-ratio: 2)", { devicePixelRatio: 2 }),
    ]).toEqual([true, true, false, true, true]);
  });
});

describe("user preference and interaction features — https://drafts.csswg.org/mediaqueries-5/#mf-user-preferences", () => {
  test("defaults: light scheme, no reduced motion, hover with a fine pointer", () => {
    expect([
      mm("(prefers-color-scheme: light)"),
      mm("(prefers-color-scheme: dark)"),
      mm("(prefers-reduced-motion: reduce)"),
      mm("(prefers-reduced-motion)"),
      mm("(hover: hover)"),
      mm("(pointer: fine)"),
      mm("(any-pointer: coarse)"),
    ]).toEqual([true, false, false, false, true, true, false]);
  });

  test("boolean context: a feature is true unless its value is none / no-preference", () => {
    expect([mm("(hover)"), mm("(prefers-contrast)"), mm("(forced-colors)")]).toEqual([true, false, false]);
  });

  test("mediaFeatures overrides individual features", () => {
    const opts = {
      mediaFeatures: { "prefers-color-scheme": "dark", "prefers-reduced-motion": "reduce", pointer: "coarse" },
    };
    expect([
      mm("(prefers-color-scheme: dark)", opts),
      mm("(prefers-reduced-motion)", opts),
      mm("(pointer: coarse)", opts),
    ]).toEqual([true, true, true]);
  });
});

describe("MediaQueryList — https://drafts.csswg.org/cssom-view/#the-mediaquerylist-interface", () => {
  // TODO(window): window/media.ts MediaQueryList.media returns the query as passed; per
  // https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-media it is the serialized list
  // (css/media.ts normalizeMediaText). Not changed here: libraries compare `mql.media` with
  // their own query string, so this needs a compat decision by the window owner.
  test.fails("media is the serialized query list (https://drafts.csswg.org/cssom/#serialize-a-media-query-list)", () => {
    const w = createWindow() as any;
    expect(w.matchMedia("SCREEN  AND (MIN-WIDTH:100PX),PRINT").media).toBe("screen and (min-width: 100px), print");
    expect(w.matchMedia("not all and (monochrome)").media).toBe("not all and (monochrome)");
  });

  test.fails('an invalid query serializes as "not all" (TODO(window): see above)', () => {
    expect((createWindow() as any).matchMedia("(min-width: ").media).toBe("not all");
  });

  test("change events fire when a resize flips matches (https://drafts.csswg.org/cssom-view/#evaluate-media-queries-and-report-changes)", () => {
    const w = createWindow({ width: 1024, height: 768 }) as any;
    const mql = w.matchMedia("(max-width: 600px)");
    const seen: boolean[] = [];
    mql.addEventListener("change", (e: any) => seen.push(e.matches));
    const legacy: boolean[] = [];
    mql.addListener((e: any) => legacy.push(e.matches));
    w.resizeTo(500, 768);
    w.resizeTo(550, 768);
    w.resizeTo(800, 768);
    expect([seen, legacy, mql.matches]).toEqual([[true, false], [true, false], false]);
  });
});

describe("@media in style sheets — https://drafts.csswg.org/css-conditional-3/#at-media", () => {
  test("rules apply only while the condition matches the viewport", () => {
    const w = createWindow({ width: 1024 }) as any;
    w.document.head.innerHTML = `<style>p { color: red } @media (max-width: 600px) { p { color: green } }</style>`;
    w.document.body.innerHTML = `<p>x</p>`;
    const p = w.document.querySelector("p");
    expect(w.getComputedStyle(p).color).toBe("red");
    w.resizeTo(500, 768);
    expect(w.getComputedStyle(p).color).toBe("green");
  });

  test("the media attribute of <style> gates the whole sheet", () => {
    const w = createWindow() as any;
    w.document.head.innerHTML = `<style media="print">p { color: red }</style><style media="screen and (min-width: 1px)">p { background-color: blue }</style>`;
    w.document.body.innerHTML = `<p>x</p>`;
    const cs = w.getComputedStyle(w.document.querySelector("p"));
    expect([cs.color, cs.backgroundColor]).not.toContain("red");
    expect(cs.backgroundColor).toBe("blue");
  });
});

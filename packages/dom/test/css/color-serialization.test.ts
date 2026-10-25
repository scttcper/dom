/**
 * Specified-value serialization of colors read back from `element.style`.
 *
 * Specs:
 *   CSSOM §6.7.2 serializing CSS values — https://drafts.csswg.org/cssom/#serializing-css-values
 *   CSS Color 4 §15 serializing <color> — https://drafts.csswg.org/css-color-4/#serializing-color-values
 *     sRGB values — https://drafts.csswg.org/css-color-4/#serializing-sRGB-values
 *     lab()/lch() — https://drafts.csswg.org/css-color-4/#serializing-lab-lch
 *     oklab()/oklch() — https://drafts.csswg.org/css-color-4/#serializing-oklab-oklch
 *     color() — https://drafts.csswg.org/css-color-4/#serializing-color-function-values
 *   CSS Color 5 color-mix() — https://drafts.csswg.org/css-color-5/#serial-color-mix
 *     light-dark() — https://drafts.csswg.org/css-color-5/#light-dark
 *     relative colors — https://drafts.csswg.org/css-color-5/#relative-colors
 *   CSS Images 4 gradients — https://drafts.csswg.org/css-images-4/#gradients
 *   SVG 2 <paint> — https://svgwg.org/svg2-draft/painting.html#SpecifyingPaint
 *
 * Expected values are what jsdom (cssstyle / @asamuzakjp/css-color) returns; the same inputs run
 * differentially against jsdom in fixtures/declaration-cases.json. Downstream: Sentry's
 * ansiText.spec.tsx reads `style.color` back after writing a color-mix() with hex colors
 * (downstream/sentry TRIAGE.md cluster 10).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";

let document: Document;
beforeEach(() => {
  document = createWindow().document;
});

function styleAfterSetting(property: string, value: string): string {
  const el = document.createElement("span") as unknown as { style: { setProperty(p: string, v: string): void; getPropertyValue(p: string): string } };
  el.style.setProperty(property, value);
  return el.style.getPropertyValue(property);
}

describe("sRGB colors — https://drafts.csswg.org/css-color-4/#serializing-sRGB-values", () => {
  test("hex colors serialize as rgb() / rgba(); keywords stay keywords, lower-cased", () => {
    const el = document.createElement("span") as unknown as { style: { color: string; backgroundColor: string } };
    el.style.color = "#ff8700";
    expect(el.style.color).toBe("rgb(255, 135, 0)");
    el.style.color = "#ff870080";
    expect(el.style.color).toBe("rgba(255, 135, 0, 0.5)");
    el.style.color = "RED";
    expect(el.style.color).toBe("red");
    el.style.color = "currentColor";
    expect(el.style.color).toBe("currentcolor");
    el.style.backgroundColor = "#fff";
    expect(el.style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  test("every color-valued longhand and the border shorthand convert hex", () => {
    for (const p of ["background-color", "border-top-color", "border-left-color", "outline-color", "text-decoration-color", "caret-color", "column-rule-color"]) {
      expect(styleAfterSetting(p, "#f00")).toBe("rgb(255, 0, 0)");
    }
    expect(styleAfterSetting("border", "1px solid #f00")).toBe("1px solid rgb(255, 0, 0)");
    expect(styleAfterSetting("border-color", "red #F00")).toBe("red rgb(255, 0, 0)");
  });
});

describe("color-mix() — https://drafts.csswg.org/css-color-5/#serial-color-mix", () => {
  test("nested colors serialize as specified values and keywords are lower-cased (Sentry ansiText)", () => {
    expect(styleAfterSetting("color", "color-mix(in srgb, #ff8700 80%, currentColor)")).toBe("color-mix(in srgb, rgb(255, 135, 0) 80%, currentcolor)");
    expect(styleAfterSetting("color", "COLOR-MIX(IN SRGB, RED 20%, #00f)")).toBe("color-mix(in srgb, red 20%, rgb(0, 0, 255))");
    expect(styleAfterSetting("color", "color-mix(in oklch longer hue, #f00, #00f)")).toBe("color-mix(in oklch longer hue, rgb(255, 0, 0), rgb(0, 0, 255))");
    expect(styleAfterSetting("color", "color-mix(in srgb, color-mix(in srgb, #f00, #0f0), #00f)")).toBe(
      "color-mix(in srgb, color-mix(in srgb, rgb(255, 0, 0), rgb(0, 255, 0)), rgb(0, 0, 255))",
    );
  });

  test("percentages: a lone 50% is omitted, a lone second percentage becomes the first's complement, two are kept", () => {
    expect(styleAfterSetting("color", "color-mix(in srgb, #f00 50%, #00f)")).toBe("color-mix(in srgb, rgb(255, 0, 0), rgb(0, 0, 255))");
    expect(styleAfterSetting("color", "color-mix(in srgb, #f00, #00f 30%)")).toBe("color-mix(in srgb, rgb(255, 0, 0) 70%, rgb(0, 0, 255))");
    expect(styleAfterSetting("color", "color-mix(in srgb, 30% #f00, #00f)")).toBe("color-mix(in srgb, rgb(255, 0, 0) 30%, rgb(0, 0, 255))");
    expect(styleAfterSetting("color", "color-mix(in srgb, #f00 20%, #00f 80%)")).toBe("color-mix(in srgb, rgb(255, 0, 0) 20%, rgb(0, 0, 255) 80%)");
  });

  test("invalid: no interpolation method, three colors, both percentages 0%, a percentage above 100%", () => {
    expect(styleAfterSetting("color", "color-mix(#f00, #00f)")).toBe("");
    expect(styleAfterSetting("color", "color-mix(in srgb, #f00, #00f, #0f0)")).toBe("");
    expect(styleAfterSetting("color", "color-mix(in srgb, #f00 0%, #00f 0%)")).toBe("");
    expect(styleAfterSetting("color", "color-mix(in srgb, #f00 120%, #00f)")).toBe("");
  });

  test("light-dark() serializes both of its colors", () => {
    expect(styleAfterSetting("color", "light-dark(#fff, rgb(0 0 0 / 50%))")).toBe("light-dark(rgb(255, 255, 255), rgba(0, 0, 0, 0.5))");
  });

  test("relative colors keep their channel keywords and serialize the origin color", () => {
    expect(styleAfterSetting("color", "rgb(from #f00 r g b)")).toBe("rgb(from rgb(255, 0, 0) r g b)");
    expect(styleAfterSetting("color", "rgb(FROM RED R G B)")).toBe("rgb(from red r g b)");
  });
});

describe("lab() / lch() / oklab() / oklch() / color() — https://drafts.csswg.org/css-color-4/#serializing-lab-lch", () => {
  test("percentages resolve against the reference ranges; lightness clamps; hue becomes degrees in [0, 360)", () => {
    expect(styleAfterSetting("color", "lab(50% 40% 59.5)")).toBe("lab(50 50 59.5)");
    expect(styleAfterSetting("color", "lab(150% 40 59.5)")).toBe("lab(100 40 59.5)");
    expect(styleAfterSetting("color", "lch(50% 30 0.5turn)")).toBe("lch(50 30 180)");
    expect(styleAfterSetting("color", "lch(50 30 -30)")).toBe("lch(50 30 330)");
    expect(styleAfterSetting("color", "oklab(50% 10% -0.1)")).toBe("oklab(0.5 0.04 -0.1)");
    expect(styleAfterSetting("color", "oklch(0.5 -0.2 120deg)")).toBe("oklch(0.5 0 120)");
  });

  test("alpha: percentages become numbers, 1 is omitted, none is kept", () => {
    expect(styleAfterSetting("color", "oklch(0.5 0.2 120 / 50%)")).toBe("oklch(0.5 0.2 120 / 0.5)");
    expect(styleAfterSetting("color", "lab(50 40 59.5 / 1)")).toBe("lab(50 40 59.5)");
    expect(styleAfterSetting("color", "lab(50 40 59.5 / none)")).toBe("lab(50 40 59.5 / none)");
  });

  test("color(): space lower-cased (xyz → xyz-d65), percentages as numbers; wrong channel count is invalid", () => {
    expect(styleAfterSetting("color", "COLOR(SRGB 100% 0% 0% / 0.5)")).toBe("color(srgb 1 0 0 / 0.5)");
    expect(styleAfterSetting("color", "color(xyz 0.1 0.2 0.3)")).toBe("color(xyz-d65 0.1 0.2 0.3)");
    expect(styleAfterSetting("color", "color(srgb 1 0)")).toBe("");
    expect(styleAfterSetting("color", "lab(50 40)")).toBe("");
  });
});

describe("colors in <gradient> and <paint> values — https://drafts.csswg.org/css-images-4/#gradients", () => {
  test("gradient color stops serialize as colors; keywords and units are lower-cased; default direction omitted", () => {
    expect(styleAfterSetting("background-image", "LINEAR-GRADIENT(to bottom, #F00 10PX, RED)")).toBe("linear-gradient(rgb(255, 0, 0) 10px, red)");
    expect(styleAfterSetting("background-image", "radial-gradient(ellipse farthest-corner at 10px 20px, #f00, #00f)")).toBe(
      "radial-gradient(at 10px 20px, rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(styleAfterSetting("background", "#f00 linear-gradient(#f00, #00f)")).toBe("linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255)) rgb(255, 0, 0)");
    expect(styleAfterSetting("list-style-image", "linear-gradient(#f00,#00f)")).toBe("linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))");
  });

  test("a gradient needs two color stops and no empty arguments", () => {
    expect(styleAfterSetting("background-image", "linear-gradient(red)")).toBe("");
    expect(styleAfterSetting("background-image", "linear-gradient(#f00 , , #00f)")).toBe("");
  });

  test("fill / stroke: a single color, url or keyword is normalized; paint with a fallback is kept", () => {
    expect(styleAfterSetting("fill", "#f00")).toBe("rgb(255, 0, 0)");
    expect(styleAfterSetting("stroke", "currentColor")).toBe("currentcolor");
    expect(styleAfterSetting("fill", "URL(#a)")).toBe('url("#a")');
    expect(styleAfterSetting("fill", "Context-Stroke")).toBe("context-stroke");
    expect(styleAfterSetting("fill", "url(#a) red")).toBe("url(#a) red");
  });
});

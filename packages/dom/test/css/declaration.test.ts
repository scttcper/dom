/**
 * CSSStyleDeclaration: inline style, value parsing/serialization, shorthands.
 *
 * Specs:
 *   CSSOM §6.6 CSSStyleDeclaration — https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
 *   CSSOM §6.6.1 camel-cased attributes — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-camel-cased-attribute
 *   CSSOM §6.7.2 serializing CSS values — https://drafts.csswg.org/cssom/#serializing-css-values
 *   CSSOM ElementCSSInlineStyle — https://drafts.csswg.org/cssom/#the-elementcssinlinestyle-mixin
 *
 * Value normalization is differentially tested against jsdom (the oracle Testing Library users
 * wrote their tests against): fixtures/declaration-cases.json is run through both.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow, type Document } from "@ctrl/dom";

let document: Document;
beforeEach(() => {
  document = createWindow().document;
});

function div(): HTMLElementLike {
  return document.body!.appendChild(document.createElement("div")) as unknown as HTMLElementLike;
}

interface HTMLElementLike {
  style: Record<string, unknown> & {
    cssText: string;
    length: number;
    item(i: number): string;
    getPropertyValue(p: string): string;
    getPropertyPriority(p: string): string;
    setProperty(p: string, v: string | null, prio?: string): void;
    removeProperty(p: string): string;
    [Symbol.iterator](): Iterator<string>;
  };
  getAttribute(n: string): string | null;
  setAttribute(n: string, v: string): void;
  removeAttribute(n: string): void;
}

/** Cases where we intentionally differ from jsdom 30 (jsdom rejects valid values). */
const JSDOM_BUGS = new Set(["font|italic small-caps 700 16px/2 serif", "width|fit-content(10px)"]);

describe("§6.7.2 serializing CSS values (differential vs jsdom) — https://drafts.csswg.org/cssom/#serialize-a-css-value", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/declaration-cases.json", import.meta.url), "utf8")) as [string, string][];
  const jsdomStyle = new JSDOM("<div></div>").window.document.querySelector("div")!.style;
  for (const [prop, value] of cases) {
    const bug = JSDOM_BUGS.has(`${prop}|${value}`);
    test(`setProperty(${JSON.stringify(prop)}, ${JSON.stringify(value)}) ${bug ? "accepts a value jsdom wrongly rejects" : "matches jsdom getPropertyValue and cssText"}`, () => {
      const ours = div().style;
      ours.setProperty(prop, value);
      jsdomStyle.cssText = "";
      jsdomStyle.setProperty(prop, value);
      if (bug) {
        expect(jsdomStyle.getPropertyValue(prop)).toBe("");
        expect(ours.getPropertyValue(prop)).not.toBe("");
        return;
      }
      expect(ours.getPropertyValue(prop)).toBe(jsdomStyle.getPropertyValue(prop));
      expect(ours.cssText).toBe(jsdomStyle.cssText);
    });
  }
});

describe("§6.6.1 named attributes — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-camel-cased-attribute", () => {
  test("camelCase, dashed and webkit-cased attributes read and write the same declaration", () => {
    const s = div().style;
    s.backgroundColor = "red";
    expect(s["background-color"]).toBe("red");
    s.webkitUserSelect = "none";
    expect(s.WebkitUserSelect).toBe("none");
    expect(s.getPropertyValue("-webkit-user-select")).toBe("none");
  });

  test("cssFloat maps to float", () => {
    const s = div().style;
    s.cssFloat = "left";
    expect(s.float).toBe("left");
    expect(s.cssText).toBe("float: left;");
  });

  test("attributes live on the prototype (no Proxy, no own properties)", () => {
    const s = div().style;
    expect(Object.hasOwn(s, "color")).toBe(false);
    expect("color" in s).toBe(true);
  });

  test("assigning null clears; numbers are stringified and validated like React's unitless numbers", () => {
    const s = div().style;
    s.width = "10px";
    s.width = 20;
    expect(s.width).toBe("10px");
    s.opacity = 0.5;
    expect(s.opacity).toBe("0.5");
    s.width = null;
    expect(s.width).toBe("");
  });

  test("unknown properties are ignored (expando assignment does not create declarations)", () => {
    const s = div().style;
    s.COLOR = "red";
    expect(s.cssText).toBe("");
  });
});

describe("§6.6 CSSStyleDeclaration methods — https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface", () => {
  test("setProperty with priority / getPropertyPriority / removeProperty returns the old value", () => {
    const s = div().style;
    s.setProperty("color", "red", "important");
    expect(s.getPropertyPriority("color")).toBe("important");
    expect(s.cssText).toBe("color: red !important;");
    s.setProperty("color", "blue", "bogus");
    expect(s.color).toBe("red");
    expect(s.removeProperty("color")).toBe("red");
    expect(s.length).toBe(0);
  });

  test("custom properties keep case and value text", () => {
    const s = div().style;
    s.setProperty("--Main-Color", "  #FFF  ");
    expect(s.getPropertyValue("--Main-Color")).toBe("#FFF");
    expect(s.getPropertyValue("--main-color")).toBe("");
    expect(s.cssText).toBe("--Main-Color: #FFF;");
  });

  test("length/item/indexed access/iteration enumerate longhands", () => {
    const s = div().style;
    s.margin = "1px 2px";
    expect(s.length).toBe(4);
    expect([s[0], s.item(1), s[2], s[3]]).toEqual(["margin-top", "margin-right", "margin-bottom", "margin-left"]);
    expect([...s]).toEqual(["margin-top", "margin-right", "margin-bottom", "margin-left"]);
    expect(s[4]).toBeUndefined();
    s.removeProperty("margin");
    expect(s[0]).toBeUndefined();
  });

  test("shorthands re-serialize from longhands (margin + margin-top)", () => {
    const s = div().style;
    s.cssText = "margin: 1px; margin-top: 2px";
    expect(s.margin).toBe("2px 1px 1px");
    expect(s.cssText).toBe("margin: 2px 1px 1px;");
  });

  test("important beats a later normal declaration in the same block", () => {
    const s = div().style;
    s.cssText = "color: red !important; color: blue";
    expect(s.cssText).toBe("color: red !important;");
  });

  test("shorthand with var() is stored as the shorthand (pending substitution)", () => {
    const s = div().style;
    s.padding = "var(--x) 1px";
    expect(s.padding).toBe("var(--x) 1px");
    expect(s.paddingTop).toBe("");
  });

  test("CSS-wide keywords expand to every longhand and serialize back", () => {
    const s = div().style;
    s.border = "inherit";
    expect(s.borderTopColor).toBe("inherit");
    expect(s.border).toBe("inherit");
  });
});

describe("ElementCSSInlineStyle — https://drafts.csswg.org/cssom/#the-elementcssinlinestyle-mixin", () => {
  test("declaration changes update the style attribute", () => {
    const el = div();
    el.style.color = "red";
    el.style.setProperty("--x", "1");
    expect(el.getAttribute("style")).toBe("color: red; --x: 1;");
  });

  test("style attribute changes re-parse the declaration", () => {
    const el = div();
    const s = el.style;
    el.setAttribute("style", "display: none; width: 10PX");
    expect(s.display).toBe("none");
    expect(s.width).toBe("10px");
    el.removeAttribute("style");
    expect(s.length).toBe(0);
  });

  test("invalid declarations in the attribute are dropped; the attribute text is kept", () => {
    const el = div();
    el.setAttribute("style", "color: nope; width: 1px; bogus");
    expect(el.style.cssText).toBe("width: 1px;");
    expect(el.getAttribute("style")).toBe("color: nope; width: 1px; bogus");
  });
});

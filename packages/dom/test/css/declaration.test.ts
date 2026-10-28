/**
 * CSSStyleDeclaration: inline style, value parsing/serialization, shorthands.
 *
 * Specs:
 *   CSSOM §6.6 CSSStyleDeclaration — https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
 *   CSSOM §6.6.1 camel-cased attributes — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-camel-cased-attribute
 *   CSSOM §6.7.2 serializing CSS values — https://drafts.csswg.org/cssom/#serializing-css-values
 *   CSSOM §6.7.2 serialize a CSS declaration block — https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block
 *   CSSOM §6.7.2 serialize a CSS declaration — https://drafts.csswg.org/cssom/#serialize-a-css-declaration
 *   CSSOM ElementCSSInlineStyle — https://drafts.csswg.org/cssom/#the-elementcssinlinestyle-mixin
 *
 * Value normalization is differentially tested against jsdom (the oracle Testing Library users
 * wrote their tests against): fixtures/declaration-cases.json is run through both. Incremental
 * block serialization (DeclBlock.serialize) is differentially tested against the full algorithm
 * (DeclBlock.serializeAll).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow, type Document } from "@ctrl/dom";
import { $block, type DeclBlock } from "@ctrl/dom/internal";

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
  const cases = JSON.parse(readFileSync(new URL("./fixtures/declaration-cases.json", import.meta.url), "utf8")) as [
    string,
    string,
  ][];
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

describe("§6.7.2 serialize a CSS declaration block, incrementally — https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block", () => {
  test("declarations appended one at a time (React's mount writes) serialize onto the previous text", () => {
    const el = div();
    el.style.position = "absolute";
    el.style.left = "0px";
    el.style.setProperty("--anchor-width", "10px");
    el.style.transform = "translate(0px, 0px)";
    expect(el.getAttribute("style")).toBe(
      "position: absolute; left: 0px; --anchor-width: 10px; transform: translate(0px, 0px);",
    );
  });

  test("shorthand loop: an appended longhand that completes an expanded shorthand regroups the earlier longhands", () => {
    const el = div();
    el.style.color = "red";
    el.style.marginTop = "1px";
    el.style.marginRight = "2px";
    el.style.marginBottom = "3px";
    expect(el.getAttribute("style")).toBe("color: red; margin-top: 1px; margin-right: 2px; margin-bottom: 3px;");
    el.style.marginLeft = "4px";
    expect(el.getAttribute("style")).toBe("color: red; margin: 1px 2px 3px 4px;");
  });

  test("shorthand loop: an appended shorthand of a family absent from the earlier declarations groups on its own", () => {
    // Base UI's visually hidden input style, as React writes it.
    const el = div();
    el.style.clipPath = "inset(50%)";
    el.style.overflow = "hidden";
    el.style.border = "0";
    expect(el.getAttribute("style")).toBe("clip-path: inset(50%); overflow: hidden; border: 0px;");
    el.style.padding = "0";
    el.style.width = "1px";
    el.style.margin = "-1px";
    expect(el.getAttribute("style")).toBe(
      "clip-path: inset(50%); overflow: hidden; border: 0px; padding: 0px; width: 1px; margin: -1px;",
    );
  });

  test("shorthand loop: a longhand appended to a family with earlier declarations regroups across them", () => {
    const el = div();
    el.style.borderTopWidth = "1px";
    el.style.color = "red";
    el.style.borderTopStyle = "solid";
    el.style.borderTopColor = "blue";
    expect(el.getAttribute("style")).toBe("border-top: 1px solid blue; color: red;");
  });

  test("a value changed in place or a removal serializes the whole block again", () => {
    const el = div();
    el.style.left = "1px";
    el.style.top = "2px";
    el.style.left = "3px";
    expect(el.getAttribute("style")).toBe("left: 3px; top: 2px;");
    el.style.removeProperty("left");
    el.style.width = "4px";
    expect(el.getAttribute("style")).toBe("top: 2px; width: 4px;");
  });

  test("after random edits the style attribute and cssText equal the full algorithm's result", () => {
    // Longhands of every expanded shorthand family, so random edits complete and break shorthands.
    // oxfmt-ignore
    const props = [
      "position", "top", "left", "width", "z-index", "opacity", "--a", "--b",
      "margin-top", "margin-right", "margin-bottom", "margin-left", "margin",
      "padding-top", "padding-right", "padding-bottom", "padding-left", "padding",
      "flex-grow", "flex-shrink", "flex-basis", "flex",
      "border-top-width", "border-top-style", "border-top-color", "border-top",
      "font-style", "font-variant", "font-weight", "font-size", "line-height", "font-family",
    ];
    const values = ["1px", "2px", "auto", "solid", "red", "0", "1", "serif", "normal", "italic", "bold", "10px"];
    let seed = 1;
    const random = (n: number) => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) % n;
    let regrouped = 0;
    for (let round = 0; round < 1000; round++) {
      const el = div();
      const block = (el.style as unknown as Record<symbol, DeclBlock>)[$block];
      for (let op = 0; op < 25; op++) {
        const before = el.getAttribute("style");
        const kind = random(10);
        const p = props[random(props.length)];
        if (kind < 6) el.style.setProperty(p, values[random(values.length)], random(8) === 0 ? "important" : "");
        else if (kind < 8) el.style.removeProperty(p);
        else if (kind < 9) el.style.cssText = "top: 1px; margin: 2px; --a: x";
        // Writing the attribute keeps the author's text instead of a serialization.
        else el.setAttribute("style", "left: 3px; flex: 1");
        const expected = block.serializeAll();
        const attr = el.getAttribute("style");
        if (kind < 9 && attr !== before) expect(attr).toBe(expected);
        expect(el.style.cssText).toBe(expected);
        if (kind < 6 && /(^| )(margin|padding|flex|border-top|font):/.test(expected)) regrouped++;
        // Indexed properties follow appends, removals and reparses.
        const style = el.style as unknown as Record<number, string | undefined>;
        for (let i = 0; i < el.style.length; i++) expect(style[i]).toBe(el.style.item(i));
        expect(style[el.style.length]).toBeUndefined();
      }
    }
    expect(regrouped).toBeGreaterThan(100);
  });
});

describe("§6.6 setProperty with expanded shorthands — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-setproperty", () => {
  test("the same shorthand value on two elements expands independently (shared expansions are not modified)", () => {
    const a = div();
    const b = div();
    a.style.border = "1px solid red";
    b.style.border = "1px solid red";
    a.style.borderTopColor = "blue";
    expect(a.style.borderTopColor).toBe("blue");
    expect(b.style.borderTopColor).toBe("red");
    expect(b.getAttribute("style")).toBe("border: 1px solid red;");
  });

  test("repeated invalid, var() and CSS-wide keyword shorthand values give the same result every time", () => {
    for (let round = 0; round < 2; round++) {
      const s = div().style;
      s.margin = "bogus";
      expect(s.cssText).toBe("");
      s.padding = "var(--x) 1px";
      expect(s.padding).toBe("var(--x) 1px");
      expect(s.paddingTop).toBe("");
      s.border = "inherit";
      expect(s.borderTopColor).toBe("inherit");
      expect(s.border).toBe("inherit");
    }
  });
});

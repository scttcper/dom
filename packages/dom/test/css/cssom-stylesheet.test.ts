/**
 * CSSStyleSheet, CSSRule subclasses and the style sheet lists that CSS-in-JS libraries
 * (emotion, styled-components, vanilla-extract, Lit) drive.
 *
 * Specs:
 *   CSSOM §6.1.2 The CSSStyleSheet interface — https://drafts.csswg.org/cssom/#the-cssstylesheet-interface
 *   CSSOM §6.2 Style sheet collections — https://drafts.csswg.org/cssom/#dom-documentorshadowroot-stylesheets
 *   CSSOM §6.4 CSS rules — https://drafts.csswg.org/cssom/#css-rules
 *   CSSOM CSSImportRule — https://drafts.csswg.org/cssom/#the-cssimportrule-interface
 *   CSS Conditional 3 §7 CSSMediaRule / CSSSupportsRule — https://drafts.csswg.org/css-conditional-3/#the-cssmediarule-interface
 *   CSS Containment 3 CSSContainerRule — https://drafts.csswg.org/css-contain-3/#the-csscontainerrule-interface
 *   CSS Cascade 5 §7.4 layer APIs — https://drafts.csswg.org/css-cascade-5/#layer-apis
 *   CSS Cascade 6 CSSScopeRule — https://drafts.csswg.org/css-cascade-6/#the-cssscoperule-interface
 *   CSS Transitions 2 CSSStartingStyleRule — https://drafts.csswg.org/css-transitions-2/#the-cssstartingstylerule-interface
 *   CSS Nesting 1 CSSNestedDeclarations — https://drafts.csswg.org/css-nesting-1/#cssnesteddeclarations
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, CSSStyleSheet, type Document, type Window } from "@rtd/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let window: Window;
let document: Document;
beforeEach(() => {
  window = createWindow();
  document = window.document;
});

function sheet(text = ""): any {
  const s = new CSSStyleSheet() as any;
  if (text !== "") s.replaceSync(text);
  return s;
}

function styleElementSheet(text: string): any {
  const style = document.createElement("style");
  style.textContent = text;
  document.head!.appendChild(style);
  return (style as any).sheet;
}

const color = (sel: string) => (window.getComputedStyle(document.querySelector(sel)!) as any).color;

describe("insertRule — https://drafts.csswg.org/cssom/#dom-cssstylesheet-insertrule (insert a CSS rule: https://drafts.csswg.org/cssom/#insert-a-css-rule)", () => {
  test("returns the index; the default index is 0", () => {
    const s = sheet(".a { color: red }");
    expect(s.insertRule(".b { color: blue }")).toBe(0);
    expect(s.insertRule(".c { color: green }", 2)).toBe(2);
    expect([...s.cssRules].map((r: any) => r.selectorText)).toEqual([".b", ".a", ".c"]);
  });

  test("step 3: an index past the end throws IndexSizeError", () => {
    expect(() => sheet().insertRule(".a {}", 1)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });

  test("step 2: text that is not exactly one rule throws SyntaxError", () => {
    expect(() => sheet().insertRule("")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => sheet().insertRule(".a {} .b {}")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    expect(() => sheet().insertRule("color: red")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });

  test("step 5: a non-@import/@layer rule cannot go before an @import rule (HierarchyRequestError)", () => {
    const s = styleElementSheet(`@import url(a.css); .x {}`);
    expect(() => s.insertRule(".y {}", 0)).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
    expect(s.insertRule(".y {}", 1)).toBe(1);
  });

  test("step 5: @import after a style rule throws HierarchyRequestError", () => {
    const s = styleElementSheet(`.x {}`);
    expect(() => s.insertRule("@import url(a.css);", 1)).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
  });

  test("step 4 (constructed): @import rules throw SyntaxError in constructed sheets", () => {
    expect(() => sheet().insertRule("@import url(a.css);")).toThrow(expect.objectContaining({ name: "SyntaxError" }));
  });

  test("inserted rules apply to the cascade (emotion's speedy mode)", () => {
    document.body!.innerHTML = `<p class="t">x</p>`;
    const s = styleElementSheet("");
    s.insertRule(".t { color: blue }");
    expect(color(".t")).toBe("blue");
  });
});

describe("deleteRule — https://drafts.csswg.org/cssom/#dom-cssstylesheet-deleterule", () => {
  test("removes the rule at the index and detaches it (parentStyleSheet becomes null)", () => {
    const s = sheet(".a {} .b {}");
    const a = s.cssRules[0];
    s.deleteRule(0);
    expect(s.cssRules.length).toBe(1);
    expect(a.parentStyleSheet).toBeNull();
  });

  test("an index past the last rule throws IndexSizeError", () => {
    expect(() => sheet(".a {}").deleteRule(1)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });

  test("deleted rules stop applying", () => {
    document.body!.innerHTML = `<p class="t">x</p>`;
    const s = styleElementSheet(".t { color: blue }");
    s.deleteRule(0);
    expect(color(".t")).not.toBe("blue");
  });
});

describe("legacy addRule / removeRule — https://drafts.csswg.org/cssom/#dom-cssstylesheet-addrule", () => {
  test("addRule(selector, style) appends `selector { style }` and returns -1", () => {
    const s = sheet(".a {}");
    expect(s.addRule(".b", "color: red")).toBe(-1);
    expect(s.cssRules[1].cssText).toBe(".b { color: red; }");
  });

  test("addRule with an index inserts there; an empty style yields an empty rule", () => {
    const s = sheet(".a {}");
    s.addRule(".b", "", 0);
    expect(s.cssRules[0].cssText).toBe(".b { }");
  });

  test("removeRule() defaults to index 0 (https://drafts.csswg.org/cssom/#dom-cssstylesheet-removerule)", () => {
    const s = sheet(".a {} .b {}");
    s.removeRule();
    expect(s.cssRules[0].selectorText).toBe(".b");
  });

  test("rules is an alias of cssRules", () => {
    const s = sheet(".a {}");
    expect(s.rules).toBe(s.cssRules);
  });
});

describe("cssRules — https://drafts.csswg.org/cssom/#dom-cssstylesheet-cssrules", () => {
  test("the same live CSSRuleList object reflects insertions and deletions", () => {
    const s = sheet(".a {}");
    const list = s.cssRules;
    s.insertRule(".b {}", 1);
    expect(list.length).toBe(2);
    expect(list.item(1).selectorText).toBe(".b");
    expect(list.item(5)).toBeNull();
    expect(s.cssRules).toBe(list);
  });
});

describe("replace / replaceSync — https://drafts.csswg.org/cssom/#synchronously-replace-the-rules-of-a-cssstylesheet", () => {
  test("replaceSync replaces every rule and detaches the old ones", () => {
    const s = sheet(".a {}");
    const old = s.cssRules[0];
    s.replaceSync(".b {} .c {}");
    expect([...s.cssRules].map((r: any) => r.selectorText)).toEqual([".b", ".c"]);
    expect(old.parentStyleSheet).toBeNull();
  });

  test("@import rules are ignored in constructed sheets", () => {
    const s = sheet(`@import url(a.css); .b { color: red }`);
    expect(s.cssRules.length).toBe(1);
    expect(s.cssRules[0].selectorText).toBe(".b");
  });

  test("text that merely contains \"@import\" inside a string or comment is kept intact", () => {
    const s = sheet(`/* @import url(x.css); */ .a::before { content: "@import x;" } .b { color: red }`);
    expect(s.cssRules.length).toBe(2);
    expect(s.cssRules[0].style.content).toBe(`"@import x;"`);
  });

  test("constructed flag: replace/replaceSync on a <style> sheet throw/reject NotAllowedError (https://drafts.csswg.org/cssom/#concept-css-style-sheet-constructed-flag)", async () => {
    const s = styleElementSheet(".a {}");
    expect(() => s.replaceSync(".b {}")).toThrow(expect.objectContaining({ name: "NotAllowedError" }));
    await expect(s.replace(".b {}")).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  test("disallow-modification flag: while replace() is pending, insertRule/deleteRule/replaceSync throw NotAllowedError (https://drafts.csswg.org/cssom/#concept-css-style-sheet-disallow-modification-flag)", async () => {
    const s = sheet(".a {}");
    const pending = s.replace(".b {}");
    expect(() => s.insertRule(".c {}")).toThrow(expect.objectContaining({ name: "NotAllowedError" }));
    expect(() => s.deleteRule(0)).toThrow(expect.objectContaining({ name: "NotAllowedError" }));
    expect(() => s.replaceSync(".c {}")).toThrow(expect.objectContaining({ name: "NotAllowedError" }));
    await expect(s.replace(".d {}")).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(await pending).toBe(s);
    expect(s.cssRules[0].selectorText).toBe(".b");
    s.insertRule(".e {}");
  });

  test("an adopted constructed sheet applies, and replaceSync re-styles (https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets)", () => {
    document.body!.innerHTML = `<p class="t">x</p>`;
    const s = sheet(".t { color: red }");
    (document as any).adoptedStyleSheets = [s];
    expect(color(".t")).toBe("red");
    s.replaceSync(".t { color: green }");
    expect(color(".t")).toBe("green");
  });

  test("adopting a non-constructed sheet throws NotAllowedError", () => {
    const s = styleElementSheet(".a {}");
    expect(() => ((document as any).adoptedStyleSheets = [s])).toThrow(expect.objectContaining({ name: "NotAllowedError" }));
  });
});

describe("document.styleSheets — https://drafts.csswg.org/cssom/#dom-documentorshadowroot-stylesheets", () => {
  test("lists <style> sheets in tree order, excludes adopted sheets, drops removed owners", () => {
    const a = document.createElement("style");
    a.textContent = ".a {}";
    const b = document.createElement("style");
    b.textContent = ".b {}";
    document.body!.appendChild(b);
    document.head!.appendChild(a);
    (document as any).adoptedStyleSheets = [sheet(".c {}")];
    const list = (document as any).styleSheets;
    expect([list[0].ownerNode, list[1].ownerNode]).toEqual([a, b]);
    expect(list.length).toBe(2);
    b.remove();
    expect(list.length).toBe(1);
  });

  test("StyleSheet attributes: type, ownerNode, media from the media attribute, title, disabled (https://drafts.csswg.org/cssom/#the-stylesheet-interface)", () => {
    document.head!.innerHTML = `<style media="print" title="Alt">.a {}</style>`;
    const s = (document as any).styleSheets[0];
    expect([s.type, s.ownerNode.localName, s.media.mediaText, s.title, s.disabled, s.href, s.parentStyleSheet]).toEqual([
      "text/css",
      "style",
      "print",
      "Alt",
      false,
      null,
      null,
    ]);
  });

  test("a disabled sheet stops applying", () => {
    document.head!.innerHTML = `<style>.t { color: red }</style>`;
    document.body!.innerHTML = `<p class="t">x</p>`;
    expect(color(".t")).toBe("red");
    (document as any).styleSheets[0].disabled = true;
    expect(color(".t")).not.toBe("red");
  });
});

describe("CSSRule.cssText — https://drafts.csswg.org/cssom/#dom-cssrule-csstext", () => {
  test("setting cssText does nothing", () => {
    const r = sheet(".a { color: red }").cssRules[0];
    r.cssText = ".b { color: blue }";
    expect(r.cssText).toBe(".a { color: red; }");
  });

  test("parentRule and parentStyleSheet for nested rules", () => {
    const s = sheet("@media screen { .a { color: red } }");
    const media = s.cssRules[0];
    const inner = media.cssRules[0];
    expect([inner.parentRule, inner.parentStyleSheet, media.parentRule]).toEqual([media, s, null]);
  });
});

describe("CSSGroupingRule — https://drafts.csswg.org/cssom/#the-cssgroupingrule-interface", () => {
  test("insertRule/deleteRule inside @media, with IndexSizeError bounds (https://drafts.csswg.org/cssom/#dom-cssgroupingrule-deleterule)", () => {
    const media = sheet("@media screen { .a {} }").cssRules[0];
    expect(media.insertRule(".b {}", 1)).toBe(1);
    expect(() => media.insertRule(".c {}", 5)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
    media.deleteRule(0);
    expect(media.cssRules[0].selectorText).toBe(".b");
    expect(() => media.deleteRule(3)).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
  });

  test("@import inside a grouping rule throws HierarchyRequestError", () => {
    const media = sheet("@media screen { }").cssRules[0];
    expect(() => media.insertRule("@import url(a.css);")).toThrow(expect.objectContaining({ name: "HierarchyRequestError" }));
  });
});

describe("conditional rules — https://drafts.csswg.org/css-conditional-3/#the-cssconditionrule-interface", () => {
  test("CSSMediaRule: media list and conditionText (https://drafts.csswg.org/css-conditional-3/#the-cssmediarule-interface)", () => {
    const r = sheet("@media screen and (min-width: 100px) { .a {} }").cssRules[0];
    expect([r.constructor.name, r.media.mediaText, r.conditionText]).toEqual(["CSSMediaRule", "screen and (min-width: 100px)", "screen and (min-width: 100px)"]);
  });

  test("CSSSupportsRule: conditionText (https://drafts.csswg.org/css-conditional-3/#the-csssupportsrule-interface)", () => {
    const r = sheet("@supports (display: grid) { .a {} }").cssRules[0];
    expect([r.constructor.name, r.conditionText]).toEqual(["CSSSupportsRule", "(display: grid)"]);
  });

  test("@supports applies its rules only when the condition holds (https://drafts.csswg.org/css-conditional-3/#at-supports)", () => {
    document.head!.innerHTML = `<style>@supports (display: grid) { .t { color: red } } @supports (display: nonsense) { .t { color: blue } }</style>`;
    document.body!.innerHTML = `<p class="t">x</p>`;
    expect(color(".t")).toBe("red");
  });

  test("CSSContainerRule: containerName and containerQuery (https://drafts.csswg.org/css-contain-3/#the-csscontainerrule-interface)", () => {
    const [named, anonymous] = [...sheet("@container card (min-width: 400px) { .a {} } @container (width > 1px) { .b {} }").cssRules];
    expect([named.containerName, named.containerQuery, named.conditionText]).toEqual(["card", "(min-width: 400px)", "card (min-width: 400px)"]);
    expect([anonymous.containerName, anonymous.containerQuery]).toEqual(["", "(width > 1px)"]);
  });
});

describe("layer APIs — https://drafts.csswg.org/css-cascade-5/#layer-apis", () => {
  test("CSSLayerBlockRule.name; anonymous layers have an empty name (https://drafts.csswg.org/css-cascade-5/#the-csslayerblockrule-interface)", () => {
    const [named, anon] = [...sheet("@layer base { .a {} } @layer { .b {} }").cssRules];
    expect([named.constructor.name, named.name, anon.name, anon.cssText]).toEqual(["CSSLayerBlockRule", "base", "", "@layer {\n  .b { }\n}"]);
  });

  test("CSSLayerStatementRule.nameList is a frozen array of the declared names (https://drafts.csswg.org/css-cascade-5/#the-csslayerstatementrule-interface)", () => {
    const r = sheet("@layer reset, base.components;").cssRules[0];
    expect([r.constructor.name, [...r.nameList], Object.isFrozen(r.nameList), r.cssText]).toEqual([
      "CSSLayerStatementRule",
      ["reset", "base.components"],
      true,
      "@layer reset, base.components;",
    ]);
  });
});

describe("CSSScopeRule — https://drafts.csswg.org/css-cascade-6/#the-cssscoperule-interface", () => {
  test("start and end are the scope boundaries' selector texts; null when absent", () => {
    const [both, startOnly, bare] = [...sheet("@scope (.card) to (.content) { img {} } @scope (.a) { b {} } @scope { c {} }").cssRules];
    expect([both.start, both.end, startOnly.start, startOnly.end, bare.start, bare.end]).toEqual([".card", ".content", ".a", null, null, null]);
  });

  test("boundaries containing parentheses (functional pseudo-classes) are kept whole", () => {
    const r = sheet("@scope (.card:not(.flat)) to (.content:is(.a, .b)) { img {} }").cssRules[0];
    expect([r.start, r.end]).toEqual([".card:not(.flat)", ".content:is(.a, .b)"]);
  });
});

describe("CSSStartingStyleRule — https://drafts.csswg.org/css-transitions-2/#the-cssstartingstylerule-interface", () => {
  test("is a grouping rule whose rules do not apply (no transitions)", () => {
    document.head!.innerHTML = `<style>@starting-style { .t { color: red } }</style>`;
    document.body!.innerHTML = `<p class="t">x</p>`;
    const r = (document as any).styleSheets[0].cssRules[0];
    expect([r.constructor.name, r.cssRules.length]).toEqual(["CSSStartingStyleRule", 1]);
    expect(color(".t")).not.toBe("red");
  });
});

describe("CSSNestedDeclarations — https://drafts.csswg.org/css-nesting-1/#cssnesteddeclarations", () => {
  test("declarations after a nested rule become a CSSNestedDeclarations child that still applies", () => {
    document.head!.innerHTML = `<style>.t { color: red; & .x { color: blue } background-color: green }</style>`;
    document.body!.innerHTML = `<p class="t">x</p>`;
    const rule = (document as any).styleSheets[0].cssRules[0];
    const nested = rule.cssRules[1];
    expect([nested.constructor.name, nested.style.backgroundColor, nested.parentRule]).toEqual(["CSSNestedDeclarations", "green", rule]);
    expect((window.getComputedStyle(document.querySelector(".t")!) as any).backgroundColor).toBe("green");
  });

  test("only the declarations before the first nested rule belong to the style rule itself (https://drafts.csswg.org/css-syntax-3/#consume-block-contents)", () => {
    const rule = sheet(".t { color: red; & .x { color: blue } width: 1px; height: 2px }").cssRules[0];
    expect([rule.style.cssText, rule.cssRules.length, rule.cssRules[1].style.cssText]).toEqual(["color: red;", 2, "width: 1px; height: 2px;"]);
  });

  test("nested declarations cascade after the nested rule that precedes them (same specificity, later order wins)", () => {
    document.head!.innerHTML = `<style>.t { color: red; & { color: blue } color: green }</style>`;
    document.body!.innerHTML = `<p class="t">x</p>`;
    expect(color(".t")).toBe("green");
  });

  test("declarations after a nested rule inside a nested @media become CSSNestedDeclarations of that @media", () => {
    const rule = sheet(".t { @media screen { color: red; .x { color: blue } width: 1px } }").cssRules[0];
    const media = rule.cssRules[0];
    expect([...media.cssRules].map((r: any) => r.constructor.name)).toEqual(["CSSNestedDeclarations", "CSSStyleRule", "CSSNestedDeclarations"]);
    expect([media.cssRules[0].style.cssText, media.cssRules[2].style.cssText]).toEqual(["color: red;", "width: 1px;"]);
  });
});

describe("CSSImportRule — https://drafts.csswg.org/cssom/#the-cssimportrule-interface", () => {
  test("href, media, layerName, supportsText; styleSheet is null (never fetched)", () => {
    const r = styleElementSheet(`@import url("a.css") layer(base) supports(display: grid) screen;`).cssRules[0];
    expect([r.href, r.media.mediaText, r.layerName, r.supportsText, r.styleSheet]).toEqual(["a.css", "screen", "base", "display: grid", null]);
    expect(r.cssText).toBe(`@import url("a.css") layer(base) supports(display: grid) screen;`);
  });
});

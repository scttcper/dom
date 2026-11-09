/**
 * Style rules whose declaration blocks are parsed on first use (packages/dom/src/css/parser.ts
 * `flatBlockEnd`, cssom.ts `CSSStyleRule[$block]`, cascade.ts `IndexedRule.owner`): what was put
 * off must come out exactly as parsing it at once would have, and a block the character scan
 * cannot be sure of is parsed at once.
 *
 * Specs:
 *   CSS Syntax 3 — consume a qualified rule: https://drafts.csswg.org/css-syntax-3/#consume-qualified-rule
 *   CSS Syntax 3 — consume a block's contents: https://drafts.csswg.org/css-syntax-3/#consume-block-contents
 *   CSS Syntax 3 — consume a string token: https://drafts.csswg.org/css-syntax-3/#consume-string-token
 *   CSS Syntax 3 — consume a url token: https://drafts.csswg.org/css-syntax-3/#consume-url-token
 *   CSS Syntax 3 — consume comments: https://drafts.csswg.org/css-syntax-3/#consume-comment
 *   CSS Nesting — nested style rules: https://drafts.csswg.org/css-nesting-1/#nesting
 *   CSSOM — CSSStyleRule.style: https://drafts.csswg.org/cssom/#dom-cssstylerule-style
 *   CSS Cascade 5 — cascade sorting: https://drafts.csswg.org/css-cascade-5/#cascade-sort
 */
import { beforeEach, describe, expect, test } from "vitest";
import { createWindow, type Document } from "@ctrl/dom";
import { CSSParser, flatBlockEnd, rawDecls, type RawRule } from "../../src/css/parser.ts";
import { $blockText } from "../../src/keys.ts";

// biome-ignore lint: untyped DOM surface in tests
type Any = any;

/** A rule tree with every block parsed, in a shape toEqual can compare. */
function plain(rules: RawRule[]): unknown {
  return rules.map((rule) => ({
    kind: rule.kind,
    name: rule.name,
    prelude: rule.prelude,
    hasBlock: rule.hasBlock,
    decls: rawDecls(rule).map((d) => [d.name, d.value, d.important]),
    leading: rule.leading,
    rules: plain(rule.rules),
  }));
}

function parse(src: string, lazyBlocks: boolean): { rules: RawRule[]; lazy: number } {
  const parser = new CSSParser(src);
  parser.lazyBlocks = lazyBlocks;
  const rules = parser.parseStylesheet();
  let lazy = 0;
  const count = (list: RawRule[]) => {
    for (const rule of list) {
      if (rule.lazy !== null) lazy++;
      count(rule.rules);
    }
  };
  count(rules);
  return { rules, lazy };
}

// Each block is followed by a second rule: where the first one ends decides what the second is.
const AFTER = " .after { color: green }";

/** Blocks that hold only declarations and that the scan reads as the tokenizer does. */
const FLAT = [
  "color: red",
  "",
  "   ",
  "color: red; margin: 0 auto !important; padding: 1px 2px",
  "color : red ;; ; background:blue",
  'content: "}"; color: red',
  "content: '{ } @media'; color: red",
  'content: "a\'b"; quotes: \'"\' "\'"',
  "/* } */ color: red /* { @x */",
  "color: red /**/; /***/ margin: 0",
  "background: url(a.png); color: red",
  "background: url(\"a}b.png\") , url( 'c{d.png' )",
  "background: URL(data:image/png;base64,AAAA=); color: red",
  "width: calc((1px + 2px) * 3); grid-area: [a] / [b]",
  "font: 12px/1.5 'Helvetica Neue', sans-serif",
  "--token: 12px; --other: var(--token, calc(1px + 2px))",
  "color: red !important; color: blue",
  "unknown-property: whatever(1, 2); COLOR: Red",
  "color: red;;;",
  "margin:0;padding:0;border:1px solid #ccc;display:flex",
  "color: rgb(1 2 3 / 50%); transform: translate(1px, 2px) rotate(3deg)",
  "color:red;not a declaration;margin:0",
  "color",
  ": red; margin: 0",
];

/** Blocks the scan must hand to the parser: a nested rule or at-rule, or something it does not read itself. */
const NOT_FLAT = [
  "color: red; &:hover { color: blue }",
  "color: red; .child { margin: 0 } padding: 1px",
  "@media (min-width: 1px) { color: red }",
  "@layer a; color: red",
  "--block: { a: b }; color: red",
  "content: '\\}'; color: red",
  'content: "a\\"}b"; color: red',
  "color: red\\9; margin: 0",
  "background: url(a}b.png); color: red",
  "background: url(a b.png); color: red",
  "background: url(a'b.png); color: red",
  "background: url(a(b.png); color: red",
  "background: url(a\\)b.png); color: red",
  "width: calc(1px } .x { color: red",
  "grid-area: [a } ]; color: red",
  "color: red) ; margin: 0",
  "content: 'unterminated\n; color: red",
  "color: red; /* unterminated",
  "content: 'no end",
];

describe("flatBlockEnd — finding the end of a block that holds only declarations, https://drafts.csswg.org/css-syntax-3/#consume-block-contents", () => {
  test.each(FLAT)("flat: `%s` ends at its closing brace", (block) => {
    const src = `.a {${block}}${AFTER}`;
    expect(flatBlockEnd(src, 4)).toBe(4 + block.length);
  });

  test.each(NOT_FLAT)("not flat: `%s` is left to the parser", (block) => {
    expect(flatBlockEnd(`.a {${block}}${AFTER}`, 4)).toBe(-1);
  });

  test("a block the text ends in is left to the parser", () => {
    expect(flatBlockEnd(".a { color: red", 4)).toBe(-1);
  });
});

describe("a block parsed later is the block parsed at once — https://drafts.csswg.org/css-syntax-3/#consume-qualified-rule", () => {
  test.each([...FLAT, ...NOT_FLAT])("`%s`, then another rule", (block) => {
    const src = `.a {${block}}${AFTER}`;
    expect(plain(parse(src, true).rules)).toEqual(plain(parse(src, false).rules));
  });

  test("the flat blocks were put off and the others were not", () => {
    for (const block of FLAT) expect(parse(`.a {${block}}`, true).lazy, block).toBe(1);
    // A nested rule's own flat block may be put off; the outer block never is.
    for (const block of NOT_FLAT) expect(parse(`.a {${block}}`, true).rules[0]?.lazy ?? null, block).toBeNull();
  });

  test("rules in at-rules, nested rules, comments and stray tokens between rules", () => {
    const src = `
      @charset "utf-8"; <!-- .a{color:red} -->
      /* a { */ .b , .c > .d{margin:0}/* } */.e{}
      @media (min-width: 600px) { .f{color:red} .g{color:blue;&:hover{color:green}} }
      @supports (display: grid) { @layer x { .h{display:grid} } }
      @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      @font-face { font-family: X; src: url(x.woff2) }
      } .stray{color:red}
      .i{content:"}"} .j{background:url(k}l.png)} .m{color:red`;
    const lazy = parse(src, true);
    expect(plain(lazy.rules)).toEqual(plain(parse(src, false).rules));
  });
});

describe("CSSStyleRule — declarations parsed when first asked for, https://drafts.csswg.org/cssom/#dom-cssstylerule-style", () => {
  let document: Document & Any;
  let window: Any;
  const pending = (rule: Any): boolean => rule[$blockText] !== null;
  const sheetOf = (css: string): Any => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    return style.sheet;
  };

  beforeEach(() => {
    window = createWindow();
    document = window.document;
  });

  test("a sheet's rules are listed with their selectors and no block parsed", () => {
    const sheet = sheetOf(".a{color:red;margin:0 auto}.b{}.c{ }.d{padding:1px;&:hover{color:blue}}");
    expect([...sheet.cssRules].map((r: Any) => r.selectorText)).toEqual([".a", ".b", ".c", ".d"]);
    expect([...sheet.cssRules].map(pending)).toEqual([true, true, true, false]);
  });

  test("style, cssText and a change through the CSSOM parse the block they concern, and only that one", () => {
    const sheet = sheetOf(".a{color:red;margin:0 auto}.b{color:blue}.c{padding:1px 2px}");
    const [a, b, c] = sheet.cssRules;
    expect(a.style.getPropertyValue("margin")).toBe("0px auto");
    expect(a.style.length).toBe(5);
    expect(b.cssText).toBe(".b { color: blue; }");
    expect([a, b, c].map(pending)).toEqual([false, false, true]);
    c.style.setProperty("color", "green");
    expect(c.cssText).toBe(".c { padding: 1px 2px; color: green; }");
    expect(sheet.cssRules[2]).toBe(c);
  });

  test("the cascade parses the blocks of the rules an element matches — https://drafts.csswg.org/css-cascade-5/#cascade-sort", () => {
    const sheet = sheetOf(
      ".card{display:flex;color:red}.card.on{color:blue !important}.other{display:grid}#x{margin:1px}p{color:green}",
    );
    document.body.innerHTML = '<div class="card on" id="el"></div>';
    const el = document.getElementById("el");
    const computed = window.getComputedStyle(el);
    expect(computed.display).toBe("flex");
    expect(computed.color).toBe("blue");
    expect([...sheet.cssRules].map(pending)).toEqual([false, false, true, true, true]);
    el.className = "other";
    expect(window.getComputedStyle(el).display).toBe("grid");
    expect([...sheet.cssRules].map(pending)).toEqual([false, false, false, true, true]);
  });

  test("a rule with nothing in its block matches nothing and is never parsed", () => {
    const sheet = sheetOf(".card{}.card{ /* nothing */ }.card{color:red}");
    document.body.innerHTML = '<div class="card"></div>';
    expect(window.getComputedStyle(document.body.firstChild).color).toBe("red");
    expect([...sheet.cssRules].map(pending)).toEqual([true, false, false]);
    expect(sheet.cssRules[1].style.length).toBe(0);
  });

  test("insertRule and replaceSync put a flat block off too, and the cascade sees the rule", () => {
    const sheet = sheetOf(".a{color:red}");
    sheet.insertRule(".a{color:blue;margin:2px}", 1);
    expect(pending(sheet.cssRules[1])).toBe(true);
    document.body.innerHTML = '<div class="a"></div>';
    const computed = window.getComputedStyle(document.body.firstChild);
    expect(computed.color).toBe("blue");
    expect(computed.marginTop).toBe("2px");
    const constructed = new window.CSSStyleSheet();
    constructed.replaceSync(".a{color:green}");
    document.adoptedStyleSheets = [constructed];
    expect(pending(constructed.cssRules[0])).toBe(true);
    expect(window.getComputedStyle(document.body.firstChild).color).toBe("green");
  });

  test("a sheet's cssText round trip is the same whichever way its blocks were parsed", () => {
    const css =
      '.a{color:red;margin:0 auto!important}.b{content:"}";border:1px solid}@media (min-width:1px){.c{padding:1px}}';
    const text = (sheet: Any) => [...sheet.cssRules].map((r: Any) => r.cssText).join("\n");
    const lazy = sheetOf(css);
    const touched = sheetOf(css);
    for (const rule of touched.cssRules) void (rule.style ?? rule.cssRules[0].style).length;
    expect(text(lazy)).toBe(text(touched));
  });
});

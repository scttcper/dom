/**
 * Selector parsing, serialization and specificity.
 *
 * Specs:
 *   CSS Syntax 3 §4 Tokenization — https://drafts.csswg.org/css-syntax-3/#tokenization
 *   CSS Syntax 3 §6 An+B microsyntax — https://drafts.csswg.org/css-syntax-3/#anb-microsyntax
 *   Selectors 4 §17 Grammar — https://drafts.csswg.org/selectors-4/#grammar
 *   Selectors 4 §16 Specificity — https://drafts.csswg.org/selectors-4/#specificity-rules
 *   CSSOM §6.7 Serializing selectors — https://drafts.csswg.org/cssom/#serializing-selectors
 *
 * The WPT cases are extracted from css/selectors/parsing/*.html
 * (https://github.com/web-platform-tests/wpt/tree/master/css/selectors/parsing) into
 * wpt/css-selectors-parsing.json: test_valid_selector → must parse and serialize to the expected
 * form; test_invalid_selector → must fail to parse.
 */
import { describe, expect, test } from "vitest";
import { parseSelectorList, tokenize, TK_IDENT, TK_HASH, TK_STRING, TK_BAD_STRING, TK_DIMENSION, TK_NUMBER, TK_DELIM, SelectorParser, type Simple } from "../../src/selectors/parser.ts";
import { serializeSelectorList, serializeIdentifier, serializeAnPlusB } from "../../src/selectors/serialize.ts";
import { complexSpecificity, unpackSpecificity } from "../../src/selectors/compile.ts";
import cases from "./wpt/css-selectors-parsing.json" with { type: "json" };

interface ParsingCase {
  file: string;
  valid: boolean;
  selector: string;
  serialized?: string | string[];
  forgivingOnly?: boolean;
}

// Intentional skips (each with the reason):
const SKIP_FILES = new Set([
  // Tentative spec (https://github.com/w3c/csswg-drafts/issues/7922); no engine ships :has-slotted.
  "parse-has-slotted.tentative.html",
]);

describe("WPT css/selectors/parsing — https://drafts.csswg.org/selectors-4/#grammar", () => {
  for (const c of cases as ParsingCase[]) {
    if (SKIP_FILES.has(c.file)) continue;
    if (c.valid) {
      test(`${c.file}: ${JSON.stringify(c.selector)} is valid and serializes canonically`, () => {
        const list = parseSelectorList(c.selector);
        expect(list, "should parse").not.toBeNull();
        const s = serializeSelectorList(list!);
        if (Array.isArray(c.serialized)) expect(c.serialized).toContain(s);
        else expect(s).toBe(c.serialized);
        // round-trip
        expect(serializeSelectorList(parseSelectorList(s)!)).toBe(s);
      });
    } else {
      test(`${c.file}: ${JSON.stringify(c.selector)} is invalid`, () => {
        expect(parseSelectorList(c.selector)).toBeNull();
      });
    }
  }
});

describe("tokenizer — https://drafts.csswg.org/css-syntax-3/#consume-token", () => {
  test("escapes: hex escapes consume one trailing whitespace; 0 and surrogates become U+FFFD", () => {
    const [t] = tokenize("\\61 b");
    expect(t.type).toBe(TK_IDENT);
    expect(t.value).toBe("ab");
    expect(tokenize("\\0")[0].value).toBe("\uFFFD");
    expect(tokenize("\\d800")[0].value).toBe("\uFFFD");
    expect(tokenize("\\110000")[0].value).toBe("\uFFFD");
  });

  test("escape at EOF inside an identifier is U+FFFD (https://drafts.csswg.org/css-syntax-3/#consume-escaped-code-point)", () => {
    expect(tokenize("a\\")[0].value).toBe("a\uFFFD");
  });

  test("hash tokens record the 'id' type flag only when followed by an ident start", () => {
    expect(tokenize("#foo")[0]).toMatchObject({ type: TK_HASH, value: "foo", flag: true });
    expect(tokenize("#1a")[0]).toMatchObject({ type: TK_HASH, value: "1a", flag: false });
  });

  test("strings: EOF closes the string; an unescaped newline makes a bad-string", () => {
    expect(tokenize('"abc')[0]).toMatchObject({ type: TK_STRING, value: "abc" });
    expect(tokenize('"a\nb"')[0].type).toBe(TK_BAD_STRING);
    expect(tokenize('"a\\\nb"')[0]).toMatchObject({ type: TK_STRING, value: "ab" });
  });

  test("numbers: sign flag and integer type; dimensions carry their unit", () => {
    expect(tokenize("+5")[0]).toMatchObject({ type: TK_NUMBER, num: 5, isInt: true, flag: true });
    expect(tokenize("2.5")[0]).toMatchObject({ type: TK_NUMBER, isInt: false });
    expect(tokenize("3n-1")[0]).toMatchObject({ type: TK_DIMENSION, num: 3, value: "n-1" });
  });

  test("comments are dropped", () => {
    const types = tokenize("a/* x */.b").map((t) => t.type);
    expect(types).toEqual([TK_IDENT, TK_DELIM, TK_IDENT, 0]);
  });
});

function nth(sel: string): { a: number; b: number } | null {
  const list = parseSelectorList(`:nth-child(${sel})`);
  if (list === null) return null;
  const s: Simple = list.items[0].compounds[0].simples[0];
  return { a: s.a, b: s.b };
}

describe("An+B — https://drafts.csswg.org/css-syntax-3/#anb-microsyntax", () => {
  test.each([
    ["odd", 2, 1],
    ["EVEN", 2, 0],
    ["5", 0, 5],
    ["-5", 0, -5],
    ["n", 1, 0],
    ["-n", -1, 0],
    ["+n", 1, 0],
    ["2n", 2, 0],
    ["2n+1", 2, 1],
    ["2n-1", 2, -1],
    ["2n + 1", 2, 1],
    ["2n- 1", 2, -1],
    ["2n -1", 2, -1],
    ["-n+3", -1, 3],
    ["n-3", 1, -3],
    ["-n-3", -1, -3],
    ["+5", 0, 5],
    ["0n+0", 0, 0],
    [" 3n ", 3, 0],
  ])("%s → a=%i b=%i", (src, a, b) => {
    expect(nth(src)).toEqual({ a, b });
  });

  test.each(["+ n", "2 n", "n 1", "2n + +1", "2n+-1", "1.5n", "2.0", "n- +1", "3n 1", "", "x", "- n"])("%j is invalid", (src) => {
    expect(nth(src)).toBeNull();
  });

  test("A and B are clamped to the 32-bit int range (as engines; WPT css/selectors/nth-child-large-anplusb-clamp.html)", () => {
    const ser = (sel: string) => serializeSelectorList(parseSelectorList(sel)!);
    expect(ser(":nth-child(99999999999999999999)")).toBe(":nth-child(2147483647)");
    expect(ser(":nth-child(99999999999999999999n)")).toBe(":nth-child(2147483647n)");
    expect(ser(":nth-child(2n+99999999999999999999)")).toBe(":nth-child(2n+2147483647)");
  });

  test("serialization: https://drafts.csswg.org/css-syntax-3/#serializing-anb", () => {
    expect(serializeAnPlusB(2, 1)).toBe("2n+1");
    expect(serializeAnPlusB(-1, 3)).toBe("-n+3");
    expect(serializeAnPlusB(1, -2)).toBe("n-2");
    expect(serializeAnPlusB(0, 7)).toBe("7");
  });
});

describe("grammar — https://drafts.csswg.org/selectors-4/#grammar", () => {
  test.each([
    "*", "div", "*|div", "|div", "ns|div", "div.a#b[c][d=e][f~=g i][h|=i s]", "a > b + c ~ d e",
    ":is()", ":where(:foo, div)", ":not(a, b c)", ":has(> a, + b, ~ c, d)", ":nth-child(2n+1 of .a, b)",
    "::before", ":before", "a::after", "::part(x)", "::slotted(span)", ":host", ":host(.a)", ":host-context(main)",
    ":lang(en, \"*-CH\")", ":dir(rtl)", ":state(--x)", "[a=b", ":is(div", ":heading(1, 2)",
  ])("%j parses", (sel) => {
    expect(parseSelectorList(sel)).not.toBeNull();
  });

  test.each([
    "", " ", ",", "a,", ",a", "a,,b", ">a", "a >", "a > > b", "#1", ".1", "..a", "[]", "[a=]", "[a=b c]", "[a=b x]",
    ":not()", ":has()", ":has(:has(a))", ":foo", "::foo", ":nth-child()", ":nth-child(2n of)", ":dir(\"ltr\")",
    "::before.a", "::before > a", ":not(::before)", ":has(::before)", "a || b", "{", "a!", "a:hover()", ":is",
  ])("%j is invalid", (sel) => {
    expect(parseSelectorList(sel)).toBeNull();
  });

  test("the parser reports a reason for failures", () => {
    const p = new SelectorParser(":foo");
    expect(p.parseSelectorList()).toBeNull();
    expect(p.error).toMatch(/unknown pseudo-class/);
  });

  test("forgiving lists keep dropped items' text for serialization (https://drafts.csswg.org/selectors-4/#forgiving-selector)", () => {
    expect(serializeSelectorList(parseSelectorList(":is(:foo,  .a )")!)).toBe(":is(:foo, .a)");
  });
});

describe("serialize an identifier — https://drafts.csswg.org/cssom/#serialize-an-identifier", () => {
  test.each([
    ["foo", "foo"],
    ["1a", "\\31 a"],
    ["-1", "-\\31 "],
    ["-", "\\-"],
    ["a b", "a\\ b"],
    ["a\u0001", "a\\1 "],
    ["中文", "中文"],
  ])("%j → %j", (src, out) => {
    expect(serializeIdentifier(src)).toBe(out);
  });
});

function spec(sel: string): [number, number, number] {
  return unpackSpecificity(complexSpecificity(parseSelectorList(sel)!.items[0]));
}

describe("specificity — https://drafts.csswg.org/selectors-4/#specificity-rules", () => {
  test.each([
    ["*", [0, 0, 0]],
    ["li", [0, 0, 1]],
    ["ul li", [0, 0, 2]],
    ["ul ol+li", [0, 0, 3]],
    ["h1 + *[rel=up]", [0, 1, 1]],
    ["ul ol li.red", [0, 1, 3]],
    ["li.red.level", [0, 2, 1]],
    ["#x34y", [1, 0, 0]],
    ["#s12:not(FOO)", [1, 0, 1]],
    [".foo :is(.bar, #baz)", [1, 1, 0]],
    [":where(#a, .b) p", [0, 0, 1]],
    [":has(> #a, .b)", [1, 0, 0]],
    [":nth-child(2n of .a, #b)", [1, 1, 0]],
    ["li::before", [0, 0, 2]],
    [":root", [0, 1, 0]],
  ] as const)("%s → %j", (sel, expected) => {
    expect(spec(sel)).toEqual(expected);
  });
});

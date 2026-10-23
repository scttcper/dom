/**
 * CSS tokenizer conformance.
 *
 * Spec: CSS Syntax Module Level 3 §4 "Tokenization"
 *   https://drafts.csswg.org/css-syntax-3/#tokenization
 *   https://drafts.csswg.org/css-syntax-3/#consume-token
 *
 * Ported from romainmenke/css-tokenizer-tests (MIT):
 *   https://github.com/romainmenke/css-tokenizer-tests/tree/main/tests
 * The fixture (fixtures/css-tokenizer-tests.json) keeps each case's source and expected tokens.
 * Intentional difference: our tokenizer consumes comments without emitting tokens (as the
 * spec does), so expected "comment" entries are dropped before comparing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  CSSTokenizer,
  TK_AT_KEYWORD, TK_BAD_STRING, TK_BAD_URL, TK_CDC, TK_CDO, TK_COLON, TK_COMMA, TK_DELIM, TK_DIMENSION, TK_EOF,
  TK_FUNCTION, TK_HASH, TK_IDENT, TK_LBRACE, TK_LBRACKET, TK_LPAREN, TK_NUMBER, TK_PERCENTAGE, TK_RBRACE,
  TK_RBRACKET, TK_RPAREN, TK_SEMICOLON, TK_STRING, TK_URL, TK_WHITESPACE,
} from "../../src/css/tokenizer.ts";

type Expected = [type: string, raw: string, start: number, end: number, structured: Record<string, unknown> | null];
const fixture = JSON.parse(readFileSync(new URL("./fixtures/css-tokenizer-tests.json", import.meta.url), "utf8")) as {
  cases: { name: string; source: string; tokens: Expected[] }[];
};

const NAMES: Record<number, string> = {
  [TK_IDENT]: "ident-token", [TK_FUNCTION]: "function-token", [TK_AT_KEYWORD]: "at-keyword-token", [TK_HASH]: "hash-token",
  [TK_STRING]: "string-token", [TK_BAD_STRING]: "bad-string-token", [TK_URL]: "url-token", [TK_BAD_URL]: "bad-url-token",
  [TK_DELIM]: "delim-token", [TK_NUMBER]: "number-token", [TK_PERCENTAGE]: "percentage-token", [TK_DIMENSION]: "dimension-token",
  [TK_WHITESPACE]: "whitespace-token", [TK_CDO]: "CDO-token", [TK_CDC]: "CDC-token", [TK_COLON]: "colon-token",
  [TK_SEMICOLON]: "semicolon-token", [TK_COMMA]: "comma-token", [TK_LBRACKET]: "[-token", [TK_RBRACKET]: "]-token",
  [TK_LPAREN]: "(-token", [TK_RPAREN]: ")-token", [TK_LBRACE]: "{-token", [TK_RBRACE]: "}-token",
};

function structured(t: CSSTokenizer): Record<string, unknown> | null {
  switch (t.type) {
    case TK_IDENT: case TK_FUNCTION: case TK_AT_KEYWORD: case TK_STRING: case TK_URL: case TK_DELIM:
      return { value: t.value };
    case TK_HASH:
      return { value: t.value, type: t.hashId ? "id" : "unrestricted" };
    case TK_NUMBER: case TK_PERCENTAGE:
      return t.sign === "" ? { value: t.num, type: t.isInteger ? "integer" : "number" } : { value: t.num, type: t.isInteger ? "integer" : "number", signCharacter: t.sign };
    case TK_DIMENSION:
      return t.sign === "" ? { value: t.num, type: t.isInteger ? "integer" : "number", unit: t.unit } : { value: t.num, type: t.isInteger ? "integer" : "number", unit: t.unit, signCharacter: t.sign };
  }
  return null;
}

function tokenize(src: string): Expected[] {
  const t = new CSSTokenizer(src);
  const out: Expected[] = [];
  while (t.next() !== TK_EOF) out.push([NAMES[t.type], src.slice(t.start, t.end), t.start, t.end, structured(t)]);
  return out;
}

/** Fixture structured values for percentage tokens have no "type"; normalize both sides. */
function normalize(tokens: Expected[]): Expected[] {
  return tokens
    .filter((t) => t[0] !== "comment")
    .map(([type, raw, s, e, st]) => {
      if (st === null) return [type, raw, s, e, null];
      const copy: Record<string, unknown> = { ...st };
      if (type === "percentage-token") delete copy.type;
      if (typeof copy.value === "number" && Object.is(copy.value, -0)) copy.value = 0;
      return [type, raw, s, e, copy];
    });
}

describe("§4.3.1 consume a token — https://drafts.csswg.org/css-syntax-3/#consume-token (css-tokenizer-tests)", () => {
  for (const c of fixture.cases) {
    test(`${c.name}: produces the expected token stream`, () => {
      expect(normalize(tokenize(c.source))).toEqual(normalize(c.tokens));
    });
  }
});

describe("pull tokenizer bookkeeping", () => {
  test("§4.3.2 consume comments — comments are skipped and counted", () => {
    const t = new CSSTokenizer("a/* x */b");
    expect(t.next()).toBe(TK_IDENT);
    expect(t.next()).toBe(TK_IDENT);
    expect(t.value).toBe("b");
    expect(t.comments).toBe(1);
  });
});

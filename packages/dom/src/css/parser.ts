//
// CSS Syntax Module Level 3 — parsing.
// https://drafts.csswg.org/css-syntax-3/#parsing
//
// Produces a light "raw" rule tree (prelude text, declarations with value text, nested
// rules). The CSSOM layer (src/css/cssom.ts) turns raw rules into CSSRule objects and
// validates declaration values per property. Values and preludes are source slices with
// comments removed and surrounding whitespace trimmed; per-property normalization happens
// later (src/css/values.ts).
//
// Nesting follows https://drafts.csswg.org/css-syntax-3/#consume-block-contents: inside any
// block, declarations and nested rules may be interleaved; an item that fails to parse as a
// declaration is re-parsed as a nested qualified rule.

import {
  CSSTokenizer,
  TK_AT_KEYWORD,
  TK_BAD_STRING,
  TK_BAD_URL,
  TK_CDC,
  TK_CDO,
  TK_COLON,
  TK_DELIM,
  TK_EOF,
  TK_FUNCTION,
  TK_IDENT,
  TK_LBRACE,
  TK_LBRACKET,
  TK_LPAREN,
  TK_RBRACE,
  TK_RBRACKET,
  TK_RPAREN,
  TK_SEMICOLON,
  TK_WHITESPACE,
} from "./tokenizer.ts";

export const RULE_QUALIFIED = 1;
export const RULE_AT = 2;
/**
 * A run of declarations that follows a nested rule inside a block: CSS Syntax's "list of
 * declarations" item of a block's rules (https://drafts.csswg.org/css-syntax-3/#consume-block-contents),
 * which becomes a CSSNestedDeclarations rule (https://drafts.csswg.org/css-nesting-1/#nested-declarations-rule).
 */
export const RULE_DECLS = 3;

export class RawDecl {
  name: string;
  value: string;
  important: boolean;

  constructor(name: string, value: string, important: boolean) {
    this.name = name;
    this.value = value;
    this.important = important;
  }
}

export class RawRule {
  /** RULE_QUALIFIED, RULE_AT or RULE_DECLS. */
  kind: number;
  /** At-rule name without "@" (as written); "" for qualified rules. */
  name: string;
  /** Prelude text, comments removed, trimmed. */
  prelude: string;
  /** Whether the rule ended with a {} block (vs. ";" / EOF). */
  hasBlock: boolean;
  /** Every declaration found directly in the block, in order. */
  decls: RawDecl[];
  /**
   * How many of `decls` precede the first nested rule (the rule's own declarations). The
   * later ones are also listed, grouped, as RULE_DECLS entries of `rules`.
   */
  leading: number;
  /** Rules found directly in the block, with RULE_DECLS runs between and after them. */
  rules: RawRule[];
  /**
   * A qualified rule's block when it holds nothing but declarations, as written and not parsed
   * yet (see `flatBlockEnd`); `decls` is empty until `rawDecls()` parses it. Null otherwise.
   */
  lazy: string | null;

  constructor(kind: number, name: string, prelude: string, hasBlock: boolean) {
    this.kind = kind;
    this.name = name;
    this.prelude = prelude;
    this.hasBlock = hasBlock;
    this.decls = [];
    this.leading = 0;
    this.rules = [];
    this.lazy = null;
  }
}

/** A rule's declarations, parsing its block now if that was put off. */
export function rawDecls(rule: RawRule): RawDecl[] {
  const text = rule.lazy;
  if (text !== null) {
    rule.lazy = null;
    rule.decls = parseDeclarationList(text);
    rule.leading = rule.decls.length;
  }
  return rule.decls;
}

/**
 * Where the block that starts at `from` (just after its "{") ends, when it can only hold
 * declarations: the offset of its "}", or -1 when it needs the parser (a nested rule or at-rule,
 * or anything this scan does not read exactly as the tokenizer would).
 *
 * Most of a style sheet is rules no element of a test ever matches, and most of parsing one was
 * their declarations: tokenizing each value, normalizing it, expanding shorthands and building the
 * block (a 5,000-rule sheet: 10.5 ms, of which the selectors and this scan are a third). Blink
 * defers the same work (its lazy property parsing). Flat blocks are found by characters alone:
 *
 * - strings and comments are skipped; one that does not end before a newline or the end of the
 *   text gives up, as does an unquoted `url(` holding anything a URL token may not;
 * - "{" and "@" give up (a nested rule, an at-rule), wherever they are;
 * - a "}" inside parentheses or brackets gives up: there it is part of a value.
 *
 * Giving up costs nothing but the scan: the tokenizer parses the block as before.
 */
export function flatBlockEnd(src: string, from: number): number {
  const length = src.length;
  let depth = 0;
  for (let i = from; i < length; i++) {
    const c = src.charCodeAt(i);
    switch (c) {
      case 0x7d: // }
        return depth === 0 ? i : -1;
      case 0x7b: // {
      case 0x40: // @
        return -1;
      case 0x28: // (
        // `url(` followed by anything but a quoted string is one URL token.
        if (
          i - from >= 3 &&
          (src.charCodeAt(i - 1) | 0x20) === 0x6c &&
          (src.charCodeAt(i - 2) | 0x20) === 0x72 &&
          (src.charCodeAt(i - 3) | 0x20) === 0x75
        ) {
          let j = i + 1;
          while (j < length && isCssWhitespace(src.charCodeAt(j))) j++;
          const q = src.charCodeAt(j);
          if (q !== 0x22 && q !== 0x27) {
            for (; j < length; j++) {
              const u = src.charCodeAt(j);
              if (u === 0x29) break;
              // Whitespace, quotes, "(", "\\" and braces: escapes and bad URLs are the tokenizer's.
              if (u <= 0x20 || u === 0x22 || u === 0x27 || u === 0x28 || u === 0x5c || u === 0x7b || u === 0x7d)
                return -1;
            }
            if (j === length) return -1;
            i = j;
            break;
          }
        }
        depth++;
        break;
      case 0x5b: // [
        depth++;
        break;
      case 0x29: // )
      case 0x5d: // ]
        if (depth === 0) return -1;
        depth--;
        break;
      case 0x22: // "
      case 0x27: {
        // '
        let j = i + 1;
        for (; j < length; j++) {
          const u = src.charCodeAt(j);
          if (u === c) break;
          // A newline ends a string badly; an escape may hide one.
          if (u === 0x0a || u === 0x0d || u === 0x0c || u === 0x5c) return -1;
        }
        if (j === length) return -1;
        i = j;
        break;
      }
      case 0x2f: // /
        if (src.charCodeAt(i + 1) === 0x2a) {
          const close = src.indexOf("*/", i + 2);
          if (close === -1) return -1;
          i = close + 1;
        }
        break;
      case 0x5c: // \\: an escape, wherever it is
        return -1;
    }
  }
  return -1;
}

function isCssWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x0a || c === 0x09 || c === 0x0d || c === 0x0c;
}

function closerFor(t: number): number {
  if (t === TK_FUNCTION || t === TK_LPAREN) return TK_RPAREN;
  if (t === TK_LBRACKET) return TK_RBRACKET;
  if (t === TK_LBRACE) return TK_RBRACE;
  return TK_EOF;
}

/** Removes comments from a source slice by re-tokenizing it (only called when the range contained comments). */
export function stripComments(text: string): string {
  const t = new CSSTokenizer(text);
  let out = "";
  let prevEnd = 0;
  let type = t.next();
  while (type !== TK_EOF) {
    // Two adjacent tokens that were separated only by a comment keep a separator so they do not merge.
    if (t.start !== prevEnd && out !== "" && t.type !== TK_WHITESPACE && !out.endsWith(" ")) {
      const prevChar = out.charCodeAt(out.length - 1);
      const nextChar = text.charCodeAt(t.start);
      if (needsSeparator(prevChar, nextChar)) out += "/**/";
    }
    out += text.slice(t.start, t.end);
    prevEnd = t.end;
    type = t.next();
  }
  return out.trim();
}

function needsSeparator(a: number, b: number): boolean {
  const aWord =
    (a >= 0x30 && a <= 0x39) ||
    (a >= 0x41 && a <= 0x5a) ||
    (a >= 0x61 && a <= 0x7a) ||
    a === 0x2d ||
    a === 0x5f ||
    a >= 0x80;
  const bWord =
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x5a) ||
    (b >= 0x61 && b <= 0x7a) ||
    b === 0x2d ||
    b === 0x5f ||
    b >= 0x80;
  return aWord && bWord;
}

function isAsciiCaseInsensitive(a: string, lower: string): boolean {
  return a.length === lower.length && a.toLowerCase() === lower;
}

export class CSSParser {
  src: string;
  t: CSSTokenizer;
  /** True when the current token has been pushed back and must be returned by the next `advance()`. */
  peeked: boolean;
  /** Closer stack for skipping nested blocks. */
  stack: number[];
  /** Results of the last consumed declaration value scan. */
  valueStart: number;
  valueEnd: number;
  importantEnd: number;
  important: boolean;
  valueHasBlock: boolean;
  valueOtherCount: number;
  /** Leave a flat block of a qualified rule unparsed (RawRule.lazy); false parses every block now. */
  lazyBlocks: boolean;

  constructor(src: string) {
    this.src = src;
    this.t = new CSSTokenizer(src);
    this.peeked = false;
    this.stack = [];
    this.valueStart = 0;
    this.valueEnd = 0;
    this.importantEnd = 0;
    this.important = false;
    this.valueHasBlock = false;
    this.valueOtherCount = 0;
    this.lazyBlocks = true;
  }

  advance(): number {
    if (this.peeked) {
      this.peeked = false;
      return this.t.type;
    }
    return this.t.next();
  }

  reconsume(): void {
    this.peeked = true;
  }

  /** Returns the next non-whitespace token type (consumed). */
  advanceNonWs(): number {
    let type = this.advance();
    while (type === TK_WHITESPACE) type = this.advance();
    return type;
  }

  /** Source offset of the current token start (the mark used for backtracking). */
  mark(): number {
    return this.t.start;
  }

  restore(pos: number): void {
    this.t.reset(pos);
    this.peeked = false;
  }

  /** Skips the rest of a simple block / function whose opening token was just consumed. */
  skipBlock(opener: number): void {
    const stack = this.stack;
    const base = stack.length;
    stack.push(closerFor(opener));
    while (stack.length > base) {
      const type = this.t.next();
      if (type === TK_EOF) break;
      if (type === stack[stack.length - 1]) {
        stack.pop();
      } else if (type === TK_FUNCTION || type === TK_LPAREN || type === TK_LBRACKET || type === TK_LBRACE) {
        stack.push(closerFor(type));
      }
    }
    stack.length = base;
  }

  /** Slice of the source with comments removed when the range contained any. */
  text(start: number, end: number, commentsBefore: number): string {
    const s = this.src.slice(start, end);
    if (this.t.comments !== commentsBefore && s.indexOf("/*") !== -1) return stripComments(s);
    return s;
  }

  // https://drafts.csswg.org/css-syntax-3/#consume-stylesheet-contents
  parseStylesheet(): RawRule[] {
    const rules: RawRule[] = [];
    while (true) {
      const type = this.advance();
      if (type === TK_EOF) break;
      if (type === TK_WHITESPACE || type === TK_CDO || type === TK_CDC) continue;
      if (type === TK_AT_KEYWORD) {
        const r = this.consumeAtRule(false);
        if (r !== null) rules.push(r);
      } else {
        this.reconsume();
        const r = this.consumeQualifiedRule(false);
        if (r !== null) rules.push(r);
      }
    }
    return rules;
  }

  // https://drafts.csswg.org/css-syntax-3/#consume-at-rule — the at-keyword is the current token.
  consumeAtRule(nested: boolean): RawRule | null {
    const name = this.t.value;
    const commentsBefore = this.t.comments;
    let preludeStart = -1;
    let preludeEnd = -1;
    while (true) {
      const type = this.advance();
      if (type === TK_SEMICOLON || type === TK_EOF) {
        return new RawRule(
          RULE_AT,
          name,
          preludeStart === -1 ? "" : this.text(preludeStart, preludeEnd, commentsBefore),
          false,
        );
      }
      if (type === TK_RBRACE) {
        if (nested) {
          this.reconsume();
          return new RawRule(
            RULE_AT,
            name,
            preludeStart === -1 ? "" : this.text(preludeStart, preludeEnd, commentsBefore),
            false,
          );
        }
        if (preludeStart === -1) preludeStart = this.t.start;
        preludeEnd = this.t.end;
        continue;
      }
      if (type === TK_LBRACE) {
        const rule = new RawRule(
          RULE_AT,
          name,
          preludeStart === -1 ? "" : this.text(preludeStart, preludeEnd, commentsBefore),
          true,
        );
        this.consumeBlockContents(rule);
        return rule;
      }
      if (type === TK_WHITESPACE) continue;
      if (preludeStart === -1) preludeStart = this.t.start;
      if (type === TK_FUNCTION || type === TK_LPAREN || type === TK_LBRACKET) this.skipBlock(type);
      preludeEnd = this.t.end;
    }
  }

  // https://drafts.csswg.org/css-syntax-3/#consume-qualified-rule — the first prelude token is next.
  consumeQualifiedRule(nested: boolean): RawRule | null {
    const commentsBefore = this.t.comments;
    let preludeStart = -1;
    let preludeEnd = -1;
    while (true) {
      const type = this.advance();
      if (type === TK_EOF) return null;
      if (type === TK_RBRACE) {
        if (nested) {
          this.reconsume();
          return null;
        }
        if (preludeStart === -1) preludeStart = this.t.start;
        preludeEnd = this.t.end;
        continue;
      }
      if (type === TK_SEMICOLON && nested) return null;
      if (type === TK_LBRACE) {
        const prelude = preludeStart === -1 ? "" : this.text(preludeStart, preludeEnd, commentsBefore);
        if (prelude.charCodeAt(0) === 0x2d && prelude.charCodeAt(1) === 0x2d) {
          // "--foo: {...}" looks like a custom property, not a rule.
          const colon = prelude.indexOf(":");
          if (colon !== -1) {
            this.skipBlock(TK_LBRACE);
            return null;
          }
        }
        const rule = new RawRule(RULE_QUALIFIED, "", prelude, true);
        const blockStart = this.t.end;
        const blockEnd = this.lazyBlocks ? flatBlockEnd(this.src, blockStart) : -1;
        if (blockEnd === -1) this.consumeBlockContents(rule);
        else {
          rule.lazy = this.src.slice(blockStart, blockEnd);
          this.restore(blockEnd + 1);
        }
        return rule;
      }
      if (type === TK_WHITESPACE) continue;
      if (preludeStart === -1) preludeStart = this.t.start;
      if (type === TK_FUNCTION || type === TK_LPAREN || type === TK_LBRACKET) this.skipBlock(type);
      preludeEnd = this.t.end;
    }
  }

  // https://drafts.csswg.org/css-syntax-3/#consume-block-contents — the "{" was consumed (or
  // we are at the start of a declaration list); stops after the matching "}" or at EOF.
  consumeBlockContents(rule: RawRule): void {
    while (true) {
      const type = this.advance();
      if (type === TK_EOF || type === TK_RBRACE) return;
      if (type === TK_WHITESPACE || type === TK_SEMICOLON) continue;
      if (type === TK_AT_KEYWORD) {
        const r = this.consumeAtRule(true);
        if (r !== null) rule.rules.push(r);
        continue;
      }
      const markPos = this.mark();
      if (type === TK_IDENT) {
        const d = this.consumeDeclaration();
        if (d !== null) {
          rule.decls.push(d);
          // Declarations after a nested rule start a new list of declarations in rules
          // (https://drafts.csswg.org/css-syntax-3/#consume-block-contents, "decls" handling).
          const n = rule.rules.length;
          if (n === 0) rule.leading = rule.decls.length;
          else {
            let run = rule.rules[n - 1];
            if (run.kind !== RULE_DECLS) {
              run = new RawRule(RULE_DECLS, "", "", false);
              rule.rules.push(run);
            }
            run.decls.push(d);
            run.leading = run.decls.length;
          }
          continue;
        }
        this.restore(markPos);
      } else {
        this.reconsume();
      }
      const r = this.consumeQualifiedRule(true);
      if (r !== null) rule.rules.push(r);
    }
  }

  /**
   * https://drafts.csswg.org/css-syntax-3/#consume-declaration — the name ident is the
   * current token. Returns null (without consuming the remnants) when this is not a valid
   * declaration; the caller restores and re-parses it as a nested rule.
   */
  consumeDeclaration(): RawDecl | null {
    const name = this.t.value;
    if (this.advanceNonWs() !== TK_COLON) return null;
    const commentsBefore = this.t.comments;
    this.scanValue();
    if (this.valueStart === -1) {
      // Empty value: valid only for custom properties.
      if (name.charCodeAt(0) === 0x2d && name.charCodeAt(1) === 0x2d) return new RawDecl(name, "", this.important);
      return new RawDecl(name, "", false);
    }
    const end = this.important ? this.importantEnd : this.valueEnd;
    const value = end <= this.valueStart ? "" : this.text(this.valueStart, end, commentsBefore).trim();
    const custom = name.charCodeAt(0) === 0x2d && name.charCodeAt(1) === 0x2d;
    if (!custom && this.valueHasBlock && this.valueOtherCount > 0) return null;
    return new RawDecl(name, value, this.important);
  }

  /**
   * Consumes a declaration value up to (and including) ";" or up to (not including) "}" /
   * EOF, recording the value range and whether it ends with "!important".
   */
  scanValue(): void {
    this.valueStart = -1;
    this.valueEnd = -1;
    this.importantEnd = -1;
    this.important = false;
    this.valueHasBlock = false;
    this.valueOtherCount = 0;
    // Last two significant top-level tokens: 1 = "!", 2 = "important", 0 = other.
    let k1 = 0;
    let k2 = 0;
    let e3 = -1; // end of the significant token before those two
    let e2 = -1;
    let e1 = -1;
    while (true) {
      const type = this.advance();
      if (type === TK_EOF) break;
      if (type === TK_SEMICOLON) break;
      if (type === TK_RBRACE) {
        this.reconsume();
        break;
      }
      if (type === TK_WHITESPACE) continue;
      if (this.valueStart === -1) this.valueStart = this.t.start;
      let kind = 0;
      if (type === TK_DELIM && this.t.value === "!") kind = 1;
      else if (type === TK_IDENT && isAsciiCaseInsensitive(this.t.value, "important")) kind = 2;
      if (type === TK_LBRACE) this.valueHasBlock = true;
      else this.valueOtherCount++;
      if (type === TK_FUNCTION || type === TK_LPAREN || type === TK_LBRACKET || type === TK_LBRACE)
        this.skipBlock(type);
      e3 = e2;
      e2 = e1;
      e1 = this.t.end;
      k2 = k1;
      k1 = kind;
    }
    this.valueEnd = e1;
    if (k1 === 2 && k2 === 1) {
      this.important = true;
      this.importantEnd = e3 === -1 ? this.valueStart : e3;
      if (this.valueHasBlock) this.valueOtherCount -= 2;
    }
  }
}

/** https://drafts.csswg.org/css-syntax-3/#parse-stylesheet */
export function parseStylesheet(src: string): RawRule[] {
  return new CSSParser(src).parseStylesheet();
}

/**
 * https://drafts.csswg.org/css-syntax-3/#parse-rule — returns null on a syntax error
 * (nothing, or more than one rule).
 */
export function parseRule(src: string): RawRule | null {
  const p = new CSSParser(src);
  let type = p.advanceNonWs();
  if (type === TK_EOF) return null;
  let rule: RawRule | null = null;
  if (type === TK_AT_KEYWORD) {
    rule = p.consumeAtRule(false);
  } else {
    p.reconsume();
    rule = p.consumeQualifiedRule(false);
  }
  if (rule === null) return null;
  type = p.advanceNonWs();
  if (type !== TK_EOF) return null;
  return rule;
}

/**
 * https://drafts.csswg.org/css-syntax-3/#parse-block-contents keeping only declarations —
 * what the `style` attribute and `cssText` setters use.
 */
export function parseDeclarationList(src: string): RawDecl[] {
  const p = new CSSParser(src);
  const holder = new RawRule(RULE_QUALIFIED, "", "", true);
  p.consumeBlockContents(holder);
  // A stray "}" ends consumeBlockContents early; keep parsing what follows.
  while (p.t.type !== TK_EOF) {
    const more = new RawRule(RULE_QUALIFIED, "", "", true);
    p.consumeBlockContents(more);
    for (let i = 0; i < more.decls.length; i++) holder.decls.push(more.decls[i]);
  }
  return holder.decls;
}

/** True if a value contains bad-string / bad-url tokens or unbalanced closers (never valid). */
export function hasInvalidTokens(value: string): boolean {
  const t = new CSSTokenizer(value);
  let depth = 0;
  while (true) {
    const type = t.next();
    if (type === TK_EOF) return false;
    if (type === TK_BAD_STRING || type === TK_BAD_URL) return true;
    if (type === TK_FUNCTION || type === TK_LPAREN || type === TK_LBRACKET || type === TK_LBRACE) depth++;
    else if (type === TK_RPAREN || type === TK_RBRACKET || type === TK_RBRACE) {
      if (depth === 0) return true;
      depth--;
    }
  }
}

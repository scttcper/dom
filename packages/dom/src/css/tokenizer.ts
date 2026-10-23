// @scriptc-compatible
//
// CSS Syntax Module Level 3 — tokenization.
// https://drafts.csswg.org/css-syntax-3/#tokenization
//
// A pull tokenizer: `next()` consumes one token and exposes it through fields (`type`,
// `start`, `end`, `value`, `num`, `isInteger`, `unit`, `hashId`) instead of allocating a
// token object, so parsers can stream over a stylesheet without per-token garbage.
// Input preprocessing (https://drafts.csswg.org/css-syntax-3/#input-preprocessing) is done
// lazily: CR, CRLF and FF count as one newline wherever newlines matter, and U+0000 /
// surrogates are replaced with U+FFFD only in decoded token values.

export const TK_EOF = 0;
export const TK_IDENT = 1;
export const TK_FUNCTION = 2;
export const TK_AT_KEYWORD = 3;
export const TK_HASH = 4;
export const TK_STRING = 5;
export const TK_BAD_STRING = 6;
export const TK_URL = 7;
export const TK_BAD_URL = 8;
export const TK_DELIM = 9;
export const TK_NUMBER = 10;
export const TK_PERCENTAGE = 11;
export const TK_DIMENSION = 12;
export const TK_WHITESPACE = 13;
export const TK_CDO = 14;
export const TK_CDC = 15;
export const TK_COLON = 16;
export const TK_SEMICOLON = 17;
export const TK_COMMA = 18;
export const TK_LBRACKET = 19;
export const TK_RBRACKET = 20;
export const TK_LPAREN = 21;
export const TK_RPAREN = 22;
export const TK_LBRACE = 23;
export const TK_RBRACE = 24;

const REPLACEMENT = "�";

function isNewline(c: number): boolean {
  return c === 0x0a || c === 0x0d || c === 0x0c;
}

function isWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c;
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

function isHexDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

function hexValue(c: number): number {
  if (c <= 0x39) return c - 0x30;
  if (c <= 0x46) return c - 0x41 + 10;
  return c - 0x61 + 10;
}

/** https://drafts.csswg.org/css-syntax-3/#non-ascii-ident-code-point (UTF-16 code units; surrogates = astral planes). */
function isNonAsciiIdent(c: number): boolean {
  if (c < 0xb7) return false;
  return (
    c === 0xb7 ||
    (c >= 0xc0 && c <= 0xd6) ||
    (c >= 0xd8 && c <= 0xf6) ||
    (c >= 0xf8 && c <= 0x37d) ||
    (c >= 0x37f && c <= 0x1fff) ||
    c === 0x200c ||
    c === 0x200d ||
    c === 0x203f ||
    c === 0x2040 ||
    (c >= 0x2070 && c <= 0x218f) ||
    (c >= 0x2c00 && c <= 0x2fef) ||
    (c >= 0x3001 && c <= 0xd7ff) ||
    (c >= 0xd800 && c <= 0xdfff) ||
    (c >= 0xf900 && c <= 0xfdcf) ||
    (c >= 0xfdf0 && c <= 0xfffd)
  );
}

/** https://drafts.csswg.org/css-syntax-3/#ident-start-code-point */
export function isIdentStart(c: number): boolean {
  return (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a) || c === 0x5f || isNonAsciiIdent(c);
}

/** https://drafts.csswg.org/css-syntax-3/#ident-code-point */
export function isIdentChar(c: number): boolean {
  return isIdentStart(c) || isDigit(c) || c === 0x2d;
}

function isNonPrintable(c: number): boolean {
  return (c >= 0 && c <= 0x08) || c === 0x0b || (c >= 0x0e && c <= 0x1f) || c === 0x7f;
}

export class CSSTokenizer {
  src: string;
  len: number;
  pos: number;
  /** Current token type (TK_*). */
  type: number;
  /** Source offsets of the current token. */
  start: number;
  end: number;
  /**
   * Decoded value: ident/function/at-keyword/hash name, string/url contents, delim
   * character, or the unit for dimensions. "" for other tokens.
   */
  value: string;
  /** Numeric value of number/percentage/dimension tokens. */
  num: number;
  /** Number token type flag: true for "integer", false for "number". */
  isInteger: boolean;
  /** Dimension unit (decoded, original case). */
  unit: string;
  /** Hash token type flag: true for "id". */
  hashId: boolean;
  /** Number token sign character ("+", "-" or ""). */
  sign: string;
  /** Number of comments skipped so far (lets callers detect comments inside a range). */
  comments: number;

  constructor(src: string) {
    this.src = src;
    this.len = src.length;
    this.pos = 0;
    this.type = TK_EOF;
    this.start = 0;
    this.end = 0;
    this.value = "";
    this.num = 0;
    this.isInteger = true;
    this.unit = "";
    this.hashId = false;
    this.sign = "";
    this.comments = 0;
  }

  /** Restarts tokenization at `pos` (used for backtracking by the parser). */
  reset(pos: number): void {
    this.pos = pos;
  }

  code(i: number): number {
    return i < this.len ? this.src.charCodeAt(i) : -1;
  }

  /** https://drafts.csswg.org/css-syntax-3/#starts-with-a-valid-escape */
  validEscape(i: number): boolean {
    return this.code(i) === 0x5c && !isNewline(this.code(i + 1));
  }

  /** https://drafts.csswg.org/css-syntax-3/#would-start-an-identifier */
  startsIdent(i: number): boolean {
    const c = this.code(i);
    if (c === 0x2d) {
      const c1 = this.code(i + 1);
      return isIdentStart(c1) || c1 === 0x2d || this.validEscape(i + 1);
    }
    if (isIdentStart(c)) return true;
    return this.validEscape(i);
  }

  /** https://drafts.csswg.org/css-syntax-3/#starts-with-a-number */
  startsNumber(i: number): boolean {
    const c = this.code(i);
    if (c === 0x2b || c === 0x2d) {
      const c1 = this.code(i + 1);
      if (isDigit(c1)) return true;
      return c1 === 0x2e && isDigit(this.code(i + 2));
    }
    if (c === 0x2e) return isDigit(this.code(i + 1));
    return isDigit(c);
  }

  /**
   * https://drafts.csswg.org/css-syntax-3/#consume-escaped-code-point — `this.pos` is just
   * past the backslash. Returns the decoded code point as a string.
   */
  consumeEscape(): string {
    const c = this.code(this.pos);
    if (c === -1) return REPLACEMENT;
    if (isHexDigit(c)) {
      let v = 0;
      let n = 0;
      while (n < 6 && isHexDigit(this.code(this.pos))) {
        v = v * 16 + hexValue(this.code(this.pos));
        this.pos++;
        n++;
      }
      const w = this.code(this.pos);
      if (w === 0x0d && this.code(this.pos + 1) === 0x0a) this.pos += 2;
      else if (isWhitespace(w)) this.pos++;
      if (v === 0 || (v >= 0xd800 && v <= 0xdfff) || v > 0x10ffff) return REPLACEMENT;
      return String.fromCodePoint(v);
    }
    this.pos++;
    if (c === 0) return REPLACEMENT;
    if (c >= 0xd800 && c <= 0xdbff) {
      const lo = this.code(this.pos);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        this.pos++;
        return this.src.slice(this.pos - 2, this.pos);
      }
    }
    return this.src.slice(this.pos - 1, this.pos);
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-name */
  consumeName(): string {
    const start = this.pos;
    // Fast path: plain ASCII/non-ASCII name without escapes or NULs.
    while (this.pos < this.len) {
      const c = this.src.charCodeAt(this.pos);
      if (isIdentChar(c) && c !== 0) this.pos++;
      else break;
    }
    if (!this.validEscape(this.pos) && this.code(this.pos) !== 0) return this.src.slice(start, this.pos);
    let out = this.src.slice(start, this.pos);
    while (this.pos < this.len) {
      const c = this.src.charCodeAt(this.pos);
      if (c === 0) {
        out += REPLACEMENT;
        this.pos++;
      } else if (isIdentChar(c)) {
        out += this.src.slice(this.pos, this.pos + 1);
        this.pos++;
      } else if (this.validEscape(this.pos)) {
        this.pos++;
        out += this.consumeEscape();
      } else break;
    }
    return out;
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-number */
  consumeNumber(): void {
    const start = this.pos;
    let integer = true;
    let c = this.code(this.pos);
    this.sign = "";
    if (c === 0x2b || c === 0x2d) {
      this.sign = c === 0x2b ? "+" : "-";
      this.pos++;
    }
    while (isDigit(this.code(this.pos))) this.pos++;
    if (this.code(this.pos) === 0x2e && isDigit(this.code(this.pos + 1))) {
      this.pos += 2;
      integer = false;
      while (isDigit(this.code(this.pos))) this.pos++;
    }
    c = this.code(this.pos);
    if (c === 0x45 || c === 0x65) {
      const c1 = this.code(this.pos + 1);
      if (isDigit(c1)) {
        this.pos += 2;
        integer = false;
        while (isDigit(this.code(this.pos))) this.pos++;
      } else if ((c1 === 0x2b || c1 === 0x2d) && isDigit(this.code(this.pos + 2))) {
        this.pos += 3;
        integer = false;
        while (isDigit(this.code(this.pos))) this.pos++;
      }
    }
    this.num = Number(this.src.slice(start, this.pos));
    this.isInteger = integer;
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-numeric-token */
  consumeNumeric(): number {
    this.consumeNumber();
    if (this.startsIdent(this.pos)) {
      this.unit = this.consumeName();
      this.value = this.unit;
      return TK_DIMENSION;
    }
    if (this.code(this.pos) === 0x25) {
      this.pos++;
      return TK_PERCENTAGE;
    }
    return TK_NUMBER;
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-string-token — `this.pos` is past the opening quote. */
  consumeString(quote: number): number {
    const start = this.pos;
    while (this.pos < this.len) {
      const c = this.src.charCodeAt(this.pos);
      if (c === quote) {
        this.value = this.src.slice(start, this.pos);
        this.pos++;
        return TK_STRING;
      }
      if (c === 0x5c || c === 0 || isNewline(c)) break;
      this.pos++;
    }
    let out = this.src.slice(start, this.pos);
    while (true) {
      if (this.pos >= this.len) {
        this.value = out;
        return TK_STRING;
      }
      const c = this.src.charCodeAt(this.pos);
      if (c === quote) {
        this.pos++;
        this.value = out;
        return TK_STRING;
      }
      if (isNewline(c)) {
        // Parse error: reconsume the newline.
        this.value = out;
        return TK_BAD_STRING;
      }
      if (c === 0x5c) {
        const n = this.code(this.pos + 1);
        if (n === -1) {
          this.pos++;
        } else if (isNewline(n)) {
          this.pos += n === 0x0d && this.code(this.pos + 2) === 0x0a ? 3 : 2;
        } else {
          this.pos++;
          out += this.consumeEscape();
        }
      } else if (c === 0) {
        out += REPLACEMENT;
        this.pos++;
      } else {
        out += this.src.slice(this.pos, this.pos + 1);
        this.pos++;
      }
    }
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-remnants-of-bad-url */
  consumeBadUrl(): number {
    while (this.pos < this.len) {
      const c = this.src.charCodeAt(this.pos);
      if (c === 0x29) {
        this.pos++;
        break;
      }
      if (this.validEscape(this.pos)) {
        this.pos++;
        this.consumeEscape();
      } else this.pos++;
    }
    this.value = "";
    return TK_BAD_URL;
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-url-token — `this.pos` is past "url(". */
  consumeUrl(): number {
    while (isWhitespace(this.code(this.pos))) this.pos++;
    let out = "";
    while (true) {
      if (this.pos >= this.len) {
        this.value = out;
        return TK_URL;
      }
      const c = this.src.charCodeAt(this.pos);
      if (c === 0x29) {
        this.pos++;
        this.value = out;
        return TK_URL;
      }
      if (isWhitespace(c)) {
        while (isWhitespace(this.code(this.pos))) this.pos++;
        const n = this.code(this.pos);
        if (n === 0x29) {
          this.pos++;
          this.value = out;
          return TK_URL;
        }
        if (n === -1) {
          this.value = out;
          return TK_URL;
        }
        return this.consumeBadUrl();
      }
      if (c === 0x22 || c === 0x27 || c === 0x28 || isNonPrintable(c)) {
        this.pos++;
        return this.consumeBadUrl();
      }
      if (c === 0x5c) {
        if (this.validEscape(this.pos)) {
          this.pos++;
          out += this.consumeEscape();
        } else {
          return this.consumeBadUrl();
        }
      } else if (c === 0) {
        out += REPLACEMENT;
        this.pos++;
      } else {
        out += this.src.slice(this.pos, this.pos + 1);
        this.pos++;
      }
    }
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-ident-like-token */
  consumeIdentLike(): number {
    const name = this.consumeName();
    this.value = name;
    if (this.code(this.pos) === 0x28) {
      this.pos++;
      if (name.length === 3 && asciiLower3(name) === "url") {
        // Look past whitespace for a quote: url("x") is a function token.
        let p = this.pos;
        while (isWhitespace(this.code(p)) && isWhitespace(this.code(p + 1))) p++;
        const q = this.code(p);
        const q2 = isWhitespace(q) ? this.code(p + 1) : q;
        // The skipped whitespace is left for a following whitespace token (no observable difference).
        if (q2 === 0x22 || q2 === 0x27) return TK_FUNCTION;
        return this.consumeUrl();
      }
      return TK_FUNCTION;
    }
    return TK_IDENT;
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-comments */
  skipComments(): void {
    while (this.code(this.pos) === 0x2f && this.code(this.pos + 1) === 0x2a) {
      const close = this.src.indexOf("*/", this.pos + 2);
      this.pos = close === -1 ? this.len : close + 2;
      this.comments++;
    }
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-token — returns the token type. */
  next(): number {
    this.skipComments();
    this.start = this.pos;
    this.value = "";
    const t = this.consumeToken();
    this.type = t;
    this.end = this.pos;
    return t;
  }

  consumeToken(): number {
    if (this.pos >= this.len) return TK_EOF;
    const c = this.src.charCodeAt(this.pos);
    if (isWhitespace(c)) {
      this.pos++;
      while (isWhitespace(this.code(this.pos))) this.pos++;
      return TK_WHITESPACE;
    }
    switch (c) {
      case 0x22:
      case 0x27:
        this.pos++;
        return this.consumeString(c);
      case 0x23: {
        const c1 = this.code(this.pos + 1);
        if (isIdentChar(c1) || this.validEscape(this.pos + 1)) {
          this.pos++;
          this.hashId = this.startsIdent(this.pos);
          this.value = this.consumeName();
          return TK_HASH;
        }
        return this.delim();
      }
      case 0x28:
        this.pos++;
        return TK_LPAREN;
      case 0x29:
        this.pos++;
        return TK_RPAREN;
      case 0x2b:
        if (this.startsNumber(this.pos)) return this.consumeNumeric();
        return this.delim();
      case 0x2c:
        this.pos++;
        return TK_COMMA;
      case 0x2d:
        if (this.startsNumber(this.pos)) return this.consumeNumeric();
        if (this.code(this.pos + 1) === 0x2d && this.code(this.pos + 2) === 0x3e) {
          this.pos += 3;
          return TK_CDC;
        }
        if (this.startsIdent(this.pos)) return this.consumeIdentLike();
        return this.delim();
      case 0x2e:
        if (this.startsNumber(this.pos)) return this.consumeNumeric();
        return this.delim();
      case 0x3a:
        this.pos++;
        return TK_COLON;
      case 0x3b:
        this.pos++;
        return TK_SEMICOLON;
      case 0x3c:
        if (this.code(this.pos + 1) === 0x21 && this.code(this.pos + 2) === 0x2d && this.code(this.pos + 3) === 0x2d) {
          this.pos += 4;
          return TK_CDO;
        }
        return this.delim();
      case 0x40:
        if (this.startsIdent(this.pos + 1)) {
          this.pos++;
          this.value = this.consumeName();
          return TK_AT_KEYWORD;
        }
        return this.delim();
      case 0x5b:
        this.pos++;
        return TK_LBRACKET;
      case 0x5c:
        if (this.validEscape(this.pos)) return this.consumeIdentLike();
        return this.delim();
      case 0x5d:
        this.pos++;
        return TK_RBRACKET;
      case 0x7b:
        this.pos++;
        return TK_LBRACE;
      case 0x7d:
        this.pos++;
        return TK_RBRACE;
    }
    if (isDigit(c)) return this.consumeNumeric();
    if (isIdentStart(c) || c === 0) return this.consumeIdentLike();
    return this.delim();
  }

  delim(): number {
    const c = this.src.charCodeAt(this.pos);
    if (c >= 0xd800 && c <= 0xdbff) {
      const lo = this.code(this.pos + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        this.value = this.src.slice(this.pos, this.pos + 2);
        this.pos += 2;
        return TK_DELIM;
      }
    }
    this.value = this.src.slice(this.pos, this.pos + 1);
    this.pos++;
    return TK_DELIM;
  }
}

function asciiLower3(s: string): string {
  return s.toLowerCase();
}

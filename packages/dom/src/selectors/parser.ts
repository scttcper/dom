// @scriptc-compatible
//
// Selector parser: CSS Syntax 3 tokenization + Selectors 4 grammar → compact AST.
//
// https://drafts.csswg.org/css-syntax-3/#tokenization
// https://drafts.csswg.org/selectors-4/#grammar
// https://drafts.csswg.org/cssom/#parse-a-selector
//
// This module is pure (no DOM access) and written in scriptc's compiled subset: classes with
// fields initialized in constructors, integer constants instead of enums, plain loops, no
// closures/regexes. Errors are reported through `SelectorParser.error` (the caller turns them
// into SyntaxError DOMExceptions); the parser never throws.
//
// Namespace prefixes are recorded verbatim (`Simple.nsPrefix`) and resolved by the compiler,
// since querySelector has no namespace map while style sheets may (@namespace).

// --- tokens ------------------------------------------------------------------------------
// https://drafts.csswg.org/css-syntax-3/#tokenizer-definitions

export const TK_EOF = 0;
export const TK_IDENT = 1;
export const TK_FUNCTION = 2;
export const TK_AT = 3;
export const TK_HASH = 4;
export const TK_STRING = 5;
export const TK_BAD_STRING = 6;
export const TK_URL = 7;
export const TK_BAD_URL = 8;
export const TK_DELIM = 9;
export const TK_NUMBER = 10;
export const TK_PERCENTAGE = 11;
export const TK_DIMENSION = 12;
export const TK_WS = 13;
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

export class Token {
  type: number;
  /** Ident/function/at/hash name, string value, delim char, dimension unit. */
  value: string;
  /** Numeric value for number/percentage/dimension. */
  num: number;
  /** Number is an integer (type flag "integer"). */
  isInt: boolean;
  /** Number representation started with "+" or "-". Hash: type flag "id". */
  flag: boolean;
  /** Start offset in the source. */
  start: number;

  constructor(type: number, value: string, start: number) {
    this.type = type;
    this.value = value;
    this.num = 0;
    this.isInt = false;
    this.flag = false;
    this.start = start;
  }
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

/** https://drafts.csswg.org/css-syntax-3/#ident-start-code-point */
function isIdentStart(c: number): boolean {
  // U+0000 is preprocessed to U+FFFD (https://drafts.csswg.org/css-syntax-3/#input-preprocessing), a non-ASCII ident code point.
  return (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a) || c === 0x5f || c >= 0x80 || c === 0;
}

/** https://drafts.csswg.org/css-syntax-3/#ident-code-point */
function isIdentChar(c: number): boolean {
  return isIdentStart(c) || isDigit(c) || c === 0x2d;
}

function isNewline(c: number): boolean {
  return c === 0x0a || c === 0x0d || c === 0x0c;
}

function isWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x09 || isNewline(c);
}

function isNonPrintable(c: number): boolean {
  return (c >= 0 && c <= 0x08) || c === 0x0b || (c >= 0x0e && c <= 0x1f) || c === 0x7f;
}

/**
 * CSS tokenizer over a selector string.
 * https://drafts.csswg.org/css-syntax-3/#consume-token
 *
 * Input preprocessing (https://drafts.csswg.org/css-syntax-3/#input-preprocessing) is done
 * lazily: CR/FF/CRLF are treated as newlines and U+0000 becomes U+FFFD when consumed.
 */
export class Tokenizer {
  src: string;
  pos: number;
  len: number;

  constructor(src: string) {
    this.src = src;
    this.pos = 0;
    this.len = src.length;
  }

  code(i: number): number {
    if (i >= this.len) return -1;
    return this.src.charCodeAt(i);
  }

  /** https://drafts.csswg.org/css-syntax-3/#starts-with-a-valid-escape */
  validEscape(i: number): boolean {
    if (this.code(i) !== 0x5c) return false;
    // EOF after "\" is a valid escape (it consumes to U+FFFD).
    return !isNewline(this.code(i + 1));
  }

  /** https://drafts.csswg.org/css-syntax-3/#would-start-an-identifier */
  startsIdent(i: number): boolean {
    const c = this.code(i);
    if (c === 0x2d) {
      const n = this.code(i + 1);
      return isIdentStart(n) || n === 0x2d || this.validEscape(i + 1);
    }
    if (isIdentStart(c)) return true;
    return this.validEscape(i);
  }

  /** https://drafts.csswg.org/css-syntax-3/#starts-with-a-number */
  startsNumber(i: number): boolean {
    const c = this.code(i);
    if (c === 0x2b || c === 0x2d) {
      const n = this.code(i + 1);
      if (isDigit(n)) return true;
      return n === 0x2e && isDigit(this.code(i + 2));
    }
    if (c === 0x2e) return isDigit(this.code(i + 1));
    return isDigit(c);
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-escaped-code-point (pos is after "\"). */
  consumeEscape(): string {
    const c = this.code(this.pos);
    if (c === -1) return "\uFFFD";
    if (isHexDigit(c)) {
      let v = 0;
      let count = 0;
      while (count < 6 && isHexDigit(this.code(this.pos))) {
        v = v * 16 + hexValue(this.code(this.pos));
        this.pos++;
        count++;
      }
      const w = this.code(this.pos);
      if (w === 0x0d && this.code(this.pos + 1) === 0x0a) this.pos += 2;
      else if (isWhitespace(w)) this.pos++;
      if (v === 0 || (v >= 0xd800 && v <= 0xdfff) || v > 0x10ffff) return "\uFFFD";
      return String.fromCodePoint(v);
    }
    this.pos++;
    if (c === 0) return "\uFFFD";
    if (c >= 0xd800 && c <= 0xdbff) {
      const lo = this.code(this.pos);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        this.pos++;
        return this.src.slice(this.pos - 2, this.pos);
      }
    }
    return String.fromCharCode(c);
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-name */
  consumeName(): string {
    let out = "";
    const start = this.pos;
    let runStart = start;
    while (true) {
      const c = this.code(this.pos);
      if (c !== -1 && c !== 0 && isIdentChar(c)) {
        this.pos++;
      } else if (this.validEscape(this.pos)) {
        out += this.src.slice(runStart, this.pos);
        this.pos++;
        out += this.consumeEscape();
        runStart = this.pos;
      } else if (c === 0) {
        out += this.src.slice(runStart, this.pos) + "\uFFFD";
        this.pos++;
        runStart = this.pos;
      } else {
        break;
      }
    }
    if (runStart === start) return this.src.slice(start, this.pos);
    return out + this.src.slice(runStart, this.pos);
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-number */
  consumeNumber(tok: Token): void {
    const start = this.pos;
    let isInt = true;
    let c = this.code(this.pos);
    if (c === 0x2b || c === 0x2d) {
      tok.flag = true;
      this.pos++;
    }
    while (isDigit(this.code(this.pos))) this.pos++;
    if (this.code(this.pos) === 0x2e && isDigit(this.code(this.pos + 1))) {
      isInt = false;
      this.pos += 2;
      while (isDigit(this.code(this.pos))) this.pos++;
    }
    c = this.code(this.pos);
    if (c === 0x45 || c === 0x65) {
      const n = this.code(this.pos + 1);
      if (isDigit(n)) {
        isInt = false;
        this.pos += 2;
        while (isDigit(this.code(this.pos))) this.pos++;
      } else if ((n === 0x2b || n === 0x2d) && isDigit(this.code(this.pos + 2))) {
        isInt = false;
        this.pos += 3;
        while (isDigit(this.code(this.pos))) this.pos++;
      }
    }
    tok.num = Number(this.src.slice(start, this.pos));
    tok.isInt = isInt;
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-string-token (pos is after the quote). */
  consumeString(quote: number, start: number): Token {
    let out = "";
    let runStart = this.pos;
    while (true) {
      const c = this.code(this.pos);
      if (c === quote || c === -1) {
        out += this.src.slice(runStart, this.pos);
        if (c !== -1) this.pos++;
        return new Token(TK_STRING, out, start);
      }
      if (isNewline(c)) {
        return new Token(TK_BAD_STRING, "", start);
      }
      if (c === 0x5c) {
        out += this.src.slice(runStart, this.pos);
        const n = this.code(this.pos + 1);
        if (n === -1) {
          this.pos++;
        } else if (isNewline(n)) {
          this.pos += n === 0x0d && this.code(this.pos + 2) === 0x0a ? 3 : 2;
        } else {
          this.pos++;
          out += this.consumeEscape();
        }
        runStart = this.pos;
      } else if (c === 0) {
        out += this.src.slice(runStart, this.pos) + "\uFFFD";
        this.pos++;
        runStart = this.pos;
      } else {
        this.pos++;
      }
    }
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-remnants-of-bad-url */
  consumeBadUrl(start: number): Token {
    while (true) {
      const c = this.code(this.pos);
      if (c === -1) break;
      if (c === 0x29) {
        this.pos++;
        break;
      }
      if (this.validEscape(this.pos)) {
        this.pos++;
        this.consumeEscape();
      } else {
        this.pos++;
      }
    }
    return new Token(TK_BAD_URL, "", start);
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-url-token */
  consumeUrl(start: number): Token {
    while (isWhitespace(this.code(this.pos))) this.pos++;
    let out = "";
    while (true) {
      const c = this.code(this.pos);
      if (c === 0x29 || c === -1) {
        if (c !== -1) this.pos++;
        return new Token(TK_URL, out, start);
      }
      if (isWhitespace(c)) {
        while (isWhitespace(this.code(this.pos))) this.pos++;
        const e = this.code(this.pos);
        if (e === 0x29 || e === -1) {
          if (e !== -1) this.pos++;
          return new Token(TK_URL, out, start);
        }
        return this.consumeBadUrl(start);
      }
      if (c === 0x22 || c === 0x27 || c === 0x28 || isNonPrintable(c)) {
        return this.consumeBadUrl(start);
      }
      if (c === 0x5c) {
        if (this.validEscape(this.pos)) {
          this.pos++;
          out += this.consumeEscape();
        } else {
          return this.consumeBadUrl(start);
        }
      } else {
        out += c === 0 ? "\uFFFD" : this.src[this.pos];
        this.pos++;
      }
    }
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-ident-like-token */
  consumeIdentLike(start: number): Token {
    const name = this.consumeName();
    if (this.code(this.pos) === 0x28) {
      this.pos++;
      if (name.length === 3 && asciiLower(name) === "url") {
        let p = this.pos;
        while (isWhitespace(this.code(p)) && isWhitespace(this.code(p + 1))) p++;
        const q = this.code(p);
        const q2 = isWhitespace(q) ? this.code(p + 1) : q;
        if (q2 === 0x22 || q2 === 0x27) {
          this.pos = p;
          return new Token(TK_FUNCTION, name, start);
        }
        return this.consumeUrl(start);
      }
      return new Token(TK_FUNCTION, name, start);
    }
    return new Token(TK_IDENT, name, start);
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-numeric-token */
  consumeNumeric(start: number): Token {
    const tok = new Token(TK_NUMBER, "", start);
    this.consumeNumber(tok);
    if (this.startsIdent(this.pos)) {
      tok.type = TK_DIMENSION;
      tok.value = this.consumeName();
    } else if (this.code(this.pos) === 0x25) {
      this.pos++;
      tok.type = TK_PERCENTAGE;
    }
    return tok;
  }

  /** https://drafts.csswg.org/css-syntax-3/#consume-token (comments are skipped). */
  next(): Token {
    // https://drafts.csswg.org/css-syntax-3/#consume-comments
    while (this.code(this.pos) === 0x2f && this.code(this.pos + 1) === 0x2a) {
      const end = this.src.indexOf("*/", this.pos + 2);
      this.pos = end === -1 ? this.len : end + 2;
    }
    const start = this.pos;
    const c = this.code(this.pos);
    if (c === -1) return new Token(TK_EOF, "", start);
    if (isWhitespace(c)) {
      this.pos++;
      while (isWhitespace(this.code(this.pos))) this.pos++;
      return new Token(TK_WS, " ", start);
    }
    switch (c) {
      case 0x22:
      case 0x27:
        this.pos++;
        return this.consumeString(c, start);
      case 0x23: {
        const n = this.code(this.pos + 1);
        if ((n !== -1 && isIdentChar(n)) || n === 0 || this.validEscape(this.pos + 1)) {
          this.pos++;
          const tok = new Token(TK_HASH, "", start);
          tok.flag = this.startsIdent(this.pos);
          tok.value = this.consumeName();
          return tok;
        }
        this.pos++;
        return new Token(TK_DELIM, "#", start);
      }
      case 0x28:
        this.pos++;
        return new Token(TK_LPAREN, "(", start);
      case 0x29:
        this.pos++;
        return new Token(TK_RPAREN, ")", start);
      case 0x2b:
        if (this.startsNumber(this.pos)) return this.consumeNumeric(start);
        this.pos++;
        return new Token(TK_DELIM, "+", start);
      case 0x2c:
        this.pos++;
        return new Token(TK_COMMA, ",", start);
      case 0x2d:
        if (this.startsNumber(this.pos)) return this.consumeNumeric(start);
        if (this.code(this.pos + 1) === 0x2d && this.code(this.pos + 2) === 0x3e) {
          this.pos += 3;
          return new Token(TK_CDC, "-->", start);
        }
        if (this.startsIdent(this.pos)) return this.consumeIdentLike(start);
        this.pos++;
        return new Token(TK_DELIM, "-", start);
      case 0x2e:
        if (this.startsNumber(this.pos)) return this.consumeNumeric(start);
        this.pos++;
        return new Token(TK_DELIM, ".", start);
      case 0x3a:
        this.pos++;
        return new Token(TK_COLON, ":", start);
      case 0x3b:
        this.pos++;
        return new Token(TK_SEMICOLON, ";", start);
      case 0x3c:
        if (this.code(this.pos + 1) === 0x21 && this.code(this.pos + 2) === 0x2d && this.code(this.pos + 3) === 0x2d) {
          this.pos += 4;
          return new Token(TK_CDO, "<!--", start);
        }
        this.pos++;
        return new Token(TK_DELIM, "<", start);
      case 0x40:
        if (this.startsIdent(this.pos + 1)) {
          this.pos++;
          return new Token(TK_AT, this.consumeName(), start);
        }
        this.pos++;
        return new Token(TK_DELIM, "@", start);
      case 0x5b:
        this.pos++;
        return new Token(TK_LBRACKET, "[", start);
      case 0x5c:
        if (this.validEscape(this.pos)) return this.consumeIdentLike(start);
        this.pos++;
        return new Token(TK_DELIM, "\\", start);
      case 0x5d:
        this.pos++;
        return new Token(TK_RBRACKET, "]", start);
      case 0x7b:
        this.pos++;
        return new Token(TK_LBRACE, "{", start);
      case 0x7d:
        this.pos++;
        return new Token(TK_RBRACE, "}", start);
    }
    if (isDigit(c)) return this.consumeNumeric(start);
    if (isIdentStart(c) || c === 0) return this.consumeIdentLike(start);
    this.pos++;
    if (c >= 0xd800 && c <= 0xdbff) {
      const lo = this.code(this.pos);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        this.pos++;
        return new Token(TK_DELIM, this.src.slice(this.pos - 2, this.pos), start);
      }
    }
    return new Token(TK_DELIM, this.src[start], start);
  }
}

/** Tokenize a whole string (comments dropped). The last token is always TK_EOF. */
export function tokenize(src: string): Token[] {
  const t = new Tokenizer(src);
  const out: Token[] = [];
  while (true) {
    const tok = t.next();
    out.push(tok);
    if (tok.type === TK_EOF) break;
  }
  return out;
}

export function asciiLower(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) return s.toLowerCase();
  }
  return s;
}

// --- AST ---------------------------------------------------------------------------------

/** Simple selector kinds. */
export const S_TYPE = 1;
export const S_UNIVERSAL = 2;
export const S_ID = 3;
export const S_CLASS = 4;
export const S_ATTR = 5;
export const S_PSEUDO_CLASS = 6;
export const S_PSEUDO_ELEMENT = 7;

/** Namespace component of a type/universal/attribute selector. */
export const NS_UNSPECIFIED = 0; // `E`, `[a]`: default namespace (selectors) / no namespace (attributes)
export const NS_ANY = 1; // `*|E`
export const NS_NONE = 2; // `|E`
export const NS_PREFIX = 3; // `p|E` (prefix in nsPrefix, resolved by the compiler)

/** Attribute matchers. https://drafts.csswg.org/selectors-4/#attribute-selectors */
export const OP_EXISTS = 0;
export const OP_EQUALS = 1; // =
export const OP_INCLUDES = 2; // ~=
export const OP_DASH = 3; // |=
export const OP_PREFIX = 4; // ^=
export const OP_SUFFIX = 5; // $=
export const OP_SUBSTRING = 6; // *=

/** Attribute case flag. */
export const CASE_DEFAULT = 0;
export const CASE_INSENSITIVE = 1; // i
export const CASE_SENSITIVE = 2; // s

/** Combinators. */
export const C_NONE = 0;
export const C_DESCENDANT = 1;
export const C_CHILD = 2;
export const C_NEXT_SIBLING = 3;
export const C_SUBSEQUENT_SIBLING = 4;

// Pseudo-class ids. Keep in sync with `pseudoClassId`.
export const P_UNKNOWN = 0;
// logical / structural with selector arguments
export const P_IS = 1;
export const P_WHERE = 2;
export const P_NOT = 3;
export const P_HAS = 4;
export const P_NTH_CHILD = 5;
export const P_NTH_LAST_CHILD = 6;
export const P_NTH_OF_TYPE = 7;
export const P_NTH_LAST_OF_TYPE = 8;
export const P_HOST_FN = 9;
export const P_HOST_CONTEXT = 10;
export const P_LANG = 11;
export const P_DIR = 12;
export const P_STATE = 13;
// non-functional structural
export const P_FIRST_CHILD = 20;
export const P_LAST_CHILD = 21;
export const P_ONLY_CHILD = 22;
export const P_FIRST_OF_TYPE = 23;
export const P_LAST_OF_TYPE = 24;
export const P_ONLY_OF_TYPE = 25;
export const P_EMPTY = 26;
export const P_ROOT = 27;
export const P_SCOPE = 28;
export const P_HOST = 29;
// location / element state
export const P_LINK = 30;
export const P_ANY_LINK = 31;
export const P_VISITED = 32;
export const P_LOCAL_LINK = 33;
export const P_TARGET = 34;
export const P_TARGET_WITHIN = 35;
export const P_DEFINED = 36;
export const P_HOVER = 37;
export const P_ACTIVE = 38;
export const P_FOCUS = 39;
export const P_FOCUS_WITHIN = 40;
export const P_FOCUS_VISIBLE = 41;
// forms
export const P_CHECKED = 50;
export const P_INDETERMINATE = 51;
export const P_DEFAULT = 52;
export const P_DISABLED = 53;
export const P_ENABLED = 54;
export const P_REQUIRED = 55;
export const P_OPTIONAL = 56;
export const P_READ_ONLY = 57;
export const P_READ_WRITE = 58;
export const P_PLACEHOLDER_SHOWN = 59;
export const P_VALID = 60;
export const P_INVALID = 61;
export const P_IN_RANGE = 62;
export const P_OUT_OF_RANGE = 63;
export const P_USER_VALID = 64;
export const P_USER_INVALID = 65;
export const P_AUTOFILL = 66;
export const P_BLANK = 67;
// misc element state
export const P_OPEN = 70;
export const P_CLOSED = 71;
export const P_POPOVER_OPEN = 72;
export const P_MODAL = 73;
export const P_FULLSCREEN = 74;
export const P_PICTURE_IN_PICTURE = 75;
export const P_PLAYING = 76;
export const P_PAUSED = 77;
export const P_MUTED = 78;
export const P_SEEKING = 79;
export const P_BUFFERING = 80;
export const P_STALLED = 81;
export const P_VOLUME_LOCKED = 82;
export const P_CURRENT = 83;
export const P_PAST = 84;
export const P_FUTURE = 85;
export const P_HAS_SLOTTED = 86;
export const P_TARGET_CURRENT = 87;
export const P_HEADING = 88;

// Pseudo-element ids.
export const PE_OTHER = 1; // known, argument-less (::before, ::marker, ...)
export const PE_SLOTTED = 2;
export const PE_PART = 3;
export const PE_FUNCTION = 4; // other functional pseudo-elements (::highlight(), ::picker(), ...)

/**
 * One simple selector (or pseudo-element). A single class for every kind keeps the AST
 * monomorphic for both V8 and scriptc.
 */
export class Simple {
  kind: number;
  /** Type/attribute local name (case preserved), id, class name, or lowercased pseudo name. */
  name: string;
  nsKind: number;
  nsPrefix: string;
  /** Attribute matcher (OP_*). */
  op: number;
  /** Attribute value. */
  value: string;
  /** Attribute case flag (CASE_*). */
  caseFlag: number;
  /** Pseudo-class id (P_*) or pseudo-element id (PE_*). */
  pseudo: number;
  /** An+B. */
  a: number;
  b: number;
  /** Selector argument (:is/:where/:not/:has/:nth-*(of S)/:host()/::slotted()); null when absent. */
  list: SelectorList | null;
  /** Identifier/string arguments (:lang, :dir, :state, ::part, ::highlight). */
  args: string[];

  constructor(kind: number, name: string) {
    this.kind = kind;
    this.name = name;
    this.nsKind = NS_UNSPECIFIED;
    this.nsPrefix = "";
    this.op = OP_EXISTS;
    this.value = "";
    this.caseFlag = CASE_DEFAULT;
    this.pseudo = 0;
    this.a = 0;
    this.b = 0;
    this.list = null;
    this.args = [];
  }
}

/** https://drafts.csswg.org/selectors-4/#compound */
export class Compound {
  /** Type selector first (if any), then subclass selectors, then pseudo-elements and the pseudo-classes following them, in source order. */
  simples: Simple[];
  /** Index of the first pseudo-element in `simples`, or -1. */
  pseudoElementIndex: number;

  constructor() {
    this.simples = [];
    this.pseudoElementIndex = -1;
  }
}

/** https://drafts.csswg.org/selectors-4/#complex (and relative selectors for :has). */
export class Complex {
  compounds: Compound[];
  /** combinators[i] joins compounds[i] and compounds[i + 1]. */
  combinators: number[];
  /** Leading combinator of a relative selector (C_NONE when absent). */
  leading: number;
  /** Source text (trimmed) of this complex selector. */
  text: string;
  /**
   * An item of a forgiving selector list (:is/:where) that failed to parse. It matches nothing
   * but keeps its source text for serialization (https://drafts.csswg.org/selectors-4/#forgiving-selector).
   */
  invalid: boolean;

  constructor() {
    this.compounds = [];
    this.combinators = [];
    this.leading = C_NONE;
    this.text = "";
    this.invalid = false;
  }
}

export class SelectorList {
  items: Complex[];
  constructor() {
    this.items = [];
  }
}

// --- parser ------------------------------------------------------------------------------

/** Context flags threaded through nested selector lists. */
const IN_HAS = 1; // inside :has() — nested :has is invalid
const NO_PSEUDO_ELEMENTS = 2; // inside :is/:where/:not/:has/:nth-*(of)
const COMPOUND_ONLY = 4; // :host(), :host-context(), ::slotted(): a single compound
const AFTER_PSEUDO_ELEMENT = 8; // :is()/:where() after a pseudo-element: only pseudo-classes

/**
 * Pseudo-classes allowed after a pseudo-element: anything non-structural after ::part()
 * (https://drafts.csswg.org/css-shadow-parts/#part), nothing after ::slotted(), and the
 * user-action pseudo-classes after other pseudo-elements (https://drafts.csswg.org/selectors-4/#pseudo-element-states).
 */
function allowedAfterPseudoElement(pe: number, p: number): boolean {
  if (pe === PE_PART) return !isStructural(p);
  if (pe === PE_SLOTTED) return false;
  return p === P_HOVER || p === P_ACTIVE || p === P_FOCUS || p === P_FOCUS_VISIBLE || p === P_FOCUS_WITHIN || p === P_IS || p === P_WHERE || p === P_NOT;
}

/** Non-functional pseudo-class name (lowercased) → id, or P_UNKNOWN. */
export function pseudoClassId(name: string): number {
  switch (name) {
    case "first-child": return P_FIRST_CHILD;
    case "last-child": return P_LAST_CHILD;
    case "only-child": return P_ONLY_CHILD;
    case "first-of-type": return P_FIRST_OF_TYPE;
    case "last-of-type": return P_LAST_OF_TYPE;
    case "only-of-type": return P_ONLY_OF_TYPE;
    case "empty": return P_EMPTY;
    case "root": return P_ROOT;
    case "scope": return P_SCOPE;
    case "host": return P_HOST;
    case "link": return P_LINK;
    case "any-link": return P_ANY_LINK;
    case "visited": return P_VISITED;
    case "target": return P_TARGET;
    case "target-within": return P_TARGET_WITHIN;
    case "defined": return P_DEFINED;
    case "hover": return P_HOVER;
    case "active": return P_ACTIVE;
    case "focus": return P_FOCUS;
    case "focus-within": return P_FOCUS_WITHIN;
    case "focus-visible": return P_FOCUS_VISIBLE;
    case "checked": return P_CHECKED;
    case "indeterminate": return P_INDETERMINATE;
    case "default": return P_DEFAULT;
    case "disabled": return P_DISABLED;
    case "enabled": return P_ENABLED;
    case "required": return P_REQUIRED;
    case "optional": return P_OPTIONAL;
    case "read-only": return P_READ_ONLY;
    case "read-write": return P_READ_WRITE;
    case "placeholder-shown": return P_PLACEHOLDER_SHOWN;
    case "valid": return P_VALID;
    case "invalid": return P_INVALID;
    case "in-range": return P_IN_RANGE;
    case "out-of-range": return P_OUT_OF_RANGE;
    case "user-valid": return P_USER_VALID;
    case "user-invalid": return P_USER_INVALID;
    case "autofill": return P_AUTOFILL;
    case "-webkit-autofill": return P_AUTOFILL;
    case "open": return P_OPEN;
    case "popover-open": return P_POPOVER_OPEN;
    case "modal": return P_MODAL;
    case "fullscreen": return P_FULLSCREEN;
    case "picture-in-picture": return P_PICTURE_IN_PICTURE;
    case "playing": return P_PLAYING;
    case "paused": return P_PAUSED;
    case "muted": return P_MUTED;
    case "seeking": return P_SEEKING;
    case "buffering": return P_BUFFERING;
    case "stalled": return P_STALLED;
    case "volume-locked": return P_VOLUME_LOCKED;
    case "current": return P_CURRENT;
    case "past": return P_PAST;
    case "future": return P_FUTURE;
    case "has-slotted": return P_HAS_SLOTTED;
    case "target-current": return P_TARGET_CURRENT;
    case "heading": return P_HEADING;
  }
  return P_UNKNOWN;
}

/** Functional pseudo-class name (lowercased) → id, or P_UNKNOWN. */
export function functionalPseudoClassId(name: string): number {
  switch (name) {
    case "is": return P_IS;
    case "matches": return P_IS;
    case "-webkit-any": return P_IS;
    case "where": return P_WHERE;
    case "not": return P_NOT;
    case "has": return P_HAS;
    case "nth-child": return P_NTH_CHILD;
    case "nth-last-child": return P_NTH_LAST_CHILD;
    case "nth-of-type": return P_NTH_OF_TYPE;
    case "nth-last-of-type": return P_NTH_LAST_OF_TYPE;
    case "host": return P_HOST_FN;
    case "host-context": return P_HOST_CONTEXT;
    case "lang": return P_LANG;
    case "dir": return P_DIR;
    case "state": return P_STATE;
    case "current": return P_CURRENT;
    case "heading": return P_HEADING;
  }
  return P_UNKNOWN;
}

/** Tree-structural pseudo-classes (not allowed after ::part()). */
function isStructural(p: number): boolean {
  return (p >= P_FIRST_CHILD && p <= P_ONLY_OF_TYPE) || p === P_EMPTY || p === P_ROOT || p === P_HAS || (p >= P_NTH_CHILD && p <= P_NTH_LAST_OF_TYPE);
}

/** Argument-less pseudo-element name (lowercased) → known? */
function isKnownPseudoElement(name: string): boolean {
  switch (name) {
    case "before":
    case "after":
    case "first-line":
    case "first-letter":
    case "marker":
    case "placeholder":
    case "selection":
    case "backdrop":
    case "file-selector-button":
    case "target-text":
    case "spelling-error":
    case "grammar-error":
    case "cue":
    case "cue-region":
    case "details-content":
    case "checkmark":
    case "picker-icon":
    case "scroll-marker":
    case "scroll-marker-group":
    case "column":
    case "view-transition":
      return true;
  }
  // Vendor pseudo-elements engines expose (::-webkit-scrollbar, ::-moz-selection, ...).
  return name.startsWith("-webkit-") || name.startsWith("-moz-");
}

function isKnownFunctionalPseudoElement(name: string): number {
  switch (name) {
    case "slotted": return PE_SLOTTED;
    case "part": return PE_PART;
    case "highlight":
    case "picker":
    case "scroll-button":
    case "cue":
    case "cue-region":
    case "view-transition-group":
    case "view-transition-image-pair":
    case "view-transition-old":
    case "view-transition-new":
      return PE_FUNCTION;
  }
  return 0;
}

function isLegacyPseudoElement(name: string): boolean {
  return name === "before" || name === "after" || name === "first-line" || name === "first-letter";
}

/**
 * Recursive-descent parser over the token array.
 * https://drafts.csswg.org/selectors-4/#parse-selector
 */
export class SelectorParser {
  src: string;
  toks: Token[];
  i: number;
  /** Set when parsing failed; a human-readable reason (for debugging; DOM messages use the selector text). */
  error: string;

  constructor(src: string) {
    this.src = src;
    this.toks = tokenize(src);
    this.i = 0;
    this.error = "";
  }

  fail(reason: string): void {
    if (this.error === "") this.error = reason;
  }

  peek(): Token {
    return this.toks[this.i];
  }

  peekType(): number {
    return this.toks[this.i].type;
  }

  isDelim(ch: string): boolean {
    const t = this.toks[this.i];
    return t.type === TK_DELIM && t.value === ch;
  }

  isDelimAt(i: number, ch: string): boolean {
    const t = this.toks[i];
    return t.type === TK_DELIM && t.value === ch;
  }

  skipWs(): void {
    while (this.toks[this.i].type === TK_WS) this.i++;
  }

  /** Accept a closing token, or EOF (blocks are implicitly closed at EOF per css-syntax). */
  expectClose(type: number): boolean {
    const t = this.toks[this.i].type;
    if (t === type) {
      this.i++;
      return true;
    }
    if (t === TK_EOF) return true;
    this.fail("expected closing bracket");
    return false;
  }

  /** <selector-list> at top level (querySelector / style rules). */
  parseSelectorList(): SelectorList | null {
    const list = this.parseComplexList(0, false);
    if (list === null) return null;
    if (this.peekType() !== TK_EOF) {
      this.fail("unexpected token");
      return null;
    }
    return list;
  }

  /** <relative-selector-list> at top level (e.g. for @scope/nesting consumers). */
  parseRelativeSelectorList(): SelectorList | null {
    const list = this.parseComplexList(IN_HAS | NO_PSEUDO_ELEMENTS, true);
    if (list === null) return null;
    if (this.peekType() !== TK_EOF) {
      this.fail("unexpected token");
      return null;
    }
    return list;
  }

  /** Comma-separated complex (or relative) selectors; stops before `)` or EOF. Unforgiving. */
  parseComplexList(ctx: number, relative: boolean): SelectorList | null {
    const list = new SelectorList();
    while (true) {
      this.skipWs();
      const c = this.parseComplex(ctx, relative);
      if (c === null) return null;
      list.items.push(c);
      this.skipWs();
      if (this.peekType() === TK_COMMA) {
        this.i++;
        continue;
      }
      break;
    }
    return list;
  }

  /**
   * Forgiving selector list (:is/:where): invalid items are dropped.
   * https://drafts.csswg.org/selectors-4/#forgiving-selector
   */
  parseForgivingList(ctx: number): SelectorList {
    const list = new SelectorList();
    while (true) {
      this.skipWs();
      const t = this.peekType();
      if (t === TK_RPAREN || t === TK_EOF) {
        if (list.items.length !== 0) {
          // trailing empty item after a comma: `:is(a,)`
          const bad = new Complex();
          bad.invalid = true;
          list.items.push(bad);
        }
        break;
      }
      const start = this.i;
      const savedError = this.error;
      const c = this.parseComplex(ctx, false);
      this.skipWs();
      const after = this.peekType();
      if (c !== null && (after === TK_COMMA || after === TK_RPAREN || after === TK_EOF)) {
        list.items.push(c);
      } else {
        this.error = savedError;
        this.i = start;
        if (!this.skipToTopLevelCommaOrClose()) {
          // A dropped item whose blocks are still open at EOF invalidates the whole selector (as engines do).
          this.fail("unterminated block in forgiving selector list");
          return list;
        }
        const bad = new Complex();
        bad.invalid = true;
        bad.text = trimWs(this.src.slice(this.toks[start].start, this.peek().start));
        list.items.push(bad);
      }
      if (this.peekType() === TK_COMMA) {
        this.i++;
        continue;
      }
      break;
    }
    return list;
  }

  /** Skip a component value sequence up to (not including) a top-level `,` or `)`. */
  skipToTopLevelCommaOrClose(): boolean {
    // Stack of the closing token types of the open blocks (https://drafts.csswg.org/css-syntax-3/#consume-simple-block).
    const open: number[] = [];
    while (true) {
      const t = this.peekType();
      if (t === TK_EOF) return open.length === 0;
      if (open.length === 0 && (t === TK_COMMA || t === TK_RPAREN)) return true;
      if (t === TK_FUNCTION || t === TK_LPAREN) open.push(TK_RPAREN);
      else if (t === TK_LBRACKET) open.push(TK_RBRACKET);
      else if (t === TK_LBRACE) open.push(TK_RBRACE);
      else if (open.length !== 0 && t === open[open.length - 1]) open.pop();
      this.i++;
    }
  }

  /** Reads a combinator at the current position (after optional whitespace); C_NONE if none. Returns C_DESCENDANT for bare whitespace. */
  parseCombinator(): number {
    let sawWs = false;
    while (this.peekType() === TK_WS) {
      this.i++;
      sawWs = true;
    }
    const t = this.peek();
    if (t.type === TK_DELIM) {
      if (t.value === ">") {
        this.i++;
        this.skipWs();
        return C_CHILD;
      }
      if (t.value === "+") {
        this.i++;
        this.skipWs();
        return C_NEXT_SIBLING;
      }
      if (t.value === "~") {
        this.i++;
        this.skipWs();
        return C_SUBSEQUENT_SIBLING;
      }
    }
    return sawWs ? C_DESCENDANT : C_NONE;
  }

  /** https://drafts.csswg.org/selectors-4/#typedef-complex-selector (and relative-selector). */
  parseComplex(ctx: number, relative: boolean): Complex | null {
    const cx = new Complex();
    const startTok = this.peek().start;
    if (relative) {
      const lead = this.parseCombinator();
      cx.leading = lead === C_NONE ? C_DESCENDANT : lead;
    }
    while (true) {
      const compound = this.parseCompound(ctx);
      if (compound === null) return null;
      cx.compounds.push(compound);
      const save = this.i;
      const comb = this.parseCombinator();
      const t = this.peekType();
      if (comb === C_NONE || t === TK_COMMA || t === TK_RPAREN || t === TK_EOF) {
        if (comb !== C_NONE && comb !== C_DESCENDANT) {
          this.fail("dangling combinator");
          return null;
        }
        this.i = save;
        break;
      }
      if (compound.pseudoElementIndex !== -1) {
        // Nothing may follow a pseudo-element across a combinator.
        this.fail("combinator after pseudo-element");
        return null;
      }
      if ((ctx & (COMPOUND_ONLY | AFTER_PSEUDO_ELEMENT)) !== 0) {
        this.fail("expected a compound selector");
        return null;
      }
      cx.combinators.push(comb);
    }
    const endTok = this.peek().start;
    cx.text = trimWs(this.src.slice(startTok, endTok));
    return cx;
  }

  /** <ns-prefix>? (ident | '*'): returns false if no type selector is present. */
  parseTypeSelector(compound: Compound): boolean {
    const t = this.peek();
    let nsKind = NS_UNSPECIFIED;
    let prefix = "";
    if (t.type === TK_DELIM && t.value === "|") {
      // `|E` / `|*`
      const n = this.toks[this.i + 1];
      if (n.type === TK_IDENT || (n.type === TK_DELIM && n.value === "*")) {
        nsKind = NS_NONE;
        this.i++;
      } else {
        return false;
      }
    } else if ((t.type === TK_IDENT || (t.type === TK_DELIM && t.value === "*")) && this.isDelimAt(this.i + 1, "|")) {
      const n = this.toks[this.i + 2];
      if (n.type === TK_IDENT || (n.type === TK_DELIM && n.value === "*")) {
        if (t.type === TK_IDENT) {
          nsKind = NS_PREFIX;
          prefix = t.value;
        } else {
          nsKind = NS_ANY;
        }
        this.i += 2;
      }
    }
    const nt = this.peek();
    if (nt.type === TK_IDENT) {
      const s = new Simple(S_TYPE, nt.value);
      s.nsKind = nsKind;
      s.nsPrefix = prefix;
      compound.simples.push(s);
      this.i++;
      return true;
    }
    if (nt.type === TK_DELIM && nt.value === "*") {
      const s = new Simple(S_UNIVERSAL, "*");
      s.nsKind = nsKind;
      s.nsPrefix = prefix;
      compound.simples.push(s);
      this.i++;
      return true;
    }
    if (nsKind !== NS_UNSPECIFIED) this.fail("expected a type selector after namespace prefix");
    return false;
  }

  /** https://drafts.csswg.org/selectors-4/#typedef-compound-selector */
  parseCompound(ctx: number): Compound | null {
    const compound = new Compound();
    const onlyPseudo = (ctx & AFTER_PSEUDO_ELEMENT) !== 0;
    if (!onlyPseudo) this.parseTypeSelector(compound);
    if (this.error !== "") return null;
    while (true) {
      const t = this.peek();
      const afterPe = compound.pseudoElementIndex !== -1;
      if (onlyPseudo && t.type !== TK_COLON) break;
      if (t.type === TK_HASH) {
        if (afterPe) break;
        if (!t.flag) {
          this.fail("invalid id selector");
          return null;
        }
        compound.simples.push(new Simple(S_ID, t.value));
        this.i++;
      } else if (t.type === TK_DELIM && t.value === ".") {
        if (afterPe) break;
        const n = this.toks[this.i + 1];
        if (n.type !== TK_IDENT) {
          this.fail("invalid class selector");
          return null;
        }
        compound.simples.push(new Simple(S_CLASS, n.value));
        this.i += 2;
      } else if (t.type === TK_LBRACKET) {
        if (afterPe) break;
        this.i++;
        const s = this.parseAttribute();
        if (s === null) return null;
        compound.simples.push(s);
      } else if (t.type === TK_COLON) {
        const n = this.toks[this.i + 1];
        if (n.type === TK_COLON) {
          this.i += 2;
          if ((ctx & NO_PSEUDO_ELEMENTS) !== 0) {
            this.fail("pseudo-element not allowed here");
            return null;
          }
          const pe = this.parsePseudoElement(ctx);
          if (pe === null) return null;
          if (compound.pseudoElementIndex === -1) compound.pseudoElementIndex = compound.simples.length;
          else if (!this.chainablePseudoElement(compound, pe)) {
            this.fail("invalid pseudo-element chain");
            return null;
          }
          compound.simples.push(pe);
        } else {
          this.i++;
          const s = this.parsePseudoClass(afterPe ? ctx | AFTER_PSEUDO_ELEMENT : ctx);
          if (s === null) return null;
          if (s.kind === S_PSEUDO_ELEMENT) {
            // legacy single-colon pseudo-element
            if ((ctx & NO_PSEUDO_ELEMENTS) !== 0 || afterPe) {
              this.fail("pseudo-element not allowed here");
              return null;
            }
            compound.pseudoElementIndex = compound.simples.length;
          } else if (afterPe && !allowedAfterPseudoElement(this.lastPseudoElement(compound), s.pseudo)) {
            this.fail("pseudo-class not allowed after pseudo-element");
            return null;
          }
          compound.simples.push(s);
        }
      } else {
        break;
      }
    }
    if (compound.simples.length === 0) {
      this.fail("expected a selector");
      return null;
    }
    return compound;
  }

  lastPseudoElement(compound: Compound): number {
    for (let k = compound.simples.length - 1; k >= 0; k--) {
      const s = compound.simples[k];
      if (s.kind === S_PSEUDO_ELEMENT) return s.pseudo;
    }
    return 0;
  }

  /** ::part() may be followed by other pseudo-elements; ::slotted() by ::before/::after/::marker etc. */
  chainablePseudoElement(compound: Compound, pe: Simple): boolean {
    let last: Simple | null = null;
    for (let k = compound.simples.length - 1; k >= 0; k--) {
      const s = compound.simples[k];
      if (s.kind === S_PSEUDO_ELEMENT) {
        last = s;
        break;
      }
    }
    if (last === null) return true;
    if (last.pseudo === PE_PART || last.pseudo === PE_SLOTTED) return pe.pseudo === PE_OTHER || pe.pseudo === PE_FUNCTION;
    return false;
  }

  /** https://drafts.csswg.org/selectors-4/#attribute-selectors (after `[`). */
  parseAttribute(): Simple | null {
    this.skipWs();
    const s = new Simple(S_ATTR, "");
    const t = this.peek();
    // [ns|attr], [*|attr], [|attr], [attr]
    if (t.type === TK_DELIM && t.value === "|" && this.toks[this.i + 1].type === TK_IDENT) {
      s.nsKind = NS_NONE;
      this.i++;
    } else if (t.type === TK_DELIM && t.value === "*" && this.isDelimAt(this.i + 1, "|") && this.toks[this.i + 2].type === TK_IDENT) {
      s.nsKind = NS_ANY;
      this.i += 2;
    } else if (t.type === TK_IDENT && this.isDelimAt(this.i + 1, "|") && this.toks[this.i + 2].type === TK_IDENT) {
      s.nsKind = NS_PREFIX;
      s.nsPrefix = t.value;
      this.i += 2;
    }
    const nameTok = this.peek();
    if (nameTok.type !== TK_IDENT) {
      this.fail("expected attribute name");
      return null;
    }
    s.name = nameTok.value;
    this.i++;
    this.skipWs();
    const m = this.peek();
    if (m.type === TK_RBRACKET || m.type === TK_EOF) {
      if (m.type === TK_RBRACKET) this.i++;
      return s;
    }
    if (m.type !== TK_DELIM) {
      this.fail("expected attribute matcher");
      return null;
    }
    let op = -1;
    if (m.value === "=") {
      op = OP_EQUALS;
      this.i++;
    } else if (this.isDelimAt(this.i + 1, "=")) {
      switch (m.value) {
        case "~": op = OP_INCLUDES; break;
        case "|": op = OP_DASH; break;
        case "^": op = OP_PREFIX; break;
        case "$": op = OP_SUFFIX; break;
        case "*": op = OP_SUBSTRING; break;
      }
      if (op !== -1) this.i += 2;
    }
    if (op === -1) {
      this.fail("invalid attribute matcher");
      return null;
    }
    s.op = op;
    this.skipWs();
    const v = this.peek();
    if (v.type !== TK_IDENT && v.type !== TK_STRING) {
      this.fail("expected attribute value");
      return null;
    }
    s.value = v.value;
    this.i++;
    this.skipWs();
    const f = this.peek();
    if (f.type === TK_IDENT) {
      const flag = asciiLower(f.value);
      if (flag === "i") s.caseFlag = CASE_INSENSITIVE;
      else if (flag === "s") s.caseFlag = CASE_SENSITIVE;
      else {
        this.fail("invalid attribute modifier");
        return null;
      }
      this.i++;
      this.skipWs();
    }
    if (!this.expectClose(TK_RBRACKET)) return null;
    return s;
  }

  /** After `:`. Returns a pseudo-class, or a pseudo-element for legacy `:before` etc. */
  parsePseudoClass(ctx: number): Simple | null {
    const t = this.peek();
    if (t.type === TK_IDENT) {
      const name = asciiLower(t.value);
      this.i++;
      const id = pseudoClassId(name);
      if (id !== P_UNKNOWN) {
        const s = new Simple(S_PSEUDO_CLASS, name);
        s.pseudo = id;
        return s;
      }
      if (isLegacyPseudoElement(name)) {
        const s = new Simple(S_PSEUDO_ELEMENT, name);
        s.pseudo = PE_OTHER;
        return s;
      }
      this.fail("unknown pseudo-class :" + name);
      return null;
    }
    if (t.type === TK_FUNCTION) {
      const name = asciiLower(t.value);
      this.i++;
      const id = functionalPseudoClassId(name);
      if (id === P_UNKNOWN) {
        this.fail("unknown pseudo-class :" + name + "()");
        return null;
      }
      const s = new Simple(S_PSEUDO_CLASS, name);
      s.pseudo = id;
      if (!this.parsePseudoClassArgs(s, ctx)) return null;
      return s;
    }
    this.fail("expected pseudo-class name");
    return null;
  }

  parsePseudoClassArgs(s: Simple, ctx: number): boolean {
    const p = s.pseudo;
    if (p === P_IS || p === P_WHERE) {
      s.list = this.parseForgivingList(ctx | NO_PSEUDO_ELEMENTS);
      if (this.error !== "") return false;
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_NOT) {
      this.skipWs();
      if (this.peekType() === TK_RPAREN) {
        this.fail(":not() requires an argument");
        return false;
      }
      const list = this.parseComplexList(ctx | NO_PSEUDO_ELEMENTS, false);
      if (list === null) return false;
      s.list = list;
      this.skipWs();
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_HAS) {
      if ((ctx & IN_HAS) !== 0) {
        this.fail(":has() cannot be nested");
        return false;
      }
      this.skipWs();
      if (this.peekType() === TK_RPAREN) {
        this.fail(":has() requires an argument");
        return false;
      }
      const list = this.parseComplexList(ctx | IN_HAS | NO_PSEUDO_ELEMENTS, true);
      if (list === null) return false;
      s.list = list;
      this.skipWs();
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_NTH_CHILD || p === P_NTH_LAST_CHILD || p === P_NTH_OF_TYPE || p === P_NTH_LAST_OF_TYPE) {
      this.skipWs();
      if (!this.parseAnPlusB(s)) return false;
      this.clampAnb(s);
      this.skipWs();
      const t = this.peek();
      if ((p === P_NTH_CHILD || p === P_NTH_LAST_CHILD) && t.type === TK_IDENT && asciiLower(t.value) === "of") {
        this.i++;
        if (this.peekType() !== TK_WS) {
          this.fail("expected whitespace after 'of'");
          return false;
        }
        this.skipWs();
        const list = this.parseComplexList(ctx | NO_PSEUDO_ELEMENTS, false);
        if (list === null) return false;
        s.list = list;
        this.skipWs();
      }
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_HOST_FN || p === P_HOST_CONTEXT) {
      this.skipWs();
      const list = this.parseComplexList(ctx | NO_PSEUDO_ELEMENTS | COMPOUND_ONLY, false);
      if (list === null) return false;
      if (list.items.length !== 1) {
        this.fail("expected a single compound selector");
        return false;
      }
      s.list = list;
      this.skipWs();
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_LANG) {
      // :lang( [ <ident> | <string> ]# )
      while (true) {
        this.skipWs();
        const t = this.peek();
        if (t.type === TK_IDENT || t.type === TK_STRING) {
          s.args.push(t.value);
          this.i++;
        } else {
          this.fail("expected language range");
          return false;
        }
        this.skipWs();
        if (this.peekType() === TK_COMMA) {
          this.i++;
          continue;
        }
        break;
      }
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_DIR || p === P_STATE) {
      this.skipWs();
      const t = this.peek();
      if (t.type !== TK_IDENT) {
        this.fail("expected identifier");
        return false;
      }
      // :dir() accepts any identifier; values other than ltr/rtl never match.
      s.args.push(p === P_DIR ? asciiLower(t.value) : t.value);
      this.i++;
      this.skipWs();
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_HEADING) {
      // :heading(<integer>#) — https://drafts.csswg.org/selectors-5/#headings
      while (true) {
        this.skipWs();
        const t = this.peek();
        if (t.type !== TK_NUMBER || !t.isInt) {
          this.fail("expected heading level");
          return false;
        }
        s.args.push(String(t.num));
        this.i++;
        this.skipWs();
        if (this.peekType() === TK_COMMA) {
          this.i++;
          continue;
        }
        break;
      }
      return this.expectClose(TK_RPAREN);
    }
    if (p === P_CURRENT) {
      s.list = this.parseForgivingList(ctx | NO_PSEUDO_ELEMENTS);
      return this.expectClose(TK_RPAREN);
    }
    this.fail("unsupported functional pseudo-class");
    return false;
  }

  /** After `::`. */
  parsePseudoElement(ctx: number): Simple | null {
    const t = this.peek();
    if (t.type === TK_IDENT) {
      const name = asciiLower(t.value);
      this.i++;
      if (!isKnownPseudoElement(name)) {
        this.fail("unknown pseudo-element ::" + name);
        return null;
      }
      const s = new Simple(S_PSEUDO_ELEMENT, name);
      s.pseudo = PE_OTHER;
      return s;
    }
    if (t.type === TK_FUNCTION) {
      const name = asciiLower(t.value);
      this.i++;
      const kind = isKnownFunctionalPseudoElement(name);
      if (kind === 0) {
        this.fail("unknown pseudo-element ::" + name + "()");
        return null;
      }
      const s = new Simple(S_PSEUDO_ELEMENT, name);
      s.pseudo = kind;
      this.skipWs();
      if (kind === PE_SLOTTED) {
        const list = this.parseComplexList(ctx | NO_PSEUDO_ELEMENTS | COMPOUND_ONLY, false);
        if (list === null) return null;
        if (list.items.length !== 1) {
          this.fail("expected a single compound selector");
          return null;
        }
        s.list = list;
      } else {
        // ::part(<ident>+), ::highlight(<ident>), ... — identifiers separated by whitespace.
        while (this.peekType() === TK_IDENT) {
          s.args.push(this.peek().value);
          this.i++;
          this.skipWs();
        }
        if (kind === PE_PART && s.args.length === 0) {
          this.fail("::part() requires an identifier");
          return null;
        }
        if (this.peekType() !== TK_RPAREN && this.peekType() !== TK_EOF) {
          if (kind === PE_PART) {
            this.fail("invalid ::part() argument");
            return null;
          }
          this.skipToTopLevelCommaOrClose();
        }
      }
      this.skipWs();
      if (!this.expectClose(TK_RPAREN)) return null;
      return s;
    }
    this.fail("expected pseudo-element name");
    return null;
  }

  /**
   * https://drafts.csswg.org/css-syntax-3/#anb-microsyntax
   * Consumes tokens for <an+b> starting at the current position.
   */
  parseAnPlusB(s: Simple): boolean {
    const t = this.peek();
    // odd / even / integer
    if (t.type === TK_IDENT) {
      const v = asciiLower(t.value);
      if (v === "odd") {
        s.a = 2;
        s.b = 1;
        this.i++;
        return true;
      }
      if (v === "even") {
        s.a = 2;
        s.b = 0;
        this.i++;
        return true;
      }
    }
    if (t.type === TK_NUMBER) {
      if (!t.isInt) return this.anbFail();
      s.a = 0;
      s.b = t.num;
      this.i++;
      return true;
    }
    // Determine the "n" part: A and the remaining unit text after 'n'.
    let a = 0;
    let rest = "";
    if (t.type === TK_DIMENSION) {
      if (!t.isInt) return this.anbFail();
      const unit = asciiLower(t.value);
      if (unit.charCodeAt(0) !== 0x6e) return this.anbFail();
      a = t.num;
      rest = unit.slice(1);
      this.i++;
    } else if (t.type === TK_IDENT) {
      const v = asciiLower(t.value);
      if (v.charCodeAt(0) === 0x6e) {
        a = 1;
        rest = v.slice(1);
      } else if (v.charCodeAt(0) === 0x2d && v.charCodeAt(1) === 0x6e) {
        a = -1;
        rest = v.slice(2);
      } else {
        return this.anbFail();
      }
      this.i++;
    } else if (t.type === TK_DELIM && t.value === "+") {
      // '+'? n  — the '+' must be immediately followed by the ident (no whitespace).
      const n = this.toks[this.i + 1];
      if (n.type !== TK_IDENT) return this.anbFail();
      const v = asciiLower(n.value);
      if (v.charCodeAt(0) !== 0x6e) return this.anbFail();
      a = 1;
      rest = v.slice(1);
      this.i += 2;
    } else {
      return this.anbFail();
    }
    s.a = a;
    if (rest === "") {
      // An, optionally followed by [+-] B or a signed integer.
      const save = this.i;
      this.skipWs();
      const n = this.peek();
      if (n.type === TK_NUMBER && n.isInt && n.flag) {
        s.b = n.num;
        this.i++;
        return true;
      }
      if (n.type === TK_DELIM && (n.value === "+" || n.value === "-")) {
        this.i++;
        this.skipWs();
        const m = this.peek();
        if (m.type === TK_NUMBER && m.isInt && !m.flag) {
          s.b = n.value === "-" ? -m.num : m.num;
          this.i++;
          return true;
        }
        return this.anbFail();
      }
      this.i = save;
      s.b = 0;
      return true;
    }
    if (rest === "-") {
      // n- B
      this.skipWs();
      const m = this.peek();
      if (m.type === TK_NUMBER && m.isInt && !m.flag) {
        s.b = -m.num;
        this.i++;
        return true;
      }
      return this.anbFail();
    }
    // n-<digits>
    if (rest.charCodeAt(0) === 0x2d && rest.length > 1) {
      let b = 0;
      for (let k = 1; k < rest.length; k++) {
        const c = rest.charCodeAt(k);
        if (!isDigit(c)) return this.anbFail();
        b = b * 10 + (c - 0x30);
      }
      s.b = -b;
      return true;
    }
    return this.anbFail();
  }

  /** Clamp A and B to the 32-bit integer range, as engines do (WPT nth-child-large-anplusb-clamp). */
  clampAnb(s: Simple): void {
    if (s.a > 2147483647) s.a = 2147483647;
    else if (s.a < -2147483648) s.a = -2147483648;
    if (s.b > 2147483647) s.b = 2147483647;
    else if (s.b < -2147483648) s.b = -2147483648;
  }

  anbFail(): boolean {
    this.fail("invalid An+B");
    return false;
  }
}

function trimWs(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isWhitespace(s.charCodeAt(a))) a++;
  while (b > a && isWhitespace(s.charCodeAt(b - 1))) b--;
  return a === 0 && b === s.length ? s : s.slice(a, b);
}

/** Parse a selector list; returns null (with `parser.error` set) when invalid. */
export function parseSelectorList(src: string): SelectorList | null {
  const p = new SelectorParser(src);
  return p.parseSelectorList();
}

/** Like `parseSelectorList` but returns the failure reason ("" on success). */
export function selectorError(src: string): string {
  const p = new SelectorParser(src);
  const list = p.parseSelectorList();
  if (list === null) return p.error === "" ? "invalid selector" : p.error;
  return "";
}

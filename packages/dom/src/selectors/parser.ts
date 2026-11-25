//
// Selector parser: CSS Syntax 3 tokenization + Selectors 4 grammar → compact AST.
//
// https://drafts.csswg.org/css-syntax-3/#tokenization
// https://drafts.csswg.org/selectors-4/#grammar
// https://drafts.csswg.org/cssom/#parse-a-selector
//
// This module is pure (no DOM access) and written for V8's fast paths: classes with fields
// initialized in constructors (stable shapes), integer constants instead of enums, plain loops,
// no closures/regexes. Errors are reported through `SelectorParser.error` (the caller turns them
// into SyntaxError DOMExceptions); the parser never throws.
//
// Namespace prefixes are recorded verbatim (`Simple.nsPrefix`) and resolved by the compiler,
// since querySelector has no namespace map while style sheets may (@namespace).

import {
  CSSTokenizer,
  TK_COLON,
  TK_COMMA,
  TK_DELIM,
  TK_DIMENSION,
  TK_EOF,
  TK_FUNCTION,
  TK_HASH,
  TK_IDENT,
  TK_LBRACE,
  TK_LBRACKET,
  TK_LPAREN,
  TK_NUMBER,
  TK_PERCENTAGE,
  TK_RBRACE,
  TK_RBRACKET,
  TK_RPAREN,
  TK_STRING,
  TK_WHITESPACE,
  isWhitespace,
} from "../css/tokenizer.ts";

// --- tokens ------------------------------------------------------------------------------
// https://drafts.csswg.org/css-syntax-3/#tokenizer-definitions
// Tokenized by the CSS layer's tokenizer (css/tokenizer.ts); the parser walks an array of tokens
// so it can look ahead and back.

export class Token {
  declare type: number;
  /** Ident/function/at/hash name, string value, delim char, dimension unit. */
  declare value: string;
  /** Numeric value for number/percentage/dimension. */
  declare num: number;
  /** Number is an integer (type flag "integer"). */
  declare isInt: boolean;
  /** Number representation started with "+" or "-". Hash: type flag "id". */
  declare flag: boolean;
  /** Start offset in the source. */
  declare start: number;

  constructor(type: number, value: string, start: number) {
    this.type = type;
    this.value = value;
    this.num = 0;
    this.isInt = false;
    this.flag = false;
    this.start = start;
  }
}

/** Tokenize a whole string (comments dropped). The last token is always TK_EOF. */
export function tokenize(src: string): Token[] {
  const t = new CSSTokenizer(src);
  const out: Token[] = [];
  while (true) {
    const type = t.next();
    const tok = new Token(type, t.value, t.start);
    if (type === TK_NUMBER || type === TK_PERCENTAGE || type === TK_DIMENSION) {
      tok.num = t.num;
      tok.isInt = t.isInteger;
      tok.flag = t.sign !== "";
    } else if (type === TK_HASH) {
      tok.flag = t.hashId;
    }
    out.push(tok);
    if (type === TK_EOF) return out;
  }
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
// misc element state
export const P_OPEN = 70;
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
 * monomorphic.
 */
export class Simple {
  declare kind: number;
  /** Type/attribute local name (case preserved), id, class name, or lowercased pseudo name. */
  declare name: string;
  declare nsKind: number;
  declare nsPrefix: string;
  /** Attribute matcher (OP_*). */
  declare op: number;
  /** Attribute value. */
  declare value: string;
  /** Attribute case flag (CASE_*). */
  declare caseFlag: number;
  /** Pseudo-class id (P_*) or pseudo-element id (PE_*). */
  declare pseudo: number;
  /** An+B. */
  declare a: number;
  declare b: number;
  /** Selector argument (:is/:where/:not/:has/:nth-*(of S)/:host()/::slotted()); null when absent. */
  declare list: SelectorList | null;
  /** Identifier/string arguments (:lang, :dir, :state, ::part, ::highlight). */
  declare args: string[];

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
  declare simples: Simple[];
  /** Index of the first pseudo-element in `simples`, or -1. */
  declare pseudoElementIndex: number;

  constructor() {
    this.simples = [];
    this.pseudoElementIndex = -1;
  }
}

/** https://drafts.csswg.org/selectors-4/#complex (and relative selectors for :has). */
export class Complex {
  declare compounds: Compound[];
  /** combinators[i] joins compounds[i] and compounds[i + 1]. */
  declare combinators: number[];
  /** Leading combinator of a relative selector (C_NONE when absent). */
  declare leading: number;
  /** Source text (trimmed) of this complex selector. */
  declare text: string;
  /**
   * An item of a forgiving selector list (:is/:where) that failed to parse. It matches nothing
   * but keeps its source text for serialization (https://drafts.csswg.org/selectors-4/#forgiving-selector).
   */
  declare invalid: boolean;

  constructor() {
    this.compounds = [];
    this.combinators = [];
    this.leading = C_NONE;
    this.text = "";
    this.invalid = false;
  }
}

export class SelectorList {
  declare items: Complex[];
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
  return (
    p === P_HOVER ||
    p === P_ACTIVE ||
    p === P_FOCUS ||
    p === P_FOCUS_VISIBLE ||
    p === P_FOCUS_WITHIN ||
    p === P_IS ||
    p === P_WHERE ||
    p === P_NOT
  );
}

/** Non-functional pseudo-class name (lowercased) → id. */
const PSEUDO_CLASSES = new Map<string, number>([
  ["first-child", P_FIRST_CHILD],
  ["last-child", P_LAST_CHILD],
  ["only-child", P_ONLY_CHILD],
  ["first-of-type", P_FIRST_OF_TYPE],
  ["last-of-type", P_LAST_OF_TYPE],
  ["only-of-type", P_ONLY_OF_TYPE],
  ["empty", P_EMPTY],
  ["root", P_ROOT],
  ["scope", P_SCOPE],
  ["host", P_HOST],
  ["link", P_LINK],
  ["any-link", P_ANY_LINK],
  ["visited", P_VISITED],
  ["target", P_TARGET],
  ["target-within", P_TARGET_WITHIN],
  ["defined", P_DEFINED],
  ["hover", P_HOVER],
  ["active", P_ACTIVE],
  ["focus", P_FOCUS],
  ["focus-within", P_FOCUS_WITHIN],
  ["focus-visible", P_FOCUS_VISIBLE],
  ["checked", P_CHECKED],
  ["indeterminate", P_INDETERMINATE],
  ["default", P_DEFAULT],
  ["disabled", P_DISABLED],
  ["enabled", P_ENABLED],
  ["required", P_REQUIRED],
  ["optional", P_OPTIONAL],
  ["read-only", P_READ_ONLY],
  ["read-write", P_READ_WRITE],
  ["placeholder-shown", P_PLACEHOLDER_SHOWN],
  ["valid", P_VALID],
  ["invalid", P_INVALID],
  ["in-range", P_IN_RANGE],
  ["out-of-range", P_OUT_OF_RANGE],
  ["user-valid", P_USER_VALID],
  ["user-invalid", P_USER_INVALID],
  ["autofill", P_AUTOFILL],
  ["-webkit-autofill", P_AUTOFILL],
  ["open", P_OPEN],
  ["popover-open", P_POPOVER_OPEN],
  ["modal", P_MODAL],
  ["fullscreen", P_FULLSCREEN],
  ["picture-in-picture", P_PICTURE_IN_PICTURE],
  ["playing", P_PLAYING],
  ["paused", P_PAUSED],
  ["muted", P_MUTED],
  ["seeking", P_SEEKING],
  ["buffering", P_BUFFERING],
  ["stalled", P_STALLED],
  ["volume-locked", P_VOLUME_LOCKED],
  ["current", P_CURRENT],
  ["past", P_PAST],
  ["future", P_FUTURE],
  ["has-slotted", P_HAS_SLOTTED],
  ["target-current", P_TARGET_CURRENT],
  ["heading", P_HEADING],
]);

/** Non-functional pseudo-class name (lowercased) → id, or P_UNKNOWN. */
export function pseudoClassId(name: string): number {
  return PSEUDO_CLASSES.get(name) ?? P_UNKNOWN;
}

/** Functional pseudo-class name (lowercased) → id. */
const FUNCTIONAL_PSEUDO_CLASSES = new Map<string, number>([
  ["is", P_IS],
  ["matches", P_IS],
  ["-webkit-any", P_IS],
  ["where", P_WHERE],
  ["not", P_NOT],
  ["has", P_HAS],
  ["nth-child", P_NTH_CHILD],
  ["nth-last-child", P_NTH_LAST_CHILD],
  ["nth-of-type", P_NTH_OF_TYPE],
  ["nth-last-of-type", P_NTH_LAST_OF_TYPE],
  ["host", P_HOST_FN],
  ["host-context", P_HOST_CONTEXT],
  ["lang", P_LANG],
  ["dir", P_DIR],
  ["state", P_STATE],
  ["current", P_CURRENT],
  ["heading", P_HEADING],
]);

/** Functional pseudo-class name (lowercased) → id, or P_UNKNOWN. */
export function functionalPseudoClassId(name: string): number {
  return FUNCTIONAL_PSEUDO_CLASSES.get(name) ?? P_UNKNOWN;
}

/** Tree-structural pseudo-classes (not allowed after ::part()). */
function isStructural(p: number): boolean {
  return (
    (p >= P_FIRST_CHILD && p <= P_ONLY_OF_TYPE) ||
    p === P_EMPTY ||
    p === P_ROOT ||
    p === P_HAS ||
    (p >= P_NTH_CHILD && p <= P_NTH_LAST_OF_TYPE)
  );
}

// oxfmt-ignore
const PSEUDO_ELEMENTS = new Set([
  "before", "after", "first-line", "first-letter", "marker", "placeholder", "selection", "backdrop",
  "file-selector-button", "target-text", "spelling-error", "grammar-error", "cue", "cue-region", "details-content",
  "checkmark", "picker-icon", "scroll-marker", "scroll-marker-group", "column", "view-transition",
]);

/** Argument-less pseudo-element name (lowercased) → known? */
function isKnownPseudoElement(name: string): boolean {
  // Vendor pseudo-elements engines expose (::-webkit-scrollbar, ::-moz-selection, ...).
  return PSEUDO_ELEMENTS.has(name) || name.startsWith("-webkit-") || name.startsWith("-moz-");
}

// oxfmt-ignore
const FUNCTIONAL_PSEUDO_ELEMENTS = new Map([
  ["slotted", PE_SLOTTED], ["part", PE_PART], ["highlight", PE_FUNCTION], ["picker", PE_FUNCTION],
  ["scroll-button", PE_FUNCTION], ["cue", PE_FUNCTION], ["cue-region", PE_FUNCTION],
  ["view-transition-group", PE_FUNCTION], ["view-transition-image-pair", PE_FUNCTION],
  ["view-transition-old", PE_FUNCTION], ["view-transition-new", PE_FUNCTION],
]);

/** Functional pseudo-element name (lowercased) → PE_* id, or 0 when unknown. */
function isKnownFunctionalPseudoElement(name: string): number {
  return FUNCTIONAL_PSEUDO_ELEMENTS.get(name) ?? 0;
}

function isLegacyPseudoElement(name: string): boolean {
  return name === "before" || name === "after" || name === "first-line" || name === "first-letter";
}

/**
 * Recursive-descent parser over the token array.
 * https://drafts.csswg.org/selectors-4/#parse-selector
 */
export class SelectorParser {
  declare src: string;
  declare toks: Token[];
  declare i: number;
  /** Set when parsing failed; a human-readable reason (for debugging; DOM messages use the selector text). */
  declare error: string;

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
    while (this.toks[this.i].type === TK_WHITESPACE) this.i++;
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
    while (this.peekType() === TK_WHITESPACE) {
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
    if (last.pseudo === PE_PART || last.pseudo === PE_SLOTTED)
      return pe.pseudo === PE_OTHER || pe.pseudo === PE_FUNCTION;
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
    } else if (
      t.type === TK_DELIM &&
      t.value === "*" &&
      this.isDelimAt(this.i + 1, "|") &&
      this.toks[this.i + 2].type === TK_IDENT
    ) {
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
        case "~":
          op = OP_INCLUDES;
          break;
        case "|":
          op = OP_DASH;
          break;
        case "^":
          op = OP_PREFIX;
          break;
        case "$":
          op = OP_SUFFIX;
          break;
        case "*":
          op = OP_SUBSTRING;
          break;
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
        if (this.peekType() !== TK_WHITESPACE) {
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
        if (c < 0x30 || c > 0x39) return this.anbFail();
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

// @scriptc-compatible
// The HTML tokenizer.
// https://html.spec.whatwg.org/#tokenization
//
// A pull tokenizer over a whole input string: `next()` runs the state machine until one token
// is complete and leaves it in the tokenizer's fields (no token objects are allocated).
// Character tokens are batched into runs: `text` holds every character emitted since the
// previous non-character token. Runs are sliced straight out of the input where possible;
// they are materialized into a buffer only around character references and U+0000.
//
// Deviations that do not change the token stream:
// - Input preprocessing (https://html.spec.whatwg.org/#preprocessing-the-input-stream) is done
//   up front: CR and CRLF become LF.
// - Character references are resolved synchronously by looking ahead in the input instead of
//   through the character reference states.
// - CDATA sections are found with indexOf("]]>"), which produces the same characters as the
//   CDATA bracket/end states.
// - Parse errors are not reported.
//
// The tree builder may change `state` after a start tag (RCDATA/RAWTEXT/script data/PLAINTEXT)
// and must keep `allowCDATA` up to date (adjusted current node not in the HTML namespace).

import { entityValue, matchNamedReference, matchedLength, numericReferenceValue } from "./entities.ts";
import { TAG_NAMES, TAG_COUNT } from "./tags.ts";

// --- token types -------------------------------------------------------------------------
export const TK_NONE = 0;
export const TK_CHARS = 1;
export const TK_START = 2;
export const TK_END = 3;
export const TK_COMMENT = 4;
export const TK_DOCTYPE = 5;
export const TK_EOF = 6;
export const TK_PI = 7;

// --- states (https://html.spec.whatwg.org/#tokenization, 13.2.5.x) -------------------------
export const S_DATA = 0;
export const S_RCDATA = 1;
export const S_RAWTEXT = 2;
export const S_SCRIPT_DATA = 3;
export const S_PLAINTEXT = 4;
const S_TAG_OPEN = 5;
const S_END_TAG_OPEN = 6;
const S_TAG_NAME = 7;
const S_RCDATA_LT = 8;
const S_RCDATA_END_TAG_OPEN = 9;
const S_RCDATA_END_TAG_NAME = 10;
const S_RAWTEXT_LT = 11;
const S_RAWTEXT_END_TAG_OPEN = 12;
const S_RAWTEXT_END_TAG_NAME = 13;
const S_SCRIPT_LT = 14;
const S_SCRIPT_END_TAG_OPEN = 15;
const S_SCRIPT_END_TAG_NAME = 16;
const S_SCRIPT_ESCAPE_START = 17;
const S_SCRIPT_ESCAPE_START_DASH = 18;
const S_SCRIPT_ESCAPED = 19;
const S_SCRIPT_ESCAPED_DASH = 20;
const S_SCRIPT_ESCAPED_DASH_DASH = 21;
const S_SCRIPT_ESCAPED_LT = 22;
const S_SCRIPT_ESCAPED_END_TAG_OPEN = 23;
const S_SCRIPT_ESCAPED_END_TAG_NAME = 24;
const S_SCRIPT_DOUBLE_ESCAPE_START = 25;
const S_SCRIPT_DOUBLE_ESCAPED = 26;
const S_SCRIPT_DOUBLE_ESCAPED_DASH = 27;
const S_SCRIPT_DOUBLE_ESCAPED_DASH_DASH = 28;
const S_SCRIPT_DOUBLE_ESCAPED_LT = 29;
const S_SCRIPT_DOUBLE_ESCAPE_END = 30;
const S_BEFORE_ATTR_NAME = 31;
const S_ATTR_NAME = 32;
const S_AFTER_ATTR_NAME = 33;
const S_BEFORE_ATTR_VALUE = 34;
const S_ATTR_VALUE_DQ = 35;
const S_ATTR_VALUE_SQ = 36;
const S_ATTR_VALUE_UNQUOTED = 37;
const S_AFTER_ATTR_VALUE_QUOTED = 38;
const S_SELF_CLOSING_START_TAG = 39;
const S_BOGUS_COMMENT = 40;
const S_MARKUP_DECLARATION_OPEN = 41;
const S_COMMENT_START = 42;
const S_COMMENT_START_DASH = 43;
const S_COMMENT = 44;
const S_COMMENT_LT = 45;
const S_COMMENT_LT_BANG = 46;
const S_COMMENT_LT_BANG_DASH = 47;
const S_COMMENT_LT_BANG_DASH_DASH = 48;
const S_COMMENT_END_DASH = 49;
const S_COMMENT_END = 50;
const S_COMMENT_END_BANG = 51;
const S_DOCTYPE = 52;
const S_BEFORE_DOCTYPE_NAME = 53;
const S_DOCTYPE_NAME = 54;
const S_AFTER_DOCTYPE_NAME = 55;
const S_AFTER_DOCTYPE_PUBLIC_KEYWORD = 56;
const S_BEFORE_DOCTYPE_PUBLIC_ID = 57;
const S_DOCTYPE_PUBLIC_ID_DQ = 58;
const S_DOCTYPE_PUBLIC_ID_SQ = 59;
const S_AFTER_DOCTYPE_PUBLIC_ID = 60;
const S_BETWEEN_DOCTYPE_IDS = 61;
const S_AFTER_DOCTYPE_SYSTEM_KEYWORD = 62;
const S_BEFORE_DOCTYPE_SYSTEM_ID = 63;
const S_DOCTYPE_SYSTEM_ID_DQ = 64;
const S_DOCTYPE_SYSTEM_ID_SQ = 65;
const S_AFTER_DOCTYPE_SYSTEM_ID = 66;
const S_BOGUS_DOCTYPE = 67;
export const S_CDATA_SECTION = 68;
const S_PI_OPEN = 69;
const S_PI_TARGET = 70;
const S_AFTER_PI_TARGET = 71;
const S_PI_DATA = 72;
const S_PI_QUESTIONABLE = 73;

// --- name interning ----------------------------------------------------------------------
// Known names hash into small open-addressing tables so that the common tag and attribute
// names come out of the tokenizer as the same (internalized) string every time, without
// allocating a substring. The hash is computed while scanning the name.

/** Attribute names interned by the tokenizer (no tree-builder meaning). */
const ATTR_NAMES: string[] = [
  "",
  "id", "class", "style", "type", "name", "value", "href", "src", "alt", "title", "role", "for",
  "placeholder", "disabled", "checked", "selected", "readonly", "required", "multiple", "hidden",
  "tabindex", "lang", "dir", "width", "height", "action", "method", "target", "rel", "content",
  "charset", "colspan", "rowspan", "data-testid", "aria-label", "aria-labelledby",
  "aria-describedby", "aria-hidden", "aria-expanded", "aria-selected", "aria-checked",
  "aria-pressed", "aria-disabled", "aria-controls", "aria-live", "aria-current", "aria-haspopup",
  "aria-invalid", "aria-required", "aria-valuenow", "aria-valuemin", "aria-valuemax",
  "aria-level", "aria-modal", "aria-owns", "aria-busy", "aria-orientation", "aria-roledescription",
  "autocomplete", "autofocus", "min", "max", "step", "pattern", "maxlength", "minlength", "size",
  "accept", "label", "open", "draggable", "contenteditable", "xmlns", "viewbox", "d", "fill",
  "stroke", "x", "y", "cx", "cy", "r", "points", "transform", "xlink:href", "focusable", "form",
  "list", "datetime", "headers", "scope", "span", "start", "reversed", "download", "enctype",
  "novalidate", "inputmode", "spellcheck", "translate", "inert", "popover", "slot", "is", "part",
  "loading", "decoding", "srcset", "sizes", "media", "async", "defer", "nonce", "integrity",
  "crossorigin", "referrerpolicy", "sandbox", "allow", "poster", "controls", "autoplay", "loop",
  "muted", "kind", "srclang", "default", "wrap", "rows", "cols", "high", "low", "optimum",
  "shape", "coords", "usemap", "ismap", "accesskey", "enterkeyhint", "itemprop", "itemscope",
  "itemtype", "http-equiv", "property", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "fill-rule", "clip-rule", "xmlns:xlink", "version", "preserveaspectratio", "encoding",
  "definitionurl", "color", "face", "shadowrootmode",
];

const TABLE_MASK = 1023;
const tagTable = new Int32Array(TABLE_MASK + 1);
const attrTable = new Int32Array(TABLE_MASK + 1);

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

function fillTable(table: Int32Array, names: string[]): void {
  for (let i = 1; i < names.length; i++) {
    let slot = hashName(names[i]) & TABLE_MASK;
    while (table[slot] !== 0) slot = (slot + 1) & TABLE_MASK;
    table[slot] = i;
  }
}
fillTable(tagTable, TAG_NAMES);
fillTable(attrTable, ATTR_NAMES);

/** ASCII lowercase (spec "ASCII lowercase": only A-Z change) with U+0000 → U+FFFD. */
function fixName(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) out += String.fromCharCode(c + 32);
    else if (c === 0) out += "�";
    else out += s[i];
  }
  return out;
}

function isAsciiAlpha(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
}

function isAsciiAlnum(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57);
}

function isWs(c: number): boolean {
  return c === 32 || c === 10 || c === 9 || c === 12;
}

function lower(c: number): number {
  return c >= 65 && c <= 90 ? c + 32 : c;
}

/** CR and CRLF → LF. https://html.spec.whatwg.org/#preprocessing-the-input-stream */
export function normalizeNewlines(src: string): string {
  let i = src.indexOf("\r");
  if (i < 0) return src;
  let out = "";
  let last = 0;
  const len = src.length;
  while (i >= 0) {
    out += src.slice(last, i) + "\n";
    last = i + 1;
    if (last < len && src.charCodeAt(last) === 10) last++;
    i = src.indexOf("\r", last);
  }
  return out + src.slice(last);
}

function ciMatch(src: string, pos: number, word: string): boolean {
  if (pos + word.length > src.length) return false;
  for (let i = 0; i < word.length; i++) {
    if (lower(src.charCodeAt(pos + i)) !== word.charCodeAt(i)) return false;
  }
  return true;
}

export class Tokenizer {
  // input
  src: string;
  pos: number;
  len: number;
  state: number;
  /** Set by the tree builder: CDATA sections are recognized (foreign content). */
  allowCDATA: boolean;
  /** Recognize processing instructions (2026 spec change; off = classic bogus comments). */
  processingInstructions: boolean;
  /** Name of the last start tag emitted (for "appropriate end tag token"). */
  lastStartTag: string;

  // current token
  type: number;
  pendingType: number;
  /** Character token run (TK_CHARS). */
  text: string;
  /** The run contains raw U+0000 characters (data state / CDATA sections). */
  textHasNull: boolean;
  /** Tag name (lowercase), DOCTYPE name, or PI target. */
  name: string;
  /** Interned tag id from parser/tags.ts, or 0. */
  tagId: number;
  selfClosing: boolean;
  attrNames: string[];
  attrValues: string[];
  attrCount: number;
  /** Comment / PI data. */
  data: string;
  hasName: boolean;
  publicId: string;
  hasPublicId: boolean;
  systemId: string;
  hasSystemId: boolean;
  forceQuirks: boolean;

  // scratch
  textStart: number;
  textBuf: string;
  tagStart: number;
  nameStart: number;
  nameHash: number;
  nameFix: boolean;
  isEndTag: boolean;
  valueStart: number;
  valueBuf: string;
  dropAttr: boolean;
  tempBuf: string;

  constructor() {
    this.src = "";
    this.pos = 0;
    this.len = 0;
    this.state = S_DATA;
    this.allowCDATA = false;
    this.processingInstructions = false;
    this.lastStartTag = "";
    this.type = TK_NONE;
    this.pendingType = TK_NONE;
    this.text = "";
    this.textHasNull = false;
    this.name = "";
    this.tagId = 0;
    this.selfClosing = false;
    this.attrNames = [];
    this.attrValues = [];
    this.attrCount = 0;
    this.data = "";
    this.hasName = false;
    this.publicId = "";
    this.hasPublicId = false;
    this.systemId = "";
    this.hasSystemId = false;
    this.forceQuirks = false;
    this.textStart = -1;
    this.textBuf = "";
    this.tagStart = 0;
    this.nameStart = 0;
    this.nameHash = 0;
    this.nameFix = false;
    this.isEndTag = false;
    this.valueStart = -1;
    this.valueBuf = "";
    this.dropAttr = false;
    this.tempBuf = "";
  }

  /** Start tokenizing `input` (newlines are normalized here). */
  reset(input: string): void {
    this.src = normalizeNewlines(input);
    this.pos = 0;
    this.len = this.src.length;
    this.state = S_DATA;
    this.allowCDATA = false;
    this.lastStartTag = "";
    this.type = TK_NONE;
    this.pendingType = TK_NONE;
    this.text = "";
    this.textHasNull = false;
    this.textStart = -1;
    this.textBuf = "";
    this.attrCount = 0;
  }

  /** Drop references to the input and token strings. */
  release(): void {
    this.src = "";
    this.text = "";
    this.data = "";
    this.textBuf = "";
    this.valueBuf = "";
    this.attrNames.length = 0;
    this.attrValues.length = 0;
    this.attrCount = 0;
  }

  // --- text runs -----------------------------------------------------------------------

  private flushRaw(end: number): void {
    const start = this.textStart;
    if (start >= 0) {
      if (end > start) this.textBuf += this.src.slice(start, end);
      this.textStart = -1;
    }
  }

  private appendText(s: string, at: number): void {
    this.flushRaw(at);
    this.textBuf += s;
  }

  private startRun(at: number): void {
    if (this.textStart < 0) this.textStart = at;
  }

  /**
   * Emit a non-character token whose markup started at `textEnd` (text before it is emitted
   * first, as a separate TK_CHARS token).
   */
  private emit(type: number, textEnd: number): void {
    this.flushRaw(textEnd);
    if (this.textBuf.length !== 0) {
      this.text = this.textBuf;
      this.textBuf = "";
      this.type = TK_CHARS;
      this.pendingType = type;
    } else {
      this.type = type;
    }
  }

  /** Emit the pending character run now (if any). Returns true if a token was emitted. */
  private emitTextNow(end: number): boolean {
    this.flushRaw(end);
    if (this.textBuf.length === 0) return false;
    this.text = this.textBuf;
    this.textBuf = "";
    this.type = TK_CHARS;
    return true;
  }

  // --- names ---------------------------------------------------------------------------

  private finishTagName(end: number): void {
    const start = this.nameStart;
    const n = end - start;
    let slot = this.nameHash & TABLE_MASK;
    if (!this.nameFix) {
      for (;;) {
        const id = tagTable[slot];
        if (id === 0) break;
        const known = TAG_NAMES[id];
        if (known.length === n && this.src.startsWith(known, start)) {
          this.name = known;
          this.tagId = id;
          return;
        }
        slot = (slot + 1) & TABLE_MASK;
      }
      this.name = this.src.slice(start, end);
      this.tagId = 0;
      return;
    }
    const fixed = fixName(this.src.slice(start, end));
    for (;;) {
      const id = tagTable[slot];
      if (id === 0) break;
      if (TAG_NAMES[id] === fixed) {
        this.name = TAG_NAMES[id];
        this.tagId = id;
        return;
      }
      slot = (slot + 1) & TABLE_MASK;
    }
    this.name = fixed;
    this.tagId = 0;
  }

  /** Commit the attribute name src[nameStart, end); drops duplicates (parse error). */
  private finishAttrName(end: number): void {
    const start = this.nameStart;
    const n = end - start;
    let name = "";
    let slot = this.nameHash & TABLE_MASK;
    let found = false;
    if (!this.nameFix) {
      for (;;) {
        const id = attrTable[slot];
        if (id === 0) break;
        const known = ATTR_NAMES[id];
        if (known.length === n && this.src.startsWith(known, start)) {
          name = known;
          found = true;
          break;
        }
        slot = (slot + 1) & TABLE_MASK;
      }
      if (!found) name = this.src.slice(start, end);
    } else {
      name = fixName(this.src.slice(start, end));
    }
    const names = this.attrNames;
    const count = this.attrCount;
    for (let i = 0; i < count; i++) {
      if (names[i] === name) {
        this.dropAttr = true;
        return;
      }
    }
    this.dropAttr = false;
    if (count < names.length) {
      names[count] = name;
      this.attrValues[count] = "";
    } else {
      names.push(name);
      this.attrValues.push("");
    }
    this.attrCount = count + 1;
  }

  private startValue(): void {
    this.valueStart = this.pos;
    this.valueBuf = "";
  }

  private flushValue(end: number): void {
    if (this.valueStart >= 0) {
      if (end > this.valueStart) this.valueBuf += this.src.slice(this.valueStart, end);
      this.valueStart = -1;
    }
  }

  private finishValue(end: number): void {
    let value = "";
    if (this.valueBuf.length === 0) {
      value = this.valueStart >= 0 && end > this.valueStart ? this.src.slice(this.valueStart, end) : "";
    } else {
      this.flushValue(end);
      value = this.valueBuf;
    }
    this.valueStart = -1;
    this.valueBuf = "";
    if (!this.dropAttr) this.attrValues[this.attrCount - 1] = value;
  }

  private appendValue(s: string, at: number): void {
    this.flushValue(at);
    this.valueBuf += s;
    this.valueStart = this.pos;
  }

  private newTag(isEnd: boolean): void {
    this.isEndTag = isEnd;
    this.selfClosing = false;
    this.attrCount = 0;
    this.nameStart = this.pos;
    this.nameHash = 0;
    this.nameFix = false;
  }

  private emitTag(): void {
    if (this.isEndTag) {
      this.emit(TK_END, this.tagStart);
    } else {
      this.lastStartTag = this.name;
      this.emit(TK_START, this.tagStart);
    }
    this.state = S_DATA;
  }

  /** EOF inside a tag: the tag is dropped; text before it is kept. */
  private eofInTag(): void {
    this.flushRaw(this.tagStart);
    this.state = S_DATA;
  }

  /** Is src[nameStart, pos) (case-insensitively) the last start tag's name? */
  private isAppropriateEndTag(): boolean {
    const want = this.lastStartTag;
    const start = this.nameStart;
    if (want.length === 0 || this.pos - start !== want.length) return false;
    for (let i = 0; i < want.length; i++) {
      if (lower(this.src.charCodeAt(start + i)) !== want.charCodeAt(i)) return false;
    }
    return true;
  }

  /** In a RCDATA/RAWTEXT/script end tag name state: returns the next state, or -1 for "anything else". */
  private endTagNameStep(): number {
    const c = this.pos < this.len ? this.src.charCodeAt(this.pos) : -1;
    if (isAsciiAlpha(c)) {
      this.pos++;
      return -2;
    }
    if ((isWs(c) || c === 47 || c === 62) && this.isAppropriateEndTag()) {
      this.name = this.lastStartTag;
      this.tagId = 0;
      this.isEndTag = true;
      this.selfClosing = false;
      this.attrCount = 0;
      this.pos++;
      if (c === 62) {
        this.finishEndTagId();
        this.emitTag();
        return S_DATA;
      }
      this.finishEndTagId();
      return isWs(c) ? S_BEFORE_ATTR_NAME : S_SELF_CLOSING_START_TAG;
    }
    return -1;
  }

  private finishEndTagId(): void {
    const name = this.name;
    let slot = hashName(name) & TABLE_MASK;
    for (;;) {
      const id = tagTable[slot];
      if (id === 0) break;
      if (TAG_NAMES[id] === name) {
        this.tagId = id;
        return;
      }
      slot = (slot + 1) & TABLE_MASK;
    }
    this.tagId = 0;
  }

  // --- character references --------------------------------------------------------------

  /**
   * https://html.spec.whatwg.org/#character-reference-state — called with `pos` just after "&".
   * Returns the replacement text and advances `pos` past the reference, or returns null (the
   * "&" is literal; `pos` is unchanged and the following characters are reprocessed normally,
   * which is equivalent to the flush + ambiguous ampersand path).
   */
  private charRef(inAttr: boolean): string | null {
    const src = this.src;
    const start = this.pos;
    const len = this.len;
    if (start >= len) return null;
    const c = src.charCodeAt(start);
    if (isAsciiAlnum(c)) {
      // Fast path for the most common references; a match ending in ";" is always the
      // longest possible match, so this agrees with the table lookup below.
      {
        if (c === 108 && src.charCodeAt(start + 1) === 116 && src.charCodeAt(start + 2) === 59) {
          this.pos = start + 3;
          return "<";
        }
        if (c === 103 && src.charCodeAt(start + 1) === 116 && src.charCodeAt(start + 2) === 59) {
          this.pos = start + 3;
          return ">";
        }
        if (c === 97 && src.startsWith("mp;", start + 1)) {
          this.pos = start + 4;
          return "&";
        }
        if (c === 113 && src.startsWith("uot;", start + 1)) {
          this.pos = start + 5;
          return '"';
        }
        if (c === 110 && src.startsWith("bsp;", start + 1)) {
          this.pos = start + 5;
          return "\u00A0";
        }
      }
      // https://html.spec.whatwg.org/#named-character-reference-state
      const index = matchNamedReference(src, start);
      if (index < 0) return null;
      const n = matchedLength();
      const end = start + n;
      const last = src.charCodeAt(end - 1);
      if (inAttr && last !== 59 && end < len) {
        const next = src.charCodeAt(end);
        if (next === 61 || isAsciiAlnum(next)) return null;
      }
      this.pos = end;
      return entityValue(index);
    }
    if (c !== 35) return null;
    // https://html.spec.whatwg.org/#numeric-character-reference-state
    let p = start + 1;
    let hex = false;
    if (p < len) {
      const x = src.charCodeAt(p);
      if (x === 120 || x === 88) {
        hex = true;
        p++;
      }
    }
    let code = 0;
    const digitsStart = p;
    while (p < len) {
      const d = src.charCodeAt(p);
      let v = -1;
      if (d >= 48 && d <= 57) v = d - 48;
      else if (hex && d >= 97 && d <= 102) v = d - 87;
      else if (hex && d >= 65 && d <= 70) v = d - 55;
      if (v < 0) break;
      code = code * (hex ? 16 : 10) + v;
      if (code > 0x10ffff) code = 0x110000;
      p++;
    }
    if (p === digitsStart) return null; // absence-of-digits-in-numeric-character-reference
    if (p < len && src.charCodeAt(p) === 59) p++;
    this.pos = p;
    return numericReferenceValue(code);
  }

  // --- main loop -----------------------------------------------------------------------

  /** Run until the next token; returns its type (also in `type`). */
  next(): number {
    if (this.pendingType !== TK_NONE) {
      this.type = this.pendingType;
      this.pendingType = TK_NONE;
      this.textHasNull = false;
      return this.type;
    }
    if (this.type === TK_EOF) return TK_EOF;
    this.textHasNull = false;
    this.type = TK_NONE;
    while (this.type === TK_NONE) this.step();
    return this.type;
  }

  /** One or more state machine transitions. */
  private step(): void {
    const src = this.src;
    const len = this.len;
    switch (this.state) {
      // https://html.spec.whatwg.org/#data-state
      case S_DATA: {
        let pos = this.pos;
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.emit(TK_EOF, len);
            return;
          }
          const c = src.charCodeAt(pos);
          if (c === 60) {
            if (this.textStart < 0) this.textStart = pos;
            this.tagStart = pos;
            this.pos = pos + 1;
            this.state = S_TAG_OPEN;
            return;
          }
          if (c === 38) {
            this.pos = pos + 1;
            const r = this.charRef(false);
            if (r !== null) {
              this.appendText(r, pos);
              pos = this.pos;
            } else {
              if (this.textStart < 0) this.textStart = pos;
              pos++;
            }
            continue;
          }
          if (this.textStart < 0) this.textStart = pos;
          if (c === 0) this.textHasNull = true;
          pos++;
          // Fast scan of ordinary characters.
          while (pos < len) {
            const d = src.charCodeAt(pos);
            if (d === 60 || d === 38 || d === 0) break;
            pos++;
          }
        }
      }

      // https://html.spec.whatwg.org/#rcdata-state
      case S_RCDATA: {
        let pos = this.pos;
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.emit(TK_EOF, len);
            return;
          }
          const c = src.charCodeAt(pos);
          if (c === 60) {
            if (this.textStart < 0) this.textStart = pos;
            this.tagStart = pos;
            this.pos = pos + 1;
            this.state = S_RCDATA_LT;
            return;
          }
          if (c === 38) {
            this.pos = pos + 1;
            const r = this.charRef(false);
            if (r !== null) {
              this.appendText(r, pos);
              pos = this.pos;
            } else {
              if (this.textStart < 0) this.textStart = pos;
              pos++;
            }
            continue;
          }
          if (c === 0) {
            this.appendText("�", pos);
            pos++;
            continue;
          }
          if (this.textStart < 0) this.textStart = pos;
          pos++;
        }
      }

      // https://html.spec.whatwg.org/#rawtext-state
      // https://html.spec.whatwg.org/#script-data-state
      // https://html.spec.whatwg.org/#plaintext-state
      case S_RAWTEXT:
      case S_SCRIPT_DATA:
      case S_PLAINTEXT: {
        const st = this.state;
        let pos = this.pos;
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.emit(TK_EOF, len);
            return;
          }
          const c = src.charCodeAt(pos);
          if (c === 60 && st !== S_PLAINTEXT) {
            if (this.textStart < 0) this.textStart = pos;
            this.tagStart = pos;
            this.pos = pos + 1;
            this.state = st === S_RAWTEXT ? S_RAWTEXT_LT : S_SCRIPT_LT;
            return;
          }
          if (c === 0) {
            this.appendText("�", pos);
            pos++;
            continue;
          }
          if (this.textStart < 0) this.textStart = pos;
          pos++;
        }
      }

      // https://html.spec.whatwg.org/#tag-open-state
      case S_TAG_OPEN: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 33) {
          this.pos++;
          this.state = S_MARKUP_DECLARATION_OPEN;
        } else if (c === 47) {
          this.pos++;
          this.state = S_END_TAG_OPEN;
        } else if (isAsciiAlpha(c)) {
          this.newTag(false);
          this.state = S_TAG_NAME;
        } else if (c === 63) {
          if (this.processingInstructions) {
            this.tempBuf = "";
            this.pos++;
            this.state = S_PI_OPEN;
          } else {
            // unexpected-question-mark-instead-of-tag-name: bogus comment including the "?".
            this.data = "";
            this.state = S_BOGUS_COMMENT;
          }
        } else {
          // eof-before-tag-name / invalid-first-character-of-tag-name: "<" is text.
          this.state = S_DATA;
        }
        return;
      }

      // https://html.spec.whatwg.org/#end-tag-open-state
      case S_END_TAG_OPEN: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (isAsciiAlpha(c)) {
          this.newTag(true);
          this.state = S_TAG_NAME;
        } else if (c === 62) {
          // missing-end-tag-name: "</>" is dropped.
          this.flushRaw(this.tagStart);
          this.pos++;
          this.state = S_DATA;
        } else if (c === -1) {
          this.state = S_DATA; // "</" is text
        } else {
          this.data = "";
          this.state = S_BOGUS_COMMENT;
        }
        return;
      }

      // https://html.spec.whatwg.org/#tag-name-state
      case S_TAG_NAME: {
        let pos = this.pos;
        let h = this.nameHash;
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.eofInTag();
            return;
          }
          const c = src.charCodeAt(pos);
          if (c === 62 || c === 47 || isWs(c)) {
            this.nameHash = h;
            this.finishTagName(pos);
            this.pos = pos + 1;
            if (c === 62) this.emitTag();
            else this.state = c === 47 ? S_SELF_CLOSING_START_TAG : S_BEFORE_ATTR_NAME;
            return;
          }
          if ((c >= 65 && c <= 90) || c === 0) {
            this.nameFix = true;
            h = (Math.imul(h, 31) + (c === 0 ? 0xfffd : c + 32)) | 0;
          } else {
            h = (Math.imul(h, 31) + c) | 0;
          }
          pos++;
        }
      }

      // https://html.spec.whatwg.org/#rcdata-less-than-sign-state (and RAWTEXT / script data)
      case S_RCDATA_LT:
      case S_RAWTEXT_LT: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 47) {
          this.pos++;
          this.state = this.state === S_RCDATA_LT ? S_RCDATA_END_TAG_OPEN : S_RAWTEXT_END_TAG_OPEN;
        } else {
          this.state = this.state === S_RCDATA_LT ? S_RCDATA : S_RAWTEXT;
        }
        return;
      }

      case S_RCDATA_END_TAG_OPEN:
      case S_RAWTEXT_END_TAG_OPEN:
      case S_SCRIPT_END_TAG_OPEN:
      case S_SCRIPT_ESCAPED_END_TAG_OPEN: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        const st = this.state;
        if (isAsciiAlpha(c)) {
          this.nameStart = this.pos;
          this.state =
            st === S_RCDATA_END_TAG_OPEN
              ? S_RCDATA_END_TAG_NAME
              : st === S_RAWTEXT_END_TAG_OPEN
                ? S_RAWTEXT_END_TAG_NAME
                : st === S_SCRIPT_END_TAG_OPEN
                  ? S_SCRIPT_END_TAG_NAME
                  : S_SCRIPT_ESCAPED_END_TAG_NAME;
        } else {
          this.state =
            st === S_RCDATA_END_TAG_OPEN
              ? S_RCDATA
              : st === S_RAWTEXT_END_TAG_OPEN
                ? S_RAWTEXT
                : st === S_SCRIPT_END_TAG_OPEN
                  ? S_SCRIPT_DATA
                  : S_SCRIPT_ESCAPED;
        }
        return;
      }

      case S_RCDATA_END_TAG_NAME:
      case S_RAWTEXT_END_TAG_NAME:
      case S_SCRIPT_END_TAG_NAME:
      case S_SCRIPT_ESCAPED_END_TAG_NAME: {
        const st = this.state;
        for (;;) {
          const r = this.endTagNameStep();
          if (r === -2) continue;
          if (r === -1) {
            this.state =
              st === S_RCDATA_END_TAG_NAME
                ? S_RCDATA
                : st === S_RAWTEXT_END_TAG_NAME
                  ? S_RAWTEXT
                  : st === S_SCRIPT_END_TAG_NAME
                    ? S_SCRIPT_DATA
                    : S_SCRIPT_ESCAPED;
          } else if (r !== S_DATA) {
            this.state = r;
          }
          return;
        }
      }

      // https://html.spec.whatwg.org/#script-data-less-than-sign-state
      case S_SCRIPT_LT: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 47) {
          this.pos++;
          this.state = S_SCRIPT_END_TAG_OPEN;
        } else if (c === 33) {
          this.pos++;
          this.state = S_SCRIPT_ESCAPE_START;
        } else {
          this.state = S_SCRIPT_DATA;
        }
        return;
      }

      case S_SCRIPT_ESCAPE_START:
      case S_SCRIPT_ESCAPE_START_DASH: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 45) {
          this.startRun(this.pos);
          this.pos++;
          this.state = this.state === S_SCRIPT_ESCAPE_START ? S_SCRIPT_ESCAPE_START_DASH : S_SCRIPT_ESCAPED_DASH_DASH;
        } else {
          this.state = S_SCRIPT_DATA;
        }
        return;
      }

      // https://html.spec.whatwg.org/#script-data-escaped-state (and dash / dash dash)
      case S_SCRIPT_ESCAPED:
      case S_SCRIPT_ESCAPED_DASH:
      case S_SCRIPT_ESCAPED_DASH_DASH:
      case S_SCRIPT_DOUBLE_ESCAPED:
      case S_SCRIPT_DOUBLE_ESCAPED_DASH:
      case S_SCRIPT_DOUBLE_ESCAPED_DASH_DASH: {
        const st = this.state;
        const dbl = st >= S_SCRIPT_DOUBLE_ESCAPED;
        const base = dbl ? S_SCRIPT_DOUBLE_ESCAPED : S_SCRIPT_ESCAPED;
        const pos = this.pos;
        if (pos >= len) {
          this.emit(TK_EOF, len);
          return;
        }
        const c = src.charCodeAt(pos);
        if (c === 45) {
          this.startRun(pos);
          this.pos++;
          this.state = st === base ? base + 1 : base + 2;
        } else if (c === 60) {
          this.startRun(pos);
          this.tagStart = pos;
          this.pos++;
          this.state = dbl ? S_SCRIPT_DOUBLE_ESCAPED_LT : S_SCRIPT_ESCAPED_LT;
        } else if (c === 62 && st === base + 2) {
          this.startRun(pos);
          this.pos++;
          this.state = S_SCRIPT_DATA;
        } else if (c === 0) {
          this.appendText("�", pos);
          this.pos++;
          this.state = base;
        } else {
          this.startRun(pos);
          this.pos++;
          this.state = base;
        }
        return;
      }

      // https://html.spec.whatwg.org/#script-data-escaped-less-than-sign-state
      case S_SCRIPT_ESCAPED_LT: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 47) {
          this.pos++;
          this.state = S_SCRIPT_ESCAPED_END_TAG_OPEN;
        } else if (isAsciiAlpha(c)) {
          this.tempBuf = "";
          this.state = S_SCRIPT_DOUBLE_ESCAPE_START;
        } else {
          this.state = S_SCRIPT_ESCAPED;
        }
        return;
      }

      // https://html.spec.whatwg.org/#script-data-double-escape-start-state (and end)
      case S_SCRIPT_DOUBLE_ESCAPE_START:
      case S_SCRIPT_DOUBLE_ESCAPE_END: {
        const start = this.state === S_SCRIPT_DOUBLE_ESCAPE_START;
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (isWs(c) || c === 47 || c === 62) {
          this.startRun(this.pos);
          this.pos++;
          const isScript = this.tempBuf === "script";
          if (start) this.state = isScript ? S_SCRIPT_DOUBLE_ESCAPED : S_SCRIPT_ESCAPED;
          else this.state = isScript ? S_SCRIPT_ESCAPED : S_SCRIPT_DOUBLE_ESCAPED;
        } else if (isAsciiAlpha(c)) {
          this.startRun(this.pos);
          this.tempBuf += String.fromCharCode(lower(c));
          this.pos++;
        } else {
          this.state = start ? S_SCRIPT_ESCAPED : S_SCRIPT_DOUBLE_ESCAPED;
        }
        return;
      }

      // https://html.spec.whatwg.org/#script-data-double-escaped-less-than-sign-state
      case S_SCRIPT_DOUBLE_ESCAPED_LT: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 47) {
          this.startRun(this.pos);
          this.pos++;
          this.tempBuf = "";
          this.state = S_SCRIPT_DOUBLE_ESCAPE_END;
        } else {
          this.state = S_SCRIPT_DOUBLE_ESCAPED;
        }
        return;
      }

      // https://html.spec.whatwg.org/#before-attribute-name-state
      case S_BEFORE_ATTR_NAME: {
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        const c = pos < len ? src.charCodeAt(pos) : -1;
        if (c === 47 || c === 62 || c === -1) {
          this.state = S_AFTER_ATTR_NAME;
          return;
        }
        // unexpected-equals-sign-before-attribute-name: "=" starts the name.
        this.nameStart = pos;
        this.nameHash = (Math.imul(0, 31) + c) | 0;
        this.nameFix = c === 0 || (c >= 65 && c <= 90);
        if (this.nameFix) this.nameHash = c === 0 ? 0xfffd : c + 32;
        this.pos = pos + 1;
        this.state = S_ATTR_NAME;
        return;
      }

      // https://html.spec.whatwg.org/#attribute-name-state
      case S_ATTR_NAME: {
        let pos = this.pos;
        let h = this.nameHash;
        for (;;) {
          const c = pos < len ? src.charCodeAt(pos) : -1;
          if (c === -1 || isWs(c) || c === 47 || c === 62) {
            this.nameHash = h;
            this.finishAttrName(pos);
            this.pos = pos;
            this.state = S_AFTER_ATTR_NAME;
            return;
          }
          if (c === 61) {
            this.nameHash = h;
            this.finishAttrName(pos);
            this.pos = pos + 1;
            this.state = S_BEFORE_ATTR_VALUE;
            return;
          }
          if ((c >= 65 && c <= 90) || c === 0) {
            this.nameFix = true;
            h = (Math.imul(h, 31) + (c === 0 ? 0xfffd : c + 32)) | 0;
          } else {
            h = (Math.imul(h, 31) + c) | 0;
          }
          pos++;
        }
      }

      // https://html.spec.whatwg.org/#after-attribute-name-state
      case S_AFTER_ATTR_NAME: {
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        if (pos >= len) {
          this.eofInTag();
          return;
        }
        const c = src.charCodeAt(pos);
        if (c === 47) {
          this.pos++;
          this.state = S_SELF_CLOSING_START_TAG;
        } else if (c === 61) {
          this.pos++;
          this.state = S_BEFORE_ATTR_VALUE;
        } else if (c === 62) {
          this.pos++;
          this.emitTag();
        } else {
          this.state = S_BEFORE_ATTR_NAME;
        }
        return;
      }

      // https://html.spec.whatwg.org/#before-attribute-value-state
      case S_BEFORE_ATTR_VALUE: {
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        const c = pos < len ? src.charCodeAt(pos) : -1;
        if (c === 34) {
          this.pos++;
          this.startValue();
          this.state = S_ATTR_VALUE_DQ;
        } else if (c === 39) {
          this.pos++;
          this.startValue();
          this.state = S_ATTR_VALUE_SQ;
        } else if (c === 62) {
          // missing-attribute-value
          this.pos++;
          this.emitTag();
        } else {
          this.startValue();
          this.state = S_ATTR_VALUE_UNQUOTED;
        }
        return;
      }

      // https://html.spec.whatwg.org/#attribute-value-(double-quoted)-state (and single-quoted)
      case S_ATTR_VALUE_DQ:
      case S_ATTR_VALUE_SQ: {
        const quote = this.state === S_ATTR_VALUE_DQ ? 34 : 39;
        let pos = this.pos;
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.eofInTag();
            return;
          }
          const c = src.charCodeAt(pos);
          if (c === quote) {
            this.finishValue(pos);
            this.pos = pos + 1;
            this.state = S_AFTER_ATTR_VALUE_QUOTED;
            return;
          }
          if (c === 38) {
            this.pos = pos + 1;
            const r = this.charRef(true);
            if (r !== null) {
              this.appendValue(r, pos);
              pos = this.pos;
            } else {
              pos++;
            }
            continue;
          }
          if (c === 0) {
            this.pos = pos + 1;
            this.appendValue("�", pos);
          }
          pos++;
        }
      }

      // https://html.spec.whatwg.org/#attribute-value-(unquoted)-state
      case S_ATTR_VALUE_UNQUOTED: {
        let pos = this.pos;
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.eofInTag();
            return;
          }
          const c = src.charCodeAt(pos);
          if (isWs(c)) {
            this.finishValue(pos);
            this.pos = pos + 1;
            this.state = S_BEFORE_ATTR_NAME;
            return;
          }
          if (c === 62) {
            this.finishValue(pos);
            this.pos = pos + 1;
            this.emitTag();
            return;
          }
          if (c === 38) {
            this.pos = pos + 1;
            const r = this.charRef(true);
            if (r !== null) {
              this.appendValue(r, pos);
              pos = this.pos;
            } else {
              pos++;
            }
            continue;
          }
          if (c === 0) {
            this.pos = pos + 1;
            this.appendValue("�", pos);
          }
          pos++;
        }
      }

      // https://html.spec.whatwg.org/#after-attribute-value-(quoted)-state
      case S_AFTER_ATTR_VALUE_QUOTED: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (isWs(c)) {
          this.pos++;
          this.state = S_BEFORE_ATTR_NAME;
        } else if (c === 47) {
          this.pos++;
          this.state = S_SELF_CLOSING_START_TAG;
        } else if (c === 62) {
          this.pos++;
          this.emitTag();
        } else if (c === -1) {
          this.eofInTag();
        } else {
          this.state = S_BEFORE_ATTR_NAME;
        }
        return;
      }

      // https://html.spec.whatwg.org/#self-closing-start-tag-state
      case S_SELF_CLOSING_START_TAG: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 62) {
          this.pos++;
          this.selfClosing = true;
          this.emitTag();
        } else if (c === -1) {
          this.eofInTag();
        } else {
          this.state = S_BEFORE_ATTR_NAME;
        }
        return;
      }

      // https://html.spec.whatwg.org/#bogus-comment-state
      case S_BOGUS_COMMENT: {
        const pos = this.pos;
        let end = src.indexOf(">", pos);
        if (end < 0) end = len;
        let d = src.slice(pos, end);
        if (d.indexOf("\0") >= 0) d = d.replaceAll("\0", "�");
        this.data += d;
        this.pos = end < len ? end + 1 : len;
        this.emit(TK_COMMENT, this.tagStart);
        this.state = S_DATA;
        return;
      }

      // https://html.spec.whatwg.org/#markup-declaration-open-state
      case S_MARKUP_DECLARATION_OPEN: {
        // Hand the tree builder the text before "<!" first: `allowCDATA` must reflect it.
        if (this.emitTextNow(this.tagStart)) return;
        const pos = this.pos;
        if (pos + 1 < len && src.charCodeAt(pos) === 45 && src.charCodeAt(pos + 1) === 45) {
          this.pos = pos + 2;
          this.data = "";
          this.state = S_COMMENT_START;
        } else if (ciMatch(src, pos, "doctype")) {
          this.pos = pos + 7;
          this.state = S_DOCTYPE;
        } else if (src.startsWith("[CDATA[", pos)) {
          this.pos = pos + 7;
          if (this.allowCDATA) {
            this.state = S_CDATA_SECTION;
          } else {
            // cdata-in-html-content
            this.data = "[CDATA[";
            this.state = S_BOGUS_COMMENT;
          }
        } else {
          // incorrectly-opened-comment
          this.data = "";
          this.state = S_BOGUS_COMMENT;
        }
        return;
      }

      // https://html.spec.whatwg.org/#comment-start-state
      case S_COMMENT_START: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 45) {
          this.pos++;
          this.state = S_COMMENT_START_DASH;
        } else if (c === 62) {
          this.pos++;
          this.emitComment();
        } else {
          this.state = S_COMMENT;
        }
        return;
      }

      case S_COMMENT_START_DASH: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 45) {
          this.pos++;
          this.state = S_COMMENT_END;
        } else if (c === 62) {
          this.pos++;
          this.emitComment();
        } else if (c === -1) {
          this.emitComment();
        } else {
          this.data += "-";
          this.state = S_COMMENT;
        }
        return;
      }

      // https://html.spec.whatwg.org/#comment-state
      case S_COMMENT: {
        let pos = this.pos;
        const start = pos;
        while (pos < len) {
          const c = src.charCodeAt(pos);
          if (c === 60 || c === 45 || c === 0) break;
          pos++;
        }
        if (pos > start) this.data += src.slice(start, pos);
        this.pos = pos;
        if (pos >= len) {
          this.emitComment();
          return;
        }
        const c = src.charCodeAt(pos);
        this.pos++;
        if (c === 60) {
          this.data += "<";
          this.state = S_COMMENT_LT;
        } else if (c === 45) {
          this.state = S_COMMENT_END_DASH;
        } else {
          this.data += "�";
        }
        return;
      }

      case S_COMMENT_LT: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 33) {
          this.pos++;
          this.data += "!";
          this.state = S_COMMENT_LT_BANG;
        } else if (c === 60) {
          this.pos++;
          this.data += "<";
        } else {
          this.state = S_COMMENT;
        }
        return;
      }

      case S_COMMENT_LT_BANG: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 45) {
          this.pos++;
          this.state = S_COMMENT_LT_BANG_DASH;
        } else {
          this.state = S_COMMENT;
        }
        return;
      }

      case S_COMMENT_LT_BANG_DASH: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 45) {
          this.pos++;
          this.state = S_COMMENT_LT_BANG_DASH_DASH;
        } else {
          this.state = S_COMMENT_END_DASH;
        }
        return;
      }

      case S_COMMENT_LT_BANG_DASH_DASH:
        // ">" / EOF → comment end state; anything else is a nested-comment parse error, same transition.
        this.state = S_COMMENT_END;
        return;

      case S_COMMENT_END_DASH: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 45) {
          this.pos++;
          this.state = S_COMMENT_END;
        } else if (c === -1) {
          this.emitComment();
        } else {
          this.data += "-";
          this.state = S_COMMENT;
        }
        return;
      }

      // https://html.spec.whatwg.org/#comment-end-state
      case S_COMMENT_END: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 62) {
          this.pos++;
          this.emitComment();
        } else if (c === 33) {
          this.pos++;
          this.state = S_COMMENT_END_BANG;
        } else if (c === 45) {
          this.pos++;
          this.data += "-";
        } else if (c === -1) {
          this.emitComment();
        } else {
          this.data += "--";
          this.state = S_COMMENT;
        }
        return;
      }

      case S_COMMENT_END_BANG: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === 45) {
          this.pos++;
          this.data += "--!";
          this.state = S_COMMENT_END_DASH;
        } else if (c === 62) {
          this.pos++;
          this.emitComment();
        } else if (c === -1) {
          this.emitComment();
        } else {
          this.data += "--!";
          this.state = S_COMMENT;
        }
        return;
      }

      // https://html.spec.whatwg.org/#doctype-state
      case S_DOCTYPE: {
        this.name = "";
        this.hasName = false;
        this.publicId = "";
        this.hasPublicId = false;
        this.systemId = "";
        this.hasSystemId = false;
        this.forceQuirks = false;
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (isWs(c)) {
          this.pos++;
          this.state = S_BEFORE_DOCTYPE_NAME;
        } else if (c === -1) {
          this.forceQuirks = true;
          this.emitDoctype();
        } else {
          // missing-whitespace-before-doctype-name
          this.state = S_BEFORE_DOCTYPE_NAME;
        }
        return;
      }

      case S_BEFORE_DOCTYPE_NAME: {
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        const c = pos < len ? src.charCodeAt(pos) : -1;
        if (c === -1) {
          this.forceQuirks = true;
          this.emitDoctype();
        } else if (c === 62) {
          this.pos++;
          this.forceQuirks = true;
          this.emitDoctype();
        } else {
          this.hasName = true;
          this.name = "";
          this.state = S_DOCTYPE_NAME;
        }
        return;
      }

      case S_DOCTYPE_NAME: {
        let pos = this.pos;
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.forceQuirks = true;
            this.emitDoctype();
            return;
          }
          const c = src.charCodeAt(pos);
          if (isWs(c)) {
            this.pos = pos + 1;
            this.state = S_AFTER_DOCTYPE_NAME;
            return;
          }
          if (c === 62) {
            this.pos = pos + 1;
            this.emitDoctype();
            return;
          }
          if (c >= 65 && c <= 90) this.name += String.fromCharCode(c + 32);
          else if (c === 0) this.name += "�";
          else this.name += src[pos];
          pos++;
        }
      }

      case S_AFTER_DOCTYPE_NAME: {
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        const c = pos < len ? src.charCodeAt(pos) : -1;
        if (c === -1) {
          this.forceQuirks = true;
          this.emitDoctype();
        } else if (c === 62) {
          this.pos++;
          this.emitDoctype();
        } else if (ciMatch(src, pos, "public")) {
          this.pos += 6;
          this.state = S_AFTER_DOCTYPE_PUBLIC_KEYWORD;
        } else if (ciMatch(src, pos, "system")) {
          this.pos += 6;
          this.state = S_AFTER_DOCTYPE_SYSTEM_KEYWORD;
        } else {
          // invalid-character-sequence-after-doctype-name
          this.forceQuirks = true;
          this.state = S_BOGUS_DOCTYPE;
        }
        return;
      }

      case S_AFTER_DOCTYPE_PUBLIC_KEYWORD:
      case S_AFTER_DOCTYPE_SYSTEM_KEYWORD: {
        const isPublic = this.state === S_AFTER_DOCTYPE_PUBLIC_KEYWORD;
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (isWs(c)) {
          this.pos++;
          this.state = isPublic ? S_BEFORE_DOCTYPE_PUBLIC_ID : S_BEFORE_DOCTYPE_SYSTEM_ID;
        } else if (c === 34 || c === 39) {
          // missing-whitespace-after-doctype-*-keyword
          this.pos++;
          this.startDoctypeId(isPublic, c);
        } else if (c === 62) {
          this.pos++;
          this.forceQuirks = true;
          this.emitDoctype();
        } else if (c === -1) {
          this.forceQuirks = true;
          this.emitDoctype();
        } else {
          this.forceQuirks = true;
          this.state = S_BOGUS_DOCTYPE;
        }
        return;
      }

      case S_BEFORE_DOCTYPE_PUBLIC_ID:
      case S_BEFORE_DOCTYPE_SYSTEM_ID: {
        const isPublic = this.state === S_BEFORE_DOCTYPE_PUBLIC_ID;
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        const c = pos < len ? src.charCodeAt(pos) : -1;
        if (c === 34 || c === 39) {
          this.pos++;
          this.startDoctypeId(isPublic, c);
        } else if (c === 62) {
          this.pos++;
          this.forceQuirks = true;
          this.emitDoctype();
        } else if (c === -1) {
          this.forceQuirks = true;
          this.emitDoctype();
        } else {
          this.forceQuirks = true;
          this.state = S_BOGUS_DOCTYPE;
        }
        return;
      }

      case S_DOCTYPE_PUBLIC_ID_DQ:
      case S_DOCTYPE_PUBLIC_ID_SQ:
      case S_DOCTYPE_SYSTEM_ID_DQ:
      case S_DOCTYPE_SYSTEM_ID_SQ: {
        const st = this.state;
        const isPublic = st === S_DOCTYPE_PUBLIC_ID_DQ || st === S_DOCTYPE_PUBLIC_ID_SQ;
        const quote = st === S_DOCTYPE_PUBLIC_ID_DQ || st === S_DOCTYPE_SYSTEM_ID_DQ ? 34 : 39;
        let pos = this.pos;
        let acc = "";
        for (;;) {
          if (pos >= len) {
            this.pos = pos;
            this.appendDoctypeId(isPublic, acc);
            this.forceQuirks = true;
            this.emitDoctype();
            return;
          }
          const c = src.charCodeAt(pos);
          if (c === quote) {
            this.pos = pos + 1;
            this.appendDoctypeId(isPublic, acc);
            this.state = isPublic ? S_AFTER_DOCTYPE_PUBLIC_ID : S_AFTER_DOCTYPE_SYSTEM_ID;
            return;
          }
          if (c === 62) {
            // abrupt-doctype-*-identifier
            this.pos = pos + 1;
            this.appendDoctypeId(isPublic, acc);
            this.forceQuirks = true;
            this.emitDoctype();
            return;
          }
          acc += c === 0 ? "�" : src[pos];
          pos++;
        }
      }

      case S_AFTER_DOCTYPE_PUBLIC_ID:
      case S_BETWEEN_DOCTYPE_IDS: {
        const between = this.state === S_BETWEEN_DOCTYPE_IDS;
        let pos = this.pos;
        if (between) {
          while (pos < len && isWs(src.charCodeAt(pos))) pos++;
          this.pos = pos;
        }
        const c = pos < len ? src.charCodeAt(pos) : -1;
        if (!between && isWs(c)) {
          this.pos++;
          this.state = S_BETWEEN_DOCTYPE_IDS;
        } else if (c === 62) {
          this.pos++;
          this.emitDoctype();
        } else if (c === 34 || c === 39) {
          this.pos++;
          this.startDoctypeId(false, c);
        } else if (c === -1) {
          this.forceQuirks = true;
          this.emitDoctype();
        } else {
          this.forceQuirks = true;
          this.state = S_BOGUS_DOCTYPE;
        }
        return;
      }

      case S_AFTER_DOCTYPE_SYSTEM_ID: {
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        const c = pos < len ? src.charCodeAt(pos) : -1;
        if (c === 62) {
          this.pos++;
          this.emitDoctype();
        } else if (c === -1) {
          this.forceQuirks = true;
          this.emitDoctype();
        } else {
          // unexpected-character-after-doctype-system-identifier (does NOT set force-quirks)
          this.state = S_BOGUS_DOCTYPE;
        }
        return;
      }

      // https://html.spec.whatwg.org/#bogus-doctype-state
      case S_BOGUS_DOCTYPE: {
        const end = src.indexOf(">", this.pos);
        this.pos = end < 0 ? len : end + 1;
        this.emitDoctype();
        return;
      }

      // https://html.spec.whatwg.org/#cdata-section-state
      case S_CDATA_SECTION: {
        const pos = this.pos;
        let end = src.indexOf("]]>", pos);
        if (end < 0) end = len;
        if (end > pos) {
          this.startRun(pos);
          if (src.indexOf("\0", pos) >= 0 && src.indexOf("\0", pos) < end) this.textHasNull = true;
          this.flushRaw(end);
        }
        if (end >= len) {
          this.pos = len;
          this.emit(TK_EOF, len);
          return;
        }
        this.pos = end + 3;
        this.state = S_DATA;
        return;
      }

      // https://html.spec.whatwg.org/#processing-instruction-open-state
      case S_PI_OPEN: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (isAsciiAlpha(c) || c === 95) {
          this.state = S_PI_TARGET;
        } else if (c === -1) {
          this.flushRaw(this.tagStart);
          this.state = S_DATA;
        } else {
          this.data = "?" + this.tempBuf;
          this.state = S_BOGUS_COMMENT;
        }
        return;
      }

      case S_PI_TARGET: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (isWs(c) || c === 63 || c === 62) {
          const target = this.tempBuf;
          const lowerTarget = fixName(target);
          if (lowerTarget === "xml" || lowerTarget === "xml-stylesheet") {
            this.data = "?" + target;
            this.state = S_BOGUS_COMMENT;
          } else {
            this.name = target;
            this.data = "";
            this.state = S_AFTER_PI_TARGET;
          }
        } else if (isAsciiAlnum(c) || c === 45 || c === 95) {
          this.tempBuf += src[this.pos];
          this.pos++;
        } else if (c === -1) {
          this.flushRaw(this.tagStart);
          this.state = S_DATA;
        } else {
          this.data = "?" + this.tempBuf;
          this.state = S_BOGUS_COMMENT;
        }
        return;
      }

      case S_AFTER_PI_TARGET: {
        let pos = this.pos;
        while (pos < len && isWs(src.charCodeAt(pos))) pos++;
        this.pos = pos;
        this.state = S_PI_DATA;
        return;
      }

      case S_PI_DATA:
      case S_PI_QUESTIONABLE: {
        const c = this.pos < len ? src.charCodeAt(this.pos) : -1;
        if (c === -1) {
          this.flushRaw(this.tagStart);
          this.state = S_DATA;
          return;
        }
        if (this.state === S_PI_QUESTIONABLE) {
          if (c === 62) {
            this.pos++;
            this.emit(TK_PI, this.tagStart);
            this.state = S_DATA;
            return;
          }
          this.data += "?";
          this.state = S_PI_DATA;
          return;
        }
        this.pos++;
        if (c === 63) this.state = S_PI_QUESTIONABLE;
        else if (c === 62) {
          this.emit(TK_PI, this.tagStart);
          this.state = S_DATA;
        } else this.data += src[this.pos - 1];
        return;
      }

      default:
        throw new Error("unknown tokenizer state " + String(this.state));
    }
  }

  private emitComment(): void {
    this.emit(TK_COMMENT, this.tagStart);
    this.state = S_DATA;
  }

  private emitDoctype(): void {
    this.emit(TK_DOCTYPE, this.tagStart);
    this.state = S_DATA;
  }

  private startDoctypeId(isPublic: boolean, quote: number): void {
    if (isPublic) {
      this.publicId = "";
      this.hasPublicId = true;
      this.state = quote === 34 ? S_DOCTYPE_PUBLIC_ID_DQ : S_DOCTYPE_PUBLIC_ID_SQ;
    } else {
      this.systemId = "";
      this.hasSystemId = true;
      this.state = quote === 34 ? S_DOCTYPE_SYSTEM_ID_DQ : S_DOCTYPE_SYSTEM_ID_SQ;
    }
  }

  private appendDoctypeId(isPublic: boolean, s: string): void {
    if (isPublic) this.publicId += s;
    else this.systemId += s;
  }
}

/** Number of tag names the tokenizer interns (exported for tests). */
export const INTERNED_TAG_COUNT = TAG_COUNT;

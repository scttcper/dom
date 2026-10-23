// @scriptc-compatible
// Library entry compiled by scripts/build.ts (scriptc library mode) into rtd-native.node, and run
// as plain JS by the native-vs-JS benchmark. Same source both ways, so the comparison measures
// the compiler + boundary, not two implementations.
//
// Only string / f64 parameters and results cross the Node-API boundary, so the pure modules'
// object APIs (pull tokenizers, selector AST) are wrapped in functions that return either a
// checksum (pure compute, the native lower bound) or a serialized result string (what a real
// caller needs, including marshaling).

import {
  Tokenizer,
  TK_EOF,
  TK_CHARS,
  TK_START,
  TK_END,
  TK_COMMENT,
  TK_DOCTYPE,
} from "../../../dom/src/parser/tokenizer.ts";
import { CSSTokenizer, TK_EOF as CSS_EOF } from "../../../dom/src/css/tokenizer.ts";
import { SelectorParser, SelectorList } from "../../../dom/src/selectors/parser.ts";
import {
  matchNamedReference,
  matchedLength,
  entityValue,
  numericReferenceValue,
} from "../../../dom/src/parser/entities.ts";

const html = new Tokenizer();

function mix(h: number, x: number): number {
  return (Math.imul(h, 31) + x) | 0;
}

function strHash(h: number, s: string): number {
  let r = mix(h, s.length);
  if (s.length > 0) r = mix(r, s.charCodeAt(0));
  return r;
}

/** Tokenize an HTML document; checksum over token types, names, attribute counts and text lengths. */
export function htmlChecksum(src: string): number {
  html.reset(src);
  let h = 0;
  let count = 0;
  for (;;) {
    const t = html.next();
    if (t === TK_EOF) break;
    count++;
    h = mix(h, t);
    if (t === TK_START) {
      h = strHash(h, html.name);
      h = mix(h, html.attrCount);
      for (let i = 0; i < html.attrCount; i++) {
        h = strHash(h, html.attrNames[i]);
        h = strHash(h, html.attrValues[i]);
      }
    } else if (t === TK_END) {
      h = strHash(h, html.name);
    } else if (t === TK_CHARS) {
      h = strHash(h, html.text);
    } else if (t === TK_COMMENT) {
      h = strHash(h, html.data);
    } else if (t === TK_DOCTYPE) {
      h = strHash(h, html.name);
    }
  }
  html.release();
  return count * 65536 + (h & 0xffff);
}

/**
 * Tokenize an HTML document into a serialized token stream: records separated by \u0001,
 * fields by \u0002 — `type, name, text|data, attrName, attrValue, …`. What a JS tree builder
 * would have to decode if the tokenizer ran natively.
 */
export function htmlTokens(src: string): string {
  html.reset(src);
  const parts: string[] = [];
  for (;;) {
    const t = html.next();
    if (t === TK_EOF) break;
    let rec = String(t);
    if (t === TK_START) {
      rec += "\u0002" + html.name;
      for (let i = 0; i < html.attrCount; i++) rec += "\u0002" + html.attrNames[i] + "\u0002" + html.attrValues[i];
    } else if (t === TK_END || t === TK_DOCTYPE) {
      rec += "\u0002" + html.name;
    } else if (t === TK_CHARS) {
      rec += "\u0002" + html.text;
    } else if (t === TK_COMMENT) {
      rec += "\u0002" + html.data;
    }
    parts.push(rec);
  }
  html.release();
  return parts.join("\u0001");
}

/** Tokenize a stylesheet; checksum over token types and value lengths. */
export function cssChecksum(src: string): number {
  const tok = new CSSTokenizer(src);
  let h = 0;
  let count = 0;
  for (;;) {
    const t = tok.next();
    if (t === CSS_EOF) break;
    count++;
    h = mix(h, t);
    h = mix(h, tok.end - tok.start);
  }
  return count * 65536 + (h & 0xffff);
}

function listChecksum(list: SelectorList, h: number): number {
  let r = mix(h, list.items.length);
  for (let i = 0; i < list.items.length; i++) {
    const cx = list.items[i];
    r = mix(r, cx.compounds.length);
    for (let j = 0; j < cx.compounds.length; j++) {
      const simples = cx.compounds[j].simples;
      for (let k = 0; k < simples.length; k++) {
        const s = simples[k];
        r = mix(r, s.kind);
        r = strHash(r, s.name);
        r = mix(r, s.pseudo);
        const sub = s.list;
        if (sub !== null) r = listChecksum(sub, r);
      }
    }
  }
  return r;
}

/** Parse one selector list; checksum of its AST, or -1 when invalid. */
export function selectorChecksum(sel: string): number {
  const p = new SelectorParser(sel);
  const list = p.parseSelectorList();
  if (list === null) return -1;
  return listChecksum(list, 0) & 0x7fffffff;
}

/** Parse many selectors (separated by \n) in one call; sum of checksums. */
export function selectorBatchChecksum(sels: string): number {
  let total = 0;
  let start = 0;
  const len = sels.length;
  while (start <= len) {
    let end = sels.indexOf("\n", start);
    if (end < 0) end = len;
    if (end > start) total = (total + selectorChecksum(sels.slice(start, end))) % 1000000007;
    start = end + 1;
  }
  return total;
}

function isAlnum(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/**
 * Decode character references in text (as in attribute values / text, ignoring the
 * attribute-specific legacy rule): `&name;`, `&#123;`, `&#x7B;`.
 * https://html.spec.whatwg.org/#character-reference-state
 */
export function decodeEntities(s: string): string {
  let amp = s.indexOf("&");
  if (amp < 0) return s;
  let out = "";
  let last = 0;
  const len = s.length;
  while (amp >= 0) {
    out += s.slice(last, amp);
    let i = amp + 1;
    let replaced = false;
    if (i < len && s.charCodeAt(i) === 35) {
      // numeric
      i++;
      let hex = false;
      if (i < len && (s.charCodeAt(i) === 120 || s.charCodeAt(i) === 88)) {
        hex = true;
        i++;
      }
      let code = 0;
      const digitsStart = i;
      while (i < len) {
        const c = s.charCodeAt(i);
        let d = -1;
        if (c >= 48 && c <= 57) d = c - 48;
        else if (hex && c >= 97 && c <= 102) d = c - 87;
        else if (hex && c >= 65 && c <= 70) d = c - 55;
        if (d < 0) break;
        code = code * (hex ? 16 : 10) + d;
        if (code > 0x10ffff) code = 0x110000;
        i++;
      }
      if (i > digitsStart) {
        if (i < len && s.charCodeAt(i) === 59) i++;
        out += numericReferenceValue(code);
        replaced = true;
      }
    } else if (i < len && isAlnum(s.charCodeAt(i))) {
      const idx = matchNamedReference(s, i);
      if (idx >= 0) {
        out += entityValue(idx);
        i += matchedLength();
        replaced = true;
      }
    }
    if (replaced) {
      last = i;
    } else {
      out += "&";
      last = amp + 1;
    }
    amp = s.indexOf("&", last);
  }
  return out + s.slice(last);
}

/** Empty call: measures the boundary itself. */
export function noop(x: number): number {
  return x + 1;
}

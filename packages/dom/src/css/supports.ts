// @supports conditions and CSS.supports().
// https://drafts.csswg.org/css-conditional-3/#at-supports
// https://drafts.csswg.org/css-conditional-4/#at-supports-ext (selector())
// https://drafts.csswg.org/css-conditional-5/#at-supports-ext (font-tech(), font-format())

import {
  CSSTokenizer,
  TK_COLON,
  TK_EOF,
  TK_FUNCTION,
  TK_IDENT,
  TK_LPAREN,
  TK_RPAREN,
  TK_WHITESPACE,
  TK_LBRACKET,
  TK_RBRACKET,
} from "./tokenizer.ts";
import { DeclBlock } from "./declarations.ts";
import { isCustomPropertyName } from "./properties.ts";
import { isSupportedSelector } from "../selectors/internal.ts";

/** https://drafts.csswg.org/css-conditional-3/#dom-css-supports — property/value form. */
export function supportsDeclaration(property: string, value: string): boolean {
  const p = isCustomPropertyName(property) ? property : property.toLowerCase();
  if (isCustomPropertyName(p)) return value.trim() !== "" || true;
  const block = new DeclBlock();
  return block.setValue(p, value, false, false);
}

class Cursor {
  src: string;
  t: CSSTokenizer;
  type: number;
  constructor(src: string) {
    this.src = src;
    this.t = new CSSTokenizer(src);
    this.type = TK_EOF;
    this.next();
  }
  next(): void {
    do this.type = this.t.next();
    while (this.type === TK_WHITESPACE);
  }
  /** Consumes a balanced block whose opener is the current token; returns the inner text. */
  block(): string | null {
    const start = this.t.end;
    let depth = 1;
    let end = start;
    while (depth > 0) {
      const type = this.t.next();
      if (type === TK_EOF) return null;
      if (type === TK_LPAREN || type === TK_FUNCTION || type === TK_LBRACKET) depth++;
      else if (type === TK_RPAREN || type === TK_RBRACKET) {
        depth--;
        end = this.t.start;
      }
    }
    this.next();
    return this.src.slice(start, end);
  }
}

/** Kleene result: 1 true, 0 false, -1 parse failure. */
function condition(c: Cursor): number {
  if (c.type === TK_IDENT && c.t.value.toLowerCase() === "not") {
    c.next();
    const v = inParens(c);
    return v === -1 ? -1 : 1 - v;
  }
  let v = inParens(c);
  if (v === -1) return -1;
  if (c.type !== TK_IDENT) return v;
  const op = c.t.value.toLowerCase();
  if (op !== "and" && op !== "or") return -1;
  while (c.type === TK_IDENT && c.t.value.toLowerCase() === op) {
    c.next();
    const w = inParens(c);
    if (w === -1) return -1;
    v = op === "and" ? v & w : v | w;
  }
  if (c.type === TK_IDENT) return -1;
  return v;
}

function inParens(c: Cursor): number {
  if (c.type === TK_FUNCTION) {
    const name = c.t.value.toLowerCase();
    const inner = c.block();
    if (inner === null) return -1;
    if (name === "selector") return isSupportedSelector(inner.trim()) ? 1 : 0;
    if (name === "font-tech" || name === "font-format") return 0;
    return 0; // <general-enclosed>
  }
  if (c.type !== TK_LPAREN) return -1;
  const inner = c.block();
  if (inner === null) return -1;
  // ( <supports-condition> ) or ( <declaration> )
  const sub = new Cursor(inner);
  const isNested =
    sub.type === TK_LPAREN ||
    sub.type === TK_FUNCTION ||
    (sub.type === TK_IDENT && sub.t.value.toLowerCase() === "not");
  if (isNested) {
    const v = condition(sub);
    if (v !== -1 && sub.type === TK_EOF) return v;
  }
  return declaration(inner);
}

function declaration(text: string): number {
  const t = new CSSTokenizer(text);
  let type = t.next();
  while (type === TK_WHITESPACE) type = t.next();
  if (type !== TK_IDENT) return 0;
  const name = t.value;
  type = t.next();
  while (type === TK_WHITESPACE) type = t.next();
  if (type !== TK_COLON) return 0;
  let value = text.slice(t.end).trim();
  const imp = /!\s*important\s*$/i.exec(value);
  if (imp !== null) value = value.slice(0, imp.index).trim();
  return supportsDeclaration(name, value) ? 1 : 0;
}

/** https://drafts.csswg.org/css-conditional-3/#dom-css-supports-conditiontext */
export function evaluateSupportsCondition(text: string): boolean {
  const c = new Cursor(text);
  const v = condition(c);
  if (v !== -1 && c.type === TK_EOF) return v === 1;
  // CSS.supports("display: flex") without parens is accepted as a declaration.
  return declaration(text) === 1;
}

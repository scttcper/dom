// Selector text helpers the CSSOM needs on top of the selector engine (src/selectors/internal.ts
// provides parsing, specificity, bucketing keys and matching): selector list splitting and
// CSS Nesting resolution (the engine does not parse `&`).
// https://drafts.csswg.org/css-nesting-1/#nest-selector

import { CSSTokenizer, TK_COMMA, TK_DELIM, TK_EOF, TK_FUNCTION, TK_LBRACKET, TK_LPAREN, TK_RBRACKET, TK_RPAREN } from "./tokenizer.ts";

/** Splits a selector list on top-level commas (trimmed parts). */
export function splitSelectorList(text: string): string[] {
  const out: string[] = [];
  const t = new CSSTokenizer(text);
  let depth = 0;
  let start = 0;
  while (true) {
    const type = t.next();
    if (type === TK_EOF) break;
    if (type === TK_FUNCTION || type === TK_LPAREN || type === TK_LBRACKET) depth++;
    else if (type === TK_RPAREN || type === TK_RBRACKET) depth--;
    else if (type === TK_COMMA && depth === 0) {
      out.push(text.slice(start, t.start).trim());
      start = t.end;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

/** Does a (nested) selector contain the nesting selector `&` at any level? */
export function containsNesting(text: string): boolean {
  if (text.indexOf("&") === -1) return false;
  const t = new CSSTokenizer(text);
  while (true) {
    const type = t.next();
    if (type === TK_EOF) return false;
    if (type === TK_DELIM && t.value === "&") return true;
  }
}

/**
 * Resolves a nested style rule's selector list against its parent's resolved selector list
 * (https://drafts.csswg.org/css-nesting-1/#nest-selector). `&` is replaced by the parent
 * selector (as `:is(...)` when the parent list has more than one selector); selectors without
 * `&` are relative to the parent (`& ` prepended, keeping a leading combinator).
 */
export function resolveNested(child: string, parents: string[]): string[] {
  const out: string[] = [];
  const parentText = parents.length === 1 ? parents[0] : ":is(" + parents.join(", ") + ")";
  for (const raw of splitSelectorList(child)) {
    if (raw === "") continue;
    let sel = raw;
    // A relative selector (optionally starting with a combinator) is relative to the parent.
    if (!containsNesting(sel)) sel = "& " + sel;
    if (parents.length === 1 || parentText.length === 0) {
      out.push(replaceNesting(sel, parentText));
    } else {
      // Expand into one selector per parent so engines without :is() still match.
      for (const p of parents) out.push(replaceNesting(sel, p));
    }
  }
  return out;
}

function replaceNesting(sel: string, parent: string): string {
  const t = new CSSTokenizer(sel);
  let out = "";
  let last = 0;
  while (true) {
    const type = t.next();
    if (type === TK_EOF) break;
    if (type === TK_DELIM && t.value === "&") {
      out += sel.slice(last, t.start) + parent;
      last = t.end;
    }
  }
  return out + sel.slice(last);
}

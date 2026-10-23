// @scriptc-compatible
//
// Selector serialization (CSSStyleRule.selectorText and friends).
// https://drafts.csswg.org/cssom/#serialize-a-selector
// https://drafts.csswg.org/cssom/#common-serializing-idioms

import {
  type Complex,
  type Compound,
  type Simple,
  type SelectorList,
  S_TYPE, S_UNIVERSAL, S_ID, S_CLASS, S_ATTR, S_PSEUDO_CLASS, S_PSEUDO_ELEMENT,
  NS_ANY, NS_NONE, NS_PREFIX,
  OP_EQUALS, OP_INCLUDES, OP_DASH, OP_PREFIX, OP_SUFFIX, OP_SUBSTRING,
  CASE_INSENSITIVE, CASE_SENSITIVE,
  C_DESCENDANT, C_CHILD, C_NEXT_SIBLING, C_SUBSEQUENT_SIBLING, C_NONE,
  P_NTH_CHILD, P_NTH_LAST_CHILD, P_NTH_OF_TYPE, P_NTH_LAST_OF_TYPE, P_LANG, P_DIR, P_STATE, P_HEADING,
  PE_PART,
} from "./parser.ts";

function hex(c: number): string {
  return c.toString(16);
}

/** https://drafts.csswg.org/cssom/#serialize-an-identifier */
export function serializeIdentifier(s: string): string {
  let out = "";
  const len = s.length;
  const first = len > 0 ? s.charCodeAt(0) : -1;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) {
      out += "�";
    } else if ((c >= 0x01 && c <= 0x1f) || c === 0x7f) {
      out += "\\" + hex(c) + " ";
    } else if (i === 0 && c >= 0x30 && c <= 0x39) {
      out += "\\" + hex(c) + " ";
    } else if (i === 1 && c >= 0x30 && c <= 0x39 && first === 0x2d) {
      out += "\\" + hex(c) + " ";
    } else if (i === 0 && c === 0x2d && len === 1) {
      out += "\\-";
    } else if (c >= 0x80 || c === 0x2d || c === 0x5f || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      out += s[i];
    } else {
      out += "\\" + s[i];
    }
  }
  return out;
}

/** https://drafts.csswg.org/cssom/#serialize-a-string */
export function serializeString(s: string): string {
  let out = "\"";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) out += "�";
    else if ((c >= 0x01 && c <= 0x1f) || c === 0x7f) out += "\\" + hex(c) + " ";
    else if (c === 0x22 || c === 0x5c) out += "\\" + s[i];
    else out += s[i];
  }
  return out + "\"";
}

/** https://drafts.csswg.org/css-syntax-3/#serializing-anb */
export function serializeAnPlusB(a: number, b: number): string {
  if (a === 0) return String(b);
  let out = a === 1 ? "n" : a === -1 ? "-n" : String(a) + "n";
  if (b > 0) out += "+" + String(b);
  else if (b < 0) out += String(b);
  return out;
}

/** @namespace context of the style sheet whose selector is being serialized (null: none declared). */
export interface NamespaceContext {
  namespaces?: ReadonlyMap<string, string | null>;
  defaultNamespace?: string | null;
}

let nsContext: NamespaceContext | null = null;

/** Run `fn` with a style sheet's @namespace context for type/universal selector serialization. */
export function withNamespaceContext<T>(ctx: NamespaceContext | null | undefined, fn: () => T): T {
  const saved = nsContext;
  nsContext = ctx ?? null;
  try {
    return fn();
  } finally {
    nsContext = saved;
  }
}

function hasDefaultNamespace(): boolean {
  return nsContext !== null && nsContext.defaultNamespace !== undefined;
}

/**
 * https://drafts.csswg.org/cssom/#serialize-a-simple-selector (type / universal selector):
 * `*|` is only significant when a default namespace is declared, and a prefix that maps to
 * the default namespace is omitted.
 */
function serializeNamespace(s: Simple): string {
  switch (s.nsKind) {
    case NS_ANY:
      return hasDefaultNamespace() ? "*|" : "";
    case NS_NONE:
      return "|";
    case NS_PREFIX:
      if (prefixIsDefault(s.nsPrefix)) return "";
      return serializeIdentifier(s.nsPrefix) + "|";
  }
  return "";
}

function prefixIsDefault(prefix: string): boolean {
  if (!hasDefaultNamespace() || nsContext!.namespaces === undefined) return false;
  const uri = nsContext!.namespaces.get(prefix);
  return uri !== undefined && uri === nsContext!.defaultNamespace;
}

function attrOp(op: number): string {
  switch (op) {
    case OP_EQUALS: return "=";
    case OP_INCLUDES: return "~=";
    case OP_DASH: return "|=";
    case OP_PREFIX: return "^=";
    case OP_SUFFIX: return "$=";
    case OP_SUBSTRING: return "*=";
  }
  return "";
}

function joinArgs(args: string[], sep: string, idents: boolean): string {
  let out = "";
  for (let i = 0; i < args.length; i++) {
    if (i > 0) out += sep;
    out += idents ? serializeIdentifier(args[i]) : args[i];
  }
  return out;
}

function serializeSimple(s: Simple): string {
  switch (s.kind) {
    case S_TYPE:
      return serializeNamespace(s) + serializeIdentifier(s.name);
    case S_UNIVERSAL:
      return serializeNamespace(s) + "*";
    case S_ID:
      return "#" + serializeIdentifier(s.name);
    case S_CLASS:
      return "." + serializeIdentifier(s.name);
    case S_ATTR: {
      let out = "[";
      if (s.nsKind === NS_ANY) out += "*|";
      else if (s.nsKind === NS_PREFIX) out += serializeIdentifier(s.nsPrefix) + "|";
      out += serializeIdentifier(s.name);
      if (s.op !== 0) {
        out += attrOp(s.op) + serializeString(s.value);
        if (s.caseFlag === CASE_INSENSITIVE) out += " i";
        else if (s.caseFlag === CASE_SENSITIVE) out += " s";
      }
      return out + "]";
    }
    case S_PSEUDO_CLASS: {
      const p = s.pseudo;
      if (p === P_NTH_CHILD || p === P_NTH_LAST_CHILD || p === P_NTH_OF_TYPE || p === P_NTH_LAST_OF_TYPE) {
        let out = ":" + s.name + "(" + serializeAnPlusB(s.a, s.b);
        if (s.list !== null) out += " of " + serializeSelectorList(s.list);
        return out + ")";
      }
      if (p === P_LANG) {
        let out = ":" + s.name + "(";
        for (let i = 0; i < s.args.length; i++) {
          if (i > 0) out += ", ";
          out += needsString(s.args[i]) ? serializeString(s.args[i]) : serializeIdentifier(s.args[i]);
        }
        return out + ")";
      }
      if (p === P_DIR || p === P_STATE) return ":" + s.name + "(" + serializeIdentifier(s.args[0]) + ")";
      if (p === P_HEADING) {
        if (s.args.length === 0) return ":heading";
        return ":heading(" + joinArgs(s.args, ", ", false) + ")";
      }
      if (s.list !== null) return ":" + s.name + "(" + serializeSelectorList(s.list) + ")";
      return ":" + s.name;
    }
    case S_PSEUDO_ELEMENT: {
      if (s.list !== null) return "::" + s.name + "(" + serializeSelectorList(s.list) + ")";
      if (s.pseudo === PE_PART || s.args.length !== 0) return "::" + s.name + "(" + joinArgs(s.args, " ", true) + ")";
      return "::" + s.name;
    }
  }
  return "";
}

/** A language range that is not a valid identifier (e.g. "*-CH") serializes as a string. */
function needsString(v: string): boolean {
  if (v.length === 0) return true;
  const c = v.charCodeAt(0);
  return c === 0x2a || (c >= 0x30 && c <= 0x39);
}

/** https://drafts.csswg.org/cssom/#serialize-a-simple-selector (compound: universal omitted when other simples follow). */
export function serializeCompound(c: Compound): string {
  let out = "";
  const n = c.simples.length;
  for (let i = 0; i < n; i++) {
    const s = c.simples[i];
    if (i === 0 && n > 1 && s.kind === S_UNIVERSAL && ((s.nsKind === NS_ANY && !hasDefaultNamespace()) || s.nsKind === 0 || (s.nsKind === NS_PREFIX && prefixIsDefault(s.nsPrefix)))) continue;
    out += serializeSimple(s);
  }
  return out;
}

function combinator(c: number): string {
  switch (c) {
    case C_DESCENDANT: return " ";
    case C_CHILD: return " > ";
    case C_NEXT_SIBLING: return " + ";
    case C_SUBSEQUENT_SIBLING: return " ~ ";
  }
  return " ";
}

/** https://drafts.csswg.org/cssom/#serialize-a-selector */
export function serializeComplex(cx: Complex): string {
  if (cx.invalid) return cx.text;
  let out = "";
  if (cx.leading !== C_NONE && cx.leading !== C_DESCENDANT) out += combinator(cx.leading).slice(1);
  for (let i = 0; i < cx.compounds.length; i++) {
    if (i > 0) out += combinator(cx.combinators[i - 1]);
    out += serializeCompound(cx.compounds[i]);
  }
  return out;
}

/** https://drafts.csswg.org/cssom/#serialize-a-group-of-selectors */
export function serializeSelectorList(list: SelectorList): string {
  let out = "";
  for (let i = 0; i < list.items.length; i++) {
    if (i > 0) out += ", ";
    out += serializeComplex(list.items[i]);
  }
  return out;
}

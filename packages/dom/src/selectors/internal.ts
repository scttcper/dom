// Internal selector API for other areas (css cascade, testing-library, user-event, html).
//
// https://drafts.csswg.org/selectors-4/#specificity-rules
// https://drafts.csswg.org/selectors-4/#match-a-selector-against-a-pseudo-element
//
// For the css agent: compile a rule's selector list once with `compileSelectorList`, bucket each
// `CompiledSelector` by `keyKind`/`key` (the subject compound's id, else first class, else
// lowercased tag; look elements up with `el.id`, `classTokens(el)`, `asciiLowercase(el.name)`),
// sort by `specificity` (a packed number: compare numerically), and test candidates with
// `matchesSelector(sel, el, pseudoElement?)`.

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { SelectorParser } from "./parser.ts";
import { serializeSelectorList, withNamespaceContext, type NamespaceContext } from "./serialize.ts";
import {
  type CComplex,
  CompileInfo,
  compileComplex,
  matchComplex,
  setScope,
  setHostContext,
  resetMemos,
  subjectKey,
  unpackSpecificity,
  packSpecificity,
  KEY_NONE,
  KEY_ID,
  KEY_CLASS,
  KEY_TAG,
  matchFeaturelessHost,
} from "./compile.ts";
import { $cx, $info } from "../keys.ts";

export { KEY_NONE, KEY_ID, KEY_CLASS, KEY_TAG, packSpecificity, unpackSpecificity };
export { querySelectorAllImpls, isValidSelector, clearSelectorCaches } from "./index.ts";
export { setHoverTarget, setActiveTarget, setPseudoClassPredicate, interaction, type Predicate } from "./state.ts";

/** One complex selector of a compiled list. */
export class CompiledSelector {
  /** Source text of this complex selector (trimmed). */
  readonly text: string;
  /** Packed specificity: a * 2^20 + b * 2^10 + c (each saturating at 1023). Compare numerically. */
  readonly specificity: number;
  /** KEY_ID / KEY_CLASS / KEY_TAG / KEY_NONE (universal or pseudo-class-only subject). */
  readonly keyKind: number;
  /** The id, class name, or lowercased tag name for `keyKind`; "" for KEY_NONE. */
  readonly key: string;
  /** Subject pseudo-element without colons ("before", "part::before", ...), or "" for elements. */
  readonly pseudoElement: string;
  /** Depends on state not covered by Document._version (focus, hover, checkedness, values, ...). */
  readonly volatile: boolean;
  /** @internal */
  readonly [$cx]: CComplex;
  /** @internal */
  readonly [$info]: CompileInfo;

  constructor(cx: CComplex, info: CompileInfo) {
    this.text = cx.text;
    this.specificity = cx.specificity;
    const key = subjectKey(cx);
    this.keyKind = key.kind;
    this.key = key.value;
    this.pseudoElement = cx.pseudoElement;
    this.volatile = info.volatile;
    this[$cx] = cx;
    this[$info] = info;
  }

  /** Specificity as an (a, b, c) tuple. */
  get specificityTuple(): [number, number, number] {
    return unpackSpecificity(this.specificity);
  }
}

export interface CompiledSelectorList {
  readonly text: string;
  /** CSSOM serialization (https://drafts.csswg.org/cssom/#serialize-a-group-of-selectors), for selectorText. */
  readonly serialized: string;
  readonly selectors: readonly CompiledSelector[];
}

export interface CompileOptions {
  /** @namespace prefixes declared in the style sheet (prefix → URI; null URI = no namespace). */
  namespaces?: ReadonlyMap<string, string | null>;
  /** The style sheet's default namespace (`@namespace url(...)`), if any. */
  defaultNamespace?: string | null;
}

/**
 * Parse and compile a selector list (e.g. a style rule's prelude). Returns null when the list is
 * invalid (https://drafts.csswg.org/css-syntax-3/#style-rules — the whole rule is dropped).
 */
export function compileSelectorList(text: string, options?: CompileOptions): CompiledSelectorList | null {
  const parser = new SelectorParser(text);
  const ast = parser.parseSelectorList();
  if (ast === null) return null;
  const selectors: CompiledSelector[] = [];
  for (let i = 0; i < ast.items.length; i++) {
    // One CompileInfo per complex so `volatile` is per selector.
    const info = new CompileInfo();
    if (options?.namespaces !== undefined) {
      const ns = options.namespaces;
      info.resolve = (prefix) => (ns.has(prefix) ? ns.get(prefix)! : undefined);
    }
    if (options !== undefined && "defaultNamespace" in options) info.defaultNs = options.defaultNamespace;
    const cx = compileComplex(ast.items[i], info);
    if (info.error !== "") return null;
    selectors.push(new CompiledSelector(cx, info));
  }
  return { text, serialized: serializeSelectorList(ast), selectors };
}

/**
 * `@supports selector(<complex-selector>)` / `CSS.supports("selector(...)")`
 * (https://drafts.csswg.org/css-conditional-4/#support-definition-ext): the selector parses
 * and compiles without relying on forgiving parsing (no :is()/:where() item was dropped).
 */
export function isSupportedSelector(text: string): boolean {
  const ast = new SelectorParser(text).parseSelectorList();
  if (ast === null) return false;
  for (let i = 0; i < ast.items.length; i++) {
    const info = new CompileInfo();
    compileComplex(ast.items[i], info);
    if (info.error !== "" || info.forgivingDropped) return false;
  }
  return true;
}

/** CSSOM serialization of a selector list, or null if it is invalid. */
export function serializeSelector(text: string, namespaces?: NamespaceContext): string | null {
  const ast = new SelectorParser(text).parseSelectorList();
  if (ast === null) return null;
  return namespaces === undefined ? serializeSelectorList(ast) : withNamespaceContext(namespaces, () => serializeSelectorList(ast));
}

export interface MatchOptions {
  /** :scope element (default: none, so :scope matches nothing... per css, :scope = :root in style rules). */
  scope?: NodeImpl | null;
  /** When matching rules from a shadow tree's style sheets: that tree's host (enables :host, :host(), :host-context()). */
  shadowHost?: NodeImpl | null;
}

/** Strip leading colons: "::before" / ":before" / "before" → "before". */
function normalizePseudo(p: string): string {
  let i = 0;
  while (i < p.length && p.charCodeAt(i) === 0x3a) i++;
  return i === 0 ? p : p.slice(i);
}

/**
 * Whether `sel` matches `el` (or, with `pseudoElement`, that pseudo-element of `el`).
 * A selector with a pseudo-element only matches when the same pseudo-element is requested.
 */
export function matchesSelector(sel: CompiledSelector, el: NodeImpl, pseudoElement?: string | null, options?: MatchOptions): boolean {
  const want = pseudoElement === undefined || pseudoElement === null || pseudoElement === "" ? "" : normalizePseudo(pseudoElement);
  if (sel.pseudoElement !== want) return false;
  const prevScope = setScope(options?.scope ?? null);
  const prevHost = options?.shadowHost !== undefined ? setHostContext(options.shadowHost) : null;
  try {
    // The host itself is featureless for its shadow tree's rules.
    if (options?.shadowHost !== undefined && options.shadowHost === el) return matchFeaturelessHost(sel[$cx], el);
    return matchComplex(sel[$cx], el);
  } finally {
    setScope(prevScope);
    if (options?.shadowHost !== undefined) setHostContext(prevHost);
    if (sel[$info].nthTests.length !== 0) resetMemos(sel[$info]);
  }
}

/** Whether any selector of the list matches. */
export function matchesSelectorList(list: CompiledSelectorList, el: NodeImpl, pseudoElement?: string | null, options?: MatchOptions): boolean {
  const s = list.selectors;
  for (let i = 0; i < s.length; i++) if (matchesSelector(s[i], el, pseudoElement, options)) return true;
  return false;
}

/** Highest specificity among the selectors of `list` that match `el` (-1 when none match). */
export function matchingSpecificity(list: CompiledSelectorList, el: NodeImpl, pseudoElement?: string | null, options?: MatchOptions): number {
  let best = -1;
  const s = list.selectors;
  for (let i = 0; i < s.length; i++) {
    if (s[i].specificity > best && matchesSelector(s[i], el, pseudoElement, options)) best = s[i].specificity;
  }
  return best;
}

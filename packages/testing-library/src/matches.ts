// Port of @testing-library/dom src/matches.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/matches.ts

export type MatcherFunction = (content: string, element: any) => boolean;
export type Matcher = MatcherFunction | RegExp | number | string;
export type NormalizerFn = (text: string) => string;

export interface DefaultNormalizerOptions {
  trim?: boolean;
  collapseWhitespace?: boolean;
}

export interface NormalizerOptions extends DefaultNormalizerOptions {
  normalizer?: NormalizerFn;
}

export interface MatcherOptions {
  exact?: boolean;
  trim?: boolean;
  collapseWhitespace?: boolean;
  normalizer?: NormalizerFn;
  suggest?: boolean;
}

export type MatchFn = (
  textToMatch: string | null,
  node: any,
  matcher: Matcher | null,
  normalizer: NormalizerFn,
) => boolean;

function assertNotNullOrUndefined<T>(matcher: T): asserts matcher is NonNullable<T> {
  if (matcher === null || matcher === undefined) {
    throw new Error(
      `It looks like ${matcher} was passed instead of a matcher. Did you do something like getByText(${matcher})?`,
    );
  }
}

export function fuzzyMatches(
  textToMatch: string | null,
  node: any,
  matcher: Matcher | null,
  normalizer: NormalizerFn,
): boolean {
  if (typeof textToMatch !== "string") {
    return false;
  }
  assertNotNullOrUndefined(matcher);

  const normalizedText = normalizer(textToMatch);

  if (typeof matcher === "string" || typeof matcher === "number") {
    return normalizedText.toLowerCase().includes(matcher.toString().toLowerCase());
  } else if (typeof matcher === "function") {
    return matcher(normalizedText, node);
  } else {
    return matchRegExp(matcher, normalizedText);
  }
}

export function matches(
  textToMatch: string | null,
  node: any,
  matcher: Matcher | null,
  normalizer: NormalizerFn,
): boolean {
  if (typeof textToMatch !== "string") {
    return false;
  }
  assertNotNullOrUndefined(matcher);

  const normalizedText = normalizer(textToMatch);
  if (matcher instanceof Function) {
    return matcher(normalizedText, node);
  } else if (matcher instanceof RegExp) {
    return matchRegExp(matcher, normalizedText);
  } else {
    return normalizedText === String(matcher);
  }
}

/**
 * Whether code unit `c` is matched by the RegExp `\s` class, which is also the set
 * `String.prototype.trim` removes (https://tc39.es/ecma262/#sec-compiletocharset — WhiteSpace
 * and LineTerminator).
 */
function isRegExpWhitespace(c: number): boolean {
  if (c <= 0x20) return c === 0x20 || (c >= 0x09 && c <= 0x0d);
  if (c < 0xa0) return false;
  return (
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

/**
 * Whether `trim()` and/or `replace(/\s+/g, " ")` would change `s`. When not, the default
 * normalizer returns its input as is: text like "Row 12 label" (single spaces, nothing to trim)
 * is the common case, and the two passes would allocate two new strings per candidate node.
 */
function changedByNormalizing(s: string, trim: boolean, collapse: boolean): boolean {
  const last = s.length - 1;
  let prevWhitespace = false;
  for (let i = 0; i <= last; i++) {
    const c = s.charCodeAt(i);
    const ws = isRegExpWhitespace(c);
    if (ws) {
      if (trim && (i === 0 || i === last)) return true;
      if (collapse && (prevWhitespace || c !== 0x20)) return true;
    }
    prevWhitespace = ws;
  }
  return false;
}

const WHITESPACE_RUN = /\s+/g;

export function getDefaultNormalizer({
  trim = true,
  collapseWhitespace = true,
}: DefaultNormalizerOptions = {}): NormalizerFn {
  return (text) => {
    if (!changedByNormalizing(text, trim, collapseWhitespace)) return text;
    let normalizedText = text;
    normalizedText = trim ? normalizedText.trim() : normalizedText;
    normalizedText = collapseWhitespace ? normalizedText.replace(WHITESPACE_RUN, " ") : normalizedText;
    return normalizedText;
  };
}

const defaultNormalizer = getDefaultNormalizer();

/**
 * `matches` (or `fuzzyMatches` when not `exact`) bound to one query's matcher and normalizer.
 * Ours: queries call it for every candidate element, so the common case, an exact string matcher
 * with the default normalizer, rejects most candidates without normalizing them. Normalizing only
 * removes whitespace (trims, then collapses each run to one space), so a text shorter than the
 * matcher cannot match, nor one whose first or last character is not whitespace and differs from
 * the matcher's; and a matcher the normalizer would change matches nothing.
 */
export function textMatcher(
  exact: boolean,
  matcher: Matcher,
  normalizer: NormalizerFn,
): (textToMatch: string | null, node: any) => boolean {
  if (!exact) return (textToMatch, node) => fuzzyMatches(textToMatch, node, matcher, normalizer);
  if (normalizer !== defaultNormalizer || (typeof matcher !== "string" && typeof matcher !== "number"))
    return (textToMatch, node) => matches(textToMatch, node, matcher, normalizer);
  const m = String(matcher);
  if (changedByNormalizing(m, true, true)) return () => false;
  const length = m.length;
  const first = m.charCodeAt(0);
  const last = m.charCodeAt(length - 1);
  return (textToMatch) => {
    if (typeof textToMatch !== "string" || textToMatch.length < length) return false;
    if (length !== 0) {
      const c0 = textToMatch.charCodeAt(0);
      if (c0 !== first && !isRegExpWhitespace(c0)) return false;
      const cl = textToMatch.charCodeAt(textToMatch.length - 1);
      if (cl !== last && !isRegExpWhitespace(cl)) return false;
    }
    return defaultNormalizer(textToMatch) === m;
  };
}

/**
 * Constructs a normalizer to pass to functions in matches.ts
 * @param trim The user-specified value for `trim`, without any defaulting having been applied
 * @param collapseWhitespace The user-specified value for `collapseWhitespace`, without any defaulting having been applied
 * @param normalizer The user-specified normalizer
 */
export function makeNormalizer({ trim, collapseWhitespace, normalizer }: NormalizerOptions): NormalizerFn {
  if (!normalizer) {
    // No custom normalizer specified. Just use default.
    if (trim === undefined && collapseWhitespace === undefined) return defaultNormalizer;
    return getDefaultNormalizer({ trim, collapseWhitespace });
  }

  if (typeof trim !== "undefined" || typeof collapseWhitespace !== "undefined") {
    // They've also specified a value for trim or collapseWhitespace
    throw new Error(
      "trim and collapseWhitespace are not supported with a normalizer. " +
        "If you want to use the default trim and collapseWhitespace logic in your normalizer, " +
        'use "getDefaultNormalizer({trim, collapseWhitespace})" and compose that into your normalizer',
    );
  }

  return normalizer;
}

function matchRegExp(matcher: RegExp, text: string): boolean {
  const match = matcher.test(text);
  if (matcher.global && matcher.lastIndex !== 0) {
    console.warn(
      `To match all elements we had to reset the lastIndex of the RegExp because the global flag is enabled. We encourage to remove the global flag from the RegExp.`,
    );
    matcher.lastIndex = 0;
  }
  return match;
}

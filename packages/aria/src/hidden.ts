// Accessibility tree exclusion as Testing Library 10.4 / dom-accessibility-api implement it.
//
// Spec: https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion (partial: `hidden`,
// `aria-hidden="true"`, `display: none` exclude the subtree; computed `visibility: hidden`
// excludes the element). "Children Presentational" is ignored, like upstream.
// Ported from @testing-library/dom role-helpers.js and
// https://github.com/eps1lon/dom-accessibility-api/blob/main/sources/is-inaccessible.ts

import { ELEMENT_NODE, HTML_NS, attr, nodeCache, type NodeCache, type NodeImpl } from "@rtd/dom/internal";
import type { Element } from "@rtd/dom";
import { isDisplayNone, isVisibilityHidden } from "./style.ts";
import type { GetComputedStyle } from "./accname.ts";
import { implOf } from "./tree.ts";
import { $styleVersion, $version, $window, getComputedStyleOverride } from "@rtd/dom/internal";

/**
 * Subtree exclusion for one element: `element.hidden === true` (HTMLElement only),
 * `aria-hidden="true"`, or computed `display: none`.
 */
export function isSubtreeInaccessibleImpl(impl: NodeImpl): boolean {
  if (impl.ns === HTML_NS && attr(impl, "hidden") !== null) return true;
  if (attr(impl, "aria-hidden") === "true") return true;
  return isDisplayNone(impl);
}

const CHAIN_HIDDEN = 1;

/**
 * Whether `impl` or any ancestor element (`parentElement` chain) is subtree-inaccessible.
 * Memoized per element, stamped with `Document._version` + `_styleVersion`, so one query
 * reuses an ancestor's answer across all its descendants and repeated queries over an
 * unchanged document are O(1) per element.
 */
function chainInaccessible(impl: NodeImpl, version: number, styleVersion: number): boolean {
  const c = impl.cache as NodeCache | null;
  if (c !== null && c.ariaHiddenVersion === version && c.ariaHiddenStyleVersion === styleVersion) {
    return (c.ariaHiddenBits & CHAIN_HIDDEN) !== 0;
  }
  let hidden = isSubtreeInaccessibleImpl(impl);
  if (!hidden) {
    const p = impl.parent;
    if (p !== null && p.type === ELEMENT_NODE) hidden = chainInaccessible(p, version, styleVersion);
  }
  const cache = c ?? nodeCache(impl);
  cache.ariaHiddenVersion = version;
  cache.ariaHiddenStyleVersion = styleVersion;
  cache.ariaHiddenBits = hidden ? CHAIN_HIDDEN : 0;
  return hidden;
}

/** Testing Library's `isInaccessible(element)` with the default subtree check. */
export function isInaccessibleImpl(impl: NodeImpl): boolean {
  // since visibility is inherited we can exit early
  if (isVisibilityHidden(impl)) return true;
  const doc = impl.doc;
  return chainInaccessible(impl, doc[$version], doc[$styleVersion]);
}

/**
 * Testing Library's `isInaccessible(element, { isSubtreeInaccessible: cachedIsSubtreeInaccessible })`
 * while the window's `getComputedStyle` is user-replaced (`getComputedStyleOverride`): every
 * style read goes through `gcs` exactly where role-helpers.js calls
 * `window.getComputedStyle(element)` — `visibility` of the element, then `display` per
 * ancestor. `memo` plays upstream's per-query `subtreeIsInaccessibleCache` (pass null for a
 * one-off call). Nothing is cached on the nodes: the replacement's answers are not versioned.
 */
export function isInaccessibleWithStyle(impl: NodeImpl, gcs: GetComputedStyle, memo: Map<NodeImpl, boolean> | null): boolean {
  // since visibility is inherited we can exit early
  if (gcs(impl.node as unknown as Element).visibility === "hidden") return true;
  for (let cur: NodeImpl | null = impl; cur !== null && cur.type === ELEMENT_NODE; cur = cur.parent) {
    let hidden = memo !== null ? memo.get(cur) : undefined;
    if (hidden === undefined) {
      hidden = isSubtreeInaccessibleWithStyle(cur, gcs);
      if (memo !== null) memo.set(cur, hidden);
    }
    if (hidden) return true;
  }
  return false;
}

/** role-helpers.js `isSubtreeInaccessible` reading `display` through `gcs`. */
function isSubtreeInaccessibleWithStyle(impl: NodeImpl, gcs: GetComputedStyle): boolean {
  if (impl.ns === HTML_NS && attr(impl, "hidden") !== null) return true;
  if (attr(impl, "aria-hidden") === "true") return true;
  return gcs(impl.node as unknown as Element).display === "none";
}

// --- public, dom-accessibility-api / Testing Library compatible ---------------------------

export interface IsSubtreeInaccessibleOptions {
  getComputedStyle?: GetComputedStyle | null;
}

export interface IsInaccessibleOptions {
  getComputedStyle?: GetComputedStyle | null;
  /** Can be used to return cached results from previous isSubtreeInaccessible calls. */
  isSubtreeInaccessible?: (element: Element) => boolean;
}

const NO_WINDOW = "Owner document of the element needs to have an associated window.";

function checkGetComputedStyle(impl: NodeImpl, options: IsSubtreeInaccessibleOptions | undefined): GetComputedStyle | null {
  if (options !== undefined && "getComputedStyle" in options && options.getComputedStyle !== undefined) {
    const gcs = options.getComputedStyle;
    if (typeof gcs !== "function") throw new TypeError(NO_WINDOW);
    return gcs;
  }
  if ((impl.doc as unknown as { [$window]: unknown })[$window] === null) throw new TypeError(NO_WINDOW);
  // Default: `element.ownerDocument.defaultView.getComputedStyle`; only a user-replaced one
  // leaves the fast path.
  return getComputedStyleOverride(impl);
}

/**
 * @returns `true` if every child of the element is inaccessible
 * https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion
 */
export function isSubtreeInaccessible(element: Element, options?: IsSubtreeInaccessibleOptions): boolean {
  const impl = implOf(element);
  const gcs = checkGetComputedStyle(impl, options);
  if (gcs === null) return isSubtreeInaccessibleImpl(impl);
  if (impl.ns === HTML_NS && attr(impl, "hidden") !== null) return true;
  if (attr(impl, "aria-hidden") === "true") return true;
  return gcs(element).display === "none";
}

/**
 * Partial implementation of https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion which should
 * only be used for elements with a non-presentational role. Implements aria-hidden
 * semantics (parent overrides child); ignores "Children Presentational: True".
 */
export function isInaccessible(element: Element, options?: IsInaccessibleOptions): boolean {
  const impl = implOf(element);
  const gcs = checkGetComputedStyle(impl, options);
  const custom = options?.isSubtreeInaccessible;
  if (gcs === null && custom === undefined) return isInaccessibleImpl(impl);
  // Slow path: user-supplied getComputedStyle and/or subtree check.
  if (gcs !== null ? gcs(element).visibility === "hidden" : isVisibilityHidden(impl)) return true;
  for (let cur: NodeImpl | null = impl; cur !== null && cur.type === ELEMENT_NODE; cur = cur.parent) {
    const el = cur.node as unknown as Element;
    const hidden =
      custom !== undefined
        ? custom(el)
        : gcs !== null
          ? isSubtreeInaccessible(el, { getComputedStyle: gcs })
          : isSubtreeInaccessibleImpl(cur);
    if (hidden) return true;
  }
  return false;
}

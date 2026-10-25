// Focus.
// https://html.spec.whatwg.org/#focus
//
// Entry points (used by HTMLElement.focus()/blur(), user-event's tab(), selectors):
//   isFocusable(impl)            — https://html.spec.whatwg.org/#focusable-area
//   focusElement(impl, options)  — https://html.spec.whatwg.org/#focusing-steps
//   blurElement(impl)            — https://html.spec.whatwg.org/#unfocusing-steps
//   sequentialFocusOrder(root)   — https://html.spec.whatwg.org/#sequential-focus-navigation
//   matchesFocus / matchesFocusWithin / matchesFocusVisible — :focus, :focus-within, :focus-visible
//
// State: the focused element is `Document._focused` (an impl, null = the viewport, i.e.
// activeElement is the body). The core clears it when the focused element is removed
// (https://html.spec.whatwg.org/#focus-fixup-rule).
//
// Event order follows the focus update steps (https://html.spec.whatwg.org/#focus-update-steps):
// blur → focusout on the old element (relatedTarget = new), then focus → focusin on the new
// one (relatedTarget = old). As in browsers and jsdom, `document.activeElement` is the body
// while blur/focusout run.

import {
  ELEMENT_NODE,
  F_CONNECTED,
  F_SHADOW_ROOT,
  HTML_NS,
  SVG_NS,
  MATHML_NS,
  DOCUMENT_FRAGMENT_NODE,
  XLINK_NS,
} from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import { T } from "../nodes/tags.ts";
import { nextInTree, treeRoot } from "../nodes/traverse.ts";
import { contentAttr, parseInteger } from "./reflect.ts";
import { fireFocusEvent } from "./events.ts";
import { isActuallyDisabled } from "./forms/form-associated.ts";
import { isEditingHost, isRenderingHidden } from "./shared.ts";
import { inertByModal, setTopLayerFocusHooks } from "./top-layer.ts";
import { frameContentWindow } from "../window/browsing-context.ts";
import { setRenderingUpdateHook } from "../window/Window.ts";
import { $focused, $frameElement, $host, $impl, $shadowRoot, $window } from "../keys.ts";

// --- predicates ---------------------------------------------------------------------------

/** Parsed `tabindex` (https://html.spec.whatwg.org/#attr-tabindex), or NaN when absent/invalid. */
export function tabIndexValue(impl: NodeImpl): number {
  const v = contentAttr(impl, "tabindex");
  if (v === null) return NaN;
  const n = parseInteger(v);
  return n >= -2147483648 && n <= 2147483647 ? n : NaN;
}

/** https://html.spec.whatwg.org/#summary-for-its-parent-details */
export function isSummaryForParentDetails(impl: NodeImpl): boolean {
  const p = impl.parent;
  if (p === null || p.tag !== T.details || p.ns !== HTML_NS) return false;
  for (let c = p.first; c !== null; c = c.next) {
    if (c.type === ELEMENT_NODE && c.tag === T.summary && c.ns === HTML_NS) return c === impl;
  }
  return false;
}

/**
 * Whether the element would be focusable without a tabindex attribute (this UA's choice for the
 * "tabindex focus flag", https://html.spec.whatwg.org/#tabindex-focus-flag). Matches the elements
 * browsers and jsdom treat as focusable by default.
 */
function focusableByDefault(impl: NodeImpl): boolean {
  if (impl.ns === HTML_NS) {
    switch (impl.tag) {
      case T.a:
      case T.area:
        return contentAttr(impl, "href") !== null;
      case T.button:
      case T.select:
      case T.textarea:
      case T.iframe:
      case T.frame:
        return true;
      case T.input:
        return contentAttr(impl, "type")?.toLowerCase() !== "hidden";
      case T.summary:
        return isSummaryForParentDetails(impl);
      case T.audio:
      case T.video:
        return contentAttr(impl, "controls") !== null;
    }
    return isEditingHost(impl);
  }
  if (impl.ns === SVG_NS) {
    return impl.name === "a" && (contentAttr(impl, "href") !== null || hasXlinkHref(impl));
  }
  return false;
}

function hasXlinkHref(impl: NodeImpl): boolean {
  const attrs = impl.attrs;
  if (attrs === null) return false;
  for (let i = 0; i < attrs.length; i++) if (attrs[i].localName === "href" && attrs[i].ns === XLINK_NS) return true;
  return false;
}

/** Default value of the `tabIndex` IDL attribute (https://html.spec.whatwg.org/#dom-tabindex). */
export function defaultTabIndex(impl: NodeImpl): number {
  if (impl.ns === HTML_NS) {
    switch (impl.tag) {
      case T.a:
      case T.area:
      case T.button:
      case T.frame:
      case T.iframe:
      case T.input:
      case T.object:
      case T.select:
      case T.textarea:
        return 0;
      case T.summary:
        return isSummaryForParentDetails(impl) ? 0 : -1;
    }
    return -1;
  }
  return impl.ns === SVG_NS && impl.name === "a" ? 0 : -1;
}

/** https://html.spec.whatwg.org/#inert — the element or a flat-tree ancestor has `inert`, or a modal dialog blocks it. */
export function isInert(impl: NodeImpl): boolean {
  for (let n: NodeImpl | null = impl; n !== null; n = parentOrHost(n)) {
    if (n.type === ELEMENT_NODE && contentAttr(n, "inert") !== null) return true;
  }
  return inertByModal(impl);
}

function parentOrHost(n: NodeImpl): NodeImpl | null {
  const p = n.parent;
  if (p !== null) return p;
  if ((n.flags & F_SHADOW_ROOT) !== 0) {
    const host = (n.node as unknown as { [$host]: Element | null })[$host];
    return host === null ? null : host[$impl];
  }
  return null;
}

/** Whether the element has its tabindex focus flag set (attribute or default). */
function hasTabIndexFocusFlag(impl: NodeImpl): boolean {
  if (!Number.isNaN(tabIndexValue(impl))) return impl.ns === HTML_NS || impl.ns === SVG_NS || impl.ns === MATHML_NS;
  return focusableByDefault(impl);
}

/**
 * https://html.spec.whatwg.org/#focusable-area — connected, tabindex focus flag set, not
 * actually disabled, not inert, and rendered (display:none is checked through the css area
 * when it is loaded; without a style engine every connected element counts as rendered, as in jsdom).
 */
export function isFocusable(impl: NodeImpl): boolean {
  if (impl.type !== ELEMENT_NODE || (impl.flags & F_CONNECTED) === 0) return false;
  if (!hasTabIndexFocusFlag(impl)) return false;
  if (isActuallyDisabled(impl)) return false;
  if (isInert(impl)) return false;
  return !isRenderingHidden(impl);
}

/** Focusable and reachable with Tab (https://html.spec.whatwg.org/#sequentially-focusable). */
export function isSequentiallyFocusable(impl: NodeImpl): boolean {
  if (!isFocusable(impl)) return false;
  const t = tabIndexValue(impl);
  return Number.isNaN(t) || t >= 0;
}

// --- focus delegates (shadow hosts with delegatesFocus) ------------------------------------

function shadowRootOf(impl: NodeImpl): { [$impl]: NodeImpl; delegatesFocus?: boolean } | null {
  return (
    (impl.node as unknown as { [$shadowRoot]: { [$impl]: NodeImpl; delegatesFocus?: boolean } | null })[$shadowRoot] ??
    null
  );
}

/**
 * https://html.spec.whatwg.org/#get-the-focusable-area for an element that is not a focusable
 * area. Only shadow hosts that delegate focus have one here (no image maps, scrollable regions
 * or navigables as focus targets).
 */
export function getFocusableArea(target: NodeImpl): NodeImpl | null {
  const shadow = shadowRootOf(target);
  if (shadow === null || !shadow.delegatesFocus) return null;
  // 1-2. Focus already inside the host stays where it is.
  const focused = target.doc[$focused];
  if (focused !== null && isShadowIncludingInclusiveAncestor(target, focused)) return focused;
  // 3.
  return focusDelegate(target);
}

/** https://html.spec.whatwg.org/#focus-delegate */
export function focusDelegate(focusTarget: NodeImpl): NodeImpl | null {
  // 1-3.
  const shadow = shadowRootOf(focusTarget);
  if (shadow !== null && !shadow.delegatesFocus) return null;
  const whereToLook = shadow !== null ? shadow[$impl] : focusTarget;
  // 4-5.
  const autofocus = autofocusDelegate(whereToLook);
  if (autofocus !== null) return autofocus;
  // 6. Descendants (not shadow-including: nested hosts recurse through get the focusable area).
  const isDialog = focusTarget.tag === T.dialog && focusTarget.ns === HTML_NS;
  for (let n = whereToLook.first; n !== null; n = nextInTree(n, whereToLook)) {
    if (n.type !== ELEMENT_NODE) continue;
    let area: NodeImpl | null;
    if (isDialog && isSequentiallyFocusable(n)) area = n;
    else if (!isDialog && isFocusable(n)) area = n;
    else area = getFocusableArea(n);
    if (area !== null) return area;
  }
  return null;
}

// --- focusing / unfocusing ----------------------------------------------------------------

export interface FocusElementOptions {
  preventScroll?: boolean;
  /** Override the :focus-visible heuristic (user-event passes false for pointer focus). */
  focusVisible?: boolean;
}

/** Whether the most recent focus should match :focus-visible. */
let focusVisibleFlag = true;

/**
 * https://html.spec.whatwg.org/#focusing-steps for an element. Returns true when `impl`
 * (or its focus delegate) is the focused area afterwards.
 */
export function focusElement(impl: NodeImpl, options?: FocusElementOptions): boolean {
  let target = impl;
  // 1-2. Not a focusable area: get the focusable area (shadow hosts with delegatesFocus forward
  // to their delegate). A rendered <dialog> can always be focused by the focusing steps
  // (https://github.com/whatwg/html/pull/8199; browsers and WPT agree), though it is not
  // sequentially focusable.
  if (target.tag === T.dialog && target.ns === HTML_NS && !isFocusable(target)) {
    if ((target.flags & F_CONNECTED) === 0 || isInert(target) || isRenderingHidden(target)) return false;
  } else if (!isFocusable(target)) {
    if ((target.flags & F_CONNECTED) === 0) return false;
    const d = getFocusableArea(target);
    if (d === null) return false;
    target = d;
  } else {
    const shadow = shadowRootOf(target);
    if (shadow !== null && shadow.delegatesFocus) {
      // A host whose shadow root delegates focus is never a focusable area itself, even with a
      // tabindex (https://html.spec.whatwg.org/#focusable-area, second criterion): focus goes to
      // its focus delegate (https://html.spec.whatwg.org/#get-the-focusable-area), or nowhere.
      // A focused element inside the host's shadow tree already satisfies focus().
      const current = target.doc[$focused];
      if (current !== null && isShadowIncludingInclusiveAncestor(target, current)) return true;
      const d = focusDelegate(target);
      if (d === null) return false;
      target = d;
    }
  }
  const doc = target.doc;
  // Nested documents: the focus chain includes the container <iframe> in each ancestor
  // document, so those become the focused areas of their documents first (outermost first,
  // as the focus update steps fire focus events in reverse new-chain order). Like jsdom, the
  // container gets no focus/focusin events (docs/deviations.md).
  focusContainerChain(doc);
  const old = doc[$focused];
  // 2. Already focused.
  if (old === target) return true;
  focusVisibleFlag = options?.focusVisible ?? !wasPointerFocus(target);
  runFocusUpdate(doc, old, target);
  return doc[$focused] === target;
}

/** The <iframe> element hosting `doc`'s browsing context, or null (top-level / no browsing context). */
function containerOf(doc: Document): NodeImpl | null {
  const window = doc[$window] as unknown as { [$frameElement]?: Element | null } | null;
  const frame = window?.[$frameElement] ?? null;
  return frame === null ? null : frame[$impl];
}

/** The active document of a frame element's nested browsing context, or null. */
function nestedDocument(frame: NodeImpl): Document | null {
  if (frame.tag !== T.iframe && frame.tag !== T.frame) return null;
  const w = frameContentWindow(frame.node as Element) as unknown as { document?: Document } | null;
  return w?.document ?? null;
}

/** https://html.spec.whatwg.org/#focus-chain — make each ancestor container the focused area of its document. */
function focusContainerChain(doc: Document): void {
  const frame = containerOf(doc);
  if (frame === null || (frame.flags & F_CONNECTED) === 0) return;
  const parentDoc = frame.doc;
  focusContainerChain(parentDoc);
  if (parentDoc[$focused] !== frame) runFocusUpdate(parentDoc, parentDoc[$focused], frame, false);
}

/** https://html.spec.whatwg.org/#unfocusing-steps */
export function blurElement(impl: NodeImpl): void {
  const doc = impl.doc;
  const focused = doc[$focused];
  if (focused === null) return;
  // The element must be the focused area or a shadow host containing it.
  if (focused !== impl && !isShadowIncludingInclusiveAncestor(impl, focused)) return;
  runFocusUpdate(doc, focused, null);
}

/**
 * https://html.spec.whatwg.org/#focus-update-steps (single document). `fireFocus` false skips
 * the focus/focusin events at `next` (a container entering the focus chain, as in jsdom).
 */
function runFocusUpdate(doc: Document, old: NodeImpl | null, next: NodeImpl | null, fireFocus = true): void {
  const view = doc[$window];
  if (old !== null) {
    // Leaving a container: the focused element of its nested document is unfocused first
    // (the old focus chain is ordered innermost first).
    const nested = nestedDocument(old);
    if (nested !== null && nested[$focused] !== null) runFocusUpdate(nested, nested[$focused], null);
    doc[$focused] = null;
    const oldNode = old.node as Element;
    const related = next === null ? null : (next.node as Element);
    fireFocusEvent(oldNode, "blur", related, false, view);
    fireFocusEvent(oldNode, "focusout", related, true, view);
    // A blur/focusout handler may have focused something else (or detached `next`).
    if (doc[$focused] !== null) return;
  }
  if (next === null) return;
  if ((next.flags & F_CONNECTED) === 0) return;
  doc[$focused] = next;
  if (!fireFocus) return;
  const nextNode = next.node as Element;
  const related = old === null ? null : (old.node as Element);
  fireFocusEvent(nextNode, "focus", related, false, view);
  if (doc[$focused] !== next) return;
  fireFocusEvent(nextNode, "focusin", related, true, view);
}

function isShadowIncludingInclusiveAncestor(ancestor: NodeImpl, node: NodeImpl): boolean {
  for (let n: NodeImpl | null = node; n !== null; n = parentOrHost(n)) if (n === ancestor) return true;
  return false;
}

// Pointer-initiated focus (user-event marks it) does not match :focus-visible, except on
// elements that support keyboard input (https://drafts.csswg.org/selectors-4/#the-focus-visible-pseudo).
let pointerFocusPending = false;

/** Called by user-event before a pointer-caused focus. */
export function notePointerFocus(): void {
  pointerFocusPending = true;
}

function wasPointerFocus(target: NodeImpl): boolean {
  if (!pointerFocusPending) return false;
  pointerFocusPending = false;
  return !(target.tag === T.textarea || target.tag === T.input || isEditingHost(target));
}

// --- DocumentOrShadowRoot.activeElement ---------------------------------------------------

/** https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement */
export function activeElement(root: NodeImpl): Element | null {
  const doc = root.doc;
  let candidate = doc[$focused];
  if (root.type === DOCUMENT_FRAGMENT_NODE) {
    // Shadow root: retarget the focused element against it.
    while (candidate !== null) {
      const r = treeRoot(candidate);
      if (r === root) return candidate.node as Element;
      if ((r.flags & F_SHADOW_ROOT) === 0) return null;
      candidate = parentOrHost(r);
    }
    return null;
  }
  if (candidate === null) {
    // No focused area: the body element, else the document element.
    const body = (doc as unknown as { body: Element | null }).body;
    return body ?? doc.documentElement;
  }
  for (;;) {
    const r = treeRoot(candidate);
    if ((r.flags & F_SHADOW_ROOT) === 0) break;
    const host = parentOrHost(r);
    if (host === null) break;
    candidate = host;
  }
  return candidate.node as Element;
}

/** https://html.spec.whatwg.org/#dom-document-hasfocus (no system focus model: true while an element is focused, as jsdom). */
export function documentHasFocus(doc: Document): boolean {
  return doc[$focused] !== null;
}

// --- selector predicates ------------------------------------------------------------------

/** :focus — https://html.spec.whatwg.org/#selector-focus (shadow hosts match when focus is inside their shadow tree). */
export function matchesFocus(impl: NodeImpl): boolean {
  const f = impl.doc[$focused];
  if (f === null) return false;
  if (f === impl) return true;
  if (shadowRootOf(impl) === null) return false;
  for (let n: NodeImpl | null = f; n !== null;) {
    const r = treeRoot(n);
    if ((r.flags & F_SHADOW_ROOT) === 0) return false;
    n = parentOrHost(r);
    if (n === impl) return true;
  }
  return false;
}

/** :focus-within — https://drafts.csswg.org/selectors-4/#the-focus-within-pseudo */
export function matchesFocusWithin(impl: NodeImpl): boolean {
  const f = impl.doc[$focused];
  return f !== null && isShadowIncludingInclusiveAncestor(impl, f);
}

/** :focus-visible — https://drafts.csswg.org/selectors-4/#the-focus-visible-pseudo (heuristic). */
export function matchesFocusVisible(impl: NodeImpl): boolean {
  return impl.doc[$focused] === impl && focusVisibleFlag;
}

// --- sequential focus navigation ----------------------------------------------------------

/**
 * https://html.spec.whatwg.org/#sequential-focus-navigation-order — the sequentially focusable
 * elements under `root` in Tab order: positive tabindex values ascending (tree order for
 * ties), then tabindex 0 / default-focusable elements in tree order. Each shadow tree forms its
 * own scope at its host's position (https://html.spec.whatwg.org/#focus-navigation-scope-owner).
 */
export function sequentialFocusOrder(root: { [$impl]: NodeImpl } | NodeImpl): Element[] {
  const r = $impl in root ? root[$impl] : root;
  const out: Element[] = [];
  appendScope(r, out);
  return out;
}

function appendScope(scope: NodeImpl, out: Element[]): void {
  const positive: [number, NodeImpl][] = [];
  const zero: NodeImpl[] = [];
  for (let n = scope.first; n !== null; n = nextInTree(n, scope)) {
    if (n.type !== ELEMENT_NODE) continue;
    const t = tabIndexValue(n);
    const shadow = shadowRootOf(n);
    const focusable = isFocusable(n);
    if (shadow !== null) {
      // The host takes the scope's position; its shadow tree follows it in order.
      if (focusable && t > 0) positive.push([t, n]);
      else if (Number.isNaN(t) || t >= 0) zero.push(n);
      continue;
    }
    if (!focusable || t < 0) continue;
    if (t > 0) positive.push([t, n]);
    else zero.push(n);
  }
  positive.sort((a, b) => a[0] - b[0]);
  for (const [, n] of positive) appendOne(n, out);
  for (const n of zero) appendOne(n, out);
}

function appendOne(n: NodeImpl, out: Element[]): void {
  const shadow = shadowRootOf(n);
  if (shadow === null) {
    out.push(n.node as Element);
    return;
  }
  const t = tabIndexValue(n);
  if (isFocusable(n) && !shadow.delegatesFocus && (Number.isNaN(t) || t >= 0)) out.push(n.node as Element);
  if (Number.isNaN(t) || t >= 0) appendScope(shadow[$impl], out);
}

/** https://html.spec.whatwg.org/#autofocus-delegate (focus trigger "other"). */
export function autofocusDelegate(root: NodeImpl): NodeImpl | null {
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type !== ELEMENT_NODE || contentAttr(n, "autofocus") === null) continue;
    const area = isFocusable(n) ? n : getFocusableArea(n);
    if (area !== null) return area;
  }
  return null;
}

/**
 * The focus fixup step of https://html.spec.whatwg.org/#update-the-rendering: a focused element
 * that stopped being a focusable area (inert, disabled, hidden) loses focus to the viewport,
 * with blur/focusout, on the next animation frame. (Removal is handled synchronously by the
 * node layer, without events.)
 */
function focusFixup(doc: Document): void {
  const focused = doc[$focused];
  if (focused === null || isFocusable(focused)) return;
  if (
    focused.tag === T.dialog &&
    focused.ns === HTML_NS &&
    (focused.flags & F_CONNECTED) !== 0 &&
    !isInert(focused) &&
    !isRenderingHidden(focused)
  )
    return;
  runFocusUpdate(doc, focused, null);
}

setRenderingUpdateHook(focusFixup as (doc: unknown) => void);

setTopLayerFocusHooks((el) => {
  focusElement(el);
}, autofocusDelegate);

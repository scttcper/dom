// Top layer state: modal dialogs and popovers.
// https://html.spec.whatwg.org/#top-layer (CSS Positioned Layout 4 "top layer")
// https://html.spec.whatwg.org/#the-popover-attribute
//
// Per-document state lives in a WeakMap so documents that never open a dialog/popover pay
// nothing. Popover show/hide follow the HTML algorithms minus light dismiss (no pointer or
// close-watcher integration: clicking outside / pressing Escape does not hide popovers; see
// docs/deviations.md).

import { F_CONNECTED, F_SHADOW_ROOT, HTML_NS } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import { T } from "../nodes/tags.ts";
import { contentAttr } from "./reflect.ts";
import { fireToggleEvent, queueTask } from "./events.ts";
import { $focused, $host, $impl } from "../keys.ts";

interface TopLayerState {
  /** Elements in the top layer, bottom to top. */
  layer: NodeImpl[];
  /** Modal dialogs (subset of `layer`). */
  modals: NodeImpl[];
  /** https://html.spec.whatwg.org/#showing-auto-popover-list */
  autoPopovers: NodeImpl[];
}

const states = new WeakMap<Document, TopLayerState>();

function state(doc: Document): TopLayerState {
  let s = states.get(doc);
  if (s === undefined) {
    s = { layer: [], modals: [], autoPopovers: [] };
    states.set(doc, s);
  }
  return s;
}

export function addToTopLayer(el: NodeImpl): void {
  const s = state(el.doc);
  const i = s.layer.indexOf(el);
  if (i !== -1) s.layer.splice(i, 1);
  s.layer.push(el);
}

export function removeFromTopLayer(el: NodeImpl): void {
  const s = states.get(el.doc);
  if (s === undefined) return;
  const i = s.layer.indexOf(el);
  if (i !== -1) s.layer.splice(i, 1);
  const j = s.modals.indexOf(el);
  if (j !== -1) s.modals.splice(j, 1);
}

export function isInTopLayer(el: NodeImpl): boolean {
  return states.get(el.doc)?.layer.includes(el) ?? false;
}

// --- modal dialogs ------------------------------------------------------------------------

export function addModal(el: NodeImpl): void {
  const s = state(el.doc);
  if (!s.modals.includes(el)) s.modals.push(el);
  addToTopLayer(el);
}

/** :modal — https://drafts.csswg.org/selectors-4/#modal-state */
export function matchesModal(el: NodeImpl): boolean {
  return states.get(el.doc)?.modals.includes(el) ?? false;
}

/**
 * https://html.spec.whatwg.org/#blocked-by-a-modal-dialog — while a modal dialog is open,
 * nodes outside the topmost one are inert. Elements above it in the top layer (e.g. a popover
 * opened from within the dialog) are not blocked.
 */
export function inertByModal(el: NodeImpl): boolean {
  const s = states.get(el.doc);
  if (s === undefined || s.modals.length === 0) return false;
  const modal = s.modals[s.modals.length - 1];
  const modalIndex = s.layer.indexOf(modal);
  for (let n: NodeImpl | null = el; n !== null; n = flatParent(n)) {
    if (n === modal) return false;
    const i = s.layer.indexOf(n);
    if (i > modalIndex) return false;
  }
  return true;
}

function flatParent(n: NodeImpl): NodeImpl | null {
  if (n.parent !== null) return n.parent;
  if ((n.flags & F_SHADOW_ROOT) !== 0) {
    const host = (n.node as unknown as { [$host]: Element | null })[$host];
    return host === null ? null : host[$impl];
  }
  return null;
}

// --- popovers -----------------------------------------------------------------------------

const P_NONE = 0;
const P_AUTO = 1;
const P_MANUAL = 2;
const P_HINT = 3;

/** https://html.spec.whatwg.org/#attr-popover state. */
export function popoverState(el: NodeImpl): number {
  if (el.ns !== HTML_NS) return P_NONE;
  const v = contentAttr(el, "popover");
  if (v === null) return P_NONE;
  switch (v.toLowerCase()) {
    case "":
    case "auto":
      return P_AUTO;
    case "hint":
      return P_HINT;
  }
  return P_MANUAL;
}

const showing = new WeakSet<NodeImpl>();
/** https://html.spec.whatwg.org/#popover-invoker */
const invokers = new WeakMap<NodeImpl, NodeImpl | null>();
/** https://html.spec.whatwg.org/#popover-previously-focused-element */
const previouslyFocused = new WeakMap<NodeImpl, NodeImpl | null>();
/** https://html.spec.whatwg.org/#popover-toggle-task-tracker */
const toggleTrackers = new WeakMap<NodeImpl, { oldState: string; cancelled: boolean }>();

/** :popover-open — https://html.spec.whatwg.org/#selector-popover-open */
export function matchesPopoverOpen(el: NodeImpl): boolean {
  return showing.has(el) && popoverState(el) !== P_NONE;
}

/** https://html.spec.whatwg.org/#check-popover-validity */
function checkPopoverValidity(el: NodeImpl, expectedToBeShowing: boolean, throwExceptions: boolean, expectedDocument: Document | null): boolean {
  if (popoverState(el) === P_NONE) {
    if (throwExceptions) throw new DOMException("Not supported on elements that do not have a valid value for the 'popover' attribute.", "NotSupportedError");
    return false;
  }
  if (expectedToBeShowing !== showing.has(el)) return false;
  if ((el.flags & F_CONNECTED) === 0 || (expectedDocument !== null && el.doc !== expectedDocument) || (el.tag === T.dialog && matchesModal(el))) {
    if (throwExceptions) throw new DOMException("Invalid on popover elements which aren't connected, or are modal dialogs.", "InvalidStateError");
    return false;
  }
  return true;
}

/** https://html.spec.whatwg.org/#queue-a-popover-toggle-event-task */
function queuePopoverToggle(el: NodeImpl, oldState: string, newState: string): void {
  const prev = toggleTrackers.get(el);
  if (prev !== undefined) {
    oldState = prev.oldState;
    prev.cancelled = true;
  }
  const tracker = { oldState, cancelled: false };
  toggleTrackers.set(el, tracker);
  queueTask(() => {
    if (tracker.cancelled) return;
    toggleTrackers.delete(el);
    fireToggleEvent(el.node as Element, "toggle", oldState, newState, false);
  });
}

/** The nearest showing auto popover that is an inclusive flat-tree ancestor of `node` (or of its invoker). */
function nearestShowingAutoAncestor(node: NodeImpl | null, stack: NodeImpl[]): NodeImpl | null {
  for (let n = node; n !== null; n = flatParent(n)) {
    if (stack.includes(n)) return n;
  }
  return null;
}

/** https://html.spec.whatwg.org/#topmost-popover-ancestor (simplified: DOM ancestry, then invoker ancestry). */
function topmostPopoverAncestor(el: NodeImpl, invoker: NodeImpl | null, stack: NodeImpl[]): NodeImpl | null {
  const a = nearestShowingAutoAncestor(flatParent(el), stack);
  const b = invoker === null ? null : nearestShowingAutoAncestor(invoker, stack);
  if (a === null) return b;
  if (b === null) return a;
  return stack.indexOf(a) > stack.indexOf(b) ? a : b;
}

/** https://html.spec.whatwg.org/#hide-all-popovers-until */
export function hideAllPopoversUntil(endpoint: NodeImpl | null, doc: Document, focusPreviousElement: boolean, fireEvents: boolean): void {
  const s = states.get(doc);
  if (s === undefined) return;
  const stack = s.autoPopovers;
  if (endpoint !== null && !stack.includes(endpoint)) endpoint = null;
  while (stack.length !== 0) {
    const top = stack[stack.length - 1];
    if (top === endpoint) break;
    hidePopover(top, focusPreviousElement, fireEvents, false, null);
    if (stack[stack.length - 1] === top) stack.pop(); // a handler prevented normal removal
  }
}

/** https://html.spec.whatwg.org/#show-popover */
export function showPopover(el: NodeImpl, throwExceptions: boolean, invoker: NodeImpl | null): void {
  if (!checkPopoverValidity(el, false, throwExceptions, null)) return;
  const doc = el.doc;
  // beforetoggle (cancelable).
  if (!fireToggleEvent(el.node as Element, "beforetoggle", "closed", "open", true, invoker === null ? null : (invoker.node as Element))) return;
  if (!checkPopoverValidity(el, false, throwExceptions, doc)) return;
  const type = popoverState(el);
  const s = state(doc);
  if (type === P_AUTO || type === P_HINT) {
    const ancestor = topmostPopoverAncestor(el, invoker, s.autoPopovers);
    hideAllPopoversUntil(ancestor, doc, false, true);
    if (popoverState(el) !== type || !checkPopoverValidity(el, false, throwExceptions, doc)) return;
  }
  invokers.set(el, invoker);
  previouslyFocused.set(el, doc[$focused]);
  addToTopLayer(el);
  showing.add(el);
  if (type === P_AUTO || type === P_HINT) s.autoPopovers.push(el);
  popoverFocusingSteps(el);
  queuePopoverToggle(el, "closed", "open");
}

/** https://html.spec.whatwg.org/#hide-popover-algorithm */
export function hidePopover(el: NodeImpl, focusPreviousElement: boolean, fireEvents: boolean, throwExceptions: boolean, source: NodeImpl | null): void {
  if (!checkPopoverValidity(el, true, throwExceptions, null)) return;
  const doc = el.doc;
  const s = state(doc);
  if (s.autoPopovers.includes(el)) {
    hideAllPopoversUntil(el, doc, focusPreviousElement, fireEvents);
    if (!checkPopoverValidity(el, true, throwExceptions, null)) return;
  }
  invokers.delete(el);
  if (fireEvents) {
    fireToggleEvent(el.node as Element, "beforetoggle", "open", "closed", false, source === null ? null : (source.node as Element));
    if (s.autoPopovers.includes(el)) {
      hideAllPopoversUntil(el, doc, focusPreviousElement, fireEvents);
    }
    if (!checkPopoverValidity(el, true, throwExceptions, null)) return;
  }
  removeFromTopLayer(el);
  showing.delete(el);
  const i = s.autoPopovers.indexOf(el);
  if (i !== -1) s.autoPopovers.splice(i, 1);
  if (fireEvents) queuePopoverToggle(el, "open", "closed");
  const prev = previouslyFocused.get(el) ?? null;
  previouslyFocused.delete(el);
  if (focusPreviousElement && prev !== null) {
    const focused = doc[$focused];
    // Restore focus only when it is inside the popover (or nowhere).
    if (focused === null || isFlatInclusiveAncestor(el, focused)) focusHook?.(prev);
  }
}

function isFlatInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let n: NodeImpl | null = b; n !== null; n = flatParent(n)) if (n === a) return true;
  return false;
}

/** https://html.spec.whatwg.org/#popover-focusing-steps */
function popoverFocusingSteps(el: NodeImpl): void {
  if (contentAttr(el, "autofocus") !== null) {
    focusHook?.(el);
    return;
  }
  // Autofocus delegate: first descendant with autofocus that is focusable.
  const d = autofocusDelegateHook?.(el) ?? null;
  if (d !== null) focusHook?.(d);
}

// focus.ts imports this module; it installs these to avoid a cycle at evaluation time.
let focusHook: ((el: NodeImpl) => void) | null = null;
let autofocusDelegateHook: ((el: NodeImpl) => NodeImpl | null) | null = null;

export function setTopLayerFocusHooks(focus: (el: NodeImpl) => void, autofocusDelegate: (el: NodeImpl) => NodeImpl | null): void {
  focusHook = focus;
  autofocusDelegateHook = autofocusDelegate;
}

/** HTML element removing steps for popovers/top layer (https://html.spec.whatwg.org/#the-popover-attribute:html-element-removing-steps). */
export function topLayerRemovingSteps(el: NodeImpl): void {
  // The element is already disconnected, so the validity checks of the hide popover algorithm
  // would bail out; run its state changes directly (no events, no focus restoration).
  if (showing.has(el)) {
    showing.delete(el);
    invokers.delete(el);
    previouslyFocused.delete(el);
    const s = states.get(el.doc);
    if (s !== undefined) {
      const i = s.autoPopovers.indexOf(el);
      if (i !== -1) s.autoPopovers.splice(i, 1);
    }
  }
  removeFromTopLayer(el);
}

/** Popover attribute change steps (https://html.spec.whatwg.org/#popover-attribute-change-steps). */
export function popoverAttributeChanged(el: NodeImpl, oldValue: string | null, value: string | null): void {
  if (!showing.has(el)) return;
  if (oldValue !== null && value !== null && popoverKeyword(oldValue) === popoverKeyword(value)) return;
  // Hide using the old state (the attribute already changed; force validity by tracking).
  showing.delete(el);
  invokers.delete(el);
  removeFromTopLayer(el);
  const s = states.get(el.doc);
  if (s !== undefined) {
    const i = s.autoPopovers.indexOf(el);
    if (i !== -1) s.autoPopovers.splice(i, 1);
  }
  queuePopoverToggle(el, "open", "closed");
}

function popoverKeyword(v: string): number {
  switch (v.toLowerCase()) {
    case "":
    case "auto":
      return P_AUTO;
    case "hint":
      return P_HINT;
  }
  return P_MANUAL;
}

export function isPopoverShowing(el: NodeImpl): boolean {
  return showing.has(el);
}

// Top layer state: modal dialogs, popovers, close watchers and light dismiss.
// https://html.spec.whatwg.org/#top-layer (CSS Positioned Layout 4 "top layer")
// https://html.spec.whatwg.org/#the-popover-attribute
// https://html.spec.whatwg.org/#close-requests-and-close-watchers
// https://html.spec.whatwg.org/#popover-light-dismiss
//
// Per-document and per-element state lives in WeakMaps so documents that never open a dialog or
// popover pay nothing. The dialog algorithms themselves are in interactive.ts; they use the
// shared pieces exported here (top layer, previously focused element, close watchers).
//
// User input: there is no user agent input handling, so light dismiss and close requests are
// driven by the pointerdown / pointerup / keydown (Escape) events dispatched through the DOM
// (user-event's, or fireEvent's), trusted or not; see `postDispatch` and docs/deviations.md.
// Overlay transitions do not exist, so "request an element to be removed from the top layer"
// removes it immediately.

import { ELEMENT_NODE, F_CONNECTED, F_HAS_SHADOW, F_SHADOW_ROOT, HTML_NS } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import type { Event } from "../events/Event.ts";
import { T } from "../nodes/tags.ts";
import { assignedSlotForEventPath } from "../nodes/slots.ts";
import { setPostDispatchHook } from "../events/dispatch.ts";
import { contentAttr } from "./reflect.ts";
import { fireToggleEvent, queueElementTask } from "./events.ts";
import { targetPopover } from "./invokers.ts";
import { $focused, $host, $impl, $styleVersion, $window } from "../keys.ts";

/** https://html.spec.whatwg.org/#close-watcher */
export interface CloseWatcher {
  /** https://html.spec.whatwg.org/#close-watcher-cancel-action — false prevents closing. */
  cancelAction: (canPreventClose: boolean) => boolean;
  /** https://html.spec.whatwg.org/#close-watcher-close-action */
  closeAction: () => void;
  /** https://html.spec.whatwg.org/#close-watcher-get-enabled-state */
  getEnabledState: () => boolean;
  /** https://html.spec.whatwg.org/#close-watcher-is-running-cancel-action */
  isRunningCancelAction: boolean;
  doc: Document;
}

interface TopLayerState {
  /** https://html.spec.whatwg.org/#top-layer — bottom to top. */
  layer: NodeImpl[];
  /** Open dialogs whose `is modal` flag is set, in the order they were shown. */
  modals: NodeImpl[];
  /** https://html.spec.whatwg.org/#open-dialogs-list */
  openDialogs: NodeImpl[];
  /**
   * The close watcher manager's groups, flattened (https://html.spec.whatwg.org/#close-watcher-manager).
   * Every watcher gets its own group, as if each was created with history-action activation.
   */
  watchers: CloseWatcher[];
  /** https://html.spec.whatwg.org/#popover-pointerdown-target */
  popoverPointerdownTarget: NodeImpl | null;
  /** https://html.spec.whatwg.org/#dialog-pointerdown-target */
  dialogPointerdownTarget: NodeImpl | null;
  /** https://html.spec.whatwg.org/#hint-stack-parent */
  hintStackParent: NodeImpl | null;
  /** https://html.spec.whatwg.org/#document-showing-popover */
  showingPopover: boolean;
  /** https://html.spec.whatwg.org/#hiding-popover-nesting-count */
  hidingPopoverNestingCount: number;
}

const states = new WeakMap<Document, TopLayerState>();

function state(doc: Document): TopLayerState {
  let s = states.get(doc);
  if (s === undefined) {
    s = {
      layer: [],
      modals: [],
      openDialogs: [],
      watchers: [],
      popoverPointerdownTarget: null,
      dialogPointerdownTarget: null,
      hintStackParent: null,
      showingPopover: false,
      hidingPopoverNestingCount: 0,
    };
    states.set(doc, s);
    // User input only matters once some document has top layer state.
    setPostDispatchHook(postDispatch);
  }
  return s;
}

// --- top layer ----------------------------------------------------------------------------

/** https://drafts.csswg.org/css-position-4/#add-an-element-to-the-top-layer */
/**
 * Top layer / :popover-open / :modal state feeds selectors and the UA stylesheet
 * (`[popover]:not(:popover-open)`, `dialog:popover-open`) without a DOM mutation: invalidate
 * the document's style caches (https://drafts.csswg.org/css-position-4/#top-styling).
 */
function styleChanged(doc: Document): void {
  doc[$styleVersion]++;
}

export function addToTopLayer(el: NodeImpl): void {
  styleChanged(el.doc);
  const s = state(el.doc);
  const i = s.layer.indexOf(el);
  if (i !== -1) s.layer.splice(i, 1);
  s.layer.push(el);
}

/** https://drafts.csswg.org/css-position-4/#remove-an-element-from-the-top-layer-immediately */
export function removeFromTopLayer(el: NodeImpl): void {
  const s = states.get(el.doc);
  if (s === undefined) return;
  const i = s.layer.indexOf(el);
  if (i !== -1) s.layer.splice(i, 1);
  const j = s.modals.indexOf(el);
  if (j !== -1) s.modals.splice(j, 1);
  if (i !== -1 || j !== -1) styleChanged(el.doc);
}

export function isInTopLayer(el: NodeImpl): boolean {
  return states.get(el.doc)?.layer.includes(el) ?? false;
}

// --- previously focused element (shared by dialogs and popovers) ----------------------------

/** https://html.spec.whatwg.org/#previously-focused-element */
const previouslyFocused = new WeakMap<NodeImpl, NodeImpl>();

export function getPreviouslyFocused(el: NodeImpl): NodeImpl | null {
  return previouslyFocused.get(el) ?? null;
}

export function setPreviouslyFocused(el: NodeImpl, focused: NodeImpl | null): void {
  if (focused === null) previouslyFocused.delete(el);
  else previouslyFocused.set(el, focused);
}

// --- modal dialogs ------------------------------------------------------------------------

/** Sets `is modal` (and blocks the document by the dialog); the dialog joins the top layer. */
export function setModal(el: NodeImpl, modal: boolean): void {
  if (!modal) {
    const s = states.get(el.doc);
    const j = s === undefined ? -1 : s.modals.indexOf(el);
    if (j !== -1) {
      s!.modals.splice(j, 1);
      styleChanged(el.doc);
    }
    return;
  }
  const s = state(el.doc);
  if (!s.modals.includes(el)) {
    s.modals.push(el);
    styleChanged(el.doc);
  }
}

/** `is modal` (https://html.spec.whatwg.org/#is-modal); also :modal (https://drafts.csswg.org/selectors-4/#modal-state). */
export function matchesModal(el: NodeImpl): boolean {
  return states.get(el.doc)?.modals.includes(el) ?? false;
}

/** https://html.spec.whatwg.org/#open-dialogs-list */
export function openDialogsList(doc: Document): NodeImpl[] {
  return state(doc).openDialogs;
}

/**
 * https://html.spec.whatwg.org/#blocked-by-a-modal-dialog — while a modal dialog is open,
 * nodes outside the topmost one are inert. Elements above it in the top layer (e.g. a popover
 * opened from within the dialog) are not blocked.
 */
export function inertByModal(el: NodeImpl): boolean {
  const s = states.get(el.doc);
  if (s === undefined || s.modals.length === 0) return false;
  // The document is blocked by the topmost modal dialog in the top layer.
  let modal: NodeImpl | null = null;
  let modalIndex = -1;
  for (let i = s.layer.length - 1; i >= 0; i--) {
    if (s.modals.includes(s.layer[i])) {
      modal = s.layer[i];
      modalIndex = i;
      break;
    }
  }
  if (modal === null) return false;
  for (let n: NodeImpl | null = el; n !== null; n = flatParent(n)) {
    if (n === modal) return false;
    const i = s.layer.indexOf(n);
    if (i > modalIndex) return false;
  }
  return true;
}

/** Parent in the flat tree (https://drafts.csswg.org/css-scoping/#flat-tree): assigned slot, shadow host, or parent. */
export function flatParent(n: NodeImpl): NodeImpl | null {
  const p = n.parent;
  if (p !== null) {
    if ((p.flags & F_HAS_SHADOW) !== 0 && p.type === ELEMENT_NODE) {
      const slot = assignedSlotForEventPath(n);
      if (slot !== null) return slot;
    }
    return p;
  }
  if ((n.flags & F_SHADOW_ROOT) !== 0) {
    const host = (n.node as unknown as { [$host]: Element | null })[$host];
    return host === null ? null : host[$impl];
  }
  return null;
}

function isFlatInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let n: NodeImpl | null = b; n !== null; n = flatParent(n)) if (n === a) return true;
  return false;
}

function isShadowIncludingInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let n: NodeImpl | null = b; n !== null;) {
    if (n === a) return true;
    if (n.parent !== null) n = n.parent;
    else if ((n.flags & F_SHADOW_ROOT) !== 0) {
      const host: Element | null = (n.node as unknown as { [$host]: Element | null })[$host];
      n = host === null ? null : host[$impl];
    } else n = null;
  }
  return false;
}

/** https://html.spec.whatwg.org/#fully-active (approximation: the document has a browsing context). */
export function isFullyActive(doc: Document): boolean {
  return doc[$window] != null;
}

// --- close watchers -----------------------------------------------------------------------

/** https://html.spec.whatwg.org/#establish-a-close-watcher */
export function establishCloseWatcher(
  doc: Document,
  cancelAction: CloseWatcher["cancelAction"],
  closeAction: () => void,
  getEnabledState: () => boolean,
): CloseWatcher {
  const w: CloseWatcher = { cancelAction, closeAction, getEnabledState, isRunningCancelAction: false, doc };
  state(doc).watchers.push(w);
  return w;
}

/** https://html.spec.whatwg.org/#close-watcher-destroy */
export function destroyCloseWatcher(w: CloseWatcher): void {
  const list = states.get(w.doc)?.watchers;
  const i = list === undefined ? -1 : list.indexOf(w);
  if (i !== -1) list!.splice(i, 1);
}

function isActive(w: CloseWatcher): boolean {
  return states.get(w.doc)?.watchers.includes(w) ?? false;
}

/** https://html.spec.whatwg.org/#close-watcher-close */
function closeWatcherClose(w: CloseWatcher): void {
  // 1-3.
  if (!isActive(w) || !w.getEnabledState() || !isFullyActive(w.doc)) return;
  // 4-5.
  destroyCloseWatcher(w);
  w.closeAction();
}

/**
 * https://html.spec.whatwg.org/#close-watcher-request-close — returns false when the cancel
 * action prevented closing. Without user activation tracking, `canPreventClose` is always true
 * (as if the page had history-action activation).
 */
export function requestCloseWatcher(w: CloseWatcher, _requireHistoryActionActivation: boolean): boolean {
  // 1-5.
  if (!isActive(w) || !w.getEnabledState() || w.isRunningCancelAction || !isFullyActive(w.doc)) return true;
  // 6.
  const canPreventClose = true;
  // 7-9.
  w.isRunningCancelAction = true;
  let shouldContinue: boolean;
  try {
    shouldContinue = w.cancelAction(canPreventClose);
  } finally {
    w.isRunningCancelAction = false;
  }
  // 10.
  if (!shouldContinue) return false;
  // 11-12.
  closeWatcherClose(w);
  return true;
}

/**
 * https://html.spec.whatwg.org/#process-close-watchers — the last group gets the close request.
 * Each group holds one watcher (see TopLayerState.watchers), so a disabled topmost watcher
 * (e.g. a dialog with closedby=none) swallows the request.
 */
function processCloseWatchers(doc: Document): boolean {
  const s = states.get(doc);
  if (s === undefined || s.watchers.length === 0) return false;
  requestCloseWatcher(s.watchers[s.watchers.length - 1], true);
  return true;
}

// --- popovers -----------------------------------------------------------------------------

export const P_NONE = 0;
export const P_AUTO = 1;
export const P_MANUAL = 2;
export const P_HINT = 3;

/** https://html.spec.whatwg.org/#attr-popover state. */
export function popoverState(el: NodeImpl): number {
  if (el.ns !== HTML_NS || el.type !== ELEMENT_NODE) return P_NONE;
  const v = contentAttr(el, "popover");
  return v === null ? P_NONE : popoverKeyword(v);
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

interface ToggleTracker {
  oldState: string;
  cancelled: boolean;
}

/** Per-element popover state (https://html.spec.whatwg.org/#the-popover-attribute). */
interface PopoverRecord {
  /** https://html.spec.whatwg.org/#popover-visibility-state (true = showing). */
  showing: boolean;
  /** https://html.spec.whatwg.org/#popover-trigger */
  trigger: NodeImpl | null;
  /** https://html.spec.whatwg.org/#popover-hiding */
  hiding: boolean;
  /** https://html.spec.whatwg.org/#opened-in-popover-mode (P_AUTO / P_HINT / P_NONE). */
  openedMode: number;
  /** https://html.spec.whatwg.org/#popover-toggle-task-tracker */
  toggleTracker: ToggleTracker | null;
  /** https://html.spec.whatwg.org/#popover-close-watcher */
  closeWatcher: CloseWatcher | null;
}

const popovers = new WeakMap<NodeImpl, PopoverRecord>();

function record(el: NodeImpl): PopoverRecord {
  let r = popovers.get(el);
  if (r === undefined) {
    r = { showing: false, trigger: null, hiding: false, openedMode: P_NONE, toggleTracker: null, closeWatcher: null };
    popovers.set(el, r);
  }
  return r;
}

export function isPopoverShowing(el: NodeImpl): boolean {
  return popovers.get(el)?.showing ?? false;
}

/** :popover-open — https://html.spec.whatwg.org/#selector-popover-open */
export function matchesPopoverOpen(el: NodeImpl): boolean {
  return (popovers.get(el)?.showing ?? false) && popoverState(el) !== P_NONE;
}

/** https://html.spec.whatwg.org/#showing-auto-popover-list (mode P_AUTO) / #showing-hint-popover-list (P_HINT). */
function showingPopoverList(doc: Document, mode: number): NodeImpl[] {
  const out: NodeImpl[] = [];
  const s = states.get(doc);
  if (s === undefined) return out;
  for (const el of s.layer) {
    const r = popovers.get(el);
    if (r !== undefined && r.showing && r.openedMode === mode) out.push(el);
  }
  return out;
}

/** https://html.spec.whatwg.org/#check-popover-validity — throws, or returns whether the operation may proceed. */
export function checkPopoverValidity(
  el: NodeImpl,
  expectedToBeShowing: boolean,
  expectedDocument: Document | null,
): boolean {
  // 1. (The popover attribute change steps hide a popover whose attribute was just removed.)
  if (popoverState(el) === P_NONE && el !== hidingAfterAttributeRemoval) {
    throw new DOMException(
      "Not supported on elements that do not have a valid value for the 'popover' attribute.",
      "NotSupportedError",
    );
  }
  // 2.
  if (expectedToBeShowing !== isPopoverShowing(el)) return false;
  // 3.
  if (
    (!expectedToBeShowing && (el.flags & F_CONNECTED) === 0) ||
    (!expectedToBeShowing && !isFullyActive(el.doc)) ||
    (expectedDocument !== null && el.doc !== expectedDocument) ||
    (el.tag === T.dialog && matchesModal(el))
  ) {
    throw new DOMException(
      "Invalid on popover elements which aren't connected, or are modal dialogs.",
      "InvalidStateError",
    );
  }
  return true;
}

/** Runs check popover validity, turning a thrown exception into `false` or rethrowing it when `throwExceptions`. */
function validity(
  el: NodeImpl,
  expectedToBeShowing: boolean,
  expectedDocument: Document | null,
  throwExceptions: boolean,
): boolean {
  try {
    return checkPopoverValidity(el, expectedToBeShowing, expectedDocument);
  } catch (e) {
    if (throwExceptions) throw e;
    return false;
  }
}

/** https://html.spec.whatwg.org/#queue-a-popover-toggle-event-task */
function queuePopoverToggle(el: NodeImpl, oldState: string, newState: string, source: NodeImpl | null): void {
  const r = record(el);
  // 1.
  if (r.toggleTracker !== null) {
    oldState = r.toggleTracker.oldState;
    r.toggleTracker.cancelled = true;
    r.toggleTracker = null;
  }
  // 2-3.
  const tracker: ToggleTracker = { oldState, cancelled: false };
  r.toggleTracker = tracker;
  queueElementTask(el, () => {
    if (tracker.cancelled) return;
    fireToggleEvent(
      el.node as Element,
      "toggle",
      oldState,
      newState,
      false,
      source === null ? null : (source.node as Element),
    );
    if (r.toggleTracker === tracker) r.toggleTracker = null;
  });
}

/** https://html.spec.whatwg.org/#topmost-popover-ancestor */
export function topmostPopoverAncestor(
  newPopoverOrTopLayerElement: NodeImpl,
  source: NodeImpl | null,
  _isPopover: boolean,
): NodeImpl | null {
  // 1-3.
  const doc = newPopoverOrTopLayerElement.doc;
  const combined = showingPopoverList(doc, P_AUTO).concat(showingPopoverList(doc, P_HINT));
  // 4. The last item of which the element is a flat tree descendant.
  const popoverAncestorIndex = lastIndexOfAncestor(combined, newPopoverOrTopLayerElement);
  // 5-6.
  const sourceAncestorIndex = source === null ? -1 : lastIndexOfAncestor(combined, source, true);
  // 7-9.
  const ancestorIndex = Math.max(popoverAncestorIndex, sourceAncestorIndex);
  return ancestorIndex === -1 ? null : combined[ancestorIndex];
}

/** Index of the last item of `list` that is a flat tree (inclusive, when `inclusive`) ancestor of `node`, else -1. */
function lastIndexOfAncestor(list: NodeImpl[], node: NodeImpl, inclusive = false): number {
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (item === node) {
      if (inclusive) return i;
      continue;
    }
    if (isFlatInclusiveAncestor(item, node)) return i;
  }
  return -1;
}

/** https://html.spec.whatwg.org/#topmost-auto-or-hint-popover */
function topmostAutoOrHintPopover(doc: Document): NodeImpl | null {
  const hints = showingPopoverList(doc, P_HINT);
  if (hints.length !== 0) return hints[hints.length - 1];
  const autos = showingPopoverList(doc, P_AUTO);
  return autos.length !== 0 ? autos[autos.length - 1] : null;
}

/** https://html.spec.whatwg.org/#hide-popover-stack-until */
function hidePopoverStackUntil(
  doc: Document,
  endpoint: NodeImpl | null,
  stackType: number,
  focusPreviousElement: boolean,
  fireEvents: boolean,
): void {
  // 1-4.
  const popoverList = showingPopoverList(doc, stackType);
  const endpointIndex = endpoint === null ? -1 : popoverList.indexOf(endpoint);
  const lastHideIndex = endpointIndex === -1 ? 0 : endpointIndex + 1;
  const toRemain = popoverList.slice(0, lastHideIndex);
  // 5.
  for (let i = popoverList.length - 1; i >= lastHideIndex; i--)
    hidePopover(popoverList[i], focusPreviousElement, fireEvents, false, null);
  // 6-8. Popovers shown while hiding (e.g. from beforetoggle) are hidden without events.
  const newPopoverList = showingPopoverList(doc, stackType);
  for (let i = newPopoverList.length - 1; i >= 0; i--) {
    const popover = newPopoverList[i];
    if (toRemain.includes(popover)) continue;
    hidePopover(popover, focusPreviousElement, false, false, null);
  }
}

/** https://html.spec.whatwg.org/#hide-all-popovers-until */
export function hidePopoversUntil(
  doc: Document,
  endpoint: NodeImpl | null,
  focusPreviousElement: boolean,
  fireEvents: boolean,
): void {
  // 1.
  const endpointIsHint = endpoint !== null && showingPopoverList(doc, P_HINT).includes(endpoint);
  // 2.
  hidePopoverStackUntil(doc, endpoint, P_HINT, focusPreviousElement, fireEvents);
  // 3-4.
  const autoEndpoint = endpointIsHint ? (states.get(doc)?.hintStackParent ?? null) : endpoint;
  // 5.
  hidePopoverStackUntil(doc, autoEndpoint, P_AUTO, focusPreviousElement, fireEvents);
}

/** https://html.spec.whatwg.org/#show-popover */
export function showPopover(el: NodeImpl, throwExceptions: boolean, source: NodeImpl | null): void {
  // 1.
  const doc = el.doc;
  const s = state(doc);
  // 2.
  if (s.showingPopover || s.hidingPopoverNestingCount !== 0) {
    if (throwExceptions) throw new DOMException("A popover is already being shown or hidden.", "InvalidStateError");
    return;
  }
  // 3-4.
  if (!validity(el, false, null, throwExceptions)) return;
  // 7-8.
  s.showingPopover = true;
  const cleanupShowingSteps = () => {
    s.showingPopover = false;
  };
  // 9.
  if (
    !fireToggleEvent(
      el.node as Element,
      "beforetoggle",
      "closed",
      "open",
      true,
      source === null ? null : (source.node as Element),
    )
  ) {
    cleanupShowingSteps();
    return;
  }
  // 10-11.
  try {
    if (!checkPopoverValidity(el, false, doc)) {
      cleanupShowingSteps();
      return;
    }
  } catch (e) {
    cleanupShowingSteps();
    if (throwExceptions) throw e;
    return;
  }
  // 12-14.
  let shouldRestoreFocus = false;
  const originalType = popoverState(el);
  let effectiveType = originalType;
  let ancestor: NodeImpl | null = null;
  const r = record(el);
  // 15.
  if (originalType === P_AUTO || originalType === P_HINT) {
    // 15.1-15.2.
    ancestor = topmostPopoverAncestor(el, source, true);
    if (ancestor !== null && popovers.get(ancestor)?.openedMode === P_HINT && effectiveType === P_AUTO)
      effectiveType = P_HINT;
    // 15.3-15.4.
    hidePopoverStackUntil(doc, ancestor, P_HINT, shouldRestoreFocus, true);
    if (effectiveType === P_AUTO) hidePopoverStackUntil(doc, ancestor, P_AUTO, shouldRestoreFocus, true);
    // 15.5.
    if (originalType !== popoverState(el)) {
      cleanupShowingSteps();
      if (throwExceptions)
        throw new DOMException("The popover attribute changed while showing the popover.", "InvalidStateError");
      return;
    }
    // 15.6-15.7.
    try {
      if (!checkPopoverValidity(el, false, doc)) {
        cleanupShowingSteps();
        return;
      }
    } catch (e) {
      cleanupShowingSteps();
      if (throwExceptions) throw e;
      return;
    }
    // 15.8.
    if (topmostAutoOrHintPopover(doc) === null) shouldRestoreFocus = true;
    // 15.9-15.10.
    r.openedMode = effectiveType === P_AUTO ? P_AUTO : P_HINT;
    // 15.11.
    r.closeWatcher = establishCloseWatcher(
      doc,
      () => true,
      () => hidePopover(el, true, true, false, null),
      () => true,
    );
  }
  // 16-17.
  setPreviouslyFocused(el, null);
  const originallyFocusedElement = doc[$focused];
  // 18.
  addToTopLayer(el);
  // 19.
  if (effectiveType === P_HINT && ancestor !== null && popovers.get(ancestor)?.openedMode === P_AUTO)
    s.hintStackParent = ancestor;
  // 20-22.
  r.showing = true;
  r.trigger = source;
  // 23.
  popoverFocusingSteps(el);
  // 24.
  if (shouldRestoreFocus && popoverState(el) !== P_NONE) setPreviouslyFocused(el, originallyFocusedElement);
  // 25-26.
  cleanupShowingSteps();
  queuePopoverToggle(el, "closed", "open", source);
}

/** https://html.spec.whatwg.org/#hide-popover-algorithm */
export function hidePopover(
  el: NodeImpl,
  focusPreviousElement: boolean,
  fireEvents: boolean,
  throwExceptions: boolean,
  source: NodeImpl | null,
): void {
  // 1-2.
  if (!validity(el, true, null, throwExceptions)) return;
  // 3-7.
  const doc = el.doc;
  const s = state(doc);
  const r = record(el);
  const nestedHide = r.hiding;
  r.hiding = true;
  if (nestedHide) fireEvents = false;
  s.hidingPopoverNestingCount++;
  // 8.
  const cleanupSteps = () => {
    if (!nestedHide) r.hiding = false;
    s.hidingPopoverNestingCount--;
  };
  try {
    // 9-10.
    const autoListContains = showingPopoverList(doc, P_AUTO).includes(el);
    const hintListContains = showingPopoverList(doc, P_HINT).includes(el);
    // 11.
    if (r.openedMode === P_AUTO || r.openedMode === P_HINT) {
      // 11.1.
      if (hintListContains) hidePopoverStackUntil(doc, el, P_HINT, focusPreviousElement, fireEvents);
      // 11.2.
      if (el === s.hintStackParent) hidePopoverStackUntil(doc, null, P_HINT, focusPreviousElement, fireEvents);
      // 11.3.
      if (autoListContains) hidePopoverStackUntil(doc, el, P_AUTO, focusPreviousElement, fireEvents);
      // 11.4-11.5.
      if (!checkPopoverValidity(el, true, doc)) return;
    }
    // 12.
    if (fireEvents) {
      fireToggleEvent(
        el.node as Element,
        "beforetoggle",
        "open",
        "closed",
        false,
        source === null ? null : (source.node as Element),
      );
      if (!checkPopoverValidity(el, true, doc)) return;
    }
    // 12.4 / 13. Request removal from the top layer (no overlay transitions: immediately).
    removeFromTopLayer(el);
    // 14-17.
    r.trigger = null;
    r.openedMode = P_NONE;
    r.showing = false;
    if (el === s.hintStackParent || showingPopoverList(doc, P_HINT).length === 0) s.hintStackParent = null;
    // 18.
    if (fireEvents) queuePopoverToggle(el, "open", "closed", source);
    // 19-20.
    const previouslyFocusedElement = getPreviouslyFocused(el);
    if (previouslyFocusedElement !== null) {
      setPreviouslyFocused(el, null);
      const focused = doc[$focused];
      if (focusPreviousElement && focused !== null && isShadowIncludingInclusiveAncestor(el, focused))
        focusHook?.(previouslyFocusedElement);
    }
    // 21.
    if (r.closeWatcher !== null) {
      destroyCloseWatcher(r.closeWatcher);
      r.closeWatcher = null;
    }
  } catch (e) {
    if (throwExceptions) throw e;
  } finally {
    // 22.
    cleanupSteps();
  }
}

/** https://html.spec.whatwg.org/#popover-focusing-steps */
function popoverFocusingSteps(el: NodeImpl): void {
  // 2.
  if (el.tag === T.dialog && el.ns === HTML_NS) {
    dialogFocusingHook?.(el);
    return;
  }
  // 3-5.
  const control = contentAttr(el, "autofocus") !== null ? el : (autofocusDelegateHook?.(el) ?? null);
  if (control === null) return;
  // 6.
  focusHook?.(control);
}

// focus.ts / interactive.ts import this module; they install these to avoid evaluation-time cycles.
let focusHook: ((el: NodeImpl) => void) | null = null;
let autofocusDelegateHook: ((el: NodeImpl) => NodeImpl | null) | null = null;
let dialogFocusingHook: ((el: NodeImpl) => void) | null = null;
let dialogLightDismissHook: ((doc: Document, target: NodeImpl, type: string) => void) | null = null;

export function setTopLayerFocusHooks(
  focus: (el: NodeImpl) => void,
  autofocusDelegate: (el: NodeImpl) => NodeImpl | null,
): void {
  focusHook = focus;
  autofocusDelegateHook = autofocusDelegate;
}

export function setTopLayerDialogHooks(
  focusing: (el: NodeImpl) => void,
  lightDismiss: (doc: Document, target: NodeImpl, type: string) => void,
): void {
  dialogFocusingHook = focusing;
  dialogLightDismissHook = lightDismiss;
}

/** Popover part of the HTML element removing steps (https://html.spec.whatwg.org/#the-popover-attribute:html-element-removing-steps). */
export function topLayerRemovingSteps(el: NodeImpl): void {
  // If removedNode's popover attribute is not in the No Popover state, hide it without events
  // or focus restoration (the hide popover algorithm accepts a showing, disconnected popover).
  if (isPopoverShowing(el) && popoverState(el) !== P_NONE) hidePopover(el, false, false, false, null);
  else if (isPopoverShowing(el)) forceHidden(el);
  if (el.tag !== T.dialog) removeFromTopLayer(el);
}

/** A showing popover whose `popover` attribute is gone (no valid state left to run the algorithm with). */
function forceHidden(el: NodeImpl): void {
  const r = record(el);
  r.showing = false;
  r.trigger = null;
  r.openedMode = P_NONE;
  if (r.closeWatcher !== null) {
    destroyCloseWatcher(r.closeWatcher);
    r.closeWatcher = null;
  }
  removeFromTopLayer(el);
  const s = states.get(el.doc);
  if (s !== undefined && (el === s.hintStackParent || showingPopoverList(el.doc, P_HINT).length === 0))
    s.hintStackParent = null;
}

/** The element whose popover attribute was removed while it was showing, during its hiding. */
let hidingAfterAttributeRemoval: NodeImpl | null = null;

/** Popover attribute change steps (https://html.spec.whatwg.org/#the-popover-attribute:concept-element-attributes-change-ext). */
export function popoverAttributeChanged(el: NodeImpl, oldValue: string | null, value: string | null): void {
  if (!isPopoverShowing(el)) return;
  const oldState = oldValue === null ? P_NONE : popoverKeyword(oldValue);
  const newState = value === null ? P_NONE : popoverKeyword(value);
  if (oldState === newState) return;
  // The attribute already changed: with no popover attribute left the algorithm's validity
  // check would throw, so it is told to accept this element (browsers fire the events).
  const prev = hidingAfterAttributeRemoval;
  if (newState === P_NONE) hidingAfterAttributeRemoval = el;
  try {
    hidePopover(el, true, true, false, null);
  } finally {
    hidingAfterAttributeRemoval = prev;
  }
  // A handler may have left it showing without a popover attribute: it cannot stay open.
  if (isPopoverShowing(el) && popoverState(el) === P_NONE) forceHidden(el);
}

// --- light dismiss and close requests -------------------------------------------------------

/** https://html.spec.whatwg.org/#nearest-inclusive-open-popover */
function nearestInclusiveOpenPopover(node: NodeImpl): NodeImpl | null {
  for (let n: NodeImpl | null = node; n !== null; n = flatParent(n)) {
    const r = popovers.get(n);
    if (r !== undefined && r.showing && (r.openedMode === P_AUTO || r.openedMode === P_HINT)) return n;
  }
  return null;
}

/** https://html.spec.whatwg.org/#nearest-inclusive-target-popover */
function nearestInclusiveTargetPopover(node: NodeImpl): NodeImpl | null {
  for (let n: NodeImpl | null = node; n !== null; n = flatParent(n)) {
    if (n.type !== ELEMENT_NODE) continue;
    const t = targetPopover(n);
    if (t !== null && isPopoverShowing(t)) {
      const st = popoverState(t);
      if (st === P_AUTO || st === P_HINT) return t;
    }
  }
  return null;
}

/** https://html.spec.whatwg.org/#popover-stack-position */
function popoverStackPosition(popover: NodeImpl | null): number {
  if (popover === null) return 0;
  const hintList = showingPopoverList(popover.doc, P_HINT);
  const autoList = showingPopoverList(popover.doc, P_AUTO);
  const h = hintList.indexOf(popover);
  if (h !== -1) return h + autoList.length + 1;
  const a = autoList.indexOf(popover);
  return a !== -1 ? a + 1 : 0;
}

/** https://html.spec.whatwg.org/#topmost-clicked-popover */
function topmostClickedPopover(node: NodeImpl): NodeImpl | null {
  const clickedPopover = nearestInclusiveOpenPopover(node);
  const targetPopover = nearestInclusiveTargetPopover(node);
  return popoverStackPosition(clickedPopover) > popoverStackPosition(targetPopover) ? clickedPopover : targetPopover;
}

/** https://html.spec.whatwg.org/#light-dismiss-open-popovers */
function lightDismissOpenPopovers(doc: Document, s: TopLayerState, target: NodeImpl, type: string): void {
  // 4.
  if (topmostAutoOrHintPopover(doc) === null) return;
  // 5.
  if (type === "pointerdown") {
    s.popoverPointerdownTarget = topmostClickedPopover(target);
    return;
  }
  // 6.
  const ancestor = topmostClickedPopover(target);
  const sameTarget = ancestor === s.popoverPointerdownTarget;
  s.popoverPointerdownTarget = null;
  if (!sameTarget) return;
  hidePopoversUntil(doc, ancestor, false, true);
}

/**
 * Called by src/events after every dispatch once a document has top layer state: runs
 * light dismiss (https://html.spec.whatwg.org/#run-light-dismiss-activities) for pointerdown /
 * pointerup and close requests (https://html.spec.whatwg.org/#close-requests) for an Escape
 * keydown that was not canceled. Untrusted events count as user input too (docs/deviations.md).
 */
function postDispatch(event: Event, target: unknown): void {
  const type = event.type;
  if (type !== "pointerdown" && type !== "pointerup" && type !== "keydown") return;
  const impl = (target as { [$impl]?: NodeImpl } | null)?.[$impl];
  if (impl === undefined) return;
  const doc = impl.doc;
  const s = states.get(doc);
  if (s === undefined) return;
  if (type === "keydown") {
    // https://html.spec.whatwg.org/#close-requests: a canceled keydown is not a close request.
    if ((event as unknown as { key?: string }).key !== "Escape" || event.defaultPrevented) return;
    if (!isFullyActive(doc)) return;
    processCloseWatchers(doc);
    return;
  }
  // A target removed during dispatch (e.g. by a pointerdown listener) hit nothing in this
  // document any more.
  if ((impl.flags & F_CONNECTED) === 0) return;
  lightDismissOpenPopovers(doc, s, impl, type);
  dialogLightDismissHook?.(doc, impl, type);
}

/** https://html.spec.whatwg.org/#dialog-pointerdown-target accessor for interactive.ts. */
export function dialogPointerdownTarget(doc: Document, value?: NodeImpl | null): NodeImpl | null {
  const s = state(doc);
  if (value !== undefined) s.dialogPointerdownTarget = value;
  return s.dialogPointerdownTarget;
}

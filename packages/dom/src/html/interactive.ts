// Interactive elements: <details>, <summary>, <dialog>.
// https://html.spec.whatwg.org/#interactive-elements

import { setDialogSubmission } from "./forms/form-submission.ts";
import { HTMLElement } from "./HTMLElement.ts";
import { bool, contentAttr, str } from "./reflect.ts";
import { ELEMENT_NODE, F_ATTR_HOOK, F_CONNECT_HOOK, F_CONNECTED, F_SHADOW_ROOT, HTML_NS, SVG_NS } from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Event } from "../events/Event.ts";
import { removeAttribute, setAttribute } from "../nodes/attributes.ts";
import { T } from "../nodes/tags.ts";
import { nextInTree, treeRoot } from "../nodes/traverse.ts";
import { fireEvent, fireToggleEvent, queueElementTask } from "./events.ts";
import {
  addToTopLayer,
  type CloseWatcher,
  destroyCloseWatcher,
  dialogPointerdownTarget,
  establishCloseWatcher,
  flatParent,
  getPreviouslyFocused,
  hidePopoversUntil,
  isFullyActive,
  isInTopLayer,
  isPopoverShowing,
  matchesModal,
  openDialogsList,
  removeFromTopLayer,
  requestCloseWatcher,
  setModal,
  setPreviouslyFocused,
  setTopLayerDialogHooks,
  topmostPopoverAncestor,
} from "./top-layer.ts";
import { setDialogCommandSteps } from "./invokers.ts";
import { outsideCEReactions } from "./custom-elements.ts";
import { blurElement, focusDelegate, focusElement, isInert, isSummaryForParentDetails } from "./focus.ts";
import { $focused, $host, $impl } from "../keys.ts";

// --- <details> ------------------------------------------------------------------------------

const detailsTrackers = new WeakMap<NodeImpl, { oldState: string; cancelled: boolean }>();

/** https://html.spec.whatwg.org/#queue-a-details-toggle-event-task */
function queueDetailsToggle(el: NodeImpl, oldState: string, newState: string): void {
  const prev = detailsTrackers.get(el);
  if (prev !== undefined) {
    oldState = prev.oldState;
    prev.cancelled = true;
  }
  const tracker = { oldState, cancelled: false };
  detailsTrackers.set(el, tracker);
  queueElementTask(el, () => {
    if (tracker.cancelled) return;
    detailsTrackers.delete(el);
    fireToggleEvent(el.node as HTMLElement, "toggle", oldState, newState, false);
  });
}

/** https://html.spec.whatwg.org/#details-name-group — other details in the same tree with the same name. */
function nameGroupOthers(el: NodeImpl, name: string, out: NodeImpl[]): NodeImpl[] {
  const root = treeRoot(el);
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n !== el && n.type === ELEMENT_NODE && n.tag === T.details && n.ns === HTML_NS && contentAttr(n, "name") === name) out.push(n);
  }
  return out;
}

/** https://html.spec.whatwg.org/#the-details-element */
export class HTMLDetailsElement extends HTMLElement {
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_ATTR_HOOK | F_CONNECT_HOOK;
  }

  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    if (namespace !== null) return;
    const impl = this[$impl];
    // https://html.spec.whatwg.org/#the-details-element:concept-element-attributes-change-ext step 1.
    if (localName === "name") {
      ensureClosingGiven(impl);
      return;
    }
    if (localName !== "open") return;
    // https://html.spec.whatwg.org/#the-details-element:concept-element-attributes-change-ext
    if (oldValue === null && value !== null) {
      queueDetailsToggle(impl, "closed", "open");
      // Ensure details exclusivity by closing other elements if needed.
      const name = contentAttr(impl, "name");
      if (name !== null && name !== "") {
        for (const other of nameGroupOthers(impl, name, [])) {
          if (contentAttr(other, "open") !== null) removeAttribute(other, "open");
        }
      }
    } else if (oldValue !== null && value === null) {
      queueDetailsToggle(impl, "open", "closed");
    }
  }

  override _connectedSteps(): void {
    super._connectedSteps();
    // https://html.spec.whatwg.org/#the-details-element:html-element-insertion-steps
    ensureClosingGiven(this[$impl]);
  }
}

/** https://html.spec.whatwg.org/#ensure-details-exclusivity-by-closing-the-given-element-if-needed */
function ensureClosingGiven(impl: NodeImpl): void {
  if (contentAttr(impl, "open") === null) return;
  const name = contentAttr(impl, "name");
  if (name === null || name === "") return;
  for (const other of nameGroupOthers(impl, name, [])) {
    if (contentAttr(other, "open") !== null) {
      removeAttribute(impl, "open");
      return;
    }
  }
}
bool(HTMLDetailsElement, "open");
str(HTMLDetailsElement, "name");

const SummaryBase = HTMLElement;

/**
 * <summary> uses the HTMLElement interface; this subclass (named "HTMLElement", not exposed on
 * the window) only adds activation behavior (https://html.spec.whatwg.org/#the-summary-element:activation-behaviour).
 */
export const HTMLSummaryElement: typeof SummaryBase = class HTMLElement extends SummaryBase {
  get _hasActivationBehavior(): boolean {
    return isSummaryForParentDetails(this[$impl]);
  }

  _activationBehavior(event: Event): void {
    const impl = this[$impl];
    if (!isSummaryForParentDetails(impl)) return;
    // Clicks on interactive content inside the summary (text fields, media controls, frames,
    // image maps, SVG links, ...) do not toggle it, as in browsers. Elements with their own
    // activation behavior already take the click (DOM dispatch picks the nearest one).
    const target = (event?.target as unknown as { [$impl]?: NodeImpl } | null)?.[$impl];
    if (target !== undefined && inInteractiveContent(target, impl)) return;
    const details = impl.parent!;
    // Activation runs from click()/dispatchEvent(), not a [CEReactions] call: a customized
    // details' attributeChangedCallback runs from the backup element queue (a microtask).
    outsideCEReactions(() => {
      if (contentAttr(details, "open") !== null) removeAttribute(details, "open");
      else setAttribute(details, "open", "");
    });
  }
}

/** Whether `node` is (inside) interactive content (https://html.spec.whatwg.org/#interactive-content) below `summary`. */
function inInteractiveContent(node: NodeImpl, summary: NodeImpl): boolean {
  for (let n: NodeImpl | null = node; n !== null && n !== summary; n = n.parent) {
    if (n.type !== ELEMENT_NODE) continue;
    if (n.ns === SVG_NS) {
      if (n.name === "a" && (contentAttr(n, "href") !== null || n.attrs?.some((a) => a.localName === "href"))) return true;
      continue;
    }
    if (n.ns !== HTML_NS) continue;
    switch (n.tag) {
      case T.a:
        if (contentAttr(n, "href") !== null) return true;
        break;
      case T.audio:
      case T.video:
        if (contentAttr(n, "controls") !== null) return true;
        break;
      case T.img:
        if (contentAttr(n, "usemap") !== null) return true;
        break;
      case T.input:
        if (contentAttr(n, "type")?.toLowerCase() !== "hidden") return true;
        break;
      case T.button:
      case T.details:
      case T.embed:
      case T.iframe:
      case T.label:
      case T.select:
      case T.textarea:
        return true;
    }
  }
  return false;
}

// --- <dialog> -------------------------------------------------------------------------------

/** Per-dialog state (https://html.spec.whatwg.org/#the-dialog-element), off the wrapper. */
interface DialogRecord {
  /** https://html.spec.whatwg.org/#dom-dialog-returnvalue */
  returnValue: string;
  /** https://html.spec.whatwg.org/#dialog-toggle-task-tracker */
  toggleTracker: { oldState: string; cancelled: boolean } | null;
  /** https://html.spec.whatwg.org/#dialog-close-watcher */
  closeWatcher: CloseWatcher | null;
  /** https://html.spec.whatwg.org/#request-close-return-value */
  requestCloseReturnValue: string | null;
  /** https://html.spec.whatwg.org/#request-close-source-element */
  requestCloseSource: NodeImpl | null;
  /** https://html.spec.whatwg.org/#enable-close-watcher-for-request-close */
  enableCloseWatcherForRequestClose: boolean;
}

const dialogs = new WeakMap<NodeImpl, DialogRecord>();

function dialogRecord(el: NodeImpl): DialogRecord {
  let r = dialogs.get(el);
  if (r === undefined) {
    r = { returnValue: "", toggleTracker: null, closeWatcher: null, requestCloseReturnValue: null, requestCloseSource: null, enableCloseWatcherForRequestClose: false };
    dialogs.set(el, r);
  }
  return r;
}

function nodeOf(impl: NodeImpl | null): HTMLElement | null {
  return impl === null ? null : (impl.node as HTMLElement);
}

/** https://html.spec.whatwg.org/#queue-a-dialog-toggle-event-task */
function queueDialogToggle(el: NodeImpl, oldState: string, newState: string, source: NodeImpl | null): void {
  const r = dialogRecord(el);
  // 1.
  if (r.toggleTracker !== null) {
    oldState = r.toggleTracker.oldState;
    r.toggleTracker.cancelled = true;
    r.toggleTracker = null;
  }
  // 2-3.
  const tracker = { oldState, cancelled: false };
  r.toggleTracker = tracker;
  queueElementTask(el, () => {
    if (tracker.cancelled) return;
    fireToggleEvent(el.node as HTMLElement, "toggle", oldState, newState, false, nodeOf(source));
    if (r.toggleTracker === tracker) r.toggleTracker = null;
  });
}

/** https://html.spec.whatwg.org/#computed-closed-by-state — "any", "closerequest" or "none". */
function computedClosedBy(dialog: NodeImpl): string {
  const v = contentAttr(dialog, "closedby")?.toLowerCase();
  if (v === "any" || v === "closerequest" || v === "none") return v;
  // The Auto state (missing / invalid value default).
  return matchesModal(dialog) ? "closerequest" : "none";
}

/** https://html.spec.whatwg.org/#the-dialog-element */
export class HTMLDialogElement extends HTMLElement {
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_ATTR_HOOK | F_CONNECT_HOOK;
  }

  /** https://html.spec.whatwg.org/#dom-dialog-returnvalue */
  get returnValue(): string {
    return dialogs.get(this[$impl])?.returnValue ?? "";
  }

  set returnValue(v: string) {
    dialogRecord(this[$impl]).returnValue = String(v);
  }

  /** https://html.spec.whatwg.org/#dom-dialog-closedby */
  get closedBy(): string {
    return computedClosedBy(this[$impl]);
  }

  set closedBy(v: string) {
    setAttribute(this[$impl], "closedby", String(v));
  }

  /** https://html.spec.whatwg.org/#dom-dialog-show */
  show(): void {
    const impl = this[$impl];
    // 1-2.
    if (contentAttr(impl, "open") !== null) {
      if (!matchesModal(impl)) return;
      throw new DOMException("The dialog is already open as a modal dialog.", "InvalidStateError");
    }
    // 3-4.
    if (!fireToggleEvent(this, "beforetoggle", "closed", "open", true)) return;
    if (contentAttr(impl, "open") !== null) return;
    // 5-7.
    queueDialogToggle(impl, "closed", "open", null);
    setAttribute(impl, "open", "");
    setPreviouslyFocused(impl, impl.doc[$focused]);
    // 8-10.
    const doc = impl.doc;
    const hideUntil = topmostPopoverAncestor(impl, null, false);
    hidePopoversUntil(doc, hideUntil, false, true);
    // 11.
    dialogFocusingSteps(impl);
  }

  /** https://html.spec.whatwg.org/#dom-dialog-showmodal */
  showModal(): void {
    showModalDialog(this[$impl], null);
  }

  /** https://html.spec.whatwg.org/#dom-dialog-close */
  close(returnValue?: string): void {
    closeDialog(this[$impl], returnValue === undefined ? null : String(returnValue), null);
  }

  /** https://html.spec.whatwg.org/#dom-dialog-requestclose */
  requestClose(returnValue?: string): void {
    requestCloseDialog(this[$impl], returnValue === undefined ? null : String(returnValue), null);
  }

  // https://html.spec.whatwg.org/#the-dialog-element:concept-element-attributes-change-ext
  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    // 1-2.
    if (namespace !== null || localName !== "open") return;
    const impl = this[$impl];
    // 3.
    if (value === null && oldValue !== null) dialogCleanupSteps(impl);
    // 4-5.
    if (!isFullyActive(impl.doc) || (impl.flags & F_CONNECTED) === 0) return;
    // 6.
    if (value !== null && oldValue === null) dialogSetupSteps(impl);
  }

  // https://html.spec.whatwg.org/#the-dialog-element:html-element-insertion-steps
  override _connectedSteps(): void {
    super._connectedSteps();
    const impl = this[$impl];
    if (!isFullyActive(impl.doc)) return;
    if (contentAttr(impl, "open") !== null && (impl.flags & F_CONNECTED) !== 0) dialogSetupSteps(impl);
  }

  // https://html.spec.whatwg.org/#the-dialog-element:html-element-removing-steps
  override _disconnectedSteps(): void {
    super._disconnectedSteps();
    const impl = this[$impl];
    if (contentAttr(impl, "open") !== null) dialogCleanupSteps(impl);
    removeFromTopLayer(impl);
    setModal(impl, false);
  }
}
bool(HTMLDialogElement, "open");

/** https://html.spec.whatwg.org/#show-a-modal-dialog */
function showModalDialog(subject: NodeImpl, source: NodeImpl | null): void {
  const el = subject.node as HTMLElement;
  // 1-5.
  if (contentAttr(subject, "open") !== null) {
    if (matchesModal(subject)) return;
    throw new DOMException("The dialog is already open as a non-modal dialog.", "InvalidStateError");
  }
  if (!isFullyActive(subject.doc)) throw new DOMException("The dialog's document is not fully active.", "InvalidStateError");
  if ((subject.flags & F_CONNECTED) === 0) throw new DOMException("The dialog is not connected.", "InvalidStateError");
  if (isPopoverShowing(subject)) throw new DOMException("The dialog is already open as a popover.", "InvalidStateError");
  // 6.
  if (!fireToggleEvent(el, "beforetoggle", "closed", "open", true, nodeOf(source))) return;
  // 7-9.
  if (contentAttr(subject, "open") !== null || (subject.flags & F_CONNECTED) === 0 || isPopoverShowing(subject)) return;
  // 10-11. (Adding `open` runs the dialog setup steps, establishing the close watcher.)
  queueDialogToggle(subject, "closed", "open", source);
  setAttribute(subject, "open", "");
  // 13-14. Is modal; the document is blocked by the dialog.
  setModal(subject, true);
  const doc = subject.doc;
  // The focused area may now be inert: the focus fixup rule resets it to the viewport.
  const focused = doc[$focused];
  // 15.
  if (!isInTopLayer(subject)) addToTopLayer(subject);
  if (focused !== null && isInert(focused)) blurElement(focused);
  // 16. The previously focused element is the one focused before the dialog opened.
  setPreviouslyFocused(subject, focused);
  // 17-19.
  const hideUntil = topmostPopoverAncestor(subject, null, false);
  hidePopoversUntil(doc, hideUntil, false, true);
  // 20.
  dialogFocusingSteps(subject);
}

/** https://html.spec.whatwg.org/#close-the-dialog */
function closeDialog(subject: NodeImpl, result: string | null, source: NodeImpl | null): void {
  const el = subject.node as HTMLElement;
  // 1-3.
  if (contentAttr(subject, "open") === null) return;
  fireToggleEvent(el, "beforetoggle", "open", "closed", false, nodeOf(source));
  if (contentAttr(subject, "open") === null) return;
  // 4-5. (Removing `open` runs the dialog cleanup steps.)
  queueDialogToggle(subject, "open", "closed", source);
  removeAttribute(subject, "open");
  // 6-8.
  const wasModal = matchesModal(subject);
  if (wasModal) removeFromTopLayer(subject);
  setModal(subject, false);
  // 9-11.
  const r = dialogRecord(subject);
  if (result !== null) r.returnValue = result;
  r.requestCloseReturnValue = null;
  r.requestCloseSource = null;
  // 12.
  const element = getPreviouslyFocused(subject);
  if (element !== null) {
    setPreviouslyFocused(subject, null);
    const focused = subject.doc[$focused];
    if ((focused !== null && isShadowIncludingInclusiveAncestor(subject, focused)) || wasModal) focusElement(element, { preventScroll: true });
  }
  // 13.
  queueElementTask(el, () => fireEvent(el, "close"));
}

/** https://html.spec.whatwg.org/#dialog-request-close */
function requestCloseDialog(subject: NodeImpl, returnValue: string | null, source: NodeImpl | null): void {
  // 1-2.
  if (contentAttr(subject, "open") === null) return;
  if ((subject.flags & F_CONNECTED) === 0 || !isFullyActive(subject.doc)) return;
  const r = dialogRecord(subject);
  // 3. (A dialog opened while disconnected and then inserted has a watcher from the insertion steps.)
  if (r.closeWatcher === null) return;
  // 4-8.
  r.enableCloseWatcherForRequestClose = true;
  r.requestCloseReturnValue = returnValue;
  r.requestCloseSource = source;
  try {
    requestCloseWatcher(r.closeWatcher, false);
  } finally {
    r.enableCloseWatcherForRequestClose = false;
  }
}

/** https://html.spec.whatwg.org/#dialog-setup-steps */
function dialogSetupSteps(subject: NodeImpl): void {
  const list = openDialogsList(subject.doc);
  if (list.includes(subject)) return;
  list.push(subject);
  // https://html.spec.whatwg.org/#set-the-dialog-close-watcher
  const r = dialogRecord(subject);
  if (r.closeWatcher !== null) return;
  r.closeWatcher = establishCloseWatcher(
    subject.doc,
    (canPreventClose) => fireEvent(subject.node as HTMLElement, "cancel", false, canPreventClose),
    () => closeDialog(subject, r.requestCloseReturnValue, r.requestCloseSource),
    () => r.enableCloseWatcherForRequestClose || computedClosedBy(subject) !== "none",
  );
}

/** https://html.spec.whatwg.org/#dialog-cleanup-steps */
function dialogCleanupSteps(subject: NodeImpl): void {
  const list = openDialogsList(subject.doc);
  const i = list.indexOf(subject);
  if (i !== -1) list.splice(i, 1);
  const r = dialogs.get(subject);
  if (r !== undefined && r.closeWatcher !== null) {
    destroyCloseWatcher(r.closeWatcher);
    r.closeWatcher = null;
  }
}

/** https://html.spec.whatwg.org/#dialog-focusing-steps */
function dialogFocusingSteps(subject: NodeImpl): void {
  // 2-5.
  let control: NodeImpl | null = null;
  if (contentAttr(subject, "autofocus") !== null) control = subject;
  if (control === null) control = focusDelegate(subject);
  if (control === null) control = subject;
  // 6. A dialog that is not a focusable area still gets focus (see focusElement step 1).
  focusElement(control);
}

/**
 * Steps 8-9 of https://html.spec.whatwg.org/#concept-form-submit for the forms area: when the
 * submitter's method is "dialog", close the form's nearest ancestor dialog with the
 * submitter's optional value and return true (the submission ends there).
 */
export function submitFormToDialog(form: NodeImpl, submitter: NodeImpl): boolean {
  // https://html.spec.whatwg.org/#concept-fs-method (the submitter's formmethod overrides).
  let method = submitter !== form ? contentAttr(submitter, "formmethod") : null;
  if (method === null) method = contentAttr(form, "method");
  if (method?.toLowerCase() !== "dialog") return false;
  // 9.1-9.2.
  let subject: NodeImpl | null = form.parent;
  while (subject !== null && !(subject.type === ELEMENT_NODE && subject.tag === T.dialog && subject.ns === HTML_NS)) subject = subject.parent;
  if (subject === null) return true;
  // 9.3-9.5. Image buttons return their selected coordinate (no layout: always 0,0); a form
  // submitting itself returns "" (as browsers and WPT do), other submitters their optional value.
  let result: string | null;
  if (submitter === form) result = "";
  else if (submitter.tag === T.input && contentAttr(submitter, "type")?.toLowerCase() === "image") result = "0,0";
  else result = contentAttr(submitter, "value");
  // 9.6.
  closeDialog(subject, result, null);
  return true;
}

/** https://html.spec.whatwg.org/#the-dialog-element:command-steps */
function dialogCommandSteps(element: NodeImpl, source: NodeImpl, command: string): void {
  // 1.
  if (isPopoverShowing(element)) return;
  const open = contentAttr(element, "open") !== null;
  // The button's optional value.
  const value = contentAttr(source, "value");
  if (command === "close" && open) closeDialog(element, value, source);
  else if (command === "request-close" && open) requestCloseDialog(element, value, source);
  else if (command === "show-modal" && !open) {
    try {
      showModalDialog(element, source);
    } catch {
      // Exceptions from activation behavior are not observable to the clicker.
    }
  }
}

/** https://html.spec.whatwg.org/#nearest-clicked-dialog (no layout: a click on a modal dialog counts as inside it). */
function nearestClickedDialog(target: NodeImpl): NodeImpl | null {
  for (let n: NodeImpl | null = target; n !== null; n = flatParent(n)) {
    if (n.tag === T.dialog && n.ns === HTML_NS && contentAttr(n, "open") !== null) return n;
  }
  return null;
}

/** https://html.spec.whatwg.org/#light-dismiss-open-dialogs */
function lightDismissOpenDialogs(doc: Document, target: NodeImpl, type: string): void {
  // 3.
  const list = openDialogsList(doc);
  if (list.length === 0) return;
  // 4-5.
  const ancestor = nearestClickedDialog(target);
  if (type === "pointerdown") {
    dialogPointerdownTarget(doc, ancestor);
    return;
  }
  // 6.
  const sameTarget = ancestor === dialogPointerdownTarget(doc);
  dialogPointerdownTarget(doc, null);
  if (!sameTarget) return;
  const topmostDialog = list[list.length - 1];
  if (ancestor === topmostDialog) return;
  if (computedClosedBy(topmostDialog) !== "any") return;
  const r = dialogs.get(topmostDialog);
  if (r?.closeWatcher) requestCloseWatcher(r.closeWatcher, false);
}

function isShadowIncludingInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let n: NodeImpl | null = b; n !== null; ) {
    if (n === a) return true;
    if (n.parent !== null) n = n.parent;
    else if ((n.flags & F_SHADOW_ROOT) !== 0) {
      const host: HTMLElement | null = (n.node as unknown as { [$host]: HTMLElement | null })[$host];
      n = host === null ? null : host[$impl];
    } else n = null;
  }
  return false;
}

setTopLayerDialogHooks(dialogFocusingSteps, lightDismissOpenDialogs);
setDialogCommandSteps(dialogCommandSteps);

// Registered instead of imported by forms/form-submission.ts (avoids an import cycle).
setDialogSubmission(submitFormToDialog);

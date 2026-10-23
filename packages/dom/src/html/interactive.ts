// Interactive elements: <details>, <summary>, <dialog>.
// https://html.spec.whatwg.org/#interactive-elements

import { HTMLElement } from "./HTMLElement.ts";
import { bool, contentAttr, enumerated, str } from "./reflect.ts";
import { ELEMENT_NODE, F_ATTR_HOOK, F_CONNECT_HOOK, F_CONNECTED, HTML_NS } from "../nodes/constants.ts";
import type { Document } from "../nodes/Document.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Event } from "../events/Event.ts";
import { removeAttribute, setAttribute } from "../nodes/attributes.ts";
import { T } from "../nodes/tags.ts";
import { nextInTree, treeRoot } from "../nodes/traverse.ts";
import { fireEvent, fireToggleEvent, queueTask } from "./events.ts";
import { addModal, hideAllPopoversUntil, isPopoverShowing, matchesModal, removeFromTopLayer } from "./top-layer.ts";
import { blurElement, focusDelegate, focusElement, isFocusable, isSummaryForParentDetails } from "./focus.ts";
import { $focused, $impl } from "../keys.ts";

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
  queueTask(() => {
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
    if (localName !== "open" || namespace !== null) return;
    const impl = this[$impl];
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
    // https://html.spec.whatwg.org/#ensure-details-exclusivity-by-closing-the-given-element-if-needed
    const impl = this[$impl];
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

  _activationBehavior(_event: Event): void {
    const impl = this[$impl];
    if (!isSummaryForParentDetails(impl)) return;
    const details = impl.parent!;
    if (contentAttr(details, "open") !== null) removeAttribute(details, "open");
    else setAttribute(details, "open", "");
  }
}

// --- <dialog> -------------------------------------------------------------------------------

const RETURN_VALUE = Symbol("returnValue");
const PREVIOUSLY_FOCUSED = Symbol("previouslyFocused");
const dialogTrackers = new WeakMap<NodeImpl, { oldState: string; cancelled: boolean }>();

/** https://html.spec.whatwg.org/#queue-a-dialog-toggle-event-task */
function queueDialogToggle(el: NodeImpl, oldState: string, newState: string): void {
  const prev = dialogTrackers.get(el);
  if (prev !== undefined) {
    oldState = prev.oldState;
    prev.cancelled = true;
  }
  const tracker = { oldState, cancelled: false };
  dialogTrackers.set(el, tracker);
  queueTask(() => {
    if (tracker.cancelled) return;
    dialogTrackers.delete(el);
    fireToggleEvent(el.node as HTMLElement, "toggle", oldState, newState, false);
  });
}

/** https://html.spec.whatwg.org/#the-dialog-element */
export class HTMLDialogElement extends HTMLElement {
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_ATTR_HOOK | F_CONNECT_HOOK;
  }

  get returnValue(): string {
    return (this as unknown as Record<symbol, string | undefined>)[RETURN_VALUE] ?? "";
  }

  set returnValue(v: string) {
    (this as unknown as Record<symbol, string>)[RETURN_VALUE] = String(v);
  }

  /** https://html.spec.whatwg.org/#dom-dialog-show */
  show(): void {
    const impl = this[$impl];
    if (contentAttr(impl, "open") !== null) {
      if (!matchesModal(impl)) return;
      throw new DOMException("The dialog is already open as a modal dialog.", "InvalidStateError");
    }
    if (!fireToggleEvent(this, "beforetoggle", "closed", "open", true)) return;
    if (contentAttr(impl, "open") !== null) return;
    queueDialogToggle(impl, "closed", "open");
    setAttribute(impl, "open", "");
    this._setPreviouslyFocused(impl.doc[$focused]);
    hideAllPopoversUntil(null, impl.doc, false, true);
    dialogFocusingSteps(impl);
  }

  /** https://html.spec.whatwg.org/#dom-dialog-showmodal */
  showModal(): void {
    const impl = this[$impl];
    if (contentAttr(impl, "open") !== null) {
      if (matchesModal(impl)) return;
      throw new DOMException("The dialog is already open as a non-modal dialog.", "InvalidStateError");
    }
    if ((impl.flags & F_CONNECTED) === 0) throw new DOMException("The dialog is not connected.", "InvalidStateError");
    if (isPopoverShowing(impl)) throw new DOMException("The dialog is already open as a popover.", "InvalidStateError");
    if (!fireToggleEvent(this, "beforetoggle", "closed", "open", true)) return;
    if (contentAttr(impl, "open") !== null || (impl.flags & F_CONNECTED) === 0 || isPopoverShowing(impl)) return;
    queueDialogToggle(impl, "closed", "open");
    setAttribute(impl, "open", "");
    addModal(impl);
    this._setPreviouslyFocused(impl.doc[$focused]);
    hideAllPopoversUntil(null, impl.doc, false, true);
    dialogFocusingSteps(impl);
  }

  /** https://html.spec.whatwg.org/#dom-dialog-close */
  close(returnValue?: string): void {
    closeDialog(this, returnValue === undefined ? null : String(returnValue));
  }

  /** https://html.spec.whatwg.org/#dom-dialog-requestclose (no close watcher: always cancelable). */
  requestClose(returnValue?: string): void {
    const impl = this[$impl];
    if (contentAttr(impl, "open") === null) return;
    if (!fireEvent(this, "cancel", false, true)) return;
    closeDialog(this, returnValue === undefined ? null : String(returnValue));
  }

  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    // Removing `open` directly runs the dialog cleanup steps (no close event).
    if (localName === "open" && namespace === null && value === null && oldValue !== null) {
      removeFromTopLayer(this[$impl]);
    }
  }

  override _disconnectedSteps(): void {
    super._disconnectedSteps();
    // https://html.spec.whatwg.org/#the-dialog-element:html-element-removing-steps
    removeFromTopLayer(this[$impl]);
  }

  _setPreviouslyFocused(el: NodeImpl | null): void {
    (this as unknown as Record<symbol, NodeImpl | null>)[PREVIOUSLY_FOCUSED] = el;
  }

  _takePreviouslyFocused(): NodeImpl | null {
    const rec = this as unknown as Record<symbol, NodeImpl | null | undefined>;
    const v = rec[PREVIOUSLY_FOCUSED] ?? null;
    rec[PREVIOUSLY_FOCUSED] = null;
    return v;
  }
}
bool(HTMLDialogElement, "open");
enumerated(HTMLDialogElement, "closedBy=closedby", { keywords: ["any", "closerequest", "none"] });

/** https://html.spec.whatwg.org/#close-the-dialog */
function closeDialog(dialog: HTMLDialogElement, result: string | null): void {
  const impl = dialog[$impl];
  if (contentAttr(impl, "open") === null) return;
  fireToggleEvent(dialog, "beforetoggle", "open", "closed", false);
  if (contentAttr(impl, "open") === null) return;
  queueDialogToggle(impl, "open", "closed");
  removeAttribute(impl, "open");
  removeFromTopLayer(impl);
  if (result !== null) dialog.returnValue = result;
  // Restore focus to the previously focused element when focus is inside the dialog (or lost).
  const prev = dialog._takePreviouslyFocused();
  const focused = impl.doc[$focused];
  if (prev !== null && (focused === null || isInclusiveAncestor(impl, focused))) {
    if ((prev.flags & F_CONNECTED) !== 0) focusElement(prev);
  }
  queueTask(() => fireEvent(dialog, "close"));
}

function isInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let n: NodeImpl | null = b; n !== null; n = n.parent) if (n === a) return true;
  return false;
}

/** https://html.spec.whatwg.org/#dialog-focusing-steps */
function dialogFocusingSteps(dialog: NodeImpl): void {
  let control: NodeImpl | null = null;
  if (contentAttr(dialog, "autofocus") !== null && isFocusable(dialog)) control = dialog;
  else control = focusDelegate(dialog);
  if (control === null) {
    if (isFocusable(dialog)) control = dialog;
    else {
      // Nothing focusable inside: focus leaves the previously focused element.
      const focused = dialog.doc[$focused];
      if (focused !== null) blurElement(focused);
      return;
    }
  }
  focusElement(control);
}

// Invoker elements: the popovertarget and commandfor attributes, and CommandEvent.
// https://html.spec.whatwg.org/#the-popover-target-attributes
// https://html.spec.whatwg.org/#the-button-element:attr-button-commandfor
// https://html.spec.whatwg.org/#the-commandevent-interface
//
// The forms area's <button> activation behavior calls `buttonInvokerActivation()` (the
// commandfor / popovertarget steps of https://html.spec.whatwg.org/#the-button-element:activation-behaviour)
// and <input>'s calls `popoverTargetAttributeActivation()`; the IDL attributes are installed on
// HTMLButtonElement / HTMLInputElement by the registry.

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Element } from "../nodes/Element.ts";
import type { EventTarget } from "../events/EventTarget.ts";
import { ELEMENT_NODE, F_CONNECTED, F_SHADOW_ROOT, HTML_NS } from "../nodes/constants.ts";
import { T } from "../nodes/tags.ts";
import { treeRoot, nextElementInTree } from "../nodes/traverse.ts";
import { removeAttribute, setAttribute } from "../nodes/attributes.ts";
import { contentAttr, defineAccessor, enumerated } from "./reflect.ts";
import { hidePopover, isPopoverShowing, P_NONE, popoverState, showPopover } from "./top-layer.ts";
import { fireAnEvent } from "../events/fire.ts";
import { Event } from "../events/Event.ts";
import { setToStringTag } from "../events/Event.ts";
import { requireArgs } from "../events/UIEvents.ts";
import { retarget } from "../events/dispatch.ts";
import { isActuallyDisabled, formOwner } from "./forms/form-associated.ts";
import { isSubmitButton } from "./forms/form-submission.ts";
import { inputType, I_BUTTON, I_IMAGE, I_RESET, I_SUBMIT } from "./forms/input-type.ts";
import { $host, $impl } from "../keys.ts";

type Ctor = { prototype: object };

/** Explicitly set attr-associated elements (https://html.spec.whatwg.org/#explicitly-set-attr-element). */
const explicit = new WeakMap<NodeImpl, Map<string, WeakRef<Element>>>();

function isShadowIncludingAncestor(a: NodeImpl, b: NodeImpl): boolean {
  for (let n: NodeImpl | null = b; n !== null;) {
    const p: NodeImpl | null = n.parent;
    if (p !== null) n = p;
    else if ((n.flags & F_SHADOW_ROOT) !== 0) {
      const host: Element | null = (n.node as unknown as { [$host]: Element | null })[$host];
      n = host === null ? null : host[$impl];
    } else return false;
    if (n === a) return true;
  }
  return false;
}

/** https://html.spec.whatwg.org/#attr-associated-element */
function attrAssociated(el: NodeImpl, attr: string): NodeImpl | null {
  // 1-2. An explicitly set element counts while it is a descendant of a shadow-including
  // ancestor of the element (i.e. in the element's tree or an ancestor tree).
  const ref = explicit.get(el)?.get(attr)?.deref();
  if (ref !== undefined) {
    const impl = ref[$impl];
    const root = treeRoot(impl);
    return root === treeRoot(el) || isShadowIncludingAncestor(root, el) ? impl : null;
  }
  // 3. Else the first element in the same tree with the content attribute's value as its id.
  const id = contentAttr(el, attr);
  if (id === null || id === "") return null;
  const root = treeRoot(el);
  for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) if (n.id === id) return n;
  return null;
}

/** Element-valued reflection (https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes, Element?). */
function elementReflection(C: Ctor, idl: string, content: string): void {
  defineAccessor(
    C,
    idl,
    function () {
      const n = attrAssociated(this[$impl], content);
      return n === null ? null : n.node;
    },
    function (v: Element | null) {
      const impl = this[$impl];
      let map = explicit.get(impl);
      if (v === null || v === undefined) {
        map?.delete(content);
        removeAttribute(impl, content);
        return;
      }
      if (map === undefined) explicit.set(impl, (map = new Map()));
      setAttribute(impl, content, "");
      map.set(content, new WeakRef(v));
    },
  );
}

/** PopoverTargetAttributes: popoverTargetElement, popoverTargetAction. */
export function installPopoverInvoker(C: Ctor): void {
  elementReflection(C, "popoverTargetElement", "popovertarget");
  enumerated(C, "popoverTargetAction=popovertargetaction", {
    keywords: ["toggle", "show", "hide"],
    missing: "toggle",
    invalid: "toggle",
  });
}

const BUILTIN_COMMANDS = ["toggle-popover", "show-popover", "hide-popover", "show-modal", "close", "request-close"];

/** The `command` attribute's state: a builtin keyword, the custom command itself ("--…"), or "" (Unknown). */
function commandState(el: NodeImpl): string {
  const v = contentAttr(el, "command");
  if (v === null) return "";
  if (v.startsWith("--")) return v;
  const k = v.toLowerCase();
  return BUILTIN_COMMANDS.includes(k) ? k : "";
}

/** commandForElement and command on <button>. */
export function installCommandInvoker(C: Ctor): void {
  elementReflection(C, "commandForElement", "commandfor");
  defineAccessor(
    C,
    "command",
    // https://html.spec.whatwg.org/#dom-button-command
    function () {
      return commandState(this[$impl]);
    },
    function (v) {
      setAttribute(this[$impl], "command", String(v));
    },
  );
}

/** https://html.spec.whatwg.org/#concept-button (button, or input in the Submit/Image/Reset/Button state). */
function isButton(el: NodeImpl): boolean {
  if (el.ns !== HTML_NS) return false;
  if (el.tag === T.button) return true;
  if (el.tag !== T.input) return false;
  const t = inputType(el);
  return t === I_SUBMIT || t === I_IMAGE || t === I_RESET || t === I_BUTTON;
}

function isResetButton(el: NodeImpl): boolean {
  if (el.tag === T.input) return inputType(el) === I_RESET;
  return el.tag === T.button && buttonTypeAttrState(el) === "reset";
}

/** https://html.spec.whatwg.org/#popover-target-element */
export function popoverTargetElement(node: NodeImpl): NodeImpl | null {
  // 1-3.
  if (!isButton(node) || isActuallyDisabled(node)) return null;
  // 3. Also reset buttons with a form owner: they reset the form instead (as <button>'s
  // activation behavior returns after resetting; browsers and WPT agree for <input type=reset>).
  if (formOwner(node) !== null && (isSubmitButton(node) || isResetButton(node))) return null;
  // 4-7.
  const popover = attrAssociated(node, "popovertarget");
  if (popover === null || popover.type !== ELEMENT_NODE || popoverState(popover) === P_NONE) return null;
  return popover;
}

/** https://html.spec.whatwg.org/#popover-target-attribute-activation-behavior */
export function popoverTargetAttributeActivation(node: NodeImpl, eventTarget: NodeImpl | null): void {
  // 1-2.
  const popover = popoverTargetElement(node);
  if (popover === null) return;
  // 3. Activating something inside the popover that is itself inside the invoker does nothing.
  if (
    eventTarget !== null &&
    (eventTarget === popover || isShadowIncludingAncestor(popover, eventTarget)) &&
    isShadowIncludingAncestor(node, popover)
  )
    return;
  // 4-5.
  const action = (contentAttr(node, "popovertargetaction") ?? "").toLowerCase();
  const showing = isPopoverShowing(popover);
  if (action === "show" && showing) return;
  if (action === "hide" && !showing) return;
  // 6-7.
  if (showing) hidePopover(popover, true, true, false, node);
  else {
    try {
      showPopover(popover, false, node);
    } catch {
      // check popover validity threw: validity is false.
    }
  }
}

/** https://html.spec.whatwg.org/#popover-target-element and #the-button-element's "target popover" (light dismiss). */
export function targetPopover(node: NodeImpl): NodeImpl | null {
  // 1.
  if (node.ns !== HTML_NS || node.tag !== T.button) return isButton(node) ? popoverTargetElement(node) : null;
  // 2-4.
  if (isActuallyDisabled(node)) return null;
  const target = attrAssociated(node, "commandfor");
  if (target === null) return popoverTargetElement(node);
  // 5.
  if (formOwner(node) !== null) {
    if (isSubmitButton(node)) return null;
    if (buttonTypeAttrState(node) !== "button") return null;
  }
  // 6-9.
  const command = commandState(node);
  if (command !== "toggle-popover" && command !== "hide-popover" && command !== "show-popover") return null;
  if (popoverState(target) === P_NONE) return null;
  return target;
}

/** The button `type` attribute's state: "submit", "reset", "button", or "auto" (missing/invalid). */
function buttonTypeAttrState(el: NodeImpl): string {
  const v = contentAttr(el, "type")?.toLowerCase();
  return v === "submit" || v === "reset" || v === "button" ? v : "auto";
}

export interface CommandEventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
  source?: Element | null;
  command?: string;
}

/** https://html.spec.whatwg.org/#the-commandevent-interface */
export class CommandEvent extends Event {
  #source: Element | null;
  #command: string;

  constructor(type: string, eventInitDict?: CommandEventInit | null) {
    requireArgs(arguments.length, 1, new.target.name);
    super(type, eventInitDict as never);
    const source = eventInitDict?.source ?? null;
    this.#source = source;
    this.#command = eventInitDict?.command === undefined ? "" : String(eventInitDict.command);
  }

  /** https://html.spec.whatwg.org/#dom-commandevent-source — retargeted against currentTarget. */
  get source(): Element | null {
    const source = this.#source;
    if (source === null) return null;
    const current = this.currentTarget as EventTarget | null;
    if (current === null) return source;
    return retarget(source as unknown as EventTarget, current) as unknown as Element | null;
  }

  get command(): string {
    return this.#command;
  }
}
setToStringTag(CommandEvent, 1);

/** https://html.spec.whatwg.org/#determine-if-a-command-is-valid */
function isValidCommand(command: string, target: NodeImpl): boolean {
  if (command === "") return false;
  if (command.startsWith("--")) return true;
  if (target.type !== ELEMENT_NODE || target.ns !== HTML_NS) return false;
  if (command === "toggle-popover" || command === "show-popover" || command === "hide-popover") return true;
  // Is valid command steps for <dialog>.
  if (target.tag === T.dialog) return command === "close" || command === "request-close" || command === "show-modal";
  return false;
}

/** Command steps for elements other than popovers (dialog), installed by interactive.ts. */
let dialogCommandSteps: ((dialog: NodeImpl, source: NodeImpl, command: string) => void) | null = null;

export function setDialogCommandSteps(fn: (dialog: NodeImpl, source: NodeImpl, command: string) => void): void {
  dialogCommandSteps = fn;
}

function popoverValid(el: NodeImpl, expectedToBeShowing: boolean): boolean {
  return (
    popoverState(el) !== P_NONE &&
    isPopoverShowing(el) === expectedToBeShowing &&
    (expectedToBeShowing || (el.flags & F_CONNECTED) !== 0)
  );
}

/**
 * The commandfor / popovertarget steps of the button activation behavior
 * (https://html.spec.whatwg.org/#the-button-element:activation-behaviour, after the form
 * owner steps the forms area runs). `eventTarget` is the activation event's target.
 */
export function buttonInvokerActivation(button: NodeImpl, eventTarget: NodeImpl | null = null): void {
  if (button.tag !== T.button) {
    if (button.tag === T.input) popoverTargetAttributeActivation(button, eventTarget);
    return;
  }
  // 1. (Disabled buttons are filtered by the caller too.)
  if (isActuallyDisabled(button)) return;
  // 3.3. A button with a form owner in the Auto state does nothing more.
  if (formOwner(button) !== null && buttonTypeAttrState(button) === "auto") return;
  // 4.
  const target = attrAssociated(button, "commandfor");
  if (target === null) {
    // 6.
    popoverTargetAttributeActivation(button, eventTarget);
    return;
  }
  // 5.1-5.2.
  const command = commandState(button);
  if (!isValidCommand(command, target)) return;
  // 5.3-5.4.
  const init = { cancelable: true, command, source: button.node as Element };
  if (!fireAnEvent("command", target.node as Element, CommandEvent as never, init as never)) return;
  // 5.5-5.6.
  if ((target.flags & F_CONNECTED) === 0 || command.startsWith("--")) return;
  // 5.7.
  if (command === "hide-popover") {
    if (popoverValid(target, true)) hidePopover(target, true, true, false, button);
  } else if (command === "toggle-popover") {
    if (popoverValid(target, false)) showPopover(target, false, button);
    else if (popoverValid(target, true)) hidePopover(target, true, true, false, button);
  } else if (command === "show-popover") {
    if (popoverValid(target, false)) showPopover(target, false, button);
  } else if (target.tag === T.dialog && target.ns === HTML_NS) {
    // 5.8. https://html.spec.whatwg.org/#the-dialog-element:command-steps
    dialogCommandSteps?.(target, button, command);
  }
}

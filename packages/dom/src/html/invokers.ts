// Invoker elements: the popovertarget and commandfor attributes.
// https://html.spec.whatwg.org/#popoverinvokerelement
// https://html.spec.whatwg.org/#the-button-element:attr-button-commandfor
//
// The forms area's <button> activation behavior calls `buttonInvokerActivation()` (steps 4–6
// of https://html.spec.whatwg.org/#the-button-element:activation-behaviour); the IDL attributes
// are installed on HTMLButtonElement / HTMLInputElement by the registry.

import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Element } from "../nodes/Element.ts";
import { ELEMENT_NODE, HTML_NS } from "../nodes/constants.ts";
import { T } from "../nodes/tags.ts";
import { treeRoot, nextElementInTree } from "../nodes/traverse.ts";
import { removeAttribute, setAttribute } from "../nodes/attributes.ts";
import { contentAttr, defineAccessor, enumerated } from "./reflect.ts";
import { hidePopover, isPopoverShowing, showPopover } from "./top-layer.ts";
import { fireAnEvent } from "../events/fire.ts";
import { Event } from "../events/Event.ts";
import { isActuallyDisabled } from "./forms/form-associated.ts";
import { $impl } from "../keys.ts";

type Ctor = { prototype: object };

/** Explicitly set attr-associated elements (https://html.spec.whatwg.org/#explicitly-set-attr-element). */
const explicit = new WeakMap<NodeImpl, Map<string, WeakRef<Element>>>();

/** https://html.spec.whatwg.org/#attr-associated-element — explicit element, else the id in the same tree. */
function attrAssociated(el: NodeImpl, attr: string): NodeImpl | null {
  const ref = explicit.get(el)?.get(attr)?.deref();
  if (ref !== undefined) {
    const impl = ref[$impl];
    // Valid only while in a shadow-including ancestor tree of the element (approximated: same tree).
    return treeRoot(impl) === treeRoot(el) || (impl.flags & 1) !== 0 ? impl : null;
  }
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
      map.set(content, new WeakRef(v));
      setAttribute(impl, content, "");
    },
  );
}

/** PopoverInvokerElement: popoverTargetElement, popoverTargetAction. */
export function installPopoverInvoker(C: Ctor): void {
  elementReflection(C, "popoverTargetElement", "popovertarget");
  enumerated(C, "popoverTargetAction=popovertargetaction", { keywords: ["toggle", "show", "hide"], missing: "toggle", invalid: "toggle" });
}

const COMMANDS = ["toggle-popover", "show-popover", "hide-popover", "show-modal", "close", "request-close"];

/** commandForElement and command on <button>. */
export function installCommandInvoker(C: Ctor): void {
  elementReflection(C, "commandForElement", "commandfor");
  defineAccessor(
    C,
    "command",
    function () {
      const v = contentAttr(this[$impl], "command");
      if (v === null) return "";
      if (v.startsWith("--")) return v;
      const k = v.toLowerCase();
      return COMMANDS.includes(k) ? k : "";
    },
    function (v) {
      setAttribute(this[$impl], "command", String(v));
    },
  );
}

/** https://html.spec.whatwg.org/#popover-target-attribute-activation-behavior */
function popoverTargetActivation(invoker: NodeImpl): void {
  const popover = attrAssociated(invoker, "popovertarget");
  if (popover === null || popover.type !== ELEMENT_NODE || popover.ns !== HTML_NS || contentAttr(popover, "popover") === null) return;
  const action = (contentAttr(invoker, "popovertargetaction") ?? "toggle").toLowerCase();
  const showing = isPopoverShowing(popover);
  if (showing && action === "show") return;
  if (!showing && action === "hide") return;
  if (showing) hidePopover(popover, true, true, false, invoker);
  else showPopover(popover, false, invoker);
}

/** https://html.spec.whatwg.org/#the-commandevent-interface (falls back to Event with props). */
function fireCommandEvent(target: NodeImpl, command: string, source: NodeImpl): boolean {
  const init = { cancelable: true, command, source: source.node };
  return fireAnEvent("command", target.node as Element, CommandEventFallback as never, init as never);
}

class CommandEventFallback extends Event {
  readonly command: string;
  readonly source: unknown;
  constructor(type: string, init: { command?: string; source?: unknown; cancelable?: boolean } = {}) {
    super(type, init);
    this.command = init.command ?? "";
    this.source = init.source ?? null;
  }
}

/** Steps 4–6 of the button activation behavior: commandfor, else popovertarget. */
export function buttonInvokerActivation(button: NodeImpl): void {
  if (button.tag !== T.button && button.tag !== T.input) return;
  if (isActuallyDisabled(button)) return;
  const target = button.tag === T.button ? attrAssociated(button, "commandfor") : null;
  if (target === null) {
    popoverTargetActivation(button);
    return;
  }
  // https://html.spec.whatwg.org/#the-button-element:command-steps
  const raw = contentAttr(button, "command");
  if (raw === null) return;
  const command = raw.startsWith("--") ? raw : raw.toLowerCase();
  if (!command.startsWith("--") && !COMMANDS.includes(command)) return;
  if (!fireCommandEvent(target, command, button)) return;
  if (command.startsWith("--")) return;
  const el = target.node as unknown as {
    showPopover?: () => void;
    showModal?: () => void;
    close?: (v?: string) => void;
    requestClose?: (v?: string) => void;
  };
  if (target.ns !== HTML_NS) return;
  if (contentAttr(target, "popover") !== null && command.endsWith("-popover")) {
    const showing = isPopoverShowing(target);
    if (command === "toggle-popover") {
      if (showing) hidePopover(target, true, true, false, button);
      else showPopover(target, false, button);
    } else if (command === "show-popover" && !showing) showPopover(target, false, button);
    else if (command === "hide-popover" && showing) hidePopover(target, true, true, false, button);
    return;
  }
  if (target.tag === T.dialog) {
    const open = contentAttr(target, "open") !== null;
    if (command === "show-modal" && !open && (target.flags & 1) !== 0) el.showModal!();
    else if (command === "close" && open) el.close!(contentAttr(button, "value") ?? undefined);
    else if (command === "request-close" && open) el.requestClose!(contentAttr(button, "value") ?? undefined);
  }
}

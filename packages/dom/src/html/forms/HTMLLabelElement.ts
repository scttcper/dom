// https://html.spec.whatwg.org/#the-label-element

import { HTMLElement } from "../HTMLElement.ts";
import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import type { Event } from "../../events/Event.ts";
import type { Document } from "../../nodes/Document.ts";
import { ELEMENT_NODE, F_ATTR_HOOK, F_CONNECT_HOOK, F_CONNECTED } from "../../nodes/constants.ts";
import { attr } from "../../nodes/attributes.ts";
import { T } from "../../nodes/tags.ts";
import { contentAttr, str } from "../reflect.ts";
import { formOwner, indexAdd, indexRemove, isActuallyDisabled, labeledControl } from "./form-associated.ts";
import { I_HIDDEN, inputType } from "./input-type.ts";
import { syntheticClick } from "./form-submission.ts";
import { $forLabels, $impl } from "../../keys.ts";

/** https://html.spec.whatwg.org/#interactive-content */
export function isInteractiveContent(el: NodeImpl): boolean {
  switch (el.tag) {
    case T.a:
      return contentAttr(el, "href") !== null;
    case T.audio:
    case T.video:
      return contentAttr(el, "controls") !== null;
    case T.img:
      return contentAttr(el, "usemap") !== null;
    case T.input:
      return inputType(el) !== I_HIDDEN;
    case T.button:
    case T.details:
    case T.embed:
    case T.iframe:
    case T.label:
    case T.select:
    case T.textarea:
      return true;
  }
  return false;
}

export class HTMLLabelElement extends HTMLElement {
  declare htmlFor: string;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$impl].flags |= F_ATTR_HOOK | F_CONNECT_HOOK;
  }

  // The steps below keep the document's index of connected labels by `for` value
  // (Document[$forLabels], read by form-associated.ts labelsFor).

  override _connectedSteps(): void {
    super._connectedSteps();
    const impl = this[$impl];
    const forValue = attr(impl, "for");
    if (forValue !== null) indexAdd((impl.doc[$forLabels] ??= new Map()), forValue, impl);
  }

  override _disconnectedSteps(): void {
    super._disconnectedSteps();
    const impl = this[$impl];
    const forValue = attr(impl, "for");
    if (forValue !== null) indexRemove(impl.doc[$forLabels]!, forValue, impl);
  }

  override _attributeChangedSteps(
    localName: string,
    oldValue: string | null,
    value: string | null,
    namespace: string | null,
  ): void {
    super._attributeChangedSteps(localName, oldValue, value, namespace);
    const impl = this[$impl];
    if (localName !== "for" || namespace !== null || oldValue === value || (impl.flags & F_CONNECTED) === 0) return;
    if (oldValue !== null) indexRemove(impl.doc[$forLabels]!, oldValue, impl);
    if (value !== null) indexAdd((impl.doc[$forLabels] ??= new Map()), value, impl);
  }

  /** https://html.spec.whatwg.org/#dom-label-control */
  get control(): Element | null {
    const c = labeledControl(this[$impl]);
    return c === null ? null : (c.node as Element);
  }

  /** https://html.spec.whatwg.org/#dom-label-form */
  get form(): Element | null {
    const c = labeledControl(this[$impl]);
    if (c === null) return null;
    // Only form-associated controls have a form owner (meter/progress do not).
    if (c.tag === T.meter || c.tag === T.progress) return null;
    const owner = formOwner(c);
    return owner === null ? null : (owner.node as Element);
  }

  // --- activation behavior: https://html.spec.whatwg.org/#the-label-element:activation-behaviour

  get _hasActivationBehavior(): boolean {
    return true;
  }

  _activationBehavior(event: Event | null): void {
    const label = this[$impl];
    const control = labeledControl(label);
    if (control === null) return;
    // Events targeted at the control (or inside it), or at interactive content inside the
    // label, do nothing.
    const target =
      event === null ? null : ((event.target as unknown as { [$impl]?: NodeImpl } | null)?.[$impl] ?? null);
    if (target !== null && target !== label) {
      for (let n: NodeImpl | null = target; n !== null && n !== label; n = n.parent) {
        if (n === control) return;
        if (n.type === ELEMENT_NODE && isInteractiveContent(n)) return;
      }
    }
    if (isActuallyDisabled(control)) return;
    // Platform label behavior: a synthetic click on the labeled control (which also focuses it
    // through the control's own activation in browsers).
    syntheticClick(control.node as Element);
  }
}

str(HTMLLabelElement, "htmlFor=for");

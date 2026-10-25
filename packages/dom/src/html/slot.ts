// <slot>
// https://html.spec.whatwg.org/#the-slot-element
//
// Slot assignment itself (find a slot, assign slottables, manual assignment) is owned by
// dom-core in nodes/slots.ts; this is the HTMLSlotElement interface on top of it.

import { HTMLElement } from "./HTMLElement.ts";
import { str } from "./reflect.ts";
import type { Element } from "../nodes/Element.ts";
import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { assignedElements, assignedNodes, assignManually } from "../nodes/slots.ts";
import { $impl } from "../keys.ts";

export class HTMLSlotElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-slot-assignednodes */
  assignedNodes(options?: { flatten?: boolean }): Node[] {
    return assignedNodes(this[$impl], !!options?.flatten).map((n) => n.node);
  }

  /** https://html.spec.whatwg.org/#dom-slot-assignedelements */
  assignedElements(options?: { flatten?: boolean }): Element[] {
    return assignedElements(this[$impl], !!options?.flatten).map((n) => n.node as Element);
  }

  /** https://html.spec.whatwg.org/#dom-slot-assign */
  assign(...nodes: (Element | Node)[]): void {
    const impls: NodeImpl[] = [];
    for (const n of nodes) {
      // WebIDL: `(Element or Text)... nodes`.
      const impl = (n as { [$impl]?: NodeImpl } | null)?.[$impl];
      if (impl === undefined || (impl.type !== 1 && impl.type !== 3)) {
        throw new TypeError(
          "Failed to execute 'assign' on 'HTMLSlotElement': parameter is not of type '(Element or Text)'.",
        );
      }
      impls.push(impl);
    }
    assignManually(this[$impl], impls);
  }
}
str(HTMLSlotElement, "name");

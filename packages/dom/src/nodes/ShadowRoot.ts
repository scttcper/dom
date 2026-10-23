// https://dom.spec.whatwg.org/#interface-shadowroot
//
// OWNER: dom-core. Created by Element.attachShadow (nodes/Element.ts). Slot assignment lives
// in nodes/slots.ts; event path handling (ShadowRoot "get the parent", retargeting) in
// events/dispatch.ts.

import { F_CONNECTED, F_SHADOW_ROOT } from "./constants.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { DocumentFragment } from "./DocumentFragment.ts";
import { treeRoot } from "./traverse.ts";
import { parseFragment, setHTMLUnsafe } from "../parser/index.ts";
import { getHTML, serializeChildren, type GetHTMLOptions } from "../serializer/index.ts";
import { $availableToElementInternals, $clonable, $declarative, $delegatesFocus, $focused, $host, $impl, $mode, $serializable, $slotAssignment, $y } from "../keys.ts";

export type ShadowRootMode = "open" | "closed";
export type SlotAssignmentMode = "manual" | "named";

export class ShadowRoot extends DocumentFragment {
  /** https://dom.spec.whatwg.org/#shadowroot-mode */
  [$mode]: ShadowRootMode;
  [$delegatesFocus]: boolean;
  [$slotAssignment]: SlotAssignmentMode;
  [$clonable]: boolean;
  [$serializable]: boolean;
  /** https://dom.spec.whatwg.org/#shadowroot-declarative */
  [$declarative]: boolean;
  /** https://dom.spec.whatwg.org/#shadowroot-available-to-element-internals */
  [$availableToElementInternals]: boolean;

  /** @internal Use Element.attachShadow. */
  constructor(doc: Document, host: Element, mode: ShadowRootMode, delegatesFocus: boolean, slotAssignment: SlotAssignmentMode, clonable: boolean, serializable: boolean) {
    if (arguments.length < 3) throw new TypeError("Illegal constructor");
    super(doc);
    const impl = this[$impl];
    impl.flags |= F_SHADOW_ROOT;
    // Connectedness is shadow-including: a shadow root is connected iff its host is.
    if ((host[$impl].flags & F_CONNECTED) !== 0) impl.flags |= F_CONNECTED;
    this[$host] = host;
    this[$mode] = mode;
    this[$delegatesFocus] = delegatesFocus;
    this[$slotAssignment] = slotAssignment;
    this[$clonable] = clonable;
    this[$serializable] = serializable;
    this[$declarative] = false;
    this[$availableToElementInternals] = false;
  }

  get mode(): ShadowRootMode {
    return this[$mode];
  }

  get host(): Element {
    return this[$host]!;
  }

  get delegatesFocus(): boolean {
    return this[$delegatesFocus];
  }

  get slotAssignment(): SlotAssignmentMode {
    return this[$slotAssignment];
  }

  get clonable(): boolean {
    return this[$clonable];
  }

  get serializable(): boolean {
    return this[$serializable];
  }

  /** https://html.spec.whatwg.org/#dom-shadowroot-innerhtml */
  get innerHTML(): string {
    return serializeChildren(this[$impl]);
  }

  set innerHTML(value: string) {
    const fragment = parseFragment(value === null ? "" : String(value), this[$host]![$impl]);
    this._replaceAll(fragment.node);
  }

  /** https://html.spec.whatwg.org/#dom-shadowroot-gethtml (serializableShadowRoots / shadowRoots options not supported) */
  getHTML(options?: GetHTMLOptions): string {
    return getHTML(this[$impl], options);
  }

  /** https://html.spec.whatwg.org/#dom-shadowroot-sethtmlunsafe */
  setHTMLUnsafe(html: string): void {
    setHTMLUnsafe(this[$impl], String(html));
  }

  /**
   * https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement — the document's
   * focused element retargeted against this shadow root, if it is in this shadow tree.
   */
  get activeElement(): Element | null {
    const self = this[$impl];
    let candidate: NodeImpl | null = self.doc[$focused];
    while (candidate !== null) {
      const root = treeRoot(candidate);
      if (root === self) return candidate.node as Element;
      if ((root.flags & F_SHADOW_ROOT) === 0) return null;
      const host = (root.node as ShadowRoot)[$host];
      candidate = host === null ? null : host[$impl];
    }
    return null;
  }

  /** CSSOM View hit testing: no layout. */
  elementFromPoint(_x: number, _y: number): Element | null {
    return null;
  }

  elementsFromPoint(_x: number, _y: number): Element[] {
    return [];
  }

  getAnimations(): unknown[] {
    return [];
  }
}

Object.defineProperty(ShadowRoot.prototype, Symbol.toStringTag, { value: "ShadowRoot", configurable: true });

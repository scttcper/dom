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

export type ShadowRootMode = "open" | "closed";
export type SlotAssignmentMode = "manual" | "named";

export class ShadowRoot extends DocumentFragment {
  /** https://dom.spec.whatwg.org/#shadowroot-mode */
  _mode: ShadowRootMode;
  _delegatesFocus: boolean;
  _slotAssignment: SlotAssignmentMode;
  _clonable: boolean;
  _serializable: boolean;
  /** https://dom.spec.whatwg.org/#shadowroot-declarative */
  _declarative: boolean;
  /** https://dom.spec.whatwg.org/#shadowroot-available-to-element-internals */
  _availableToElementInternals: boolean;

  /** @internal Use Element.attachShadow. */
  constructor(doc: Document, host: Element, mode: ShadowRootMode, delegatesFocus: boolean, slotAssignment: SlotAssignmentMode, clonable: boolean, serializable: boolean) {
    if (arguments.length < 3) throw new TypeError("Illegal constructor");
    super(doc);
    const impl = this._impl;
    impl.flags |= F_SHADOW_ROOT;
    // Connectedness is shadow-including: a shadow root is connected iff its host is.
    if ((host._impl.flags & F_CONNECTED) !== 0) impl.flags |= F_CONNECTED;
    this._host = host;
    this._mode = mode;
    this._delegatesFocus = delegatesFocus;
    this._slotAssignment = slotAssignment;
    this._clonable = clonable;
    this._serializable = serializable;
    this._declarative = false;
    this._availableToElementInternals = false;
  }

  get mode(): ShadowRootMode {
    return this._mode;
  }

  get host(): Element {
    return this._host!;
  }

  get delegatesFocus(): boolean {
    return this._delegatesFocus;
  }

  get slotAssignment(): SlotAssignmentMode {
    return this._slotAssignment;
  }

  get clonable(): boolean {
    return this._clonable;
  }

  get serializable(): boolean {
    return this._serializable;
  }

  /** https://html.spec.whatwg.org/#dom-shadowroot-innerhtml */
  get innerHTML(): string {
    return serializeChildren(this._impl);
  }

  set innerHTML(value: string) {
    const fragment = parseFragment(value === null ? "" : String(value), this._host!._impl);
    this._replaceAll(fragment.node);
  }

  /** https://html.spec.whatwg.org/#dom-shadowroot-gethtml (serializableShadowRoots / shadowRoots options not supported) */
  getHTML(options?: GetHTMLOptions): string {
    return getHTML(this._impl, options);
  }

  /** https://html.spec.whatwg.org/#dom-shadowroot-sethtmlunsafe */
  setHTMLUnsafe(html: string): void {
    setHTMLUnsafe(this._impl, String(html));
  }

  /**
   * https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement — the document's
   * focused element retargeted against this shadow root, if it is in this shadow tree.
   */
  get activeElement(): Element | null {
    const self = this._impl;
    let candidate: NodeImpl | null = self.doc._focused;
    while (candidate !== null) {
      const root = treeRoot(candidate);
      if (root === self) return candidate.node as Element;
      if ((root.flags & F_SHADOW_ROOT) === 0) return null;
      const host = (root.node as ShadowRoot)._host;
      candidate = host === null ? null : host._impl;
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

// https://dom.spec.whatwg.org/#interface-attr
//
// OWNER: dom-core. Attr nodes are created lazily for `attributes` / `getAttributeNode`;
// the element's AttrRecord stays the source of truth while attached.

import { ATTRIBUTE_NODE } from "./constants.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import { Node } from "./Node.ts";
import type { AttrRecord } from "./NodeImpl.ts";
import { changeAttribute } from "./attributes.ts";

export class Attr extends Node {
  /** Backing record while attached to an element; null for a detached Attr. */
  _record: AttrRecord | null;
  _owner: Element | null;

  /** @internal */
  constructor(doc: Document, localName: string, value: string, ns: string | null, prefix: string | null, owner: Element | null, record: AttrRecord | null = null) {
    super(ATTRIBUTE_NODE, doc);
    const impl = this._impl;
    impl.name = localName;
    impl.data = value;
    impl.ns = ns;
    impl.prefix = prefix;
    this._owner = owner;
    this._record = record;
  }

  get namespaceURI(): string | null {
    return this._impl.ns;
  }

  get prefix(): string | null {
    return this._impl.prefix;
  }

  get localName(): string {
    return this._impl.name;
  }

  get name(): string {
    const impl = this._impl;
    return impl.prefix === null ? impl.name : impl.prefix + ":" + impl.name;
  }

  override get nodeName(): string {
    return this.name;
  }

  get value(): string {
    const r = this._record;
    return r === null ? this._impl.data : r.value;
  }

  set value(value: string) {
    const v = String(value);
    const r = this._record;
    if (r === null || this._owner === null) this._impl.data = v;
    else changeAttribute(this._owner._impl, r, v);
  }

  override get nodeValue(): string {
    return this.value;
  }

  override set nodeValue(value: string | null) {
    this.value = value ?? "";
  }

  override get textContent(): string {
    return this.value;
  }

  override set textContent(value: string | null) {
    this.value = value ?? "";
  }

  get ownerElement(): Element | null {
    return this._owner;
  }

  get specified(): boolean {
    return true;
  }

  /** @internal Attach to `owner` with backing `record` (record.value is the value from now on). */
  _attach(owner: Element, record: AttrRecord): void {
    this._owner = owner;
    this._record = record;
    this._impl.doc = owner._impl.doc;
  }

  /** @internal Detach from the element, keeping the current value. */
  _detach(): void {
    const r = this._record;
    if (r !== null) this._impl.data = r.value;
    this._owner = null;
    this._record = null;
  }
}

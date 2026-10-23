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
import { $impl, $owner, $record } from "../keys.ts";

export class Attr extends Node {
  /** Backing record while attached to an element; null for a detached Attr. */
  [$record]: AttrRecord | null;
  [$owner]: Element | null;

  /** @internal */
  constructor(doc: Document, localName: string, value: string, ns: string | null, prefix: string | null, owner: Element | null, record: AttrRecord | null = null) {
    super(ATTRIBUTE_NODE, doc);
    const impl = this[$impl];
    impl.name = localName;
    impl.data = value;
    impl.ns = ns;
    impl.prefix = prefix;
    this[$owner] = owner;
    this[$record] = record;
  }

  get namespaceURI(): string | null {
    return this[$impl].ns;
  }

  get prefix(): string | null {
    return this[$impl].prefix;
  }

  get localName(): string {
    return this[$impl].name;
  }

  get name(): string {
    const impl = this[$impl];
    return impl.prefix === null ? impl.name : impl.prefix + ":" + impl.name;
  }

  override get nodeName(): string {
    return this.name;
  }

  get value(): string {
    const r = this[$record];
    return r === null ? this[$impl].data : r.value;
  }

  set value(value: string) {
    const v = String(value);
    const r = this[$record];
    if (r === null || this[$owner] === null) this[$impl].data = v;
    else changeAttribute(this[$owner][$impl], r, v);
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
    return this[$owner];
  }

  get specified(): boolean {
    return true;
  }

  /** @internal Attach to `owner` with backing `record` (record.value is the value from now on). */
  _attach(owner: Element, record: AttrRecord): void {
    this[$owner] = owner;
    this[$record] = record;
    this[$impl].doc = owner[$impl].doc;
  }

  /** @internal Detach from the element, keeping the current value. */
  _detach(): void {
    const r = this[$record];
    if (r !== null) this[$impl].data = r.value;
    this[$owner] = null;
    this[$record] = null;
  }
}

// https://dom.spec.whatwg.org/#interface-characterdata
// https://dom.spec.whatwg.org/#interface-text
// https://dom.spec.whatwg.org/#interface-comment

import {
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  PROCESSING_INSTRUCTION_NODE,
  TEXT_NODE,
} from "./constants.ts";
import type { Document } from "./Document.ts";
import { Node } from "./Node.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { replaceData, splitText } from "./character-data.ts";
import { assignedSlot as slotOf, slotAssignmentActive } from "./slots.ts";
import { currentDocument } from "../window/current.ts";
import { installChildNode, installNonDocumentTypeChildNode, type ChildNode, type NonDocumentTypeChildNode } from "./mixins.ts";
import type { Element } from "./Element.ts";

function arity(method: string, required: number, given: number): never {
  throw new TypeError(`Failed to execute '${method}' on 'CharacterData': ${required} argument${required === 1 ? "" : "s"} required, but only ${given} present.`);
}

export abstract class CharacterData extends Node {
  get data(): string {
    return this._impl.data;
  }

  set data(value: string) {
    const impl = this._impl;
    replaceData(impl, 0, impl.data.length, value === null ? "" : String(value));
  }

  get length(): number {
    return this._impl.data.length;
  }

  override get nodeValue(): string {
    return this._impl.data;
  }

  override set nodeValue(value: string | null) {
    this.data = value ?? "";
  }

  override get textContent(): string {
    return this._impl.data;
  }

  override set textContent(value: string | null) {
    this.data = value ?? "";
  }

  substringData(offset: number, count: number): string {
    if (arguments.length < 2) arity("substringData", 2, arguments.length);
    const data = this._impl.data;
    offset >>>= 0;
    count >>>= 0;
    if (offset > data.length) throw new DOMException("Offset is greater than the node's length.", "IndexSizeError");
    return data.substring(offset, offset + count);
  }

  appendData(data: string): void {
    if (arguments.length < 1) arity("appendData", 1, 0);
    const impl = this._impl;
    replaceData(impl, impl.data.length, 0, String(data));
  }

  insertData(offset: number, data: string): void {
    if (arguments.length < 2) arity("insertData", 2, arguments.length);
    replaceData(this._impl, offset >>> 0, 0, String(data));
  }

  deleteData(offset: number, count: number): void {
    if (arguments.length < 2) arity("deleteData", 2, arguments.length);
    replaceData(this._impl, offset >>> 0, count >>> 0, "");
  }

  replaceData(offset: number, count: number, data: string): void {
    if (arguments.length < 3) arity("replaceData", 3, arguments.length);
    replaceData(this._impl, offset >>> 0, count >>> 0, String(data));
  }
}
export interface CharacterData extends ChildNode, NonDocumentTypeChildNode {}
installChildNode(CharacterData);
installNonDocumentTypeChildNode(CharacterData);

export class Text extends CharacterData {
  constructor(data = "", doc: Document = currentDocument()) {
    super(TEXT_NODE, doc);
    this._impl.data = String(data);
  }

  override get nodeName(): string {
    return "#text";
  }

  /** https://dom.spec.whatwg.org/#dom-text-splittext */
  splitText(offset: number): Text {
    return splitText(this._impl, Number(offset) >>> 0).node as Text;
  }

  /** https://dom.spec.whatwg.org/#dom-text-wholetext */
  get wholeText(): string {
    let start = this._impl;
    while (start.prev !== null && (start.prev.type === TEXT_NODE || start.prev.type === CDATA_SECTION_NODE)) start = start.prev;
    let s = "";
    for (let n: NodeImpl | null = start; n !== null && (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE); n = n.next) s += n.data;
    return s;
  }

  /** https://dom.spec.whatwg.org/#dom-slotable-assignedslot */
  get assignedSlot(): Element | null {
    if (slotAssignmentActive === 0) return null;
    const slot = slotOf(this._impl);
    if (slot === null) return null;
    // Find a slot with the open flag set: only slots in open shadow roots are exposed.
    const host = this._impl.parent;
    const shadow = host === null ? null : (host.node as Element)._shadowRoot;
    return shadow !== null && shadow.mode === "open" ? (slot.node as Element) : null;
  }
}

export class CDATASection extends Text {
  constructor(data = "", doc: Document = currentDocument()) {
    super(data, doc);
    this._impl.type = CDATA_SECTION_NODE;
  }

  override get nodeName(): string {
    return "#cdata-section";
  }
}

export class Comment extends CharacterData {
  constructor(data = "", doc: Document = currentDocument()) {
    super(COMMENT_NODE, doc);
    this._impl.data = String(data);
  }

  override get nodeName(): string {
    return "#comment";
  }
}

export class ProcessingInstruction extends CharacterData {
  constructor(target: string, data: string, doc: Document = currentDocument()) {
    super(PROCESSING_INSTRUCTION_NODE, doc);
    this._impl.name = target;
    this._impl.data = data;
  }

  get target(): string {
    return this._impl.name;
  }

  override get nodeName(): string {
    return this._impl.name;
  }
}

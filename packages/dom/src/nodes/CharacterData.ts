// https://dom.spec.whatwg.org/#interface-characterdata
// https://dom.spec.whatwg.org/#interface-text
// https://dom.spec.whatwg.org/#interface-comment

import {
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  PROCESSING_INSTRUCTION_NODE,
  TEXT_NODE,
} from "./constants.ts";
import type { Document } from "./Document.ts";
import { Node } from "./Node.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { replaceData, splitText } from "./character-data.ts";
import { assignedSlot as slotOf, slotAssignmentActive } from "./slots.ts";
import { currentDocument } from "../window/current.ts";
import {
  installChildNode,
  installNonDocumentTypeChildNode,
  type ChildNode,
  type NonDocumentTypeChildNode,
} from "./mixins.ts";
import type { Element } from "./Element.ts";
import { $impl, $shadowRoot } from "../keys.ts";

function arity(method: string, required: number, given: number): never {
  throw new TypeError(
    `Failed to execute '${method}' on 'CharacterData': ${required} argument${required === 1 ? "" : "s"} required, but only ${given} present.`,
  );
}

/**
 * The node document for `new Text(data)` / `new Comment(data)`: the current global's document
 * (https://dom.spec.whatwg.org/#dom-text-text step 1). Internal callers pass the document as a
 * second argument; anything else in that position (the public constructors take ONE argument,
 * and extra arguments must be ignored) falls back to the current document.
 */
function nodeDocumentFor(doc: unknown): Document {
  return typeof doc === "object" && doc !== null && (doc as Document)[$impl]?.type === DOCUMENT_NODE
    ? (doc as Document)
    : currentDocument();
}

export abstract class CharacterData extends Node {
  get data(): string {
    return this[$impl].data;
  }

  set data(value: string) {
    const impl = this[$impl];
    replaceData(impl, 0, impl.data.length, value === null ? "" : String(value));
  }

  get length(): number {
    return this[$impl].data.length;
  }

  substringData(offset: number, count: number): string {
    if (arguments.length < 2) arity("substringData", 2, arguments.length);
    const data = this[$impl].data;
    offset >>>= 0;
    count >>>= 0;
    if (offset > data.length) throw new DOMException("Offset is greater than the node's length.", "IndexSizeError");
    return data.substring(offset, offset + count);
  }

  appendData(data: string): void {
    if (arguments.length < 1) arity("appendData", 1, 0);
    const impl = this[$impl];
    replaceData(impl, impl.data.length, 0, String(data));
  }

  insertData(offset: number, data: string): void {
    if (arguments.length < 2) arity("insertData", 2, arguments.length);
    replaceData(this[$impl], offset >>> 0, 0, String(data));
  }

  deleteData(offset: number, count: number): void {
    if (arguments.length < 2) arity("deleteData", 2, arguments.length);
    replaceData(this[$impl], offset >>> 0, count >>> 0, "");
  }

  replaceData(offset: number, count: number, data: string): void {
    if (arguments.length < 3) arity("replaceData", 3, arguments.length);
    replaceData(this[$impl], offset >>> 0, count >>> 0, String(data));
  }
}
export interface CharacterData extends ChildNode, NonDocumentTypeChildNode {}
installChildNode(CharacterData);
installNonDocumentTypeChildNode(CharacterData);

export class Text extends CharacterData {
  constructor(data = "", doc?: Document) {
    super(TEXT_NODE, nodeDocumentFor(doc));
    this[$impl].data = String(data);
  }

  /** https://dom.spec.whatwg.org/#dom-text-splittext */
  splitText(offset: number): Text {
    return splitText(this[$impl], Number(offset) >>> 0).node as Text;
  }

  /** https://dom.spec.whatwg.org/#dom-text-wholetext */
  get wholeText(): string {
    let start = this[$impl];
    while (start.prev !== null && (start.prev.type === TEXT_NODE || start.prev.type === CDATA_SECTION_NODE))
      start = start.prev;
    let s = "";
    for (
      let n: NodeImpl | null = start;
      n !== null && (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE);
      n = n.next
    )
      s += n.data;
    return s;
  }

  /** https://dom.spec.whatwg.org/#dom-slotable-assignedslot */
  get assignedSlot(): Element | null {
    if (slotAssignmentActive === 0) return null;
    const slot = slotOf(this[$impl]);
    if (slot === null) return null;
    // Find a slot with the open flag set: only slots in open shadow roots are exposed.
    const host = this[$impl].parent;
    const shadow = host === null ? null : (host.node as Element)[$shadowRoot];
    return shadow != null && shadow.mode === "open" ? (slot.node as Element) : null;
  }
}

export class CDATASection extends Text {
  constructor(data = "", doc: Document = currentDocument()) {
    super(data, doc);
    this[$impl].type = CDATA_SECTION_NODE;
  }
}

export class Comment extends CharacterData {
  constructor(data = "", doc?: Document) {
    super(COMMENT_NODE, nodeDocumentFor(doc));
    this[$impl].data = String(data);
  }
}

export class ProcessingInstruction extends CharacterData {
  constructor(target: string, data: string, doc: Document = currentDocument()) {
    super(PROCESSING_INSTRUCTION_NODE, doc);
    this[$impl].name = target;
    this[$impl].data = data;
  }

  get target(): string {
    return this[$impl].name;
  }
}

// https://dom.spec.whatwg.org/#interface-documenttype

import { DOCUMENT_TYPE_NODE } from "./constants.ts";
import type { Document } from "./Document.ts";
import { Node } from "./Node.ts";
import { installChildNode, type ChildNode } from "./mixins.ts";
import { $impl, $systemId } from "../keys.ts";

export class DocumentType extends Node {
  [$systemId]: string;

  /** @internal Use DOMImplementation.createDocumentType. */
  constructor(doc: Document, name: string, publicId: string, systemId: string) {
    super(DOCUMENT_TYPE_NODE, doc);
    const impl = this[$impl];
    impl.name = name;
    // The public ID lives in the (otherwise unused) data field; WebIDL readonly attributes are
    // prototype accessors, not own properties (https://webidl.spec.whatwg.org/#es-attributes).
    impl.data = publicId;
    this[$systemId] = systemId;
  }

  /** https://dom.spec.whatwg.org/#dom-documenttype-name */
  get name(): string {
    return this[$impl].name;
  }

  /** https://dom.spec.whatwg.org/#dom-documenttype-publicid */
  get publicId(): string {
    return this[$impl].data;
  }

  /** https://dom.spec.whatwg.org/#dom-documenttype-systemid */
  get systemId(): string {
    return this[$systemId];
  }
}

export interface DocumentType extends ChildNode {}
installChildNode(DocumentType);

// https://dom.spec.whatwg.org/#interface-documenttype

import { DOCUMENT_TYPE_NODE } from "./constants.ts";
import type { Document } from "./Document.ts";
import { Node } from "./Node.ts";
import { installChildNode, type ChildNode } from "./mixins.ts";
import { $impl } from "../keys.ts";

export class DocumentType extends Node {
  publicId: string;
  systemId: string;

  /** @internal Use DOMImplementation.createDocumentType. */
  constructor(doc: Document, name: string, publicId: string, systemId: string) {
    super(DOCUMENT_TYPE_NODE, doc);
    this[$impl].name = name;
    this.publicId = publicId;
    this.systemId = systemId;
  }

  get name(): string {
    return this[$impl].name;
  }

  override get nodeName(): string {
    return this[$impl].name;
  }
}

export interface DocumentType extends ChildNode {}
installChildNode(DocumentType);

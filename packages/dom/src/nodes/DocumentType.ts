// https://dom.spec.whatwg.org/#interface-documenttype

import { DOCUMENT_TYPE_NODE } from "./constants.ts";
import type { Document } from "./Document.ts";
import { Node } from "./Node.ts";
import { installChildNode, type ChildNode } from "./mixins.ts";

export class DocumentType extends Node {
  publicId: string;
  systemId: string;

  /** @internal Use DOMImplementation.createDocumentType. */
  constructor(doc: Document, name: string, publicId: string, systemId: string) {
    super(DOCUMENT_TYPE_NODE, doc);
    this._impl.name = name;
    this.publicId = publicId;
    this.systemId = systemId;
  }

  get name(): string {
    return this._impl.name;
  }

  override get nodeName(): string {
    return this._impl.name;
  }
}

export interface DocumentType extends ChildNode {}
installChildNode(DocumentType);

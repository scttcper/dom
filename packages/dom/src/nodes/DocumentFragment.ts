// https://dom.spec.whatwg.org/#interface-documentfragment

import { DOCUMENT_FRAGMENT_NODE } from "./constants.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import { Node } from "./Node.ts";
import { currentDocument } from "../window/current.ts";
import {
  installNonElementParentNode,
  installParentNode,
  type NonElementParentNode,
  type ParentNode,
} from "./mixins.ts";
import { $host } from "../keys.ts";

export class DocumentFragment extends Node {
  /** Host for shadow roots and template contents (https://dom.spec.whatwg.org/#concept-documentfragment-host). */
  [$host]: Element | null;

  constructor(doc: Document = currentDocument()) {
    super(DOCUMENT_FRAGMENT_NODE, doc);
    this[$host] = null;
  }
}

export interface DocumentFragment extends ParentNode, NonElementParentNode {}
installParentNode(DocumentFragment);
installNonElementParentNode(DocumentFragment);

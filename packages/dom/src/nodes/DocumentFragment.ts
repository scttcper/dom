// https://dom.spec.whatwg.org/#interface-documentfragment

import { CDATA_SECTION_NODE, DOCUMENT_FRAGMENT_NODE, TEXT_NODE } from "./constants.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import { Node } from "./Node.ts";
import { nextInTree } from "./traverse.ts";
import { currentDocument } from "../window/current.ts";
import { installNonElementParentNode, installParentNode, type NonElementParentNode, type ParentNode } from "./mixins.ts";
import { $host, $impl } from "../keys.ts";

export class DocumentFragment extends Node {
  /** Host for shadow roots and template contents (https://dom.spec.whatwg.org/#concept-documentfragment-host). */
  [$host]: Element | null;

  constructor(doc: Document = currentDocument()) {
    super(DOCUMENT_FRAGMENT_NODE, doc);
    this[$host] = null;
  }

  override get nodeName(): string {
    return "#document-fragment";
  }

  override get textContent(): string {
    const root = this[$impl];
    let s = "";
    for (let n = root.first; n !== null; n = nextInTree(n, root)) {
      if (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE) s += n.data;
    }
    return s;
  }

  override set textContent(value: string | null) {
    const v = value === null || value === undefined ? "" : String(value);
    this._replaceAll(v === "" ? null : this[$impl].doc.createTextNode(v));
  }
}

export interface DocumentFragment extends ParentNode, NonElementParentNode {}
installParentNode(DocumentFragment);
installNonElementParentNode(DocumentFragment);

// <template>
// https://html.spec.whatwg.org/#the-template-element
//
// The template contents is a DocumentFragment whose node document is the "appropriate template
// contents owner document": an inert document without a browsing context, one per document
// (so custom elements are not upgraded and scripts never run inside templates). The fragment's
// host is the template element (DocumentFragment._host), which the core uses for the
// host-including inclusive ancestor check.
//
// Parser contract (src/parser): append the children of a parsed <template> into
// `templateContents(templateImpl)` instead of the element itself. The serializer serializes
// `templateContents()` for template elements.

import { HTMLElement } from "./HTMLElement.ts";
import { Document } from "../nodes/Document.ts";
import { DocumentFragment } from "../nodes/DocumentFragment.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Element } from "../nodes/Element.ts";
import { cloneNode } from "../nodes/clone.ts";
import { F_ADOPT_HOOK } from "../nodes/constants.ts";
import { appendDetached } from "../nodes/tree.ts";
import { bool, enumerated } from "./reflect.ts";
import { $contentType, $host, $impl, $isHTML } from "../keys.ts";

const owners = new WeakMap<Document, Document>();

/** https://html.spec.whatwg.org/#appropriate-template-contents-owner-document */
export function templateContentsOwner(doc: Document): Document {
  const existing = owners.get(doc);
  if (existing !== undefined) return existing;
  const owner = doc[$isHTML] ? Document._createHTML(null) : new Document();
  if (!doc[$isHTML]) owner[$contentType] = doc[$contentType];
  // An owner document is its own owner.
  owners.set(owner, owner);
  owners.set(doc, owner);
  return owner;
}

const CONTENT = Symbol("content");

/** The template contents fragment of a template element (created on first use). */
export function templateContents(impl: NodeImpl): NodeImpl {
  return (impl.node as HTMLTemplateElement).content[$impl];
}

export class HTMLTemplateElement extends HTMLElement {
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    super(doc, localName, ns, prefix);
    // Adoption runs the template adopting steps (nodes/tree.ts calls _adoptingSteps only for
    // elements with F_ADOPT_HOOK).
    this[$impl].flags |= F_ADOPT_HOOK;
  }

  /** https://html.spec.whatwg.org/#dom-template-content */
  get content(): DocumentFragment {
    const rec = this as unknown as Record<symbol, DocumentFragment | undefined>;
    let c = rec[CONTENT];
    if (c === undefined) {
      c = new DocumentFragment(templateContentsOwner(this[$impl].doc));
      c[$host] = this;
      Object.defineProperty(this, CONTENT, { value: c, writable: true });
    }
    return c;
  }

  /** https://html.spec.whatwg.org/#the-template-element:concept-node-clone-ext (deep clones copy the contents). */
  override _cloningSteps(copy: Element, subtree?: boolean): void {
    super._cloningSteps(copy, subtree);
    if (!subtree) return;
    const src = (this as unknown as Record<symbol, DocumentFragment | undefined>)[CONTENT];
    if (src === undefined || src[$impl].first === null) return;
    const dest = (copy as HTMLTemplateElement).content;
    const destDoc = dest[$impl].doc;
    for (let c: NodeImpl | null = src[$impl].first; c !== null; c = c.next) appendDetached(cloneNode(c, destDoc, true), dest[$impl]);
  }

  /** @internal https://html.spec.whatwg.org/#the-template-element:concept-node-adopt-ext */
  override _adoptingSteps(oldDocument: Document): void {
    // A customized built-in <template is=...> still gets its adoptedCallback.
    super._adoptingSteps(oldDocument);
    // 1-2. Adopt the template contents into the new node document's appropriate template
    // contents owner document (contents never created have nothing to adopt).
    const c = (this as unknown as Record<symbol, DocumentFragment | undefined>)[CONTENT];
    if (c !== undefined) templateContentsOwner(this[$impl].doc).adoptNode(c);
  }
}
enumerated(HTMLTemplateElement, "shadowRootMode=shadowrootmode", { keywords: ["open", "closed"] });
// https://html.spec.whatwg.org/#dom-template-shadowrootslotassignment
enumerated(HTMLTemplateElement, "shadowRootSlotAssignment=shadowrootslotassignment", { keywords: ["named", "manual"], missing: "named", invalid: "named" });
bool(HTMLTemplateElement, "shadowRootDelegatesFocus=shadowrootdelegatesfocus shadowRootClonable=shadowrootclonable shadowRootSerializable=shadowrootserializable");

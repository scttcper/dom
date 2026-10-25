// Port of @testing-library/dom src/get-node-text.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/get-node-text.ts
//
// Walks NodeImpl children directly instead of `Array.from(node.childNodes).filter().map()`.

import { asciiLowercase, attr, ELEMENT_NODE, HTML_NS, TEXT_NODE, T, type NodeImpl } from "@ctrl/dom/internal";
import { implOf } from "./helpers.ts";

/** `el.matches('input[type=submit], input[type=button], input[type=reset]')` without the selector engine. */
export function isButtonLikeInput(impl: NodeImpl): boolean {
  if (impl.tag !== T.input || impl.ns !== HTML_NS) return false;
  const type = attr(impl, "type");
  if (type === null) return false;
  // `type` is matched ASCII case-insensitively by attribute selectors in HTML documents
  // (https://html.spec.whatwg.org/#case-sensitivity-of-selectors).
  const t = asciiLowercase(type);
  return t === "submit" || t === "button" || t === "reset";
}

/** Concatenated data of the direct Text children (or a button-like input's value). */
export function getNodeTextImpl(impl: NodeImpl): string {
  if (isButtonLikeInput(impl)) return (impl.node as any).value;
  let text = "";
  for (let c = impl.first; c !== null; c = c.next) {
    if (c.type === TEXT_NODE) text += c.data;
  }
  return text;
}

export function getNodeText(node: any): string {
  const impl = implOf(node);
  if (impl.type !== ELEMENT_NODE) {
    // Upstream calls `node.matches`, which only elements have.
    return node.matches("input[type=submit], input[type=button], input[type=reset]");
  }
  return getNodeTextImpl(impl);
}

// Thin wrappers over the @rtd/dom selector engine for the rare query options that take a
// CSS selector (`selector`, `ignore`). The default values never reach the engine.

import { ELEMENT_NODE, matches, type NodeImpl } from "@rtd/dom/internal";

export function matchesSelector(el: NodeImpl, selector: string): boolean {
  return el.type === ELEMENT_NODE && matches(el, selector);
}

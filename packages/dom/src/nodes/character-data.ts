// CharacterData algorithms over NodeImpl, kept in a leaf module so base modules (Node, Range)
// can value-import them without importing the CharacterData subclasses (see nodes/create.ts).
// https://dom.spec.whatwg.org/#concept-cd-replace
// https://dom.spec.whatwg.org/#concept-text-split

import { F_CHILDREN_HOOK } from "./constants.ts";
import type { Element } from "./Element.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { insert } from "./tree.ts";
import { activeObservers, queueCharacterDataMutationRecord } from "../observers/queue.ts";
import { liveRangeCount, rangesReplaceData, rangesSplitText } from "../traversal/live.ts";
import { $impl, $version } from "../keys.ts";

/** https://dom.spec.whatwg.org/#concept-cd-replace */
export function replaceData(node: NodeImpl, offset: number, count: number, data: string): void {
  const old = node.data;
  const length = old.length;
  // Steps 2-3.
  if (offset > length) throw new DOMException(`The offset ${offset} is greater than the node's length (${length}).`, "IndexSizeError");
  if (offset + count > length) count = length - offset;
  // Step 4.
  if (activeObservers !== 0) queueCharacterDataMutationRecord(node, old);
  // Steps 5-7.
  node.data = offset === 0 && count === length ? data : old.slice(0, offset) + data + old.slice(offset + count);
  // Steps 8-11.
  if (liveRangeCount !== 0) rangesReplaceData(node, offset, count, data.length);
  // Step 12: children changed steps of the parent.
  const parent = node.parent;
  if (parent !== null && (parent.flags & F_CHILDREN_HOOK) !== 0) (parent.node as Element)._childrenChangedSteps();
  node.doc[$version]++;
}

/** https://dom.spec.whatwg.org/#concept-text-split */
export function splitText(node: NodeImpl, offset: number): NodeImpl {
  const length = node.data.length;
  // Step 2.
  if (offset > length) throw new DOMException(`The offset ${offset} is larger than the Text node's length.`, "IndexSizeError");
  // Steps 3-6.
  const count = length - offset;
  const newData = node.data.slice(offset);
  const newNode = node.doc.createTextNode(newData)[$impl];
  // Step 7.
  const parent = node.parent;
  if (parent !== null) {
    insert(newNode, parent, node.next, false);
    if (liveRangeCount !== 0) rangesSplitText(node, newNode, offset, parent);
  }
  // Step 8.
  replaceData(node, offset, count, "");
  return newNode;
}


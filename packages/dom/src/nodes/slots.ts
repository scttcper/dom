// Shadow DOM slot assignment.
// https://dom.spec.whatwg.org/#light-tree-slotables
//
// OWNER: dom-core. Slot state lives in module-level WeakMaps keyed by NodeImpl so no node class
// grows fields for a feature most tests never use. The mutation algorithms call in here only
// when `slotAssignmentActive !== 0` (some shadow root has been attached in this process).
//
// HTMLSlotElement (html agent) implements assignedNodes()/assignedElements()/assign() on top of
// the exported functions; `Element.assignedSlot` / `Text.assignedSlot` use `findSlot`.

import { DOCUMENT_FRAGMENT_NODE, ELEMENT_NODE, F_HAS_SHADOW, F_SHADOW_ROOT, HTML_NS, TEXT_NODE } from "./constants.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import type { Element } from "./Element.ts";
import type { ShadowRoot } from "./ShadowRoot.ts";
import { attr } from "./attributes.ts";
import { nextInTree, treeRoot } from "./traverse.ts";
import { T } from "./tags.ts";
import { signalSlotChange } from "../observers/queue.ts";
import { $host, $impl, $shadowRoot } from "../keys.ts";

/** Number of shadow roots attached in this process; gates all slot bookkeeping. */
export let slotAssignmentActive = 0;

export function _shadowRootAttached(): void {
  slotAssignmentActive++;
}

/** slot → assigned nodes (https://dom.spec.whatwg.org/#slot-assigned-nodes). */
const assignedNodesOf = new WeakMap<NodeImpl, NodeImpl[]>();
/** slottable → assigned slot (https://dom.spec.whatwg.org/#slotable-assigned-slot). */
const assignedSlotOf = new WeakMap<NodeImpl, NodeImpl>();
/** slot → manually assigned nodes (https://dom.spec.whatwg.org/#slot-manually-assigned-nodes). */
const manuallyAssignedOf = new WeakMap<NodeImpl, NodeImpl[]>();
/** slottable → slot that manually assigned it (https://dom.spec.whatwg.org/#slottable-manual-slot-assignment). */
const manualSlotOf = new WeakMap<NodeImpl, NodeImpl>();

const EMPTY: NodeImpl[] = [];

export function isSlot(n: NodeImpl): boolean {
  return n.type === ELEMENT_NODE && n.tag === T.slot && n.ns === HTML_NS;
}

function isSlottable(n: NodeImpl): boolean {
  return n.type === ELEMENT_NODE || n.type === TEXT_NODE;
}

function shadowOf(host: NodeImpl): ShadowRoot | null {
  return (host.flags & F_HAS_SHADOW) !== 0 ? ((host.node as Element)[$shadowRoot] ?? null) : null;
}

/** https://dom.spec.whatwg.org/#slot-name */
function slotName(slot: NodeImpl): string {
  return attr(slot, "name") ?? "";
}

/** https://dom.spec.whatwg.org/#slotable-name */
function slottableName(n: NodeImpl): string {
  return n.type === ELEMENT_NODE ? (attr(n, "slot") ?? "") : "";
}

/** https://dom.spec.whatwg.org/#find-a-slot */
export function findSlot(slottable: NodeImpl, open: boolean): NodeImpl | null {
  const parent = slottable.parent;
  if (parent === null) return null;
  const shadow = shadowOf(parent);
  if (shadow === null) return null;
  if (open && shadow.mode !== "open") return null;
  const root = shadow[$impl];
  if (shadow.slotAssignment === "manual") {
    for (let n = root.first; n !== null; n = nextInTree(n, root)) {
      if (isSlot(n) && (manuallyAssignedOf.get(n) ?? EMPTY).includes(slottable)) return n;
    }
    return null;
  }
  const name = slottableName(slottable);
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (isSlot(n) && slotName(n) === name) return n;
  }
  return null;
}

/** https://dom.spec.whatwg.org/#find-slotables */
export function findSlottables(slot: NodeImpl): NodeImpl[] {
  const result: NodeImpl[] = [];
  const root = treeRoot(slot);
  if ((root.flags & F_SHADOW_ROOT) === 0) return result;
  const shadow = root.node as ShadowRoot;
  const host = shadow[$host]![$impl];
  if (shadow.slotAssignment === "manual") {
    const manual = manuallyAssignedOf.get(slot);
    if (manual !== undefined) for (const s of manual) if (s.parent === host) result.push(s);
    return result;
  }
  for (let c = host.first; c !== null; c = c.next) {
    if (isSlottable(c) && findSlot(c, false) === slot) result.push(c);
  }
  return result;
}

/** https://dom.spec.whatwg.org/#find-flattened-slotables */
export function findFlattenedSlottables(slot: NodeImpl): NodeImpl[] {
  const result: NodeImpl[] = [];
  if ((treeRoot(slot).flags & F_SHADOW_ROOT) === 0) return result;
  let slottables = findSlottables(slot);
  if (slottables.length === 0) {
    slottables = [];
    for (let c = slot.first; c !== null; c = c.next) if (isSlottable(c)) slottables.push(c);
  }
  for (const node of slottables) {
    if (isSlot(node) && (treeRoot(node).flags & F_SHADOW_ROOT) !== 0) {
      for (const t of findFlattenedSlottables(node)) result.push(t);
    } else {
      result.push(node);
    }
  }
  return result;
}

/** https://dom.spec.whatwg.org/#assign-slotables */
export function assignSlottables(slot: NodeImpl): void {
  const slottables = findSlottables(slot);
  const old = assignedNodesOf.get(slot) ?? EMPTY;
  let identical = old.length === slottables.length;
  if (identical) {
    for (let i = 0; i < old.length; i++) {
      if (old[i] !== slottables[i]) {
        identical = false;
        break;
      }
    }
  }
  if (!identical) signalSlotChange(slot);
  // Nodes that are no longer assigned here lose their assigned slot.
  for (const n of old) if (assignedSlotOf.get(n) === slot && !slottables.includes(n)) assignedSlotOf.delete(n);
  if (slottables.length === 0) assignedNodesOf.delete(slot);
  else assignedNodesOf.set(slot, slottables);
  for (const s of slottables) assignedSlotOf.set(s, slot);
}

/** https://dom.spec.whatwg.org/#assign-slotables-for-a-tree */
export function assignSlottablesForTree(root: NodeImpl): void {
  for (let n: NodeImpl | null = root; n !== null; n = nextInTree(n, root)) if (isSlot(n)) assignSlottables(n);
}

/** https://dom.spec.whatwg.org/#assign-a-slot */
export function assignASlot(slottable: NodeImpl): void {
  const slot = findSlot(slottable, false);
  if (slot !== null) assignSlottables(slot);
}

function hasSlotDescendant(node: NodeImpl): boolean {
  for (let n: NodeImpl | null = node; n !== null; n = nextInTree(n, node)) if (isSlot(n)) return true;
  return false;
}

function isEmptyShadowSlot(parent: NodeImpl): boolean {
  return isSlot(parent) && (treeRoot(parent).flags & F_SHADOW_ROOT) !== 0 && (assignedNodesOf.get(parent) ?? EMPTY).length === 0;
}

/** https://dom.spec.whatwg.org/#concept-node-insert steps 7.4-7.6, for `node` or each of `nodes`. */
export function slotsAfterInsert(parent: NodeImpl, node: NodeImpl | null, nodes: NodeImpl[] | null): void {
  const count = nodes === null ? 1 : nodes.length;
  for (let i = 0; i < count; i++) {
    const n = nodes === null ? node! : nodes[i];
    if (n.parent !== parent) continue;
    // 7.4: parent is a shadow host and n is a slottable. The spec limits this to "named" slot
    // assignment; with "manual" assignment a node manually assigned while it was elsewhere is
    // revealed when it becomes a child of the host (find a slot checks the manual assignment),
    // which is what browsers and WPT shadow-dom/imperative-slot-api.html expect.
    const shadow = shadowOf(parent);
    if (shadow !== null && isSlottable(n)) assignASlot(n);
    // 7.5
    if (isEmptyShadowSlot(parent)) signalSlotChange(parent);
    // 7.6: assign slottables for a tree with n's root (only slots inside shadow trees matter).
    if (hasSlotDescendant(n)) {
      const root = treeRoot(n);
      if ((root.flags & F_SHADOW_ROOT) !== 0) assignSlottablesForTree(root);
    }
  }
}

/** https://dom.spec.whatwg.org/#concept-node-remove steps 11-13 (after unlinking). */
export function slotsAfterRemove(node: NodeImpl, parent: NodeImpl): void {
  const slot = assignedSlotOf.get(node);
  if (slot !== undefined) assignSlottables(slot);
  if (isEmptyShadowSlot(parent)) signalSlotChange(parent);
  if (hasSlotDescendant(node)) {
    const parentRoot = treeRoot(parent);
    if ((parentRoot.flags & F_SHADOW_ROOT) !== 0) assignSlottablesForTree(parentRoot);
    assignSlottablesForTree(node);
  }
}

/**
 * Attribute change steps for `slot` (on slottables) and `name` (on slots).
 * https://dom.spec.whatwg.org/#slot-name (attribute change steps)
 * https://dom.spec.whatwg.org/#slotable-name (attribute change steps)
 */
export function slotsAttributeChanged(el: NodeImpl, localName: string, oldValue: string | null, value: string | null): void {
  if (localName === "name" && isSlot(el)) {
    if ((oldValue ?? "") === (value ?? "")) return;
    const root = treeRoot(el);
    if ((root.flags & F_SHADOW_ROOT) !== 0) assignSlottablesForTree(root);
  } else if (localName === "slot") {
    if ((oldValue ?? "") === (value ?? "")) return;
    const slot = assignedSlotOf.get(el);
    if (slot !== undefined) assignSlottables(slot);
    assignASlot(el);
  }
}

/** Assigned slot of a slottable (internal; no open-ness check). */
export function assignedSlot(n: NodeImpl): NodeImpl | null {
  return assignedSlotOf.get(n) ?? null;
}

/** https://html.spec.whatwg.org/#dom-slot-assignednodes */
export function assignedNodes(slot: NodeImpl, flatten: boolean): NodeImpl[] {
  if (!flatten) return (assignedNodesOf.get(slot) ?? EMPTY).slice();
  return findFlattenedSlottables(slot);
}

/** https://html.spec.whatwg.org/#dom-slot-assignedelements */
export function assignedElements(slot: NodeImpl, flatten: boolean): NodeImpl[] {
  return assignedNodes(slot, flatten).filter((n) => n.type === ELEMENT_NODE);
}

/** https://html.spec.whatwg.org/#dom-slot-assign */
export function assignManually(slot: NodeImpl, nodes: NodeImpl[]): void {
  // 1.
  const previous = manuallyAssignedOf.get(slot) ?? EMPTY;
  for (const n of previous) manualSlotOf.delete(n);
  // 2–3.
  const set: NodeImpl[] = [];
  let otherSlots: NodeImpl[] | null = null;
  for (const n of nodes) {
    const prevSlot = manualSlotOf.get(n);
    if (prevSlot !== undefined && prevSlot !== slot) {
      const list = manuallyAssignedOf.get(prevSlot);
      if (list !== undefined) {
        const i = list.indexOf(n);
        if (i !== -1) list.splice(i, 1);
      }
      if (otherSlots === null) otherSlots = [];
      if (!otherSlots.includes(prevSlot)) otherSlots.push(prevSlot);
    }
    if (!set.includes(n)) set.push(n);
    manualSlotOf.set(n, slot);
  }
  // 4.
  manuallyAssignedOf.set(slot, set);
  // 5. Assign slottables for a tree with this's root (signals slot changes in tree order).
  const root = treeRoot(slot);
  if ((root.flags & F_SHADOW_ROOT) !== 0) assignSlottablesForTree(root);
  // Slots in other shadow trees that lost a node (the spec's step 5 only covers this's tree;
  // browsers and WPT imperative-slot-api-cross-shadow-root.html update them too).
  if (otherSlots !== null) {
    for (const other of otherSlots) if (treeRoot(other) !== root) assignSlottables(other);
  }
}

/** For `getTheParent`: a slottable's assigned slot (when its parent is a shadow host). */
export function assignedSlotForEventPath(n: NodeImpl): NodeImpl | null {
  if (slotAssignmentActive === 0) return null;
  const p = n.parent;
  if (p === null || (p.flags & F_HAS_SHADOW) === 0) return null;
  return assignedSlotOf.get(n) ?? null;
}

export function isShadowRootImpl(n: NodeImpl): boolean {
  return n.type === DOCUMENT_FRAGMENT_NODE && (n.flags & F_SHADOW_ROOT) !== 0;
}

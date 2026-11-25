// Core mutation algorithms of the DOM Standard, operating on NodeImpl.
// https://dom.spec.whatwg.org/#mutation-algorithms
//
// Everything that changes the tree goes through these functions so that bookkeeping
// (connectedness, id index, focus fixup, mutation records, document version, element hooks)
// lives in exactly one place.

import {
  DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_TYPE_NODE,
  ELEMENT_NODE,
  F_ADOPT_HOOK,
  F_CHILD_LIST,
  F_CHILDREN_HOOK,
  F_CONNECTED,
  F_CONNECT_HOOK,
  F_FORM_ATTR,
  F_HAS_SHADOW,
  F_HTML,
  F_PAST_NAMES,
  F_RANGE,
  F_RANGE_MARKS,
  F_SHADOW_ROOT,
  HTML_NS,
  TEXT_NODE,
  CDATA_SECTION_NODE,
  COMMENT_NODE,
  PROCESSING_INSTRUCTION_NODE,
} from "./constants.ts";
import type { DocCSS } from "../css/stylesheets.ts";
import type { Document } from "./Document.ts";
import type { Element } from "./Element.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { nextInTree, snapshotChildren, treeRoot } from "./traverse.ts";
import { ceReactionsPending, flushCEReactions } from "./create.ts";
import { activeObservers, addTransientObservers, queueTreeMutationRecord } from "../observers/queue.ts";
import { NodeList } from "../collections/NodeList.ts";
import {
  liveRangeCount,
  nodeIteratorCount,
  markRangeAncestors,
  rangesAdopt,
  rangesAfterInsert,
  rangesBeforeRemove,
  iteratorsBeforeRemove,
} from "../traversal/live.ts";
import { slotsAfterInsert, slotsAfterRemove, slotAssignmentActive } from "./slots.ts";
import {
  $childNodes,
  $controlNamesVersion,
  $css,
  $derived,
  $externalFormNames,
  $focused,
  $formAttrSeen,
  $host,
  $impl,
  $isHTML,
  $nameBlanked,
  $shadowRoot,
  $treeVersion,
  $version,
} from "../keys.ts";
import { checkExternalSubtree, checkNamesInSubtree, markNamedAncestors } from "../html/forms/past-names.ts";

function hierarchyError(message: string): DOMException {
  return new DOMException(message, "HierarchyRequestError");
}

function isCharacterData(type: number): boolean {
  return (
    type === TEXT_NODE || type === CDATA_SECTION_NODE || type === COMMENT_NODE || type === PROCESSING_INSTRUCTION_NODE
  );
}

/** https://dom.spec.whatwg.org/#concept-tree-host-including-inclusive-ancestor */
function isHostIncludingInclusiveAncestor(a: NodeImpl, b: NodeImpl): boolean {
  let cur: NodeImpl | null = b;
  while (cur !== null) {
    if (cur === a) return true;
    const parent: NodeImpl | null = cur.parent;
    if (parent === null && cur.type === DOCUMENT_FRAGMENT_NODE) {
      // Shadow roots and template contents link to their host via the wrapper.
      const host: { [$impl]: NodeImpl } | null | undefined = (
        cur.node as unknown as { [$host]?: { [$impl]: NodeImpl } | null }
      )[$host];
      cur = host ? host[$impl] : null;
    } else {
      cur = parent;
    }
  }
  return false;
}

/** Whether `n` has a child of `type` other than `except`. */
function hasChildOfType(n: NodeImpl, type: number, except: NodeImpl | null): boolean {
  for (let c = n.first; c !== null; c = c.next) if (c.type === type && c !== except) return true;
  return false;
}

function doctypeFollows(child: NodeImpl): boolean {
  for (let c = child.next; c !== null; c = c.next) if (c.type === DOCUMENT_TYPE_NODE) return true;
  return false;
}

function elementPrecedes(child: NodeImpl): boolean {
  for (let c = child.prev; c !== null; c = c.prev) if (c.type === ELEMENT_NODE) return true;
  return false;
}

/**
 * Whether an element inserted into the Document `parent` before `child` would not be its only
 * element child or would precede a doctype. `replaced` (`child` itself, or null) is the child
 * being replaced, which does not count.
 */
function elementConflicts(parent: NodeImpl, child: NodeImpl | null, replaced: NodeImpl | null): boolean {
  return (
    hasChildOfType(parent, ELEMENT_NODE, replaced) ||
    (child !== null && ((child !== replaced && child.type === DOCUMENT_TYPE_NODE) || doctypeFollows(child)))
  );
}

// What ensurePreInsertionValidity checks for.
const INSERTING = 0;
/** Steps 1-6 of https://dom.spec.whatwg.org/#concept-node-replace: `child` is the node being replaced. */
const REPLACING = 1;
/** replaceChildren(): a Document parent's existing children are about to be removed. */
const REPLACING_ALL = 2;

/** https://dom.spec.whatwg.org/#concept-node-ensure-pre-insertion-validity */
export function ensurePreInsertionValidity(
  node: NodeImpl,
  parent: NodeImpl,
  child: NodeImpl | null,
  mode = INSERTING,
): void {
  const pt = parent.type;
  if (pt !== DOCUMENT_NODE && pt !== DOCUMENT_FRAGMENT_NODE && pt !== ELEMENT_NODE) {
    throw hierarchyError("The parent is not a Document, DocumentFragment or Element.");
  }
  if (isHostIncludingInclusiveAncestor(node, parent)) {
    throw hierarchyError("The new child is an ancestor of the parent.");
  }
  if (child !== null && child.parent !== parent) {
    throw new DOMException(
      mode === REPLACING
        ? "The node to be replaced is not a child of this node."
        : "The reference child is not a child of this node.",
      "NotFoundError",
    );
  }
  const nt = node.type;
  if (nt !== DOCUMENT_FRAGMENT_NODE && nt !== DOCUMENT_TYPE_NODE && nt !== ELEMENT_NODE && !isCharacterData(nt)) {
    throw hierarchyError("Nodes of this type cannot be inserted.");
  }
  if (
    ((nt === TEXT_NODE || nt === CDATA_SECTION_NODE) && pt === DOCUMENT_NODE) ||
    (nt === DOCUMENT_TYPE_NODE && pt !== DOCUMENT_NODE)
  ) {
    throw hierarchyError("Nodes of this type cannot be inserted into this parent.");
  }
  if (pt === DOCUMENT_NODE) checkDocumentChildConstraints(node, parent, child, mode);
}

/**
 * Step 6 of ensure-pre-insertion-validity / step 6 of replace. When replacing, `child` is the
 * child being replaced; it is ignored when looking for existing element/doctype children.
 */
function checkDocumentChildConstraints(node: NodeImpl, parent: NodeImpl, child: NodeImpl | null, mode: number): void {
  const nt = node.type;
  if (nt === DOCUMENT_FRAGMENT_NODE) {
    let elements = 0;
    for (let c = node.first; c !== null; c = c.next) {
      if (c.type === ELEMENT_NODE) elements++;
      else if (c.type === TEXT_NODE || c.type === CDATA_SECTION_NODE)
        throw hierarchyError("A document cannot contain text children.");
    }
    if (elements > 1) throw hierarchyError("A document can have only one document element.");
    if (elements === 0) return;
  } else if (nt !== ELEMENT_NODE && nt !== DOCUMENT_TYPE_NODE) return;
  if (mode === REPLACING_ALL) return;
  const replaced = mode === REPLACING ? child : null;
  if (nt !== DOCUMENT_TYPE_NODE) {
    if (elementConflicts(parent, child, replaced))
      throw hierarchyError("A document can have only one document element.");
  } else if (
    hasChildOfType(parent, DOCUMENT_TYPE_NODE, replaced) ||
    (child !== null ? elementPrecedes(child) : hasChildOfType(parent, ELEMENT_NODE, null))
  ) {
    throw hierarchyError("A document can have only one doctype, before the document element.");
  }
}

/**
 * Validity for replaceChildren(): like ensure-pre-insertion-validity before null, but a
 * Document's existing children are about to be removed, so they are ignored
 * (https://github.com/whatwg/dom/issues/1045).
 */
export function ensureReplaceAllValidity(node: NodeImpl, parent: NodeImpl): void {
  ensurePreInsertionValidity(node, parent, null, REPLACING_ALL);
}

/** https://dom.spec.whatwg.org/#concept-node-pre-insert */
export function preInsert(node: NodeImpl, parent: NodeImpl, child: NodeImpl | null): NodeImpl {
  ensurePreInsertionValidity(node, parent, child);
  let reference = child;
  if (reference === node) reference = node.next;
  insert(node, parent, reference, false);
  return node;
}

/** https://dom.spec.whatwg.org/#concept-node-append */
export function append(node: NodeImpl, parent: NodeImpl): NodeImpl {
  return preInsert(node, parent, null);
}

/** Link `node` (already detached) into `parent` before `child` (or last). No bookkeeping. */
function link(node: NodeImpl, parent: NodeImpl, child: NodeImpl | null): void {
  node.parent = parent;
  if ((node.flags & F_PAST_NAMES) !== 0) markNamedAncestors(parent);
  if ((node.flags & F_RANGE_MARKS) !== 0) markRangeAncestors(parent);
  if (child === null) {
    const last = parent.last;
    node.prev = last;
    node.next = null;
    if (last === null) parent.first = node;
    else last.next = node;
    parent.last = node;
  } else {
    const prev = child.prev;
    node.prev = prev;
    node.next = child;
    child.prev = node;
    if (prev === null) parent.first = node;
    else prev.next = node;
  }
  parent.childCount++;
  if ((parent.flags & F_CHILD_LIST) !== 0) {
    const list = parent.node[$childNodes]!;
    if (child === null) NodeList._appended(list, node.node);
    else NodeList._rebuild(list);
  }
}

function unlink(node: NodeImpl): void {
  const parent = node.parent!;
  const prev = node.prev;
  const next = node.next;
  if (prev === null) parent.first = next;
  else prev.next = next;
  if (next === null) parent.last = prev;
  else next.prev = prev;
  node.parent = null;
  node.prev = null;
  node.next = null;
  parent.childCount--;
  if ((parent.flags & F_CHILD_LIST) !== 0) {
    const list = parent.node[$childNodes]!;
    if (next === null) NodeList._popped(list);
    else NodeList._rebuild(list);
  }
}

/** Suspend eager childNodes maintenance on `n` for a batch of changes; returns the saved bit. */
function suspendChildList(n: NodeImpl): number {
  const bit = n.flags & F_CHILD_LIST;
  n.flags &= ~F_CHILD_LIST;
  return bit;
}

function resumeChildList(n: NodeImpl, bit: number): void {
  if (bit !== 0) {
    n.flags |= F_CHILD_LIST;
    NodeList._rebuild(n.node[$childNodes]!);
  }
}

/** https://dom.spec.whatwg.org/#concept-node-insert */
export function insert(node: NodeImpl, parent: NodeImpl, child: NodeImpl | null, suppressObservers: boolean): void {
  const isFragment = node.type === DOCUMENT_FRAGMENT_NODE;
  // Step 1-2: count; nothing to do for an empty fragment.
  const count = isFragment ? node.childCount : 1;
  if (count === 0) return;

  let nodes: NodeImpl[] | null = null;
  if (isFragment) {
    nodes = snapshotChildren(node);
    // Step 4.1: remove the fragment's children with the suppress observers flag set.
    const fragBit = suspendChildList(node);
    for (let i = 0; i < nodes.length; i++) remove(nodes[i], true);
    resumeChildList(node, fragBit);
    // Step 4.2: queue a tree mutation record for the fragment.
    if (activeObservers !== 0) queueTreeMutationRecord(node, null, nodes, null, null);
  }

  // Step 2: live range boundary points after the insertion point move right by count.
  if (liveRangeCount !== 0 && child !== null && (parent.flags & F_RANGE) !== 0) rangesAfterInsert(parent, child, count);

  // Step 6: previousSibling.
  const previousSibling = child === null ? parent.last : child.prev;
  const doc = parent.doc;
  const connected = (parent.flags & F_CONNECTED) !== 0;

  if (nodes === null) {
    insertOne(node, parent, child, doc, connected);
  } else {
    const bit = count > 1 && child !== null ? suspendChildList(parent) : 0;
    for (let i = 0; i < nodes.length; i++) insertOne(nodes[i], parent, child, doc, connected);
    resumeChildList(parent, bit);
  }

  // Step 7.7 (slot assignment) only when shadow trees with slots exist.
  if (slotAssignmentActive !== 0) slotsAfterInsert(parent, nodes === null ? node : null, nodes);

  // Step 8: queue a tree mutation record for parent.
  if (!suppressObservers && activeObservers !== 0) {
    queueTreeMutationRecord(parent, nodes ?? node, null, previousSibling, child);
  }
  // Step 9: children changed steps.
  childrenChanged(parent);
  doc[$version]++;
  doc[$treeVersion]++;
  const external = doc[$externalFormNames];
  if (external?.groups.size) {
    if (nodes === null) checkExternalSubtree(node, external);
    else for (const inserted of nodes) checkExternalSubtree(inserted, external);
  }
  // Custom element reactions queued by hooks above (html agent; see create.ts). Keep last.
  if (ceReactionsPending) flushCEReactions();
}

function insertOne(node: NodeImpl, parent: NodeImpl, child: NodeImpl | null, doc: Document, connected: boolean): void {
  // Adopt (removes from the old parent, re-homes the subtree's node document).
  if (node.parent !== null || node.doc !== doc) adopt(node, doc);
  link(node, parent, child);
  if (connected) connectSubtree(node, doc);
}

let connecting: NodeImpl | null = null;

/**
 * For connected steps: the root of the subtree (or shadow tree) being connected, else null. Its
 * nodes after the current one are in the tree but not connected yet, while
 * https://dom.spec.whatwg.org/#concept-node-insert runs every insertion step with all of them in.
 */
export function connectingRoot(): NodeImpl | null {
  return connecting;
}

/** Mark a newly inserted subtree connected; maintain the id index; run connected hooks. */
function connectSubtree(root: NodeImpl, doc: Document): void {
  const outer = connecting;
  connecting = root;
  try {
    connectNodes(root, doc);
  } finally {
    connecting = outer;
  }
}

function connectNodes(root: NodeImpl, doc: Document): void {
  for (let n: NodeImpl | null = root; n !== null; n = nextInTree(n, root)) {
    n.flags |= F_CONNECTED;
    if (n.type === ELEMENT_NODE) {
      if (n.id !== "") doc._idAdd(n);
      if ((n.flags & F_CONNECT_HOOK) !== 0) (n.node as Element)._connectedSteps();
      if ((n.flags & F_HAS_SHADOW) !== 0) connectSubtree((n.node as Element)[$shadowRoot]![$impl], doc);
    }
  }
}

/**
 * Connect the children of a document whose tree was built detached (deep `cloneNode` of a
 * Document: https://dom.spec.whatwg.org/#concept-node-clone step 6 appends the copied children
 * with the insert algorithm, so they become connected, are id-indexed and run their connected
 * steps). Not used on any hot path.
 */
export function connectDetachedChildren(docImpl: NodeImpl): void {
  const doc = docImpl.node as Document;
  for (let c = docImpl.first; c !== null; c = c.next) connectSubtree(c, doc);
  doc[$version]++;
  doc[$treeVersion]++;
  if (doc[$externalFormNames]?.groups.size) checkExternalSubtree(docImpl, doc[$externalFormNames]);
}

function disconnectSubtree(root: NodeImpl, doc: Document): void {
  for (let n: NodeImpl | null = root; n !== null; n = nextInTree(n, root)) {
    n.flags &= ~F_CONNECTED;
    if (n.type === ELEMENT_NODE) {
      if (n.id !== "") doc._idRemove(n);
      // Focus fixup rule: https://html.spec.whatwg.org/#focus-fixup-rule
      if (doc[$focused] === n) doc[$focused] = null;
      if ((n.flags & F_CONNECT_HOOK) !== 0) (n.node as Element)._disconnectedSteps();
      if ((n.flags & F_HAS_SHADOW) !== 0) disconnectSubtree((n.node as Element)[$shadowRoot]![$impl], doc);
    }
  }
}

function childrenChanged(parent: NodeImpl): void {
  if ((parent.flags & F_CHILDREN_HOOK) !== 0) (parent.node as Element)._childrenChangedSteps();
}

/** https://dom.spec.whatwg.org/#concept-node-pre-remove */
export function preRemove(child: NodeImpl, parent: NodeImpl): NodeImpl {
  if (child.parent !== parent) {
    throw new DOMException("The node to be removed is not a child of this node.", "NotFoundError");
  }
  remove(child, false);
  return child;
}

/** https://dom.spec.whatwg.org/#concept-node-remove */
export function remove(node: NodeImpl, suppressObservers: boolean): void {
  const parent = node.parent!;
  const doc = parent.doc;
  // Steps 2-6: live ranges and NodeIterator pre-removing steps (only when any exist).
  if (liveRangeCount !== 0 && ((node.flags & F_RANGE_MARKS) !== 0 || (parent.flags & F_RANGE) !== 0))
    rangesBeforeRemove(node, parent);
  if (nodeIteratorCount !== 0) iteratorsBeforeRemove(node);
  // An element whose `name` is "" for now must not be kept by the document once it is removed.
  // (attributes.ts flushBlankedName, inlined: this module does not import that one.)
  if (doc[$nameBlanked] !== null) {
    doc[$nameBlanked] = null;
    doc[$controlNamesVersion]++;
  }
  // Steps 7-8.
  const oldPrevious = node.prev;
  const oldNext = node.next;
  // Step 10.
  unlink(node);
  // Steps 11-13: slot assignment bookkeeping.
  if (slotAssignmentActive !== 0) slotsAfterRemove(node, parent);
  // Steps 14-15 (+ this implementation's connectedness/id/focus bookkeeping).
  const wasConnected = (node.flags & F_CONNECTED) !== 0;
  if (wasConnected) disconnectSubtree(node, doc);
  if ((node.flags & F_PAST_NAMES) !== 0) checkNamesInSubtree(node);
  if (activeObservers !== 0) {
    // Step 16: transient registered observers.
    addTransientObservers(parent, node);
    // Step 17.
    if (!suppressObservers) queueTreeMutationRecord(parent, null, node, oldPrevious, oldNext);
  }
  // Step 18.
  childrenChanged(parent);
  doc[$version]++;
  doc[$treeVersion]++;
  if (doc[$externalFormNames]?.groups.size) checkExternalSubtree(node, doc[$externalFormNames]);
  // Version-stamped derived caches may still reference the removed subtree: drop them now
  // instead of on their next (maybe never) lookup (nodes/derived.ts).
  doc[$derived] = null;
  // Custom element reactions queued by hooks above (html agent; see create.ts). Keep last.
  // Only a connected removal can have queued any (disconnectedCallback); reactions queued
  // earlier by the calling API (e.g. for the fragment children an insert detaches first) wait
  // for that API's own flush point, as with [CEReactions].
  if (ceReactionsPending && wasConnected) flushCEReactions();
}

/** https://dom.spec.whatwg.org/#concept-shadow-including-root */
function shadowIncludingRoot(n: NodeImpl): NodeImpl {
  let root = treeRoot(n);
  while ((root.flags & F_SHADOW_ROOT) !== 0) {
    const host = (root.node as unknown as { [$host]: { [$impl]: NodeImpl } | null })[$host];
    if (host === null) break;
    root = treeRoot(host[$impl]);
  }
  return root;
}

/**
 * https://dom.spec.whatwg.org/#move (ParentNode.moveBefore). A separate primitive from remove +
 * insert: the node keeps its connectedness, node document, focus and element state; no
 * removing/insertion (connected/disconnected) steps run. Not on any hot path.
 */
export function move(node: NodeImpl, newParent: NodeImpl, child: NodeImpl | null): void {
  // Step 1 (also guarantees same connectedness and node document).
  if (shadowIncludingRoot(newParent) !== shadowIncludingRoot(node)) {
    throw hierarchyError("The new parent is not in the same shadow-including tree as the node to move.");
  }
  // Steps 2-6.
  if (isHostIncludingInclusiveAncestor(node, newParent))
    throw hierarchyError("The node to move is an ancestor of the new parent.");
  if (child !== null && child.parent !== newParent) {
    throw new DOMException("The reference child is not a child of this node.", "NotFoundError");
  }
  const nt = node.type;
  if (nt !== ELEMENT_NODE && !isCharacterData(nt))
    throw hierarchyError("Only elements and character data nodes can be moved.");
  if (newParent.type === DOCUMENT_NODE) {
    if (nt === TEXT_NODE) throw hierarchyError("Nodes of this type cannot be moved into a document.");
    if (nt === ELEMENT_NODE && elementConflicts(newParent, child, null))
      throw hierarchyError("A document can have only one document element.");
  }
  // Step 7-8.
  const oldParent = node.parent!;
  const doc = newParent.doc;
  // Steps 9-10: live range and NodeIterator pre-remove steps.
  if (liveRangeCount !== 0 && ((node.flags & F_RANGE_MARKS) !== 0 || (oldParent.flags & F_RANGE) !== 0))
    rangesBeforeRemove(node, oldParent);
  if (nodeIteratorCount !== 0) iteratorsBeforeRemove(node);
  // Steps 11-13.
  const oldPreviousSibling = node.prev;
  const oldNextSibling = node.next;
  unlink(node);
  // Steps 14-16: slot assignment after the removal half.
  if (slotAssignmentActive !== 0) slotsAfterRemove(node, oldParent);
  // Step 17.
  if (activeObservers !== 0) addTransientObservers(oldParent, node);
  // Step 18: live ranges after the insertion point.
  if (liveRangeCount !== 0 && child !== null && (newParent.flags & F_RANGE) !== 0)
    rangesAfterInsert(newParent, child, 1);
  // Steps 19-20.
  const newPreviousSibling = child === null ? newParent.last : child.prev;
  link(node, newParent, child);
  // Steps 21-23: slot assignment after the insertion half.
  if (slotAssignmentActive !== 0) slotsAfterInsert(newParent, node, null);
  // Step 24: moving steps (custom element connectedMoveCallback is the html agent's hook).
  for (let n: NodeImpl | null = node; n !== null; n = nextInTree(n, node)) {
    if (n.type === ELEMENT_NODE && (n.flags & F_CONNECT_HOOK) !== 0)
      (n.node as Element)._movingSteps(n === node, oldParent);
  }
  if ((node.flags & F_PAST_NAMES) !== 0) checkNamesInSubtree(node);
  // Steps 25-26.
  if (activeObservers !== 0) {
    queueTreeMutationRecord(oldParent, null, node, oldPreviousSibling, oldNextSibling);
    queueTreeMutationRecord(newParent, node, null, newPreviousSibling, child);
  }
  // This implementation's state that depends on child lists (<option>, <style>, <title>, ...).
  childrenChanged(oldParent);
  if (newParent !== oldParent) childrenChanged(newParent);
  doc[$version]++;
  doc[$treeVersion]++;
  if (doc[$externalFormNames]?.groups.size) checkExternalSubtree(node, doc[$externalFormNames]);
  if (ceReactionsPending) flushCEReactions();
}

/** https://dom.spec.whatwg.org/#concept-node-replace */
export function replace(child: NodeImpl, node: NodeImpl, parent: NodeImpl): NodeImpl {
  // Steps 1-6.
  ensurePreInsertionValidity(node, parent, child, REPLACING);
  // Steps 7-9.
  let reference = child.next;
  if (reference === node) reference = node.next;
  let previousSibling = child.prev;
  if (previousSibling === node) previousSibling = node.prev;
  // Step 11: adopt node (removing it from its old parent, with a mutation record).
  if (node.parent !== null || node.doc !== parent.doc) adopt(node, parent.doc);
  // Steps 12-13.
  let removed: NodeImpl | null = null;
  if (child.parent !== null) {
    removed = child;
    remove(child, true);
  }
  const added = node.type === DOCUMENT_FRAGMENT_NODE ? snapshotChildren(node) : node;
  insert(node, parent, reference, true);
  if (activeObservers !== 0) queueTreeMutationRecord(parent, added, removed, previousSibling, reference);
  return child;
}

/** https://dom.spec.whatwg.org/#concept-node-replace-all */
export function replaceAll(node: NodeImpl | null, parent: NodeImpl): void {
  const first = parent.first;
  // Fast path: nothing to remove.
  if (first === null) {
    if (node !== null) insert(node, parent, null, false);
    return;
  }
  const removed = snapshotChildren(parent);
  const added = node?.type === DOCUMENT_FRAGMENT_NODE ? snapshotChildren(node) : node;
  const bit = suspendChildList(parent);
  for (let i = 0; i < removed.length; i++) remove(removed[i], true);
  if (node !== null) insert(node, parent, null, true);
  resumeChildList(parent, bit);
  if (activeObservers !== 0) queueTreeMutationRecord(parent, added, removed, null, null);
}

/** https://dom.spec.whatwg.org/#concept-node-adopt */
export function adopt(node: NodeImpl, doc: Document): void {
  const oldDoc = node.doc;
  if (node.parent !== null) remove(node, false);
  if (oldDoc !== doc) {
    // A detached root can still have live collection snapshots in its previous document.
    oldDoc[$derived] = null;
    // Per-node caches (style, roles, names, hidden bits) are stamped with the node document's
    // version. Versions only grow, so moving past the old document's means no entry stamped
    // there can ever match one of this document's.
    if (doc[$version] <= oldDoc[$version]) doc[$version] = oldDoc[$version] + 1;
    setNodeDocument(node, doc);
    if (oldDoc[$externalFormNames]?.groups.size) checkExternalSubtree(node, oldDoc[$externalFormNames]);
    if (liveRangeCount !== 0) rangesAdopt(node, oldDoc);
    // Step 3.2: adopting steps (template contents, custom element adoptedCallback via the html
    // agent's hook). Run after re-homing the whole subtree, in tree order.
    runAdoptingSteps(node, oldDoc);
  }
}

/** Adopting steps over the shadow-including inclusive descendants of `root`, in shadow-including tree order. */
function runAdoptingSteps(root: NodeImpl, oldDoc: Document): void {
  for (let n: NodeImpl | null = root; n !== null; n = nextInTree(n, root)) {
    if ((n.flags & F_ADOPT_HOOK) !== 0) (n.node as Element)._adoptingSteps(oldDoc);
    if ((n.flags & F_HAS_SHADOW) !== 0) runAdoptingSteps((n.node as Element)[$shadowRoot]![$impl], oldDoc);
  }
}

/** Set the node document of `root`'s shadow-including inclusive descendants (and their Attr nodes) to `doc`. */
function setNodeDocument(root: NodeImpl, doc: Document): void {
  const html = doc[$isHTML];
  for (let n: NodeImpl | null = root; n !== null; n = nextInTree(n, root)) {
    n.doc = doc;
    if (n.type === ELEMENT_NODE) {
      // F_HTML depends on the node document being an HTML document.
      if (n.ns === HTML_NS && html) n.flags |= F_HTML;
      else n.flags &= ~F_HTML;
      if ((n.flags & F_FORM_ATTR) !== 0) doc[$formAttrSeen] = true;
      const attrs = n.attrs;
      if (attrs !== null) {
        for (let i = 0; i < attrs.length; i++) {
          const a = attrs[i].attr;
          if (a !== null) a[$impl].doc = doc;
        }
      }
      if ((n.flags & F_HAS_SHADOW) !== 0) {
        // Shadow roots have no parent to remove from; their stylesheets move with them.
        const shadow = (n.node as Element)[$shadowRoot]![$impl];
        const oldCSS = shadow.doc[$css] as DocCSS | null;
        setNodeDocument(shadow, doc);
        oldCSS?.adoptShadowRoot(shadow);
      }
    }
  }
}

/**
 * Fast append used by the HTML parser and cloning while building a DETACHED tree:
 * no validity checks, no mutation records, no hooks, no version bump.
 * `parent` must not be connected and `node` must be a fresh detached node of `parent.doc`.
 */
export function appendDetached(node: NodeImpl, parent: NodeImpl): void {
  link(node, parent, null);
}

/** Link `node` (detached, same document) into `parent` before `child` with no bookkeeping. Range/clone helpers only. */
export function insertDetached(node: NodeImpl, parent: NodeImpl, child: NodeImpl | null): void {
  link(node, parent, child);
}

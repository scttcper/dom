// Mutation observers: registration storage, record queueing and microtask delivery.
// https://dom.spec.whatwg.org/#mutation-observers
//
// OWNER: dom-core. The core mutation algorithms only call into this module when
// `activeObservers !== 0`, so documents without observers pay a single integer compare per
// mutation. Registered observer lists live in a WeakMap keyed by NodeImpl; nodes that have a
// list carry F_MO_REGISTERED so the ancestor walk in `queueMutationRecord` reads only a flag
// per ancestor and touches the WeakMap only for observed nodes.

import { F_MO_REGISTERED } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { reportException } from "../events/report.ts";
import { Event } from "../events/Event.ts";
import { MutationRecord, type MutationNodes } from "./MutationRecord.ts";
import type { MutationObserver, MutationObserverInit } from "./MutationObserver.ts";
import { $callback, $transients, $id, $nodes, $records } from "../keys.ts";

/** Number of MutationObservers with registrations, including those awaiting transient cleanup. */
export let activeObservers = 0;

/** With no subtree registrations, neither queueing a record nor removing a child needs an ancestor walk. */
export let subtreeObservers = 0;

/** The observer and the finalizer can enumerate these without retaining a target, callback, or document. */
export class ObservedNode extends WeakRef<NodeImpl> {
  declare readonly nodes: Set<ObservedNode>;
  declare subtree: boolean;

  constructor(node: NodeImpl, nodes: Set<ObservedNode>, subtree: boolean) {
    super(node);
    this.nodes = nodes;
    this.subtree = subtree;
    if (nodes.size === 0) activeObservers++;
    nodes.add(this);
    if (subtree) subtreeObservers++;
  }
}

function forgetNode(ref: ObservedNode): void {
  ref.nodes.delete(ref);
  if (ref.nodes.size === 0) activeObservers--;
  if (ref.subtree) subtreeObservers--;
}

const collected = new FinalizationRegistry<ObservedNode>(forgetNode);

/** https://dom.spec.whatwg.org/#registered-observer (and transient registered observer when `source` is set). */
export class RegisteredObserver {
  declare readonly observer: MutationObserver;
  declare options: NormalizedOptions;
  declare readonly source: RegisteredObserver | null;
  declare readonly target: ObservedNode;

  constructor(
    node: NodeImpl,
    observer: MutationObserver,
    options: NormalizedOptions,
    source: RegisteredObserver | null,
  ) {
    this.observer = observer;
    this.options = options;
    this.source = source;
    this.target = new ObservedNode(node, observer[$nodes], options.subtree);
    if (source === null) collected.register(node, this.target, this.target);
    else (observer[$transients] ??= []).push(this);
  }

  updateOptions(options: NormalizedOptions): void {
    if (this.target.subtree !== options.subtree) {
      subtreeObservers += options.subtree ? 1 : -1;
      this.target.subtree = options.subtree;
    }
    this.options = options;
  }
}

/** MutationObserverInit after the defaulting steps of observe(). */
export class NormalizedOptions {
  declare childList: boolean;
  declare attributes: boolean;
  declare characterData: boolean;
  declare subtree: boolean;
  declare attributeOldValue: boolean;
  declare characterDataOldValue: boolean;
  declare attributeFilter: string[] | null;

  constructor(init: MutationObserverInit, attributes: boolean, characterData: boolean) {
    this.childList = !!init.childList;
    this.attributes = attributes;
    this.characterData = characterData;
    this.subtree = !!init.subtree;
    this.attributeOldValue = !!init.attributeOldValue;
    this.characterDataOldValue = !!init.characterDataOldValue;
    this.attributeFilter = init.attributeFilter === undefined ? null : Array.from(init.attributeFilter, String);
  }
}

const registrations = new WeakMap<NodeImpl, RegisteredObserver[]>();

/** https://dom.spec.whatwg.org/#registered-observer-list */
export function registeredObserverList(node: NodeImpl): RegisteredObserver[] | null {
  return (node.flags & F_MO_REGISTERED) !== 0 ? (registrations.get(node) ?? null) : null;
}

export function addRegistration(node: NodeImpl, registered: RegisteredObserver): void {
  let list = registeredObserverList(node);
  if (list === null) {
    list = [];
    registrations.set(node, list);
    node.flags |= F_MO_REGISTERED;
  }
  list.push(registered);
}

/** Release the observer's weak reference and the target's corresponding registration. */
export function removeRegistration(ref: ObservedNode): void {
  const node = ref.deref();
  if (node !== undefined) {
    const list = registrations.get(node)!;
    const index = list.findIndex((r) => r.target === ref);
    list.splice(index, 1);
    if (list.length === 0) {
      registrations.delete(node);
      node.flags &= ~F_MO_REGISTERED;
    }
  }
  collected.unregister(ref);
  forgetNode(ref);
}

// --- record queueing ----------------------------------------------------------------------

const TYPE_ATTRIBUTES = 0;
const TYPE_CHARACTER_DATA = 1;
const TYPE_CHILD_LIST = 2;

/** Observers with queued records, delivered at the next mutation observer microtask. */
let pending: MutationObserver[] = [];
/** https://dom.spec.whatwg.org/#signal-slots */
let signalSlots: NodeImpl[] = [];
/** https://dom.spec.whatwg.org/#mutation-observer-microtask-queued */
let microtaskQueued = false;

/** https://dom.spec.whatwg.org/#queueing-a-mutation-record */
function queueMutationRecord(
  type: number,
  target: NodeImpl,
  name: string | null,
  namespace: string | null,
  oldValue: string | null,
  added: MutationNodes,
  removed: MutationNodes,
  previousSibling: NodeImpl | null,
  nextSibling: NodeImpl | null,
): void {
  // Steps 1-3: waitFor and component effects usually have just one interested observer.
  let first: MutationObserver | null = null;
  let firstOldValue: string | null = null;
  let observers: MutationObserver[] | null = null;
  let oldValues: (string | null)[] | null = null;
  // Ancestors only matter through subtree registrations.
  const walk = subtreeObservers !== 0;
  for (let node: NodeImpl | null = target; node !== null; node = walk ? node.parent : null) {
    if ((node.flags & F_MO_REGISTERED) === 0) continue;
    const list = registrations.get(node);
    if (list === undefined) continue;
    for (let i = 0; i < list.length; i++) {
      const registered = list[i];
      const options = registered.options;
      if (node !== target && !options.subtree) continue;
      if (type === TYPE_ATTRIBUTES) {
        if (!options.attributes) continue;
        const filter = options.attributeFilter;
        if (filter !== null && (namespace !== null || !filter.includes(name!))) continue;
      } else if (type === TYPE_CHARACTER_DATA) {
        if (!options.characterData) continue;
      } else if (!options.childList) {
        continue;
      }
      const observer = registered.observer;
      const wantsOldValue =
        (type === TYPE_ATTRIBUTES && options.attributeOldValue) ||
        (type === TYPE_CHARACTER_DATA && options.characterDataOldValue);
      if (first === null || first === observer) {
        first = observer;
        if (wantsOldValue) firstOldValue = oldValue;
        continue;
      }
      if (observers === null) {
        observers = [];
        oldValues = [];
      }
      let idx = observers.indexOf(observer);
      if (idx === -1) {
        idx = observers.length;
        observers.push(observer);
        oldValues!.push(null);
      }
      if (wantsOldValue) oldValues![idx] = oldValue;
    }
  }
  if (first === null) return;
  // Step 4.
  const typeName =
    type === TYPE_ATTRIBUTES ? "attributes" : type === TYPE_CHARACTER_DATA ? "characterData" : "childList";
  const count = 1 + (observers?.length ?? 0);
  for (let i = 0; i < count; i++) {
    const observer = i === 0 ? first : observers![i - 1];
    const record = new MutationRecord(
      typeName,
      target,
      name,
      namespace,
      i === 0 ? firstOldValue : oldValues![i - 1],
      added,
      removed,
      previousSibling,
      nextSibling,
    );
    const queue = observer[$records];
    if (queue.length === 0 && !pending.includes(observer)) pending.push(observer);
    queue.push(record);
  }
  // Step 5.
  queueMutationObserverMicrotask();
}

export function queueTreeMutationRecord(
  target: NodeImpl,
  added: MutationNodes,
  removed: MutationNodes,
  previousSibling: NodeImpl | null,
  nextSibling: NodeImpl | null,
): void {
  queueMutationRecord(TYPE_CHILD_LIST, target, null, null, null, added, removed, previousSibling, nextSibling);
}

export function queueAttributeMutationRecord(
  target: NodeImpl,
  localName: string,
  namespace: string | null,
  oldValue: string | null,
): void {
  queueMutationRecord(TYPE_ATTRIBUTES, target, localName, namespace, oldValue, null, null, null, null);
}

export function queueCharacterDataMutationRecord(target: NodeImpl, oldValue: string): void {
  queueMutationRecord(TYPE_CHARACTER_DATA, target, null, null, oldValue, null, null, null, null);
}

/**
 * https://dom.spec.whatwg.org/#add-transient-registered-observers (called from the remove
 * algorithm, https://dom.spec.whatwg.org/#concept-node-remove, given node and parent).
 */
export function addTransientObservers(parent: NodeImpl, node: NodeImpl): void {
  // Step 1.1 skips every registration without `subtree`.
  if (subtreeObservers === 0) return;
  // Step 1: for each inclusive ancestor of parent, for each registered observer of it.
  for (let ancestor: NodeImpl | null = parent; ancestor !== null; ancestor = ancestor.parent) {
    if ((ancestor.flags & F_MO_REGISTERED) === 0) continue;
    const list = registrations.get(ancestor);
    if (list === undefined) continue;
    for (let i = 0; i < list.length; i++) {
      const registered = list[i];
      // Step 1.1.
      if (!registered.options.subtree) continue;
      // Step 1.2-1.3: a transient's source is always a non-transient registered observer.
      const observer = registered.observer;
      const source = registered.source ?? registered;
      // Step 1.4.
      if (hasTransientWithSource(node, source)) continue;
      // Steps 1.5-1.6.
      addRegistration(node, new RegisteredObserver(node, observer, source.options, source));
      // Steps 1.7-1.8: notify (and so drop the transients) even if no record gets queued.
      if (!pending.includes(observer)) pending.push(observer);
      queueMutationObserverMicrotask();
    }
  }
}

function hasTransientWithSource(node: NodeImpl, source: RegisteredObserver): boolean {
  const list = registeredObserverList(node);
  if (list === null) return false;
  for (let i = 0; i < list.length; i++) if (list[i].source === source) return true;
  return false;
}

/** https://dom.spec.whatwg.org/#signal-a-slot-change */
export function signalSlotChange(slot: NodeImpl): void {
  if (!signalSlots.includes(slot)) signalSlots.push(slot);
  queueMutationObserverMicrotask();
}

/** https://dom.spec.whatwg.org/#queue-a-mutation-observer-compound-microtask */
function queueMutationObserverMicrotask(): void {
  if (microtaskQueued) return;
  microtaskQueued = true;
  queueMicrotask(notifyMutationObservers);
}

/** https://dom.spec.whatwg.org/#notify-mutation-observers */
export function notifyMutationObservers(): void {
  // Step 1.
  microtaskQueued = false;
  // Step 2: observers in creation order.
  const notifySet = pending;
  pending = [];
  if (notifySet.length > 1) notifySet.sort((a, b) => a[$id] - b[$id]);
  // Step 3.
  const signalSet = signalSlots;
  signalSlots = [];
  // Step 4.
  for (let i = 0; i < notifySet.length; i++) {
    const mo = notifySet[i];
    const records = mo[$records];
    mo[$records] = [];
    removeTransientRegistrations(mo);
    if (records.length !== 0) {
      try {
        mo[$callback].call(mo, records, mo);
      } catch (e) {
        reportException(e, null);
      }
    }
  }
  // Step 5.
  for (let i = 0; i < signalSet.length; i++) {
    signalSet[i].node.dispatchEvent(new Event("slotchange", { bubbles: true }));
  }
}

/** Notify step 4.3 removes all transient registrations. Re-observing a target removes only its transients. */
export function removeTransientRegistrations(mo: MutationObserver, source?: RegisteredObserver): void {
  const transients = mo[$transients];
  if (transients === null) return;
  let kept = 0;
  for (const r of transients) {
    if (source === undefined || r.source === source) removeRegistration(r.target);
    else transients[kept++] = r;
  }
  if (kept === 0) mo[$transients] = null;
  else transients.length = kept;
}

/** @internal Drop `mo` from the pending list (disconnect). */
export function dropPending(mo: MutationObserver): void {
  const i = pending.indexOf(mo);
  if (i !== -1) pending.splice(i, 1);
}

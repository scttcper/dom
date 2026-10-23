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
import { MutationRecord } from "./MutationRecord.ts";
import type { MutationObserver, MutationObserverInit } from "./MutationObserver.ts";

/** Number of MutationObservers with at least one (non-transient) registration. */
export let activeObservers = 0;

export function setActiveObservers(n: number): void {
  activeObservers = n;
}

/** https://dom.spec.whatwg.org/#registered-observer (and transient registered observer when `source` is set). */
export class RegisteredObserver {
  observer: MutationObserver;
  options: NormalizedOptions;
  /** Non-null for a transient registered observer. */
  source: RegisteredObserver | null;

  constructor(observer: MutationObserver, options: NormalizedOptions, source: RegisteredObserver | null) {
    this.observer = observer;
    this.options = options;
    this.source = source;
  }
}

/** MutationObserverInit after the defaulting steps of observe(). */
export class NormalizedOptions {
  childList: boolean;
  attributes: boolean;
  characterData: boolean;
  subtree: boolean;
  attributeOldValue: boolean;
  characterDataOldValue: boolean;
  attributeFilter: string[] | null;

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

/** Remove the registrations of `node` matching `predicate`. */
export function removeRegistrations(node: NodeImpl, predicate: (r: RegisteredObserver) => boolean): void {
  const list = registeredObserverList(node);
  if (list === null) return;
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!predicate(list[i])) list[w++] = list[i];
  list.length = w;
  if (w === 0) {
    registrations.delete(node);
    node.flags &= ~F_MO_REGISTERED;
  }
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
  added: NodeImpl[] | null,
  removed: NodeImpl[] | null,
  previousSibling: NodeImpl | null,
  nextSibling: NodeImpl | null,
): void {
  // Steps 1-3: interested observers → mapped old value. Usually 0 or 1 observer, so a pair of
  // small arrays beats a Map.
  let observers: MutationObserver[] | null = null;
  let oldValues: (string | null)[] | null = null;
  for (let node: NodeImpl | null = target; node !== null; node = node.parent) {
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
      if ((type === TYPE_ATTRIBUTES && options.attributeOldValue) || (type === TYPE_CHARACTER_DATA && options.characterDataOldValue)) {
        oldValues![idx] = oldValue;
      }
    }
  }
  if (observers === null) return;
  // Step 4.
  const typeName = type === TYPE_ATTRIBUTES ? "attributes" : type === TYPE_CHARACTER_DATA ? "characterData" : "childList";
  for (let i = 0; i < observers.length; i++) {
    const observer = observers[i];
    const record = new MutationRecord(typeName, target, name, namespace, oldValues![i], added, removed, previousSibling, nextSibling);
    const queue = observer._records;
    if (queue.length === 0 && !pending.includes(observer)) pending.push(observer);
    queue.push(record);
  }
  // Step 5.
  queueMutationObserverMicrotask();
}

export function queueTreeMutationRecord(
  target: NodeImpl,
  added: NodeImpl[],
  removed: NodeImpl[],
  previousSibling: NodeImpl | null,
  nextSibling: NodeImpl | null,
): void {
  queueMutationRecord(TYPE_CHILD_LIST, target, null, null, null, added, removed, previousSibling, nextSibling);
}

export function queueAttributeMutationRecord(target: NodeImpl, localName: string, namespace: string | null, oldValue: string | null): void {
  queueMutationRecord(TYPE_ATTRIBUTES, target, localName, namespace, oldValue, null, null, null, null);
}

export function queueCharacterDataMutationRecord(target: NodeImpl, oldValue: string): void {
  queueMutationRecord(TYPE_CHARACTER_DATA, target, null, null, oldValue, null, null, null, null);
}

/**
 * Removal step 16: for each inclusive ancestor of `parent` with subtree registrations, add a
 * transient registered observer to `node`. https://dom.spec.whatwg.org/#concept-node-remove
 */
export function addTransientObservers(parent: NodeImpl, node: NodeImpl): void {
  for (let ancestor: NodeImpl | null = parent; ancestor !== null; ancestor = ancestor.parent) {
    if ((ancestor.flags & F_MO_REGISTERED) === 0) continue;
    const list = registrations.get(ancestor);
    if (list === undefined) continue;
    for (let i = 0; i < list.length; i++) {
      const registered = list[i];
      if (!registered.options.subtree) continue;
      addRegistration(node, new RegisteredObserver(registered.observer, registered.options, registered));
      registered.observer._nodes.push(node);
      registered.observer._hasTransients = true;
    }
  }
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
  if (notifySet.length > 1) notifySet.sort((a, b) => a._id - b._id);
  // Step 3.
  const signalSet = signalSlots;
  signalSlots = [];
  // Step 4.
  for (let i = 0; i < notifySet.length; i++) {
    const mo = notifySet[i];
    const records = mo._records;
    mo._records = [];
    removeTransientRegistrations(mo);
    if (records.length !== 0) {
      try {
        mo._callback.call(mo, records, mo);
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

/** Notify step 4.3: drop `mo`'s transient registrations from every node in its node list. */
export function removeTransientRegistrations(mo: MutationObserver): void {
  if (!mo._hasTransients) return;
  mo._hasTransients = false;
  const kept: NodeImpl[] = [];
  const nodes = mo._nodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    removeRegistrations(node, (r) => r.observer === mo && r.source !== null);
    const list = registeredObserverList(node);
    if (list !== null && !kept.includes(node) && list.some((r) => r.observer === mo)) kept.push(node);
  }
  mo._nodes = kept;
}

/** @internal Drop `mo` from the pending list (disconnect). */
export function dropPending(mo: MutationObserver): void {
  const i = pending.indexOf(mo);
  if (i !== -1) pending.splice(i, 1);
}

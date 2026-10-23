// https://dom.spec.whatwg.org/#interface-mutationobserver
//
// OWNER: dom-core. Algorithms (record queueing, delivery) live in observers/queue.ts.

import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { MutationRecord } from "./MutationRecord.ts";
import {
  NormalizedOptions,
  RegisteredObserver,
  activeObservers,
  addRegistration,
  dropPending,
  registeredObserverList,
  removeRegistrations,
  setActiveObservers,
} from "./queue.ts";
import { $callback, $hasTransients, $id, $impl, $nodes, $records } from "../keys.ts";

export interface MutationObserverInit {
  childList?: boolean;
  attributes?: boolean;
  characterData?: boolean;
  subtree?: boolean;
  attributeOldValue?: boolean;
  characterDataOldValue?: boolean;
  attributeFilter?: Iterable<string>;
}

export type MutationCallback = (mutations: MutationRecord[], observer: MutationObserver) => void;

let nextId = 0;

export class MutationObserver {
  /** @internal Creation order (notify order). */
  [$id]: number;
  /** @internal https://dom.spec.whatwg.org/#concept-mo-callback */
  [$callback]: MutationCallback;
  /** @internal https://dom.spec.whatwg.org/#concept-mo-queue */
  [$records]: MutationRecord[];
  /** @internal https://dom.spec.whatwg.org/#mutationobserver-node-list (nodes with a registration of this observer). */
  [$nodes]: NodeImpl[];
  /** @internal Whether `_nodes` may contain transient registrations. */
  [$hasTransients]: boolean;

  constructor(callback: MutationCallback) {
    if (typeof callback !== "function") {
      throw new TypeError("Failed to construct 'MutationObserver': parameter 1 is not of type 'Function'.");
    }
    this[$id] = nextId++;
    this[$callback] = callback;
    this[$records] = [];
    this[$nodes] = [];
    this[$hasTransients] = false;
  }

  /** https://dom.spec.whatwg.org/#dom-mutationobserver-observe */
  observe(target: Node, options: MutationObserverInit = {}): void {
    if (target === null || typeof target !== "object" || !($impl in target)) {
      throw new TypeError("Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.");
    }
    let attributes = options.attributes;
    let characterData = options.characterData;
    // Steps 1-2.
    if ((options.attributeOldValue !== undefined || options.attributeFilter !== undefined) && attributes === undefined) attributes = true;
    if (options.characterDataOldValue !== undefined && characterData === undefined) characterData = true;
    // Steps 3-6.
    if (!options.childList && !attributes && !characterData) {
      throw new TypeError(
        "Failed to execute 'observe' on 'MutationObserver': The options object must set at least one of 'attributes', 'characterData', or 'childList' to true.",
      );
    }
    if (options.attributeOldValue && !attributes) {
      throw new TypeError(
        "Failed to execute 'observe' on 'MutationObserver': The options object may only set 'attributeOldValue' to true when 'attributes' is true or not present.",
      );
    }
    if (options.attributeFilter !== undefined && !attributes) {
      throw new TypeError(
        "Failed to execute 'observe' on 'MutationObserver': The options object may only set 'attributeFilter' when 'attributes' is true or not present.",
      );
    }
    if (options.characterDataOldValue && !characterData) {
      throw new TypeError(
        "Failed to execute 'observe' on 'MutationObserver': The options object may only set 'characterDataOldValue' to true when 'characterData' is true or not present.",
      );
    }
    const normalized = new NormalizedOptions(options, !!attributes, !!characterData);
    const node = target[$impl];
    // Step 7.
    const list = registeredObserverList(node);
    if (list !== null) {
      for (let i = 0; i < list.length; i++) {
        const registered = list[i];
        if (registered.observer !== this || registered.source !== null) continue;
        for (const n of this[$nodes]) removeRegistrations(n, (r) => r.source === registered);
        registered.options = normalized;
        return;
      }
    }
    // Step 8.
    if (this[$nodes].length === 0) setActiveObservers(activeObservers + 1);
    addRegistration(node, new RegisteredObserver(this, normalized, null));
    this[$nodes].push(node);
  }

  /** https://dom.spec.whatwg.org/#dom-mutationobserver-disconnect */
  disconnect(): void {
    const nodes = this[$nodes];
    if (nodes.length !== 0) {
      for (let i = 0; i < nodes.length; i++) removeRegistrations(nodes[i], (r) => r.observer === this);
      this[$nodes] = [];
      setActiveObservers(activeObservers - 1);
    }
    this[$hasTransients] = false;
    this[$records] = [];
    dropPending(this);
  }

  /** https://dom.spec.whatwg.org/#dom-mutationobserver-takerecords */
  takeRecords(): MutationRecord[] {
    const records = this[$records];
    this[$records] = [];
    return records;
  }
}

Object.defineProperty(MutationObserver.prototype, Symbol.toStringTag, { value: "MutationObserver", configurable: true });

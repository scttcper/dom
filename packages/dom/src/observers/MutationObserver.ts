// https://dom.spec.whatwg.org/#interface-mutationobserver
//
// OWNER: dom-core. Algorithms (record queueing, delivery) live in observers/queue.ts.

import type { Node } from "../nodes/Node.ts";
import type { MutationRecord } from "./MutationRecord.ts";
import {
  NormalizedOptions,
  RegisteredObserver,
  type ObservedNode,
  addRegistration,
  dropPending,
  registeredObserverList,
  removeRegistration,
  removeTransientRegistrations,
} from "./queue.ts";
import { $callback, $transients, $id, $impl, $nodes, $records } from "../keys.ts";
import { setToStringTag } from "../events/Event.ts";

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
  declare [$id]: number;
  /** @internal https://dom.spec.whatwg.org/#concept-mo-callback */
  declare [$callback]: MutationCallback;
  /** @internal https://dom.spec.whatwg.org/#concept-mo-queue */
  declare [$records]: MutationRecord[];
  /** @internal https://dom.spec.whatwg.org/#mutationobserver-node-list (nodes with a registration of this observer). */
  declare [$nodes]: Set<ObservedNode>;
  /** @internal Temporary subtree registrations until the next delivery. */
  declare [$transients]: RegisteredObserver[] | null;

  constructor(callback: MutationCallback) {
    if (typeof callback !== "function") {
      throw new TypeError("Failed to construct 'MutationObserver': parameter 1 is not of type 'Function'.");
    }
    this[$id] = nextId++;
    this[$callback] = callback;
    this[$records] = [];
    this[$nodes] = new Set();
    this[$transients] = null;
  }

  /** https://dom.spec.whatwg.org/#dom-mutationobserver-observe */
  observe(target: Node, options: MutationObserverInit = {}): void {
    if (target === null || typeof target !== "object" || !($impl in target)) {
      throw new TypeError("Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.");
    }
    let attributes = options.attributes;
    let characterData = options.characterData;
    // Steps 1-2.
    if ((options.attributeOldValue !== undefined || options.attributeFilter !== undefined) && attributes === undefined)
      attributes = true;
    if (options.characterDataOldValue !== undefined && characterData === undefined) characterData = true;
    // Steps 3-6.
    if (!options.childList && !attributes && !characterData) {
      throw new TypeError(
        "Failed to execute 'observe' on 'MutationObserver': The options object must set at least one of 'attributes', 'characterData', or 'childList' to true.",
      );
    }
    if (options.attributeOldValue && !attributes) throw onlyWhen("attributeOldValue' to true", "attributes");
    if (options.attributeFilter !== undefined && !attributes) throw onlyWhen("attributeFilter'", "attributes");
    if (options.characterDataOldValue && !characterData)
      throw onlyWhen("characterDataOldValue' to true", "characterData");
    const normalized = new NormalizedOptions(options, !!attributes, !!characterData);
    const node = target[$impl];
    // Step 7.
    const list = registeredObserverList(node);
    if (list !== null) {
      for (let i = 0; i < list.length; i++) {
        const registered = list[i];
        if (registered.observer !== this || registered.source !== null) continue;
        removeTransientRegistrations(this, registered);
        registered.updateOptions(normalized);
        return;
      }
    }
    // Step 8.
    addRegistration(node, new RegisteredObserver(node, this, normalized, null));
  }

  /** https://dom.spec.whatwg.org/#dom-mutationobserver-disconnect */
  disconnect(): void {
    for (const ref of this[$nodes]) removeRegistration(ref);
    this[$transients] = null;
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

setToStringTag(MutationObserver);

/** Steps 4-6 of observe(): an option given without the option it depends on. */
function onlyWhen(option: string, dependency: string): TypeError {
  return new TypeError(
    `Failed to execute 'observe' on 'MutationObserver': The options object may only set '${option} when '${dependency}' is true or not present.`,
  );
}

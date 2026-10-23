// https://dom.spec.whatwg.org/#interface-mutationrecord
//
// OWNER: dom-core. `addedNodes` / `removedNodes` NodeLists are created on first read from the
// NodeImpl arrays the mutation algorithms pass in (shared between observers; never mutated).

import { NodeList } from "../collections/NodeList.ts";
import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";

const NONE: NodeImpl[] = [];

export class MutationRecord {
  #type: string;
  #target: NodeImpl;
  #name: string | null;
  #namespace: string | null;
  #oldValue: string | null;
  #added: NodeImpl[];
  #removed: NodeImpl[];
  #addedList: NodeList | null;
  #removedList: NodeList | null;
  #previousSibling: NodeImpl | null;
  #nextSibling: NodeImpl | null;

  /** @internal Records are created by the mutation algorithms only. */
  constructor(
    type: string,
    target: NodeImpl,
    name: string | null,
    namespace: string | null,
    oldValue: string | null,
    added: NodeImpl[] | null,
    removed: NodeImpl[] | null,
    previousSibling: NodeImpl | null,
    nextSibling: NodeImpl | null,
  ) {
    if (new.target !== MutationRecord || arguments.length === 0) throw new TypeError("Illegal constructor");
    this.#type = type;
    this.#target = target;
    this.#name = name;
    this.#namespace = namespace;
    this.#oldValue = oldValue;
    this.#added = added ?? NONE;
    this.#removed = removed ?? NONE;
    this.#addedList = null;
    this.#removedList = null;
    this.#previousSibling = previousSibling;
    this.#nextSibling = nextSibling;
  }

  get type(): string {
    return this.#type;
  }

  get target(): Node {
    return this.#target.node;
  }

  get addedNodes(): NodeList {
    return (this.#addedList ??= NodeList._staticFromImpls(this.#added));
  }

  get removedNodes(): NodeList {
    return (this.#removedList ??= NodeList._staticFromImpls(this.#removed));
  }

  get previousSibling(): Node | null {
    const n = this.#previousSibling;
    return n === null ? null : n.node;
  }

  get nextSibling(): Node | null {
    const n = this.#nextSibling;
    return n === null ? null : n.node;
  }

  get attributeName(): string | null {
    return this.#name;
  }

  get attributeNamespace(): string | null {
    return this.#namespace;
  }

  get oldValue(): string | null {
    return this.#oldValue;
  }
}

Object.defineProperty(MutationRecord.prototype, Symbol.toStringTag, { value: "MutationRecord", configurable: true });

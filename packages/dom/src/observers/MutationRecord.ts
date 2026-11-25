// https://dom.spec.whatwg.org/#interface-mutationrecord
//
// OWNER: dom-core. Materialize addedNodes and removedNodes on first read. Most tree
// mutations need only one node reference. Fragment and batch mutations supply a snapshot.

import { NodeList } from "../collections/NodeList.ts";
import type { Node } from "../nodes/Node.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { setToStringTag } from "../events/Event.ts";

export type MutationNodes = NodeImpl | NodeImpl[] | null;

function recordNodeList(nodes: MutationNodes): NodeList {
  if (Array.isArray(nodes)) return NodeList._staticFromImpls(nodes);
  const list = new NodeList(null);
  if (nodes !== null) NodeList._appended(list, nodes.node);
  return list;
}

export class MutationRecord {
  #type: string;
  #target: NodeImpl;
  #name: string | null;
  #namespace: string | null;
  #oldValue: string | null;
  #added: MutationNodes | NodeList;
  #removed: MutationNodes | NodeList;
  #previousSibling: NodeImpl | null;
  #nextSibling: NodeImpl | null;

  /** @internal Records are created by the mutation algorithms only. */
  constructor(
    type: string,
    target: NodeImpl,
    name: string | null,
    namespace: string | null,
    oldValue: string | null,
    added: MutationNodes,
    removed: MutationNodes,
    previousSibling: NodeImpl | null,
    nextSibling: NodeImpl | null,
  ) {
    if (new.target !== MutationRecord || arguments.length === 0) throw new TypeError("Illegal constructor");
    this.#type = type;
    this.#target = target;
    this.#name = name;
    this.#namespace = namespace;
    this.#oldValue = oldValue;
    this.#added = added;
    this.#removed = removed;
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
    if (!NodeList._isNodeList(this.#added)) this.#added = recordNodeList(this.#added);
    return this.#added;
  }

  get removedNodes(): NodeList {
    if (!NodeList._isNodeList(this.#removed)) this.#removed = recordNodeList(this.#removed);
    return this.#removed;
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

setToStringTag(MutationRecord);

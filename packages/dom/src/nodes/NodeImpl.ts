import type { Attr } from "./Attr.ts";
import type { Document } from "./Document.ts";
import type { Node } from "./Node.ts";

/** The rarely present parts of an attribute: a namespace/prefix, or a materialized `Attr` node. */
export class AttrRare {
  /** Qualified name (`prefix:localName` or `localName`). */
  name: string;
  ns: string | null;
  prefix: string | null;
  attr: Attr | null;

  constructor(name: string, ns: string | null, prefix: string | null) {
    this.name = name;
    this.ns = ns;
    this.prefix = prefix;
    this.attr = null;
  }
}

/**
 * One attribute of an element. Stored in `NodeImpl.attrs` in attribute-list order
 * (https://dom.spec.whatwg.org/#concept-element-attribute). The public `Attr` node is
 * created lazily (`attributes`, `getAttributeNode`) and cached in `attr`.
 *
 * Memory: almost every attribute an app sets has no namespace, no prefix and no `Attr` node,
 * so the record holds only `localName`, `value` and a `rare` slot (48 B instead of 72 B
 * with six fields); `name`/`ns`/`prefix`/`attr` read through it. One class, so the
 * accessors stay monomorphic and inline.
 */
export class AttrRecord {
  localName: string;
  value: string;
  rare: AttrRare | null;

  constructor(localName: string, value: string, ns: string | null, prefix: string | null) {
    this.localName = localName;
    this.value = value;
    this.rare =
      ns === null && prefix === null
        ? null
        : new AttrRare(prefix === null ? localName : prefix + ":" + localName, ns, prefix);
  }

  /** Qualified name (`prefix:localName` or `localName`). */
  get name(): string {
    const r = this.rare;
    return r === null ? this.localName : r.name;
  }

  get ns(): string | null {
    const r = this.rare;
    return r === null ? null : r.ns;
  }

  get prefix(): string | null {
    const r = this.rare;
    return r === null ? null : r.prefix;
  }

  get attr(): Attr | null {
    const r = this.rare;
    return r === null ? null : r.attr;
  }

  set attr(attr: Attr | null) {
    if (this.rare === null) {
      if (attr === null) return;
      this.rare = new AttrRare(this.localName, null, null);
    }
    this.rare.attr = attr;
  }
}

/**
 * The internal, monomorphic record behind every DOM node.
 *
 * Why this exists: public wrappers (`HTMLDivElement`, `HTMLInputElement`, `Text`, ...) each
 * have their own prototype, so V8 gives them different hidden classes. Tree walks that read
 * fields off the wrappers go megamorphic once a document mixes more than ~4 element classes,
 * which measured ~3x slower than walking a single class. Every node therefore owns exactly
 * one `NodeImpl` (one hidden class for all node types), and every hot internal algorithm —
 * tree mutation, selector matching, role/name computation, text content, serialization,
 * Testing Library queries — walks `NodeImpl`s, touching the wrapper only to return it.
 *
 * Rules:
 * - Never add fields outside the constructor, never delete fields, never store a value of a
 *   different kind in a field (keep the shape and field representations stable).
 * - Per-type data that is not hot belongs on the wrapper (e.g. input value/checkedness on
 *   `HTMLInputElement`), not here.
 * - New hot fields need a note in docs/ARCHITECTURE.md.
 */
export class NodeImpl {
  /** The public wrapper object. */
  node: Node;
  /** https://dom.spec.whatwg.org/#dom-node-nodetype */
  type: number;
  /** Node document. For a Document node, the document itself. */
  doc: Document;
  parent: NodeImpl | null;
  first: NodeImpl | null;
  last: NodeImpl | null;
  prev: NodeImpl | null;
  next: NodeImpl | null;
  childCount: number;
  /** Bit set of `F_*` flags from constants.ts. */
  flags: number;
  /** `tagId(localName)` for HTML-namespace elements, else 0. */
  tag: number;
  /** Element local name (lowercase for HTML) / doctype name / PI target / attr local name; "" otherwise. */
  name: string;
  /** Element namespace. */
  ns: string | null;
  /** Element namespace prefix. */
  prefix: string | null;
  /** Element attribute list, null until the first attribute is set. */
  attrs: AttrRecord[] | null;
  /** CharacterData data / attr value; "" for other nodes. */
  data: string;
  /** Element id attribute value ("" when absent) — mirrored for the id index and `#id` selectors. */
  id: string;
  /** Lazily split class attribute tokens (null = not computed / invalidated). */
  classes: string[] | null;
  /**
   * Per-node cache slot for subsystems (aria role/name caches, computed style). Always an
   * object of class `NodeCache` or null so the field stays monomorphic. See nodes/cache.ts.
   */
  cache: object | null;

  constructor(node: Node, type: number, doc: Document) {
    this.node = node;
    this.type = type;
    this.doc = doc;
    this.parent = null;
    this.first = null;
    this.last = null;
    this.prev = null;
    this.next = null;
    this.childCount = 0;
    this.flags = 0;
    this.tag = 0;
    this.name = "";
    this.ns = null;
    this.prefix = null;
    this.attrs = null;
    this.data = "";
    this.id = "";
    this.classes = null;
    this.cache = null;
  }
}

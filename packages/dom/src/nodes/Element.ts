// https://dom.spec.whatwg.org/#interface-element

import { ELEMENT_NODE, F_CONNECTED, F_CUSTOM, F_HAS_SHADOW, F_HTML, HTML_NS } from "./constants.ts";
import type { Document } from "./Document.ts";
import { htmlUppercasedQualifiedName, Node } from "./Node.ts";
import type { NodeImpl } from "./NodeImpl.ts";
import { tagId } from "./tags.ts";
import {
  asciiLowercase,
  findAttributeByName,
  findAttributeByNamespace,
  getAttribute,
  isValidAttributeLocalName,
  removeAttribute,
  removeAttributeRecord,
  setAttribute,
  appendAttribute,
  changeAttribute,
  attr,
} from "./attributes.ts";
import { AttrRecord } from "./NodeImpl.ts";
import {
  installChildNode,
  installNonDocumentTypeChildNode,
  installParentNode,
  type ChildNode,
  type NonDocumentTypeChildNode,
  type ParentNode,
} from "./mixins.ts";
import { closest, matches } from "../selectors/index.ts";
import { parseFragment, setHTMLUnsafe } from "../parser/index.ts";
import { getHTML, serializeChildren, serializeNode, type GetHTMLOptions } from "../serializer/index.ts";
import { HTMLCollection } from "../collections/HTMLCollection.ts";
import { classTokens, splitOnAsciiWhitespace } from "./attributes.ts";
import { ShadowRoot } from "./ShadowRoot.ts";
import { DOMTokenList } from "../collections/DOMTokenList.ts";
import { type DOMStringMap, createDOMStringMap } from "../collections/DOMStringMap.ts";
import { NamedNodeMap } from "../collections/NamedNodeMap.ts";
import type { Attr } from "./Attr.ts";
import { attrNode, removeAttributeNode, setAttributeNode } from "./attr-nodes.ts";
import { validateAndExtract } from "./names.ts";
import { DOMRect, DOMRectList } from "../window/geometry.ts";
import { T } from "./tags.ts";
import {
  _shadowRootAttached,
  assignedSlot as slotOf,
  assignedSlotForEventPath,
  slotAssignmentActive,
} from "./slots.ts";
import { setAssignedSlotLookup } from "../events/dispatch.ts";
import type { CSSStyleDeclaration } from "../css/CSSStyleDeclaration.ts";
import type { ShadowRootInit } from "../webidl.ts";
import {
  $attributes,
  $children,
  $classList,
  $dataset,
  $declarative,
  $impl,
  $isHTML,
  $mode,
  $shadowRoot,
  $style,
} from "../keys.ts";

/** Valid custom element name test (fast path: must contain "-" and start with a-z). */
function isPotentialCustomElementName(name: string): boolean {
  const c = name.charCodeAt(0);
  return c >= 97 && c <= 122 && name.includes("-");
}

export class Element extends Node {
  // Lazily created public API objects. Declared in the constructor so every Element
  // wrapper starts with the same field layout.
  // Rarely used per-element objects are own properties added on first use, never initialized in
  // the constructor: an initialized-to-null field costs every element a slot (8 B each, 48 B for
  // these six) while most elements never touch them. Reads treat "absent" like null.
  declare [$children]?: HTMLCollection | null;
  declare [$shadowRoot]?: ShadowRoot | null;
  /** Inline style declaration (src/css owns the class); null until `style` is read. */
  declare [$style]?: CSSStyleDeclaration | null;
  declare [$classList]?: DOMTokenList | null;
  declare [$dataset]?: DOMStringMap | null;
  declare [$attributes]?: NamedNodeMap | null;

  /** @internal Use Document.createElement / createElementNS. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(ELEMENT_NODE, doc);
    const impl = this[$impl];
    impl.name = localName;
    impl.ns = ns;
    impl.prefix = prefix;
    if (ns === HTML_NS) {
      if (doc[$isHTML]) impl.flags |= F_HTML;
      impl.tag = tagId(localName);
      if (impl.tag === 0 && isPotentialCustomElementName(localName)) impl.flags |= F_CUSTOM;
    }
  }

  get namespaceURI(): string | null {
    return this[$impl].ns;
  }

  get prefix(): string | null {
    return this[$impl].prefix;
  }

  get localName(): string {
    return this[$impl].name;
  }

  /** https://dom.spec.whatwg.org/#element-html-uppercased-qualified-name */
  /** https://dom.spec.whatwg.org/#dom-element-tagname */
  get tagName(): string {
    return htmlUppercasedQualifiedName(this[$impl]);
  }

  get id(): string {
    return this[$impl].id;
  }

  set id(value: string) {
    setAttribute(this[$impl], "id", String(value));
  }

  get className(): string {
    return getAttribute(this[$impl], "class") ?? "";
  }

  set className(value: string) {
    setAttribute(this[$impl], "class", String(value));
  }

  /** https://dom.spec.whatwg.org/#dom-element-classlist */
  get classList(): DOMTokenList {
    return (this[$classList] ??= new DOMTokenList(this[$impl], "class"));
  }

  set classList(value: string) {
    this.classList.value = value;
  }

  /** https://html.spec.whatwg.org/#dom-dataset (HTMLOrSVGElement; installed here so SVG/MathML share it). */
  get dataset(): DOMStringMap {
    return (this[$dataset] ??= createDOMStringMap(this[$impl]));
  }

  /** https://drafts.csswg.org/css-shadow-parts/#dom-element-part */
  get part(): DOMTokenList {
    let p = partLists.get(this);
    if (p === undefined) partLists.set(this, (p = new DOMTokenList(this[$impl], "part")));
    return p;
  }

  set part(value: string) {
    this.part.value = value;
  }

  /** https://dom.spec.whatwg.org/#dom-element-attributes */
  get attributes(): NamedNodeMap {
    return (this[$attributes] ??= new NamedNodeMap(this[$impl]));
  }

  /** https://dom.spec.whatwg.org/#dom-element-slot — reflects the null-namespace `slot` attribute. */
  get slot(): string {
    return attr(this[$impl], "slot") ?? "";
  }

  set slot(value: string) {
    // https://dom.spec.whatwg.org/#concept-element-attributes-set-value (namespace null).
    const impl = this[$impl];
    const v = String(value);
    const existing = findAttributeByNamespace(impl, null, "slot");
    if (existing === null) appendAttribute(impl, new AttrRecord("slot", v, null, null));
    else changeAttribute(impl, existing, v);
  }

  // --- attributes -------------------------------------------------------------------------

  hasAttributes(): boolean {
    const attrs = this[$impl].attrs;
    return attrs !== null && attrs.length !== 0;
  }

  getAttributeNames(): string[] {
    const attrs = this[$impl].attrs;
    return attrs === null ? [] : attrs.map((a) => a.name);
  }

  getAttribute(qualifiedName: string): string | null {
    return getAttribute(this[$impl], String(qualifiedName));
  }

  getAttributeNS(namespace: string | null, localName: string): string | null {
    const a = findAttributeByNamespace(
      this[$impl],
      namespace === "" || namespace === undefined ? null : namespace,
      String(localName),
    );
    return a === null ? null : a.value;
  }

  setAttribute(qualifiedName: string, value: string): void {
    setAttribute(this[$impl], String(qualifiedName), String(value));
  }

  /** https://dom.spec.whatwg.org/#dom-element-setattributens */
  setAttributeNS(namespace: string | null, qualifiedName: string, value: string): void {
    const {
      namespace: ns,
      prefix,
      localName,
    } = validateAndExtract(namespace === undefined ? null : namespace, String(qualifiedName), "attribute");
    const impl = this[$impl];
    const v = String(value);
    const existing = findAttributeByNamespace(impl, ns, localName);
    if (existing === null) appendAttribute(impl, new AttrRecord(localName, v, ns, prefix));
    else changeAttribute(impl, existing, v);
  }

  /** https://dom.spec.whatwg.org/#dom-element-getattributenode */
  getAttributeNode(qualifiedName: string): Attr | null {
    const impl = this[$impl];
    const q = String(qualifiedName);
    const a = findAttributeByName(impl, (impl.flags & F_HTML) !== 0 ? asciiLowercase(q) : q);
    return a === null ? null : attrNode(impl, a);
  }

  /** https://dom.spec.whatwg.org/#dom-element-getattributenodens */
  getAttributeNodeNS(namespace: string | null, localName: string): Attr | null {
    const impl = this[$impl];
    const a = findAttributeByNamespace(
      impl,
      namespace === "" || namespace === undefined ? null : namespace,
      String(localName),
    );
    return a === null ? null : attrNode(impl, a);
  }

  /** https://dom.spec.whatwg.org/#dom-element-setattributenode */
  setAttributeNode(attr: Attr): Attr | null {
    return setAttributeNode(this[$impl], attr);
  }

  setAttributeNodeNS(attr: Attr): Attr | null {
    return setAttributeNode(this[$impl], attr);
  }

  /** https://dom.spec.whatwg.org/#dom-element-removeattributenode */
  removeAttributeNode(attr: Attr): Attr {
    return removeAttributeNode(this[$impl], attr);
  }

  removeAttribute(qualifiedName: string): void {
    removeAttribute(this[$impl], String(qualifiedName));
  }

  removeAttributeNS(namespace: string | null, localName: string): void {
    const a = findAttributeByNamespace(
      this[$impl],
      namespace === "" || namespace === undefined ? null : namespace,
      String(localName),
    );
    if (a !== null) removeAttributeRecord(this[$impl], a);
  }

  /** https://dom.spec.whatwg.org/#dom-element-toggleattribute */
  toggleAttribute(qualifiedName: string, force?: boolean): boolean {
    const impl = this[$impl];
    const qname = String(qualifiedName);
    if (!isValidAttributeLocalName(qname)) {
      throw new DOMException(`"${qname}" is not a valid attribute name.`, "InvalidCharacterError");
    }
    const name = (impl.flags & F_HTML) !== 0 ? asciiLowercase(qname) : qname;
    const a = findAttributeByName(impl, name);
    if (a === null) {
      if (force === undefined || force) {
        appendAttribute(impl, new AttrRecord(name, "", null, null));
        return true;
      }
      return false;
    }
    if (force === undefined || !force) {
      removeAttributeRecord(impl, a);
      return false;
    }
    return true;
  }

  hasAttribute(qualifiedName: string): boolean {
    return getAttribute(this[$impl], String(qualifiedName)) !== null;
  }

  hasAttributeNS(namespace: string | null, localName: string): boolean {
    return (
      findAttributeByNamespace(
        this[$impl],
        namespace === "" || namespace === undefined ? null : namespace,
        String(localName),
      ) !== null
    );
  }

  // --- selectors --------------------------------------------------------------------------

  matches(selectors: string): boolean {
    return matches(this[$impl], String(selectors));
  }

  webkitMatchesSelector(selectors: string): boolean {
    return this.matches(selectors);
  }

  closest(selectors: string): Element | null {
    const r = closest(this[$impl], String(selectors));
    return r === null ? null : (r.node as Element);
  }

  getElementsByTagName(qualifiedName: string): HTMLCollection {
    return getElementsByTagName(this[$impl], String(qualifiedName));
  }

  getElementsByTagNameNS(namespace: string | null, localName: string): HTMLCollection {
    return getElementsByTagNameNS(this[$impl], namespace, String(localName));
  }

  getElementsByClassName(classNames: string): HTMLCollection {
    return getElementsByClassName(this[$impl], String(classNames));
  }

  // --- markup -----------------------------------------------------------------------------

  get innerHTML(): string {
    return serializeChildren(this[$impl]);
  }

  /** https://html.spec.whatwg.org/#dom-element-innerhtml */
  set innerHTML(value: string) {
    const impl = this[$impl];
    const fragment = parseFragment(value === null ? "" : String(value), impl);
    // Step 4: for <template>, replace the children of its template contents instead.
    if (impl.tag === T.template && impl.ns === HTML_NS) {
      const content = (this as unknown as { content?: Node }).content;
      if (content !== undefined && content !== null) {
        content._replaceAll(fragment.node);
        return;
      }
    }
    this._replaceAll(fragment.node);
  }

  /** https://html.spec.whatwg.org/#dom-element-gethtml */
  getHTML(options?: GetHTMLOptions): string {
    return getHTML(this[$impl], options);
  }

  /** https://html.spec.whatwg.org/#dom-element-sethtmlunsafe */
  setHTMLUnsafe(html: string): void {
    setHTMLUnsafe(this[$impl], String(html));
  }

  get outerHTML(): string {
    return serializeNode(this[$impl]);
  }

  set outerHTML(value: string) {
    const impl = this[$impl];
    const parent = impl.parent;
    if (parent === null) return;
    if (parent.type === 9)
      throw new DOMException("Cannot set outerHTML of the document element.", "NoModificationAllowedError");
    const context = parent.type === 11 ? impl.doc.createElement("body")[$impl] : parent;
    const fragment = parseFragment(value === null ? "" : String(value), context);
    parent.node.replaceChild(fragment.node, this);
  }

  /** https://html.spec.whatwg.org/#dom-element-insertadjacenthtml */
  insertAdjacentHTML(position: string, text: string): void {
    const pos = asciiLowercase(String(position));
    const impl = this[$impl];
    let context: NodeImpl;
    if (pos === "beforebegin" || pos === "afterend") {
      const parent = impl.parent;
      if (parent === null || parent.type === 9) {
        throw new DOMException("The element has no parent.", "NoModificationAllowedError");
      }
      context = parent;
    } else if (pos === "afterbegin" || pos === "beforeend") {
      context = impl;
    } else {
      throw new DOMException(`"${position}" is not a valid position.`, "SyntaxError");
    }
    if (
      context.type !== ELEMENT_NODE ||
      (context.ns === HTML_NS && context.name === "html" && (context.flags & F_HTML) !== 0)
    ) {
      context = impl.doc.createElement("body")[$impl];
    }
    const fragment = parseFragment(String(text), context).node;
    insertAdjacent(this, pos, fragment);
  }

  insertAdjacentElement(where: string, element: Element): Element | null {
    if (!(element instanceof Element)) {
      throw new TypeError(
        "Failed to execute 'insertAdjacentElement' on 'Element': parameter 2 is not of type 'Element'.",
      );
    }
    return insertAdjacent(this, asciiLowercase(String(where)), element) as Element | null;
  }

  insertAdjacentText(where: string, data: string): void {
    insertAdjacent(this, asciiLowercase(String(where)), this[$impl].doc.createTextNode(String(data)));
  }

  // --- shadow DOM -------------------------------------------------------------------------

  get shadowRoot(): ShadowRoot | null {
    const s = this[$shadowRoot];
    return s != null && s.mode === "open" ? s : null;
  }

  /** https://dom.spec.whatwg.org/#dom-element-attachshadow */
  attachShadow(init: ShadowRootInit): ShadowRoot {
    if (init === null || typeof init !== "object") {
      throw new TypeError("Failed to execute 'attachShadow' on 'Element': 1 argument required, but only 0 present.");
    }
    const mode = init.mode;
    if (mode !== "open" && mode !== "closed") {
      throw new TypeError(
        `Failed to execute 'attachShadow' on 'Element': The provided value '${String(mode)}' is not a valid enum value of type ShadowRootMode.`,
      );
    }
    const slotAssignment = init.slotAssignment ?? "named";
    if (slotAssignment !== "named" && slotAssignment !== "manual") {
      throw new TypeError(
        `Failed to execute 'attachShadow' on 'Element': The provided value '${String(slotAssignment)}' is not a valid enum value of type SlotAssignmentMode.`,
      );
    }
    return attachShadowRoot(this, mode, !!init.clonable, !!init.serializable, !!init.delegatesFocus, slotAssignment);
  }

  /** https://dom.spec.whatwg.org/#dom-slotable-assignedslot */
  get assignedSlot(): Element | null {
    if (slotAssignmentActive === 0) return null;
    const slot = slotOf(this[$impl]);
    if (slot === null) return null;
    const host = this[$impl].parent;
    const shadow = host === null || (host.flags & F_HAS_SHADOW) === 0 ? null : (host.node as Element)[$shadowRoot];
    return shadow != null && shadow.mode === "open" ? (slot.node as Element) : null;
  }

  // --- CSSOM View (no layout: geometry is always zero, scrolling is a no-op) ---------------

  /** https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect */
  getBoundingClientRect(): DOMRect {
    return new DOMRect();
  }

  getClientRects(): DOMRectList {
    return new DOMRectList();
  }

  /** https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility — without layout: connected and not hidden by `hidden` / display:none ancestors is unknowable, so connectedness. */
  checkVisibility(_options?: object): boolean {
    return (this[$impl].flags & F_CONNECTED) !== 0;
  }

  get scrollTop(): number {
    return 0;
  }
  set scrollTop(_v: number) {}
  get scrollLeft(): number {
    return 0;
  }
  set scrollLeft(_v: number) {}
  get scrollWidth(): number {
    return 0;
  }
  get scrollHeight(): number {
    return 0;
  }
  get clientTop(): number {
    return 0;
  }
  get clientLeft(): number {
    return 0;
  }
  get clientWidth(): number {
    return 0;
  }
  get clientHeight(): number {
    return 0;
  }
  scroll(_x?: unknown, _y?: number): void {}
  scrollTo(_x?: unknown, _y?: number): void {}
  scrollBy(_x?: unknown, _y?: number): void {}
  scrollIntoView(_arg?: unknown): void {}

  // --- hooks for subclasses (see constants.ts F_*_HOOK) -----------------------------------

  /** Runs when this element becomes connected. Only called when F_CONNECT_HOOK is set. */
  _connectedSteps(): void {}
  /** Runs when this element becomes disconnected. Only called when F_CONNECT_HOOK is set. */
  _disconnectedSteps(): void {}
  /** https://dom.spec.whatwg.org/#concept-element-attributes-change-ext — only when F_ATTR_HOOK is set. */
  _attributeChangedSteps(
    _localName: string,
    _oldValue: string | null,
    _value: string | null,
    _namespace: string | null,
  ): void {}
  /** https://dom.spec.whatwg.org/#concept-node-children-changed-ext — only when F_CHILDREN_HOOK is set. */
  _childrenChangedSteps(): void {}
  /** https://dom.spec.whatwg.org/#concept-node-adopt-ext — only when F_ADOPT_HOOK is set. */
  _adoptingSteps(_oldDocument: Document): void {}
  /**
   * https://dom.spec.whatwg.org/#concept-node-move-ext (moveBefore) — only when F_CONNECT_HOOK is
   * set. Moving runs neither the removing nor the insertion steps, so connected state is kept.
   */
  _movingSteps(_isSubtreeRoot: boolean, _oldParent: NodeImpl): void {}
  /** https://dom.spec.whatwg.org/#concept-node-clone-ext — always called on clone. */
  _cloningSteps(_copy: Element, _subtree?: boolean): void {}
}

export interface Element extends ParentNode, ChildNode, NonDocumentTypeChildNode {}
installParentNode(Element);
installChildNode(Element);
installNonDocumentTypeChildNode(Element);

function insertAdjacent(element: Element, where: string, node: Node): Node | null {
  switch (where) {
    case "beforebegin": {
      const parent = element.parentNode;
      return parent === null ? null : parent.insertBefore(node, element);
    }
    case "afterbegin":
      return element.insertBefore(node, element.firstChild);
    case "beforeend":
      return element.appendChild(node);
    case "afterend": {
      const parent = element.parentNode;
      return parent === null ? null : parent.insertBefore(node, element.nextSibling);
    }
  }
  throw new DOMException(`"${where}" is not a valid position.`, "SyntaxError");
}

const partLists = new WeakMap<Element, DOMTokenList>();

/** Shadow host names: https://dom.spec.whatwg.org/#valid-shadow-host-name */
// oxfmt-ignore
const SHADOW_HOST_NAMES = new Set(["article", "aside", "blockquote", "body", "div", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "main", "nav", "p", "section", "span"]);

let slotLookupInstalled = false;

/** https://dom.spec.whatwg.org/#concept-attach-a-shadow-root */
export function attachShadowRoot(
  element: Element,
  mode: "open" | "closed",
  clonable: boolean,
  serializable: boolean,
  delegatesFocus: boolean,
  slotAssignment: "named" | "manual",
): ShadowRoot {
  const impl = element[$impl];
  // Steps 1-2.
  if (impl.ns !== HTML_NS) throw new DOMException("This element does not support attachShadow", "NotSupportedError");
  const name = impl.name;
  if ((impl.flags & F_CUSTOM) === 0 && !SHADOW_HOST_NAMES.has(name)) {
    throw new DOMException(
      `Failed to execute 'attachShadow' on 'Element': This element does not support attachShadow`,
      "NotSupportedError",
    );
  }
  // Step 3: custom element definitions with disableShadow (html agent hook).
  const disabled = (element as unknown as { _shadowDisabled?: () => boolean })._shadowDisabled;
  if (typeof disabled === "function" && disabled.call(element)) {
    throw new DOMException(
      "Failed to execute 'attachShadow' on 'Element': Shadow root cannot be created on a host whose custom element definition disables it.",
      "NotSupportedError",
    );
  }
  // Step 4.
  const current = element[$shadowRoot];
  if (current != null) {
    if (!current[$declarative] || current[$mode] !== mode) {
      throw new DOMException(
        "Failed to execute 'attachShadow' on 'Element': Shadow root cannot be created on a host which already hosts a shadow tree.",
        "NotSupportedError",
      );
    }
    current._replaceAll(null);
    current[$declarative] = false;
    return current;
  }
  // Steps 5-12.
  const shadow = new ShadowRoot(impl.doc, element, mode, delegatesFocus, slotAssignment, clonable, serializable);
  element[$shadowRoot] = shadow;
  impl.flags |= F_HAS_SHADOW;
  _shadowRootAttached();
  if (!slotLookupInstalled) {
    slotLookupInstalled = true;
    setAssignedSlotLookup((n) => {
      const slot = assignedSlotForEventPath(n);
      return slot === null ? null : slot.node;
    });
  }
  return shadow;
}

/** Per-root cache of getElementsBy* collections (same object for the same root + key). */
const collectionCache = new WeakMap<NodeImpl, Map<string, HTMLCollection>>();

export function cachedCollection(
  root: NodeImpl,
  key: string,
  filter: ((el: NodeImpl) => boolean) | null,
): HTMLCollection {
  let map = collectionCache.get(root);
  if (map === undefined) collectionCache.set(root, (map = new Map()));
  let c = map.get(key);
  if (c === undefined) map.set(key, (c = HTMLCollection._descendants(root, filter)));
  return c;
}

/** https://dom.spec.whatwg.org/#concept-getelementsbytagname */
export function getElementsByTagName(root: NodeImpl, qualifiedName: string): HTMLCollection {
  if (qualifiedName === "*") return cachedCollection(root, "t*", null);
  const lower = asciiLowercase(qualifiedName);
  const isHTMLDoc = root.doc[$isHTML];
  const colon = qualifiedName.indexOf(":");
  const prefix = colon === -1 ? null : qualifiedName.slice(0, colon);
  const local = colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1);
  const lprefix = colon === -1 ? null : lower.slice(0, colon);
  const llocal = colon === -1 ? lower : lower.slice(colon + 1);
  return cachedCollection(root, "t" + qualifiedName, (el) => {
    if (isHTMLDoc && el.ns === HTML_NS) return el.name === llocal && el.prefix === lprefix;
    return el.name === local && el.prefix === prefix;
  });
}

/** https://dom.spec.whatwg.org/#concept-getelementsbytagnamens */
export function getElementsByTagNameNS(root: NodeImpl, namespace: string | null, localName: string): HTMLCollection {
  const ns = namespace === "" || namespace === undefined ? null : namespace === null ? null : String(namespace);
  const key = "n" + (ns ?? "") + "\u0000" + (ns === null ? "0" : "1") + localName;
  if (ns === "*" && localName === "*") return cachedCollection(root, key, null);
  if (ns === "*") return cachedCollection(root, key, (el) => el.name === localName);
  if (localName === "*") return cachedCollection(root, key, (el) => el.ns === ns);
  return cachedCollection(root, key, (el) => el.ns === ns && el.name === localName);
}

/** https://dom.spec.whatwg.org/#concept-getelementsbyclassname */
export function getElementsByClassName(root: NodeImpl, classNames: string): HTMLCollection {
  const wanted: string[] = [];
  for (const t of splitOnAsciiWhitespace(classNames)) if (!wanted.includes(t)) wanted.push(t);
  if (wanted.length === 0) return cachedCollection(root, "c", () => false);
  const quirks = root.doc[$mode] === "quirks";
  if (quirks) {
    const lowered = wanted.map(asciiLowercase);
    return cachedCollection(root, "q" + classNames, (el) => {
      const have = classTokens(el);
      outer: for (let i = 0; i < lowered.length; i++) {
        for (let j = 0; j < have.length; j++) if (asciiLowercase(have[j]) === lowered[i]) continue outer;
        return false;
      }
      return true;
    });
  }
  if (wanted.length === 1) {
    const w = wanted[0];
    return cachedCollection(root, "c" + classNames, (el) => {
      const have = classTokens(el);
      for (let j = 0; j < have.length; j++) if (have[j] === w) return true;
      return false;
    });
  }
  return cachedCollection(root, "c" + classNames, (el) => {
    const have = classTokens(el);
    for (let i = 0; i < wanted.length; i++) if (!have.includes(wanted[i])) return false;
    return true;
  });
}

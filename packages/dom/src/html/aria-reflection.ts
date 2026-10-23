// ARIAMixin on Element: https://w3c.github.io/aria/#ARIAMixin ("interface mixin ARIAMixin",
// "Element includes ARIAMixin"; ElementInternals' copy lives in HTMLElement.ts).
//
// DOMString? attributes reflect the aria-* content attribute (nullable DOMString reflection:
// https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes).
// Element? / FrozenArray<Element>? attributes use the HTML element-reference reflection with
// "explicitly set attr-element(s)" (same section, the `Element` and `FrozenArray<T>` cases).
//
// Zero cost when unused: explicitly set references live in a module-level WeakMap that is only
// touched when a script assigns an `aria*Element(s)` property.

import { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { AttrRecord } from "../nodes/NodeImpl.ts";
import type { Document } from "../nodes/Document.ts";
import { removeAttribute, setAttribute, splitOnAsciiWhitespace } from "../nodes/attributes.ts";
import { DOCUMENT_NODE, ELEMENT_NODE } from "../nodes/constants.ts";
import { nextElementInTree } from "../nodes/traverse.ts";
import { isShadowRootImpl } from "../nodes/slots.ts";
import { $host, $impl } from "../keys.ts";
import { defineAccessor, nullableStr } from "./reflect.ts";

/** ARIAMixin's `DOMString?` attributes (ARIA 1.3 plus the tentative *Text/description ones browsers ship). */
export const ARIA_STRING_ATTRIBUTES =
  "role ariaAtomic=aria-atomic ariaAutoComplete=aria-autocomplete ariaBrailleLabel=aria-braillelabel " +
  "ariaBrailleRoleDescription=aria-brailleroledescription ariaBusy=aria-busy ariaChecked=aria-checked " +
  "ariaColCount=aria-colcount ariaColIndex=aria-colindex ariaColIndexText=aria-colindextext ariaColSpan=aria-colspan " +
  "ariaCurrent=aria-current ariaDescription=aria-description ariaDisabled=aria-disabled ariaExpanded=aria-expanded " +
  "ariaHasPopup=aria-haspopup ariaHidden=aria-hidden ariaInvalid=aria-invalid ariaKeyShortcuts=aria-keyshortcuts " +
  "ariaLabel=aria-label ariaLevel=aria-level ariaLive=aria-live ariaModal=aria-modal ariaMultiLine=aria-multiline " +
  "ariaMultiSelectable=aria-multiselectable ariaOrientation=aria-orientation ariaPlaceholder=aria-placeholder " +
  "ariaPosInSet=aria-posinset ariaPressed=aria-pressed ariaReadOnly=aria-readonly ariaRelevant=aria-relevant " +
  "ariaRequired=aria-required ariaRoleDescription=aria-roledescription ariaRowCount=aria-rowcount " +
  "ariaRowIndex=aria-rowindex ariaRowIndexText=aria-rowindextext ariaRowSpan=aria-rowspan ariaSelected=aria-selected " +
  "ariaSetSize=aria-setsize ariaSort=aria-sort ariaValueMax=aria-valuemax ariaValueMin=aria-valuemin " +
  "ariaValueNow=aria-valuenow ariaValueText=aria-valuetext";

/** `Element?` attributes → content attribute. */
const ELEMENT_REFS: [string, string][] = [["ariaActiveDescendantElement", "aria-activedescendant"]];

/** `FrozenArray<Element>?` attributes → content attribute. */
const ELEMENTS_REFS: [string, string][] = [
  ["ariaControlsElements", "aria-controls"],
  ["ariaDescribedByElements", "aria-describedby"],
  ["ariaDetailsElements", "aria-details"],
  ["ariaErrorMessageElements", "aria-errormessage"],
  ["ariaFlowToElements", "aria-flowto"],
  ["ariaLabelledByElements", "aria-labelledby"],
  ["ariaOwnsElements", "aria-owns"],
];

/**
 * Explicitly set attr-element(s) of one content attribute, plus the attribute record the IDL
 * setter wrote "" into. The spec clears the explicit references whenever the content attribute
 * is set or removed (https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes
 * attribute change steps); we detect that lazily: the references are stale once that record is
 * gone or holds anything but "" (see docs/deviations.md for the one case this misses).
 */
interface ExplicitRefs {
  record: AttrRecord;
  elements: WeakRef<NodeImpl>[];
  /** The FrozenArray last returned by the getter ("cached attr-associated elements"). */
  cached: readonly Element[] | null;
}

/** element impl → content attribute name → explicit references. */
const explicitRefs = new WeakMap<NodeImpl, Map<string, ExplicitRefs>>();
/** element impl → content attribute name → cached FrozenArray for the content-attribute path. */
const cachedArrays = new WeakMap<NodeImpl, Map<string, readonly Element[]>>();

function findRecord(el: NodeImpl, localName: string): AttrRecord | null {
  const attrs = el.attrs;
  if (attrs === null) return null;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.localName === localName && (a.rare === null || a.rare.ns === null)) return a;
  }
  return null;
}

/** The live explicit references for `localName`, or null (dropping stale ones). */
function liveExplicit(el: NodeImpl, localName: string): ExplicitRefs | null {
  const map = explicitRefs.get(el);
  if (map === undefined) return null;
  const refs = map.get(localName);
  if (refs === undefined) return null;
  if (findRecord(el, localName) === refs.record && refs.record.value === "") return refs;
  map.delete(localName);
  return null;
}

function setExplicit(el: NodeImpl, localName: string, elements: WeakRef<NodeImpl>[]): void {
  // Setter step: "set an attribute value" to the empty string, then remember the references.
  setAttribute(el, localName, "");
  let map = explicitRefs.get(el);
  if (map === undefined) explicitRefs.set(el, (map = new Map()));
  map.set(localName, { record: findRecord(el, localName)!, elements, cached: null });
}

function clearExplicit(el: NodeImpl, localName: string): void {
  explicitRefs.get(el)?.delete(localName);
  removeAttribute(el, localName);
}

/** Shadow-including parent: the parent, or the host of a shadow root. */
function shadowIncludingParent(n: NodeImpl): NodeImpl | null {
  if (n.parent !== null) return n.parent;
  if (isShadowRootImpl(n)) return (n.node as unknown as { [$host]: Element | null })[$host]?.[$impl] ?? null;
  return null;
}

/**
 * Whether `target` is a descendant of any of `el`'s shadow-including ancestors. Equivalent:
 * `target`'s tree root is a (strict) shadow-including ancestor of `el` and is not `target`.
 */
function isValidReference(el: NodeImpl, target: NodeImpl): boolean {
  let root = target;
  while (root.parent !== null) root = root.parent;
  if (root === target) return false;
  for (let a = shadowIncludingParent(el); a !== null; a = shadowIncludingParent(a)) {
    if (a === root) return true;
  }
  return false;
}

/** The first element in tree order in `el`'s tree whose ID is `id`. */
function firstById(el: NodeImpl, id: string): NodeImpl | null {
  if (id === "") return null;
  let root = el;
  while (root.parent !== null) root = root.parent;
  if (root.type === DOCUMENT_NODE) return (root.node as unknown as Document)._idLookup(id);
  if (root.type === ELEMENT_NODE && root.id === id) return root;
  for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
    if (n.id === id) return n;
  }
  return null;
}

/**
 * https://html.spec.whatwg.org/#attr-associated-element — for `Element?` reflection.
 */
export function attrAssociatedElement(el: NodeImpl, localName: string): NodeImpl | null {
  // 1. Explicitly set attr-element: valid only within a shadow-including ancestor of el.
  const refs = liveExplicit(el, localName);
  if (refs !== null) {
    const target = refs.elements[0]?.deref() ?? null;
    return target !== null && isValidReference(el, target) ? target : null;
  }
  // 2. Otherwise, the first element in el's tree with the content attribute's value as ID.
  const value = findRecord(el, localName)?.value;
  return value === undefined ? null : firstById(el, value);
}

/**
 * https://html.spec.whatwg.org/#attr-associated-elements — for `FrozenArray<Element>?`
 * reflection; null when there are no explicit references and no content attribute.
 */
export function attrAssociatedElements(el: NodeImpl, localName: string): NodeImpl[] | null {
  const refs = liveExplicit(el, localName);
  const out: NodeImpl[] = [];
  if (refs !== null) {
    // 2. For each explicitly set element still alive and in scope, append it.
    for (const ref of refs.elements) {
      const target = ref.deref();
      if (target !== undefined && isValidReference(el, target)) out.push(target);
    }
    return out;
  }
  // 3. Otherwise split the content attribute on ASCII whitespace and resolve each ID.
  const value = findRecord(el, localName)?.value;
  if (value === undefined) return null;
  for (const id of splitOnAsciiWhitespace(value)) {
    const target = firstById(el, id);
    if (target !== null) out.push(target);
  }
  return out;
}

// TODO(aria): accname/relations read aria-labelledby/-describedby/-owns/... attributes only;
// when hasExplicitAttrElements(el, name) is true they should use attrAssociatedElements(el, name)
// (exported from @rtd/dom/internal) so WPT html/dom/aria-element-reflection-labelledby.html passes.
/** Whether `el` has explicitly set (and still current) element references for `localName`. */
export function hasExplicitAttrElements(el: NodeImpl, localName: string): boolean {
  return liveExplicit(el, localName) !== null;
}

function sameContents(a: readonly Element[], b: NodeImpl[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i].node) return false;
  return true;
}

function toElement(v: unknown, prop: string): NodeImpl {
  if (!(v instanceof Element)) throw new TypeError(`Failed to set the '${prop}' property on 'Element': Failed to convert value to 'Element'.`);
  return v[$impl];
}

for (const [idl, content] of ELEMENT_REFS) {
  defineAccessor(
    Element,
    idl,
    function () {
      // Getter: the attr-associated element.
      return attrAssociatedElement(this[$impl], content)?.node ?? null;
    },
    function (v) {
      // Setter: null clears; otherwise set "" and remember the element.
      if (v === null || v === undefined) clearExplicit(this[$impl], content);
      else setExplicit(this[$impl], content, [new WeakRef(toElement(v, idl))]);
    },
  );
}

for (const [idl, content] of ELEMENTS_REFS) {
  defineAccessor(
    Element,
    idl,
    function () {
      const el = this[$impl];
      const elements = attrAssociatedElements(el, content);
      if (elements === null) return null;
      // "If the contents of elements is equal to the contents of element's cached
      // attr-associated elements, then return the cached attr-associated elements."
      const refs = liveExplicit(el, content);
      let cache = refs === null ? cachedArrays.get(el)?.get(content) : refs.cached;
      if (cache !== undefined && cache !== null && sameContents(cache, elements)) return cache;
      const frozen = Object.freeze(elements.map((n) => n.node as Element));
      if (refs !== null) refs.cached = frozen;
      else {
        let map = cachedArrays.get(el);
        if (map === undefined) cachedArrays.set(el, (map = new Map()));
        map.set(content, frozen);
      }
      cache = frozen;
      return cache;
    },
    function (v) {
      const el = this[$impl];
      if (v === null || v === undefined) {
        clearExplicit(el, content);
        return;
      }
      // WebIDL sequence<Element> conversion.
      if (typeof v !== "object" || typeof v[Symbol.iterator] !== "function") {
        throw new TypeError(`Failed to set the '${idl}' property on 'Element': The provided value cannot be converted to a sequence.`);
      }
      const refs: WeakRef<NodeImpl>[] = [];
      for (const item of v as Iterable<unknown>) refs.push(new WeakRef(toElement(item, idl)));
      setExplicit(el, content, refs);
    },
  );
}

nullableStr(Element, ARIA_STRING_ATTRIBUTES);

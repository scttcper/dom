// Custom elements.
// https://html.spec.whatwg.org/#custom-elements
//
// - `CustomElementRegistry` (one per Window, see `customElementRegistryFor`).
// - The HTMLElement constructor steps for `new MyElement()` and upgrades
//   (https://html.spec.whatwg.org/#html-element-constructors), called from HTMLElement.ts.
// - Synchronous construction for createElement/createElementNS (nodes/create.ts hook).
// - Custom element reactions (https://html.spec.whatwg.org/#custom-element-reactions): element
//   hooks enqueue reactions; nodes/tree.ts and nodes/attributes.ts flush the queue at the end of
//   every insert/remove/attribute change (`ceReactionsPending`), which approximates the
//   [CEReactions] "end of the API call" timing without wrapping every DOM method.
//
// Zero cost when unused: elements only reach this module through F_CUSTOM (valid-looking
// custom element names) or after `customElements.define()`.

import { F_ATTR_HOOK, F_FACE, F_CE_CUSTOM, F_CONNECTED, F_CUSTOM, F_CONNECT_HOOK, HTML_NS, ELEMENT_NODE } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import { createElementImpl, setCEReactionsFlush, setCEReactionsPending, setCustomElementCreate } from "../nodes/create.ts";
import { nextInTree } from "../nodes/traverse.ts";
import { currentWindow } from "../window/current.ts";
import { reportException as reportError } from "../events/report.ts";
import { elementClassFor, isBuiltinInterface, localNamesForInterface } from "./registry.ts";
import { $byCtor, $byName, $impl, $running, $shadowRoot, $whenDefined, $window } from "../keys.ts";

type Callback = (...args: unknown[]) => unknown;

export interface CustomElementDefinition {
  name: string;
  localName: string;
  constructor: Function;
  observedAttributes: Set<string>;
  connectedCallback: Callback | null;
  disconnectedCallback: Callback | null;
  adoptedCallback: Callback | null;
  attributeChangedCallback: Callback | null;
  connectedMoveCallback: Callback | null;
  formAssociatedCallback: Callback | null;
  formResetCallback: Callback | null;
  formDisabledCallback: Callback | null;
  formStateRestoreCallback: Callback | null;
  formAssociated: boolean;
  disableInternals: boolean;
  disableShadow: boolean;
  /** https://html.spec.whatwg.org/#concept-custom-element-definition-construction-stack */
  constructionStack: (Element | typeof ALREADY_CONSTRUCTED)[];
}

const ALREADY_CONSTRUCTED = Symbol("already constructed");

/** Element → its custom element definition (set at upgrade / creation). */
const definitions = new WeakMap<Element, CustomElementDefinition>();
/** Elements whose "is value" is set (customized built-ins). */
const isValues = new WeakMap<Element, string>();
/** Number of definitions across all registries; 0 = custom element hooks return immediately. */
let definedCount = 0;

// --- names --------------------------------------------------------------------------------

const RESERVED = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);
// https://html.spec.whatwg.org/#prod-potentialcustomelementname
const PCEN =
  // Built from a string: TypeScript's regex checker rejects some astral ranges in literals.
  new RegExp("^[a-z][\\-.0-9_a-z\\u00B7\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u203F\\u2040\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}]*$", "u");

/** https://html.spec.whatwg.org/#valid-custom-element-name */
export function isValidCustomElementName(name: string): boolean {
  return name.includes("-") && PCEN.test(name) && !RESERVED.has(name);
}

// --- registry -----------------------------------------------------------------------------

interface Deferred {
  promise: Promise<Function>;
  resolve: (c: Function) => void;
}

export interface ElementDefinitionOptions {
  extends?: string;
}

/** https://html.spec.whatwg.org/#customelementregistry */
export class CustomElementRegistry {
  [$byName]: Map<string, CustomElementDefinition>;
  [$byCtor]: Map<Function, CustomElementDefinition>;
  [$whenDefined]: Map<string, Deferred>;
  [$running]: boolean;
  [$window]: object | null;

  /** @internal */
  constructor(window: object | null = null) {
    this[$byName] = new Map();
    this[$byCtor] = new Map();
    this[$whenDefined] = new Map();
    this[$running] = false;
    this[$window] = window;
  }

  /** https://html.spec.whatwg.org/#dom-customelementregistry-define */
  define(name: string, constructor: Function, options?: ElementDefinitionOptions): void {
    name = String(name);
    // 1. IsConstructor
    if (typeof constructor !== "function" || !isConstructor(constructor)) {
      throw new TypeError("Failed to execute 'define' on 'CustomElementRegistry': The provided value is not a constructor.");
    }
    // 2.
    if (!isValidCustomElementName(name)) {
      throw new DOMException(`Failed to execute 'define' on 'CustomElementRegistry': "${name}" is not a valid custom element name`, "SyntaxError");
    }
    // 3–4.
    if (this[$byName].has(name)) {
      throw new DOMException(`Failed to execute 'define' on 'CustomElementRegistry': the name "${name}" has already been used with this registry`, "NotSupportedError");
    }
    if (this[$byCtor].has(constructor)) {
      throw new DOMException("Failed to execute 'define' on 'CustomElementRegistry': this constructor has already been used with this registry", "NotSupportedError");
    }
    // 5–6.
    let localName = name;
    const ext = options?.extends;
    if (ext !== undefined && ext !== null) {
      const e = String(ext);
      if (isValidCustomElementName(e)) throw new DOMException(`"${e}" is a valid custom element name and cannot be extended.`, "NotSupportedError");
      if (elementClassFor(e, HTML_NS).name === "HTMLUnknownElement") {
        throw new DOMException(`"${e}" is not a known HTML element and cannot be extended.`, "NotSupportedError");
      }
      localName = e;
    }
    // 7.
    if (this[$running]) throw new DOMException("Element definition is already running.", "NotSupportedError");
    this[$running] = true;
    let def: CustomElementDefinition;
    try {
      const prototype = (constructor as { prototype: unknown }).prototype;
      if (typeof prototype !== "object" || prototype === null) throw new TypeError("The constructor's prototype is not an object.");
      const proto = prototype as Record<string, unknown>;
      const cb = (n: string): Callback | null => {
        const v = proto[n];
        if (v === undefined) return null;
        if (typeof v !== "function") throw new TypeError(`"${n}" is not a function.`);
        return v as Callback;
      };
      const connectedCallback = cb("connectedCallback");
      const disconnectedCallback = cb("disconnectedCallback");
      const adoptedCallback = cb("adoptedCallback");
      const attributeChangedCallback = cb("attributeChangedCallback");
      const connectedMoveCallback = cb("connectedMoveCallback");
      const observedAttributes = new Set<string>();
      if (attributeChangedCallback !== null) {
        const oa = (constructor as { observedAttributes?: unknown }).observedAttributes;
        if (oa !== undefined) for (const a of toSequence(oa)) observedAttributes.add(String(a));
      }
      let disableInternals = false;
      let disableShadow = false;
      const df = (constructor as { disabledFeatures?: unknown }).disabledFeatures;
      if (df !== undefined) {
        for (const f of toSequence(df)) {
          if (f === "internals") disableInternals = true;
          else if (f === "shadow") disableShadow = true;
        }
      }
      const formAssociated = !!(constructor as { formAssociated?: unknown }).formAssociated;
      def = {
        name,
        localName,
        constructor,
        observedAttributes,
        connectedCallback,
        disconnectedCallback,
        adoptedCallback,
        attributeChangedCallback,
        connectedMoveCallback,
        formAssociatedCallback: formAssociated ? cb("formAssociatedCallback") : null,
        formResetCallback: formAssociated ? cb("formResetCallback") : null,
        formDisabledCallback: formAssociated ? cb("formDisabledCallback") : null,
        formStateRestoreCallback: formAssociated ? cb("formStateRestoreCallback") : null,
        formAssociated,
        disableInternals,
        disableShadow,
        constructionStack: [],
      };
    } finally {
      this[$running] = false;
    }
    // 14–15.
    this[$byName].set(name, def);
    this[$byCtor].set(constructor, def);
    definedCount++;
    // 16–17. Upgrade candidates in the window's document, in shadow-including tree order.
    const doc = (this[$window] as { document?: Document } | null)?.document;
    if (doc != null) {
      const candidates: Element[] = [];
      collectCandidates(doc[$impl], def, candidates);
      for (const el of candidates) enqueueUpgrade(el, def);
      flushReactions();
    }
    // 18.
    const d = this[$whenDefined].get(name);
    if (d !== undefined) {
      d.resolve(constructor);
      this[$whenDefined].delete(name);
    }
  }

  /** https://html.spec.whatwg.org/#dom-customelementregistry-get */
  get(name: string): Function | undefined {
    return this[$byName].get(String(name))?.constructor;
  }

  /** https://html.spec.whatwg.org/#dom-customelementregistry-getname */
  getName(constructor: Function): string | null {
    return this[$byCtor].get(constructor)?.name ?? null;
  }

  /** https://html.spec.whatwg.org/#dom-customelementregistry-whendefined */
  whenDefined(name: string): Promise<Function> {
    name = String(name);
    if (!isValidCustomElementName(name)) {
      return Promise.reject(new DOMException(`"${name}" is not a valid custom element name`, "SyntaxError"));
    }
    const def = this[$byName].get(name);
    if (def !== undefined) return Promise.resolve(def.constructor);
    let d = this[$whenDefined].get(name);
    if (d === undefined) {
      const { promise, resolve } = Promise.withResolvers<Function>();
      d = { promise, resolve };
      this[$whenDefined].set(name, d);
    }
    return d.promise;
  }

  /** https://html.spec.whatwg.org/#dom-customelementregistry-upgrade */
  upgrade(root: { [$impl]: NodeImpl }): void {
    const candidates: Element[] = [];
    forEachShadowIncludingInclusiveDescendant(root[$impl], (n) => {
      if (n.type === ELEMENT_NODE) candidates.push(n.node as Element);
    });
    for (const el of candidates) tryToUpgrade(el);
    flushReactions();
  }

  /** @internal https://html.spec.whatwg.org/#look-up-a-custom-element-definition (registry part). */
  _lookup(ns: string | null, localName: string, is: string | null): CustomElementDefinition | null {
    if (ns !== HTML_NS) return null;
    const byName = this[$byName].get(localName);
    if (byName !== undefined && byName.localName === localName) return byName;
    if (is !== null) {
      const byIs = this[$byName].get(is);
      if (byIs !== undefined && byIs.localName === localName) return byIs;
    }
    return null;
  }
}

function isConstructor(fn: Function): boolean {
  // Bound functions and classes are constructors; arrow functions and methods are not.
  try {
    Reflect.construct(String, [], fn);
    return true;
  } catch {
    return false;
  }
}

function toSequence(v: unknown): Iterable<unknown> {
  if (v === null || (typeof v !== "object" && typeof v !== "function") || typeof (v as Iterable<unknown>)[Symbol.iterator] !== "function") {
    throw new TypeError("The value provided is not iterable.");
  }
  return Array.from(v as Iterable<unknown>);
}

function forEachShadowIncludingInclusiveDescendant(root: NodeImpl, fn: (n: NodeImpl) => void): void {
  for (let n: NodeImpl | null = root; n !== null; n = nextInTree(n, root)) {
    fn(n);
    if (n.type === ELEMENT_NODE) {
      const shadow = (n.node as Element)[$shadowRoot];
      if (shadow !== null) forEachShadowIncludingInclusiveDescendant(shadow[$impl], fn);
    }
  }
}

function collectCandidates(root: NodeImpl, def: CustomElementDefinition, out: Element[]): void {
  forEachShadowIncludingInclusiveDescendant(root, (n) => {
    if (n.type !== ELEMENT_NODE || n.ns !== HTML_NS || n.name !== def.localName) return;
    const el = n.node as Element;
    if (def.localName !== def.name && isValues.get(el) !== def.name) return;
    out.push(el);
  });
}

const registries = new WeakMap<object, CustomElementRegistry>();

/** The CustomElementRegistry of a Window (created on first use). The window agent exposes it as `window.customElements`. */
export function customElementRegistryFor(window: object): CustomElementRegistry {
  let r = registries.get(window);
  if (r === undefined) {
    r = new CustomElementRegistry(window);
    registries.set(window, r);
  }
  return r;
}

/** https://html.spec.whatwg.org/#look-up-a-custom-element-definition */
export function lookupDefinition(doc: Document, ns: string | null, localName: string, is: string | null): CustomElementDefinition | null {
  if (definedCount === 0 || ns !== HTML_NS) return null;
  const window = doc[$window];
  if (window === null) return null;
  const r = registries.get(window);
  return r === undefined ? null : r._lookup(ns, localName, is);
}

// --- element state ------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#selector-defined — custom element state is "custom" or "uncustomized". */
export function isDefined(impl: NodeImpl): boolean {
  if ((impl.flags & F_CE_CUSTOM) !== 0) return true;
  if ((impl.flags & F_CUSTOM) !== 0) return !isValidCustomElementName(impl.name);
  // Customized built-in candidates (created with an `is` value) that are not upgraded yet.
  return isValueCount === 0 || !isValues.has(impl.node as Element) || definitions.has(impl.node as Element);
}

export function definitionOf(el: Element): CustomElementDefinition | undefined {
  return definitions.get(el);
}

export function isValueOf(el: Element): string | null {
  return isValues.get(el) ?? null;
}

/** WeakMap has no size; counting keeps `isDefined` a flag check for ordinary elements. */
let isValueCount = 0;

function setIsValue(el: Element, is: string): void {
  isValues.set(el, is);
  isValueCount++;
}

// --- HTMLElement constructor steps ---------------------------------------------------------

/** Document override for `new C()` during createElement on a non-current document. */
let creatingDocument: Document | null = null;

export type ConstructResult = { upgrade: Element; doc: null; localName: ""; def: null } | { upgrade: null; doc: Document; localName: string; def: CustomElementDefinition };

/**
 * https://html.spec.whatwg.org/#html-element-constructors — run when an HTML element interface
 * constructor is invoked without the internal creation arguments (i.e. from user code).
 */
export function htmlElementConstructorSteps(newTarget: Function): ConstructResult {
  // 1–3.
  let registry: CustomElementRegistry | undefined;
  try {
    registry = registries.get(currentWindow());
  } catch {
    registry = undefined;
  }
  const def = registry?.[$byCtor].get(newTarget);
  if (def === undefined) throw new TypeError("Illegal constructor");
  // 4–5. The "active function object": the first built-in interface on NewTarget's chain.
  let active: Function | null = null;
  for (let p = Object.getPrototypeOf(newTarget); p !== null && p !== Function.prototype; p = Object.getPrototypeOf(p)) {
    if (isBuiltinInterface(p)) {
      active = p;
      break;
    }
  }
  if (def.localName === def.name) {
    if (active === null || active.name !== "HTMLElement") throw new TypeError("Illegal constructor: autonomous custom elements must extend HTMLElement");
  } else if (active === null || !localNamesForInterface(active).includes(def.localName)) {
    throw new TypeError("Illegal constructor: the custom element does not extend the interface of its local name");
  }
  // 7. Not an upgrade: create a new element in the current global's document.
  const stack = def.constructionStack;
  if (stack.length === 0) {
    const doc = creatingDocument ?? (currentWindow() as unknown as { document: Document }).document;
    return { upgrade: null, doc, localName: def.localName, def };
  }
  // 8–12. Upgrade: hand back the element being upgraded.
  const el = stack[stack.length - 1];
  if (el === ALREADY_CONSTRUCTED) {
    throw new DOMException("Failed to construct custom element: this element was already constructed", "InvalidStateError");
  }
  Object.setPrototypeOf(el, (newTarget as { prototype: object }).prototype);
  stack[stack.length - 1] = ALREADY_CONSTRUCTED;
  return { upgrade: el, doc: null, localName: "", def: null };
}

/** Steps 7.x after the HTMLElement constructor created a brand-new custom element. */
export function initNewCustomElement(el: Element, def: CustomElementDefinition): void {
  markCustom(el, def);
  if (def.localName !== def.name) setIsValue(el, def.name);
}

function markCustom(el: Element, def: CustomElementDefinition): void {
  const impl = el[$impl];
  definitions.set(el, def);
  impl.flags |= F_CE_CUSTOM | F_CONNECT_HOOK;
  // Form-associated custom elements join the forms categories (html/forms/form-associated.ts).
  if (def.formAssociated) impl.flags |= F_FACE | F_ATTR_HOOK;
  if (def.attributeChangedCallback !== null && def.observedAttributes.size !== 0) impl.flags |= F_ATTR_HOOK;
}

// --- create an element (sync flag set) ----------------------------------------------------

/**
 * https://dom.spec.whatwg.org/#concept-create-element with the synchronous custom elements flag
 * set, for the custom element cases. Returns null for the ordinary case.
 */
function createElementSync(doc: Document, localName: string, ns: string | null, prefix: string | null, is: string | null): NodeImpl | null {
  if (definedCount === 0 && is === null) return null;
  const def = lookupDefinition(doc, ns, localName, is);
  // 5. Customized built-in: create the built-in, then upgrade synchronously.
  if (def !== null && def.name !== def.localName) {
    const impl = createElementImpl(doc, localName, ns, prefix);
    const el = impl.node as Element;
    setIsValue(el, def.name);
    try {
      upgrade(el, def);
    } catch (e) {
      reportException(e);
    }
    return impl;
  }
  // 6. Autonomous custom element: construct it now.
  if (def !== null) {
    const C = def.constructor as new () => Element;
    const saved = creatingDocument;
    creatingDocument = doc;
    try {
      const result = new C();
      const r = result[$impl];
      if (!(result instanceof (elementClassFor("x-x", HTML_NS) as Function))) throw new TypeError("The custom element constructor did not produce an HTMLElement.");
      if (r.attrs !== null && r.attrs.length !== 0) throw new DOMException("The result must not have attributes", "NotSupportedError");
      if (r.first !== null) throw new DOMException("The result must not have children", "NotSupportedError");
      if (r.parent !== null) throw new DOMException("The result must not have a parent", "NotSupportedError");
      if (r.doc !== doc) throw new DOMException("The result must be in the same document", "NotSupportedError");
      if (r.name !== localName) throw new DOMException("The result must have the same localName", "NotSupportedError");
      r.prefix = prefix;
      return r;
    } catch (e) {
      reportException(e);
      // 6.3 Failure: an HTMLUnknownElement whose custom element state is "failed".
      const Unknown = elementClassFor("applet", HTML_NS);
      const impl = new Unknown(doc, localName, ns, prefix)[$impl];
      impl.flags &= ~F_CONNECT_HOOK;
      return impl;
    } finally {
      creatingDocument = saved;
    }
  }
  // 7. Ordinary element, possibly with an `is` value for a later upgrade.
  const impl = createElementImpl(doc, localName, ns, prefix);
  if (is !== null && ns === HTML_NS) {
    setIsValue(impl.node as Element, is);
    impl.flags |= F_CONNECT_HOOK;
  }
  return impl;
}

setCustomElementCreate(createElementSync);

// --- upgrades -----------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#concept-upgrade-an-element */
function upgrade(el: Element, def: CustomElementDefinition): void {
  const impl = el[$impl];
  // 1. Already custom (or failed: definition set without the custom flag).
  if ((impl.flags & F_CE_CUSTOM) !== 0 || definitions.has(el)) return;
  // 2–3. Set the definition; state "failed" until construction succeeds.
  definitions.set(el, def);
  // 4. attributeChangedCallback for existing attributes.
  const attrs = impl.attrs;
  if (attrs !== null && def.attributeChangedCallback !== null) {
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (def.observedAttributes.has(a.localName)) {
        pushReaction(el, { kind: CALLBACK, def, fn: def.attributeChangedCallback, args: [a.localName, null, a.value, a.ns] });
      }
    }
  }
  // 5. connectedCallback when connected.
  if ((impl.flags & F_CONNECTED) !== 0 && def.connectedCallback !== null) {
    pushReaction(el, { kind: CALLBACK, def, fn: def.connectedCallback, args: [] });
  }
  // 6–10.
  def.constructionStack.push(el);
  try {
    const C = def.constructor as new () => unknown;
    const result = new C();
    if (result !== el) throw new TypeError("Custom element constructors must call super() first and must not return a different object.");
  } catch (e) {
    // Failure: definition stays set (state "failed"), reaction queue emptied.
    reactionQueues.delete(el);
    throw e;
  } finally {
    def.constructionStack.pop();
  }
  // 12. State "custom".
  markCustom(el, def);
}

/** https://html.spec.whatwg.org/#concept-try-upgrade */
function tryToUpgrade(el: Element): void {
  const impl = el[$impl];
  if ((impl.flags & F_CE_CUSTOM) !== 0) return;
  const def = lookupDefinition(impl.doc, impl.ns, impl.name, isValues.get(el) ?? null);
  if (def !== null) enqueueUpgrade(el, def);
}

// --- reactions ----------------------------------------------------------------------------

const UPGRADE = 0;
const CALLBACK = 1;
interface Reaction {
  kind: number;
  def: CustomElementDefinition;
  fn: Callback | null;
  args: unknown[];
}

/** Per-element reaction queues, in the order elements were first enqueued. */
const reactionQueues = new Map<Element, Reaction[]>();

function pushReaction(el: Element, r: Reaction): void {
  let q = reactionQueues.get(el);
  if (q === undefined) {
    q = [];
    reactionQueues.set(el, q);
  }
  q.push(r);
  setCEReactionsPending(true);
}

function enqueueUpgrade(el: Element, def: CustomElementDefinition): void {
  pushReaction(el, { kind: UPGRADE, def, fn: null, args: [] });
}

/** https://html.spec.whatwg.org/#enqueue-a-custom-element-callback-reaction */
function enqueueCallback(el: Element, name: "connectedCallback" | "disconnectedCallback" | "adoptedCallback" | "attributeChangedCallback", args: unknown[]): void {
  const def = definitions.get(el);
  if (def === undefined) return;
  const fn = def[name];
  if (fn === null) return;
  if (name === "attributeChangedCallback" && !def.observedAttributes.has(args[0] as string)) return;
  pushReaction(el, { kind: CALLBACK, def, fn, args });
}

let flushing = false;

/** https://html.spec.whatwg.org/#invoke-custom-element-reactions */
export function flushReactions(): void {
  if (flushing) return;
  flushing = true;
  try {
    while (reactionQueues.size !== 0) {
      const [el, queue] = reactionQueues.entries().next().value as [Element, Reaction[]];
      // Process this element's queue; callbacks may enqueue more (also for this element).
      while (queue.length !== 0) {
        const r = queue.shift()!;
        try {
          if (r.kind === UPGRADE) upgrade(el, r.def);
          else r.fn!.apply(el, r.args);
        } catch (e) {
          reportException(e);
        }
      }
      if (reactionQueues.get(el) === queue) reactionQueues.delete(el);
    }
  } finally {
    flushing = false;
    setCEReactionsPending(reactionQueues.size !== 0);
  }
}

setCEReactionsFlush(flushReactions);

/** https://html.spec.whatwg.org/#report-an-exception (fires `error` on the window; src/events). */
export function reportException(e: unknown, target: Element | null = null): void {
  reportError(e, target);
}

// --- element hooks (called from HTMLElement's _connectedSteps & co.) -----------------------

export function ceConnected(el: Element): void {
  if (definedCount === 0) return;
  if ((el[$impl].flags & F_CE_CUSTOM) !== 0) enqueueCallback(el, "connectedCallback", []);
  else tryToUpgrade(el);
}

export function ceDisconnected(el: Element): void {
  if ((el[$impl].flags & F_CE_CUSTOM) !== 0) enqueueCallback(el, "disconnectedCallback", []);
}

export function ceAttributeChanged(el: Element, localName: string, oldValue: string | null, value: string | null, ns: string | null): void {
  if ((el[$impl].flags & F_CE_CUSTOM) !== 0) enqueueCallback(el, "attributeChangedCallback", [localName, oldValue, value, ns]);
}

export function ceAdopted(el: Element, oldDoc: Document, newDoc: Document): void {
  if ((el[$impl].flags & F_CE_CUSTOM) !== 0) enqueueCallback(el, "adoptedCallback", [oldDoc, newDoc]);
}

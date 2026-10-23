// Custom elements.
// https://html.spec.whatwg.org/#custom-elements
//
// - `CustomElementRegistry` (one per Window, see `customElementRegistryFor`).
// - The HTMLElement constructor steps for `new MyElement()` and upgrades
//   (https://html.spec.whatwg.org/#html-element-constructors), called from HTMLElement.ts.
// - Synchronous construction for createElement/createElementNS (nodes/create.ts hook).
// - Custom element reactions (https://html.spec.whatwg.org/#custom-element-reactions): element
//   hooks enqueue reactions; nodes/tree.ts, nodes/attributes.ts and nodes/clone.ts flush the
//   current element queue at the end of every insert/remove/attribute change/clone
//   (`ceReactionsPending`), which approximates the [CEReactions] "end of the API call" timing
//   without wrapping every DOM method. A flush that runs inside a callback (a DOM call made by
//   a reaction) processes only what that call enqueued, like a nested [CEReactions] scope.
//   Anything left over (no flush point followed) runs in a microtask, like the backup element
//   queue (https://html.spec.whatwg.org/#backup-element-queue).
// - Cloning and the HTML parser create elements with the synchronous custom elements flag
//   unset (an upgrade reaction instead of construction), through nodes/create.ts hooks gated
//   on `ceActive`.
//
// Interface objects are shared by every window (docs/ARCHITECTURE.md), so `class extends
// frame.contentWindow.HTMLElement` cannot tell which global it belongs to: the HTMLElement
// constructor looks the constructor up in the current window's registry first, then in any
// registry that defined it (docs/deviations.md).
//
// Zero cost when unused: elements only reach this module through F_CUSTOM (valid-looking
// custom element names) or after `customElements.define()`.

import {
  DOCUMENT_FRAGMENT_NODE,
  ELEMENT_NODE,
  F_ADOPT_HOOK,
  F_ATTR_HOOK,
  F_CE_CUSTOM,
  F_CONNECTED,
  F_CONNECT_HOOK,
  F_CUSTOM,
  F_FACE,
  F_SHADOW_ROOT,
  HTML_NS,
} from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import { createElementImpl, setCEActive, setCEReactionsFlush, setCEReactionsPending, setCustomElementCloneHooks, setCustomElementCreate } from "../nodes/create.ts";
import { attr } from "../nodes/attributes.ts";
import { setShadowHostCustomStateCheck } from "../nodes/ShadowRoot.ts";
import { nextInTree } from "../nodes/traverse.ts";
import { currentWindow } from "../window/current.ts";
import { reportException as reportError } from "../events/report.ts";
import { elementClassFor, isBuiltinInterface, localNamesForInterface } from "./registry.ts";
import { $version, $byCtor, $byName, $impl, $running, $shadowRoot, $whenDefined, $window } from "../keys.ts";

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
  /** The registry the definition belongs to. */
  registry: CustomElementRegistry;
}

const ALREADY_CONSTRUCTED = Symbol("already constructed");

/** Element → its custom element definition (set at upgrade / creation). */
const definitions = new WeakMap<Element, CustomElementDefinition>();
/** Elements whose custom element state is "failed" (a constructor threw); never upgraded again. */
const failed = new WeakSet<Element>();
/** Elements whose custom element state is "precustomized" (being upgraded). */
const precustomized = new WeakSet<Element>();
/** Constructor → its most recent definition in any registry (constructors called from another window's realm). */
const anyRegistryDefinition = new WeakMap<Function, CustomElementDefinition>();
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
    // WebIDL: CustomElementConstructor is a callback function type.
    if (typeof constructor !== "function") {
      throw new TypeError("Failed to execute 'define' on 'CustomElementRegistry': parameter 2 is not of type 'Function'.");
    }
    name = String(name);
    // 1. IsConstructor(constructor) (without observable property gets).
    if (!isConstructor(constructor)) {
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
    // 5–7.
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
    // 8–9.
    if (this[$running]) throw new DOMException("Failed to execute 'define' on 'CustomElementRegistry': an element definition is already running.", "NotSupportedError");
    this[$running] = true;
    // 10.
    let formAssociated = false;
    let disableInternals = false;
    let disableShadow = false;
    const observedAttributes = new Set<string>();
    let connectedCallback: Callback | null = null;
    let disconnectedCallback: Callback | null = null;
    let adoptedCallback: Callback | null = null;
    let connectedMoveCallback: Callback | null = null;
    let attributeChangedCallback: Callback | null = null;
    let formAssociatedCallback: Callback | null = null;
    let formResetCallback: Callback | null = null;
    let formDisabledCallback: Callback | null = null;
    let formStateRestoreCallback: Callback | null = null;
    // 11.
    try {
      // 11.1–11.2.
      const prototype = (constructor as { prototype: unknown }).prototype;
      if (typeof prototype !== "object" || prototype === null) throw new TypeError("Failed to execute 'define' on 'CustomElementRegistry': The prototype of the constructor is not an object.");
      const proto = prototype as Record<string, unknown>;
      const cb = (n: string): Callback | null => {
        const v = proto[n];
        if (v === undefined) return null;
        if (typeof v !== "function") throw new TypeError(`Failed to execute 'define' on 'CustomElementRegistry': The '${n}' callback is not a function.`);
        return v as Callback;
      };
      // 11.3–11.4.
      connectedCallback = cb("connectedCallback");
      disconnectedCallback = cb("disconnectedCallback");
      connectedMoveCallback = cb("connectedMoveCallback");
      adoptedCallback = cb("adoptedCallback");
      attributeChangedCallback = cb("attributeChangedCallback");
      // 11.5.
      if (attributeChangedCallback !== null) {
        const oa = (constructor as { observedAttributes?: unknown }).observedAttributes;
        if (oa !== undefined) for (const a of toSequence(oa)) observedAttributes.add(String(a));
      }
      // 11.6–11.8.
      const df = (constructor as { disabledFeatures?: unknown }).disabledFeatures;
      if (df !== undefined) {
        for (const f of toSequence(df)) {
          const feature = String(f);
          if (feature === "internals") disableInternals = true;
          else if (feature === "shadow") disableShadow = true;
        }
      }
      // 11.9–11.11.
      formAssociated = !!(constructor as { formAssociated?: unknown }).formAssociated;
      if (formAssociated) {
        formAssociatedCallback = cb("formAssociatedCallback");
        formResetCallback = cb("formResetCallback");
        formDisabledCallback = cb("formDisabledCallback");
        formStateRestoreCallback = cb("formStateRestoreCallback");
      }
    } finally {
      // 11 (then): unset the element definition is running flag; exceptions propagate.
      this[$running] = false;
    }
    // 12.
    const def: CustomElementDefinition = {
      name,
      localName,
      constructor,
      observedAttributes,
      connectedCallback,
      disconnectedCallback,
      adoptedCallback,
      attributeChangedCallback,
      connectedMoveCallback,
      formAssociatedCallback,
      formResetCallback,
      formDisabledCallback,
      formStateRestoreCallback,
      formAssociated,
      disableInternals,
      disableShadow,
      constructionStack: [],
      registry: this,
    };
    // 13.
    this[$byName].set(name, def);
    this[$byCtor].set(constructor, def);
    anyRegistryDefinition.set(constructor, def);
    definedCount++;
    setCEActive();
    // 14–16. Upgrade candidates in the window's document, in shadow-including tree order.
    const doc = (this[$window] as { document?: Document } | null)?.document;
    if (doc != null) {
      const candidates: Element[] = [];
      collectCandidates(doc[$impl], def, candidates);
      for (const el of candidates) enqueueUpgrade(el, def);
      flushReactions();
    }
    // 17.
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
    if (typeof constructor !== "function") {
      throw new TypeError("Failed to execute 'getName' on 'CustomElementRegistry': parameter 1 is not of type 'Function'.");
    }
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

/** IsConstructor(fn), without observable [[Get]]s on `fn` (it may be a Proxy). */
const constructTrap: ProxyHandler<Function> = { construct: () => ({}) };
function isConstructor(fn: Function): boolean {
  try {
    // A Proxy has [[Construct]] iff its target does; the trap never touches `fn`.
    new (new Proxy(fn, constructTrap) as new () => object)();
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
      if (shadow != null) forEachShadowIncludingInclusiveDescendant(shadow[$impl], fn);
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
  return isValueCount === 0 || !isValues.has(impl.node as Element);
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
  if (!isValues.has(el)) isValueCount++;
  isValues.set(el, is);
  setCEActive();
}

/** https://dom.spec.whatwg.org/#concept-element-custom-element-state is "precustomized" or "custom" (attachShadow's "available to element internals"). */
export function isPrecustomizedOrCustom(el: Element): boolean {
  return (el[$impl].flags & F_CE_CUSTOM) !== 0 || precustomized.has(el);
}

// --- HTMLElement constructor steps ---------------------------------------------------------

/** Document override for `new C()` during createElement on a non-current document. */
let creatingDocument: Document | null = null;

export type ConstructResult =
  | { upgrade: Element; doc: null; localName: ""; def: null; active: null }
  | { upgrade: null; doc: Document; localName: string; def: CustomElementDefinition; active: Function | null };

/**
 * https://html.spec.whatwg.org/#html-element-constructors — run when an HTML element interface
 * constructor is invoked without the internal creation arguments (i.e. from user code).
 */
export function htmlElementConstructorSteps(newTarget: Function): ConstructResult {
  // 1–3. The current global's registry; interface objects are shared by all windows, so a
  // constructor defined only in another window's registry (an iframe's) is found there.
  let registry: CustomElementRegistry | undefined;
  try {
    registry = registries.get(currentWindow());
  } catch {
    registry = undefined;
  }
  const def = registry?.[$byCtor].get(newTarget) ?? anyRegistryDefinition.get(newTarget);
  if (def === undefined) throw new TypeError("Illegal constructor");
  // 2. NewTarget is the active function object itself (`new HTMLElement()` after defining HTMLElement).
  if (isBuiltinInterface(newTarget)) throw new TypeError("Illegal constructor");
  // 4–5. The "active function object": the first built-in interface on NewTarget's chain
  // (HTMLElement when NewTarget does not inherit from one, e.g. Reflect.construct(HTMLElement, [], F)).
  let active: Function | null = null;
  for (let p = Object.getPrototypeOf(newTarget); p !== null && p !== Function.prototype; p = Object.getPrototypeOf(p)) {
    if (isBuiltinInterface(p)) {
      active = p;
      break;
    }
  }
  if (def.localName === def.name) {
    if (active !== null && active.name !== "HTMLElement") throw new TypeError("Illegal constructor: autonomous custom elements must extend HTMLElement");
  } else if (active !== null && !usesInterface(active, def.localName)) {
    // (NewTarget not inheriting from any interface, e.g. Reflect.construct(HTMLParagraphElement,
    // [], F): the invoked interface cannot be told apart here, so it is accepted.)
    throw new TypeError("Illegal constructor: the custom element does not extend the interface of its local name");
  }
  // 8. Not an upgrade: create a new element in the registry's (current global's) document.
  const stack = def.constructionStack;
  if (stack.length === 0) {
    const doc = creatingDocument ?? (def.registry[$window] as { document: Document } | null)?.document ?? (currentWindow() as unknown as { document: Document }).document;
    return { upgrade: null, doc, localName: def.localName, def, active };
  }
  // 9–13. Upgrade: hand back the element being upgraded.
  const el = stack[stack.length - 1];
  if (el === ALREADY_CONSTRUCTED) {
    throw new TypeError("Failed to construct custom element: this element was already constructed");
  }
  // 6–7. NewTarget's "prototype" (the interface prototype when it is not an object).
  let proto = (newTarget as { prototype: unknown }).prototype;
  if (typeof proto !== "object" || proto === null) proto = (active ?? elementClassFor("x-x", HTML_NS)).prototype;
  Object.setPrototypeOf(el, proto as object);
  stack[stack.length - 1] = ALREADY_CONSTRUCTED;
  return { upgrade: el, doc: null, localName: "", def: null, active: null };
}

/** Whether the element interface of HTML `localName` is `active` (some elements, e.g. <summary>, use an internal subclass named HTMLElement). */
function usesInterface(active: Function, localName: string): boolean {
  if (localNamesForInterface(active).includes(localName)) return true;
  return active.name === "HTMLElement" && elementClassFor(localName, HTML_NS).name === "HTMLElement";
}

/** Step 8 after the HTMLElement constructor created a brand-new custom element. */
export function initNewCustomElement(el: Element, def: CustomElementDefinition, active: Function | null): void {
  // 6–7. NewTarget's "prototype" was not an object: JS gave the element the realm's
  // Object.prototype; the spec uses the active function object's interface prototype.
  // Detected without another Get of NewTarget.prototype: the proto is some realm's
  // Object.prototype (no prototype of its own and is its constructor's prototype).
  const p = Object.getPrototypeOf(el) as { constructor?: { prototype?: unknown } } | null;
  if (p !== null && Object.getPrototypeOf(p) === null && Object.hasOwn(p, "isPrototypeOf") && p.constructor?.prototype === p) {
    Object.setPrototypeOf(el, (active ?? elementClassFor("x-x", HTML_NS)).prototype as object);
  }
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
  if (def.adoptedCallback !== null) impl.flags |= F_ADOPT_HOOK;
}

// --- create an element ---------------------------------------------------------------------

/**
 * https://dom.spec.whatwg.org/#concept-create-element with the synchronous custom elements flag
 * set, for the custom element cases. Returns null for the ordinary case.
 */
function createElementSync(doc: Document, localName: string, ns: string | null, prefix: string | null, is: string | null): NodeImpl | null {
  if (definedCount === 0 && is === null) return null;
  // 3. (scoped registries aside) 4.
  const def = lookupDefinition(doc, ns, localName, is);
  // 5. Customized built-in: create the built-in, then upgrade synchronously.
  if (def !== null && def.name !== def.localName) {
    const impl = createElementImpl(doc, localName, ns, prefix);
    const el = impl.node as Element;
    setIsValue(el, def.name);
    impl.flags |= F_CONNECT_HOOK;
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
      // 6.1.3–6.1.10.
      if (result === null || typeof result !== "object" || !(result instanceof (elementClassFor("x-x", HTML_NS) as Function))) {
        throw new TypeError("The custom element constructor did not produce an HTMLElement.");
      }
      const r = result[$impl];
      if (r.attrs !== null && r.attrs.length !== 0) throw new DOMException("The result must not have attributes", "NotSupportedError");
      if (r.first !== null) throw new DOMException("The result must not have children", "NotSupportedError");
      if (r.parent !== null) throw new DOMException("The result must not have a parent", "NotSupportedError");
      if (r.doc !== doc) throw new DOMException("The result must be in the same document", "NotSupportedError");
      if (r.name !== localName) throw new DOMException("The result must have the same localName", "NotSupportedError");
      // 6.1.11–6.1.12.
      r.prefix = prefix;
      return r;
    } catch (e) {
      reportException(e);
      // 6.2 Failure: an HTMLUnknownElement whose custom element state is "failed".
      return failedElement(doc, localName, ns, prefix);
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

function failedElement(doc: Document, localName: string, ns: string | null, prefix: string | null): NodeImpl {
  const Unknown = elementClassFor("applet", HTML_NS);
  const el = new Unknown(doc, localName, ns, prefix);
  const impl = el[$impl];
  impl.flags &= ~F_CONNECT_HOOK;
  failed.add(el);
  return impl;
}

/**
 * https://dom.spec.whatwg.org/#concept-create-element with the synchronous custom elements flag
 * unset, given an "is" value: a defined custom element is created in state "undefined" with an
 * upgrade reaction enqueued (steps 5.3 and 6.2); an undefined one keeps its "is" value.
 */
function createElementUnsync(doc: Document, localName: string, ns: string | null, prefix: string | null, is: string | null): NodeImpl {
  const impl = createElementImpl(doc, localName, ns, prefix);
  if (ns !== HTML_NS) return impl;
  initUnsync(impl, is);
  return impl;
}

function initUnsync(impl: NodeImpl, is: string | null): void {
  const el = impl.node as Element;
  const def = lookupDefinition(impl.doc, HTML_NS, impl.name, is);
  if (def !== null) {
    if (def.name !== def.localName) setIsValue(el, def.name);
    impl.flags |= F_CONNECT_HOOK;
    enqueueUpgrade(el, def);
  } else if (is !== null) {
    setIsValue(el, is);
    impl.flags |= F_CONNECT_HOOK;
  }
}

/** https://dom.spec.whatwg.org/#concept-node-clone step 2.1 (nodes/clone.ts hook). */
function cloneElement(doc: Document, source: NodeImpl): NodeImpl {
  return createElementUnsync(doc, source.name, source.ns, source.prefix, source.ns === HTML_NS ? (isValues.get(source.node as Element) ?? null) : null);
}

/**
 * https://html.spec.whatwg.org/#create-an-element-for-the-token steps 3–7 for an element the
 * parser already created (parser/index.ts hook): the "is" attribute gives the "is" value, and a
 * defined custom element gets an upgrade reaction. Fragment parsing never runs scripts, so
 * construction is never synchronous here (document parsing in a browsing context with
 * definitions does not happen: no script execution).
 */
function parserCreated(impl: NodeImpl): void {
  parsing = true;
  try {
    initUnsync(impl, impl.attrs === null ? null : attr(impl, "is"));
  } finally {
    parsing = false;
  }
}

/** True while `parserCreated` enqueues: the element waits in `deferredParsed`. */
let parsing = false;
/**
 * Parser-created elements with an upgrade reaction whose element is still in the parser's
 * output fragment. The DOM operation that parsed them (innerHTML & co.) may flush while
 * replacing the old children, before the fragment is inserted; the spec runs these upgrades at
 * the end of the whole [CEReactions] call, so they join the element queue once the element has
 * left the fragment (or in the backup microtask).
 */
let deferredParsed: Element[] = [];

function releaseDeferred(all: boolean): void {
  let ready: Element[] | null = null;
  let keep: Element[] | null = null;
  for (let i = 0; i < deferredParsed.length; i++) {
    const el = deferredParsed[i];
    let root = el[$impl];
    while (root.parent !== null) root = root.parent;
    if (!all && root.type === DOCUMENT_FRAGMENT_NODE && (root.flags & F_SHADOW_ROOT) === 0) (keep ??= []).push(el);
    else (ready ??= []).push(el);
  }
  deferredParsed = keep ?? [];
  if (ready !== null) elementQueue = elementQueue.length === 0 ? ready : ready.concat(elementQueue);
}

setCustomElementCreate(createElementSync);
setShadowHostCustomStateCheck(isPrecustomizedOrCustom);
setCustomElementCloneHooks(cloneElement, parserCreated);

/** html/forms/face.ts registers its owner/disabledness check (a static import would be circular). */
let faceUpgraded: ((impl: NodeImpl) => void) | null = null;

export function setFaceUpgradeHook(fn: (impl: NodeImpl) => void): void {
  faceUpgraded = fn;
}

// --- upgrades -----------------------------------------------------------------------------

/** https://html.spec.whatwg.org/#concept-upgrade-an-element */
function upgrade(el: Element, def: CustomElementDefinition): void {
  const impl = el[$impl];
  // 1. State is not "undefined" or "uncustomized".
  if ((impl.flags & F_CE_CUSTOM) !== 0 || failed.has(el) || precustomized.has(el)) return;
  // 2–3. Set the definition; state "failed" until construction succeeds.
  definitions.set(el, def);
  failed.add(el);
  // 4–5. attributeChangedCallback for existing attributes, connectedCallback when connected.
  // Upgrades run while `el`'s own reaction queue is being processed (flushReactions), which
  // picks these up after the constructor: they go on that queue only, so a DOM call made by
  // the constructor (a nested flush) does not run them early.
  let queue = reactionQueues.get(el);
  if (queue === undefined) reactionQueues.set(el, (queue = []));
  const attrs = impl.attrs;
  if (attrs !== null && def.attributeChangedCallback !== null) {
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (def.observedAttributes.has(a.localName)) {
        queue.push({ kind: CALLBACK, def, fn: def.attributeChangedCallback, args: [a.localName, null, a.value, a.ns] });
      }
    }
  }
  if ((impl.flags & F_CONNECTED) !== 0 && def.connectedCallback !== null) {
    queue.push({ kind: CALLBACK, def, fn: def.connectedCallback, args: [] });
  }
  // 6–11.
  def.constructionStack.push(el);
  try {
    // 9.1.
    if (def.disableShadow && (el as unknown as { [$shadowRoot]: unknown })[$shadowRoot] != null) {
      throw new DOMException("Failed to upgrade the custom element: its definition disables shadow roots, but it already has one.", "NotSupportedError");
    }
    // 9.2. State "precustomized".
    precustomized.add(el);
    const C = def.constructor as new () => unknown;
    const result = new C() as { [$impl]?: NodeImpl } | null;
    // 9.4 SameValue(constructResult, element). Built-ins that wrap themselves (HTMLFormElement's
    // named-property Proxy) re-wrap the upgraded element: same impl means same element, and the
    // element keeps its original wrapper.
    if (result !== el) {
      if (result === null || typeof result !== "object" || result[$impl] !== impl) {
        throw new TypeError("Custom element constructors must call super() first and must not return a different object.");
      }
      impl.node = el;
    }
  } catch (e) {
    // 12. Failure: definition cleared (state stays "failed"), reaction queue emptied.
    definitions.delete(el);
    const q = reactionQueues.get(el);
    if (q !== undefined) q.length = 0;
    throw e;
  } finally {
    precustomized.delete(el);
    def.constructionStack.pop();
  }
  // 14. State "custom".
  failed.delete(el);
  markCustom(el, def);
  // 13. A form-associated custom element: reset the form owner, report the owner and
  // disabledness (html/forms/face.ts enqueues formAssociatedCallback / formDisabledCallback).
  // Version-stamped caches (form.elements, fieldset.elements, ...) now see it as listed.
  if (def.formAssociated) {
    impl.doc[$version]++;
    if (faceUpgraded !== null) faceUpgraded(impl);
  }
}

/** https://html.spec.whatwg.org/#concept-try-upgrade */
function tryToUpgrade(el: Element): void {
  const impl = el[$impl];
  if ((impl.flags & F_CE_CUSTOM) !== 0 || failed.has(el)) return;
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

/** https://html.spec.whatwg.org/#custom-element-reaction-queue (per element). */
const reactionQueues = new WeakMap<Element, Reaction[]>();
/**
 * The current element queue (https://html.spec.whatwg.org/#current-element-queue): elements
 * that got a reaction since the last flush, in order (an element may appear more than once).
 */
let elementQueue: Element[] = [];
let microtaskQueued = false;

function pushReaction(el: Element, r: Reaction): void {
  let q = reactionQueues.get(el);
  if (q === undefined) {
    q = [];
    reactionQueues.set(el, q);
  }
  q.push(r);
  // https://html.spec.whatwg.org/#enqueue-an-element-on-the-appropriate-element-queue
  if (parsing) deferredParsed.push(el);
  else elementQueue.push(el);
  setCEReactionsPending(true);
  if (!microtaskQueued) {
    microtaskQueued = true;
    queueMicrotask(backupFlush);
  }
}

/** https://html.spec.whatwg.org/#backup-element-queue — reactions no flush point picked up. */
function backupFlush(): void {
  microtaskQueued = false;
  if (deferredParsed.length !== 0) releaseDeferred(true);
  flushReactions();
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

/** Enqueue a form-associated custom element callback (formAssociatedCallback & co.; html/forms/face.ts). */
export function enqueueFormCallback(el: Element, name: "formAssociatedCallback" | "formResetCallback" | "formDisabledCallback" | "formStateRestoreCallback", args: unknown[]): void {
  const def = definitions.get(el);
  if (def === undefined) return;
  const fn = def[name];
  if (fn === null) return;
  pushReaction(el, { kind: CALLBACK, def, fn, args });
}

/**
 * https://html.spec.whatwg.org/#invoke-custom-element-reactions for the current element queue.
 * Re-entrant: a DOM call made by a callback flushes (only) the reactions it enqueued before the
 * callback continues, like the nested [CEReactions] scope of that call.
 */
export function flushReactions(): void {
  if (deferredParsed.length !== 0) releaseDeferred(false);
  while (elementQueue.length !== 0) {
    const queue = elementQueue;
    elementQueue = [];
    for (let i = 0; i < queue.length; i++) {
      const el = queue[i];
      const reactions = reactionQueues.get(el)!;
      while (reactions.length !== 0) {
        const r = reactions.shift()!;
        try {
          if (r.kind === UPGRADE) upgrade(el, r.def);
          else r.fn!.apply(el, r.args);
        } catch (e) {
          reportException(e);
        }
      }
    }
  }
  setCEReactionsPending(deferredParsed.length !== 0);
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

/**
 * https://dom.spec.whatwg.org/#move step 24.2 (moveBefore within a connected tree): enqueue
 * connectedMoveCallback, or, without one, disconnectedCallback then connectedCallback
 * (https://html.spec.whatwg.org/#enqueue-a-custom-element-callback-reaction step 3).
 */
export function ceMoved(el: Element): void {
  const impl = el[$impl];
  if ((impl.flags & F_CE_CUSTOM) === 0 || (impl.flags & F_CONNECTED) === 0) return;
  const def = definitions.get(el);
  if (def === undefined) return;
  if (def.connectedMoveCallback !== null) {
    pushReaction(el, { kind: CALLBACK, def, fn: def.connectedMoveCallback, args: [] });
    return;
  }
  const disconnected = def.disconnectedCallback;
  const connected = def.connectedCallback;
  if (disconnected === null && connected === null) return;
  pushReaction(el, {
    kind: CALLBACK,
    def,
    fn: function (this: Element) {
      if (disconnected !== null) disconnected.call(this);
      if (connected !== null) connected.call(this);
    },
    args: [],
  });
}

/** https://dom.spec.whatwg.org/#concept-node-adopt step 3.2.1 */
export function ceAdopted(el: Element, oldDoc: Document, newDoc: Document): void {
  if ((el[$impl].flags & F_CE_CUSTOM) !== 0) enqueueCallback(el, "adoptedCallback", [oldDoc, newDoc]);
}

/**
 * https://dom.spec.whatwg.org/#concept-attach-a-shadow-root step 3: the definition (looked up by
 * name, like the spec) disables shadow roots.
 */
export function shadowDisabled(el: Element): boolean {
  if (definedCount === 0) return false;
  const impl = el[$impl];
  const def = definitions.get(el) ?? lookupDefinition(impl.doc, impl.ns, impl.name, isValues.get(el) ?? null);
  return def !== null && def !== undefined && def.disableShadow;
}

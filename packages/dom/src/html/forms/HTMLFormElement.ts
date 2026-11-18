// https://html.spec.whatwg.org/#the-form-element
//
// The form element supports named and indexed properties (`form.email`, `form[0]`,
// https://html.spec.whatwg.org/#the-form-element:supported-property-names) — React onSubmit
// handlers read `event.currentTarget.email.value` constantly. That needs a Proxy; only form
// elements pay for it (the wrapper returned by the constructor IS the proxy, and
// `NodeImpl.node` points at it so every internal path hands out the same object).

import { cachedSnapshot, storeSnapshot } from "../../nodes/derived.ts";
import { HTMLElement } from "../HTMLElement.ts";
import { flushFaceReactions } from "./face.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { bool, enumerated, str, tokenList, type EnumSpec } from "../reflect.ts";
import { reportNotImplemented, stubbedMethod } from "../../window/not-implemented.ts";

/** jsdom reports form.submit() as not implemented (window/not-implemented.ts). */
const SUBMIT_NOT_IMPLEMENTED = stubbedMethod("HTMLFormElement", "submit");
import { rememberName, type PastName } from "./past-names.ts";
import { reflectActionURL } from "./common.ts";
import { formControls, type FormControlsSnapshot } from "./form-associated.ts";
import {
  createFormControlsCollection,
  namedControl,
  namedImage,
  RadioNodeList,
  type HTMLFormControlsCollection,
} from "./collections.ts";
import { contentAttr } from "../reflect.ts";
import { formCheckValidity, isSubmitButton, resetForm, submitForm } from "./form-submission.ts";
import {
  $constructingEntryList,
  $elements,
  $firingSubmissionEvents,
  $impl,
  $lockedForReset,
  $pastNames,
  $formControlsVersion,
  $treeVersion,
  $window,
} from "../../keys.ts";

const ENCTYPE: EnumSpec = {
  keywords: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"],
  missing: "application/x-www-form-urlencoded",
  invalid: "application/x-www-form-urlencoded",
};
const METHOD: EnumSpec = { keywords: ["get", "post", "dialog"], missing: "get", invalid: "get" };
const AUTOCOMPLETE: EnumSpec = { keywords: ["on", "off"], missing: "on", invalid: "on" };

export class HTMLFormElement extends HTMLElement {
  [$elements]: HTMLFormControlsCollection | null;
  /** https://html.spec.whatwg.org/#firing-submission-events */
  [$firingSubmissionEvents]: boolean;
  /** https://html.spec.whatwg.org/#locked-for-reset */
  [$lockedForReset]: boolean;
  /** https://html.spec.whatwg.org/#constructing-entry-list */
  [$constructingEntryList]: boolean;
  /** https://html.spec.whatwg.org/#past-names-map */
  [$pastNames]: Map<string, PastName> | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$elements] = null;
    this[$firingSubmissionEvents] = false;
    this[$lockedForReset] = false;
    this[$constructingEntryList] = false;
    this[$pastNames] = null;
    const proxy = new Proxy(this, formHandler);
    this[$impl].node = proxy;
    // biome-ignore lint: returning the proxy from the constructor is the point
    return proxy;
  }

  /** https://html.spec.whatwg.org/#dom-form-nameditem — element, RadioNodeList, or undefined. */
  _namedProperty(name: string): unknown {
    if (name === "") return undefined;
    const form = this[$impl];
    const controls = this._controls();
    const match = namedControl(form, controls, name) ?? (controls.hasImage ? namedImage(form, name) : null);
    if (match === null) return this[$pastNames]?.get(name)?.deref()?.node;
    if (match instanceof RadioNodeList) return match;
    rememberName(this, name, match);
    return match.node;
  }

  /** @internal Listed controls whose form owner is this form (image buttons excluded), tree order. */
  _controls(): FormControlsSnapshot {
    const form = this[$impl];
    const doc = form.doc;
    const version = doc[$treeVersion] + doc[$formControlsVersion];
    const cached = cachedSnapshot<NodeImpl>(doc, form, version);
    if (cached !== undefined) return cached;
    const items = formControls(form, [], false);
    storeSnapshot(doc, form, version, items);
    return items;
  }

  /** https://html.spec.whatwg.org/#dom-form-elements */
  get elements(): HTMLFormControlsCollection {
    return (this[$elements] ??= createFormControlsCollection(this[$impl]));
  }

  /** https://html.spec.whatwg.org/#dom-form-length */
  get length(): number {
    return this._controls().length;
  }

  /** https://html.spec.whatwg.org/#dom-fs-action */
  get action(): string {
    return reflectActionURL(this[$impl], "action");
  }

  set action(v: string) {
    this.setAttribute("action", String(v));
  }

  get encoding(): string {
    return this.enctype;
  }

  set encoding(v: string) {
    this.enctype = v;
  }

  declare acceptCharset: string;
  declare autocomplete: string;
  declare enctype: string;
  declare method: string;
  declare name: string;
  declare noValidate: boolean;
  declare rel: string;
  declare relList: object;
  declare target: string;

  /** https://html.spec.whatwg.org/#dom-form-submit — no events, no validation, no navigation. */
  submit(): void {
    reportNotImplemented(this[$impl].doc[$window] as object | null, SUBMIT_NOT_IMPLEMENTED);
    submitForm(this[$impl], this[$impl], true);
  }

  /** https://html.spec.whatwg.org/#dom-form-requestsubmit */
  requestSubmit(submitter: Element | null = null): void {
    let s: NodeImpl = this[$impl];
    if (submitter !== null && submitter !== undefined) {
      const impl = (submitter as { [$impl]?: NodeImpl })[$impl];
      if (impl === undefined || !isSubmitButton(impl)) {
        throw new TypeError(
          "Failed to execute 'requestSubmit' on 'HTMLFormElement': The specified element is not a submit button.",
        );
      }
      if ((submitter as unknown as { form: Element | null }).form !== this) {
        throw new DOMException(
          "Failed to execute 'requestSubmit' on 'HTMLFormElement': The specified element is not owned by this form element.",
          "NotFoundError",
        );
      }
      s = impl;
    }
    submitForm(this[$impl], s, false);
  }

  /** https://html.spec.whatwg.org/#dom-form-reset */
  reset(): void {
    resetForm(this[$impl]);
    // [CEReactions]: formResetCallback reactions run at the end of reset() (html/forms/face.ts).
    flushFaceReactions();
  }

  /** https://html.spec.whatwg.org/#dom-form-checkvalidity */
  checkValidity(): boolean {
    return formCheckValidity(this[$impl]);
  }

  /** https://html.spec.whatwg.org/#dom-form-reportvalidity */
  reportValidity(): boolean {
    return formCheckValidity(this[$impl]);
  }
}

str(HTMLFormElement, "acceptCharset=accept-charset name rel target");
bool(HTMLFormElement, "noValidate=novalidate");
enumerated(HTMLFormElement, "enctype", ENCTYPE);
enumerated(HTMLFormElement, "method", METHOD);
enumerated(HTMLFormElement, "autocomplete", AUTOCOMPLETE);
tokenList(HTMLFormElement, "relList", "rel", ["noopener", "noreferrer", "opener"]);

/**
 * The indexed or named property value for `key` (https://webidl.spec.whatwg.org/#legacy-platform-object-getownproperty
 * steps 1-2), or undefined. The caller has established that `key` is neither an own nor an
 * inherited property, i.e. that a name is visible (no [LegacyOverrideBuiltIns]).
 */
function indexedOrNamedValue(target: HTMLFormElement, key: string): unknown {
  const i = arrayIndex(key);
  if (i !== -1) return target._controls()[i]?.node;
  return target._namedProperty(key);
}

function arrayIndex(key: string): number {
  const c = key.charCodeAt(0);
  if (c < 48 || c > 57) return -1;
  const n = Number(key);
  return Number.isInteger(n) && String(n) === key ? n : -1;
}

// Every trap settles the common case — a built-in member, a React expando (`__reactFiber$`,
// `__reactProps$`), an internal symbol (keys.ts) — with one prototype-chain walk, and consults
// the (comparatively expensive: a scan of the controls) named-property machinery only for keys
// the object does not have.

/** Named and indexed property access for form elements (WebIDL legacy platform object, no override of built-ins). */
const formHandler: ProxyHandler<HTMLFormElement> = {
  get(target, key, receiver) {
    // Symbol keys are never named properties: internal state is read on every event dispatched
    // through a form and by every prototype getter (`this[$impl]` with `this` the proxy), so skip
    // Reflect.get's receiver plumbing; `$impl` itself gets a monomorphic named load.
    if (key === $impl) return target[$impl];
    if (typeof key === "symbol") return (target as unknown as Record<symbol, unknown>)[key];
    // Step 1: a supported index is not subject to visibility, so it needs no chain walk at all.
    const i = arrayIndex(key);
    if (i !== -1) {
      const controls = target._controls();
      return i < controls.length ? controls[i].node : Reflect.get(target, key, receiver);
    }
    // One chain walk settles a defined value. An undefined one is either an own or inherited
    // undefined (which wins: no [LegacyOverrideBuiltIns]) or a visible name; `in` is only needed
    // to tell those apart when there is a control of that name.
    const value = Reflect.get(target, key, receiver);
    if (value !== undefined) return value;
    const named = target._namedProperty(key);
    return named === undefined || key in target ? undefined : named;
  },
  has(target, key) {
    if (key in target) return true;
    return typeof key === "string" && indexedOrNamedValue(target, key) !== undefined;
  },
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === "string" && !(key in target)) {
      const value = indexedOrNamedValue(target, key);
      if (value !== undefined) {
        return { value, writable: false, enumerable: arrayIndex(key) !== -1, configurable: true };
      }
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-set — no indexed/named setters, so
  // ordinary [[Set]] with LegacyPlatformObjectGetOwnProperty as the own descriptor: a supported
  // index or visible name cannot be shadowed by an expando (TypeError in strict mode).
  set(target, key, value, receiver) {
    if (typeof key === "symbol") return Reflect.set(target, key, value, receiver);
    if (receiver !== target[$impl].node) {
      // The form is on the receiver's prototype chain: a supported index or visible name is a
      // non-writable own descriptor, anything else is ordinary.
      if (!(key in target) && indexedOrNamedValue(target, key) !== undefined) return false;
      return Reflect.set(target, key, value, receiver);
    }
    const own = Reflect.getOwnPropertyDescriptor(target, key);
    if (own !== undefined) {
      // An own writable data property (a React expando being updated): plain store. Accessors
      // keep the proxy as `this`; a non-writable data property refuses.
      if (own.writable === true) {
        (target as unknown as Record<string, unknown>)[key] = value;
        return true;
      }
      if (own.set === undefined && own.get === undefined) return false;
      return Reflect.set(target, key, value, receiver);
    }
    if (key in target) return Reflect.set(target, key, value, receiver);
    // Neither own nor inherited: an unsettable index or visible name, or a new expando. For the
    // expando, [[Set]] on the proxy itself ends in CreateDataProperty on the receiver, i.e. the
    // defineProperty trap below repeating these checks: define it directly.
    if (arrayIndex(key) !== -1 || target._namedProperty(key) !== undefined) return false;
    return Reflect.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-defineownproperty — step 1: no
  // indexed setter, so any array index refuses; step 2: a visible name without a named setter too.
  defineProperty(target, key, desc) {
    if (typeof key === "string") {
      if (arrayIndex(key) !== -1) return false;
      if (!(key in target) && target._namedProperty(key) !== undefined) return false;
    }
    return Reflect.defineProperty(target, key, desc);
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-delete — no deleters: a supported
  // index (step 1) or visible name (step 2) cannot be deleted.
  deleteProperty(target, key) {
    if (typeof key === "string" && !(key in target) && indexedOrNamedValue(target, key) !== undefined) return false;
    return Reflect.deleteProperty(target, key);
  },
  // https://webidl.spec.whatwg.org/#legacy-platform-object-ownpropertykeys — indices, visible
  // names, then the object's own keys.
  ownKeys(target) {
    const controls = target._controls();
    const past = target[$pastNames];
    const own = Reflect.ownKeys(target);
    if (controls.length === 0 && past === null) return own;

    const keys: (string | symbol)[] = [];
    const names = new Set<string>();
    // https://html.spec.whatwg.org/#the-form-element:supported-property-names
    for (let i = 0; i < controls.length; i++) {
      keys.push(String(i));
      const control = controls[i];
      if (control.id !== "") names.add(control.id);
      const name = contentAttr(control, "name");
      if (name !== null && name !== "") names.add(name);
    }
    if (past !== null) {
      for (const [name, binding] of past) {
        if (!names.has(name) && binding.deref() !== undefined) names.add(name);
      }
    }
    for (const name of names) {
      const index = arrayIndex(name);
      if ((index === -1 || index >= controls.length) && !(name in target)) keys.push(name);
    }
    for (const key of own) keys.push(key);
    return keys;
  },
};

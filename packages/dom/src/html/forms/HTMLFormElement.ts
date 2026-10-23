// https://html.spec.whatwg.org/#the-form-element
//
// The form element supports named and indexed properties (`form.email`, `form[0]`,
// https://html.spec.whatwg.org/#the-form-element:supported-property-names) — React onSubmit
// handlers read `event.currentTarget.email.value` constantly. That needs a Proxy; only form
// elements pay for it (the wrapper returned by the constructor IS the proxy, and
// `NodeImpl.node` points at it so every internal path hands out the same object).

import { HTMLElement } from "../HTMLElement.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { bool, enumerated, str, tokenList, type EnumSpec } from "../reflect.ts";
import { reflectActionURL } from "./common.ts";
import { formControls, formOwner } from "./form-associated.ts";
import { createFormControlsCollection, RadioNodeList, type HTMLFormControlsCollection } from "./collections.ts";
import { contentAttr } from "../reflect.ts";
import { T } from "../../nodes/tags.ts";
import { nextElementInTree, treeRoot } from "../../nodes/traverse.ts";
import { formCheckValidity, isSubmitButton, resetForm, submitForm } from "./form-submission.ts";

const ENCTYPE: EnumSpec = {
  keywords: ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"],
  missing: "application/x-www-form-urlencoded",
  invalid: "application/x-www-form-urlencoded",
};
const METHOD: EnumSpec = { keywords: ["get", "post", "dialog"], missing: "get", invalid: "get" };
const AUTOCOMPLETE: EnumSpec = { keywords: ["on", "off"], missing: "on", invalid: "on" };

export class HTMLFormElement extends HTMLElement {
  _elements: HTMLFormControlsCollection | null;
  /** Version-stamped cache of the listed controls (excluding image buttons) in tree order. */
  _controlsCache: NodeImpl[];
  _controlsVersion: number;
  _controlsDoc: Document | null;
  /** https://html.spec.whatwg.org/#firing-submission-events */
  _firingSubmissionEvents: boolean;
  /** https://html.spec.whatwg.org/#locked-for-reset */
  _lockedForReset: boolean;
  /** https://html.spec.whatwg.org/#constructing-entry-list */
  _constructingEntryList: boolean;
  /** Bumped when the form is disconnected: parser associations made before end (form-associated.ts). */
  _assocGen: number;
  /** https://html.spec.whatwg.org/#past-names-map */
  _pastNames: Map<string, NodeImpl> | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this._elements = null;
    this._controlsCache = [];
    this._controlsVersion = -1;
    this._controlsDoc = null;
    this._firingSubmissionEvents = false;
    this._lockedForReset = false;
    this._constructingEntryList = false;
    this._pastNames = null;
    this._assocGen = 0;
    const proxy = new Proxy(this, formHandler);
    this._impl.node = proxy;
    // biome-ignore lint: returning the proxy from the constructor is the point
    return proxy;
  }

  /** "When a form element is removed, reset the form owner" of elements it no longer shares a tree with. */
  override _disconnectedSteps(): void {
    super._disconnectedSteps();
    this._assocGen++;
  }

  /** https://html.spec.whatwg.org/#dom-form-nameditem — element, RadioNodeList, or undefined. */
  _namedProperty(name: string): unknown {
    const form = this._impl;
    const candidates: NodeImpl[] = [];
    const controls = this._controls();
    for (let i = 0; i < controls.length; i++) {
      const c = controls[i];
      if (c.id === name || contentAttr(c, "name") === name) candidates.push(c);
    }
    if (candidates.length === 0) {
      // img elements whose form owner is this form.
      const root = treeRoot(form);
      for (let n = nextElementInTree(root, root); n !== null; n = nextElementInTree(n, root)) {
        if (n.tag === T.img && (n.id === name || contentAttr(n, "name") === name) && formOwner(n) === form) candidates.push(n);
      }
    }
    if (candidates.length === 0) {
      const past = this._pastNames?.get(name);
      if (past === undefined) return undefined;
      // Entries for elements that left the form are dropped.
      if (formOwner(past) !== form) {
        this._pastNames!.delete(name);
        return undefined;
      }
      return past.node;
    }
    if (candidates.length > 1) return new RadioNodeList(form, name);
    (this._pastNames ??= new Map()).set(name, candidates[0]);
    return candidates[0].node;
  }

  /** @internal Listed controls whose form owner is this form (image buttons excluded), tree order. */
  _controls(): NodeImpl[] {
    const doc = this._impl.doc;
    if (this._controlsVersion === doc._version && this._controlsDoc === doc) return this._controlsCache;
    const list = formControls(this._impl, [], false);
    this._controlsCache = list;
    this._controlsVersion = doc._version;
    this._controlsDoc = doc;
    return list;
  }

  /** https://html.spec.whatwg.org/#dom-form-elements */
  get elements(): HTMLFormControlsCollection {
    return (this._elements ??= createFormControlsCollection(this._impl));
  }

  /** https://html.spec.whatwg.org/#dom-form-length */
  get length(): number {
    return this._controls().length;
  }

  /** https://html.spec.whatwg.org/#dom-fs-action */
  get action(): string {
    return reflectActionURL(this._impl, "action");
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
    submitForm(this._impl, this._impl, true);
  }

  /** https://html.spec.whatwg.org/#dom-form-requestsubmit */
  requestSubmit(submitter: Element | null = null): void {
    let s: NodeImpl = this._impl;
    if (submitter !== null && submitter !== undefined) {
      const impl = (submitter as { _impl?: NodeImpl })._impl;
      if (impl === undefined || !isSubmitButton(impl)) {
        throw new TypeError("Failed to execute 'requestSubmit' on 'HTMLFormElement': The specified element is not a submit button.");
      }
      if ((submitter as unknown as { form: Element | null }).form !== this) {
        throw new DOMException("Failed to execute 'requestSubmit' on 'HTMLFormElement': The specified element is not owned by this form element.", "NotFoundError");
      }
      s = impl;
    }
    submitForm(this._impl, s, false);
  }

  /** https://html.spec.whatwg.org/#dom-form-reset */
  reset(): void {
    resetForm(this._impl);
  }

  /** https://html.spec.whatwg.org/#dom-form-checkvalidity */
  checkValidity(): boolean {
    return formCheckValidity(this._impl);
  }

  /** https://html.spec.whatwg.org/#dom-form-reportvalidity */
  reportValidity(): boolean {
    return formCheckValidity(this._impl);
  }
}

str(HTMLFormElement, "acceptCharset=accept-charset name rel target");
bool(HTMLFormElement, "noValidate=novalidate");
enumerated(HTMLFormElement, "enctype", ENCTYPE);
enumerated(HTMLFormElement, "method", METHOD);
enumerated(HTMLFormElement, "autocomplete", AUTOCOMPLETE);
tokenList(HTMLFormElement, "relList", "rel", ["noopener", "noreferrer", "opener"]);

function arrayIndex(key: string): number {
  const c = key.charCodeAt(0);
  if (c < 48 || c > 57) return -1;
  const n = Number(key);
  return Number.isInteger(n) && String(n) === key ? n : -1;
}

/** Named and indexed property access for form elements (WebIDL legacy platform object, no override of built-ins). */
const formHandler: ProxyHandler<HTMLFormElement> = {
  get(target, key, receiver) {
    if (typeof key === "string" && !(key in target)) {
      const i = arrayIndex(key);
      if (i !== -1) return target._controls()[i]?.node;
      return target._namedProperty(key);
    }
    return Reflect.get(target, key, receiver);
  },
  has(target, key) {
    if (typeof key === "string" && !(key in target)) {
      const i = arrayIndex(key);
      if (i !== -1) return i < target._controls().length;
      return target._namedProperty(key) !== undefined;
    }
    return Reflect.has(target, key);
  },
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === "string" && !Object.hasOwn(target, key) && !(key in target)) {
      const i = arrayIndex(key);
      const value = i !== -1 ? target._controls()[i]?.node : target._namedProperty(key);
      if (value !== undefined) return { value, writable: false, enumerable: i !== -1, configurable: true };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
};

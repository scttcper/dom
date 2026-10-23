// https://html.spec.whatwg.org/#htmlelement
// https://html.spec.whatwg.org/#htmlorsvgelement (installed on HTMLElement, SVGElement, MathMLElement)
// https://html.spec.whatwg.org/#elementcssinlinestyle
// https://drafts.csswg.org/cssom-view/#extensions-to-the-htmlelement-interface
//
// Hooks: subclasses that override `_connectedSteps`, `_disconnectedSteps` or
// `_attributeChangedSteps` must call `super.<hook>(...)` — HTMLElement uses them for custom
// elements, popovers and the top layer. Set the matching F_*_HOOK flag in the constructor.

import { installEventHandlers } from "../events/handlers.ts";
import { Element } from "../nodes/Element.ts";
import type { Document } from "../nodes/Document.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { removeAttribute, setAttribute } from "../nodes/attributes.ts";
import { F_ATTR_HOOK, F_CONNECT_HOOK, F_CONNECTED, F_CUSTOM, F_FACE, HTML_NS } from "../nodes/constants.ts";
import {
  faceStateMaybeChanged,
  internalsCheckValidity,
  internalsForm,
  internalsLabels,
  internalsSetFormValue,
  internalsSetValidity,
  internalsValidationMessage,
  internalsValidity,
  internalsWillValidate,
} from "./forms/face.ts";
import type { ValidityState } from "./forms/validation.ts";
import { T } from "../nodes/tags.ts";
import { CSSStyleDeclaration } from "../css/CSSStyleDeclaration.ts";
import { bool, contentAttr, defineAccessor, enumerated, str } from "./reflect.ts";
import {
  ceAttributeChanged,
  ceConnected,
  ceDisconnected,
  definitionOf,
  htmlElementConstructorSteps,
  initNewCustomElement,
  isValueOf,
} from "./custom-elements.ts";
import { activeElement, blurElement, defaultTabIndex, focusElement, tabIndexValue, documentHasFocus } from "./focus.ts";
import { isEditable } from "./shared.ts";
import { getInnerText, renderedTextFragment } from "./innerText.ts";
import { fireSyntheticClick } from "./events.ts";
import { clearParserAssociation, isActuallyDisabled, parserAssociateForm } from "./forms/form-associated.ts";
import { hidePopover, isInTopLayer, isPopoverShowing, popoverAttributeChanged, showPopover, topLayerRemovingSteps } from "./top-layer.ts";
import { ShadowRoot } from "../nodes/ShadowRoot.ts";
import { Document as DocumentClass } from "../nodes/Document.ts";

/** https://html.spec.whatwg.org/#click-in-progress-flag */
const clickInProgress = new WeakSet<Element>();

export class HTMLElement extends Element {
  /**
   * Internal construction: `(doc, localName, ns, prefix)` from the element factory.
   * User construction (`new MyElement()` for a defined custom element) passes no arguments:
   * https://html.spec.whatwg.org/#html-element-constructors
   */
  constructor(doc?: Document, localName?: string, ns?: string | null, prefix?: string | null) {
    if (doc !== undefined) {
      super(doc, localName!, ns!, prefix!);
      // Custom element candidates need connected hooks to upgrade on insertion.
      if ((this._impl.flags & F_CUSTOM) !== 0) this._impl.flags |= F_CONNECT_HOOK;
      return;
    }
    const r = htmlElementConstructorSteps(new.target);
    if (r.upgrade !== null) return r.upgrade as this;
    super(r.doc, r.localName, HTML_NS, null);
    initNewCustomElement(this, r.def);
  }

  // --- hooks ------------------------------------------------------------------------------

  override _connectedSteps(): void {
    const impl = this._impl;
    if ((impl.flags & F_CUSTOM) !== 0 || isValueOf(this) !== null) ceConnected(this);
    if ((impl.flags & F_FACE) !== 0) faceStateMaybeChanged(impl);
  }

  override _disconnectedSteps(): void {
    const impl = this._impl;
    if (isPopoverShowing(impl) || isInTopLayer(impl)) topLayerRemovingSteps(impl);
    if (definitionOf(this) !== undefined) ceDisconnected(this);
    // The ancestor chain changed: a parser-made form association ends (html/forms).
    clearParserAssociation(impl);
    if ((impl.flags & F_FACE) !== 0) faceStateMaybeChanged(impl);
  }

  /**
   * Parser hook: the form element pointer associates this form-associated element
   * (https://html.spec.whatwg.org/#create-an-element-for-the-token). Implemented in html/forms.
   */
  _parserAssociateForm(form: Element): void {
    parserAssociateForm(this._impl, form._impl);
  }

  override _attributeChangedSteps(localName: string, oldValue: string | null, value: string | null, namespace: string | null): void {
    if (localName === "popover" && namespace === null) popoverAttributeChanged(this._impl, oldValue, value);
    if (definitionOf(this) !== undefined) ceAttributeChanged(this, localName, oldValue, value, namespace);
    if ((this._impl.flags & F_FACE) !== 0 && namespace === null && (localName === "form" || localName === "disabled")) faceStateMaybeChanged(this._impl);
  }

  // --- ElementCSSInlineStyle ------------------------------------------------------------

  get style(): CSSStyleDeclaration {
    return (this._style ??= new CSSStyleDeclaration(this));
  }

  set style(value: string) {
    this.style.cssText = String(value);
  }

  // --- metadata attributes ---------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-translate */
  get translate(): boolean {
    for (let n: NodeImpl | null = this._impl; n !== null && n.type === 1; n = n.parent) {
      const v = contentAttr(n, "translate");
      if (v === null) continue;
      const k = v.toLowerCase();
      if (k === "" || k === "yes") return true;
      if (k === "no") return false;
    }
    return true;
  }

  set translate(value: boolean) {
    setAttribute(this._impl, "translate", value ? "yes" : "no");
  }

  /** https://html.spec.whatwg.org/#dom-hidden */
  get hidden(): boolean | string {
    const v = contentAttr(this._impl, "hidden");
    if (v === null) return false;
    return v.toLowerCase() === "until-found" ? "until-found" : true;
  }

  set hidden(value: boolean | string | number | null) {
    if (typeof value === "string" && value.toLowerCase() === "until-found") setAttribute(this._impl, "hidden", "until-found");
    else if (value === false || value === "" || value === null || value === undefined || value === 0 || Number.isNaN(value)) removeAttribute(this._impl, "hidden");
    else setAttribute(this._impl, "hidden", "");
  }

  /** https://html.spec.whatwg.org/#dom-accesskeylabel — no key mapping here. */
  get accessKeyLabel(): string {
    return "";
  }

  /** https://html.spec.whatwg.org/#dom-draggable */
  get draggable(): boolean {
    const v = contentAttr(this._impl, "draggable");
    if (v !== null) {
      const k = v.toLowerCase();
      if (k === "true") return true;
      if (k === "false") return false;
    }
    const impl = this._impl;
    return impl.tag === T.img || (impl.tag === T.a && contentAttr(impl, "href") !== null);
  }

  set draggable(value: boolean) {
    setAttribute(this._impl, "draggable", value ? "true" : "false");
  }

  /** https://html.spec.whatwg.org/#dom-spellcheck */
  get spellcheck(): boolean {
    for (let n: NodeImpl | null = this._impl; n !== null && n.type === 1; n = n.parent) {
      const v = contentAttr(n, "spellcheck");
      if (v === null) continue;
      const k = v.toLowerCase();
      if (k === "" || k === "true") return true;
      if (k === "false") return false;
    }
    return true;
  }

  set spellcheck(value: boolean) {
    setAttribute(this._impl, "spellcheck", value ? "true" : "false");
  }

  /** https://html.spec.whatwg.org/#dom-autocorrect */
  get autocorrect(): boolean {
    const v = contentAttr(this._impl, "autocorrect");
    return v === null || v.toLowerCase() !== "off";
  }

  set autocorrect(value: boolean) {
    setAttribute(this._impl, "autocorrect", value ? "on" : "off");
  }

  // --- editing ---------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-contenteditable */
  get contentEditable(): string {
    const v = contentAttr(this._impl, "contenteditable");
    if (v === null) return "inherit";
    const k = v.toLowerCase();
    if (k === "" || k === "true") return "true";
    if (k === "false") return "false";
    if (k === "plaintext-only") return "plaintext-only";
    return "inherit";
  }

  set contentEditable(value: string) {
    const k = String(value).toLowerCase();
    if (k === "inherit") removeAttribute(this._impl, "contenteditable");
    else if (k === "true" || k === "false" || k === "plaintext-only") setAttribute(this._impl, "contenteditable", k);
    else throw new DOMException(`Failed to set the 'contentEditable' property on 'HTMLElement': The value provided ('${value}') is not one of 'true', 'false', 'plaintext-only', or 'inherit'.`, "SyntaxError");
  }

  /** https://html.spec.whatwg.org/#dom-iscontenteditable */
  get isContentEditable(): boolean {
    return (this._impl.flags & F_CONNECTED) !== 0 && isEditable(this._impl);
  }

  // --- innerText / outerText -------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-innertext */
  get innerText(): string {
    return getInnerText(this._impl);
  }

  set innerText(value: string) {
    const v = value === null ? "" : String(value);
    this._replaceAll(v === "" ? null : renderedTextFragment(v, this._impl));
  }

  /** https://html.spec.whatwg.org/#dom-outertext */
  get outerText(): string {
    return getInnerText(this._impl);
  }

  set outerText(value: string) {
    const parent = this.parentNode;
    if (parent === null) throw new DOMException("The element has no parent.", "NoModificationAllowedError");
    const prev = this.previousSibling;
    const next = this.nextSibling;
    const v = value === null ? "" : String(value);
    const fragment = renderedTextFragment(v, this._impl);
    if (!fragment.hasChildNodes()) fragment.appendChild(this._impl.doc.createTextNode(""));
    parent.replaceChild(fragment, this);
    // Merge adjacent text nodes at the edges (https://html.spec.whatwg.org/#merge-with-the-next-text-node).
    if (next !== null && next.nodeType === 3) mergeWithPrevious(next);
    if (prev !== null && prev.nodeType === 3 && prev.nextSibling !== null) mergeWithPrevious(prev.nextSibling);
  }

  // --- user interaction ------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-click */
  click(): void {
    if (isActuallyDisabled(this._impl)) return;
    if (clickInProgress.has(this)) return;
    clickInProgress.add(this);
    try {
      fireSyntheticClick(this);
    } finally {
      clickInProgress.delete(this);
    }
  }

  // --- popover ---------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-showpopover */
  showPopover(options?: { source?: HTMLElement }): void {
    showPopover(this._impl, true, options?.source?._impl ?? null);
    this._impl.flags |= F_CONNECT_HOOK | F_ATTR_HOOK;
  }

  /** https://html.spec.whatwg.org/#dom-hidepopover */
  hidePopover(): void {
    hidePopover(this._impl, true, true, true, null);
  }

  /** https://html.spec.whatwg.org/#dom-togglepopover */
  togglePopover(options?: boolean | { force?: boolean; source?: HTMLElement }): boolean {
    let force: boolean | undefined;
    let source: HTMLElement | null = null;
    if (typeof options === "boolean") force = options;
    else if (options !== undefined && options !== null) {
      force = options.force;
      source = options.source ?? null;
    }
    const impl = this._impl;
    const showingNow = isPopoverShowing(impl);
    if (showingNow && force !== true) hidePopover(impl, true, true, true, null);
    else if (!showingNow && force !== false) {
      showPopover(impl, true, source?._impl ?? null);
      impl.flags |= F_CONNECT_HOOK | F_ATTR_HOOK;
    } else {
      // Validity is still checked (throws NotSupportedError without a popover attribute).
      if (contentAttr(impl, "popover") === null) {
        throw new DOMException("Not supported on elements that do not have a valid value for the 'popover' attribute.", "NotSupportedError");
      }
    }
    return isPopoverShowing(impl);
  }

  // --- custom elements -------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-attachinternals */
  attachInternals(): ElementInternals {
    if (isValueOf(this) !== null) throw new DOMException("Unable to attach ElementInternals to a customized built-in element.", "NotSupportedError");
    const def = definitionOf(this);
    if (def === undefined) throw new DOMException("Unable to attach ElementInternals to non-custom elements.", "NotSupportedError");
    if (def.disableInternals) throw new DOMException("ElementInternals is disabled by disabledFeature static field.", "NotSupportedError");
    if (attachedInternals.has(this)) throw new DOMException("ElementInternals for the specified element was already attached.", "NotSupportedError");
    const internals = new ElementInternals(this);
    attachedInternals.set(this, internals);
    return internals;
  }

  // --- CSSOM View (no layout) -------------------------------------------------------------

  get offsetParent(): Element | null {
    return null;
  }
  get offsetTop(): number {
    return 0;
  }
  get offsetLeft(): number {
    return 0;
  }
  get offsetWidth(): number {
    return 0;
  }
  get offsetHeight(): number {
    return 0;
  }
}

function mergeWithPrevious(text: { previousSibling: { nodeType: number; data?: string } | null; data?: string; remove?: () => void }): void {
  const prev = text.previousSibling;
  if (prev === null || prev.nodeType !== 3) return;
  (prev as { data: string }).data += text.data!;
  (text as unknown as { remove(): void }).remove();
}

// Reflected global attributes — https://html.spec.whatwg.org/#global-attributes
str(HTMLElement, "title lang accessKey=accesskey");
bool(HTMLElement, "inert");
enumerated(HTMLElement, "dir", { keywords: ["ltr", "rtl", "auto"] });
enumerated(HTMLElement, "autocapitalize", { keywords: ["off:none", "none", "on:sentences", "sentences", "words", "characters"], missing: "", invalid: "sentences", empty: "" });
enumerated(HTMLElement, "enterKeyHint=enterkeyhint", { keywords: ["enter", "done", "go", "next", "previous", "search", "send"] });
enumerated(HTMLElement, "inputMode=inputmode", { keywords: ["none", "text", "tel", "url", "email", "numeric", "decimal", "search"] });
enumerated(HTMLElement, "popover", { keywords: ["auto", "manual", "hint"], missing: null, invalid: "manual", empty: "auto" });
enumerated(HTMLElement, "writingSuggestions=writingsuggestions", { keywords: ["true", "false"], missing: "true", invalid: "true", empty: "true" });

// --- ElementInternals (minimal) -------------------------------------------------------------

const attachedInternals = new WeakMap<Element, ElementInternals>();

/**
 * https://html.spec.whatwg.org/#elementinternals — ARIA reflection, custom states, the shadow
 * root, and form association (delegated to html/forms/face.ts).
 */
export class ElementInternals {
  _target: HTMLElement;
  _states: Set<string> | null;
  _value: unknown;

  constructor(target: HTMLElement) {
    if (!(target instanceof HTMLElement) || attachedInternals.has(target)) throw new TypeError("Illegal constructor");
    this._target = target;
    this._states = null;
    this._value = null;
  }

  get shadowRoot(): ShadowRoot | null {
    return (this._target as unknown as { _shadowRoot: ShadowRoot | null })._shadowRoot;
  }

  get states(): Set<string> {
    return (this._states ??= new CustomStateSet());
  }

  get form(): Element | null {
    return internalsForm(this._target._impl);
  }

  get labels(): unknown {
    return internalsLabels(this._target._impl);
  }

  get willValidate(): boolean {
    return internalsWillValidate(this._target._impl);
  }

  get validity(): ValidityState {
    return internalsValidity(this._target._impl);
  }

  get validationMessage(): string {
    return internalsValidationMessage(this._target._impl);
  }

  setFormValue(value: unknown, state?: unknown): void {
    internalsSetFormValue(this._target._impl, value, state);
    this._value = value;
  }

  setValidity(flags?: Record<string, unknown>, message?: string, anchor?: Element): void {
    internalsSetValidity(this._target._impl, flags, message, anchor);
  }

  checkValidity(): boolean {
    return internalsCheckValidity(this._target._impl);
  }

  reportValidity(): boolean {
    return internalsCheckValidity(this._target._impl, "reportValidity");
  }
}

// ARIA reflection on ElementInternals (https://w3c.github.io/aria/#ARIAMixin).
for (const name of [
  "role",
  "ariaAtomic",
  "ariaAutoComplete",
  "ariaBusy",
  "ariaChecked",
  "ariaColCount",
  "ariaColIndex",
  "ariaColSpan",
  "ariaCurrent",
  "ariaDescription",
  "ariaDisabled",
  "ariaExpanded",
  "ariaHasPopup",
  "ariaHidden",
  "ariaInvalid",
  "ariaKeyShortcuts",
  "ariaLabel",
  "ariaLevel",
  "ariaLive",
  "ariaModal",
  "ariaMultiLine",
  "ariaMultiSelectable",
  "ariaOrientation",
  "ariaPlaceholder",
  "ariaPosInSet",
  "ariaPressed",
  "ariaReadOnly",
  "ariaRequired",
  "ariaRoleDescription",
  "ariaRowCount",
  "ariaRowIndex",
  "ariaRowSpan",
  "ariaSelected",
  "ariaSetSize",
  "ariaSort",
  "ariaValueMax",
  "ariaValueMin",
  "ariaValueNow",
  "ariaValueText",
]) {
  const key = "_" + name;
  Object.defineProperty(ElementInternals.prototype, name, {
    get(this: Record<string, unknown>) {
      return (this[key] as string | undefined) ?? null;
    },
    set(this: Record<string, unknown>, v: unknown) {
      this[key] = v === null ? null : String(v);
    },
    configurable: true,
    enumerable: true,
  });
}

/** https://html.spec.whatwg.org/#customstateset */
export class CustomStateSet extends Set<string> {}

// --- HTMLOrSVGElement mixin -----------------------------------------------------------------

type ElementCtor = { prototype: object };

const NONCE = Symbol("nonce");

/** Installs nonce, autofocus, tabIndex, focus() and blur() (https://html.spec.whatwg.org/#htmlorsvgelement). */
export function installHTMLOrSVGElement(C: ElementCtor): void {
  installEventHandlers(C.prototype, "element"); // GlobalEventHandlers (events/handlers.ts)
  // https://html.spec.whatwg.org/#dom-noncedelement-nonce — an internal slot, not reflection:
  // setting the IDL attribute does not touch the content attribute, while content attribute
  // changes update the slot (approximated by remembering the attribute value at set time).
  defineAccessor(
    C,
    "nonce",
    function () {
      const slot = (this as unknown as Record<symbol, [string, string | null] | undefined>)[NONCE];
      const current = contentAttr(this._impl, "nonce");
      if (slot !== undefined && slot[1] === current) return slot[0];
      return current ?? "";
    },
    function (v) {
      Object.defineProperty(this, NONCE, { value: [String(v), contentAttr(this._impl, "nonce")], writable: true, configurable: true });
    },
  );
  bool(C, "autofocus");
  defineAccessor(
    C,
    "tabIndex",
    function () {
      const v = tabIndexValue(this._impl);
      return Number.isNaN(v) ? defaultTabIndex(this._impl) : v;
    },
    function (v) {
      setAttribute(this._impl, "tabindex", String(Number(v) | 0));
    },
  );
  Object.defineProperty(C.prototype, "focus", {
    /** https://html.spec.whatwg.org/#dom-focus */
    value: function focus(this: Element, options?: { preventScroll?: boolean; focusVisible?: boolean }): void {
      focusElement(this._impl, options);
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(C.prototype, "blur", {
    /** https://html.spec.whatwg.org/#dom-blur */
    value: function blur(this: Element): void {
      blurElement(this._impl);
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

installHTMLOrSVGElement(HTMLElement);

// --- DocumentOrShadowRoot / Document focus API ---------------------------------------------
// https://html.spec.whatwg.org/#dom-documentorshadowroot-activeelement
// https://html.spec.whatwg.org/#dom-document-hasfocus
// Installed here (rather than in nodes/Document.ts) because focus is owned by src/html.

for (const C of [DocumentClass, ShadowRoot]) {
  if (!Object.hasOwn(C.prototype, "activeElement")) {
    defineAccessor(C, "activeElement", function () {
      return activeElement(this._impl);
    });
  }
}
if (!Object.hasOwn(DocumentClass.prototype, "hasFocus")) {
  Object.defineProperty(DocumentClass.prototype, "hasFocus", {
    value: function hasFocus(this: Document): boolean {
      return documentHasFocus(this);
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

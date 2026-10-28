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
import { asciiLowercase, removeAttribute, setAttribute } from "../nodes/attributes.ts";
import { F_ATTR_HOOK, F_CONNECT_HOOK, F_CONTENTEDITABLE_ATTR, F_CUSTOM, F_FACE, HTML_NS } from "../nodes/constants.ts";
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
import { deferCompatMember } from "../window/compat.ts";
import {
  ceAdopted,
  ceAttributeChanged,
  ceConnected,
  ceDisconnected,
  ceMoved,
  definitionOf,
  htmlElementConstructorSteps,
  initNewCustomElement,
  isValueOf,
  shadowDisabled,
} from "./custom-elements.ts";
import { activeElement, blurElement, defaultTabIndex, focusElement, tabIndexValue, documentHasFocus } from "./focus.ts";
import { isEditable } from "./shared.ts";
import { getInnerText, renderedTextFragment } from "./innerText.ts";
import { ARIA_STRING_ATTRIBUTES } from "./aria-reflection.ts";
import { fireSyntheticClick } from "./events.ts";
import { clearParserAssociation, formOwner, isActuallyDisabled, parserAssociateForm } from "./forms/form-associated.ts";
import { I_EMAIL, I_PASSWORD, I_URL, inputType } from "./forms/input-type.ts";
import {
  checkPopoverValidity,
  hidePopover,
  isInTopLayer,
  isPopoverShowing,
  popoverAttributeChanged,
  showPopover,
  topLayerRemovingSteps,
} from "./top-layer.ts";
import { ShadowRoot } from "../nodes/ShadowRoot.ts";
import { Document as DocumentClass } from "../nodes/Document.ts";
import { $availableToElementInternals, $impl, $shadowRoot, $states, $style, $target, $value } from "../keys.ts";

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
      if ((this[$impl].flags & F_CUSTOM) !== 0) this[$impl].flags |= F_CONNECT_HOOK;
      return;
    }
    const r = htmlElementConstructorSteps(new.target);
    if (r.upgrade !== null) return r.upgrade as this;
    super(r.doc, r.localName, HTML_NS, null);
    initNewCustomElement(this, r.def, r.active);
  }

  // --- hooks ------------------------------------------------------------------------------

  override _connectedSteps(): void {
    const impl = this[$impl];
    if ((impl.flags & F_CUSTOM) !== 0 || isValueOf(this) !== null) ceConnected(this);
    if ((impl.flags & F_FACE) !== 0) faceStateMaybeChanged(impl);
  }

  override _disconnectedSteps(): void {
    const impl = this[$impl];
    if (isPopoverShowing(impl) || isInTopLayer(impl)) topLayerRemovingSteps(impl);
    if (definitionOf(this) !== undefined) ceDisconnected(this);
    // The ancestor chain changed: a parser-made form association ends (html/forms).
    clearParserAssociation(impl);
    if ((impl.flags & F_FACE) !== 0) faceStateMaybeChanged(impl);
  }

  /** https://dom.spec.whatwg.org/#concept-node-adopt step 3.2.1 (F_ADOPT_HOOK, set for custom elements with adoptedCallback). */
  override _adoptingSteps(oldDocument: Document): void {
    ceAdopted(this, oldDocument, this[$impl].doc);
  }

  /** https://dom.spec.whatwg.org/#move step 24 (moveBefore): custom element connectedMoveCallback. */
  override _movingSteps(_isSubtreeRoot: boolean, _oldParent: NodeImpl): void {
    if (definitionOf(this) !== undefined) ceMoved(this);
  }

  /** attachShadow step 3 hook (nodes/Element.ts): the custom element definition disables shadow roots. */
  _shadowDisabled(): boolean {
    return shadowDisabled(this);
  }

  /**
   * Parser hook: the form element pointer associates this form-associated element
   * (https://html.spec.whatwg.org/#create-an-element-for-the-token). Implemented in html/forms.
   */
  _parserAssociateForm(form: Element): void {
    parserAssociateForm(this[$impl], form[$impl]);
  }

  override _attributeChangedSteps(
    localName: string,
    oldValue: string | null,
    value: string | null,
    namespace: string | null,
  ): void {
    if (localName === "popover" && namespace === null) popoverAttributeChanged(this[$impl], oldValue, value);
    if (definitionOf(this) !== undefined) ceAttributeChanged(this, localName, oldValue, value, namespace);
    if ((this[$impl].flags & F_FACE) !== 0 && namespace === null && (localName === "form" || localName === "disabled"))
      faceStateMaybeChanged(this[$impl]);
  }

  // --- ElementCSSInlineStyle ------------------------------------------------------------

  get style(): CSSStyleDeclaration {
    return (this[$style] ??= new CSSStyleDeclaration(this));
  }

  set style(value: string) {
    this.style.cssText = String(value);
  }

  // --- metadata attributes ---------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-translate */
  get translate(): boolean {
    for (let n: NodeImpl | null = this[$impl]; n !== null && n.type === 1; n = n.parent) {
      const v = contentAttr(n, "translate");
      if (v === null) continue;
      const k = asciiLowercase(v);
      if (k === "" || k === "yes") return true;
      if (k === "no") return false;
    }
    return true;
  }

  set translate(value: boolean) {
    setAttribute(this[$impl], "translate", value ? "yes" : "no");
  }

  /**
   * https://html.spec.whatwg.org/#dom-hidden — returns true for `hidden="until-found"` too, like
   * jsdom and happy-dom, where the spec returns "until-found" (React Aria's disclosure tests
   * assert `panel.hidden === true`; docs/deviations.md). The setter follows the spec.
   */
  get hidden(): boolean | string {
    return contentAttr(this[$impl], "hidden") !== null;
  }

  set hidden(value: boolean | string | number | null) {
    if (typeof value === "string" && asciiLowercase(value) === "until-found")
      setAttribute(this[$impl], "hidden", "until-found");
    else if (
      value === false ||
      value === "" ||
      value === null ||
      value === undefined ||
      value === 0 ||
      Number.isNaN(value)
    )
      removeAttribute(this[$impl], "hidden");
    else setAttribute(this[$impl], "hidden", "");
  }

  /**
   * https://html.spec.whatwg.org/#dom-accesskeylabel — the assigned access key
   * (https://html.spec.whatwg.org/#assigned-access-key) as Firefox labels it on Linux/Windows
   * ("Alt+Shift+B"). Like Chromium and WebKit (and WPT access-key-label.html), only a value that
   * is exactly one code point (after trimming ASCII whitespace) is assigned; the spec would
   * also pick the first one-code-point token of a list such as "s 0".
   */
  get accessKeyLabel(): string {
    const v = contentAttr(this[$impl], "accesskey");
    if (v === null) return "";
    const key = v.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
    if (key === "" || key.length > 2 || (key.length === 2 && key.codePointAt(0)! <= 0xffff)) return "";
    return "Alt+Shift+" + key.toUpperCase();
  }

  /** https://html.spec.whatwg.org/#dom-draggable */
  get draggable(): boolean {
    const v = contentAttr(this[$impl], "draggable");
    if (v !== null) {
      const k = asciiLowercase(v);
      if (k === "true") return true;
      if (k === "false") return false;
    }
    const impl = this[$impl];
    return impl.tag === T.img || (impl.tag === T.a && contentAttr(impl, "href") !== null);
  }

  set draggable(value: boolean) {
    setAttribute(this[$impl], "draggable", value ? "true" : "false");
  }

  /** https://html.spec.whatwg.org/#dom-spellcheck */
  get spellcheck(): boolean {
    for (let n: NodeImpl | null = this[$impl]; n !== null && n.type === 1; n = n.parent) {
      const v = contentAttr(n, "spellcheck");
      if (v === null) continue;
      const k = asciiLowercase(v);
      if (k === "" || k === "true") return true;
      if (k === "false") return false;
    }
    return true;
  }

  set spellcheck(value: boolean) {
    setAttribute(this[$impl], "spellcheck", value ? "true" : "false");
  }

  /** https://html.spec.whatwg.org/#dom-autocorrect — true iff the used autocorrection state is on. */
  get autocorrect(): boolean {
    return usedAutocorrection(this[$impl]);
  }

  set autocorrect(value: boolean) {
    setAttribute(this[$impl], "autocorrect", value ? "on" : "off");
  }

  // --- editing ---------------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-contenteditable */
  get contentEditable(): string {
    const impl = this[$impl];
    if ((impl.flags & F_CONTENTEDITABLE_ATTR) === 0) return "inherit";
    const v = contentAttr(impl, "contenteditable");
    if (v === null) return "inherit";
    const k = asciiLowercase(v);
    if (k === "" || k === "true") return "true";
    if (k === "false") return "false";
    if (k === "plaintext-only") return "plaintext-only";
    return "inherit";
  }

  set contentEditable(value: string) {
    const k = asciiLowercase(String(value));
    if (k === "inherit") removeAttribute(this[$impl], "contenteditable");
    else if (k === "true" || k === "false" || k === "plaintext-only") setAttribute(this[$impl], "contenteditable", k);
    else
      throw new DOMException(
        `Failed to set the 'contentEditable' property on 'HTMLElement': The value provided ('${value}') is not one of 'true', 'false', 'plaintext-only', or 'inherit'.`,
        "SyntaxError",
      );
  }

  /**
   * https://html.spec.whatwg.org/#dom-iscontenteditable — editing host or editable. Not tied to
   * being connected: browsers (and WPT user-interaction-editing-contenteditable.html) report
   * `true` for a detached `<div contenteditable>`.
   */
  get isContentEditable(): boolean {
    return isEditable(this[$impl]);
  }

  // --- innerText / outerText -------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-innertext */
  get innerText(): string {
    return getInnerText(this[$impl]);
  }

  set innerText(value: string) {
    const v = value === null ? "" : String(value);
    this._replaceAll(v === "" ? null : renderedTextFragment(v, this[$impl]));
  }

  /** https://html.spec.whatwg.org/#dom-outertext */
  get outerText(): string {
    return getInnerText(this[$impl]);
  }

  set outerText(value: string) {
    const parent = this.parentNode;
    if (parent === null) throw new DOMException("The element has no parent.", "NoModificationAllowedError");
    const prev = this.previousSibling;
    const next = this.nextSibling;
    const v = value === null ? "" : String(value);
    const fragment = renderedTextFragment(v, this[$impl]);
    if (!fragment.hasChildNodes()) fragment.appendChild(this[$impl].doc.createTextNode(""));
    parent.replaceChild(fragment, this);
    // Merge adjacent text nodes at the edges (https://html.spec.whatwg.org/#merge-with-the-next-text-node).
    if (next !== null && next.nodeType === 3) mergeWithPrevious(next);
    if (prev !== null && prev.nodeType === 3 && prev.nextSibling !== null) mergeWithPrevious(prev.nextSibling);
  }

  // --- user interaction ------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-click */
  click(): void {
    if (isActuallyDisabled(this[$impl])) return;
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
    const impl = this[$impl];
    impl.flags |= F_CONNECT_HOOK | F_ATTR_HOOK;
    showPopover(impl, true, popoverSource(options));
  }

  /** https://html.spec.whatwg.org/#dom-hidepopover */
  hidePopover(): void {
    hidePopover(this[$impl], true, true, true, null);
  }

  /** https://html.spec.whatwg.org/#dom-togglepopover */
  togglePopover(options?: boolean | { force?: boolean; source?: HTMLElement }): boolean {
    // 1-4.
    let force: boolean | null = null;
    let source: NodeImpl | null = null;
    if (typeof options === "boolean") force = options;
    else if (options !== undefined && options !== null && typeof options === "object") {
      if (options.force !== undefined) force = Boolean(options.force);
      source = popoverSource(options);
    } else if (options !== undefined && options !== null) force = Boolean(options);
    const impl = this[$impl];
    impl.flags |= F_CONNECT_HOOK | F_ATTR_HOOK;
    const showingNow = isPopoverShowing(impl);
    // 5-7.
    if (showingNow && force !== true) hidePopover(impl, true, true, true, null);
    else if (force === null || force) showPopover(impl, true, source);
    else checkPopoverValidity(impl, showingNow, null);
    // 8.
    return isPopoverShowing(impl);
  }

  // --- custom elements -------------------------------------------------------------------

  /** https://html.spec.whatwg.org/#dom-attachinternals */
  attachInternals(): ElementInternals {
    if (isValueOf(this) !== null)
      throw new DOMException(
        "Unable to attach ElementInternals to a customized built-in element.",
        "NotSupportedError",
      );
    const def = definitionOf(this);
    if (def === undefined)
      throw new DOMException("Unable to attach ElementInternals to non-custom elements.", "NotSupportedError");
    if (def.disableInternals)
      throw new DOMException("ElementInternals is disabled by disabledFeature static field.", "NotSupportedError");
    if (attachedInternals.has(this))
      throw new DOMException("ElementInternals for the specified element was already attached.", "NotSupportedError");
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

/** https://html.spec.whatwg.org/#autocapitalize-and-autocorrect-inheriting-elements */
function inheritsAutocapitalizeAndAutocorrect(impl: NodeImpl): boolean {
  if (impl.ns !== HTML_NS) return false;
  const t = impl.tag;
  return t === T.button || t === T.fieldset || t === T.input || t === T.output || t === T.select || t === T.textarea;
}

/** State of the autocapitalize content attribute ("" = default; invalid value default: sentences). */
function autocapitalizeState(impl: NodeImpl): string {
  const v = contentAttr(impl, "autocapitalize");
  if (v === null) return "";
  switch (asciiLowercase(v)) {
    case "":
      return "";
    case "off":
    case "none":
      return "none";
    case "on":
    case "sentences":
      return "sentences";
    case "words":
      return "words";
    case "characters":
      return "characters";
  }
  return "sentences";
}

/** https://html.spec.whatwg.org/#own-autocapitalization-hint */
function ownAutocapitalizationHint(impl: NodeImpl): string {
  // 1. The element's own state, unless default.
  const state = autocapitalizeState(impl);
  if (state !== "") return state;
  // 2. An autocapitalize-and-autocorrect inheriting element uses its form owner's hint.
  if (inheritsAutocapitalizeAndAutocorrect(impl)) {
    const form = formOwner(impl);
    if (form !== null) return ownAutocapitalizationHint(form);
  }
  // 3. Default.
  return "";
}

/** State of the autocorrect content attribute: 1 on, 0 off, -1 default (missing). Invalid → on. */
function autocorrectState(impl: NodeImpl): number {
  const v = contentAttr(impl, "autocorrect");
  if (v === null) return -1;
  return asciiLowercase(v) === "off" ? 0 : 1;
}

/** https://html.spec.whatwg.org/#used-autocorrection-state */
function usedAutocorrection(impl: NodeImpl): boolean {
  // 1. Inputs whose type is URL, E-mail or Password never autocorrect.
  if (impl.ns === HTML_NS && impl.tag === T.input) {
    const type = inputType(impl);
    if (type === I_URL || type === I_EMAIL || type === I_PASSWORD) return false;
  }
  // 2. The element's own state, unless default.
  const state = autocorrectState(impl);
  if (state !== -1) return state === 1;
  // 3. An autocapitalize-and-autocorrect inheriting element uses its form owner's state.
  if (inheritsAutocapitalizeAndAutocorrect(impl)) {
    const form = formOwner(impl);
    if (form !== null) return autocorrectState(form) !== 0;
  }
  // 4. On.
  return true;
}

/**
 * https://html.spec.whatwg.org/#computed-writing-suggestions-value — the nearest inclusive
 * ancestor element with a writingsuggestions attribute decides ("false" → false; "true", "" and
 * the invalid value default → true); a missing attribute inherits; true at the top.
 */
function computedWritingSuggestions(impl: NodeImpl): boolean {
  for (let n: NodeImpl | null = impl; n !== null && n.type === 1; n = n.parent) {
    const v = contentAttr(n, "writingsuggestions");
    if (v === null) continue;
    // Present: "false" is the false state; "", "true" and invalid values are the true state.
    return asciiLowercase(v) !== "false";
  }
  return true;
}

function mergeWithPrevious(text: {
  previousSibling: { nodeType: number; data?: string } | null;
  data?: string;
  remove?: () => void;
}): void {
  const prev = text.previousSibling;
  if (prev === null || prev.nodeType !== 3) return;
  (prev as { data: string }).data += text.data!;
  (text as unknown as { remove(): void }).remove();
}

// Reflected global attributes — https://html.spec.whatwg.org/#global-attributes
str(HTMLElement, "title lang accessKey=accesskey");
// https://html.spec.whatwg.org/#dom-inert — only in the "modern" compat profile (window/compat.ts),
// like jsdom otherwise: libraries feature-detect `'inert' in HTMLElement.prototype` (React Aria's
// ariaHideOutside, Radix's hideOthers) and then mark outside content `inert` instead of
// `aria-hidden="true"`, which stock Testing Library's isInaccessible (dom-accessibility-api)
// does not honor — getByRole would find elements behind an open modal or an active drag. The
// `inert` content attribute keeps its effects in every profile (focus/hit testing, html/focus.ts).
bool(HTMLElement, "inert");
deferCompatMember(HTMLElement.prototype, "HTMLElement", "inert");
enumerated(HTMLElement, "dir", { keywords: ["ltr", "rtl", "auto"] });
defineAccessor(
  HTMLElement,
  "autocapitalize",
  /** https://html.spec.whatwg.org/#dom-autocapitalize — the own autocapitalization hint ("" for default). */
  function () {
    return ownAutocapitalizationHint(this[$impl]);
  },
  function (v) {
    setAttribute(this[$impl], "autocapitalize", String(v));
  },
);
defineAccessor(
  HTMLElement,
  "writingSuggestions",
  /** https://html.spec.whatwg.org/#dom-writingsuggestions — "true"/"false" from the computed writing suggestions value. */
  function () {
    return computedWritingSuggestions(this[$impl]) ? "true" : "false";
  },
  function (v) {
    setAttribute(this[$impl], "writingsuggestions", String(v));
  },
);
enumerated(HTMLElement, "enterKeyHint=enterkeyhint", {
  keywords: ["enter", "done", "go", "next", "previous", "search", "send"],
});
enumerated(HTMLElement, "inputMode=inputmode", {
  keywords: ["none", "text", "tel", "url", "email", "numeric", "decimal", "search"],
});
enumerated(HTMLElement, "popover", {
  keywords: ["auto", "manual", "hint"],
  missing: null,
  invalid: "manual",
  empty: "auto",
});

// --- ElementInternals (minimal) -------------------------------------------------------------

const attachedInternals = new WeakMap<Element, ElementInternals>();

/** The custom state set of an element's attached ElementInternals, if any (for `:state()`, selectors/html-predicates.ts). */
export function customStatesOf(el: Element): Set<string> | null {
  return attachedInternals.get(el)?.[$states] ?? null;
}

/**
 * https://html.spec.whatwg.org/#elementinternals — ARIA reflection, custom states, the shadow
 * root, and form association (delegated to html/forms/face.ts).
 */
export class ElementInternals {
  [$target]: HTMLElement;
  [$states]: Set<string> | null;
  [$value]: unknown;

  constructor(target: HTMLElement) {
    if (!(target instanceof HTMLElement) || attachedInternals.has(target)) throw new TypeError("Illegal constructor");
    this[$target] = target;
    this[$states] = null;
    this[$value] = null;
  }

  /** https://html.spec.whatwg.org/#dom-elementinternals-shadowroot */
  get shadowRoot(): ShadowRoot | null {
    const shadow = (this[$target] as unknown as { [$shadowRoot]: ShadowRoot | null })[$shadowRoot];
    return shadow == null || !shadow[$availableToElementInternals] ? null : shadow;
  }

  get states(): Set<string> {
    return (this[$states] ??= new CustomStateSet());
  }

  get form(): Element | null {
    return internalsForm(this[$target][$impl]);
  }

  get labels(): unknown {
    return internalsLabels(this[$target][$impl]);
  }

  get willValidate(): boolean {
    return internalsWillValidate(this[$target][$impl]);
  }

  get validity(): ValidityState {
    return internalsValidity(this[$target][$impl]);
  }

  get validationMessage(): string {
    return internalsValidationMessage(this[$target][$impl]);
  }

  setFormValue(value: unknown, state?: unknown): void {
    internalsSetFormValue(this[$target][$impl], value, state);
    this[$value] = value;
  }

  setValidity(flags?: Record<string, unknown>, message?: string, anchor?: Element): void {
    internalsSetValidity(this[$target][$impl], flags, message, anchor);
  }

  checkValidity(): boolean {
    return internalsCheckValidity(this[$target][$impl]);
  }

  reportValidity(): boolean {
    return internalsCheckValidity(this[$target][$impl], "reportValidity");
  }
}

// ARIA reflection on ElementInternals (https://w3c.github.io/aria/#ARIAMixin): the reflected
// target is the internals' own "internal content attribute map", not the element's attributes
// (https://html.spec.whatwg.org/#accessibility-semantics). Kept off the instance so the
// internals object has no enumerable string-keyed state.
const internalsAria = new WeakMap<ElementInternals, Map<string, string>>();
for (const item of ARIA_STRING_ATTRIBUTES.split(" ")) {
  const eq = item.indexOf("=");
  const name = eq === -1 ? item : item.slice(0, eq);
  const content = eq === -1 ? item : item.slice(eq + 1);
  Object.defineProperty(ElementInternals.prototype, name, {
    get(this: ElementInternals) {
      return internalsAria.get(this)?.get(content) ?? null;
    },
    set(this: ElementInternals, v: unknown) {
      let map = internalsAria.get(this);
      if (v === null || v === undefined) {
        map?.delete(content);
        return;
      }
      if (map === undefined) internalsAria.set(this, (map = new Map()));
      map.set(content, String(v));
    },
    configurable: true,
    enumerable: true,
  });
}

// ARIA element reflection on ElementInternals (`Element?` / `FrozenArray<Element>?`): the
// explicitly set elements, held weakly; arrays keep their identity while the contents are equal
// (https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes, element and
// FrozenArray<Element> cases). No in-scope filtering: internals have no content attribute.
const internalsAriaElements = new WeakMap<
  ElementInternals,
  Map<string, { refs: WeakRef<Element>[]; cached: readonly Element[] | null }>
>();
for (const [name, many] of [
  ["ariaActiveDescendantElement", false],
  ["ariaControlsElements", true],
  ["ariaDescribedByElements", true],
  ["ariaDetailsElements", true],
  ["ariaErrorMessageElements", true],
  ["ariaFlowToElements", true],
  ["ariaLabelledByElements", true],
  ["ariaOwnsElements", true],
] as const) {
  const toElement = (v: unknown): Element => {
    if (!(v instanceof Element))
      throw new TypeError(
        `Failed to set the '${name}' property on 'ElementInternals': Failed to convert value to 'Element'.`,
      );
    return v;
  };
  Object.defineProperty(ElementInternals.prototype, name, {
    get(this: ElementInternals) {
      const entry = internalsAriaElements.get(this)?.get(name);
      if (entry === undefined) return null;
      if (!many) return entry.refs[0]?.deref() ?? null;
      const live: Element[] = [];
      for (const r of entry.refs) {
        const e = r.deref();
        if (e !== undefined) live.push(e);
      }
      const c = entry.cached;
      if (c !== null && c.length === live.length && live.every((e, i) => c[i] === e)) return c;
      return (entry.cached = Object.freeze(live));
    },
    set(this: ElementInternals, v: unknown) {
      let map = internalsAriaElements.get(this);
      if (v === null || v === undefined) {
        map?.delete(name);
        return;
      }
      let refs: WeakRef<Element>[];
      if (!many) refs = [new WeakRef(toElement(v))];
      else {
        if (typeof v !== "object" || typeof (v as Iterable<unknown>)[Symbol.iterator] !== "function") {
          throw new TypeError(
            `Failed to set the '${name}' property on 'ElementInternals': The provided value cannot be converted to a sequence.`,
          );
        }
        refs = [];
        for (const item of v as Iterable<unknown>) refs.push(new WeakRef(toElement(item)));
      }
      if (map === undefined) internalsAriaElements.set(this, (map = new Map()));
      map.set(name, { refs, cached: null });
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
      const current = contentAttr(this[$impl], "nonce");
      if (slot !== undefined && slot[1] === current) return slot[0];
      return current ?? "";
    },
    function (v) {
      Object.defineProperty(this, NONCE, {
        value: [String(v), contentAttr(this[$impl], "nonce")],
        writable: true,
        configurable: true,
      });
    },
  );
  bool(C, "autofocus");
  defineAccessor(
    C,
    "tabIndex",
    function () {
      const v = tabIndexValue(this[$impl]);
      return Number.isNaN(v) ? defaultTabIndex(this[$impl]) : v;
    },
    function (v) {
      setAttribute(this[$impl], "tabindex", String(Number(v) | 0));
    },
  );
  Object.defineProperty(C.prototype, "focus", {
    /** https://html.spec.whatwg.org/#dom-focus */
    value: function focus(this: Element, options?: { preventScroll?: boolean; focusVisible?: boolean }): void {
      focusElement(this[$impl], options);
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(C.prototype, "blur", {
    /** https://html.spec.whatwg.org/#dom-blur */
    value: function blur(this: Element): void {
      blurElement(this[$impl]);
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
      return activeElement(this[$impl]);
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

/** ShowPopoverOptions / TogglePopoverOptions `source` (WebIDL `HTMLElement`: null and non-elements throw a TypeError). */
function popoverSource(options: unknown): NodeImpl | null {
  if (options === undefined || options === null || typeof options !== "object") return null;
  const source = (options as { source?: unknown }).source;
  if (source === undefined) return null;
  if (!(source instanceof HTMLElement))
    throw new TypeError(
      "Failed to read the 'source' property from the options: The provided value is not of type 'HTMLElement'.",
    );
  return source[$impl];
}

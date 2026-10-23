/**
 * Custom elements — web-platform-tests custom-elements, run unmodified through test/wpt/harness.ts.
 *
 * Specs: HTML Standard §4.13 "Custom elements" — https://html.spec.whatwg.org/#custom-elements
 *   - CustomElementRegistry: https://html.spec.whatwg.org/#customelementregistry
 *   - HTML element constructors: https://html.spec.whatwg.org/#html-element-constructors
 *   - upgrades: https://html.spec.whatwg.org/#upgrades
 *   - custom element reactions: https://html.spec.whatwg.org/#custom-element-reactions
 *   - ElementInternals / form-associated custom elements: https://html.spec.whatwg.org/#the-elementinternals-interface
 *   - custom state pseudo-class: https://html.spec.whatwg.org/#custom-state-pseudo-class
 *   DOM Standard "create an element": https://dom.spec.whatwg.org/#concept-create-element
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/custom-elements
 * (scoped registries, custom-elements/registries, are not implemented and not vendored).
 *
 * Known failures per file are listed in test/wpt/expectations/components.json.
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

describe("Custom elements — custom-elements (https://github.com/web-platform-tests/wpt/tree/master/custom-elements)", () => {
  defineWPT("custom-elements/CustomElementRegistry-constructor-and-callbacks-are-held-strongly.html", "adoptedCallback case adopts into an iframe-less document via frames[] (window named frames not exposed by the harness)");
  defineWPT("custom-elements/CustomElementRegistry-getName.html");
  defineWPT("custom-elements/CustomElementRegistry.html", "whenDefined() promise comes from the host realm, the test checks instanceof the vm realm's Promise (harness)");
  defineWPT("custom-elements/Document-createElement-customized-builtins.html");
  defineWPT("custom-elements/Document-createElement.html", "XMLHttpRequest documents (no network)");
  defineWPT("custom-elements/Document-createElementNS-customized-builtins.html");
  defineWPT("custom-elements/Document-createElementNS-prefix-timing.html");
  defineWPT("custom-elements/Document-createElementNS.html");
  defineWPT("custom-elements/ElementInternals-accessibility-values.html");
  defineWPT("custom-elements/ElementInternals-accessibility.html");
  defineWPT("custom-elements/HTMLElement-attachInternals.html");
  defineWPT("custom-elements/HTMLElement-constructor-customized-builtins.html");
  defineWPT("custom-elements/HTMLElement-constructor.html");
  defineWPT("custom-elements/adopted-callback.html", "XMLHttpRequest documents (no network)");
  defineWPT("custom-elements/append-children-to-new-parent-cycle.html");
  defineWPT("custom-elements/attribute-changed-callback.html");
  defineWPT("custom-elements/builtin-coverage.html", "<html>/<body> customized built-ins need the document parser to run scripts first; <summary> interface is an internal HTMLElement subclass");
  defineWPT("custom-elements/connected-callbacks-html-fragment-parsing.html", "XMLHttpRequest documents (no network)");
  defineWPT("custom-elements/connected-callbacks-template.html");
  defineWPT("custom-elements/connected-callbacks.html", "XMLHttpRequest documents (no network)");
  defineWPT("custom-elements/createElement-reentrant-construction.window.js");
  defineWPT("custom-elements/custom-element-reaction-queue.html");
  defineWPT("custom-elements/disconnected-callbacks.html", "XMLHttpRequest documents (no network)");
  defineWPT("custom-elements/element-internals-aria-element-reflection.html", "test_driver.get_computed_label (no testdriver for @rtd/dom-only suites)");
  defineWPT("custom-elements/element-internals-shadowroot.html");
  defineWPT("custom-elements/enqueue-custom-element-callback-reactions-inside-another-callback.html");
  defineWPT("custom-elements/historical.html");
  defineWPT("custom-elements/microtasks-and-constructors.html", "needs scripts interleaved with document parsing");
  defineWPT("custom-elements/overwritten-customElements-global.html", "harness window proxy does not support redefining window.customElements");
  defineWPT("custom-elements/range-and-constructors.html");
  defineWPT("custom-elements/reaction-timing.html");
  defineWPT("custom-elements/shadow-descendant-lifecycle-order.html");
  defineWPT("custom-elements/upgrading.html", "XMLHttpRequest documents (no network)");
});

describe("Custom elements — custom-elements/form-associated (https://github.com/web-platform-tests/wpt/tree/master/custom-elements/form-associated)", () => {
  defineWPT("custom-elements/form-associated/ElementInternals-NotSupportedError.html");
  defineWPT("custom-elements/form-associated/ElementInternals-form.html");
  defineWPT("custom-elements/form-associated/ElementInternals-labels.html");
  defineWPT("custom-elements/form-associated/ElementInternals-setFormValue-nullish-value.html");
  defineWPT("custom-elements/form-associated/ElementInternals-setValidity-normalize-newlines.html");
  defineWPT("custom-elements/form-associated/ElementInternals-target-element-is-held-strongly.html");
  defineWPT("custom-elements/form-associated/ElementInternals-validation.html");
  defineWPT("custom-elements/form-associated/disabled-delegatesFocus.html");
  defineWPT("custom-elements/form-associated/fieldset-elements-after-upgrade.html");
  defineWPT("custom-elements/form-associated/fieldset-elements-during-construction.html");
  defineWPT("custom-elements/form-associated/fieldset-elements.html");
  defineWPT("custom-elements/form-associated/focusability.html");
  defineWPT("custom-elements/form-associated/form-associated-callback.html", "parser-created elements need scripts interleaved with parsing (harness builds markup first)");
  defineWPT("custom-elements/form-associated/form-disabled-legend.html", "legend/fieldset disabledness updates are not re-reported to FACEs (html/forms)");
  defineWPT("custom-elements/form-associated/form-elements-namedItem.html");
  defineWPT("custom-elements/form-associated/form-reset-callback.html", "reset button activation runs formResetCallback before the built-in reset finishes");
});

describe("Custom elements — custom-elements/parser (https://github.com/web-platform-tests/wpt/tree/master/custom-elements/parser)", () => {
  defineWPT("custom-elements/parser/parser-constructs-custom-element-in-document-write.html", "document.write runs no scripts");
  defineWPT("custom-elements/parser/parser-constructs-custom-elements-with-is.html");
  defineWPT("custom-elements/parser/parser-constructs-custom-elements.html");
  defineWPT("custom-elements/parser/parser-custom-element-in-foreign-content.html");
  defineWPT("custom-elements/parser/parser-uses-registry-of-owner-document.html", "needs scripts interleaved with document parsing");
});

describe("Custom elements — custom-elements/reactions (https://github.com/web-platform-tests/wpt/tree/master/custom-elements/reactions)", () => {
  defineWPT("custom-elements/reactions/AriaMixin-element-attributes.html");
  defineWPT("custom-elements/reactions/AriaMixin-string-attributes.html");
  defineWPT("custom-elements/reactions/CSSStyleDeclaration.html", "-webkit-filter alias serialization (css)");
  defineWPT("custom-elements/reactions/ChildNode.html");
  defineWPT("custom-elements/reactions/DOMStringMap.html");
  defineWPT("custom-elements/reactions/DOMTokenList.html");
  defineWPT("custom-elements/reactions/Document.html", "execCommand is not implemented");
  defineWPT("custom-elements/reactions/Element.html");
  defineWPT("custom-elements/reactions/ElementContentEditable.html");
  defineWPT("custom-elements/reactions/HTMLAnchorElement.html");
  defineWPT("custom-elements/reactions/HTMLElement.html");
  defineWPT("custom-elements/reactions/HTMLOptionElement.html");
  defineWPT("custom-elements/reactions/HTMLOptionsCollection.html");
  defineWPT("custom-elements/reactions/HTMLOutputElement.html");
  defineWPT("custom-elements/reactions/HTMLSelectElement.html");
  defineWPT("custom-elements/reactions/HTMLTableElement.html");
  defineWPT("custom-elements/reactions/HTMLTableRowElement.html");
  defineWPT("custom-elements/reactions/HTMLTableSectionElement.html");
  defineWPT("custom-elements/reactions/HTMLTitleElement.html");
  defineWPT("custom-elements/reactions/NamedNodeMap.html");
  defineWPT("custom-elements/reactions/Node.html");
  defineWPT("custom-elements/reactions/ParentNode.html");
  defineWPT("custom-elements/reactions/Range.html", "createContextualFragment upgrades run in a microtask (parser upgrades wait for the fragment to be inserted)");
  defineWPT("custom-elements/reactions/Selection.html");
  defineWPT("custom-elements/reactions/ShadowRoot.html");
  defineWPT("custom-elements/reactions/with-exceptions.html");
});

describe("Custom elements — custom-elements/reactions/customized-builtins (https://github.com/web-platform-tests/wpt/tree/master/custom-elements/reactions/customized-builtins)", () => {
  defineWPT("custom-elements/reactions/customized-builtins/HTMLAreaElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLBaseElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLButtonElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLCanvasElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLDataElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLDetailsElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLEmbedElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLFieldSetElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLImageElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLInputElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLLIElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLLabelElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLMapElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLMediaElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLMetaElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLMeterElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLModElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLOListElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLOptGroupElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLParamElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLProgressElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLQuoteElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLSlotElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLSourceElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLStyleElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLTableCellElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLTableColElement.html");
  defineWPT("custom-elements/reactions/customized-builtins/HTMLTimeElement.html");
});

describe("Custom elements — custom-elements/state (https://github.com/web-platform-tests/wpt/tree/master/custom-elements/state)", () => {
  defineWPT("custom-elements/state/ElementInternals-states.html", "CustomStateSet initial-state check (see expectations)");
  defineWPT("custom-elements/state/state-css-selector-nth-of.html");
  defineWPT("custom-elements/state/state-css-selector-shadow-dom.html");
  defineWPT("custom-elements/state/state-css-selector.html");
  defineWPT("custom-elements/state/state-pseudo-class.html", "::part() is not supported");
});

describe("Custom elements — custom-elements/upgrading (https://github.com/web-platform-tests/wpt/tree/master/custom-elements/upgrading)", () => {
  defineWPT("custom-elements/upgrading/Document-importNode-customized-builtins.html");
  defineWPT("custom-elements/upgrading/Node-cloneNode-customized-builtins.html");
  defineWPT("custom-elements/upgrading/Node-cloneNode.html");
  defineWPT("custom-elements/upgrading/upgrading-enqueue-reactions.html");
  defineWPT("custom-elements/upgrading/upgrading-parser-created-element.html");
});

/**
 * Shadow DOM — web-platform-tests shadow-dom, run unmodified through test/wpt/harness.ts.
 *
 * Specs: DOM Standard §4.2.2 "Shadow tree" — https://dom.spec.whatwg.org/#shadow-trees
 *   - slots / slottables / assign slottables: https://dom.spec.whatwg.org/#shadow-tree-slots
 *   - attach a shadow root: https://dom.spec.whatwg.org/#concept-attach-a-shadow-root
 *   - HTMLSlotElement (assign, assignedNodes): https://html.spec.whatwg.org/#the-slot-element
 *   - declarative shadow roots: https://html.spec.whatwg.org/#attr-template-shadowrootmode
 *   - getHTML / setHTMLUnsafe: https://html.spec.whatwg.org/#dom-element-gethtml
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/shadow-dom
 * (event dispatch / retargeting files are registered by the events suite).
 *
 * Known failures per file are listed in test/wpt/expectations/components.json.
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

describe("Shadow DOM — shadow-dom (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom)", () => {
  defineWPT("shadow-dom/Document-prototype-adoptNode.html");
  defineWPT("shadow-dom/Document-prototype-importNode.html");
  defineWPT("shadow-dom/Element-interface-attachShadow-custom-element.html");
  defineWPT("shadow-dom/Element-interface-attachShadow.html");
  defineWPT("shadow-dom/Element-interface-shadowRoot-attribute.html");
  defineWPT("shadow-dom/Extensions-to-Event-Interface.html");
  defineWPT("shadow-dom/HTMLSlotElement-interface.html");
  defineWPT("shadow-dom/Node-prototype-cloneNode.html");
  defineWPT("shadow-dom/Range-prototype-insertNode.html");
  defineWPT("shadow-dom/ShadowRoot-interface.html");
  defineWPT("shadow-dom/Slottable-mixin.html");
  defineWPT("shadow-dom/assign-slottables-after-removing-shadow-tree-from-document.html");
  defineWPT("shadow-dom/attach-shadow-non-html-namespace.html");
  defineWPT("shadow-dom/build-deep-detached-shadow-then-append-text.html");
  defineWPT("shadow-dom/capturing-and-bubbling-event-listeners-across-shadow-trees.html");
  defineWPT("shadow-dom/event-composed-path-after-dom-mutation.html");
  defineWPT("shadow-dom/event-composed-path-with-related-target.html");
  defineWPT("shadow-dom/event-composed-path.html");
  defineWPT("shadow-dom/event-composed.html");
  defineWPT("shadow-dom/event-inside-shadow-tree.html");
  defineWPT("shadow-dom/event-inside-slotted-node.html");
  defineWPT("shadow-dom/event-post-dispatch-listenerless.html");
  defineWPT("shadow-dom/event-post-dispatch-no-listeners.html");
  defineWPT("shadow-dom/event-post-dispatch.html");
  defineWPT("shadow-dom/event-with-related-target.html");
  defineWPT("shadow-dom/form-control-form-attribute.html");
  defineWPT("shadow-dom/getElementById-dynamic-001.html");
  defineWPT("shadow-dom/getElementById-dynamic-002.html");
  defineWPT("shadow-dom/historical.html");
  defineWPT("shadow-dom/imperative-slot-api-cross-shadow-root.html", "browsers fire slotchange on a slot that gains a node that is not its host's child; the DOM spec does not");
  defineWPT("shadow-dom/imperative-slot-api-disconnected.html");
  defineWPT("shadow-dom/imperative-slot-api-slotchange.html");
  defineWPT("shadow-dom/imperative-slot-api.html");
  defineWPT("shadow-dom/imperative-slot-fallback-clear.html");
  defineWPT("shadow-dom/input-element-list.html");
  defineWPT("shadow-dom/input-type-radio.html");
  defineWPT("shadow-dom/inserting-fragment-under-shadow-host.html");
  defineWPT("shadow-dom/shadow-root-clonable.html", "declarative shadow roots inside templates in the main document (harness builds the page with parse5)");
  defineWPT("shadow-dom/slot-reconciliation-at-node-removal.html");
  defineWPT("shadow-dom/slotchange-event.html");
  defineWPT("shadow-dom/slots-fallback-in-document.html");
  defineWPT("shadow-dom/slots-fallback.html");
  defineWPT("shadow-dom/slots-outside-shadow-dom.html");
  defineWPT("shadow-dom/slots.html");
});

describe("Shadow DOM — shadow-dom/declarative (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/declarative)", () => {
  defineWPT("shadow-dom/declarative/declarative-parser-interaction.html");
  defineWPT("shadow-dom/declarative/declarative-shadow-dom-attachment.html");
  defineWPT("shadow-dom/declarative/declarative-shadow-dom-basic.html", "main-document declarative shadow roots: the harness builds the page with parse5; iframes/XHR/document.write");
  defineWPT("shadow-dom/declarative/declarative-shadow-dom-serialization.html");
  defineWPT("shadow-dom/declarative/declarative-shadow-dom-slot-assignment-serialization.html");
  defineWPT("shadow-dom/declarative/declarative-shadow-dom-slot-assignment.html");
  defineWPT("shadow-dom/declarative/declarative-with-disabled-shadow.html");
  defineWPT("shadow-dom/declarative/gethtml.html");
  defineWPT("shadow-dom/declarative/script-access.html", "streaming parser observation needs script execution during parsing");
});

describe("Shadow DOM — shadow-dom/focus (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/focus)", () => {
  defineWPT("shadow-dom/focus/DocumentOrShadowRoot-activeElement.html");
  defineWPT("shadow-dom/focus/ShadowRoot-delegatesFocus.html");
  defineWPT("shadow-dom/focus/blur-on-shadow-host-delegatesFocus.html", "blur() on a delegatesFocus host with a slotted focused element (html focus)");
  defineWPT("shadow-dom/focus/delegatesFocus-tabindex-change.html");
  defineWPT("shadow-dom/focus/focus-autofocus.html");
  defineWPT("shadow-dom/focus/focus-method-delegatesFocus-nested-browsing-context.html");
  defineWPT("shadow-dom/focus/focus-method-delegatesFocus.html");
  defineWPT("shadow-dom/focus/focus-preserved-on-slot-reorder.html");
  defineWPT("shadow-dom/focus/focus-selector-delegatesFocus.html");
});

describe("Shadow DOM — shadow-dom/leaktests (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/leaktests)", () => {
  defineWPT("shadow-dom/leaktests/get-elements.html");
  defineWPT("shadow-dom/leaktests/html-collection.html", "document.all is not implemented");
});

describe("Shadow DOM — shadow-dom/untriaged/elements-and-dom-objects/extensions-to-element-interface/attributes (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/elements-and-dom-objects/extensions-to-element-interface/attributes)", () => {
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/extensions-to-element-interface/attributes/test-006.html");
});

describe("Shadow DOM — shadow-dom/untriaged/elements-and-dom-objects/extensions-to-element-interface/methods (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/elements-and-dom-objects/extensions-to-element-interface/methods)", () => {
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/extensions-to-element-interface/methods/test-001.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/extensions-to-element-interface/methods/test-002.html");
});

describe("Shadow DOM — shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes)", () => {
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes/activeElement-confirm-return-null.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes/test-007.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes/test-009.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes/test-010.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes/test-011.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes/test-012.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-attributes/test-013.html");
});

describe("Shadow DOM — shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-methods (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-methods)", () => {
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-methods/test-001.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-methods/test-006.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-methods/test-007.html");
  defineWPT("shadow-dom/untriaged/elements-and-dom-objects/shadowroot-object/shadowroot-methods/test-010.html");
});

describe("Shadow DOM — shadow-dom/untriaged/events/event-dispatch (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/events/event-dispatch)", () => {
  defineWPT("shadow-dom/untriaged/events/event-dispatch/test-002.html");
  defineWPT("shadow-dom/untriaged/events/event-dispatch/test-003.html");
});

describe("Shadow DOM — shadow-dom/untriaged/events/event-retargeting (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/events/event-retargeting)", () => {
  defineWPT("shadow-dom/untriaged/events/event-retargeting/test-001.html");
  defineWPT("shadow-dom/untriaged/events/event-retargeting/test-003.html");
});

describe("Shadow DOM — shadow-dom/untriaged/events/retargeting-focus-events (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/events/retargeting-focus-events)", () => {
  defineWPT("shadow-dom/untriaged/events/retargeting-focus-events/test-001.html");
  defineWPT("shadow-dom/untriaged/events/retargeting-focus-events/test-002.html");
  defineWPT("shadow-dom/untriaged/events/retargeting-focus-events/test-003.html");
});

describe("Shadow DOM — shadow-dom/untriaged/events/retargeting-relatedtarget (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/events/retargeting-relatedtarget)", () => {
  defineWPT("shadow-dom/untriaged/events/retargeting-relatedtarget/test-001.html");
  defineWPT("shadow-dom/untriaged/events/retargeting-relatedtarget/test-002.html");
  defineWPT("shadow-dom/untriaged/events/retargeting-relatedtarget/test-003.html");
});

describe("Shadow DOM — shadow-dom/untriaged/events (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/events)", () => {
  defineWPT("shadow-dom/untriaged/events/test-001.html");
});

describe("Shadow DOM — shadow-dom/untriaged/html-elements-in-shadow-trees/html-forms (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/html-elements-in-shadow-trees/html-forms)", () => {
  defineWPT("shadow-dom/untriaged/html-elements-in-shadow-trees/html-forms/test-001.html");
  defineWPT("shadow-dom/untriaged/html-elements-in-shadow-trees/html-forms/test-002.html");
});

describe("Shadow DOM — shadow-dom/untriaged/html-elements-in-shadow-trees/inert-html-elements (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/html-elements-in-shadow-trees/inert-html-elements)", () => {
  defineWPT("shadow-dom/untriaged/html-elements-in-shadow-trees/inert-html-elements/test-002.html");
});

describe("Shadow DOM — shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation)", () => {
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/dom-tree-accessors-001.html", "document.all is not implemented");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/dom-tree-accessors-002.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/ownerdocument-001.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/ownerdocument-002.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/selectors-api-001.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/selectors-api-002.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/shadow-root-001.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/test-007.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/test-009.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/test-011.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/window-named-properties-001.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/window-named-properties-002.html");
  defineWPT("shadow-dom/untriaged/shadow-trees/upper-boundary-encapsulation/window-named-properties-003.html");
});

describe("Shadow DOM — shadow-dom/untriaged/styles (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/styles)", () => {
  defineWPT("shadow-dom/untriaged/styles/test-003.html");
});

describe("Shadow DOM — shadow-dom/untriaged/user-interaction/active-element (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/user-interaction/active-element)", () => {
  defineWPT("shadow-dom/untriaged/user-interaction/active-element/test-001.html");
  defineWPT("shadow-dom/untriaged/user-interaction/active-element/test-002.html");
});

describe("Shadow DOM — shadow-dom/untriaged/user-interaction/editing (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/user-interaction/editing)", () => {
  defineWPT("shadow-dom/untriaged/user-interaction/editing/inheritance-of-content-editable-001.html");
});

describe("Shadow DOM — shadow-dom/untriaged/user-interaction/ranges-and-selections (https://github.com/web-platform-tests/wpt/tree/master/shadow-dom/untriaged/user-interaction/ranges-and-selections)", () => {
  defineWPT("shadow-dom/untriaged/user-interaction/ranges-and-selections/test-001.html");
});

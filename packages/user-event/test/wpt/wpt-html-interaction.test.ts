/**
 * HTML user interaction WPT that drive input through test_driver (click, send_keys, Actions),
 * run through packages/dom/test/wpt/harness.ts with a test_driver backed by @rtd/user-event
 * (./testdriver.ts). Sequential focus navigation follows upstream user-event's tab order.
 *
 * Specs:
 *   - Focus: https://html.spec.whatwg.org/#focus (sequential navigation: https://html.spec.whatwg.org/#sequential-focus-navigation)
 *   - Dialogs: https://html.spec.whatwg.org/#the-dialog-element (close requests: https://html.spec.whatwg.org/#close-requests)
 *   - Popovers: https://html.spec.whatwg.org/#the-popover-attribute (light dismiss: https://html.spec.whatwg.org/#popover-light-dismiss)
 *   - Summary activation: https://html.spec.whatwg.org/#the-summary-element
 *   - inert: https://html.spec.whatwg.org/#inert-subtrees
 * Original tests: https://github.com/web-platform-tests/wpt (paths below).
 */
import { defineWPT } from "../../../dom/test/wpt/harness.ts";
import { userEventTestDriver } from "./testdriver.ts";

const testdriver = userEventTestDriver;

defineWPT("focus/ancestor-activeelement-after-child-lose-focus.html", "", { testdriver });
defineWPT("html/editing/focus/sequential-focus-navigation-and-the-tabindex-attribute/focus-tabindex-event.html", "", { testdriver });
defineWPT("html/interaction/focus/focus-01.html", "", { testdriver });
defineWPT("html/interaction/focus/focus-02.html", "", { testdriver });
defineWPT("html/interaction/focus/focus-input-type-switch.html", "", { testdriver });
defineWPT("html/interaction/focus/focus-keyboard-js.html", "", { testdriver });
defineWPT("html/interaction/focus/tab-table-caption.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-details-element/details-toggle-source.html", "clicks the <details> at an offset that lands on its <summary>: needs layout", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-cancel-with-input.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-cancel-with-select.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-closedby-show-stacked.html", "clicks outside the dialogs at viewport coordinates: needs layout", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-closedby-start-open.html", "calls `new test_driver.send_keys()` (a WPT bug that browsers tolerate)", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-focusability.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-form-submission.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-keydown-preventDefault.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-light-dismiss-drag.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-requestclose-2.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-requestclose-3.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-requestclose.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-toggle-source.html", "light dismiss by clicking at viewport coordinates needs layout", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/inert-node-is-unfocusable.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/remove-dialog-should-unblock-document.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-dialog-element/simulated-click-inert.html", "", { testdriver });
defineWPT("html/semantics/interactive-elements/the-summary-element/interactive-content.html", "", { testdriver });
defineWPT("html/semantics/popovers/light-dismiss-remove-target.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-attribute-all-elements.html", "visibility is checked with offsetWidth/getClientRects: needs layout", { testdriver });
defineWPT("html/semantics/popovers/popover-change-type.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-focus-harness.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-focus-inside-slot.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-hint-hierarchy.html", "light dismiss by clicking at viewport coordinates needs layout", { testdriver });
defineWPT("html/semantics/popovers/popover-invoker-reset.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-invoking-attribute-hint.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-invoking-attribute.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-light-dismiss-input-text.html", "", { testdriver });
defineWPT("html/semantics/popovers/popover-open-in-beforetoggle.html", "light dismiss by clicking at viewport coordinates needs layout", { testdriver });
defineWPT("html/semantics/popovers/popover-top-layer-nesting-hints.html", "Fullscreen API not implemented", { testdriver });
defineWPT("html/semantics/popovers/popover-top-layer-nesting.html", "Fullscreen API not implemented", { testdriver });
defineWPT("inert/inert-form-control.html", "", { testdriver });
defineWPT("inert/inert-label-focus.html", "label.focus() delegation to the labeled control (forms area)", { testdriver });
defineWPT("inert/inert-node-is-uneditable.html", "user-event types into contenteditable by its own model, not through beforeinput/editing commands on the clicked node", { testdriver });
defineWPT("inert/inert-node-is-unfocusable.html", "uses the HTMLElement.inert IDL attribute, which is not exposed (like jsdom; docs/deviations.md)", { testdriver });

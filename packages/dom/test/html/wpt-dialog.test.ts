/**
 * <dialog> — web-platform-tests html/semantics/interactive-elements/the-dialog-element, run
 * unmodified through test/wpt/harness.ts (test_driver files run from packages/user-event).
 *
 * Spec: HTML Standard §4.11.4 "The dialog element" — https://html.spec.whatwg.org/#the-dialog-element
 *   - show / show a modal dialog: https://html.spec.whatwg.org/#show-a-modal-dialog
 *   - close / request close: https://html.spec.whatwg.org/#close-the-dialog
 *   - dialog focusing steps: https://html.spec.whatwg.org/#dialog-focusing-steps
 *   - close watchers: https://html.spec.whatwg.org/#close-watcher-request-close
 *   - method=dialog submission: https://html.spec.whatwg.org/#concept-form-submit
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/semantics/interactive-elements/the-dialog-element
 */
import { defineWPT } from "../wpt/harness.ts";

// dialog-close.html redefines HTMLDialogElement.prototype.returnValue (interface objects are
// shared across windows), so it is registered last.
defineWPT("html/semantics/interactive-elements/the-dialog-element/abspos-dialog-layout.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/child-sequential-focus.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-active-document.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-autofocus-just-once.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-close-event-async.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-close-event.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-enabled.html");
defineWPT(
  "html/semantics/interactive-elements/the-dialog-element/dialog-focus-previous-outside.html",
  "declarative shadow roots in the markup are not attached by the harness",
);
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-focus-shadow-double-nested.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-focus-shadow.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-focusing-steps-disconnected.html");
defineWPT(
  "html/semantics/interactive-elements/the-dialog-element/dialog-focusing-steps-inert.html",
  "uses the HTMLElement.inert IDL attribute, which is not exposed (like jsdom; docs/deviations.md)",
);
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-focusing-steps-prevent-autofocus.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-form-submission-unusual.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-no-throw-requested-state.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-open-2.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-open.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-requestclose-recurse.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-return-value.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-showModal-remove.html");
defineWPT(
  "html/semantics/interactive-elements/the-dialog-element/dialog-showModal.html",
  "elementFromPoint needs layout",
);
defineWPT("html/semantics/interactive-elements/the-dialog-element/inert-does-not-match-disabled-selector.html");
defineWPT(
  "html/semantics/interactive-elements/the-dialog-element/modal-dialog-in-visibility-hidden.html",
  "UA style `dialog:modal { visibility: visible }` is not in the css area UA sheet",
);
defineWPT("html/semantics/interactive-elements/the-dialog-element/submit-dialog-close-event.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/synthetic-click-inert.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/toggle-events.html");
defineWPT("html/semantics/interactive-elements/the-dialog-element/dialog-close.html");

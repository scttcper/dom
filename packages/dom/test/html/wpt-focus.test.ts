/**
 * Focus — web-platform-tests html/interaction/focus, html/editing/focus, focus/ and inert/,
 * run unmodified through test/wpt/harness.ts (files that need test_driver run from
 * packages/user-event/test/wpt/wpt-html-interaction.test.ts).
 *
 * Spec: HTML Standard §6.6 "Focus" — https://html.spec.whatwg.org/#focus
 *   - focusing / unfocusing steps: https://html.spec.whatwg.org/#focusing-steps
 *   - focus update steps (event order): https://html.spec.whatwg.org/#focus-update-steps
 *   - focus delegate / autofocus delegate: https://html.spec.whatwg.org/#focus-delegate
 *   - focus fixup (update the rendering): https://html.spec.whatwg.org/#update-the-rendering
 *   - tabindex: https://html.spec.whatwg.org/#the-tabindex-attribute
 *   - inert: https://html.spec.whatwg.org/#inert-subtrees
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/interaction/focus
 */
import { defineWPT } from "../wpt/harness.ts";

defineWPT("focus/anchor-remove-href.html");
defineWPT("focus/focus-centers-element.html");
defineWPT("focus/focus-double-sync-calls.html");
defineWPT("focus/focus-sync-when-blur.html");
defineWPT("html/editing/focus/focus-management/active-element.html");
defineWPT("html/editing/focus/focus-management/focus-blur.html");
defineWPT("html/editing/focus/focus-management/focus-on-all-elements.html");
defineWPT("html/editing/focus/focus-management/focusing-disconnected-noop.html");
defineWPT("html/editing/focus/focus-management/focusing-focused-noop.html");
defineWPT("html/interaction/focus/composed.window.js");
defineWPT("html/interaction/focus/document-level-focus-apis/document-level-apis.html");
defineWPT("html/interaction/focus/focus-file-input.html");
defineWPT("html/interaction/focus/focus-management/focus-event-targets-simple.html");
defineWPT("html/interaction/focus/focus-management/focus-events.html");
defineWPT("html/interaction/focus/processing-model/legend.html");
defineWPT("html/interaction/focus/processing-model/preventScroll-nested-scroll-elements.html");
defineWPT("html/interaction/focus/processing-model/preventScroll-textarea.html");
defineWPT(
  "html/interaction/focus/sequential-focus-navigation-and-the-tabindex-attribute/focus-tabindex-default-value.html",
);
defineWPT("html/interaction/focus/sequential-focus-navigation-and-the-tabindex-attribute/tabindex-getter-frame.html");
defineWPT("html/interaction/focus/sequential-focus-navigation-and-the-tabindex-attribute/tabindex-getter.html");
defineWPT("html/interaction/focus/tabindex-focus-flag.html");
defineWPT("html/interaction/focus/the-autofocus-attribute/autofocus-in-not-fully-active-document.html");
defineWPT(
  "html/interaction/focus/the-autofocus-attribute/autofocus-not-processed-when-top-document-has-focused-element.html",
);
defineWPT("html/interaction/focus/the-autofocus-attribute/no-sandboxed-automatic-features.html");
defineWPT("html/interaction/focus/the-autofocus-attribute/not-on-first-task.html");
defineWPT("html/interaction/focus/the-autofocus-attribute/skip-not-fully-active.html");
defineWPT(
  "inert/dynamic-inert-on-focused-element.html",
  "uses the HTMLElement.inert IDL attribute, which is not exposed (like jsdom; docs/deviations.md)",
);
defineWPT("inert/inert-canvas-fallback-content.html");
defineWPT("inert/inert-does-not-match-disabled-selector.html");
defineWPT("inert/inert-in-shadow-dom.html");
defineWPT(
  "inert/nested-inert-unfocusable.html",
  "uses the HTMLElement.inert IDL attribute, which is not exposed (like jsdom; docs/deviations.md)",
);

/**
 * <details> / <summary> — web-platform-tests html/semantics/interactive-elements, run
 * unmodified through test/wpt/harness.ts (test_driver files run from packages/user-event).
 *
 * Spec: HTML Standard §4.11.1 "The details element" — https://html.spec.whatwg.org/#the-details-element
 *   - details name groups / exclusivity: https://html.spec.whatwg.org/#ensure-details-exclusivity-by-closing-the-given-element-if-needed
 *   - summary activation behavior: https://html.spec.whatwg.org/#the-summary-element
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/semantics/interactive-elements
 */
import { defineWPT } from "../wpt/harness.ts";

defineWPT("html/semantics/interactive-elements/contextmenu-historical.html", "HTMLDocument is not exposed (window area)");
defineWPT("html/semantics/interactive-elements/the-details-element/details-name-exclusivity-fragment-insertion.html");
defineWPT("html/semantics/interactive-elements/the-details-element/details.html");
defineWPT("html/semantics/interactive-elements/the-summary-element/activation-behavior.html");
defineWPT("html/semantics/interactive-elements/the-summary-element/anchor-without-link.html");
defineWPT("html/semantics/interactive-elements/the-summary-element/summary-untrusted-key-event.html");

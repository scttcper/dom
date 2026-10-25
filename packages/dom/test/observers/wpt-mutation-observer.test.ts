/**
 * MutationObserver — web-platform-tests dom/nodes/MutationObserver-*, run unmodified through
 * test/wpt/harness.ts.
 *
 * Spec: DOM Standard §4.3 "Mutation observers" — https://dom.spec.whatwg.org/#mutation-observers
 *   - queueing a mutation record: https://dom.spec.whatwg.org/#queueing-a-mutation-record
 *   - notify mutation observers: https://dom.spec.whatwg.org/#notify-mutation-observers
 *   - observe() option validation: https://dom.spec.whatwg.org/#dom-mutationobserver-observe
 *   - transient registered observers: https://dom.spec.whatwg.org/#add-transient-registered-observers
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/nodes
 */
import { defineWPT, defineWPTDirectory } from "../wpt/harness.ts";

defineWPTDirectory(
  "dom/nodes",
  {
    "MutationObserver-cross-realm-callback-report-exception.html": "needs real iframes (frames[0])",
    "MutationObserver-document.html":
      "records produced by the HTML parser while loading the document (no streaming parse)",
  },
  { "MutationObserver-nested-crash.html": "crash test needs a navigable iframe" },
  (f) => f.includes("/MutationObserver-"),
);
defineWPT("dom/nodes/MutationObserver-callback-order.window.js");
defineWPT("dom/nodes/MutationObserver-transient-registered-observers.window.js");

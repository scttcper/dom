/**
 * Traversal — web-platform-tests dom/traversal, run unmodified through test/wpt/harness.ts.
 *
 * Spec: DOM Standard §6 "Traversal" — https://dom.spec.whatwg.org/#traversal
 *   - NodeIterator + pre-removing steps: https://dom.spec.whatwg.org/#interface-nodeiterator
 *   - TreeWalker: https://dom.spec.whatwg.org/#interface-treewalker
 *   - NodeFilter: https://dom.spec.whatwg.org/#interface-nodefilter
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/traversal
 */
import { defineWPTDirectory } from "../wpt/harness.ts";

defineWPTDirectory(
  "dom/traversal",
  {
    "TreeWalker-acceptNode-filter-cross-realm-null-browsing-context.html": "cross-realm filters need real iframes",
    "TreeWalker-acceptNode-filter-cross-realm.html": "cross-realm filters need real iframes",
  },
  {},
);

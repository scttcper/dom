/**
 * Ranges — web-platform-tests dom/ranges, run unmodified through test/wpt/harness.ts.
 *
 * Spec: DOM Standard §5 "Ranges" — https://dom.spec.whatwg.org/#ranges
 *   - boundary points / position: https://dom.spec.whatwg.org/#concept-range-bp-position
 *   - live range mutation updates: https://dom.spec.whatwg.org/#concept-live-range
 *   - extract / clone / insert / surround: https://dom.spec.whatwg.org/#concept-range-extract
 *   - StaticRange: https://dom.spec.whatwg.org/#interface-staticrange
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/ranges
 */
import { defineWPTDirectory } from "../wpt/harness.ts";
import { defineWPT } from "../wpt/harness.ts";

defineWPTDirectory(
  "dom/ranges",
  {
    "Range-extractContents-dynamic-end.html": "needs a navigable iframe that unloads",
  },
  {
    "Range-in-shadow-after-the-shadow-removed.html": "URL variants, registered below",
    "Range-compareBoundaryPoints-crash.html": "crash test relying on table parsing quirks of the HTML parser",
    "Range-insertNode-multiple-document-children-crash.html": "crash test needs document.open()",
  },
);
defineWPT("dom/ranges/Range-in-shadow-after-the-shadow-removed.html?mode=open");
defineWPT("dom/ranges/Range-in-shadow-after-the-shadow-removed.html?mode=closed");

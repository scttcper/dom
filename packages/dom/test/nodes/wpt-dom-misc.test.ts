/**
 * Top-level web-platform-tests dom/*.html that exercise the node layer, run unmodified through
 * test/wpt/harness.ts.
 *
 * Spec: DOM Standard — https://dom.spec.whatwg.org/
 *   - Attr is a Node: https://dom.spec.whatwg.org/#interface-attr
 *   - event path of removed nodes: https://dom.spec.whatwg.org/#concept-event-dispatch
 *   - historical (removed) members: https://dom.spec.whatwg.org/#historical
 *   - mutation events are not supported: https://dom.spec.whatwg.org/#mutation-observers
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom
 *
 * Not vendored: interface-objects.html and window-extends-event-target.html (Window global
 * shape, window area), xpath-*.html (XPath is not implemented), idlharness.window.js (needs
 * WebIDLParser.js).
 */
import { defineWPT } from "../wpt/harness.ts";

for (const f of ["attributes-are-nodes.html", "eventPathRemoved.html", "historical.html", "historical-mutation-events.html"]) {
  defineWPT(`dom/${f}`);
}

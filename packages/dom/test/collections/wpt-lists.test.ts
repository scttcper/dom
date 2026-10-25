/**
 * DOMTokenList — web-platform-tests dom/lists, run unmodified through test/wpt/harness.ts.
 *
 * Spec: DOM Standard §7.1 "Interface DOMTokenList" — https://dom.spec.whatwg.org/#interface-domtokenlist
 *   - ordered set parser/serializer: https://dom.spec.whatwg.org/#concept-ordered-set-parser
 *   - value / stringifier: https://dom.spec.whatwg.org/#dom-domtokenlist-value
 *   - iteration (value iterator): https://webidl.spec.whatwg.org/#es-iterable
 *   - which elements have which token lists: https://html.spec.whatwg.org/#dom-a-rellist and siblings
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/lists
 */
import { defineWPTDirectory } from "../wpt/harness.ts";

defineWPTDirectory(
  "dom/lists",
  {
    "DOMTokenList-coverage-for-attributes.html":
      "relList on SVG / MathML <a> is not implemented (html/svg elements area)",
    "DOMTokenList-iteration.html":
      "compares with the test realm's Array.prototype (harness runs tests in a separate vm realm)",
  },
  {},
);

/**
 * DOM parsing and serialization — web-platform-tests domparsing/, run unmodified through
 * test/wpt/harness.ts.
 *
 * Specs:
 *   - HTML §8.5 "DOM parsing and serialization APIs":
 *     https://html.spec.whatwg.org/#dom-parsing-and-serialization
 *     (DOMParser: https://html.spec.whatwg.org/#dom-domparser-parsefromstring,
 *     innerHTML / outerHTML: https://html.spec.whatwg.org/#dom-element-innerhtml,
 *     insertAdjacentHTML: https://html.spec.whatwg.org/#dom-element-insertadjacenthtml,
 *     createContextualFragment: https://html.spec.whatwg.org/#dom-range-createcontextualfragment)
 *   - DOM Parsing and Serialization (XMLSerializer, XML serialization):
 *     https://w3c.github.io/DOM-Parsing/#dfn-xml-serialization
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/domparsing
 *
 * Not vendored: the {append,prepend,before,after,replaceWith}HTML{Unsafe} / setHTML / stream
 * methods (new HTML API needing the Sanitizer, not in jsdom either), script-execution tests,
 * iframe-based DOMParser URL tests, document.domain origin tests and tentative/.
 */
import { describe } from "vitest";
import { defineWPTDirectory } from "../wpt/harness.ts";

describe("DOM parsing and serialization — https://html.spec.whatwg.org/#dom-parsing-and-serialization", () => {
  defineWPTDirectory(
    "domparsing",
    {
      "DOMParser-parseFromString-xml-scripting-support-disabled.html":
        "the svg-script subtests read Document.rootElement (SVG Document extension, not implemented)",
      "XMLSerializer-serializeToString.html":
        "browsers keep a redundant xmlns=\"\" when a prefix is bound to the empty namespace; no spec rule to follow",
      "createContextualFragment.html": "no script execution",
      "outerhtml-03.html": "the <body> case loads a document into an iframe (no navigation)",
    },
    {},
  );
});

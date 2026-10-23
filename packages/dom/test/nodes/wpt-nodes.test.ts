/**
 * Nodes — web-platform-tests dom/nodes (minus selectors, MutationObserver and NodeList
 * prototype-tampering tests, which run in their own files), unmodified through
 * test/wpt/harness.ts.
 *
 * Spec: DOM Standard §4 "Nodes" — https://dom.spec.whatwg.org/#nodes
 *   - mutation algorithms: https://dom.spec.whatwg.org/#mutation-algorithms
 *   - interface Node / Element / Document / CharacterData / Attr:
 *     https://dom.spec.whatwg.org/#interface-node and following
 *   - namespaces / validate and extract: https://dom.spec.whatwg.org/#namespaces
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/nodes
 */
import { defineWPTDirectory } from "../wpt/harness.ts";

const IFRAMES = "needs real iframes / cross-realm documents (harness only emulates same-directory test iframes)";
const XML_DOCUMENT = "XMLDocument interface not implemented (createDocument returns Document)";
defineWPTDirectory(
  "dom/nodes",
  {
    "Comment-constructor.html": "window[ctor] and cross-global ownerDocument checks need real iframes",
    "Text-constructor.html": "window[ctor] and cross-global ownerDocument checks need real iframes",
    "DOMImplementation-createDocument.html": XML_DOCUMENT,
    "Document-constructor.html": XML_DOCUMENT,
    "Node-cloneNode-XMLDocument.html": XML_DOCUMENT,
    "DOMImplementation-createHTMLDocument-with-saved-implementation.html": IFRAMES,
    "Document-URL.html": IFRAMES,
    "Element-getElementsByTagName-change-document-HTMLNess.html": IFRAMES,
    "Node-appendChild.html": IFRAMES,
    "Node-isConnected.html": IFRAMES,
    "Node-parentNode.html": IFRAMES,
    "Node-removeChild.html": IFRAMES,
    "Node-childNodes.html": "compares with the test realm's Array.prototype (harness runs tests in a separate vm realm)",
    "remove-unscopable.html": "inline event handler attributes are not compiled (no script execution)",
    "remove-next-sibling-during-replace-with.html": "named access on window (window[id]) is not implemented",
    "Document-getElementsByTagName.html": "Proxy-free HTMLCollection: no own index/named properties (deviation)",
    "Element-getElementsByTagName.html": "Proxy-free HTMLCollection: no own index/named properties (deviation)",
    "attributes.html": "Proxy-free NamedNodeMap: no own index/named properties (deviation)",
    "attributes-namednodemap.html": "Proxy-free NamedNodeMap: no named properties (deviation)",
    "Element-children.html": "HTMLCollection named properties (deviation: Proxy-free collections)",
    "namespaced-attribute-mutations.html": "see expectations.json",
  },
  {
    "Document-characterSet-normalization-1.html": "loads documents in many encodings through iframes",
    "Document-characterSet-normalization-2.html": "loads documents in many encodings through iframes",
    "Document-createElement.html": "loads XML/XHTML documents through iframes",
    "Document-createElementNS.html": "loads XML/XHTML documents through iframes",
    "Document-createElement-namespace.html": "loads XML/XHTML/SVG documents through iframes",
    "Element-webkitMatchesSelector.html": "selectors area",
    "Node-cloneNode-parser-created-names.html": "parser-created names via DOMParser XML",
    "processing-instruction-attributes.html": "ProcessingInstruction attributes proposal not implemented",
    "query-target-in-load-event.html": "needs iframe load events with script",
    "post-connection-steps-shadow-tree.html": "script execution",
  },
  (f) => !/\/MutationObserver-|NodeList-static-length-getter-tampered|crash/.test(f),
);

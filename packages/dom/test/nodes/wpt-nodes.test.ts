/**
 * Nodes — web-platform-tests dom/nodes (minus MutationObserver and NodeList
 * prototype-tampering tests, which run in their own files), unmodified through
 * test/wpt/harness.ts. Vendored from the upstream checkout pinned at d9c2fe5 (2026-10-23).
 *
 * Spec: DOM Standard §4 "Nodes" — https://dom.spec.whatwg.org/#nodes
 *   - mutation algorithms: https://dom.spec.whatwg.org/#mutation-algorithms
 *   - move (moveBefore): https://dom.spec.whatwg.org/#move
 *   - interface Node / Element / Document / CharacterData / Attr:
 *     https://dom.spec.whatwg.org/#interface-node and following
 *   - namespaces / validate and extract: https://dom.spec.whatwg.org/#namespaces
 *   - document base URL: https://html.spec.whatwg.org/#document-base-url
 * Selectors API tests (ParentNode-querySelector*, Element-matches/closest) live in dom/nodes
 * upstream and run here too; their failures belong to the selectors area.
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/nodes
 */
import { defineWPT, defineWPTDirectory } from "../wpt/harness.ts";

const IFRAMES = "needs real iframes / cross-realm documents (harness only emulates same-directory test iframes)";
const SHARED_INTERFACES =
  "interface objects are shared by all windows (deviation), so new frame.contentWindow.Text() gets the current document";
const PROXY_FREE = "Proxy-free HTMLCollection / NamedNodeMap: no named properties or own index properties (deviation)";

defineWPTDirectory(
  "dom/nodes",
  {
    "DOMImplementation-createHTMLDocument-with-saved-implementation.html": IFRAMES,
    "Element-getElementsByTagName-change-document-HTMLNess.html": IFRAMES,
    "Node-appendChild.html": IFRAMES,
    "Node-isConnected.html": IFRAMES,
    "Node-removeChild.html": IFRAMES,
    "remove-and-adopt-thcrash.html": IFRAMES,
    "node-realm-adoption-after-frame-removal.html": IFRAMES,
    "Node-childNodes.html": "compares with the test realm's Array.prototype (harness runs tests in a separate vm realm)",
    "remove-unscopable.html": "inline event handler attributes are not compiled (no script execution)",
    "Document-getElementsByTagName.html": PROXY_FREE,
    "Element-getElementsByTagName.html": PROXY_FREE,
    "attributes.html": PROXY_FREE,
    "attributes-namednodemap.html": PROXY_FREE,
    "Element-children.html": PROXY_FREE,
    "Document-createElement.html": "XML/XHTML documents loaded through iframes (harness only loads HTML test iframes)",
    "Document-createElementNS.html": "XML/XHTML documents loaded through iframes (harness only loads HTML test iframes)",
    "ParentNode-querySelector-All.html":
      "selectors area: :target needs a URL fragment; the iframe document's window lacks ECMAScript globals (global.TypeError)",
    "processing-instruction-attributes.html": "ProcessingInstruction attributes proposal (whatwg/dom#1371) not implemented",
  },
  {
    "Comment-constructor.html": "registered below with a short timeout",
    "Text-constructor.html": "registered below with a short timeout",
    "Document-characterSet-normalization-1.html": "loads documents in many encodings through iframes (out of scope: no network/encodings)",
    "Document-characterSet-normalization-2.html": "loads documents in many encodings through iframes (out of scope: no network/encodings)",
    "Document-createElement-namespace.html": "loads XML/XHTML/SVG documents through iframes (times out)",
    "Document-createEvent.https.html": "createEvent() interface table (events area: DeviceMotionEvent & co. not implemented)",
    "Document-URL.html": "iframe navigation to a redirecting URL (out of scope: navigation)",
    "Node-parentNode.html": "a removed iframe's document (times out; harness iframes)",
    "Element-matches.html": "loads XHTML documents through iframes (times out)",
    "Element-webkitMatchesSelector.html": "loads XHTML documents through iframes (times out)",
    "Node-cloneNode-parser-created-names.html": "parser-created names via DOMParser XML (parser area)",
    "query-target-in-load-event.html": "needs iframe load events with script",
    "post-connection-steps-shadow-tree.html": "script execution",
    "MutationObserver-cross-realm-callback-report-exception.html": "runs in wpt-mutation-observer.test.ts",
  },
  (f) => !/\/MutationObserver-|NodeList-static-length-getter-tampered|crash/.test(f),
);

for (const f of ["Comment-constructor.html", "Text-constructor.html"]) defineWPT(`dom/nodes/${f}`, SHARED_INTERFACES, { timeout: 300 });

// .window.js tests (wptFiles() only lists .html).
defineWPT("dom/nodes/adoption.window.js");
defineWPT("dom/nodes/attributes-namednodemap-cross-document.window.js");
defineWPT("dom/nodes/Document-adoptNode-DocumentFragment-with-host.window.js");
defineWPT("dom/nodes/Document-cloneNode-base-url-xml.window.js");
defineWPT("dom/nodes/Document-cloneNode-base-url.window.js", "blob: URL documents need a fetch (out of scope: network)", { timeout: 300 });
defineWPT("dom/nodes/live-collections-batched-mutations.window.js", PROXY_FREE);
defineWPT("dom/nodes/NodeList-live-mutations.window.js");
defineWPT("dom/nodes/ParentNode-querySelector-xml-capitalization.window.js");
defineWPT(
  "dom/nodes/Node-cloneNode-document-allow-declarative-shadow-roots.window.js",
  "document.write() into a cloned document with declarative shadow roots (parser/html area: no 'allow declarative shadow roots' flag)",
);
// Not registered: Document-base-url-not-live / Document-cloneNode-about-base-url* /
// Document-cloneNode-srcdoc-base-url (about:blank/srcdoc iframes snapshot their creator's base URL
// now, https://html.spec.whatwg.org/#concept-document-about-base-url, pinned in
// test/window/iframe.test.ts; these files still time out in the harness waiting on the iframes'
// load events); Node-appendChild-cereactions-vs-script (script execution);
// Document-createEvent-touchevent (events area).

// moveBefore (https://dom.spec.whatwg.org/#move): the subset that does not need layout,
// animations, iframes or the html agent's moving steps.
defineWPTDirectory(
  "dom/nodes/moveBefore",
  {
    "Node-moveBefore.html": IFRAMES,
    "moveBefore-id-map.html": "named access on the window for elements moved into a shadow root (window area)",
  },
  {},
);
defineWPT("dom/nodes/moveBefore/mutation-observer-moved-subtree.window.js");

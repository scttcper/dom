/**
 * Collections — web-platform-tests dom/collections, run unmodified through test/wpt/harness.ts.
 *
 * Spec: DOM Standard §4.2.10 "Old-style collections" — https://dom.spec.whatwg.org/#old-style-collections
 *   - HTMLCollection: https://dom.spec.whatwg.org/#interface-htmlcollection
 *   - NamedNodeMap: https://dom.spec.whatwg.org/#interface-namednodemap
 *   - DOMStringMap: https://html.spec.whatwg.org/#domstringmap
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/collections
 *
 * Known failures are the documented Proxy-free deviation: HTMLCollection / NamedNodeMap do not
 * expose named properties or own index properties (collections/indexed.ts explains why).
 */
import { defineWPTDirectory } from "../wpt/harness.ts";

const PROXY_FREE = "Proxy-free collections: no named properties / own index properties (deviation)";
defineWPTDirectory(
  "dom/collections",
  {
    "HTMLCollection-as-prototype.html": PROXY_FREE,
    "HTMLCollection-delete.html": PROXY_FREE,
    "HTMLCollection-own-props.html": PROXY_FREE,
    "HTMLCollection-supported-property-indices.html": PROXY_FREE,
    "HTMLCollection-supported-property-names.html": PROXY_FREE,
    "namednodemap-supported-property-names.html": PROXY_FREE,
  },
  { "childnodes-messagechannel-crash.html": "crash test needs MessageChannel + navigation" },
);

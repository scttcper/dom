/**
 * Downstream repro (Sentry: every DOMPurify call — core/markdown marked.tsx sanitize, Markdown
 * raw HTML, autofix feedback, ~60 tests in the components preset fail with
 * "TypeError: String.prototype.toLowerCase called on null or undefined").
 *
 * DOMPurify captures DOM accessors once, from the interface prototypes, so that page scripts
 * cannot clobber them (purify.ts):
 *   const getNodeName = lookupGetter(Node.prototype, 'nodeName');
 *   const getNodeType = lookupGetter(Node.prototype, 'nodeType');
 *   ... transformCaseFunc(getNodeName(currentNode))
 * `lookupGetter` walks the prototype chain of Node.prototype for an accessor and otherwise
 * returns `() => null`. @ctrl/dom declares `nodeName` as a TypeScript `abstract get` on Node, so
 * there is no accessor on Node.prototype at runtime (only on Element/Text/... subclasses), and
 * DOMPurify reads `null` for every node.
 *
 * Spec: https://dom.spec.whatwg.org/#interface-node (readonly attribute DOMString nodeName;
 *       WebIDL attributes are accessors on the interface prototype object:
 *       https://webidl.spec.whatwg.org/#es-attributes)
 * Owner: dom-core.
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

// DOMPurify's utils.ts lookupGetter (Apache-2.0 / MPL-2.0), trimmed.
function lookupGetter(object: object | null, prop: string): (node: unknown) => unknown {
  while (object !== null) {
    const desc = Object.getOwnPropertyDescriptor(object, prop);
    if (desc)
      return desc.get
        ? (n) => desc.get!.call(n)
        : typeof desc.value === "function"
          ? (n) => desc.value.call(n)
          : () => null;
    object = Object.getPrototypeOf(object);
  }
  return () => null;
}

const NODE_ATTRIBUTES = [
  "nodeType",
  "nodeName",
  "baseURI",
  "isConnected",
  "ownerDocument",
  "parentNode",
  "parentElement",
  "childNodes",
  "firstChild",
  "lastChild",
  "previousSibling",
  "nextSibling",
  "nodeValue",
  "textContent",
];

differential("Node.prototype attribute accessors (DOMPurify lookupGetter)", (make) => {
  test("nodeName read through Node.prototype's accessor", () => {
    const window = make();
    const el = window.document.createElement("div");
    const getNodeName = lookupGetter(window.Node.prototype, "nodeName");
    expect(getNodeName(el)).toBe("DIV");
    expect(getNodeName(window.document.createTextNode("x"))).toBe("#text");
  });

  test("every Node attribute is an accessor on Node.prototype", () => {
    const window = make();
    const missing = NODE_ATTRIBUTES.filter(
      (name) => typeof Object.getOwnPropertyDescriptor(window.Node.prototype, name)?.get !== "function",
    );
    expect(missing).toEqual([]);
  });
});

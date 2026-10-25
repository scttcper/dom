/**
 * Downstream repro (Base UI ctrl-dom: most stock-Testing-Library failures; ctrl-dom-full: every
 * `toHaveAccessibleName` failure from @mui/internal-test-utils' chai plugin).
 *
 * WebIDL constants are defined on BOTH the interface object and the interface prototype
 * object, so `node.ELEMENT_NODE === 1` on every node. dom-accessibility-api (used by stock
 * @testing-library/dom's *ByRole name matching and by @mui/internal-test-utils) tests
 * `node.nodeType === node.ELEMENT_NODE`; with the constant missing on instances every
 * accessible name computes to "" and getByRole("button", { name }) finds nothing.
 *
 * Spec: https://webidl.spec.whatwg.org/#es-constants ("the constant is exposed on the
 *       interface object and on the interface prototype object")
 *       https://dom.spec.whatwg.org/#interface-node
 * Owner: dom-core (packages/dom/src/nodes/Node.ts: constants are `static` only).
 */
import { expect, test } from "vitest";
import { differential, requireFromReact } from "./engines.ts";

const NODE_CONSTANTS = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
  DOCUMENT_FRAGMENT_NODE: 11,
  DOCUMENT_POSITION_CONTAINED_BY: 16,
};

differential("Node constants are exposed on the prototype", (make) => {
  test.each(Object.entries(NODE_CONSTANTS))("node.%s === %d on instances", (name, value) => {
    const window = make();
    const span = window.document.createElement("span");
    expect(span[name]).toBe(value);
    expect(window.Node.prototype[name]).toBe(value);
  });

  test("stock dom-accessibility-api computes aria-label / content names", () => {
    const window = make();
    const { computeAccessibleName } = requireFromReact(
      "dom-accessibility-api",
    ) as typeof import("dom-accessibility-api");
    window.document.body.innerHTML = '<span role="checkbox" aria-label="lease.pdf"></span><button>Submit</button>';
    const [checkbox, button] = window.document.body.children;
    expect(computeAccessibleName(checkbox)).toBe("lease.pdf");
    expect(computeAccessibleName(button)).toBe("Submit");
  });
});

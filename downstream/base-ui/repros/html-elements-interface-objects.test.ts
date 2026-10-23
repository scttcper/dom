/**
 * Downstream repro (Base UI: blocks ~all rtd tests). Every HTML element interface must be an
 * interface object on the global. react-dom's commit phase runs
 * `element instanceof window.HTMLIFrameElement` (getActiveElementDeep) on every commit, so a
 * missing HTMLIFrameElement throws "Right-hand side of 'instanceof' is not an object".
 *
 * Spec: https://html.spec.whatwg.org/#htmliframeelement ([Exposed=Window] interface)
 *       https://webidl.spec.whatwg.org/#es-interfaces
 * Owner: html-elements (export the element classes from packages/dom/src/index.ts so
 * window/interfaces.ts exposes them).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

const INTERFACES = [
  "HTMLIFrameElement",
  "HTMLDivElement",
  "HTMLSpanElement",
  "HTMLAnchorElement",
  "HTMLImageElement",
  "HTMLDialogElement",
  "HTMLTemplateElement",
  "HTMLUnknownElement",
];

differential("HTML element interface objects are exposed on window", (make) => {
  test.each(INTERFACES)("window.%s is a function and matches createElement()", (name) => {
    const window = make();
    expect(typeof window[name]).toBe("function");
  });

  test("react-dom getActiveElementDeep: activeElement instanceof window.HTMLIFrameElement does not throw", () => {
    const window = make();
    expect(() => window.document.activeElement instanceof window.HTMLIFrameElement).not.toThrow();
  });
});

/**
 * Static NodeList with a tampered `length` getter — web-platform-tests
 * dom/nodes/NodeList-static-length-getter-tampered-*. These tests redefine properties on the
 * shared NodeList.prototype, so they run in their own (isolated) test file.
 *
 * Spec: https://dom.spec.whatwg.org/#interface-nodelist and
 * https://webidl.spec.whatwg.org/#es-iterable (Array.prototype iteration methods)
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/dom/nodes
 */
import { defineWPT, wptFiles } from "../wpt/harness.ts";

for (const f of wptFiles("dom/nodes")) {
  if (f.includes("NodeList-static-length-getter-tampered-") && !f.includes("indexOf")) defineWPT(f);
}

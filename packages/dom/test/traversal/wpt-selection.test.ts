/**
 * Selection — web-platform-tests selection/, run unmodified through test/wpt/harness.ts.
 *
 * Spec: Selection API — https://w3c.github.io/selection-api/
 *   - Selection interface: https://w3c.github.io/selection-api/#selection-interface
 *   - addRange / removeRange / removeAllRanges: https://w3c.github.io/selection-api/#dom-selection-addrange
 *   - collapse / extend / setBaseAndExtent / selectAllChildren:
 *     https://w3c.github.io/selection-api/#dom-selection-collapse
 *   - Document.getSelection: https://w3c.github.io/selection-api/#dom-document-getselection
 *   - selectionchange event: https://w3c.github.io/selection-api/#selectionchange-event
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/selection
 *
 * Not vendored (see the traversal-parsing survey report): tests that need layout or real input
 * (bidi/, caret/, drag-*, canvas-*, modify-by-word, test_driver.Actions), contenteditable
 * editing and execCommand, text-control selectionchange (forms area), document.open(),
 * user-select / rendered-text toString, and the shadow-dom/ composed-range tests.
 */
import { describe } from "vitest";
import { defineWPTDirectory } from "../wpt/harness.ts";

describe("Selection API — https://w3c.github.io/selection-api/#selection-interface", () => {
  defineWPTDirectory("selection", {}, {});
});

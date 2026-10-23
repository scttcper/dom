/**
 * HTML "Semantics, structure, and APIs of HTML documents" and "User interaction / editing" —
 * web-platform-tests html/dom and html/editing, run unmodified through test/wpt/harness.ts.
 *
 * Specs:
 * - HTML §3.1.4 DOM tree accessors (document.body/head/title, getElementsByName, collections):
 *   https://html.spec.whatwg.org/#dom-tree-accessors
 * - HTML §3.1.3 Resource metadata management (compatMode, cookie):
 *   https://html.spec.whatwg.org/#resource-metadata-management
 * - HTML §3.2.6 Global attributes (dataset, dir, lang, translate, id):
 *   https://html.spec.whatwg.org/#global-attributes
 * - HTML §3.2.7 The innerText and outerText properties:
 *   https://html.spec.whatwg.org/#the-innertext-idl-attribute
 * - HTML §2.6.1 Reflecting content attributes in IDL attributes (Element / FrozenArray<Element>):
 *   https://html.spec.whatwg.org/#reflecting-content-attributes-in-idl-attributes
 * - WAI-ARIA 1.3 ARIAMixin: https://w3c.github.io/aria/#ARIAMixin
 * - HTML §6.6.3 accessKeyLabel: https://html.spec.whatwg.org/#dom-accesskeylabel
 * - HTML §6.2 The hidden attribute: https://html.spec.whatwg.org/#the-hidden-attribute
 * - HTML §6.8 Editing (contenteditable, autocapitalize, autocorrect, spellcheck,
 *   writingsuggestions): https://html.spec.whatwg.org/#editing-2
 * - HTML §6.11 Drag and drop (draggable, DragEvent): https://html.spec.whatwg.org/#dnd
 *
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/dom and
 * https://github.com/web-platform-tests/wpt/tree/master/html/editing (vendored from WPT
 * d9c2fe5 into test/wpt/fixtures; known failures in test/wpt/expectations/html-dom.json).
 * The reflection-*.html suites are covered by test/html/reflection.wpt.test.ts.
 */
import { describe } from "vitest";
import { defineWPT, defineWPTDirectory } from "../wpt/harness.ts";

const DIRECTIONALITY = "directionality (`:dir()`) lives in selectors/state.ts: no flat-tree/slot propagation, no non-HTML dir=auto, bdi defaults, input types";
const HIDDEN_GETTER = "the hidden getter returns true for until-found, like jsdom/happy-dom (docs/deviations.md)";
const DATASET = "DOMStringMap edge cases (collections area) and dataset on non-HTML/SVG/MathML elements (nodes/Element.ts)";

describe("HTML §3.1.4 DOM tree accessors (https://html.spec.whatwg.org/#dom-tree-accessors)", () => {
  defineWPTDirectory(
    "html/dom/documents/dom-tree-accessors",
    {
      "document.forms.html": "document.forms own-property iteration (collections area)",
      "document.images.html": "document.images has no named properties (`images.id`), only the Proxy-wrapped document.forms does (nodes/Document.ts)",
    },
    {},
  );
  defineWPTDirectory("html/dom/documents/dom-tree-accessors/document.getElementsByName", {}, {});
});

describe("HTML §3.1.3 Resource metadata management (https://html.spec.whatwg.org/#resource-metadata-management)", () => {
  defineWPTDirectory(
    "html/dom/documents/resource-metadata-management",
    { "document-cookie.html": "cookie values containing U+0000 are not rejected (window area cookie jar)" },
    {},
  );
});

describe("HTML §3.2.6 Global attributes (https://html.spec.whatwg.org/#global-attributes)", () => {
  defineWPTDirectory(
    "html/dom/elements/global-attributes",
    {
      "custom-attrs.html": DATASET,
      "dataset-delete.html": DATASET,
      "dataset-prototype.html": DATASET,
      "dataset.html": DATASET,
      "dir-auto-div-append-child.html": DIRECTIONALITY,
      "dir-bdi-script.html": "getComputedStyle().direction does not follow the bdi element's auto directionality (css area)",
      "dir-slots-directionality.html": DIRECTIONALITY,
    },
    {},
  );
  defineWPT("html/dom/elements/global-attributes/dataset-binding.window.js");
  defineWPT("html/dom/elements/global-attributes/dir-assorted.window.js", DIRECTIONALITY);
  defineWPT("html/dom/elements/global-attributes/dir-auto-dynamic-changes.window.js", DIRECTIONALITY);
  defineWPT("html/dom/elements/global-attributes/dir-auto-form-associated.window.js", DIRECTIONALITY);
  defineWPT("html/dom/elements/global-attributes/lang-attribute-shadow.window.js");
  defineWPT("html/dom/elements/global-attributes/lang-attribute.window.js");
  defineWPTDirectory("html/dom/elements/elements-in-the-dom", {}, {});
  defineWPT("html/dom/elements/name-content-attribute-and-property.html");
});

describe("HTML §3.2.7 innerText / outerText (https://html.spec.whatwg.org/#the-innertext-idl-attribute)", () => {
  defineWPTDirectory(
    "html/dom/elements/the-innertext-and-outertext-properties",
    {
      "getter.html":
        "no ::first-line/::first-letter styles, visibility does not suppress block line breaks, the parser drops text foster-parented out of a table, noscript is parsed as markup (scripting disabled)",
    },
    { "innertext-with-white-spaces.html": "meaningful only with its ?white-space= variants, registered below" },
  );
  for (const ws of ["normal", "pre", "pre-line", "pre-wrap"]) {
    for (const ce of ["", "&contenteditable=true", "&contenteditable=plaintext-only"]) {
      defineWPT(`html/dom/elements/the-innertext-and-outertext-properties/innertext-with-white-spaces.html?white-space=${ws}${ce}`);
    }
  }
  defineWPT("html/dom/elements/the-innertext-and-outertext-properties/multiple-text-nodes.window.js");
});

describe("ARIAMixin reflection, accessKeyLabel and historical members (https://w3c.github.io/aria/#ARIAMixin)", () => {
  defineWPTDirectory("html/dom", { "historical.html": "document.all (HTMLAllCollection) is not implemented" }, {});
  defineWPT("html/dom/self-origin.any.js");
});

describe("HTML §6.8 Editing (https://html.spec.whatwg.org/#editing-2)", () => {
  defineWPTDirectory("html/editing/editing-0/autocapitalization", {}, {});
  defineWPTDirectory("html/editing/editing-0/autocorrection", {}, {});
  defineWPTDirectory("html/editing/editing-0/contenteditable", {}, {});
  defineWPTDirectory("html/editing/editing-0/spelling-and-grammar-checking", {}, {});
  defineWPTDirectory("html/editing/editing-0/writing-suggestions", {}, {});
  defineWPTDirectory("html/editing/the-hidden-attribute", { "hidden-idl.html": HIDDEN_GETTER, "hidden-until-found-idl.html": HIDDEN_GETTER }, {});
  defineWPTDirectory("html/editing/activation", {}, {});
});

describe("HTML §6.11 Drag and drop (https://html.spec.whatwg.org/#dnd)", () => {
  defineWPTDirectory("html/editing/dnd/dom", {}, {});
  defineWPTDirectory("html/editing/dnd/the-draggable-attribute", {}, {});
  defineWPTDirectory("html/editing/dnd/synthetic", { "001.html": "DragEvent is not an own property of window, and its dataTransfer init member accepts any object (events area, docs/deviations.md)" }, {});
});

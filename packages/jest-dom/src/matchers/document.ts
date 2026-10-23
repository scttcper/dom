// Ports of @testing-library/jest-dom@7.0.1:
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-in-the-document.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-in-the-dom.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-empty-dom-element.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-empty.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-contain-element.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-contain-html.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-focus.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-appear-before.js

import { checkHtmlElement, deprecate, type DOMNode, type MatcherContext, type MatcherResult } from "../utils.ts";

export function toBeInTheDocument(this: MatcherContext, element: DOMNode): MatcherResult {
  if (element !== null || !this.isNot) {
    checkHtmlElement(element, toBeInTheDocument, this);
  }

  const pass = element === null ? false : element.ownerDocument === element.getRootNode({ composed: true });

  const errorFound = () => {
    return `expected document not to contain element, found ${this.utils.stringify(element.cloneNode(true))} instead`;
  };
  const errorNotFound = () => {
    return `element could not be found in the document`;
  };

  return {
    pass,
    message: () => {
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeInTheDocument`, "element", ""),
        "",
        this.utils.RECEIVED_COLOR(this.isNot ? errorFound() : errorNotFound()),
      ].join("\n");
    },
  };
}

export function toBeInTheDOM(this: MatcherContext, element: DOMNode, container?: DOMNode): MatcherResult {
  deprecate(
    "toBeInTheDOM",
    "Please use toBeInTheDocument for searching the entire document and toContainElement for searching a specific container.",
  );

  if (element) {
    checkHtmlElement(element, toBeInTheDOM, this);
  }

  if (container) {
    checkHtmlElement(container, toBeInTheDOM, this);
  }

  return {
    pass: container ? container.contains(element) : !!element,
    message: () => {
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeInTheDOM`, "element", ""),
        "",
        "Received:",
        `  ${this.utils.printReceived(element ? element.cloneNode(false) : element)}`,
      ].join("\n");
    },
  };
}

/**
 * Whether an element has no child nodes other than comments.
 * (Upstream compares nodeType to 8 instead of Node.COMMENT_NODE because of
 * https://github.com/jsdom/jsdom/issues/2220.)
 */
function isEmptyElement(element: DOMNode): boolean {
  for (let child = element.firstChild; child !== null; child = child.nextSibling) {
    if (child.nodeType !== 8) return false;
  }
  return true;
}

export function toBeEmptyDOMElement(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeEmptyDOMElement, this);

  return {
    pass: isEmptyElement(element),
    message: () => {
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeEmptyDOMElement`, "element", ""),
        "",
        "Received:",
        `  ${this.utils.printReceived(element.innerHTML)}`,
      ].join("\n");
    },
  };
}

export function toBeEmpty(this: MatcherContext, element: DOMNode): MatcherResult {
  deprecate("toBeEmpty", "Please use instead toBeEmptyDOMElement for finding empty nodes in the DOM.");
  checkHtmlElement(element, toBeEmpty, this);

  return {
    pass: element.innerHTML === "",
    message: () => {
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeEmpty`, "element", ""),
        "",
        "Received:",
        `  ${this.utils.printReceived(element.innerHTML)}`,
      ].join("\n");
    },
  };
}

export function toContainElement(this: MatcherContext, container: DOMNode, element: DOMNode): MatcherResult {
  checkHtmlElement(container, toContainElement, this);

  if (element !== null) {
    checkHtmlElement(element, toContainElement, this);
  }

  return {
    pass: container.contains(element),
    message: () => {
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toContainElement`, "element", "element"),
        "",
        // The trailing newline + 8 spaces come from upstream's template literal.
        this.utils.RECEIVED_COLOR(`${this.utils.stringify(container.cloneNode(false))} ${
          this.isNot ? "contains:" : "does not contain:"
        } ${this.utils.stringify(element ? element.cloneNode(false) : element)}
        `),
      ].join("\n");
    },
  };
}

function getNormalizedHtml(container: DOMNode, htmlText: string): string {
  const div = container.ownerDocument.createElement("div");
  div.innerHTML = htmlText;
  return div.innerHTML;
}

export function toContainHTML(this: MatcherContext, container: DOMNode, htmlText: string): MatcherResult {
  checkHtmlElement(container, toContainHTML, this);

  if (typeof htmlText !== "string") {
    throw new Error(`.toContainHTML() expects a string value, got ${htmlText}`);
  }

  return {
    pass: container.outerHTML.includes(getNormalizedHtml(container, htmlText)),
    message: () => {
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toContainHTML`, "element", ""),
        "Expected:",
        `  ${this.utils.EXPECTED_COLOR(htmlText)}`,
        "Received:",
        `  ${this.utils.printReceived(container.cloneNode(true))}`,
      ].join("\n");
    },
  };
}

export function toHaveFocus(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toHaveFocus, this);

  return {
    pass: element.ownerDocument.activeElement === element,
    message: () => {
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveFocus`, "element", ""),
        "",
        ...(this.isNot
          ? ["Received element is focused:", `  ${this.utils.printReceived(element)}`]
          : [
              "Expected element with focus:",
              `  ${this.utils.printExpected(element)}`,
              "Received element with focus:",
              `  ${this.utils.printReceived(element.ownerDocument.activeElement)}`,
            ]),
      ].join("\n");
    },
  };
}

// https://dom.spec.whatwg.org/#dom-node-document_position_disconnected
const DOCUMENT_POSITION_DISCONNECTED = 0x01;
const DOCUMENT_POSITION_PRECEDING = 0x02;
const DOCUMENT_POSITION_FOLLOWING = 0x04;
const DOCUMENT_POSITION_CONTAINS = 0x08;
const DOCUMENT_POSITION_CONTAINED_BY = 0x10;
const DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 0x20;

const DOCUMENT_POSITIONS_STRINGS: Record<number, string> = {
  [DOCUMENT_POSITION_DISCONNECTED]: "Node.DOCUMENT_POSITION_DISCONNECTED",
  [DOCUMENT_POSITION_PRECEDING]: "Node.DOCUMENT_POSITION_PRECEDING",
  [DOCUMENT_POSITION_FOLLOWING]: "Node.DOCUMENT_POSITION_FOLLOWING",
  [DOCUMENT_POSITION_CONTAINS]: "Node.DOCUMENT_POSITION_CONTAINS",
  [DOCUMENT_POSITION_CONTAINED_BY]: "Node.DOCUMENT_POSITION_CONTAINED_BY",
  [DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC]: "Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC",
};

function makeDocumentPositionErrorString(documentPosition: number): string {
  if (documentPosition in DOCUMENT_POSITIONS_STRINGS) {
    return `${DOCUMENT_POSITIONS_STRINGS[documentPosition]} (${documentPosition})`;
  }
  return `Unknown document position (${documentPosition})`;
}

function checkToAppear(context: MatcherContext, methodName: string, targetDocumentPosition: number, element: DOMNode, secondElement: DOMNode): MatcherResult {
  // Upstream passes `toAppearBefore` as the matcher function for both matchers.
  checkHtmlElement(element, toAppearBefore, context);
  checkHtmlElement(secondElement, toAppearBefore, context);

  const documentPosition = element.compareDocumentPosition(secondElement);
  const pass = documentPosition === targetDocumentPosition;

  return {
    pass,
    message: () => {
      return [
        context.utils.matcherHint(`${context.isNot ? ".not" : ""}.${methodName}`, "element", "secondElement"),
        "",
        `Received: ${makeDocumentPositionErrorString(documentPosition)}`,
      ].join("\n");
    },
  };
}

export function toAppearBefore(this: MatcherContext, element: DOMNode, secondElement: DOMNode): MatcherResult {
  return checkToAppear(this, "toAppearBefore", DOCUMENT_POSITION_FOLLOWING, element, secondElement);
}

export function toAppearAfter(this: MatcherContext, element: DOMNode, secondElement: DOMNode): MatcherResult {
  return checkToAppear(this, "toAppearAfter", DOCUMENT_POSITION_PRECEDING, element, secondElement);
}

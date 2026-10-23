// Ports of @testing-library/jest-dom@7.0.1:
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-text-content.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-attribute.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-class.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-value.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-display-value.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-form-values.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-selection.js

import {
  checkHtmlElement,
  checkNode,
  compareAsSet,
  cssEscape,
  getMessage,
  getSingleElementValue,
  matches,
  normalize,
  type DOMNode,
  type MatcherContext,
  type MatcherResult,
} from "../utils.ts";

// --- toHaveTextContent ------------------------------------------------------------------

export function toHaveTextContent(
  this: MatcherContext,
  node: DOMNode,
  checkWith: string | RegExp,
  options: { normalizeWhitespace: boolean } = { normalizeWhitespace: true },
): MatcherResult {
  checkNode(node, toHaveTextContent, this);

  const textContent: string = options.normalizeWhitespace
    ? normalize(node.textContent)
    : node.textContent.replace(/ /g, " "); // Replace &nbsp; with normal spaces

  const checkingWithEmptyString = textContent !== "" && checkWith === "";

  return {
    pass: !checkingWithEmptyString && matches(textContent, checkWith),
    message: () => {
      const to = this.isNot ? "not to" : "to";
      return getMessage(
        this,
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveTextContent`, "element", ""),
        checkingWithEmptyString ? `Checking with empty string will always match, use .toBeEmptyDOMElement() instead` : `Expected element ${to} have text content`,
        checkWith,
        "Received",
        textContent,
      );
    },
  };
}

// --- toHaveAttribute --------------------------------------------------------------------

function printAttribute(stringify: (v: unknown) => string, name: string, value: unknown): string {
  return value === undefined ? name : `${name}=${stringify(value)}`;
}

function getAttributeComment(stringify: (v: unknown) => string, name: string, value: unknown): string {
  return value === undefined ? `element.hasAttribute(${stringify(name)})` : `element.getAttribute(${stringify(name)}) === ${stringify(value)}`;
}

export function toHaveAttribute(this: MatcherContext, htmlElement: DOMNode, name: string, expectedValue?: unknown): MatcherResult {
  checkHtmlElement(htmlElement, toHaveAttribute, this);
  const isExpectedValuePresent = expectedValue !== undefined;
  const hasAttribute = htmlElement.hasAttribute(name);
  const receivedValue = htmlElement.getAttribute(name);
  return {
    pass: isExpectedValuePresent ? hasAttribute && this.equals(receivedValue, expectedValue) : hasAttribute,
    message: () => {
      const to = this.isNot ? "not to" : "to";
      const receivedAttribute = hasAttribute ? printAttribute(this.utils.stringify, name, receivedValue) : null;
      const matcher = this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveAttribute`, "element", this.utils.printExpected(name), {
        secondArgument: isExpectedValuePresent ? this.utils.printExpected(expectedValue) : undefined,
        comment: getAttributeComment(this.utils.stringify, name, expectedValue),
      });
      return getMessage(this, matcher, `Expected the element ${to} have attribute`, printAttribute(this.utils.stringify, name, expectedValue), "Received", receivedAttribute);
    },
  };
}

// --- toHaveClass ------------------------------------------------------------------------

type ClassArg = string | RegExp | null | undefined | false;

function getExpectedClassNamesAndOptions(params: unknown[]): { expectedClassNames: ClassArg[]; options: { exact?: boolean } } {
  const lastParam = params.pop();
  let expectedClassNames: ClassArg[];
  let options: { exact?: boolean };

  if (typeof lastParam === "object" && !(lastParam instanceof RegExp)) {
    expectedClassNames = params as ClassArg[];
    options = lastParam as { exact?: boolean };
  } else {
    expectedClassNames = (params as ClassArg[]).concat(lastParam as ClassArg);
    options = { exact: false };
  }
  return { expectedClassNames, options };
}

function splitClassNames(str: string | null | undefined | false): string[] {
  if (!str) return [];
  return str.split(/\s+/).filter((s) => s.length > 0);
}

function isSubset(subset: Array<string | RegExp>, superset: string[]): boolean {
  return subset.every((strOrRegexp) =>
    typeof strOrRegexp === "string" ? superset.includes(strOrRegexp) : superset.some((className) => strOrRegexp.test(className)),
  );
}

export function toHaveClass(this: MatcherContext, htmlElement: DOMNode, ...params: unknown[]): MatcherResult {
  checkHtmlElement(htmlElement, toHaveClass, this);
  const { expectedClassNames, options } = getExpectedClassNamesAndOptions(params);

  const received = splitClassNames(htmlElement.getAttribute("class"));
  const expected = expectedClassNames.reduce<Array<string | RegExp>>(
    (acc, className) => acc.concat(typeof className === "string" || !className ? splitClassNames(className as string) : className),
    [],
  );

  const hasRegExp = expected.some((className) => className instanceof RegExp);
  if (options.exact && hasRegExp) {
    throw new Error("Exact option does not support RegExp expected class names");
  }

  if (options.exact) {
    return {
      pass: isSubset(expected, received) && expected.length === received.length,
      message: () => {
        const to = this.isNot ? "not to" : "to";
        return getMessage(
          this,
          this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveClass`, "element", this.utils.printExpected(expected.join(" "))),
          `Expected the element ${to} have EXACTLY defined classes`,
          expected.join(" "),
          "Received",
          received.join(" "),
        );
      },
    };
  }

  return expected.length > 0
    ? {
        pass: isSubset(expected, received),
        message: () => {
          const to = this.isNot ? "not to" : "to";
          return getMessage(
            this,
            this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveClass`, "element", this.utils.printExpected(expected.join(" "))),
            `Expected the element ${to} have class`,
            expected.join(" "),
            "Received",
            received.join(" "),
          );
        },
      }
    : {
        pass: this.isNot ? received.length > 0 : false,
        message: () =>
          this.isNot
            ? getMessage(this, this.utils.matcherHint(".not.toHaveClass", "element", ""), "Expected the element to have classes", "(none)", "Received", received.join(" "))
            : [this.utils.matcherHint(`.toHaveClass`, "element"), "At least one expected class must be provided."].join("\n"),
      };
}

// --- toHaveValue ------------------------------------------------------------------------

export function toHaveValue(this: MatcherContext, htmlElement: DOMNode, expectedValue?: unknown): MatcherResult {
  checkHtmlElement(htmlElement, toHaveValue, this);

  if (htmlElement.tagName.toLowerCase() === "input" && ["checkbox", "radio"].includes(htmlElement.type)) {
    throw new Error(
      "input with type=checkbox or type=radio cannot be used with .toHaveValue(). Use .toBeChecked() for type=checkbox or .toHaveFormValues() instead",
    );
  }

  const receivedValue = getSingleElementValue(htmlElement);
  const expectsValue = expectedValue !== undefined;

  let expectedTypedValue = expectedValue;
  let receivedTypedValue = receivedValue;
  // eslint-disable-next-line eqeqeq -- upstream intentionally uses loose equality here
  if (expectedValue == receivedValue && expectedValue !== receivedValue) {
    expectedTypedValue = `${expectedValue} (${typeof expectedValue})`;
    receivedTypedValue = `${receivedValue} (${typeof receivedValue})`;
  }

  return {
    pass: expectsValue ? compareAsSet(receivedValue, expectedValue) : Boolean(receivedValue),
    message: () => {
      const to = this.isNot ? "not to" : "to";
      const matcher = this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveValue`, "element", expectedValue as string);
      return getMessage(this, matcher, `Expected the element ${to} have value`, expectsValue ? expectedTypedValue : "(any)", "Received", receivedTypedValue);
    },
  };
}

// --- toHaveDisplayValue -----------------------------------------------------------------

function getValues(tagName: string, htmlElement: DOMNode): string[] {
  if (tagName !== "select") return [htmlElement.value];
  const values: string[] = [];
  // Upstream iterates `Array.from(select)`, i.e. the select's indexed options; `options` is
  // the same list (https://html.spec.whatwg.org/#dom-select-item) without the indexed-getter
  // dependency.
  const options = htmlElement.options;
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (option.selected) values.push(option.textContent);
  }
  return values;
}

export function toHaveDisplayValue(this: MatcherContext, htmlElement: DOMNode, expectedValue: unknown): MatcherResult {
  checkHtmlElement(htmlElement, toHaveDisplayValue, this);
  const tagName = htmlElement.tagName.toLowerCase();

  if (!["select", "input", "textarea"].includes(tagName)) {
    throw new Error(".toHaveDisplayValue() currently supports only input, textarea or select elements, try with another matcher instead.");
  }

  if (tagName === "input" && ["radio", "checkbox"].includes(htmlElement.type)) {
    throw new Error(`.toHaveDisplayValue() currently does not support input[type="${htmlElement.type}"], try with another matcher instead.`);
  }

  const values = getValues(tagName, htmlElement);
  const expectedValues: unknown[] = expectedValue instanceof Array ? expectedValue : [expectedValue];
  const numberOfMatchesWithValues = expectedValues.filter((expected) =>
    values.some((value) => (expected instanceof RegExp ? expected.test(value) : this.equals(value, String(expected)))),
  ).length;

  const matchedWithAllValues = numberOfMatchesWithValues === values.length;
  const matchedWithAllExpectedValues = numberOfMatchesWithValues === expectedValues.length;

  return {
    pass: matchedWithAllValues && matchedWithAllExpectedValues,
    message: () =>
      getMessage(
        this,
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveDisplayValue`, "element", ""),
        `Expected element ${this.isNot ? "not " : ""}to have display value`,
        expectedValue,
        "Received",
        values,
      ),
  };
}

// --- toHaveFormValues -------------------------------------------------------------------

// Returns the combined value of several elements that have the same name
// e.g. radio buttons or groups of checkboxes
function getMultiElementValue(elements: DOMNode[]): unknown {
  const types = [...new Set(elements.map((element) => element.type))];
  if (types.length !== 1) {
    throw new Error("Multiple form elements with the same name must be of the same type");
  }
  switch (types[0]) {
    case "radio": {
      const theChosenOne = elements.find((radio) => radio.checked);
      return theChosenOne ? theChosenOne.value : undefined;
    }
    case "checkbox":
      return elements.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
    default:
      // NOTE: Not even sure this is a valid use case, but just in case...
      return elements.map((element) => element.value);
  }
}

function getFormValue(container: DOMNode, name: string): unknown {
  const elements: DOMNode[] = [...container.querySelectorAll(`[name="${cssEscape(name)}"]`)];
  if (elements.length === 0) {
    return undefined; // shouldn't happen, but just in case
  }
  switch (elements.length) {
    case 1:
      return getSingleElementValue(elements[0]);
    default:
      return getMultiElementValue(elements);
  }
}

// Strips the `[]` suffix off a form value name
function getPureName(name: string): string {
  return /\[\]$/.test(name) ? name.slice(0, -2) : name;
}

function getAllFormValues(container: DOMNode): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const element of Array.from(container.elements as ArrayLike<DOMNode>)) {
    const name = element.name;
    values[getPureName(name)] = getFormValue(container, name);
  }
  return values;
}

export function toHaveFormValues(this: MatcherContext, formElement: DOMNode, expectedValues: Record<string, unknown>): MatcherResult {
  checkHtmlElement(formElement, toHaveFormValues, this);
  if (!formElement.elements) {
    // TODO: Change condition to use instanceof against the appropriate element classes instead
    throw new Error("toHaveFormValues must be called on a form or a fieldset");
  }
  const formValues = getAllFormValues(formElement);
  return {
    pass: Object.entries(expectedValues).every(([name, expectedValue]) => compareAsSet(formValues[name], expectedValue)),
    message: () => {
      const to = this.isNot ? "not to" : "to";
      const matcher = `${this.isNot ? ".not" : ""}.toHaveFormValues`;
      const commonKeyValues: Record<string, unknown> = {};
      for (const key of Object.keys(formValues)) {
        if (Object.prototype.hasOwnProperty.call(expectedValues, key)) commonKeyValues[key] = formValues[key];
      }
      return [this.utils.matcherHint(matcher, "element", ""), `Expected the element ${to} have form values`, this.utils.diff(expectedValues, commonKeyValues)].join(
        "\n\n",
      );
    },
  };
}

// --- toHaveSelection --------------------------------------------------------------------

/** Returns the selection from the element. */
function getSelection(element: DOMNode): string {
  const selection = element.ownerDocument.getSelection();

  if (["input", "textarea"].includes(element.tagName.toLowerCase())) {
    if (["radio", "checkbox"].includes(element.type)) return "";
    return element.value.toString().substring(element.selectionStart, element.selectionEnd);
  }

  if (selection.anchorNode === null || selection.focusNode === null) {
    // No selection
    return "";
  }

  const originalRange = selection.getRangeAt(0);
  const temporaryRange = element.ownerDocument.createRange();

  if (selection.containsNode(element, false)) {
    // Whole element is inside selection
    temporaryRange.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(temporaryRange);
  } else if (element.contains(selection.anchorNode) && element.contains(selection.focusNode)) {
    // Element contains selection, nothing to do
  } else {
    // Element is partially selected
    const selectionStartsWithinElement = element === originalRange.startContainer || element.contains(originalRange.startContainer);
    const selectionEndsWithinElement = element === originalRange.endContainer || element.contains(originalRange.endContainer);
    selection.removeAllRanges();

    if (selectionStartsWithinElement || selectionEndsWithinElement) {
      temporaryRange.selectNodeContents(element);

      if (selectionStartsWithinElement) {
        temporaryRange.setStart(originalRange.startContainer, originalRange.startOffset);
      }
      if (selectionEndsWithinElement) {
        temporaryRange.setEnd(originalRange.endContainer, originalRange.endOffset);
      }

      selection.addRange(temporaryRange);
    }
  }

  const result = selection.toString();

  selection.removeAllRanges();
  selection.addRange(originalRange);

  return result;
}

export function toHaveSelection(this: MatcherContext, htmlElement: DOMNode, expectedSelection?: string): MatcherResult {
  checkHtmlElement(htmlElement, toHaveSelection, this);

  const expectsSelection = expectedSelection !== undefined;

  if (expectsSelection && typeof expectedSelection !== "string") {
    throw new Error(`expected selection must be a string or undefined`);
  }

  const receivedSelection = getSelection(htmlElement);

  return {
    pass: expectsSelection ? compareAsSet(receivedSelection, expectedSelection) : Boolean(receivedSelection),
    message: () => {
      const to = this.isNot ? "not to" : "to";
      const matcher = this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveSelection`, "element", expectedSelection);
      return getMessage(this, matcher, `Expected the element ${to} have selection`, expectsSelection ? expectedSelection : "(any)", "Received", receivedSelection);
    },
  };
}

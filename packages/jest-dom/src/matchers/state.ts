// Ports of @testing-library/jest-dom@7.0.1:
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-checked.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-partially-checked.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-pressed.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-partially-pressed.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-disabled.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-required.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-invalid.js
//
// These keep jest-dom's own (non-spec) definitions on purpose — e.g. toBeDisabled treats a
// disabled custom element or a disabled <button> as disabling its descendants — because the
// pass/fail result is the contract. They only read attributes and walk parents, which is
// already cheap on @ctrl/dom.

import { roles } from "@ctrl/dom/aria";
import {
  checkHtmlElement,
  getMessage,
  getTag,
  toSentence,
  type DOMNode,
  type MatcherContext,
  type MatcherResult,
} from "../utils.ts";

// Roles whose aria-query definition has an `aria-checked` prop, in `roles.keys()` order —
// upstream's `roles.keys().filter(roleSupportsChecked)`, over @ctrl/dom/aria's aria-query data:
// checkbox, menuitemcheckbox, menuitemradio, option, radio, switch, treeitem.
const ariaRoles = roles as unknown as {
  keys(): string[];
  get(role: string): { props: Record<string, unknown> } | undefined;
};
// Reading roles expands the complete aria-query table; only checked matchers need this list.
let rolesSupportingChecked: string[] | null = null;
function checkedRoles(): string[] {
  return (rolesSupportingChecked ??= ariaRoles
    .keys()
    .filter((role) => ariaRoles.get(role)?.props["aria-checked"] !== undefined));
}

function roleSupportsChecked(role: string | null): boolean {
  return role !== null && checkedRoles().includes(role);
}

function supportedRolesSentence(): string {
  return toSentence(
    checkedRoles().map((role) => `role="${role}"`),
    { lastWordConnector: " or " },
  );
}

export function toBeChecked(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeChecked, this);

  const isValidInput = () => {
    return element.tagName.toLowerCase() === "input" && ["checkbox", "radio"].includes(element.type);
  };

  const isValidAriaElement = () => {
    return (
      roleSupportsChecked(element.getAttribute("role")) &&
      ["true", "false"].includes(element.getAttribute("aria-checked"))
    );
  };

  if (!isValidInput() && !isValidAriaElement()) {
    return {
      pass: false,
      message: () =>
        `only inputs with type="checkbox" or type="radio" or elements with ${supportedRolesSentence()} and a valid aria-checked attribute can be used with .toBeChecked(). Use .toHaveValue() instead`,
    };
  }

  const isChecked = () => {
    if (isValidInput()) return element.checked;
    return element.getAttribute("aria-checked") === "true";
  };

  return {
    pass: isChecked(),
    message: () => {
      const is = isChecked() ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeChecked`, "element", ""),
        "",
        `Received element ${is} checked:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

export function toBePartiallyChecked(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBePartiallyChecked, this);

  const isValidInput = () => {
    return element.tagName.toLowerCase() === "input" && element.type === "checkbox";
  };

  const isValidAriaElement = () => {
    return element.getAttribute("role") === "checkbox";
  };

  if (!isValidInput() && !isValidAriaElement()) {
    return {
      pass: false,
      message: () =>
        'only inputs with type="checkbox" or elements with role="checkbox" and a valid aria-checked attribute can be used with .toBePartiallyChecked(). Use .toHaveValue() instead',
    };
  }

  const isPartiallyChecked = () => {
    const isAriaMixed = element.getAttribute("aria-checked") === "mixed";

    if (isValidInput()) {
      return element.indeterminate || isAriaMixed;
    }

    return isAriaMixed;
  };

  return {
    pass: isPartiallyChecked(),
    message: () => {
      const is = isPartiallyChecked() ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBePartiallyChecked`, "element", ""),
        "",
        `Received element ${is} partially checked:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

function isButtonLike(element: DOMNode): boolean {
  const roles = (element.getAttribute("role") || "").split(" ").map((role: string) => role.trim());
  return (
    element.tagName.toLowerCase() === "button" ||
    (element.tagName.toLowerCase() === "input" && element.type === "button") ||
    roles.includes("button")
  );
}

export function toBePressed(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBePressed, this);

  const isButton = isButtonLike(element);
  const pressedAttribute = element.getAttribute("aria-pressed");
  const isValidAriaElement = pressedAttribute === "true" || pressedAttribute === "false";

  if (!isButton || !isValidAriaElement) {
    return {
      pass: false,
      message: () =>
        `Only button or input with type="button" or element with role="button" and a valid aria-pressed attribute can be used with .toBePressed()`,
    };
  }

  const isPressed = pressedAttribute === "true";

  return {
    pass: isButton && isPressed,

    message: () => {
      const matcher = this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBePressed`, "element", "");

      return getMessage(
        this,
        matcher,
        `Expected element to have`,
        `aria-pressed="${this.isNot ? "false" : "true"}"`,
        `Received`,
        `aria-pressed="${pressedAttribute}"`,
      );
    },
  };
}

export function toBePartiallyPressed(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBePartiallyPressed, this);

  const isButton = isButtonLike(element);
  const pressedAttribute = element.getAttribute("aria-pressed");
  const isValidAriaElement =
    pressedAttribute === "true" || pressedAttribute === "false" || pressedAttribute === "mixed";

  if (!isButton || !isValidAriaElement) {
    return {
      pass: false,
      message: () =>
        `Only button or input with type="button" or element with role="button" and a valid aria-pressed attribute can be used with .toBePartiallyPressed()`,
    };
  }

  const isPartiallyPressed = pressedAttribute === "mixed";

  return {
    pass: isButton && isPartiallyPressed,

    message: () => {
      const to = this.isNot ? "not to" : "to";

      const matcher = this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBePartiallyPressed`, "element", "");

      return getMessage(
        this,
        matcher,
        `Expected element ${to} have`,
        `aria-pressed="mixed"`,
        `Received`,
        `aria-pressed="${pressedAttribute}"`,
      );
    },
  };
}

// --- toBeDisabled / toBeEnabled ---------------------------------------------------------

// form elements that support 'disabled'
const DISABLEABLE_FORM_TAGS = ["fieldset", "input", "select", "optgroup", "option", "button", "textarea"];

/*
 * If <fieldset> is disabled, the form controls that are its descendants, except descendants
 * of its first optional <legend> element, are disabled.
 * https://html.spec.whatwg.org/multipage/form-elements.html#concept-fieldset-disabled
 * This tests whether element is the first legend child of a fieldset parent.
 */
function isFirstLegendChildOfFieldset(element: DOMNode, parent: DOMNode): boolean {
  if (getTag(element) !== "legend" || getTag(parent) !== "fieldset") return false;
  for (let child = parent.firstElementChild; child !== null; child = child.nextElementSibling) {
    if (getTag(child) === "legend") return element.isSameNode(child);
  }
  return false; // unreachable: `element` itself is a legend child of `parent`
}

function isElementDisabledByParent(element: DOMNode, parent: DOMNode): boolean {
  return isElementDisabled(parent) && !isFirstLegendChildOfFieldset(element, parent);
}

function isCustomElement(tag: string): boolean {
  return tag.includes("-");
}

/*
 * Only certain form elements and custom elements can actually be disabled:
 * https://html.spec.whatwg.org/multipage/semantics-other.html#disabled-elements
 */
function canElementBeDisabled(element: DOMNode): boolean {
  const tag = getTag(element);
  return DISABLEABLE_FORM_TAGS.includes(tag) || isCustomElement(tag);
}

function isElementDisabled(element: DOMNode): boolean {
  return canElementBeDisabled(element) && element.hasAttribute("disabled");
}

function isAncestorDisabled(element: DOMNode): boolean {
  const parent = element.parentElement;
  return Boolean(parent) && (isElementDisabledByParent(element, parent) || isAncestorDisabled(parent));
}

function isElementOrAncestorDisabled(element: DOMNode): boolean {
  return canElementBeDisabled(element) && (isElementDisabled(element) || isAncestorDisabled(element));
}

export function toBeDisabled(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeDisabled, this);

  const isDisabled = isElementOrAncestorDisabled(element);

  return {
    pass: isDisabled,
    message: () => {
      const is = isDisabled ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeDisabled`, "element", ""),
        "",
        `Received element ${is} disabled:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

export function toBeEnabled(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeEnabled, this);

  const isEnabled = !isElementOrAncestorDisabled(element);

  return {
    pass: isEnabled,
    message: () => {
      const is = isEnabled ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeEnabled`, "element", ""),
        "",
        `Received element ${is} enabled:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

// --- toBeRequired -----------------------------------------------------------------------

// form elements that support 'required'
const REQUIRED_FORM_TAGS = ["select", "textarea"];
const ARIA_FORM_TAGS = ["input", "select", "textarea"];
const UNSUPPORTED_INPUT_TYPES = ["color", "hidden", "range", "submit", "image", "reset"];
const SUPPORTED_ARIA_ROLES = [
  "checkbox",
  "combobox",
  "gridcell",
  "listbox",
  "radiogroup",
  "spinbutton",
  "textbox",
  "tree",
];

function isRequiredOnFormTagsExceptInput(element: DOMNode): boolean {
  return REQUIRED_FORM_TAGS.includes(getTag(element)) && element.hasAttribute("required");
}

function isRequiredOnSupportedInput(element: DOMNode): boolean {
  return (
    getTag(element) === "input" &&
    element.hasAttribute("required") &&
    ((element.hasAttribute("type") && !UNSUPPORTED_INPUT_TYPES.includes(element.getAttribute("type"))) ||
      !element.hasAttribute("type"))
  );
}

function isElementRequiredByARIA(element: DOMNode): boolean {
  return (
    element.hasAttribute("aria-required") &&
    element.getAttribute("aria-required") === "true" &&
    (ARIA_FORM_TAGS.includes(getTag(element)) ||
      (element.hasAttribute("role") && SUPPORTED_ARIA_ROLES.includes(element.getAttribute("role"))))
  );
}

export function toBeRequired(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeRequired, this);

  const isRequired =
    isRequiredOnFormTagsExceptInput(element) || isRequiredOnSupportedInput(element) || isElementRequiredByARIA(element);

  return {
    pass: isRequired,
    message: () => {
      const is = isRequired ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeRequired`, "element", ""),
        "",
        `Received element ${is} required:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

// --- toBeInvalid / toBeValid ------------------------------------------------------------

const VALIDATABLE_TAGS = ["form", "input", "select", "textarea"];

function isElementHavingAriaInvalid(element: DOMNode): boolean {
  return element.hasAttribute("aria-invalid") && element.getAttribute("aria-invalid") !== "false";
}

function isElementInvalid(element: DOMNode): boolean {
  const isHaveAriaInvalid = isElementHavingAriaInvalid(element);
  if (VALIDATABLE_TAGS.includes(getTag(element))) {
    return isHaveAriaInvalid || !element.checkValidity();
  }
  return isHaveAriaInvalid;
}

export function toBeInvalid(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeInvalid, this);

  const isInvalid = isElementInvalid(element);

  return {
    pass: isInvalid,
    message: () => {
      const is = isInvalid ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeInvalid`, "element", ""),
        "",
        `Received element ${is} currently invalid:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

export function toBeValid(this: MatcherContext, element: DOMNode): MatcherResult {
  checkHtmlElement(element, toBeValid, this);

  const isValid = !isElementInvalid(element);

  return {
    pass: isValid,
    message: () => {
      const is = isValid ? "is" : "is not";
      return [
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toBeValid`, "element", ""),
        "",
        `Received element ${is} currently valid:`,
        `  ${this.utils.printReceived(element.cloneNode(false))}`,
      ].join("\n");
    },
  };
}

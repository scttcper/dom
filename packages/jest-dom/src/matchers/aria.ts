// Ports of @testing-library/jest-dom@7.0.1:
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-role.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-accessible-name.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-accessible-description.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-accessible-errormessage.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-description.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-errormessage.js

import { getImplicitAriaRolesJestDom } from "@rtd/aria";
import { computeAccessibleDescription, computeAccessibleName } from "../aria.ts";
import { ELEMENT_ROLES } from "../element-roles.generated.ts";
import { checkHtmlElement, deprecate, getMessage, normalize, type DOMNode, type MatcherContext, type MatcherResult } from "../utils.ts";

// --- toHaveRole -------------------------------------------------------------------------
//
// Upstream builds ~112 CSS selectors from aria-query's elementRoles and calls
// `element.matches(selector)` on each until one matches. @rtd/dom elements use @rtd/aria's
// `getImplicitAriaRolesJestDom` (the same rules over NodeImpl). Foreign elements (jsdom, in
// oracle runs) use ELEMENT_ROLES: that same list precompiled from aria-query@5.3.2
// (scripts/gen-element-roles.ts) and evaluated with attribute reads.

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** Attribute values HTML says selectors compare ASCII case-insensitively (https://html.spec.whatwg.org/#case-sensitivity-of-selectors). */
function valueEquals(element: DOMNode, attribute: string, actual: string, expected: string): boolean {
  if (actual === expected) return true;
  if ((attribute === "type" || attribute === "scope") && element.namespaceURI === HTML_NS) {
    return actual.toLowerCase() === expected;
  }
  return false;
}

function getImplicitAriaRoles(element: DOMNode): string[] {
  const localName: string = element.localName;
  for (let i = 0; i < ELEMENT_ROLES.length; i++) {
    const [name, attrs, typeText, roles] = ELEMENT_ROLES[i];
    if (name !== localName) continue;
    if (typeText && element.type !== "text") continue;
    let ok = true;
    for (let j = 0; j < attrs.length && ok; j++) {
      const [attribute, kind] = attrs[j];
      const value: string | null = element.getAttribute(attribute);
      if (kind === "-") ok = value === null;
      else if (kind === "+") ok = value !== null;
      else ok = value !== null && valueEquals(element, attribute, value, kind.slice(1));
    }
    if (ok) return [...roles];
  }
  return []; // this does not get reached in practice, since elements have at least a 'generic' role
}

function getExplicitOrImplicitRoles(htmlElement: DOMNode): string[] {
  const roleValue: string | null = htmlElement.getAttribute("role");
  if (roleValue !== null) {
    // Handle fallback roles, such as role="switch button"
    return roleValue.split(" ").filter(Boolean);
  }
  if (htmlElement._impl !== undefined) return getImplicitAriaRolesJestDom(htmlElement);
  return getImplicitAriaRoles(htmlElement);
}

export function toHaveRole(this: MatcherContext, htmlElement: DOMNode, expectedRole: string): MatcherResult {
  checkHtmlElement(htmlElement, toHaveRole, this);

  const actualRoles = getExplicitOrImplicitRoles(htmlElement);
  const pass = actualRoles.some((el) => el === expectedRole);

  return {
    pass,

    message: () => {
      const to = this.isNot ? "not to" : "to";
      return getMessage(
        this,
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.${toHaveRole.name}`, "element", ""),
        `Expected element ${to} have role`,
        expectedRole,
        "Received",
        actualRoles.join(", "),
      );
    },
  };
}

// --- toHaveAccessibleName / toHaveAccessibleDescription ---------------------------------

export function toHaveAccessibleName(this: MatcherContext, htmlElement: DOMNode, expectedAccessibleName?: unknown): MatcherResult {
  checkHtmlElement(htmlElement, toHaveAccessibleName, this);
  const actualAccessibleName = computeAccessibleName(htmlElement);
  const missingExpectedValue = arguments.length === 1;

  let pass = false;
  if (missingExpectedValue) {
    // When called without an expected value we only want to validate that the element has an
    // accessible name, whatever it may be.
    pass = actualAccessibleName !== "";
  } else {
    pass =
      expectedAccessibleName instanceof RegExp ? expectedAccessibleName.test(actualAccessibleName) : this.equals(actualAccessibleName, expectedAccessibleName);
  }

  return {
    pass,

    message: () => {
      const to = this.isNot ? "not to" : "to";
      return getMessage(
        this,
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.${toHaveAccessibleName.name}`, "element", ""),
        `Expected element ${to} have accessible name`,
        expectedAccessibleName,
        "Received",
        actualAccessibleName,
      );
    },
  };
}

export function toHaveAccessibleDescription(this: MatcherContext, htmlElement: DOMNode, expectedAccessibleDescription?: unknown): MatcherResult {
  checkHtmlElement(htmlElement, toHaveAccessibleDescription, this);
  const actualAccessibleDescription = computeAccessibleDescription(htmlElement);
  const missingExpectedValue = arguments.length === 1;

  let pass = false;
  if (missingExpectedValue) {
    // When called without an expected value we only want to validate that the element has an
    // accessible description, whatever it may be.
    pass = actualAccessibleDescription !== "";
  } else {
    pass =
      expectedAccessibleDescription instanceof RegExp
        ? expectedAccessibleDescription.test(actualAccessibleDescription)
        : this.equals(actualAccessibleDescription, expectedAccessibleDescription);
  }

  return {
    pass,

    message: () => {
      const to = this.isNot ? "not to" : "to";
      return getMessage(
        this,
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.${toHaveAccessibleDescription.name}`, "element", ""),
        `Expected element ${to} have accessible description`,
        expectedAccessibleDescription,
        "Received",
        actualAccessibleDescription,
      );
    },
  };
}

// --- toHaveAccessibleErrorMessage -------------------------------------------------------

const ariaInvalidName = "aria-invalid";
const validStates = ["false"];

// See `aria-errormessage` spec at https://www.w3.org/TR/wai-aria-1.2/#aria-errormessage
export function toHaveAccessibleErrorMessage(this: MatcherContext, htmlElement: DOMNode, expectedAccessibleErrorMessage?: unknown): MatcherResult {
  checkHtmlElement(htmlElement, toHaveAccessibleErrorMessage, this);
  const to = this.isNot ? "not to" : "to";
  const method = this.isNot ? ".not.toHaveAccessibleErrorMessage" : ".toHaveAccessibleErrorMessage";

  // Enforce Valid Id
  const errormessageId: string | null = htmlElement.getAttribute("aria-errormessage");
  const errormessageIdInvalid = !!errormessageId && /\s+/.test(errormessageId);

  if (errormessageIdInvalid) {
    return {
      pass: false,
      message: () => {
        return getMessage(
          this,
          this.utils.matcherHint(method, "element"),
          "Expected element's `aria-errormessage` attribute to be empty or a single, valid ID",
          "",
          "Received",
          `aria-errormessage="${errormessageId}"`,
        );
      },
    };
  }

  // See `aria-invalid` spec at https://www.w3.org/TR/wai-aria-1.2/#aria-invalid
  const ariaInvalidVal = htmlElement.getAttribute(ariaInvalidName);
  const fieldValid = !htmlElement.hasAttribute(ariaInvalidName) || validStates.includes(ariaInvalidVal);

  // Enforce Valid `aria-invalid` Attribute
  if (fieldValid) {
    return {
      pass: false,
      message: () => {
        return getMessage(
          this,
          this.utils.matcherHint(method, "element"),
          "Expected element to be marked as invalid with attribute",
          `${ariaInvalidName}="${String(true)}"`,
          "Received",
          // (sic) upstream omits the closing quote here
          htmlElement.hasAttribute("aria-invalid") ? `${ariaInvalidName}="${htmlElement.getAttribute(ariaInvalidName)}` : null,
        );
      },
    };
  }

  const error = normalize(htmlElement.ownerDocument.getElementById(errormessageId)?.textContent ?? "");

  return {
    pass:
      expectedAccessibleErrorMessage === undefined
        ? Boolean(error)
        : expectedAccessibleErrorMessage instanceof RegExp
          ? expectedAccessibleErrorMessage.test(error)
          : this.equals(error, expectedAccessibleErrorMessage),

    message: () => {
      return getMessage(
        this,
        this.utils.matcherHint(method, "element"),
        `Expected element ${to} have accessible error message`,
        expectedAccessibleErrorMessage ?? "",
        "Received",
        error,
      );
    },
  };
}

// --- deprecated: toHaveDescription / toHaveErrorMessage ---------------------------------

function textOfIdRefs(htmlElement: DOMNode, attribute: string): string {
  const raw: string = htmlElement.getAttribute(attribute) || "";
  const ids = raw.split(/\s+/).filter(Boolean);
  if (ids.length === 0) return "";
  const document = htmlElement.ownerDocument;
  const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
  return normalize(els.map((el) => el.textContent).join(" "));
}

// See algorithm: https://www.w3.org/TR/accname-1.1/#mapping_additional_nd_description
export function toHaveDescription(this: MatcherContext, htmlElement: DOMNode, checkWith?: unknown): MatcherResult {
  deprecate("toHaveDescription", "Please use toHaveAccessibleDescription.");

  checkHtmlElement(htmlElement, toHaveDescription, this);

  const expectsDescription = checkWith !== undefined;
  const description = textOfIdRefs(htmlElement, "aria-describedby");

  return {
    pass: expectsDescription ? (checkWith instanceof RegExp ? checkWith.test(description) : this.equals(description, checkWith)) : Boolean(description),
    message: () => {
      const to = this.isNot ? "not to" : "to";
      return getMessage(
        this,
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveDescription`, "element", ""),
        `Expected the element ${to} have description`,
        this.utils.printExpected(checkWith),
        "Received",
        this.utils.printReceived(description),
      );
    },
  };
}

// See aria-errormessage spec https://www.w3.org/TR/wai-aria-1.2/#aria-errormessage
export function toHaveErrorMessage(this: MatcherContext, htmlElement: DOMNode, checkWith?: unknown): MatcherResult {
  deprecate("toHaveErrorMessage", "Please use toHaveAccessibleErrorMessage.");
  checkHtmlElement(htmlElement, toHaveErrorMessage, this);

  if (!htmlElement.hasAttribute("aria-invalid") || htmlElement.getAttribute("aria-invalid") === "false") {
    const not = this.isNot ? ".not" : "";

    return {
      pass: false,
      message: () => {
        return getMessage(
          this,
          this.utils.matcherHint(`${not}.toHaveErrorMessage`, "element", ""),
          `Expected the element to have invalid state indicated by`,
          'aria-invalid="true"',
          "Received",
          htmlElement.hasAttribute("aria-invalid") ? `aria-invalid="${htmlElement.getAttribute("aria-invalid")}"` : this.utils.printReceived(""),
        );
      },
    };
  }

  const expectsErrorMessage = checkWith !== undefined;
  const errormessage = textOfIdRefs(htmlElement, "aria-errormessage");

  return {
    pass: expectsErrorMessage ? (checkWith instanceof RegExp ? checkWith.test(errormessage) : this.equals(errormessage, checkWith)) : Boolean(errormessage),
    message: () => {
      const to = this.isNot ? "not to" : "to";
      return getMessage(
        this,
        this.utils.matcherHint(`${this.isNot ? ".not" : ""}.toHaveErrorMessage`, "element", ""),
        `Expected the element ${to} have error message`,
        this.utils.printExpected(checkWith),
        "Received",
        this.utils.printReceived(errormessage),
      );
    },
  };
}

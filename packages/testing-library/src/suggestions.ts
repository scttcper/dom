// Port of @testing-library/dom src/suggestions.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/suggestions.js

import { attr } from "@rtd/dom/internal";
import { getDefaultNormalizer } from "./matches.ts";
import { getNodeTextImpl } from "./get-node-text.ts";
import { getConfig } from "./config.ts";
import { getImplicitAriaRolesImpl, isInaccessibleImpl } from "./role-helpers.ts";
import { getLabelsImpl, LabelContext } from "./label-helpers.ts";
import { aria } from "./aria.ts";
import { getDocument, implOf } from "./helpers.ts";
import { matchesSelector } from "./selectors.ts";

export type Variant = "find" | "findAll" | "get" | "getAll" | "query" | "queryAll";
export type Method =
  | "AltText"
  | "alttext"
  | "DisplayValue"
  | "displayvalue"
  | "LabelText"
  | "labeltext"
  | "PlaceholderText"
  | "placeholdertext"
  | "Role"
  | "role"
  | "TestId"
  | "testid"
  | "Text"
  | "text"
  | "Title"
  | "title";

export interface Suggestion {
  queryName: string;
  queryMethod: string;
  queryArgs: [string | RegExp, Record<string, RegExp | boolean>?];
  variant: string;
  warning?: string;
  toString(): string;
}

const normalize = getDefaultNormalizer();

function escapeRegExp(string: string): string {
  return string.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function getRegExpMatcher(string: string): RegExp {
  return new RegExp(escapeRegExp(string.toLowerCase()), "i");
}

function makeSuggestion(queryName: string, element: any, content: string, { variant, name }: { variant: string; name?: string }): Suggestion {
  let warning = "";
  const queryOptions: Record<string, RegExp | boolean> = {};
  const queryArgs: Suggestion["queryArgs"] = [["Role", "TestId"].includes(queryName) ? content : getRegExpMatcher(content)];

  if (name) {
    queryOptions.name = getRegExpMatcher(name);
  }

  if (queryName === "Role" && isInaccessibleImpl(implOf(element))) {
    queryOptions.hidden = true;
    warning = `Element is inaccessible. This means that the element and all its children are invisible to screen readers.
    If you are using the aria-hidden prop, make sure this is the right choice for your case.
    `;
  }
  if (Object.keys(queryOptions).length > 0) {
    queryArgs.push(queryOptions);
  }

  const queryMethod = `${variant}By${queryName}`;

  return {
    queryName,
    queryMethod,
    queryArgs,
    variant,
    warning,
    toString() {
      if (warning) {
        console.warn(warning);
      }
      let [text, options]: [any, any] = queryArgs as [any, any];

      text = typeof text === "string" ? `'${text}'` : text;

      options = options
        ? `, { ${Object.entries(options)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")} }`
        : "";

      return `${queryMethod}(${text}${options})`;
    },
  };
}

function canSuggest(currentMethod: string, requestedMethod: string | undefined, data: unknown): boolean {
  return Boolean(data && (!requestedMethod || requestedMethod.toLowerCase() === currentMethod.toLowerCase()));
}

export function getSuggestedQuery(element: any, variant: Variant = "get", method?: Method): Suggestion | undefined {
  const impl = implOf(element);
  // don't create suggestions for script and style elements
  if (matchesSelector(impl, getConfig().defaultIgnore)) {
    return undefined;
  }

  //We prefer to suggest something else if the role is generic
  const role = attr(impl, "role") ?? getImplicitAriaRolesImpl(impl)?.[0];
  if (role !== "generic" && canSuggest("Role", method, role)) {
    return makeSuggestion("Role", element, role, {
      variant,
      name: aria.computeAccessibleName(impl, getConfig().computedStyleSupportsPseudoElements),
    });
  }

  const labelText = getLabelsImpl(new LabelContext(implOf(getDocument())), impl)
    .map((label) => label.content)
    .join(" ");
  if (canSuggest("LabelText", method, labelText)) {
    return makeSuggestion("LabelText", element, labelText, { variant });
  }

  const placeholderText = attr(impl, "placeholder");
  if (canSuggest("PlaceholderText", method, placeholderText)) {
    return makeSuggestion("PlaceholderText", element, placeholderText!, { variant });
  }

  const textContent = normalize(getNodeTextImpl(impl));
  if (canSuggest("Text", method, textContent)) {
    return makeSuggestion("Text", element, textContent, { variant });
  }

  if (canSuggest("DisplayValue", method, element.value)) {
    return makeSuggestion("DisplayValue", element, normalize(element.value), { variant });
  }

  const alt = attr(impl, "alt");
  if (canSuggest("AltText", method, alt)) {
    return makeSuggestion("AltText", element, alt!, { variant });
  }

  const title = attr(impl, "title");
  if (canSuggest("Title", method, title)) {
    return makeSuggestion("Title", element, title!, { variant });
  }

  const testId = element.getAttribute(getConfig().testIdAttribute);
  if (canSuggest("TestId", method, testId)) {
    return makeSuggestion("TestId", element, testId, { variant });
  }

  return undefined;
}

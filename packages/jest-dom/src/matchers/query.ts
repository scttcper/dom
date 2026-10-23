// Port of @testing-library/jest-dom@7.0.1 src/query-matchers.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/query-matchers.js

import { prettyDOM, queries } from "../dtl.ts";
import { checkHtmlElement, getMessage, type DOMNode, type MatcherContext, type MatcherResult } from "../utils.ts";

/**
 * The list of supported query names. These must match the plain English used by Testing
 * Library (e.g. "by role", "by test ID"). Each name is converted to PascalCase to derive the
 * matcher names `toContainAnyBy${PascalCase}` and `toContainOneBy${PascalCase}`, as well as
 * look up the query function `queryAllBy${PascalCase}`.
 */
const queryNames = ["alt text", "display value", "label text", "placeholder text", "role", "test ID", "text", "title"];

function toPascalCase(value: string): string {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

type QueryMatcher = (this: MatcherContext, actual: DOMNode, ...args: unknown[]) => MatcherResult;

function createQueryMatcher(quantity: "Any" | "One", queryName: string): QueryMatcher {
  const strategy = toPascalCase(queryName);
  const matcherName = `toContain${quantity}By${strategy}`;
  const query = (queries as unknown as Record<string, (container: DOMNode, ...args: unknown[]) => DOMNode[]>)[`queryAllBy${strategy}`];

  function queryMatcher(this: MatcherContext, actual: DOMNode, ...args: unknown[]): MatcherResult {
    checkHtmlElement(actual, queryMatcher, this);
    const elements = query(actual, ...args);
    const pass = quantity === "One" ? elements.length === 1 : elements.length > 0;

    return {
      message: () => {
        const to = this.isNot ? "not to" : "to";
        const hint = this.utils.matcherHint(`${this.isNot ? ".not" : ""}.${matcherName}`, "element", queryName, {
          secondArgument: args[1] === undefined ? undefined : this.utils.printExpected(args[1]),
        });
        const parts = [
          getMessage(this, hint, `Expected element ${to} contain ${quantity.toLowerCase()} descendant by ${queryName}`, args[0], "Received", elements.length),
        ];
        const prettyElements = elements.map((element) => prettyDOM(element)).filter((value): value is string => typeof value === "string");

        if (prettyElements.length) {
          parts.push("Here are the matching elements:", ...prettyElements);
        }

        return parts.join("\n\n");
      },
      pass,
    };
  }

  // The function's .name must align with the matcher for the checkHtmlElement hint to render
  // correctly.
  Object.defineProperty(queryMatcher, "name", { value: matcherName });

  return queryMatcher;
}

export const queryMatchers: Record<string, QueryMatcher> = {};
for (const queryName of queryNames) {
  const anyMatcher = createQueryMatcher("Any", queryName);
  const oneMatcher = createQueryMatcher("One", queryName);
  queryMatchers[anyMatcher.name] = anyMatcher;
  queryMatchers[oneMatcher.name] = oneMatcher;
}

// Port of @testing-library/dom src/get-queries-for-element.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/get-queries-for-element.js

import { queries as defaultQueries } from "./queries/ordered.ts";

type FuncMap = Record<string, (...args: any[]) => any>;

/**
 * @param element container
 * @param queries object of functions
 * @param initialValue for reducer
 * @returns object of functions bound to container
 */
export function getQueriesForElement(
  element: any,
  queries: FuncMap = defaultQueries as unknown as FuncMap,
  initialValue: FuncMap = {},
): any {
  return Object.keys(queries).reduce((helpers, key) => {
    const fn = queries[key];
    helpers[key] = fn.bind(null, element);
    return helpers;
  }, initialValue);
}

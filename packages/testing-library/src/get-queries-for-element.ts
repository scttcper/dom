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
  initialValue?: FuncMap,
): any {
  if (initialValue === undefined) {
    if (queries === defaultQueries && hasDefaultKeys(queries)) return bindDefaultQueries(queries, element);
    initialValue = {};
  }
  return Object.keys(queries).reduce((helpers, key) => {
    const fn = queries[key];
    helpers[key] = fn.bind(null, element);
    return helpers;
  }, initialValue);
}

// Ours: `within(el)` / `render()` with the default queries build the same object (a fresh one,
// the same keys in the same order, a fresh bound function each) from an object literal: the
// reduce's 48 computed-key reads and stores were ~1.8 µs of a ~2 µs within(), 10x the query
// usually called on it. The exported `queries` object can be changed (as upstream's CommonJS
// one can); the literal is used only while its keys are exactly these, values read per call.

const DEFAULT_KEYS = [
  "findAllByLabelText",
  "findByLabelText",
  "getAllByLabelText",
  "getByLabelText",
  "queryAllByLabelText",
  "queryByLabelText",
  "findAllByPlaceholderText",
  "findByPlaceholderText",
  "getAllByPlaceholderText",
  "getByPlaceholderText",
  "queryAllByPlaceholderText",
  "queryByPlaceholderText",
  "findAllByText",
  "findByText",
  "getAllByText",
  "getByText",
  "queryAllByText",
  "queryByText",
  "findAllByDisplayValue",
  "findByDisplayValue",
  "getAllByDisplayValue",
  "getByDisplayValue",
  "queryAllByDisplayValue",
  "queryByDisplayValue",
  "findAllByAltText",
  "findByAltText",
  "getAllByAltText",
  "getByAltText",
  "queryAllByAltText",
  "queryByAltText",
  "findAllByTitle",
  "findByTitle",
  "getAllByTitle",
  "getByTitle",
  "queryAllByTitle",
  "queryByTitle",
  "findAllByRole",
  "findByRole",
  "getAllByRole",
  "getByRole",
  "queryAllByRole",
  "queryByRole",
  "findAllByTestId",
  "findByTestId",
  "getAllByTestId",
  "getByTestId",
  "queryAllByTestId",
  "queryByTestId",
];

function hasDefaultKeys(q: FuncMap): boolean {
  const keys = Object.keys(q);
  if (keys.length !== DEFAULT_KEYS.length) return false;
  for (let i = 0; i < keys.length; i++) if (keys[i] !== DEFAULT_KEYS[i]) return false;
  return true;
}

function bindDefaultQueries(q: FuncMap, element: any): FuncMap {
  return {
    findAllByLabelText: q.findAllByLabelText.bind(null, element),
    findByLabelText: q.findByLabelText.bind(null, element),
    getAllByLabelText: q.getAllByLabelText.bind(null, element),
    getByLabelText: q.getByLabelText.bind(null, element),
    queryAllByLabelText: q.queryAllByLabelText.bind(null, element),
    queryByLabelText: q.queryByLabelText.bind(null, element),
    findAllByPlaceholderText: q.findAllByPlaceholderText.bind(null, element),
    findByPlaceholderText: q.findByPlaceholderText.bind(null, element),
    getAllByPlaceholderText: q.getAllByPlaceholderText.bind(null, element),
    getByPlaceholderText: q.getByPlaceholderText.bind(null, element),
    queryAllByPlaceholderText: q.queryAllByPlaceholderText.bind(null, element),
    queryByPlaceholderText: q.queryByPlaceholderText.bind(null, element),
    findAllByText: q.findAllByText.bind(null, element),
    findByText: q.findByText.bind(null, element),
    getAllByText: q.getAllByText.bind(null, element),
    getByText: q.getByText.bind(null, element),
    queryAllByText: q.queryAllByText.bind(null, element),
    queryByText: q.queryByText.bind(null, element),
    findAllByDisplayValue: q.findAllByDisplayValue.bind(null, element),
    findByDisplayValue: q.findByDisplayValue.bind(null, element),
    getAllByDisplayValue: q.getAllByDisplayValue.bind(null, element),
    getByDisplayValue: q.getByDisplayValue.bind(null, element),
    queryAllByDisplayValue: q.queryAllByDisplayValue.bind(null, element),
    queryByDisplayValue: q.queryByDisplayValue.bind(null, element),
    findAllByAltText: q.findAllByAltText.bind(null, element),
    findByAltText: q.findByAltText.bind(null, element),
    getAllByAltText: q.getAllByAltText.bind(null, element),
    getByAltText: q.getByAltText.bind(null, element),
    queryAllByAltText: q.queryAllByAltText.bind(null, element),
    queryByAltText: q.queryByAltText.bind(null, element),
    findAllByTitle: q.findAllByTitle.bind(null, element),
    findByTitle: q.findByTitle.bind(null, element),
    getAllByTitle: q.getAllByTitle.bind(null, element),
    getByTitle: q.getByTitle.bind(null, element),
    queryAllByTitle: q.queryAllByTitle.bind(null, element),
    queryByTitle: q.queryByTitle.bind(null, element),
    findAllByRole: q.findAllByRole.bind(null, element),
    findByRole: q.findByRole.bind(null, element),
    getAllByRole: q.getAllByRole.bind(null, element),
    getByRole: q.getByRole.bind(null, element),
    queryAllByRole: q.queryAllByRole.bind(null, element),
    queryByRole: q.queryByRole.bind(null, element),
    findAllByTestId: q.findAllByTestId.bind(null, element),
    findByTestId: q.findByTestId.bind(null, element),
    getAllByTestId: q.getAllByTestId.bind(null, element),
    getByTestId: q.getByTestId.bind(null, element),
    queryAllByTestId: q.queryAllByTestId.bind(null, element),
    queryByTestId: q.queryByTestId.bind(null, element),
  };
}

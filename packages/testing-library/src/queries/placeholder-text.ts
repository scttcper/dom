// Port of @testing-library/dom src/queries/placeholder-text.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/placeholder-text.ts

import {
  queryAllByAttribute,
  wrapAllByQueryWithSuggestion,
  buildQueries,
  type GetErrorFunction,
} from "../query-helpers.ts";
import { checkContainerType } from "../helpers.ts";

function queryAllByPlaceholderText(...args: [any, any, any?]): any[] {
  checkContainerType(args[0]);
  return queryAllByAttribute("placeholder", ...args);
}
const getMultipleError: GetErrorFunction<[unknown]> = (c, text) =>
  `Found multiple elements with the placeholder text of: ${text}`;
const getMissingError: GetErrorFunction<[unknown]> = (c, text) =>
  `Unable to find an element with the placeholder text of: ${text}`;

const queryAllByPlaceholderTextWithSuggestions = wrapAllByQueryWithSuggestion(
  queryAllByPlaceholderText,
  queryAllByPlaceholderText.name,
  "queryAll",
);

const [
  queryByPlaceholderText,
  getAllByPlaceholderText,
  getByPlaceholderText,
  findAllByPlaceholderText,
  findByPlaceholderText,
] = buildQueries(queryAllByPlaceholderText, getMultipleError, getMissingError);

export {
  queryByPlaceholderText,
  queryAllByPlaceholderTextWithSuggestions as queryAllByPlaceholderText,
  getByPlaceholderText,
  getAllByPlaceholderText,
  findAllByPlaceholderText,
  findByPlaceholderText,
};

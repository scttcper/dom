// Port of @testing-library/dom src/queries/test-id.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/test-id.ts

import { queryAllByAttribute, wrapAllByQueryWithSuggestion, buildQueries, type GetErrorFunction } from "../query-helpers.ts";
import { checkContainerType } from "../helpers.ts";
import { getConfig } from "../config.ts";

const getTestIdAttribute = () => getConfig().testIdAttribute;

function queryAllByTestId(...args: [any, any, any?]): any[] {
  checkContainerType(args[0]);
  return queryAllByAttribute(getTestIdAttribute(), ...args);
}

const getMultipleError: GetErrorFunction<[unknown]> = (c, id) => `Found multiple elements by: [${getTestIdAttribute()}="${id}"]`;
const getMissingError: GetErrorFunction<[unknown]> = (c, id) => `Unable to find an element by: [${getTestIdAttribute()}="${id}"]`;

const queryAllByTestIdWithSuggestions = wrapAllByQueryWithSuggestion(queryAllByTestId, queryAllByTestId.name, "queryAll");

const [queryByTestId, getAllByTestId, getByTestId, findAllByTestId, findByTestId] = buildQueries(queryAllByTestId, getMultipleError, getMissingError);

export { queryByTestId, queryAllByTestIdWithSuggestions as queryAllByTestId, getByTestId, getAllByTestId, findAllByTestId, findByTestId };

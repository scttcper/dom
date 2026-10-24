// @rtd/testing-library — drop-in replacement for @testing-library/dom@10.4.2, running on
// @rtd/dom internals. Port of @testing-library/dom src/index.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/index.js
//
// Exports exactly upstream's names (explicit lists: internal helpers in the same modules
// stay private). Public typings: ../types (ported from the published types).

import { getQueriesForElement } from "./get-queries-for-element.ts";
import { queries } from "./queries/ordered.ts";
import {
  buildQueries,
  getElementError,
  getMultipleElementsFoundError,
  makeFindQuery,
  makeGetAllQuery,
  makeSingleQuery,
  queryAllByAttribute,
  queryByAttribute,
  wrapAllByQueryWithSuggestion,
  wrapSingleQueryWithSuggestion,
} from "./query-helpers.ts";

export * from "./queries/index.ts";
export { waitFor } from "./wait-for.ts";
export { waitForElementToBeRemoved } from "./wait-for-element-to-be-removed.ts";
export { getDefaultNormalizer } from "./matches.ts";
export { getNodeText } from "./get-node-text.ts";
export { fireEvent, createEvent } from "./events.ts";
export { getQueriesForElement } from "./get-queries-for-element.ts";
export { screen } from "./screen.ts";
export {
  buildQueries,
  getElementError,
  getMultipleElementsFoundError,
  makeFindQuery,
  makeGetAllQuery,
  makeSingleQuery,
  queryAllByAttribute,
  queryByAttribute,
  wrapAllByQueryWithSuggestion,
  wrapSingleQueryWithSuggestion,
};
export { getRoles, logRoles, isInaccessible } from "./role-helpers.ts";
export { prettyDOM, logDOM, prettyFormat } from "./pretty-dom.ts";
export { configure, getConfig } from "./config.ts";
export { getSuggestedQuery } from "./suggestions.ts";
// Ours (not in upstream): agent-oriented debugging, see docs/agent-debugging.md.
export { ariaSnapshot } from "./aria-snapshot.ts";
export { diffAriaSnapshots } from "./aria-snapshot-diff.ts";

// upstream: `import * as queryHelpers from './query-helpers'`
const queryHelpers = {
  getElementError,
  wrapAllByQueryWithSuggestion,
  wrapSingleQueryWithSuggestion,
  getMultipleElementsFoundError,
  queryAllByAttribute,
  queryByAttribute,
  makeSingleQuery,
  makeGetAllQuery,
  makeFindQuery,
  buildQueries,
};

export {
  // "within" reads better in user-code
  // "getQueriesForElement" reads better in library code
  // so we have both
  getQueriesForElement as within,
  // export query utils under a namespace for convenience:
  queries,
  queryHelpers,
};

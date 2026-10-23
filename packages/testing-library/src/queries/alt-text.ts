// Port of @testing-library/dom src/queries/alt-text.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/alt-text.ts

import { queryAllByAttribute, wrapAllByQueryWithSuggestion, buildQueries, type GetErrorFunction } from "../query-helpers.ts";
import { checkContainerType } from "../helpers.ts";
import type { Matcher, MatcherOptions } from "../matches.ts";

// Valid tags are img, input, area and custom elements
const VALID_TAG_REGEXP = /^(img|input|area|.+-.+)$/i;

function queryAllByAltText(container: any, alt: Matcher, options: MatcherOptions = {}): any[] {
  checkContainerType(container);
  return queryAllByAttribute("alt", container, alt, options).filter((node) => VALID_TAG_REGEXP.test(node.tagName));
}

const getMultipleError: GetErrorFunction<[unknown]> = (c, alt) => `Found multiple elements with the alt text: ${alt}`;
const getMissingError: GetErrorFunction<[unknown]> = (c, alt) => `Unable to find an element with the alt text: ${alt}`;

const queryAllByAltTextWithSuggestions = wrapAllByQueryWithSuggestion(queryAllByAltText, queryAllByAltText.name, "queryAll");
const [queryByAltText, getAllByAltText, getByAltText, findAllByAltText, findByAltText] = buildQueries(queryAllByAltText, getMultipleError, getMissingError);

export { queryByAltText, queryAllByAltTextWithSuggestions as queryAllByAltText, getByAltText, getAllByAltText, findAllByAltText, findByAltText };

// Port of @testing-library/dom src/queries/display-value.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/display-value.ts

import { ELEMENT_NODE, HTML_NS, nextInTree, T } from "@rtd/dom/internal";
import { wrapAllByQueryWithSuggestion, buildQueries, type GetErrorFunction } from "../query-helpers.ts";
import { checkContainerType, implOf } from "../helpers.ts";
import { fuzzyMatches, matches, makeNormalizer, type Matcher, type MatcherOptions } from "../matches.ts";
import { getNodeTextImpl } from "../get-node-text.ts";
import { $impl } from "@rtd/dom/internal";

function queryAllByDisplayValue(container: any, value: Matcher, { exact = true, collapseWhitespace, trim, normalizer }: MatcherOptions = {}): any[] {
  checkContainerType(container);
  const matcher = exact ? matches : fuzzyMatches;
  const matchNormalizer = makeNormalizer({ collapseWhitespace, trim, normalizer });
  const root = implOf(container);
  const out: any[] = [];
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type !== ELEMENT_NODE) continue;
    // `querySelectorAll('input,textarea,select')`
    const name = n.name;
    if (name !== "input" && name !== "textarea" && name !== "select") continue;
    const node = n.node as any;
    if (n.tag === T.select && n.ns === HTML_NS) {
      // `Array.from(select.options).filter(o => o.selected)`
      const options = node.options;
      let found = false;
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (option.selected && matcher(getNodeTextImpl(option[$impl]), option, value, matchNormalizer)) {
          found = true;
          break;
        }
      }
      if (found) out.push(node);
    } else if (matcher(node.value, node, value, matchNormalizer)) {
      out.push(node);
    }
  }
  return out;
}

const getMultipleError: GetErrorFunction<[unknown]> = (c, value) => `Found multiple elements with the display value: ${value}.`;
const getMissingError: GetErrorFunction<[unknown]> = (c, value) => `Unable to find an element with the display value: ${value}.`;

const queryAllByDisplayValueWithSuggestions = wrapAllByQueryWithSuggestion(queryAllByDisplayValue, queryAllByDisplayValue.name, "queryAll");

const [queryByDisplayValue, getAllByDisplayValue, getByDisplayValue, findAllByDisplayValue, findByDisplayValue] = buildQueries(
  queryAllByDisplayValue,
  getMultipleError,
  getMissingError,
);

export {
  queryByDisplayValue,
  queryAllByDisplayValueWithSuggestions as queryAllByDisplayValue,
  getByDisplayValue,
  getAllByDisplayValue,
  findAllByDisplayValue,
  findByDisplayValue,
};

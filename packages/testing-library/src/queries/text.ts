// Port of @testing-library/dom src/queries/text.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/text.ts
//
// With the default `selector` ('*') and `ignore` ('script, style') the query is a single
// NodeImpl walk with no selector matching; other values go through the selector engine.

import { ELEMENT_NODE, nextInTree, type NodeImpl } from "@rtd/dom/internal";
import { wrapAllByQueryWithSuggestion, buildQueries, type GetErrorFunction } from "../query-helpers.ts";
import { checkContainerType, implOf } from "../helpers.ts";
import { fuzzyMatches, matches, makeNormalizer, type Matcher } from "../matches.ts";
import { getNodeTextImpl } from "../get-node-text.ts";
import { getConfig } from "../config.ts";
import { matchesSelector } from "../selectors.ts";

export interface SelectorMatcherOptions {
  selector?: string;
  ignore?: boolean | string;
  exact?: boolean;
  collapseWhitespace?: boolean;
  trim?: boolean;
  normalizer?: (text: string) => string;
  suggest?: boolean;
}

/** Whether `ignore` is exactly the default "script, style" list (any element named script/style). */
function isScriptStyleIgnore(ignore: unknown): boolean {
  return ignore === "script, style" || ignore === "script,style";
}

function isScriptOrStyle(n: NodeImpl): boolean {
  // Type selectors match the local name; HTML names are already lowercase.
  const name = n.name;
  return name === "script" || name === "style";
}

function queryAllByText(
  container: any,
  text: Matcher,
  { selector = "*", exact = true, collapseWhitespace, trim, ignore = getConfig().defaultIgnore, normalizer }: SelectorMatcherOptions = {},
): any[] {
  checkContainerType(container);
  const matcher = exact ? matches : fuzzyMatches;
  const matchNormalizer = makeNormalizer({ collapseWhitespace, trim, normalizer });
  const root = implOf(container);
  const anySelector = selector === "*";
  const fastIgnore = isScriptStyleIgnore(ignore);
  const out: any[] = [];

  const visit = (n: NodeImpl) => {
    if (!anySelector && !matchesSelector(n, selector)) return;
    if (ignore) {
      if (fastIgnore ? isScriptOrStyle(n) : matchesSelector(n, ignore as string)) return;
    }
    if (matcher(getNodeTextImpl(n), n.node, text, matchNormalizer)) out.push(n.node);
  };

  // `container.matches(selector)`: the container itself is a candidate when it is an element.
  if (root.type === ELEMENT_NODE) visit(root);
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type === ELEMENT_NODE) visit(n);
  }
  return out;
}

const getMultipleError: GetErrorFunction<[unknown]> = (c, text) => `Found multiple elements with the text: ${text}`;
const getMissingError: GetErrorFunction<[Matcher, SelectorMatcherOptions]> = (c, text, options = {}) => {
  const { collapseWhitespace, trim, normalizer, selector } = options;
  const matchNormalizer = makeNormalizer({ collapseWhitespace, trim, normalizer });
  const normalizedText = matchNormalizer(text.toString());
  const isNormalizedDifferent = normalizedText !== text.toString();
  const isCustomSelector = (selector ?? "*") !== "*";
  return `Unable to find an element with the text: ${
    isNormalizedDifferent ? `${normalizedText} (normalized from '${text}')` : text
  }${isCustomSelector ? `, which matches selector '${selector}'` : ""}. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`;
};

const queryAllByTextWithSuggestions = wrapAllByQueryWithSuggestion(queryAllByText, queryAllByText.name, "queryAll");

const [queryByText, getAllByText, getByText, findAllByText, findByText] = buildQueries(queryAllByText, getMultipleError, getMissingError as GetErrorFunction<any[]>);

export { queryByText, queryAllByTextWithSuggestions as queryAllByText, getByText, getAllByText, findAllByText, findByText };

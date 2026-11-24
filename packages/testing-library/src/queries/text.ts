// Port of @testing-library/dom src/queries/text.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/text.ts
//
// With the default `selector` ('*') and `ignore` ('script, style') the query is a single
// NodeImpl walk with no selector matching; other values go through the selector engine.

import { ELEMENT_NODE, F_HTML, nextInTree, T, type NodeImpl } from "@ctrl/dom/internal";
import { wrapAllByQueryWithSuggestion, buildQueries, type GetErrorFunction } from "../query-helpers.ts";
import { checkContainerType, implOf, NO_OPTIONS } from "../helpers.ts";
import { makeNormalizer, resolveNormalizer, textMatcher, type Matcher } from "../matches.ts";
import { getNodeTextImpl } from "../get-node-text.ts";
import { getConfig } from "../config.ts";
import { matchesSelector } from "../selectors.ts";
import { envDebugFormat } from "../agent-debug.ts";
import { textCandidates } from "../candidates.ts";

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
  if ((n.flags & F_HTML) !== 0) return n.tag === T.script || n.tag === T.style;
  const name = n.name;
  return name === "script" || name === "style";
}

/** `n.matches(selector) && !(ignore && n.matches(ignore))`, without the selector engine for the defaults. */
function isCandidate(n: NodeImpl, selector: string, ignore: boolean | string): boolean {
  if (selector !== "*" && !matchesSelector(n, selector)) return false;
  if (!ignore) return true;
  return isScriptStyleIgnore(ignore) ? !isScriptOrStyle(n) : !matchesSelector(n, ignore as string);
}

function queryAllByText(
  container: any,
  text: Matcher,
  {
    selector = "*",
    exact = true,
    collapseWhitespace,
    trim,
    ignore = getConfig().defaultIgnore,
    normalizer,
  }: SelectorMatcherOptions = NO_OPTIONS,
): any[] {
  checkContainerType(container);
  const match = textMatcher(exact, text, resolveNormalizer(trim, collapseWhitespace, normalizer));
  const root = implOf(container);
  const out: any[] = [];
  // `container.matches(selector)`: the container itself is a candidate when it is an element.
  if (root.type === ELEMENT_NODE && isCandidate(root, selector, ignore) && match(getNodeTextImpl(root), root.node))
    out.push(root.node);
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type === ELEMENT_NODE && isCandidate(n, selector, ignore) && match(getNodeTextImpl(n), n.node))
      out.push(n.node);
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
  const message = `Unable to find an element with the text: ${
    isNormalizedDifferent ? `${normalizedText} (normalized from '${text}')` : text
  }${isCustomSelector ? `, which matches selector '${selector}'` : ""}. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.`;
  // Ours: under CTRL_DOM_DEBUG, list similar and split-up text.
  if (envDebugFormat() === null) return message;
  const { exact = true, ignore = getConfig().defaultIgnore } = options;
  const candidates = textCandidates(c, text, matchNormalizer, selector ?? "*", ignore, exact);
  return candidates === "" ? message : `${message}\n\n${candidates}`;
};

const queryAllByTextWithSuggestions = wrapAllByQueryWithSuggestion(queryAllByText, queryAllByText.name, "queryAll");

const [queryByText, getAllByText, getByText, findAllByText, findByText] = buildQueries(
  queryAllByText,
  getMultipleError,
  getMissingError as GetErrorFunction<any[]>,
);

export {
  queryByText,
  queryAllByTextWithSuggestions as queryAllByText,
  getByText,
  getAllByText,
  findAllByText,
  findByText,
};

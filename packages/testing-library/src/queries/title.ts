// Port of @testing-library/dom src/queries/title.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/title.ts

import { asciiLowercase, attr, ELEMENT_NODE, nextInTree, type NodeImpl } from "@ctrl/dom/internal";
import { wrapAllByQueryWithSuggestion, buildQueries, type GetErrorFunction } from "../query-helpers.ts";
import { checkContainerType, implOf } from "../helpers.ts";
import { makeNormalizer, textMatcher, type Matcher, type MatcherOptions } from "../matches.ts";
import { getNodeTextImpl } from "../get-node-text.ts";

/** `node.tagName.toLowerCase() === 'title' && node.parentElement?.tagName.toLowerCase() === 'svg'` */
function isSvgTitle(n: NodeImpl): boolean {
  const parent = n.parent;
  return (
    asciiLowercase(n.prefix === null ? n.name : n.prefix + ":" + n.name) === "title" &&
    parent !== null &&
    parent.type === ELEMENT_NODE &&
    asciiLowercase(parent.prefix === null ? parent.name : parent.prefix + ":" + parent.name) === "svg"
  );
}

function queryAllByTitle(
  container: any,
  text: Matcher,
  { exact = true, collapseWhitespace, trim, normalizer }: MatcherOptions = {},
): any[] {
  checkContainerType(container);
  const matchNormalizer = makeNormalizer({ collapseWhitespace, trim, normalizer });
  const match = textMatcher(exact, text, matchNormalizer);
  const root = implOf(container);
  const out: any[] = [];
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type !== ELEMENT_NODE) continue;
    // `querySelectorAll('[title], svg > title')`
    const title = n.attrs === null ? null : attr(n, "title");
    const svgTitle =
      n.name === "title" && n.parent !== null && n.parent.type === ELEMENT_NODE && n.parent.name === "svg";
    if (title === null && !svgTitle) continue;
    if (match(title, n.node) || (isSvgTitle(n) && match(getNodeTextImpl(n), n.node))) {
      out.push(n.node);
    }
  }
  return out;
}

const getMultipleError: GetErrorFunction<[unknown]> = (c, title) => `Found multiple elements with the title: ${title}.`;
const getMissingError: GetErrorFunction<[unknown]> = (c, title) =>
  `Unable to find an element with the title: ${title}.`;

const queryAllByTitleWithSuggestions = wrapAllByQueryWithSuggestion(queryAllByTitle, queryAllByTitle.name, "queryAll");

const [queryByTitle, getAllByTitle, getByTitle, findAllByTitle, findByTitle] = buildQueries(
  queryAllByTitle,
  getMultipleError,
  getMissingError,
);

export {
  queryByTitle,
  queryAllByTitleWithSuggestions as queryAllByTitle,
  getByTitle,
  getAllByTitle,
  findAllByTitle,
  findByTitle,
};

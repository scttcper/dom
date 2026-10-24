// Port of @testing-library/dom src/query-helpers.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/query-helpers.ts
//
// `queryAllByAttribute` scans NodeImpl attribute records instead of running
// `querySelectorAll('[attr]')` + `getAttribute` per element.

import { asciiLowercase, attr, ELEMENT_NODE, F_HTML, nextInTree } from "@rtd/dom/internal";
import { getSuggestedQuery, type Variant } from "./suggestions.ts";
import { fuzzyMatches, matches, makeNormalizer, type Matcher, type MatcherOptions } from "./matches.ts";
import { waitFor } from "./wait-for.ts";
import { getConfig } from "./config.ts";
import { implOf } from "./helpers.ts";
import { agentElementSummary, envDebugFormat } from "./agent-debug.ts";

export type GetErrorFunction<Arguments extends any[] = [string]> = (c: any, ...args: Arguments) => string;
type AnyQuery = (container: any, ...args: any[]) => any;

export function getElementError(message: string | null, container: any): Error {
  return getConfig().getElementError(message, container);
}

export function getMultipleElementsFoundError(message: string, container: any): Error {
  return getElementError(
    `${message}\n\n(If this is intentional, then use the \`*AllBy*\` variant of the query (like \`queryAllByText\`, \`getAllByText\`, or \`findAllByText\`)).`,
    container,
  );
}

export function queryAllByAttribute(
  attribute: string,
  container: any,
  text: Matcher,
  { exact = true, collapseWhitespace, trim, normalizer }: MatcherOptions = {},
): any[] {
  const matcher = exact ? matches : fuzzyMatches;
  const matchNormalizer = makeNormalizer({ collapseWhitespace, trim, normalizer });
  const root = implOf(container);
  const lower = asciiLowercase(attribute);
  const out: any[] = [];
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type !== ELEMENT_NODE || n.attrs === null) continue;
    const value = attr(n, (n.flags & F_HTML) !== 0 ? lower : attribute);
    if (value !== null && matcher(value, n.node, text, matchNormalizer)) out.push(n.node);
  }
  return out;
}

export function queryByAttribute(attribute: string, container: any, text: Matcher, options?: MatcherOptions): any {
  const els = queryAllByAttribute(attribute, container, text, options);
  if (els.length > 1) {
    throw getMultipleElementsFoundError(`Found multiple elements by [${attribute}=${text}]`, container);
  }
  return els[0] || null;
}

// this accepts a query function and returns a function which throws an error
// if more than one elements is returned, otherwise it returns the first
// element or null
export function makeSingleQuery(allQuery: AnyQuery, getMultipleError: GetErrorFunction<any[]>): AnyQuery {
  return (container: any, ...args: any[]) => {
    const els = allQuery(container, ...args);
    if (els.length > 1) {
      // Ours: under CTRL_DOM_DEBUG each element prints as its snapshot line(s).
      const elementStrings =
        envDebugFormat() !== null
          ? els.map((element: any) => agentElementSummary(element)).join("\n")
          : els.map((element: any) => getElementError(null, element).message).join("\n\n");

      throw getMultipleElementsFoundError(
        `${getMultipleError(container, ...args)}

Here are the matching elements:

${elementStrings}`,
        container,
      );
    }
    return els[0] || null;
  };
}

function getSuggestionError(suggestion: { toString(): string }, container: any): Error {
  return getConfig().getElementError(
    `A better query is available, try this:
${suggestion.toString()}
`,
    container,
  );
}

// this accepts a query function and returns a function which throws an error
// if an empty list of elements is returned
export function makeGetAllQuery(allQuery: AnyQuery, getMissingError: GetErrorFunction<any[]>): AnyQuery {
  return (container: any, ...args: any[]) => {
    const els = allQuery(container, ...args);
    if (!els.length) {
      throw getConfig().getElementError(getMissingError(container, ...args), container);
    }
    return els;
  };
}

// this accepts a getter query function and returns a function which calls
// waitFor and passing a function which invokes the getter.
export function makeFindQuery(getter: AnyQuery): AnyQuery {
  return (container: any, text: any, options: any, waitForOptions: any) => {
    return waitFor(
      () => {
        return getter(container, text, options);
      },
      { container, ...waitForOptions },
    );
  };
}

export const wrapSingleQueryWithSuggestion =
  (query: AnyQuery, queryAllByName: string, variant: Variant): AnyQuery =>
  (container: any, ...args: any[]) => {
    const element = query(container, ...args);
    const [{ suggest = getConfig().throwSuggestions } = {}] = args.slice(-1);
    if (element && suggest) {
      const suggestion = getSuggestedQuery(element, variant);
      if (suggestion && !queryAllByName.endsWith(suggestion.queryName)) {
        throw getSuggestionError(suggestion.toString(), container);
      }
    }
    return element;
  };

export const wrapAllByQueryWithSuggestion =
  (query: AnyQuery, queryAllByName: string, variant: Variant): AnyQuery =>
  (container: any, ...args: any[]) => {
    const els = query(container, ...args);

    const [{ suggest = getConfig().throwSuggestions } = {}] = args.slice(-1);
    if (els.length && suggest) {
      // get a unique list of all suggestion messages.  We are only going to make a suggestion if
      // all the suggestions are the same
      const uniqueSuggestionMessages = [...new Set(els.map((element: any) => getSuggestedQuery(element, variant)?.toString()))];

      if (
        // only want to suggest if all the els have the same suggestion.
        uniqueSuggestionMessages.length === 1 &&
        !queryAllByName.endsWith(getSuggestedQuery(els[0], variant)!.queryName)
      ) {
        throw getSuggestionError(uniqueSuggestionMessages[0] as string, container);
      }
    }

    return els;
  };

export function buildQueries(queryAllBy: AnyQuery, getMultipleError: GetErrorFunction<any[]>, getMissingError: GetErrorFunction<any[]>): AnyQuery[] {
  const queryBy = wrapSingleQueryWithSuggestion(makeSingleQuery(queryAllBy, getMultipleError), queryAllBy.name, "query");
  const getAllBy = makeGetAllQuery(queryAllBy, getMissingError);

  const getBy = makeSingleQuery(getAllBy, getMultipleError);
  const getByWithSuggestions = wrapSingleQueryWithSuggestion(getBy, queryAllBy.name, "get");
  const getAllWithSuggestions = wrapAllByQueryWithSuggestion(getAllBy, queryAllBy.name.replace("query", "get"), "getAll");

  const findAllBy = makeFindQuery(wrapAllByQueryWithSuggestion(getAllBy, queryAllBy.name, "findAll"));
  const findBy = makeFindQuery(wrapSingleQueryWithSuggestion(getBy, queryAllBy.name, "find"));

  return [queryBy, getAllWithSuggestions, getByWithSuggestions, findAllBy, findBy];
}

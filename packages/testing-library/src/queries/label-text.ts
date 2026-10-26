// Port of @testing-library/dom src/queries/label-text.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/label-text.ts
//
// Same matching semantics as upstream; LabelContext shares aria's version-stamped label index.

import { attr, ELEMENT_NODE, nextInTree, type NodeImpl } from "@ctrl/dom/internal";
import { getConfig } from "../config.ts";
import { checkContainerType, implOf } from "../helpers.ts";
import { getLabelContentImpl, getLabelsImpl, LabelContext } from "../label-helpers.ts";
import { fuzzyMatches, matches, makeNormalizer, type Matcher, type NormalizerFn } from "../matches.ts";
import {
  queryAllByAttribute,
  makeFindQuery,
  makeSingleQuery,
  wrapAllByQueryWithSuggestion,
  wrapSingleQueryWithSuggestion,
  type GetErrorFunction,
} from "../query-helpers.ts";
import { matchesSelector } from "../selectors.ts";
import type { SelectorMatcherOptions } from "./text.ts";
import { $impl } from "@ctrl/dom/internal";
import { envDebugFormat } from "../agent-debug.ts";
import { labelCandidates } from "../candidates.ts";

function queryAllLabels(container: any): { textToMatch: string | null; node: any }[] {
  // `container.querySelectorAll('label,input')`
  const root = implOf(container);
  const out: { textToMatch: string | null; node: any }[] = [];
  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type !== ELEMENT_NODE || (n.name !== "label" && n.name !== "input")) continue;
    const textToMatch = getLabelContentImpl(n);
    if (textToMatch !== null) out.push({ node: n.node, textToMatch });
  }
  return out;
}

function queryAllLabelsByText(
  container: any,
  text: Matcher,
  { exact = true, trim, collapseWhitespace, normalizer }: SelectorMatcherOptions = {},
): any[] {
  const matcher = exact ? matches : fuzzyMatches;
  const matchNormalizer = makeNormalizer({ collapseWhitespace, trim, normalizer });

  const textToMatchByLabels = queryAllLabels(container);

  return textToMatchByLabels
    .filter(({ node, textToMatch }) => matcher(textToMatch, node, text, matchNormalizer))
    .map(({ node }) => node);
}

function queryAllByLabelText(
  container: any,
  text: Matcher,
  { selector = "*", exact = true, collapseWhitespace, trim, normalizer }: SelectorMatcherOptions = {},
): any[] {
  checkContainerType(container);

  const matcher = exact ? matches : fuzzyMatches;
  const matchNormalizer: NormalizerFn = makeNormalizer({ collapseWhitespace, trim, normalizer });
  const root = implOf(container);
  const ctx = new LabelContext(root);
  const labelledElements: any[] = [];

  for (let n = root.first; n !== null; n = nextInTree(n, root)) {
    if (n.type !== ELEMENT_NODE) continue;
    // `getRealLabels(element).length || element.hasAttribute('aria-labelledby')`
    if (attr(n, "aria-labelledby") === null && ctx.labelsOf(n).length === 0) continue;
    collectLabelled(ctx, n, selector, matcher, text, matchNormalizer, labelledElements);
  }

  const ariaLabelled = queryAllByAttribute("aria-label", container, text, { exact, normalizer: matchNormalizer });
  for (let i = 0; i < ariaLabelled.length; i++) labelledElements.push(ariaLabelled[i]);

  const unique = Array.from(new Set(labelledElements));
  return selector === "*" ? unique : unique.filter((element) => matchesSelector(element[$impl], selector));
}

function collectLabelled(
  ctx: LabelContext,
  labelledElement: NodeImpl,
  selector: string,
  matcher: typeof matches,
  text: Matcher,
  matchNormalizer: NormalizerFn,
  labelledElements: any[],
): void {
  const labelList = getLabelsImpl(ctx, labelledElement, selector);
  if (labelList.length === 1) {
    const label = labelList[0];
    if (label.formControl && matcher(label.content, label.formControl.node, text, matchNormalizer)) {
      labelledElements.push(label.formControl.node);
    }
    // Keep join's coercion for aria-labelledby nodes with an overridden value.
    if (matcher(`${label.content || ""}`, labelledElement.node, text, matchNormalizer)) {
      labelledElements.push(labelledElement.node);
    }
    return;
  }
  for (const label of labelList) {
    if (!label.formControl) continue;
    const formControl = label.formControl.node;
    if (matcher(label.content, formControl, text, matchNormalizer)) labelledElements.push(formControl);
  }
  const labelsValue = labelList.filter((label) => Boolean(label.content)).map((label) => label.content as string);
  const node = labelledElement.node;
  if (matcher(labelsValue.join(" "), node, text, matchNormalizer)) {
    labelledElements.push(node);
  }
  if (labelsValue.length > 1) {
    labelsValue.forEach((labelValue, index) => {
      if (matcher(labelValue, node, text, matchNormalizer)) {
        labelledElements.push(node);
      }

      const labelsFiltered = [...labelsValue];
      labelsFiltered.splice(index, 1);

      if (labelsFiltered.length > 1) {
        if (matcher(labelsFiltered.join(" "), node, text, matchNormalizer)) {
          labelledElements.push(node);
        }
      }
    });
  }
}

// the getAll* query would normally look like this:
// const getAllByLabelText = makeGetAllQuery(
//   queryAllByLabelText,
//   (c, text) => `Unable to find a label with the text of: ${text}`,
// )
// however, we can give a more helpful error message than the generic one,
// so we're writing this one out by hand.
function getAllByLabelText(container: any, text: Matcher, ...rest: [SelectorMatcherOptions?]): any[] {
  const els = queryAllByLabelText(container, text, ...rest);
  if (!els.length) {
    const labels = queryAllLabelsByText(container, text, ...rest);
    if (labels.length) {
      const tagNames = labels
        .map((label) => getTagNameOfElementAssociatedWithLabelViaFor(container, label))
        .filter((tagName) => !!tagName);
      if (tagNames.length) {
        throw getConfig().getElementError(
          tagNames
            .map(
              (tagName) =>
                `Found a label with the text of: ${text}, however the element associated with this label (<${tagName} />) is non-labellable [https://html.spec.whatwg.org/multipage/forms.html#category-label]. If you really need to label a <${tagName} />, you can use aria-label or aria-labelledby instead.`,
            )
            .join("\n\n"),
          container,
        );
      } else {
        throw getConfig().getElementError(
          `Found a label with the text of: ${text}, however no form control was found associated to that label. Make sure you're using the "for" attribute or "aria-labelledby" attribute correctly.`,
          container,
        );
      }
    } else {
      throw getConfig().getElementError(
        withLabelCandidates(`Unable to find a label with the text of: ${text}`, container, text, rest[0]),
        container,
      );
    }
  }
  return els;
}

/** Ours: under CTRL_DOM_DEBUG, append the form controls and their names. */
function withLabelCandidates(
  message: string,
  container: any,
  text: Matcher,
  options: SelectorMatcherOptions = {},
): string {
  if (envDebugFormat() === null) return message;
  const { exact = true, trim, collapseWhitespace, normalizer } = options;
  const candidates = labelCandidates(container, text, makeNormalizer({ trim, collapseWhitespace, normalizer }), exact);
  return candidates === "" ? message : `${message}\n\n${candidates}`;
}

function getTagNameOfElementAssociatedWithLabelViaFor(container: any, label: any): string | null {
  const htmlFor = label.getAttribute("for");
  if (!htmlFor) {
    return null;
  }

  const element = new LabelContext(implOf(container)).byIdInContainer(htmlFor);
  return element ? (element.node as any).tagName.toLowerCase() : null;
}

// the reason mentioned above is the same reason we're not using buildQueries
const getMultipleError: GetErrorFunction<[unknown]> = (c, text) => `Found multiple elements with the text of: ${text}`;
const queryByLabelText = wrapSingleQueryWithSuggestion(
  makeSingleQuery(queryAllByLabelText, getMultipleError),
  queryAllByLabelText.name,
  "query",
);
const getByLabelText = makeSingleQuery(getAllByLabelText, getMultipleError);

const findAllByLabelText = makeFindQuery(
  wrapAllByQueryWithSuggestion(getAllByLabelText, getAllByLabelText.name, "findAll"),
);
const findByLabelText = makeFindQuery(wrapSingleQueryWithSuggestion(getByLabelText, getAllByLabelText.name, "find"));

const getAllByLabelTextWithSuggestions = wrapAllByQueryWithSuggestion(
  getAllByLabelText,
  getAllByLabelText.name,
  "getAll",
);
const getByLabelTextWithSuggestions = wrapSingleQueryWithSuggestion(getByLabelText, getAllByLabelText.name, "get");

const queryAllByLabelTextWithSuggestions = wrapAllByQueryWithSuggestion(
  queryAllByLabelText,
  queryAllByLabelText.name,
  "queryAll",
);

export {
  queryAllByLabelTextWithSuggestions as queryAllByLabelText,
  queryByLabelText,
  getAllByLabelTextWithSuggestions as getAllByLabelText,
  getByLabelTextWithSuggestions as getByLabelText,
  findAllByLabelText,
  findByLabelText,
};

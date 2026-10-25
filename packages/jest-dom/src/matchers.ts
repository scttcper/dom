// Port of @testing-library/jest-dom@7.0.1 src/matchers.js — the raw matcher functions.
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/matchers.js

import { queryMatchers } from "./matchers/query.ts";

export {
  toBeInTheDOM,
  toBeInTheDocument,
  toBeEmpty,
  toBeEmptyDOMElement,
  toContainElement,
  toContainHTML,
  toHaveFocus,
  toAppearBefore,
  toAppearAfter,
} from "./matchers/document.ts";
export {
  toHaveTextContent,
  toHaveAttribute,
  toHaveClass,
  toHaveValue,
  toHaveDisplayValue,
  toHaveFormValues,
  toHaveSelection,
} from "./matchers/content.ts";
export {
  toHaveAccessibleDescription,
  toHaveAccessibleErrorMessage,
  toHaveRole,
  toHaveAccessibleName,
  toHaveDescription,
  toHaveErrorMessage,
} from "./matchers/aria.ts";
export { toHaveStyle, toBeVisible } from "./matchers/style.ts";
export {
  toBeDisabled,
  toBeEnabled,
  toBeRequired,
  toBeInvalid,
  toBeValid,
  toBeChecked,
  toBePartiallyChecked,
  toBePressed,
  toBePartiallyPressed,
} from "./matchers/state.ts";

export const {
  toContainAnyByAltText,
  toContainOneByAltText,
  toContainAnyByDisplayValue,
  toContainOneByDisplayValue,
  toContainAnyByLabelText,
  toContainOneByLabelText,
  toContainAnyByPlaceholderText,
  toContainOneByPlaceholderText,
  toContainAnyByRole,
  toContainOneByRole,
  toContainAnyByTestId,
  toContainOneByTestId,
  toContainAnyByText,
  toContainOneByText,
  toContainAnyByTitle,
  toContainOneByTitle,
} = queryMatchers;

// @ctrl/dom addition (not in upstream jest-dom): Playwright-style aria snapshot assertions.
export { toMatchAriaSnapshot } from "./matchers/aria-snapshot.ts";

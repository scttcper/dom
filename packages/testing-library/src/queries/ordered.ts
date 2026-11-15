// The `queries` object exported by the package (see `queries` in index.ts).

import * as labelText from "./label-text.ts";
import * as placeholderText from "./placeholder-text.ts";
import * as text from "./text.ts";
import * as displayValue from "./display-value.ts";
import * as altText from "./alt-text.ts";
import * as title from "./title.ts";
import * as role from "./role.ts";
import * as testId from "./test-id.ts";

/**
 * All query functions as a plain object in upstream's key order (module order, then
 * findAllBy/findBy/getAllBy/getBy/queryAllBy/queryBy). An ES module namespace would sort
 * the keys alphabetically; `screen`/`within` key order follows upstream's CJS build. Written as
 * a literal: built with computed keys, V8 kept it in dictionary mode, and within() reads every
 * property on each call.
 */
export const queries: Record<string, (...args: any[]) => any> = {
  findAllByLabelText: labelText.findAllByLabelText,
  findByLabelText: labelText.findByLabelText,
  getAllByLabelText: labelText.getAllByLabelText,
  getByLabelText: labelText.getByLabelText,
  queryAllByLabelText: labelText.queryAllByLabelText,
  queryByLabelText: labelText.queryByLabelText,
  findAllByPlaceholderText: placeholderText.findAllByPlaceholderText,
  findByPlaceholderText: placeholderText.findByPlaceholderText,
  getAllByPlaceholderText: placeholderText.getAllByPlaceholderText,
  getByPlaceholderText: placeholderText.getByPlaceholderText,
  queryAllByPlaceholderText: placeholderText.queryAllByPlaceholderText,
  queryByPlaceholderText: placeholderText.queryByPlaceholderText,
  findAllByText: text.findAllByText,
  findByText: text.findByText,
  getAllByText: text.getAllByText,
  getByText: text.getByText,
  queryAllByText: text.queryAllByText,
  queryByText: text.queryByText,
  findAllByDisplayValue: displayValue.findAllByDisplayValue,
  findByDisplayValue: displayValue.findByDisplayValue,
  getAllByDisplayValue: displayValue.getAllByDisplayValue,
  getByDisplayValue: displayValue.getByDisplayValue,
  queryAllByDisplayValue: displayValue.queryAllByDisplayValue,
  queryByDisplayValue: displayValue.queryByDisplayValue,
  findAllByAltText: altText.findAllByAltText,
  findByAltText: altText.findByAltText,
  getAllByAltText: altText.getAllByAltText,
  getByAltText: altText.getByAltText,
  queryAllByAltText: altText.queryAllByAltText,
  queryByAltText: altText.queryByAltText,
  findAllByTitle: title.findAllByTitle,
  findByTitle: title.findByTitle,
  getAllByTitle: title.getAllByTitle,
  getByTitle: title.getByTitle,
  queryAllByTitle: title.queryAllByTitle,
  queryByTitle: title.queryByTitle,
  findAllByRole: role.findAllByRole,
  findByRole: role.findByRole,
  getAllByRole: role.getAllByRole,
  getByRole: role.getByRole,
  queryAllByRole: role.queryAllByRole,
  queryByRole: role.queryByRole,
  findAllByTestId: testId.findAllByTestId,
  findByTestId: testId.findByTestId,
  getAllByTestId: testId.getAllByTestId,
  getByTestId: testId.getByTestId,
  queryAllByTestId: testId.queryAllByTestId,
  queryByTestId: testId.queryByTestId,
};

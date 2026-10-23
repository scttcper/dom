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
 * the keys alphabetically; `screen`/`within` key order follows upstream's CJS build.
 */
function build(): Record<string, (...args: any[]) => any> {
  const out: Record<string, (...args: any[]) => any> = {};
  const groups: [Record<string, any>, string][] = [
    [labelText, "LabelText"],
    [placeholderText, "PlaceholderText"],
    [text, "Text"],
    [displayValue, "DisplayValue"],
    [altText, "AltText"],
    [title, "Title"],
    [role, "Role"],
    [testId, "TestId"],
  ];
  for (const [mod, name] of groups) {
    for (const variant of ["findAllBy", "findBy", "getAllBy", "getBy", "queryAllBy", "queryBy"]) {
      out[variant + name] = mod[variant + name];
    }
  }
  return out;
}

export const queries = build();

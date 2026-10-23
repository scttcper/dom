// Port of @testing-library/dom src/queries/role.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/queries/role.ts
//
// Upstream: querySelectorAll(<role selector list>) → filter role → filter state → compute
// names for every candidate → isInaccessible with getComputedStyle per ancestor.
// Here: one NodeImpl walk; the role test reads the `role` attribute record or asks the
// backend for the implicit role; the (cheap, memoized per query) accessibility check runs
// before the accessible name, which is only computed for role- and state-matching, visible
// candidates. Filters are pure, so the reordering does not change results.

import { ELEMENT_NODE, nextInTree, type NodeImpl } from "@rtd/dom/internal";
import { aria } from "../aria.ts";
import {
  computeAriaSelected,
  computeAriaBusy,
  computeAriaChecked,
  computeAriaPressed,
  computeAriaCurrent,
  computeAriaExpanded,
  computeAriaValueNow,
  computeAriaValueMax,
  computeAriaValueMin,
  computeAriaValueText,
  computeHeadingLevelImpl,
  prettyRoles,
  isInaccessibleImpl,
} from "../role-helpers.ts";
import { wrapAllByQueryWithSuggestion, buildQueries, type GetErrorFunction } from "../query-helpers.ts";
import { checkContainerType, implOf } from "../helpers.ts";
import { matches, type Matcher } from "../matches.ts";
import { getConfig } from "../config.ts";

export interface ByRoleOptions {
  suggest?: boolean;
  hidden?: boolean;
  selected?: boolean;
  busy?: boolean;
  checked?: boolean;
  pressed?: boolean;
  current?: boolean | string;
  expanded?: boolean;
  level?: number;
  value?: { now?: number; min?: number; max?: number; text?: Matcher };
  queryFallbacks?: boolean;
  name?: string | RegExp | ((accessibleName: string, element: any) => boolean);
  description?: string | RegExp | ((accessibleDescription: string, element: any) => boolean);
}

const identity = (text: string) => text;

function assertSupported(role: string, prop: string): void {
  // guard against unknown roles
  if (!aria.roleSupportsProp(role, prop)) {
    throw new Error(`"${prop}" is not supported on role "${role}".`);
  }
}

function queryAllByRole(
  container: any,
  role: any,
  {
    hidden = getConfig().defaultHidden,
    name,
    description,
    queryFallbacks = false,
    selected,
    busy,
    checked,
    pressed,
    current,
    level,
    expanded,
    value: { now: valueNow, min: valueMin, max: valueMax, text: valueText } = {},
  }: ByRoleOptions = {},
): any[] {
  checkContainerType(container);

  if (selected !== undefined) assertSupported(role, "aria-selected");
  if (busy !== undefined) assertSupported(role, "aria-busy");
  if (checked !== undefined) assertSupported(role, "aria-checked");
  if (pressed !== undefined) assertSupported(role, "aria-pressed");
  // All currently released ARIA versions support `aria-current` on all roles.
  // Leaving this for symmetry and forward compatibility
  if (current !== undefined) assertSupported(role, "aria-current");
  if (level !== undefined) {
    // guard against using `level` option with any role other than `heading`
    if (role !== "heading") {
      throw new Error(`Role "${role}" cannot have "level" property.`);
    }
  }
  if (valueNow !== undefined) assertSupported(role, "aria-valuenow");
  if (valueMax !== undefined) assertSupported(role, "aria-valuemax");
  if (valueMin !== undefined) assertSupported(role, "aria-valuemin");
  if (valueText !== undefined) assertSupported(role, "aria-valuetext");
  if (expanded !== undefined) assertSupported(role, "aria-expanded");

  const pseudo = getConfig().computedStyleSupportsPseudoElements;
  const root = implOf(container);
  const out: any[] = [];

  for (let el = root.first; el !== null; el = nextInTree(el, root)) {
    if (el.type !== ELEMENT_NODE) continue;
    if (!aria.roleMatches(el, role, queryFallbacks)) continue;
    if (!matchesState(el)) continue;
    if (hidden === false && isInaccessibleImpl(el)) continue;
    if (name !== undefined && !matches(aria.computeAccessibleName(el, pseudo), el.node, name as Matcher, identity)) continue;
    if (description !== undefined && !matches(aria.computeAccessibleDescription(el, pseudo), el.node, description as Matcher, identity)) continue;
    out.push(el.node);
  }
  return out;

  function matchesState(element: NodeImpl): boolean {
    if (selected !== undefined) {
      return selected === computeAriaSelected(element);
    }
    if (busy !== undefined) {
      return busy === computeAriaBusy(element);
    }
    if (checked !== undefined) {
      return checked === computeAriaChecked(element);
    }
    if (pressed !== undefined) {
      return pressed === computeAriaPressed(element);
    }
    if (current !== undefined) {
      return current === computeAriaCurrent(element);
    }
    if (expanded !== undefined) {
      return expanded === computeAriaExpanded(element);
    }
    if (level !== undefined) {
      return level === computeHeadingLevelImpl(element);
    }
    if (valueNow !== undefined || valueMax !== undefined || valueMin !== undefined || valueText !== undefined) {
      let valueMatches = true;
      if (valueNow !== undefined) {
        valueMatches &&= valueNow === computeAriaValueNow(element);
      }
      if (valueMax !== undefined) {
        valueMatches &&= valueMax === computeAriaValueMax(element);
      }
      if (valueMin !== undefined) {
        valueMatches &&= valueMin === computeAriaValueMin(element);
      }
      if (valueText !== undefined) {
        valueMatches &&= matches(computeAriaValueText(element) ?? null, element.node, valueText, identity);
      }
      return valueMatches;
    }
    // don't care if aria attributes are unspecified
    return true;
  }
}

const getNameHint = (name: ByRoleOptions["name"]): string => {
  let nameHint = "";
  if (name === undefined) {
    nameHint = "";
  } else if (typeof name === "string") {
    nameHint = ` and name "${name}"`;
  } else {
    nameHint = ` and name \`${name}\``;
  }
  return nameHint;
};

const getMultipleError: GetErrorFunction<[any, ByRoleOptions?]> = (c, role, { name } = {}) => {
  return `Found multiple elements with the role "${role}"${getNameHint(name)}`;
};

const getMissingError: GetErrorFunction<[any, ByRoleOptions?]> = (container, role, { hidden = getConfig().defaultHidden, name, description } = {}) => {
  if (getConfig()._disableExpensiveErrorDiagnostics) {
    return `Unable to find role="${role}"${getNameHint(name)}`;
  }

  let roles = "";
  Array.from(container.children as ArrayLike<any>).forEach((childElement) => {
    roles += prettyRoles(childElement, {
      hidden,
      includeDescription: description !== undefined,
    });
  });
  let roleMessage;

  if (roles.length === 0) {
    if (hidden === false) {
      roleMessage =
        "There are no accessible roles. But there might be some inaccessible roles. " +
        "If you wish to access them, then set the `hidden` option to `true`. " +
        "Learn more about this here: https://testing-library.com/docs/dom-testing-library/api-queries#byrole";
    } else {
      roleMessage = "There are no available roles.";
    }
  } else {
    roleMessage = `
Here are the ${hidden === false ? "accessible" : "available"} roles:

  ${roles.replace(/\n/g, "\n  ").replace(/\n\s\s\n/g, "\n\n")}
`.trim();
  }

  let nameHint = "";
  if (name === undefined) {
    nameHint = "";
  } else if (typeof name === "string") {
    nameHint = ` and name "${name}"`;
  } else {
    nameHint = ` and name \`${name}\``;
  }

  let descriptionHint = "";
  if (description === undefined) {
    descriptionHint = "";
  } else if (typeof description === "string") {
    descriptionHint = ` and description "${description}"`;
  } else {
    descriptionHint = ` and description \`${description}\``;
  }

  return `
Unable to find an ${hidden === false ? "accessible " : ""}element with the role "${role}"${nameHint}${descriptionHint}

${roleMessage}`.trim();
};

const queryAllByRoleWithSuggestions = wrapAllByQueryWithSuggestion(queryAllByRole, queryAllByRole.name, "queryAll");
const [queryByRole, getAllByRole, getByRole, findAllByRole, findByRole] = buildQueries(
  queryAllByRole,
  getMultipleError as GetErrorFunction<any[]>,
  getMissingError as GetErrorFunction<any[]>,
);

export { queryByRole, queryAllByRoleWithSuggestions as queryAllByRole, getAllByRole, getByRole, findAllByRole, findByRole };

// ARIA states and properties as Testing Library 10.4's `*ByRole` filters read them
// (role-helpers.js `computeAria*`), plus tri-state variants for jest-dom.
//
// Specs:
//   https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings
//   https://www.w3.org/TR/wai-aria-1.2/#aria-checked
//   https://www.w3.org/TR/wai-aria-1.2/#aria-selected
//   https://www.w3.org/TR/wai-aria-1.2/#aria-pressed
//   https://www.w3.org/TR/wai-aria-1.2/#aria-expanded
//   https://www.w3.org/TR/wai-aria-1.2/#aria-current
//   https://www.w3.org/TR/wai-aria-1.2/#aria-busy
//   https://www.w3.org/TR/wai-aria-1.2/#aria-level
//   https://www.w3.org/TR/wai-aria-1.2/#aria-valuenow
//   https://www.w3.org/TR/wai-aria-1.2/#aria-disabled

import { HTML_NS, T, ariaAttr, attr, type NodeImpl } from "@ctrl/dom/internal";
import { checkedness, indeterminate, optionSelected } from "./forms.ts";
import { anyTag } from "./role.ts";

function checkBooleanAttribute(impl: NodeImpl, name: string): boolean | undefined {
  const v = ariaAttr(impl, name);
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function isHTMLTag(impl: NodeImpl, tag: number): boolean {
  return impl.tag === tag && impl.ns === HTML_NS;
}

/** false/true if (not)selected, undefined if not selectable. `<option>` uses its selectedness. */
export function computeAriaSelected(impl: NodeImpl): boolean | undefined {
  // https://www.w3.org/TR/html-aam-1.0/#details-id-97
  if (isHTMLTag(impl, T.option)) return optionSelected(impl);
  return checkBooleanAttribute(impl, "aria-selected");
}

export function computeAriaBusy(impl: NodeImpl): boolean {
  return ariaAttr(impl, "aria-busy") === "true";
}

/**
 * false/true if (not)checked, undefined if not checkable. HTML `<input>` elements of every
 * type use their checkedness (undefined while indeterminate); others read `aria-checked`
 * (`"mixed"` → undefined, as in Testing Library).
 */
export function computeAriaChecked(impl: NodeImpl): boolean | undefined {
  // https://www.w3.org/TR/html-aam-1.0/#details-id-56, #details-id-67
  if (isHTMLTag(impl, T.input)) {
    if (indeterminate(impl)) return undefined;
    return checkedness(impl);
  }
  return checkBooleanAttribute(impl, "aria-checked");
}

/** Tri-state checked: true / false / "mixed" / undefined (not checkable). */
export function ariaCheckedState(impl: NodeImpl): boolean | "mixed" | undefined {
  if (isHTMLTag(impl, T.input)) {
    if (indeterminate(impl)) return "mixed";
    return checkedness(impl);
  }
  const v = ariaAttr(impl, "aria-checked");
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "mixed") return "mixed";
  return undefined;
}

export function computeAriaPressed(impl: NodeImpl): boolean | undefined {
  return checkBooleanAttribute(impl, "aria-pressed");
}

/** Tri-state pressed: true / false / "mixed" / undefined. */
export function ariaPressedState(impl: NodeImpl): boolean | "mixed" | undefined {
  const v = ariaAttr(impl, "aria-pressed");
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "mixed") return "mixed";
  return undefined;
}

export function computeAriaCurrent(impl: NodeImpl): boolean | string {
  return checkBooleanAttribute(impl, "aria-current") ?? ariaAttr(impl, "aria-current") ?? false;
}

export function computeAriaExpanded(impl: NodeImpl): boolean | undefined {
  return checkBooleanAttribute(impl, "aria-expanded");
}

/** Explicit `aria-level` (if truthy as a Number) or the h1–h6 level; undefined otherwise. */
export function computeHeadingLevel(impl: NodeImpl): number | undefined {
  // https://w3c.github.io/html-aam/#el-h1-h6
  const ariaLevel = ariaAttr(impl, "aria-level");
  if (ariaLevel !== null && ariaLevel !== "") {
    const n = Number(ariaLevel);
    if (n) return n;
  }
  if (impl.ns !== HTML_NS) return undefined; // tagName is only uppercase for HTML elements
  switch (impl.tag) {
    case T.h1:
      return 1;
    case T.h2:
      return 2;
    case T.h3:
      return 3;
    case T.h4:
      return 4;
    case T.h5:
      return 5;
    case T.h6:
      return 6;
    default:
      return undefined;
  }
}

export function computeAriaValueNow(impl: NodeImpl): number | undefined {
  const v = ariaAttr(impl, "aria-valuenow");
  return v === null ? undefined : +v;
}

export function computeAriaValueMax(impl: NodeImpl): number | undefined {
  const v = ariaAttr(impl, "aria-valuemax");
  return v === null ? undefined : +v;
}

export function computeAriaValueMin(impl: NodeImpl): number | undefined {
  const v = ariaAttr(impl, "aria-valuemin");
  return v === null ? undefined : +v;
}

export function computeAriaValueText(impl: NodeImpl): string | undefined {
  return ariaAttr(impl, "aria-valuetext") ?? undefined;
}

/**
 * dom-accessibility-api@0.6 `isDisabled`: `disabled` on button, fieldset, input, optgroup,
 * option, select, textarea (by local name), else `aria-disabled="true"`.
 * https://www.w3.org/TR/html-aam-1.0/#html-attribute-state-and-property-mappings
 */
export function isDisabledImpl(impl: NodeImpl): boolean {
  switch (anyTag(impl)) {
    case T.button:
    case T.fieldset:
    case T.input:
    case T.optgroup:
    case T.option:
    case T.select:
    case T.textarea:
      if (attr(impl, "disabled") !== null) return true;
  }
  return ariaAttr(impl, "aria-disabled") === "true";
}

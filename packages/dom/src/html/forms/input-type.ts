// The <input type> state table: https://html.spec.whatwg.org/#attr-input-type
//
// Types are small integers so hot code (value getters, validation, selectors, aria) can switch
// on them. `inputType(impl)` derives the state from the `type` attribute on every call; it is
// allocation-free for the common already-lowercase keywords.

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { asciiLowercase, attr } from "../../nodes/attributes.ts";

export const I_HIDDEN = 0;
export const I_TEXT = 1;
export const I_SEARCH = 2;
export const I_TEL = 3;
export const I_URL = 4;
export const I_EMAIL = 5;
export const I_PASSWORD = 6;
export const I_DATE = 7;
export const I_MONTH = 8;
export const I_WEEK = 9;
export const I_TIME = 10;
export const I_DATETIME_LOCAL = 11;
export const I_NUMBER = 12;
export const I_RANGE = 13;
export const I_COLOR = 14;
export const I_CHECKBOX = 15;
export const I_RADIO = 16;
export const I_FILE = 17;
export const I_SUBMIT = 18;
export const I_IMAGE = 19;
export const I_RESET = 20;
export const I_BUTTON = 21;

/** Canonical keyword per type id (what the `type` IDL attribute returns). */
// oxfmt-ignore
export const INPUT_TYPE_NAMES = [
  "hidden", "text", "search", "tel", "url", "email", "password", "date", "month", "week", "time",
  "datetime-local", "number", "range", "color", "checkbox", "radio", "file", "submit", "image",
  "reset", "button",
] as const;

const TYPE_IDS = new Map<string, number>();
for (let i = 0; i < INPUT_TYPE_NAMES.length; i++) TYPE_IDS.set(INPUT_TYPE_NAMES[i], i);

/** Type id for a `type` attribute value (missing/invalid → text). */
export function inputTypeFromAttr(value: string | null): number {
  if (value === null) return I_TEXT;
  const id = TYPE_IDS.get(value);
  if (id !== undefined) return id;
  // Keywords match ASCII case-insensitively (https://infra.spec.whatwg.org/#ascii-case-insensitive):
  // "weeK" with U+212A KELVIN SIGN is not "week" (String#toLowerCase would fold it to "k").
  return TYPE_IDS.get(asciiLowercase(value)) ?? I_TEXT;
}

/** The input element's current type state. */
export function inputType(impl: NodeImpl): number {
  return inputTypeFromAttr(attr(impl, "type"));
}

// Value modes — https://html.spec.whatwg.org/#dom-input-value
export const MODE_VALUE = 0;
export const MODE_DEFAULT = 1;
export const MODE_DEFAULT_ON = 2;
export const MODE_FILENAME = 3;

export function valueMode(type: number): number {
  switch (type) {
    case I_HIDDEN:
    case I_SUBMIT:
    case I_IMAGE:
    case I_RESET:
    case I_BUTTON:
      return MODE_DEFAULT;
    case I_CHECKBOX:
    case I_RADIO:
      return MODE_DEFAULT_ON;
    case I_FILE:
      return MODE_FILENAME;
    default:
      return MODE_VALUE;
  }
}

/** Text, Search, Telephone, URL, Password: selection APIs apply (https://html.spec.whatwg.org/#do-not-apply). */
export function supportsSelectionType(type: number): boolean {
  return type === I_TEXT || type === I_SEARCH || type === I_TEL || type === I_URL || type === I_PASSWORD;
}

/** Types whose value is edited as text in a browser (also email/number which reject the selection APIs). */
export function isTextualType(type: number): boolean {
  return type >= I_TEXT && type <= I_PASSWORD;
}

/** date, month, week, time, datetime-local, number, range. */
export function isNumericType(type: number): boolean {
  return type >= I_DATE && type <= I_RANGE;
}

/** Text, Search, URL, Telephone, E-mail, Password: maxlength/minlength/pattern/size/placeholder apply. */
export function lengthApplies(type: number): boolean {
  return type >= I_TEXT && type <= I_PASSWORD;
}

/** readonly applies: text-ish, date-ish and number. https://html.spec.whatwg.org/#the-readonly-attribute */
export function readonlyApplies(type: number): boolean {
  return type >= I_TEXT && type <= I_NUMBER;
}

/** required applies. */
export function requiredApplies(type: number): boolean {
  return (type >= I_TEXT && type <= I_NUMBER) || type === I_CHECKBOX || type === I_RADIO || type === I_FILE;
}

/** placeholder applies: text, search, url, tel, email, password, number. */
export function placeholderApplies(type: number): boolean {
  return (type >= I_TEXT && type <= I_PASSWORD) || type === I_NUMBER;
}

/** list applies. */
export function listApplies(type: number): boolean {
  return (type >= I_TEXT && type <= I_EMAIL) || (type >= I_DATE && type <= I_COLOR);
}

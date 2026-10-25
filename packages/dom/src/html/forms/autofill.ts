// The `autocomplete` IDL attribute of input, select and textarea: the element's IDL-exposed
// autofill value. https://html.spec.whatwg.org/#dom-fe-autocomplete,
// https://html.spec.whatwg.org/#autofill-processing-model

import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { asciiLowercase, attr, setAttribute, splitOnAsciiWhitespace } from "../../nodes/attributes.ts";
import { T } from "../../nodes/tags.ts";
import { I_HIDDEN, inputType } from "./input-type.ts";
import { $impl } from "../../keys.ts";

const OFF = 0;
const AUTOMATIC = 1;
const NORMAL = 2;
const CONTACT = 3;
const CREDENTIAL = 4;

/** Autofill field names → category (https://html.spec.whatwg.org/#autofill-field). */
const CATEGORY = new Map<string, number>([
  ["off", OFF],
  ["on", AUTOMATIC],
  ["webauthn", CREDENTIAL],
]);
// oxfmt-ignore
for (const f of [
  "name", "honorific-prefix", "given-name", "additional-name", "family-name", "honorific-suffix", "nickname",
  "organization-title", "username", "new-password", "current-password", "one-time-code", "organization",
  "street-address", "address-line1", "address-line2", "address-line3", "address-level4", "address-level3",
  "address-level2", "address-level1", "country", "country-name", "postal-code", "cc-name", "cc-given-name",
  "cc-additional-name", "cc-family-name", "cc-number", "cc-exp", "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type",
  "transaction-currency", "transaction-amount", "language", "bday", "bday-day", "bday-month", "bday-year", "sex",
  "url", "photo",
]) CATEGORY.set(f, NORMAL);
// oxfmt-ignore
for (const f of ["tel", "tel-country-code", "tel-national", "tel-area-code", "tel-local", "tel-local-prefix", "tel-local-suffix", "tel-extension", "email", "impp"]) {
  CATEGORY.set(f, CONTACT);
}
/** Maximum tokens per category. */
const MAX_TOKENS = [1, 1, 3, 4, 5];

/**
 * https://html.spec.whatwg.org/#autofill-processing-model — the IDL-exposed autofill value
 * ("" whenever the algorithm jumps to the step labeled "default").
 */
export function idlExposedAutofillValue(el: NodeImpl): string {
  // Step 1.
  const value = attr(el, "autocomplete");
  if (value === null) return "";
  // Steps 2–3.
  const tokens = splitOnAsciiWhitespace(value);
  if (tokens.length === 0) return "";
  // Steps 4–7.
  let index = tokens.length - 1;
  const field = asciiLowercase(tokens[index]);
  let category = CATEGORY.get(field);
  if (category === undefined || tokens.length > MAX_TOKENS[category]) return "";
  // Steps 8–10: off/on; an input type=hidden wears the autofill anchor mantle.
  if (category === OFF || category === AUTOMATIC) {
    if (el.tag === T.input && inputType(el) === I_HIDDEN) return "";
    return field;
  }
  // Step 13.
  let idl = field;
  // Step 14: credentials.
  if (category === CREDENTIAL) {
    if (index === 0) return idl;
    index--;
    const token = asciiLowercase(tokens[index]);
    category = CATEGORY.get(token);
    if (category !== NORMAL && category !== CONTACT) return "";
    if (index > MAX_TOKENS[category] - 1) return "";
    idl = token + " " + idl;
  }
  // Steps 15–16.
  if (index === 0) return idl;
  index--;
  // Step 17: contact hint.
  let token = asciiLowercase(tokens[index]);
  if (
    category === CONTACT &&
    (token === "home" || token === "work" || token === "mobile" || token === "fax" || token === "pager")
  ) {
    idl = token + " " + idl;
    if (index === 0) return idl;
    index--;
    token = asciiLowercase(tokens[index]);
  }
  // Step 18: mode.
  if (token === "shipping" || token === "billing") {
    idl = token + " " + idl;
    if (index === 0) return idl;
    index--;
    token = asciiLowercase(tokens[index]);
  }
  // Steps 19–20: only a section-* token may remain.
  if (index !== 0 || !token.startsWith("section-")) return "";
  return token + " " + idl;
}

/** Install the `autocomplete` accessor (getter: IDL-exposed autofill value; setter: reflects). */
export function installAutocomplete(C: { prototype: object }): void {
  Object.defineProperty(C.prototype, "autocomplete", {
    get(this: { [$impl]: NodeImpl }) {
      return idlExposedAutofillValue(this[$impl]);
    },
    set(this: { [$impl]: NodeImpl }, v: string) {
      setAttribute(this[$impl], "autocomplete", String(v));
    },
    enumerable: true,
    configurable: true,
  });
}

// Forms area entry point: https://html.spec.whatwg.org/#forms
//
// `formElementClasses` maps HTML local names to their interface classes; src/html/registry.ts
// (html-elements agent) merges it into the element interface table.

import type { ElementConstructor } from "../../nodes/create.ts";
import { HTMLInputElement } from "./HTMLInputElement.ts";
import { HTMLTextAreaElement } from "./HTMLTextAreaElement.ts";
import { HTMLSelectElement } from "./HTMLSelectElement.ts";
import { HTMLOptGroupElement, HTMLOptionElement, Option } from "./HTMLOptionElement.ts";
import { HTMLButtonElement } from "./HTMLButtonElement.ts";
import { HTMLLabelElement } from "./HTMLLabelElement.ts";
import { HTMLFieldSetElement, HTMLLegendElement } from "./HTMLFieldSetElement.ts";
import { HTMLDataListElement, HTMLMeterElement, HTMLOutputElement, HTMLProgressElement } from "./HTMLOutputElement.ts";
import { HTMLFormElement } from "./HTMLFormElement.ts";

export const formElementClasses = new Map<string, ElementConstructor>([
  ["input", HTMLInputElement],
  ["textarea", HTMLTextAreaElement],
  ["select", HTMLSelectElement],
  ["option", HTMLOptionElement],
  ["optgroup", HTMLOptGroupElement],
  ["button", HTMLButtonElement],
  ["label", HTMLLabelElement],
  ["fieldset", HTMLFieldSetElement],
  ["legend", HTMLLegendElement],
  ["output", HTMLOutputElement],
  ["progress", HTMLProgressElement],
  ["meter", HTMLMeterElement],
  ["datalist", HTMLDataListElement],
  ["form", HTMLFormElement],
]);

export {
  HTMLInputElement,
  HTMLTextAreaElement,
  HTMLSelectElement,
  HTMLOptionElement,
  HTMLOptGroupElement,
  Option,
  HTMLButtonElement,
  HTMLLabelElement,
  HTMLFieldSetElement,
  HTMLLegendElement,
  HTMLOutputElement,
  HTMLProgressElement,
  HTMLMeterElement,
  HTMLDataListElement,
  HTMLFormElement,
};
export { ValidityState } from "./validation.ts";
export { FormData } from "./FormData.ts";
export { HTMLFormControlsCollection, HTMLOptionsCollection, RadioNodeList } from "./collections.ts";
export { implicitSubmission, constructEntryList, defaultButton } from "./form-submission.ts";
export { formOwner, labeledControl, isLabelable, isListed, isSubmittable, isResettable } from "./form-associated.ts";

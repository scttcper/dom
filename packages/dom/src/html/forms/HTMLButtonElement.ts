// https://html.spec.whatwg.org/#the-button-element

import { buttonInvokerActivation } from "../invokers.ts";
import { HTMLElement } from "../HTMLElement.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import type { Event } from "../../events/Event.ts";
import { F_CONNECTED } from "../../nodes/constants.ts";
import { bool, enumerated, str } from "../reflect.ts";
import { installDefaults, reflectActionURL } from "./common.ts";
import { formOwner, hasDatalistAncestor, isActuallyDisabled } from "./form-associated.ts";
import { labelsMember, type LabelsNodeList } from "./collections.ts";
import { buttonType, FORM_ENCTYPE, FORM_METHOD, resetForm, submitForm } from "./form-submission.ts";
import { installConstraintValidation, type ConstraintValidation, type ValidityState } from "./validation.ts";
import { $customValidity, $impl, $labels, $validity } from "../../keys.ts";

export class HTMLButtonElement extends HTMLElement {
  /** The custom validity error message; absent while it is the empty string. */
  declare [$customValidity]?: string;
  declare [$validity]?: ValidityState | null;
  declare [$labels]?: LabelsNodeList | null;

  /** https://html.spec.whatwg.org/#dom-button-type */
  get type(): string {
    return buttonType(this[$impl]);
  }

  set type(value: string) {
    this.setAttribute("type", String(value));
  }

  declare readonly labels: LabelsNodeList;

  /** https://html.spec.whatwg.org/#dom-fs-formaction */
  get formAction(): string {
    return reflectActionURL(this[$impl], "formaction");
  }

  set formAction(v: string) {
    this.setAttribute("formaction", String(v));
  }

  declare disabled: boolean;
  declare formEnctype: string;
  declare formMethod: string;
  declare formNoValidate: boolean;
  declare formTarget: string;
  declare name: string;
  declare value: string;

  // --- constraint validation -----------------------------------------------------------------

  _barredFromValidation(): boolean {
    const impl = this[$impl];
    return buttonType(impl) !== "submit" || isActuallyDisabled(impl) || hasDatalistAncestor(impl);
  }

  // --- activation behavior: https://html.spec.whatwg.org/#the-button-element:activation-behaviour

  get _hasActivationBehavior(): boolean {
    return true;
  }

  _activationBehavior(_event: Event | null): void {
    const impl = this[$impl];
    if (isActuallyDisabled(impl)) return;
    const form = formOwner(impl);
    if (form !== null && (impl.flags & F_CONNECTED) !== 0) {
      switch (buttonType(impl)) {
        case "submit":
          submitForm(form, impl, false);
          return;
        case "reset":
          resetForm(form);
          return;
      }
    }
    // Steps 4–6: commandfor / popovertarget (html-elements, src/html/invokers.ts).
    buttonInvokerActivation(impl, (_event?.target as unknown as { [$impl]?: NodeImpl } | null)?.[$impl] ?? null);
  }
}

export interface HTMLButtonElement extends ConstraintValidation {}
installConstraintValidation(HTMLButtonElement);
installDefaults(HTMLButtonElement, labelsMember);

str(HTMLButtonElement, "formTarget=formtarget name value");
bool(HTMLButtonElement, "disabled formNoValidate=formnovalidate");
enumerated(HTMLButtonElement, "formEnctype=formenctype", FORM_ENCTYPE);
enumerated(HTMLButtonElement, "formMethod=formmethod", FORM_METHOD);

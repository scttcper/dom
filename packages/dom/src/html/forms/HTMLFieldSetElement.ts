// https://html.spec.whatwg.org/#the-fieldset-element
// https://html.spec.whatwg.org/#the-legend-element

import { HTMLElement } from "../HTMLElement.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import { HTMLCollection } from "../../collections/HTMLCollection.ts";
import { T } from "../../nodes/tags.ts";
import { bool, str } from "../reflect.ts";
import { formOwner, isListed } from "./form-associated.ts";
import { installConstraintValidation, V_CUSTOM_ERROR, type ConstraintValidation, type ValidityState } from "./validation.ts";
import { $customValidity, $elements, $impl, $validity } from "../../keys.ts";

export class HTMLFieldSetElement extends HTMLElement {
  [$customValidity]: string;
  [$validity]: ValidityState | null;
  [$elements]: HTMLCollection | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$customValidity] = "";
    this[$validity] = null;
    this[$elements] = null;
  }

  get type(): string {
    return "fieldset";
  }

  get form(): Element | null {
    const owner = formOwner(this[$impl]);
    return owner === null ? null : (owner.node as Element);
  }

  /** https://html.spec.whatwg.org/#dom-fieldset-elements — listed descendants. */
  get elements(): HTMLCollection {
    return (this[$elements] ??= HTMLCollection._descendants(this[$impl], isListed));
  }

  declare disabled: boolean;
  declare name: string;

  // Fieldsets are always barred from constraint validation.
  _barredFromValidation(): boolean {
    return true;
  }

  _validityFlags(): number {
    return this[$customValidity] === "" ? 0 : V_CUSTOM_ERROR;
  }

  _validationMessage(_flags: number): string {
    return this[$customValidity];
  }
}

export interface HTMLFieldSetElement extends ConstraintValidation {}
installConstraintValidation(HTMLFieldSetElement);

bool(HTMLFieldSetElement, "disabled");
str(HTMLFieldSetElement, "name");

export class HTMLLegendElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-legend-form */
  get form(): Element | null {
    const p = this[$impl].parent;
    if (p === null || p.tag !== T.fieldset) return null;
    const owner = formOwner(p);
    return owner === null ? null : (owner.node as Element);
  }

  declare align: string;
}

str(HTMLLegendElement, "align");

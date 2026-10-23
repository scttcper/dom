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

export class HTMLFieldSetElement extends HTMLElement {
  _customValidity: string;
  _validity: ValidityState | null;
  _elements: HTMLCollection | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this._customValidity = "";
    this._validity = null;
    this._elements = null;
  }

  get type(): string {
    return "fieldset";
  }

  get form(): Element | null {
    const owner = formOwner(this._impl);
    return owner === null ? null : (owner.node as Element);
  }

  /** https://html.spec.whatwg.org/#dom-fieldset-elements — listed descendants. */
  get elements(): HTMLCollection {
    return (this._elements ??= HTMLCollection._descendants(this._impl, isListed));
  }

  declare disabled: boolean;
  declare name: string;

  // Fieldsets are always barred from constraint validation.
  _barredFromValidation(): boolean {
    return true;
  }

  _validityFlags(): number {
    return this._customValidity === "" ? 0 : V_CUSTOM_ERROR;
  }

  _validationMessage(_flags: number): string {
    return this._customValidity;
  }
}

export interface HTMLFieldSetElement extends ConstraintValidation {}
installConstraintValidation(HTMLFieldSetElement);

bool(HTMLFieldSetElement, "disabled");
str(HTMLFieldSetElement, "name");

export class HTMLLegendElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-legend-form */
  get form(): Element | null {
    const p = this._impl.parent;
    if (p === null || p.tag !== T.fieldset) return null;
    const owner = formOwner(p);
    return owner === null ? null : (owner.node as Element);
  }

  declare align: string;
}

str(HTMLLegendElement, "align");

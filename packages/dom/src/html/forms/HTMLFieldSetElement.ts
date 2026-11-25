// https://html.spec.whatwg.org/#the-fieldset-element
// https://html.spec.whatwg.org/#the-legend-element

import { HTMLElement } from "../HTMLElement.ts";
import type { Document } from "../../nodes/Document.ts";
import type { Element } from "../../nodes/Element.ts";
import { HTMLCollection } from "../../collections/HTMLCollection.ts";
import { T } from "../../nodes/tags.ts";
import { bool, str } from "../reflect.ts";
import { isListed } from "./form-associated.ts";
import { installConstraintValidation, type ConstraintValidation, type ValidityState } from "./validation.ts";
import { $customValidity, $elements, $impl, $validity } from "../../keys.ts";

export class HTMLFieldSetElement extends HTMLElement {
  /** The custom validity error message; absent while it is the empty string. */
  declare [$customValidity]?: string;
  declare [$validity]?: ValidityState | null;
  declare [$elements]: HTMLCollection | null;

  /** @internal Use Document.createElement. */
  constructor(doc: Document, localName: string, ns: string | null, prefix: string | null) {
    super(doc, localName, ns, prefix);
    this[$elements] = null;
  }

  get type(): string {
    return "fieldset";
  }

  /** https://html.spec.whatwg.org/#dom-fieldset-elements — listed descendants. */
  get elements(): HTMLCollection {
    return (this[$elements] ??= HTMLCollection._descendants(this[$impl], false, isListed));
  }

  declare disabled: boolean;
  declare name: string;

  // Fieldsets are always barred from constraint validation (installConstraintValidation).
}

export interface HTMLFieldSetElement extends ConstraintValidation {}
installConstraintValidation(HTMLFieldSetElement);

bool(HTMLFieldSetElement, "disabled");
str(HTMLFieldSetElement, "name");

export class HTMLLegendElement extends HTMLElement {
  /** https://html.spec.whatwg.org/#dom-legend-form */
  get form(): Element | null {
    const p = this[$impl].parent;
    return p === null || p.tag !== T.fieldset ? null : (p.node as HTMLFieldSetElement).form;
  }

  declare align: string;
}

str(HTMLLegendElement, "align");

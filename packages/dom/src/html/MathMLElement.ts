// https://w3c.github.io/mathml-core/#dom-mathmlelement — every MathML-namespace element.

import { Element } from "../nodes/Element.ts";
import { CSSStyleDeclaration } from "../css/CSSStyleDeclaration.ts";
import { installHTMLOrSVGElement } from "./HTMLElement.ts";

export class MathMLElement extends Element {
  get style(): CSSStyleDeclaration {
    return (this._style ??= new CSSStyleDeclaration(this));
  }

  set style(value: string) {
    this.style.cssText = String(value);
  }
}
installHTMLOrSVGElement(MathMLElement);

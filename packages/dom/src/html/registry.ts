// Element interface lookup: (namespace, localName) → wrapper class.
// https://html.spec.whatwg.org/#elements-in-the-dom
// https://html.spec.whatwg.org/#element-interfaces (the element index)
//
// - HTML namespace: the table below (plus the forms area's `formElementClasses`); names not in
//   it are HTMLElement when they are valid custom element names, HTMLUnknownElement otherwise.
// - SVG namespace: svgElements, SVGElement for the rest.
// - MathML namespace: MathMLElement.
// - Anything else: Element.
//
// This module installs itself into nodes/create.ts when evaluated (see the note there), and
// wires the html area into the window (customElements).

import { HTML_NS, MATHML_NS, SVG_NS } from "../nodes/constants.ts";
import { Element } from "../nodes/Element.ts";
import { setElementClassLookup, type ElementConstructor } from "../nodes/create.ts";
import { HTMLElement } from "./HTMLElement.ts";
import * as E from "./elements.ts";
import { HTMLAnchorElement, HTMLAreaElement } from "./anchor.ts";
import { HTMLAudioElement, HTMLMediaElement, HTMLVideoElement } from "./media.ts";
import { HTMLDetailsElement, HTMLDialogElement, HTMLSummaryElement } from "./interactive.ts";
import { HTMLTemplateElement } from "./template.ts";
import { HTMLSlotElement } from "./slot.ts";
import { HTMLLinkElement, HTMLScriptElement, HTMLStyleElement, HTMLTitleElement } from "./resources.ts";
import { SVGElement, SVGGeometryElement, SVGGradientElement, SVGGraphicsElement, SVGTextContentElement, SVGTextPositioningElement, svgElements } from "./SVGElement.ts";
import { MathMLElement } from "./MathMLElement.ts";
import { formElementClasses } from "./forms/index.ts";
import { installCommandInvoker, installPopoverInvoker } from "./invokers.ts";
import { customElementRegistryFor, isValidCustomElementName } from "./custom-elements.ts";
import { windowHooks } from "../window/hooks.ts";

type Ctor = ElementConstructor;

const html = new Map<string, Ctor>([
  ["a", HTMLAnchorElement],
  ["area", HTMLAreaElement],
  ["audio", HTMLAudioElement],
  ["base", E.HTMLBaseElement],
  ["blockquote", E.HTMLQuoteElement],
  ["q", E.HTMLQuoteElement],
  ["body", E.HTMLBodyElement],
  ["br", E.HTMLBRElement],
  ["canvas", E.HTMLCanvasElement],
  ["caption", E.HTMLTableCaptionElement],
  ["col", E.HTMLTableColElement],
  ["colgroup", E.HTMLTableColElement],
  ["data", E.HTMLDataElement],
  ["del", E.HTMLModElement],
  ["ins", E.HTMLModElement],
  ["details", HTMLDetailsElement],
  ["dialog", HTMLDialogElement],
  ["div", E.HTMLDivElement],
  ["dl", E.HTMLDListElement],
  ["embed", E.HTMLEmbedElement],
  ["h1", E.HTMLHeadingElement],
  ["h2", E.HTMLHeadingElement],
  ["h3", E.HTMLHeadingElement],
  ["h4", E.HTMLHeadingElement],
  ["h5", E.HTMLHeadingElement],
  ["h6", E.HTMLHeadingElement],
  ["head", E.HTMLHeadElement],
  ["hr", E.HTMLHRElement],
  ["html", E.HTMLHtmlElement],
  ["iframe", E.HTMLIFrameElement],
  ["img", E.HTMLImageElement],
  ["li", E.HTMLLIElement],
  ["link", HTMLLinkElement],
  ["map", E.HTMLMapElement],
  ["menu", E.HTMLMenuElement],
  ["meta", E.HTMLMetaElement],
  ["object", E.HTMLObjectElement],
  ["ol", E.HTMLOListElement],
  ["p", E.HTMLParagraphElement],
  ["param", E.HTMLParamElement],
  ["picture", E.HTMLPictureElement],
  ["pre", E.HTMLPreElement],
  ["listing", E.HTMLPreElement],
  ["xmp", E.HTMLPreElement],
  ["script", HTMLScriptElement],
  ["slot", HTMLSlotElement],
  ["source", E.HTMLSourceElement],
  ["span", E.HTMLSpanElement],
  ["style", HTMLStyleElement],
  ["table", E.HTMLTableElement],
  ["tbody", E.HTMLTableSectionElement],
  ["thead", E.HTMLTableSectionElement],
  ["tfoot", E.HTMLTableSectionElement],
  ["td", E.HTMLTableCellElement],
  ["th", E.HTMLTableCellElement],
  ["template", HTMLTemplateElement],
  ["time", E.HTMLTimeElement],
  ["title", HTMLTitleElement],
  ["tr", E.HTMLTableRowElement],
  ["track", E.HTMLTrackElement],
  ["ul", E.HTMLUListElement],
  ["video", HTMLVideoElement],
  ["dir", E.HTMLDirectoryElement],
  ["font", E.HTMLFontElement],
  ["frame", E.HTMLFrameElement],
  ["frameset", E.HTMLFrameSetElement],
  ["marquee", E.HTMLMarqueeElement],
  ["summary", HTMLSummaryElement],
]);

// Elements whose interface is HTMLElement itself.
for (const name of [
  "abbr", "address", "article", "aside", "b", "bdi", "bdo", "cite", "code", "dd", "dfn", "dt", "em",
  "figcaption", "figure", "footer", "header", "hgroup", "i", "kbd", "main", "mark", "nav", "noscript",
  "rp", "rt", "ruby", "s", "samp", "search", "section", "small", "strong", "sub", "sup", "u", "var",
  "wbr", "acronym", "basefont", "big", "center", "nobr", "noembed", "noframes", "plaintext", "rb",
  "rtc", "strike", "tt", "selectedcontent",
]) {
  html.set(name, HTMLElement);
}

// Form elements (owned by src/html/forms) override anything above.
for (const [name, C] of formElementClasses) html.set(name, C);

// Invoker attributes on form controls (https://html.spec.whatwg.org/#popoverinvokerelement).
installPopoverInvoker(html.get("button")!);
installPopoverInvoker(html.get("input")!);
installCommandInvoker(html.get("button")!);

/** https://html.spec.whatwg.org/#element-interface */
export function elementClassFor(localName: string, ns: string | null): Ctor {
  if (ns === HTML_NS) {
    const C = html.get(localName);
    if (C !== undefined) return C;
    return localName.includes("-") && isValidCustomElementName(localName) ? HTMLElement : E.HTMLUnknownElement;
  }
  if (ns === SVG_NS) return (svgElements.get(localName) as Ctor | undefined) ?? SVGElement;
  if (ns === MATHML_NS) return MathMLElement;
  return Element;
}

setElementClassLookup(elementClassFor);

// --- interface queries for the custom element constructor steps -----------------------------

let builtins: Set<Function> | null = null;

/** Whether `C` is one of the HTML element interfaces in the table (or HTMLElement/HTMLUnknownElement). */
export function isBuiltinInterface(C: Function): boolean {
  if (builtins === null) {
    builtins = new Set<Function>([HTMLElement, E.HTMLUnknownElement, HTMLMediaElement]);
    for (const c of html.values()) builtins.add(c);
  }
  return builtins.has(C);
}

/** Local names whose element interface is `C` (https://html.spec.whatwg.org/#html-element-constructors step 5). */
export function localNamesForInterface(C: Function): string[] {
  const out: string[] = [];
  for (const [name, c] of html) if (c === C) out.push(name);
  return out;
}

// --- integration with other areas -----------------------------------------------------------

windowHooks.createCustomElementRegistry = (window) => customElementRegistryFor(window);

// --- class strings ([object HTMLDivElement]) -------------------------------------------------
// https://webidl.spec.whatwg.org/#dfn-class-string

function setClassString(C: Function): void {
  const proto = (C as { prototype: object }).prototype;
  if (!Object.hasOwn(proto, Symbol.toStringTag)) {
    Object.defineProperty(proto, Symbol.toStringTag, { value: C.name, configurable: true });
  }
}

for (const C of [HTMLElement, E.HTMLUnknownElement, HTMLMediaElement, SVGElement, MathMLElement, ...html.values(), ...svgElements.values()]) {
  if (C.name !== "HTMLElement" || C === HTMLElement) setClassString(C);
}
for (const C of [SVGGraphicsElement, SVGGeometryElement, SVGTextContentElement, SVGTextPositioningElement, SVGGradientElement]) setClassString(C);

// Public CSSOM exports and the css area's registrations with other areas:
// - src/html `styleSheetHooks` (<style>/<link> sheets),
// - src/window `windowHooks.getComputedStyle` / `windowHooks.evaluateMediaQuery`,
// - `styleSheets` / `adoptedStyleSheets` on Document and ShadowRoot
//   (https://drafts.csswg.org/cssom/#extensions-to-the-document-or-shadow-root-interface).

import { Document } from "../nodes/Document.ts";
import { ShadowRoot } from "../nodes/ShadowRoot.ts";
import type { Element } from "../nodes/Element.ts";
import { styleSheetHooks } from "../html/resources.ts";
import { windowHooks } from "../window/hooks.ts";
import { createLinkSheet, createOwnerSheet, removeOwnerSheet, styleSheetsOf, adoptedStyleSheetsOf, setAdoptedStyleSheets } from "./stylesheets.ts";
import { getComputedStyle } from "./computed.ts";
import { matchMediaText } from "./media.ts";
import { installElementView, installHTMLElementView } from "./view.ts";
import "./resize-observer.ts";
import { HTMLElement as HTMLElementClass } from "../html/HTMLElement.ts";
import { Element as ElementClass } from "../nodes/Element.ts";
import { setComputedColorMode } from "./cascade.ts";
import { $impl } from "../keys.ts";

export { CSSStyleDeclaration } from "./CSSStyleDeclaration.ts";
export {
  CSSRule,
  CSSRuleList,
  CSSGroupingRule,
  CSSConditionRule,
  CSSStyleRule,
  CSSNestedDeclarations,
  CSSMediaRule,
  CSSSupportsRule,
  CSSContainerRule,
  CSSLayerBlockRule,
  CSSLayerStatementRule,
  CSSScopeRule,
  CSSStartingStyleRule,
  CSSImportRule,
  CSSNamespaceRule,
  CSSFontFaceRule,
  CSSPageRule,
  CSSPropertyRule,
  CSSKeyframesRule,
  CSSKeyframeRule,
  StyleSheet,
  CSSStyleSheet,
  StyleSheetList,
  MediaList,
} from "./cssom.ts";
export { CSS } from "./CSS.ts";
export { getComputedStyle } from "./computed.ts";

styleSheetHooks.createSheet = createOwnerSheet;
styleSheetHooks.removeSheet = removeOwnerSheet;
styleSheetHooks.createLinkSheet = createLinkSheet;
windowHooks.getComputedStyle = (element, pseudo) => getComputedStyle(element as Element, pseudo);
windowHooks.evaluateMediaQuery = (query, env) => matchMediaText(query, env);
windowHooks.setComputedColorMode = setComputedColorMode;

installElementView(ElementClass);
installHTMLElementView(HTMLElementClass);

/** https://drafts.csswg.org/cssom-view/#dom-document-scrollingelement */
if (!Object.hasOwn(Document.prototype, "scrollingElement")) {
  Object.defineProperty(Document.prototype, "scrollingElement", {
    get(this: Document) {
      return this.compatMode === "BackCompat" ? this.body : this.documentElement;
    },
    enumerable: true,
    configurable: true,
  });
}

for (const C of [Document, ShadowRoot]) {
  const proto = C.prototype as object;
  if (!Object.hasOwn(proto, "styleSheets")) {
    Object.defineProperty(proto, "styleSheets", {
      get(this: { [$impl]: import("../nodes/NodeImpl.ts").NodeImpl }) {
        return styleSheetsOf(this[$impl]);
      },
      enumerable: true,
      configurable: true,
    });
  }
  if (!Object.hasOwn(proto, "adoptedStyleSheets")) {
    Object.defineProperty(proto, "adoptedStyleSheets", {
      get(this: { [$impl]: import("../nodes/NodeImpl.ts").NodeImpl }) {
        return adoptedStyleSheetsOf(this[$impl]);
      },
      set(this: { [$impl]: import("../nodes/NodeImpl.ts").NodeImpl }, value: unknown) {
        setAdoptedStyleSheets(this[$impl], value);
      },
      enumerable: true,
      configurable: true,
    });
  }
}

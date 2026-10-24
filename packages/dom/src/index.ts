// Public entry point of @rtd/dom.

// Evaluation order matters (see nodes/create.ts): base node modules first, then the element
// registry, which installs the element-class lookup used by createElement and the parser.
import "./nodes/Node.ts";
import "./html/registry.ts";

export { createWindow, Window, type WindowOptions } from "./window/Window.ts";
export type { CompatProfile } from "./window/compat.ts";
export { setCurrentWindow, currentWindow, currentDocument } from "./window/current.ts";
export { EventTarget } from "./events/EventTarget.ts";
export { Node } from "./nodes/Node.ts";
export { Element } from "./nodes/Element.ts";
export { Document, DOMImplementation, XMLDocument } from "./nodes/Document.ts";
// https://html.spec.whatwg.org/#the-document-object: "Window objects must also have a writable,
// configurable, non-enumerable property named HTMLDocument whose value is the Document interface object."
export { Document as HTMLDocument } from "./nodes/Document.ts";
export { DocumentFragment } from "./nodes/DocumentFragment.ts";
export { DocumentType } from "./nodes/DocumentType.ts";
export { CharacterData, Text, CDATASection, Comment, ProcessingInstruction } from "./nodes/CharacterData.ts";
export { Attr } from "./nodes/Attr.ts";
export { ShadowRoot } from "./nodes/ShadowRoot.ts";
export { NodeList } from "./collections/NodeList.ts";
export { HTMLCollection } from "./collections/HTMLCollection.ts";
export { HTMLElement } from "./html/HTMLElement.ts";
export { SVGElement } from "./html/SVGElement.ts";
// --- html-elements area ---
export * from "./html/index.ts";

// --- window area ---
export { installGlobals } from "./window/globals.ts";
export { currentWindowOrNull } from "./window/current.ts";
export { Location } from "./window/Location.ts";
export { History } from "./window/History.ts";
export { Navigator, Clipboard, ClipboardItem } from "./window/Navigator.ts";
export { Screen, VisualViewport } from "./window/Screen.ts";
export { Storage } from "./window/Storage.ts";
export { MediaQueryList } from "./window/media.ts";
export { XMLHttpRequest, XMLHttpRequestEventTarget, XMLHttpRequestUpload } from "./window/xhr.ts";
export { FileReader } from "./window/FileReader.ts";
export { FileList } from "./window/FileList.ts";
export { MediaQueryListEvent } from "./window/events.ts";
export { DOMParser, XMLSerializer } from "./window/fallbacks.ts";
export { ResizeObserver, IntersectionObserver } from "./window/observers.ts";
export { DOMPointReadOnly, DOMPoint, DOMRectReadOnly, DOMRect, DOMRectList, DOMMatrixReadOnly, DOMMatrix, type DOMRectInit } from "./window/geometry.ts";

// --- events area ---
export {
  Event,
} from "./events/Event.ts";
export {
  UIEvent,
  FocusEvent,
  MouseEvent,
  PointerEvent,
  WheelEvent,
  DragEvent,
  KeyboardEvent,
  InputEvent,
  CompositionEvent,
  TextEvent,
  Touch,
  TouchList,
  TouchEvent,
  ClipboardEvent,
} from "./events/UIEvents.ts";
export {
  CustomEvent,
  ErrorEvent,
  PromiseRejectionEvent,
  MessageEvent,
  ProgressEvent,
  AnimationEvent,
  TransitionEvent,
  PopStateEvent,
  HashChangeEvent,
  PageTransitionEvent,
  StorageEvent,
  SubmitEvent,
  FormDataEvent,
  ToggleEvent,
  BeforeUnloadEvent,
  CloseEvent,
} from "./events/events.ts";
export { DataTransfer, DataTransferItemList, DataTransferItem } from "./events/DataTransfer.ts";

// --- forms area (html-forms agent) ---
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
  ValidityState,
  FormData,
  HTMLFormControlsCollection,
  HTMLOptionsCollection,
  RadioNodeList,
} from "./html/forms/index.ts";

// --- dom-core: collections, observers, ranges, traversal, geometry ---
export { DOMTokenList } from "./collections/DOMTokenList.ts";
export { DOMStringMap } from "./collections/DOMStringMap.ts";
export { NamedNodeMap } from "./collections/NamedNodeMap.ts";
export { MutationObserver, type MutationObserverInit, type MutationCallback } from "./observers/MutationObserver.ts";
export { MutationRecord } from "./observers/MutationRecord.ts";
export { AbstractRange, Range, StaticRange, type StaticRangeInit } from "./traversal/Range.ts";
export { Selection } from "./traversal/Selection.ts";
export { NodeFilter, NodeIterator, TreeWalker } from "./traversal/TreeWalker.ts";

// --- window area: expose this namespace to window/interfaces.ts (interface objects, hooks) ---
import * as rtdDomNamespace from "./index.ts";
import { registerDomNamespace } from "./window/interfaces.ts";
registerDomNamespace(rtdDomNamespace);

// --- selectors: install html element-state predicates (must stay last; see selectors/state.ts) ---
import "./selectors/html-predicates.ts";

// --- css area ---
export {
  CSSStyleDeclaration,
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
  CSS,
  getComputedStyle,
} from "./css/index.ts";

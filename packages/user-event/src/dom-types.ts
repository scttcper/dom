// Structural DOM types for @ctrl/dom/user-event.
//
// The monorepo compiles without lib.dom (we are the DOM), and user-event must accept nodes from
// any DOM implementation (@ctrl/dom, jsdom, happy-dom, a browser). These interfaces declare only
// the members user-event touches, with types compatible with lib.dom, so callers can pass
// lib.dom-typed nodes and @ctrl/dom wrappers alike.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface EventInit {
  bubbles?: boolean
  cancelable?: boolean
  composed?: boolean
}

export interface UIEventInit extends EventInit {
  detail?: number
  view?: Window | null
  which?: number
}

export interface EventModifierInit extends UIEventInit {
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  modifierAltGraph?: boolean
  modifierCapsLock?: boolean
  modifierFn?: boolean
  modifierFnLock?: boolean
  modifierHyper?: boolean
  modifierNumLock?: boolean
  modifierScrollLock?: boolean
  modifierSuper?: boolean
  modifierSymbol?: boolean
  modifierSymbolLock?: boolean
}

export interface MouseEventInit extends EventModifierInit {
  button?: number
  buttons?: number
  clientX?: number
  clientY?: number
  movementX?: number
  movementY?: number
  relatedTarget?: EventTarget | null
  screenX?: number
  screenY?: number
}

export interface PointerEventInit extends MouseEventInit {
  pointerId?: number
  width?: number
  height?: number
  pressure?: number
  tangentialPressure?: number
  tiltX?: number
  tiltY?: number
  twist?: number
  pointerType?: string
  isPrimary?: boolean
}

export interface KeyboardEventInit extends EventModifierInit {
  key?: string
  code?: string
  location?: number
  repeat?: boolean
  isComposing?: boolean
  charCode?: number
  keyCode?: number
}

export interface InputEventInit extends UIEventInit {
  data?: string | null
  inputType?: string
  isComposing?: boolean
  dataTransfer?: DataTransfer | null
}

export interface FocusEventInit extends UIEventInit {
  relatedTarget?: EventTarget | null
}

export interface ClipboardEventInit extends EventInit {
  clipboardData?: DataTransfer | null
}

export interface AddEventListenerOptions {
  capture?: boolean
  once?: boolean
  passive?: boolean
}

export interface EventTarget {
  addEventListener(
    type: string,
    listener: any,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener(
    type: string,
    listener: any,
    options?: boolean | {capture?: boolean},
  ): void
  dispatchEvent(event: Event): boolean
}

export interface Event {
  readonly type: string
  readonly target: EventTarget | null
  readonly currentTarget: EventTarget | null
  readonly bubbles: boolean
  readonly cancelable: boolean
  readonly composed: boolean
  readonly defaultPrevented: boolean
  readonly isTrusted: boolean
  readonly eventPhase: number
  readonly timeStamp: number
  preventDefault(): void
  stopPropagation(): void
  stopImmediatePropagation(): void
}

export interface UIEvent extends Event {
  readonly detail: number
  readonly view: Window | null
}

export interface MouseEvent extends UIEvent {
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly button: number
  readonly buttons: number
  readonly clientX: number
  readonly clientY: number
  readonly screenX: number
  readonly screenY: number
  readonly pageX: number
  readonly pageY: number
  readonly offsetX: number
  readonly offsetY: number
  readonly x: number
  readonly y: number
  readonly relatedTarget: EventTarget | null
  getModifierState(keyArg: string): boolean
}

export interface PointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly isPrimary: boolean
  readonly width: number
  readonly height: number
  readonly pressure: number
  readonly tangentialPressure: number
  readonly tiltX: number
  readonly tiltY: number
  readonly twist: number
}

export interface KeyboardEvent extends UIEvent {
  readonly key: string
  readonly code: string
  readonly location: number
  readonly repeat: boolean
  readonly isComposing: boolean
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
  readonly charCode: number
  readonly keyCode: number
  getModifierState(keyArg: string): boolean
}

export interface InputEvent extends UIEvent {
  readonly data: string | null
  readonly inputType: string
  readonly isComposing: boolean
}

export interface FocusEvent extends UIEvent {
  readonly relatedTarget: EventTarget | null
}

export interface ClipboardEvent extends Event {
  readonly clipboardData: DataTransfer | null
}

export interface DocumentEventMap {
  [type: string]: Event
  auxclick: PointerEvent
  beforeinput: InputEvent
  blur: FocusEvent
  click: PointerEvent
  contextmenu: PointerEvent
  copy: ClipboardEvent
  change: Event
  cut: ClipboardEvent
  dblclick: MouseEvent
  focus: FocusEvent
  focusin: FocusEvent
  focusout: FocusEvent
  keydown: KeyboardEvent
  keypress: KeyboardEvent
  keyup: KeyboardEvent
  paste: ClipboardEvent
  input: InputEvent
  mousedown: MouseEvent
  mouseenter: MouseEvent
  mouseleave: MouseEvent
  mousemove: MouseEvent
  mouseout: MouseEvent
  mouseover: MouseEvent
  mouseup: MouseEvent
  pointerover: PointerEvent
  pointerenter: PointerEvent
  pointerdown: PointerEvent
  pointermove: PointerEvent
  pointerup: PointerEvent
  pointercancel: PointerEvent
  pointerout: PointerEvent
  pointerleave: PointerEvent
  submit: Event
  select: Event
}

export interface NodeListOf<T> {
  readonly length: number
  item(index: number): T
  [index: number]: T
  forEach(cb: (value: T, index: number) => void): void
  [Symbol.iterator](): IterableIterator<T>
}

export interface HTMLCollectionOf<T> {
  readonly length: number
  item(index: number): T | null
  [index: number]: T
  [Symbol.iterator](): IterableIterator<T>
}

export interface Node extends EventTarget {
  readonly nodeType: number
  readonly nodeName: string
  nodeValue: string | null
  textContent: string | null
  readonly ownerDocument: Document | null
  readonly parentNode: (Node & ParentNode) | null
  readonly parentElement: HTMLElement | null
  readonly childNodes: NodeListOf<ChildNode>
  readonly firstChild: ChildNode | null
  readonly lastChild: ChildNode | null
  readonly previousSibling: ChildNode | null
  readonly nextSibling: ChildNode | null
  hasChildNodes(): boolean
  contains(other: Node | null): boolean
  cloneNode(deep?: boolean): Node
  appendChild<T extends Node>(node: T): T
  removeChild<T extends Node>(node: T): T
  getRootNode(options?: {composed?: boolean}): Node
}

export type ChildNode = Node

export interface ParentNode {
  readonly children: HTMLCollectionOf<Element>
  querySelector<E extends Element = HTMLElement>(selectors: string): E | null
  querySelectorAll<E extends Element = HTMLElement>(
    selectors: string,
  ): NodeListOf<E>
  append(...nodes: Array<Node | string>): void
}

export interface Text extends Node {
  data: string
  nodeValue: string
  insertData(offset: number, data: string): void
}

export interface Element extends Node, ParentNode {
  readonly tagName: string
  readonly localName: string
  readonly prefix: string | null
  readonly namespaceURI: string | null
  id: string
  innerHTML: string
  readonly shadowRoot: ShadowRoot | null
  readonly ownerDocument: Document
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
  matches(selectors: string): boolean
  closest<E extends Element = Element>(selectors: string): E | null
}

export interface CSSStyleDeclaration {
  readonly display: string
  readonly visibility: string
  readonly pointerEvents: string
  getPropertyValue(property: string): string
}

export interface HTMLElement extends Element {
  focus(options?: {preventScroll?: boolean}): void
  blur(): void
  click(): void
  readonly isContentEditable?: boolean
}

export interface HTMLInputElement extends HTMLElement {
  type: string
  name: string
  value: string
  checked: boolean
  disabled: boolean
  readOnly: boolean
  multiple: boolean
  accept: string
  maxLength: number
  readonly files: FileList | null
  readonly form: HTMLFormElement | null
  readonly labels: NodeListOf<HTMLLabelElement> | null
  selectionStart: number | null
  selectionEnd: number | null
  selectionDirection: string | null
  setSelectionRange(
    start: number | null,
    end: number | null,
    direction?: 'forward' | 'backward' | 'none',
  ): void
  setRangeText(
    replacement: string,
    start?: number,
    end?: number,
    selectionMode?: string,
  ): void
  select(): void
}

export interface HTMLTextAreaElement extends HTMLElement {
  readonly type: string
  name: string
  value: string
  disabled: boolean
  readOnly: boolean
  maxLength: number
  readonly form: HTMLFormElement | null
  readonly labels: NodeListOf<HTMLLabelElement> | null
  selectionStart: number | null
  selectionEnd: number | null
  selectionDirection: string | null
  setSelectionRange(
    start: number | null,
    end: number | null,
    direction?: 'forward' | 'backward' | 'none',
  ): void
  setRangeText(
    replacement: string,
    start?: number,
    end?: number,
    selectionMode?: string,
  ): void
  select(): void
}

export interface HTMLButtonElement extends HTMLElement {
  type: string
  name: string
  value: string
  disabled: boolean
  readonly form: HTMLFormElement | null
  readonly labels: NodeListOf<HTMLLabelElement> | null
}

export interface HTMLSelectElement extends HTMLElement {
  name: string
  value: string
  multiple: boolean
  disabled: boolean
  readonly options: HTMLCollectionOf<HTMLOptionElement>
  readonly selectedOptions: HTMLCollectionOf<HTMLOptionElement>
  readonly labels: NodeListOf<HTMLLabelElement> | null
}

export interface HTMLOptionElement extends HTMLElement {
  value: string
  selected: boolean
  disabled: boolean
}

export interface HTMLLabelElement extends HTMLElement {
  htmlFor: string
  readonly control: HTMLElement | null
}

export interface HTMLAnchorElement extends HTMLElement {
  href: string
}

export interface HTMLFormElement extends HTMLElement {
  requestSubmit?(submitter?: HTMLElement | null): void
}

export interface HTMLIFrameElement extends HTMLElement {
  readonly contentDocument: Document | null
}

export interface HTMLFieldSetElement extends HTMLElement {
  disabled: boolean
}

export interface HTMLElementTagNameMap {
  a: HTMLAnchorElement
  body: HTMLElement
  br: HTMLElement
  button: HTMLButtonElement
  div: HTMLElement
  fieldset: HTMLFieldSetElement
  form: HTMLFormElement
  iframe: HTMLIFrameElement
  input: HTMLInputElement
  label: HTMLLabelElement
  legend: HTMLElement
  optgroup: HTMLElement
  option: HTMLOptionElement
  select: HTMLSelectElement
  span: HTMLElement
  textarea: HTMLTextAreaElement
  meter: HTMLElement
  output: HTMLElement
  progress: HTMLElement
  summary: HTMLElement
  details: HTMLElement
}

export interface ShadowRoot extends Node, ParentNode {
  readonly activeElement: Element | null
  readonly host: Element
}

export interface Range {
  readonly startContainer: Node
  readonly startOffset: number
  readonly endContainer: Node
  readonly endOffset: number
  readonly collapsed: boolean
  setStart(node: Node, offset: number): void
  setEnd(node: Node, offset: number): void
  cloneRange(): Range
  deleteContents(): void
  insertNode(node: Node): void
  comparePoint(node: Node, offset: number): number
  toString(): string
}

export interface Selection {
  readonly anchorNode: Node | null
  readonly anchorOffset: number
  readonly focusNode: Node | null
  readonly focusOffset: number
  readonly isCollapsed: boolean
  readonly rangeCount: number
  getRangeAt(index: number): Range
  addRange(range: Range): void
  removeAllRanges(): void
  collapseToStart(): void
  collapseToEnd(): void
  extend(node: Node, offset?: number): void
  setBaseAndExtent(
    anchorNode: Node,
    anchorOffset: number,
    focusNode: Node,
    focusOffset: number,
  ): void
  toString(): string
}

export interface Document extends Node, ParentNode {
  readonly body: HTMLElement
  readonly activeElement: Element | null
  readonly defaultView: Window | null
  readonly visibilityState?: string
  readonly ownerDocument: null
  createElement(tagName: string): HTMLElement
  createTextNode(data: string): Text
  createRange(): Range
  getSelection(): Selection | null
  getElementById(id: string): HTMLElement | null
}

export interface Blob {
  readonly size: number
  readonly type: string
  text(): Promise<string>
}

export interface File extends Blob {
  readonly name: string
  readonly lastModified: number
}

export interface FileList {
  readonly length: number
  item(index: number): File | null
  [index: number]: File
}

export interface DataTransferItem {
  readonly kind: string
  readonly type: string
  getAsFile(): File | null
  getAsString(callback: ((data: string) => void) | null): void
  webkitGetAsEntry(): any
}

export interface DataTransferItemList {
  readonly length: number
  [index: number]: DataTransferItem
  add(data: string, type: string): DataTransferItem | null
  add(data: File): DataTransferItem | null
  clear(): void
  remove(index: number): void
}

export interface DataTransfer {
  dropEffect: string
  effectAllowed: string
  readonly files: FileList
  readonly items: DataTransferItemList
  readonly types: ReadonlyArray<string>
  clearData(format?: string): void
  getData(format: string): string
  setData(format: string, data: string): void
  setDragImage(image: Element, x: number, y: number): void
}

export interface ClipboardItem {
  readonly types: ReadonlyArray<string>
  getType(type: string): Promise<Blob>
}

export interface Clipboard extends EventTarget {
  read(): Promise<ClipboardItem[]>
  readText(): Promise<string>
  write(data: ClipboardItem[]): Promise<void>
  writeText(data: string): Promise<void>
}

export interface FileReader {
  result: string | ArrayBuffer | null
  onload: ((ev: any) => any) | null
  onerror: ((ev: any) => any) | null
  onabort: ((ev: any) => any) | null
  readAsText(blob: Blob, encoding?: string): void
}

export interface Navigator {
  readonly clipboard: Clipboard
  readonly userAgent: string
}

type Ctor<T> = {new (...args: any[]): T; prototype: T}

/** The members of a window object user-event reads. */
export interface Window extends EventTarget {
  readonly document: Document
  readonly navigator: Navigator
  getComputedStyle(
    element: Element,
    pseudo?: string | null,
  ): CSSStyleDeclaration
  CSS?: {escape(ident: string): string}
  REACT_VERSION?: number
  Event: Ctor<Event>
  UIEvent: Ctor<UIEvent>
  MouseEvent: Ctor<MouseEvent>
  PointerEvent: Ctor<PointerEvent>
  KeyboardEvent: Ctor<KeyboardEvent>
  InputEvent: Ctor<InputEvent>
  FocusEvent: Ctor<FocusEvent>
  ClipboardEvent: Ctor<ClipboardEvent>
  CompositionEvent: Ctor<UIEvent>
  DragEvent: Ctor<MouseEvent>
  TouchEvent: Ctor<UIEvent>
  AnimationEvent: Ctor<Event>
  TransitionEvent: Ctor<Event>
  PopStateEvent: Ctor<Event>
  ProgressEvent: Ctor<Event>
  EventTarget: Ctor<EventTarget>
  HTMLElement: Ctor<HTMLElement>
  Blob: Ctor<Blob>
  File: Ctor<File>
  FileList: Ctor<FileList>
  FileReader: Ctor<FileReader>
  DataTransfer: Ctor<DataTransfer>
  ClipboardItem: Ctor<ClipboardItem>
}

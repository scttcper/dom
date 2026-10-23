// CSSOM View pieces that depend on style but not on layout.
// https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility
// https://drafts.csswg.org/cssom-view/#dom-element-scrolltop
//
// Deviation (docs/deviations.md): there is no layout, so scroll offsets are stored as assigned
// (clamped at 0, no maximum) and read back, like jsdom — Testing Library's
// `fireEvent.scroll(el, { target: { scrollTop: 100 } })` relies on that. Assignment fires no
// scroll event.

import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { DOCUMENT_NODE, ELEMENT_NODE, F_CONNECTED, HTML_NS } from "../nodes/constants.ts";
import { T } from "../nodes/tags.ts";
import { computedValue, computedPosition, inheritanceParent, isDisplayNone, computedVisibility } from "./cascade.ts";
import { $impl } from "../keys.ts";

export interface CheckVisibilityOptions {
  checkOpacity?: boolean;
  checkVisibilityCSS?: boolean;
  contentVisibilityAuto?: boolean;
  opacityProperty?: boolean;
  visibilityProperty?: boolean;
}

/** https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility */
export function checkVisibility(el: NodeImpl, options?: CheckVisibilityOptions | null): boolean {
  if ((el.flags & F_CONNECTED) === 0) return false;
  // Step 1: no associated box — display:none on the element or a flat-tree ancestor, or
  // display:contents on the element itself.
  for (let n: NodeImpl | null = el; n !== null; n = inheritanceParent(n)) if (isDisplayNone(n)) return false;
  if (computedValue(el, "display") === "contents") return false;
  // Step 2: an ancestor skips its contents (content-visibility: hidden).
  for (let n = inheritanceParent(el); n !== null; n = inheritanceParent(n)) {
    if (computedValue(n, "content-visibility") === "hidden") return false;
  }
  const o = options ?? {};
  // Step 3: opacity 0 on the element or an ancestor.
  if (o.checkOpacity || o.opacityProperty) {
    for (let n: NodeImpl | null = el; n !== null; n = inheritanceParent(n)) {
      const v = computedValue(n, "opacity");
      if (v !== "" && parseFloat(v) === 0) return false;
    }
  }
  // Step 4: visibility is not visible.
  if (o.checkVisibilityCSS || o.visibilityProperty) {
    if (computedVisibility(el) !== "visible") return false;
  }
  return true;
}

class ScrollOffsets {
  top: number;
  left: number;
  constructor() {
    this.top = 0;
    this.left = 0;
  }
}

const offsets = new WeakMap<NodeImpl, ScrollOffsets>();

function clamp(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function slot(el: NodeImpl): ScrollOffsets {
  let o = offsets.get(el);
  if (o === undefined) offsets.set(el, (o = new ScrollOffsets()));
  return o;
}

export function getScrollTop(el: NodeImpl): number {
  return offsets.get(el)?.top ?? 0;
}

export function getScrollLeft(el: NodeImpl): number {
  return offsets.get(el)?.left ?? 0;
}

export function setScrollTop(el: NodeImpl, v: unknown): void {
  slot(el).top = clamp(v);
}

export function setScrollLeft(el: NodeImpl, v: unknown): void {
  slot(el).left = clamp(v);
}

/** scroll()/scrollTo() and scrollBy() argument handling (https://drafts.csswg.org/cssom-view/#dom-element-scroll). */
export function scrollElement(el: NodeImpl, by: boolean, x: unknown, y: unknown, argc: number): void {
  let left: number | undefined;
  let top: number | undefined;
  if (argc >= 2) {
    left = Number(x);
    top = Number(y);
  } else if (x !== null && typeof x === "object") {
    const opts = x as { left?: unknown; top?: unknown };
    if (opts.left !== undefined) left = Number(opts.left);
    if (opts.top !== undefined) top = Number(opts.top);
  } else if (argc === 0 || x === undefined) {
    return;
  }
  const o = slot(el);
  if (left !== undefined && !Number.isNaN(left)) o.left = clamp(by ? o.left + left : left);
  if (top !== undefined && !Number.isNaN(top)) o.top = clamp(by ? o.top + top : top);
}

function isBody(n: NodeImpl): boolean {
  if (n.tag !== T.body || n.ns !== HTML_NS) return false;
  const html = n.parent;
  return html !== null && html.tag === T.html && html.parent !== null && html.parent.type === DOCUMENT_NODE;
}

/**
 * https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsetparent — needs only the tree and
 * computed `display`/`position`, no layout. Allocation-free for elements without author styles.
 */
export function offsetParent(el: NodeImpl): NodeImpl | null {
  // Step 1: no associated box, root element, body, or position: fixed.
  if ((el.flags & F_CONNECTED) === 0) return null;
  const parent = el.parent;
  if (parent === null || parent.type === DOCUMENT_NODE || isBody(el)) return null;
  for (let n: NodeImpl | null = el; n !== null; n = inheritanceParent(n)) if (isDisplayNone(n)) return null;
  const position = computedPosition(el);
  if (position === "fixed") return null;
  const isStatic = position === "static";
  // Steps 2-3: nearest positioned ancestor, body, or (for static elements) td/th/table.
  for (let a = inheritanceParent(el); a !== null; a = inheritanceParent(a)) {
    if (a.type !== ELEMENT_NODE) break;
    if (computedPosition(a) !== "static" || isBody(a)) return a;
    if (isStatic && a.ns === HTML_NS && (a.tag === T.td || a.tag === T.th || a.tag === T.table)) return a;
  }
  return null;
}

/** Installs offsetParent on HTMLElement (replacing html's always-null stub). */
export function installHTMLElementView(HTMLElementClass: { prototype: object }): void {
  Object.defineProperty(HTMLElementClass.prototype, "offsetParent", {
    get(this: Element): Element | null {
      const p = offsetParent(this[$impl]);
      return p === null ? null : (p.node as Element);
    },
    enumerable: true,
    configurable: true,
  });
}

/** Installs the style-aware CSSOM View members on Element (replacing the core's layout-free stubs). */
export function installElementView(ElementClass: { prototype: object }): void {
  const proto = ElementClass.prototype;
  const def = (name: string, desc: PropertyDescriptor): void => {
    Object.defineProperty(proto, name, { configurable: true, enumerable: true, ...desc });
  };
  def("checkVisibility", {
    writable: true,
    value: function checkVisibilityMethod(this: Element, options?: CheckVisibilityOptions): boolean {
      return checkVisibility(this[$impl], options);
    },
  });
  def("scrollTop", {
    get(this: Element) {
      return getScrollTop(this[$impl]);
    },
    set(this: Element, v: unknown) {
      setScrollTop(this[$impl], v);
    },
  });
  def("scrollLeft", {
    get(this: Element) {
      return getScrollLeft(this[$impl]);
    },
    set(this: Element, v: unknown) {
      setScrollLeft(this[$impl], v);
    },
  });
  for (const [name, by] of [["scroll", false], ["scrollTo", false], ["scrollBy", true]] as const) {
    def(name, {
      writable: true,
      value: function (this: Element, x?: unknown, y?: unknown): void {
        scrollElement(this[$impl], by, x, y, arguments.length);
      },
    });
  }
}

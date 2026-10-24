// CSSOM View members: the style-only ones (checkVisibility, offsetParent) and the geometry ones.
// https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility
// https://drafts.csswg.org/cssom-view/#dom-element-scrolltop
// https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect
// https://drafts.csswg.org/cssom-view/#extensions-to-the-htmlelement-interface
//
// Default (docs/deviations.md): there is no layout, so geometry is zero and scroll offsets are
// stored as assigned (clamped at 0, no maximum) and read back, like jsdom — Testing Library's
// `fireEvent.scroll(el, { target: { scrollTop: 100 } })` relies on that. Assignment fires no
// scroll event.
//
// With `layout: "lite"` (css/layout.ts, docs/layout.md) the same members read layout-lite boxes:
// scroll offsets clamp to the scrolling area and changing one fires `scroll`. Every member checks
// the process-wide `layoutEnabled` binding first, so the default path stays as it was.

import type { Element } from "../nodes/Element.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import { DOCUMENT_NODE, ELEMENT_NODE, F_CONNECTED, HTML_NS } from "../nodes/constants.ts";
import { T } from "../nodes/tags.ts";
import { computedValue, computedPosition, inheritanceParent, isDisplayNone, computedVisibility } from "./cascade.ts";
import { $impl, $scrollX, $scrollY } from "../keys.ts";
import { layoutEnabled } from "./layout-mode.ts";
import { BOX_FIXED, BOX_FIXED_SELF, BOX_INLINE, BOX_ROOT, BOX_SCROLLER, type Box, boxOf, clientHeightOf, clientWidthOf, knownBox, layoutOn, scrollExtent, viewport } from "./layout.ts";
import { DOMRect, DOMRectList } from "../window/geometry.ts";
import { fireAnEvent } from "../events/fire.ts";

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
  if (layoutEnabled && layoutOn(el.doc)) return layoutScroll(el, true);
  return offsets.get(el)?.top ?? 0;
}

export function getScrollLeft(el: NodeImpl): number {
  if (layoutEnabled && layoutOn(el.doc)) return layoutScroll(el, false);
  return offsets.get(el)?.left ?? 0;
}

export function setScrollTop(el: NodeImpl, v: unknown): void {
  if (layoutEnabled && layoutOn(el.doc)) setLayoutScroll(el, true, v);
  else slot(el).top = clamp(v);
}

export function setScrollLeft(el: NodeImpl, v: unknown): void {
  if (layoutEnabled && layoutOn(el.doc)) setLayoutScroll(el, false, v);
  else slot(el).left = clamp(v);
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
  if (layoutEnabled && layoutOn(el.doc)) {
    // One scroll, at most one `scroll` event.
    const b = boxOf(el);
    if (b === null) return;
    const beforeTop = layoutScroll(el, true);
    const beforeLeft = layoutScroll(el, false);
    const o = slot(el);
    o.top = beforeTop;
    o.left = beforeLeft;
    if (left !== undefined && !Number.isNaN(left)) o.left = Math.min(clamp(by ? beforeLeft + left : left), maxScroll(el, b, false));
    if (top !== undefined && !Number.isNaN(top)) o.top = Math.min(clamp(by ? beforeTop + top : top), maxScroll(el, b, true));
    if (o.top !== beforeTop || o.left !== beforeLeft) fireAnEvent("scroll", el.node as Element);
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

// --- layout-lite reads ------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom-view/#scrolling-area — at least the padding box. */
function scrollSize(el: NodeImpl, b: Box, vertical: boolean): number {
  if ((b.flags & BOX_INLINE) !== 0) return 0;
  const client = vertical ? clientHeightOf(b, el) : clientWidthOf(b, el);
  return Math.max(client, scrollExtent(el, b, vertical));
}

function maxScroll(el: NodeImpl, b: Box, vertical: boolean): number {
  return Math.max(0, scrollSize(el, b, vertical) - (vertical ? clientHeightOf(b, el) : clientWidthOf(b, el)));
}

/** The stored offset, clamped to the current scrolling area (content may have shrunk). */
function layoutScroll(el: NodeImpl, vertical: boolean): number {
  const o = offsets.get(el);
  if (o === undefined) return 0;
  const v = vertical ? o.top : o.left;
  if (v === 0) return 0;
  const b = boxOf(el);
  return b === null ? 0 : Math.min(v, maxScroll(el, b, vertical));
}

/**
 * https://drafts.csswg.org/cssom-view/#dom-element-scrolltop (setter): clamp to the scrolling
 * area and, when the position changes, fire `scroll` at the element — synchronously, since there
 * is no rendering loop to defer it to (docs/layout.md).
 */
function setLayoutScroll(el: NodeImpl, vertical: boolean, v: unknown): void {
  const b = boxOf(el);
  if (b === null) return;
  let n = Number(v);
  if (!Number.isFinite(n)) n = 0;
  n = Math.min(Math.max(0, n), maxScroll(el, b, vertical));
  const before = layoutScroll(el, vertical);
  const o = slot(el);
  if (vertical) o.top = n;
  else o.left = n;
  if (n !== before) fireAnEvent("scroll", el.node as Element);
}

let RX = 0;
let RY = 0;

/** Viewport position of a box's border edge: transforms applied, ancestor and window scrolling subtracted. */
function rectOrigin(el: NodeImpl, b: Box): void {
  let x = b.vx;
  let y = b.vy;
  if ((b.flags & BOX_FIXED_SELF) === 0) {
    for (let a = inheritanceParent(el); a !== null; a = inheritanceParent(a)) {
      const ab = knownBox(a);
      if (ab === null) continue;
      if ((ab.flags & (BOX_SCROLLER | BOX_ROOT)) === BOX_SCROLLER) {
        x -= layoutScroll(a, false);
        y -= layoutScroll(a, true);
      }
      if ((ab.flags & BOX_FIXED_SELF) !== 0) break;
    }
  }
  if ((b.flags & BOX_FIXED) === 0) {
    const win = viewport(el);
    x -= win[$scrollX];
    y -= win[$scrollY];
  }
  RX = x;
  RY = y;
}

/** https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect */
export function boundingClientRect(el: NodeImpl): DOMRect {
  if (!layoutEnabled) return new DOMRect();
  const b = boxOf(el);
  if (b === null) return new DOMRect();
  rectOrigin(el, b);
  return new DOMRect(RX, RY, b.w, b.h);
}

/** https://drafts.csswg.org/cssom-view/#dom-element-getclientrects — one rect per box (no line fragments). */
export function clientRects(el: NodeImpl): DOMRectList {
  if (!layoutEnabled) return new DOMRectList();
  const b = boxOf(el);
  if (b === null) return new DOMRectList();
  rectOrigin(el, b);
  return new DOMRectList([new DOMRect(RX, RY, b.w, b.h)]);
}

const Metric = { ClientTop: 0, ClientLeft: 1, ClientWidth: 2, ClientHeight: 3, ScrollWidth: 4, ScrollHeight: 5 } as const;

/** https://drafts.csswg.org/cssom-view/#dom-element-clienttop and the client/scroll sizes after it. */
export function elementMetric(el: NodeImpl, m: number): number {
  if (!layoutEnabled) return 0;
  const b = boxOf(el);
  if (b === null) return 0;
  switch (m) {
    case Metric.ClientTop: return (b.flags & BOX_INLINE) !== 0 ? 0 : Math.round(b.bt);
    case Metric.ClientLeft: return (b.flags & BOX_INLINE) !== 0 ? 0 : Math.round(b.bl);
    case Metric.ClientWidth: return Math.round(clientWidthOf(b, el));
    case Metric.ClientHeight: return Math.round(clientHeightOf(b, el));
    case Metric.ScrollWidth: return Math.round(scrollSize(el, b, false));
    case Metric.ScrollHeight: return Math.round(scrollSize(el, b, true));
  }
  return 0;
}

const Offset = { Top: 0, Left: 1, Width: 2, Height: 3 } as const;

/** https://drafts.csswg.org/cssom-view/#dom-htmlelement-offsettop and siblings (layout positions, transforms ignored). */
export function offsetMetric(el: NodeImpl, m: number): number {
  if (!layoutEnabled) return 0;
  const b = boxOf(el);
  if (b === null) return 0;
  if (m === Offset.Width) return Math.round(b.w);
  if (m === Offset.Height) return Math.round(b.h);
  // Steps 2-3: relative to the offsetParent's padding edge; to the initial containing block when
  // the offsetParent is null or the body.
  const p = offsetParent(el);
  const pb = p === null || isBody(p) ? null : boxOf(p);
  if (m === Offset.Top) return Math.round(pb === null ? b.y : b.y - pb.y - pb.bt);
  return Math.round(pb === null ? b.x : b.x - pb.x - pb.bl);
}

/**
 * https://drafts.csswg.org/cssom-view/#dom-element-scrollintoview — with layout-lite, scrolls each
 * scroll container ancestor (innermost first) so the element's border box is in view. The window
 * is not scrolled.
 */
export function scrollElementIntoView(el: NodeImpl, arg: unknown): void {
  if (!layoutEnabled || boxOf(el) === null) return;
  let block = "start";
  let inline = "nearest";
  if (arg === false) block = "end";
  else if (arg !== null && typeof arg === "object") {
    const o = arg as { block?: unknown; inline?: unknown };
    if (o.block !== undefined) block = String(o.block);
    if (o.inline !== undefined) inline = String(o.inline);
  }
  for (let a = inheritanceParent(el); a !== null; a = inheritanceParent(a)) {
    const ab = boxOf(a);
    if (ab === null || (ab.flags & (BOX_SCROLLER | BOX_ROOT)) !== BOX_SCROLLER) continue;
    const b = boxOf(el)!;
    rectOrigin(el, b);
    const ex = RX;
    const ey = RY;
    rectOrigin(a, ab);
    const dy = alignDelta(block, ey - RY - ab.bt, b.h, clientHeightOf(ab, a));
    const dx = alignDelta(inline, ex - RX - ab.bl, b.w, clientWidthOf(ab, a));
    if (dy !== 0) setLayoutScroll(a, true, layoutScroll(a, true) + dy);
    if (dx !== 0) setLayoutScroll(a, false, layoutScroll(a, false) + dx);
  }
}

/** https://drafts.csswg.org/cssom-view/#determine-the-scroll-into-view-position */
function alignDelta(mode: string, start: number, size: number, client: number): number {
  switch (mode) {
    case "start": return start;
    case "end": return start + size - client;
    case "center": return start + size / 2 - client / 2;
  }
  // "nearest"
  const end = start + size;
  if (start < 0 && end > client) return 0;
  if ((start < 0 && size <= client) || (end > client && size > client)) return start;
  if ((end > client && size <= client) || (start < 0 && size > client)) return end - client;
  return 0;
}

// --- installation -----------------------------------------------------------------------------

/** Installs offsetParent and offset* on HTMLElement (replacing html's always-null/zero stubs). */
export function installHTMLElementView(HTMLElementClass: { prototype: object }): void {
  const proto = HTMLElementClass.prototype;
  Object.defineProperty(proto, "offsetParent", {
    get(this: Element): Element | null {
      const p = offsetParent(this[$impl]);
      return p === null ? null : (p.node as Element);
    },
    enumerable: true,
    configurable: true,
  });
  const getters: [string, (this: Element) => number][] = [
    ["offsetTop", function offsetTop(this: Element) { return layoutEnabled ? offsetMetric(this[$impl], Offset.Top) : 0; }],
    ["offsetLeft", function offsetLeft(this: Element) { return layoutEnabled ? offsetMetric(this[$impl], Offset.Left) : 0; }],
    ["offsetWidth", function offsetWidth(this: Element) { return layoutEnabled ? offsetMetric(this[$impl], Offset.Width) : 0; }],
    ["offsetHeight", function offsetHeight(this: Element) { return layoutEnabled ? offsetMetric(this[$impl], Offset.Height) : 0; }],
  ];
  for (const [name, get] of getters) {
    Object.defineProperty(get, "name", { value: `get ${name}` });
    Object.defineProperty(proto, name, { get, enumerable: true, configurable: true });
  }
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
  def("getBoundingClientRect", {
    writable: true,
    value: function getBoundingClientRect(this: Element): DOMRect {
      return boundingClientRect(this[$impl]);
    },
  });
  def("getClientRects", {
    writable: true,
    value: function getClientRects(this: Element): DOMRectList {
      return clientRects(this[$impl]);
    },
  });
  def("scrollIntoView", {
    writable: true,
    value: function scrollIntoView(this: Element, arg?: unknown): void {
      if (layoutEnabled) scrollElementIntoView(this[$impl], arg);
    },
  });
  const metrics: [string, number][] = [
    ["clientTop", Metric.ClientTop],
    ["clientLeft", Metric.ClientLeft],
    ["clientWidth", Metric.ClientWidth],
    ["clientHeight", Metric.ClientHeight],
    ["scrollWidth", Metric.ScrollWidth],
    ["scrollHeight", Metric.ScrollHeight],
  ];
  for (const [name, m] of metrics) {
    const get = function (this: Element): number {
      return layoutEnabled ? elementMetric(this[$impl], m) : 0;
    };
    Object.defineProperty(get, "name", { value: `get ${name}` });
    def(name, { get });
  }
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

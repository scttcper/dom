// innerText / outerText without a layout engine.
// https://html.spec.whatwg.org/#the-innertext-idl-attribute
//
// Implements the "rendered text collection steps" with these approximations (also listed in
// docs/deviations.md):
// - "being rendered" = not display:none, from the css area's computed-style fast path (author
//   and inline styles included), plus closed <details> content and <dialog> without `open`.
// - Block-level-ness comes from the UA default display of the tag (author `display` values
//   other than none are not consulted).
// - White-space processing is CSS `white-space: normal` collapsing (runs of ASCII whitespace →
//   one space, trimmed at block boundaries) except inside pre/listing/xmp/plaintext/textarea,
//   which preserve whitespace. `visibility` and `text-transform` are ignored.
// - Replaced elements and fallback content (canvas, video, audio, iframe, object, img, input,
//   textarea, select's internals) contribute nothing except <select>, whose options are listed
//   one per line.

import { ELEMENT_NODE, TEXT_NODE, CDATA_SECTION_NODE, F_CONNECTED, HTML_NS } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Node } from "../nodes/Node.ts";
import { T } from "../nodes/tags.ts";
import { nextInTree } from "../nodes/traverse.ts";
import { contentAttr } from "./reflect.ts";
import { isOwnDisplayNone } from "./shared.ts";

// Display categories.
const D_NONE = 0;
const D_INLINE = 1;
const D_BLOCK = 2;
const D_CELL = 3;
const D_ROW = 4;
const D_REPLACED = 5;

/** UA stylesheet display (https://html.spec.whatwg.org/#rendering) for HTML elements. */
function uaDisplay(n: NodeImpl): number {
  if (n.ns !== HTML_NS) return n.name === "svg" || n.name === "math" ? D_REPLACED : D_INLINE;
  if (contentAttr(n, "hidden") !== null) return D_NONE;
  switch (n.tag) {
    case T.head:
    case T.script:
    case T.style:
    case T.template:
    case T.title:
    case T.link:
    case T.meta:
    case T.base:
    case T.noscript:
    case T.area:
    case T.datalist:
    case T.param:
    case T.rp:
    case T.noembed:
    case T.noframes:
    case T.track:
    case T.source:
      return D_NONE;
    case T.dialog:
      return contentAttr(n, "open") === null ? D_NONE : D_BLOCK;
    case T.input:
      return contentAttr(n, "type")?.toLowerCase() === "hidden" ? D_NONE : D_REPLACED;
    case T.address:
    case T.blockquote:
    case T.center:
    case T.div:
    case T.figure:
    case T.figcaption:
    case T.footer:
    case T.form:
    case T.header:
    case T.hr:
    case T.legend:
    case T.listing:
    case T.main:
    case T.p:
    case T.plaintext:
    case T.pre:
    case T.search:
    case T.xmp:
    case T.article:
    case T.aside:
    case T.h1:
    case T.h2:
    case T.h3:
    case T.h4:
    case T.h5:
    case T.h6:
    case T.hgroup:
    case T.nav:
    case T.section:
    case T.dir:
    case T.dd:
    case T.dl:
    case T.dt:
    case T.menu:
    case T.ol:
    case T.ul:
    case T.li:
    case T.fieldset:
    case T.details:
    case T.summary:
    case T.html:
    case T.body:
    case T.table:
    case T.caption:
    case T.optgroup:
    case T.option:
    case T.frameset:
      return D_BLOCK;
    case T.td:
    case T.th:
      return D_CELL;
    case T.tr:
      return D_ROW;
    case T.canvas:
    case T.video:
    case T.audio:
    case T.iframe:
    case T.object:
    case T.embed:
    case T.img:
    case T.textarea:
    case T.meter:
    case T.progress:
    case T.frame:
      return D_REPLACED;
  }
  return D_INLINE;
}

function display(n: NodeImpl): number {
  if (isOwnDisplayNone(n)) return D_NONE;
  return uaDisplay(n);
}

function preservesWhitespace(n: NodeImpl): boolean {
  for (let p: NodeImpl | null = n; p !== null && p.type === ELEMENT_NODE; p = p.parent) {
    if (p.ns !== HTML_NS) continue;
    const t = p.tag;
    if (t === T.pre || t === T.listing || t === T.xmp || t === T.plaintext || t === T.textarea) return true;
  }
  return false;
}

/** Whether `el` is being rendered: connected, and neither it nor an ancestor is display:none. */
function isBeingRendered(el: NodeImpl): boolean {
  if ((el.flags & F_CONNECTED) === 0) return false;
  for (let n: NodeImpl | null = el; n !== null && n.type === ELEMENT_NODE; n = n.parent) {
    if (display(n) === D_NONE) return false;
    // Content of a closed <details> other than its summary is not rendered.
    const p = n.parent;
    if (p !== null && p.tag === T.details && p.ns === HTML_NS && contentAttr(p, "open") === null && !(n.tag === T.summary && isFirstSummary(n))) return false;
  }
  return true;
}

function isFirstSummary(n: NodeImpl): boolean {
  for (let c = n.parent!.first; c !== null; c = c.next) {
    if (c.type === ELEMENT_NODE && c.tag === T.summary) return c === n;
  }
  return false;
}

/** Output builder: strings plus "required line break count" items, collapsed at the end. */
class Builder {
  parts: string[] = [];
  /** Pending required line break count before the next string (max of adjacent counts). */
  breaks = 0;
  /** Whether anything has been emitted yet (leading breaks are dropped). */
  started = false;
  /** Whether the last emitted character was a collapsible space (for collapsing across nodes). */
  lastSpace = true;

  text(s: string, collapse: boolean): void {
    if (s === "") return;
    if (collapse) {
      s = s.replace(/[ \t\n\f\r]+/g, " ");
      if (this.lastSpace && s.charCodeAt(0) === 0x20) s = s.slice(1);
      if (s === "") return;
    }
    this.flushBreaks();
    this.parts.push(s);
    this.started = true;
    this.lastSpace = collapse ? s.charCodeAt(s.length - 1) === 0x20 : s.endsWith("\n");
  }

  /** A forced string (br, tab) that is not subject to collapsing. */
  raw(s: string): void {
    this.trimTrailingSpace();
    this.flushBreaks();
    this.parts.push(s);
    this.started = true;
    this.lastSpace = true;
  }

  lineBreak(count: number): void {
    this.trimTrailingSpace();
    if (count > this.breaks) this.breaks = count;
    this.lastSpace = true;
  }

  flushBreaks(): void {
    if (this.breaks !== 0) {
      if (this.started) this.parts.push("\n".repeat(this.breaks));
      this.breaks = 0;
    }
  }

  trimTrailingSpace(): void {
    const parts = this.parts;
    const last = parts.length - 1;
    if (last >= 0 && parts[last].endsWith(" ") && this.lastSpace) {
      parts[last] = parts[last].slice(0, -1);
    }
  }

  result(): string {
    this.trimTrailingSpace();
    return this.parts.join("");
  }
}

function collect(node: NodeImpl, b: Builder): void {
  if (node.type === TEXT_NODE || node.type === CDATA_SECTION_NODE) {
    b.text(node.data, !preservesWhitespace(node.parent ?? node));
    return;
  }
  if (node.type !== ELEMENT_NODE) return;
  const d = display(node);
  if (d === D_NONE) return;
  const isHTML = node.ns === HTML_NS;
  if (isHTML && node.tag === T.br) {
    b.raw("\n");
    return;
  }
  if (isHTML && node.tag === T.select) {
    b.lineBreak(1);
    for (let n = node.first; n !== null; n = nextInTree(n, node)) {
      if (n.type === ELEMENT_NODE && n.tag === T.option) {
        b.lineBreak(1);
        b.text(textOf(n), true);
        b.lineBreak(1);
      }
    }
    b.lineBreak(1);
    return;
  }
  if (d === D_REPLACED) return;
  if (isHTML && node.tag === T.details && contentAttr(node, "open") === null) {
    // Only the summary of a closed details element is rendered.
    b.lineBreak(1);
    for (let c = node.first; c !== null; c = c.next) {
      if (c.type === ELEMENT_NODE && c.tag === T.summary) {
        collect(c, b);
        break;
      }
    }
    b.lineBreak(1);
    return;
  }
  const isP = isHTML && node.tag === T.p;
  if (isP) b.lineBreak(2);
  else if (d === D_BLOCK) b.lineBreak(1);
  for (let c = node.first; c !== null; c = c.next) collect(c, b);
  if (d === D_CELL) {
    if (!isLastOfKind(node, D_CELL)) b.raw("\t");
  } else if (d === D_ROW) {
    if (!isLastRow(node)) b.raw("\n");
  }
  if (isP) b.lineBreak(2);
  else if (d === D_BLOCK) b.lineBreak(1);
}

function textOf(n: NodeImpl): string {
  let s = "";
  for (let c = n.first; c !== null; c = nextInTree(c, n)) if (c.type === TEXT_NODE) s += c.data;
  return s;
}

function isLastOfKind(node: NodeImpl, kind: number): boolean {
  for (let n = node.next; n !== null; n = n.next) if (n.type === ELEMENT_NODE && display(n) === kind) return false;
  return true;
}

function isLastRow(row: NodeImpl): boolean {
  // Last tr of the enclosing table (rows may sit in thead/tbody/tfoot sections).
  let table: NodeImpl | null = row.parent;
  while (table !== null && table.tag !== T.table) table = table.parent;
  if (table === null) return isLastOfKind(row, D_ROW);
  let last: NodeImpl | null = null;
  for (let n = table.first; n !== null; n = nextInTree(n, table)) {
    if (n.type === ELEMENT_NODE && n.tag === T.tr) last = n;
  }
  return last === row;
}

function descendantText(el: NodeImpl): string {
  let s = "";
  for (let n = el.first; n !== null; n = nextInTree(n, el)) {
    if (n.type === TEXT_NODE || n.type === CDATA_SECTION_NODE) s += n.data;
  }
  return s;
}

/** https://html.spec.whatwg.org/#get-the-text-steps */
export function getInnerText(el: NodeImpl): string {
  if (!isBeingRendered(el)) return descendantText(el);
  const b = new Builder();
  for (let c = el.first; c !== null; c = c.next) collect(c, b);
  return b.result();
}

/**
 * https://html.spec.whatwg.org/#rendered-text-fragment — Text nodes separated by <br> for
 * every LF (CR LF and lone CR count as one break).
 */
export function renderedTextFragment(input: string, el: NodeImpl): Node {
  const doc = el.doc;
  const fragment = doc.createDocumentFragment();
  const lines = input.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) fragment.appendChild(doc.createElement("br"));
    if (lines[i] !== "") fragment.appendChild(doc.createTextNode(lines[i]));
  }
  return fragment;
}

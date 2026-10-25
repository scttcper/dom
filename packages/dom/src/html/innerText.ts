// innerText / outerText without a layout engine.
// https://html.spec.whatwg.org/#the-innertext-idl-attribute
//
// Implements the "rendered text collection steps"
// (https://html.spec.whatwg.org/#rendered-text-collection-steps) over the css area's computed
// values instead of boxes (also listed in docs/deviations.md):
// - "being rendered" = connected and no inclusive ancestor has computed display:none, plus
//   closed <details> content.
// - Box kinds come from the computed `display` (UA defaults, author sheets and inline styles):
//   block-level (block, flex, grid, list-item, table, ...), table-cell, table-row, atomic
//   inline (inline-block/-flex/-grid/-table, replaced elements), inline. Flex/grid items are
//   blockified; floats and absolutely positioned boxes count as block-level.
// - CSS white-space processing per text node from the computed `white-space` (normal/nowrap
//   collapse, pre-line keeps newlines, pre/pre-wrap/break-spaces keep everything), collapsing
//   across inline boundaries and trimming at block and atomic-inline boundaries; no line
//   wrapping (soft wraps never become newlines).
// - Text with computed `visibility: hidden|collapse` is skipped; `text-transform` is applied
//   (uppercase/lowercase/capitalize, using the inherited `lang` for locale-sensitive casing);
//   ::first-line/::first-letter styles are not.
// - Replaced elements (img, canvas, video, audio, iframe, object, embed, input, textarea,
//   meter, progress) contribute nothing; <select> lists its options one per line; in SVG only
//   text content elements render text.
// When the document has no author styles, every style lookup reduces to the UA-default fast
// path (no style records are created).

import { CDATA_SECTION_NODE, ELEMENT_NODE, F_CONNECTED, HTML_NS, SVG_NS, TEXT_NODE } from "../nodes/constants.ts";
import type { NodeImpl } from "../nodes/NodeImpl.ts";
import type { Node } from "../nodes/Node.ts";
import { T } from "../nodes/tags.ts";
import { nextInTree, nextSkippingChildren } from "../nodes/traverse.ts";
import { contentAttr } from "./reflect.ts";
import { computedDisplay, computedValue, computedVisibility, hasAuthorStyles } from "../css/internal.ts";

// Box kinds.
const D_NONE = 0;
const D_INLINE = 1;
const D_BLOCK = 2;
const D_CELL = 3;
const D_ROW = 4;
/** Atomic inline-level box (inline-block, inline-flex, inline-grid, inline-table, button). */
const D_ATOMIC = 5;

// White-space processing modes (https://drafts.csswg.org/css-text-4/#white-space-processing).
const W_COLLAPSE = 0;
const W_PRE_LINE = 1;
const W_PRESERVE = 2;

/** Replaced elements: their element children are never rendered as text. */
function isReplaced(n: NodeImpl): boolean {
  if (n.ns !== HTML_NS) return false;
  switch (n.tag) {
    case T.img:
    case T.canvas:
    case T.video:
    case T.audio:
    case T.iframe:
    case T.object:
    case T.embed:
    case T.input:
    case T.textarea:
    case T.meter:
    case T.progress:
    case T.frame:
      return true;
  }
  return false;
}

/** SVG elements whose content renders (https://svgwg.org/svg2-draft/text.html#TextElement and the containers around it). */
function svgRendersContent(n: NodeImpl): boolean {
  switch (n.name) {
    case "svg":
    case "g":
    case "a":
    case "switch":
    case "text":
    case "tspan":
    case "textPath":
    case "foreignObject":
      return true;
  }
  return false;
}

/** Text directly inside these SVG elements is rendered. */
function svgRendersText(n: NodeImpl): boolean {
  const name = n.name;
  return name === "text" || name === "tspan" || name === "textPath" || name === "a";
}

/** Box kind from a computed `display` value. */
function kindOf(display: string): number {
  switch (display) {
    case "none":
      return D_NONE;
    case "inline":
    case "contents":
    case "ruby":
    case "ruby-base":
    case "ruby-text":
    case "ruby-base-container":
    case "ruby-text-container":
    case "table-column":
    case "table-column-group":
      return D_INLINE;
    case "inline-block":
    case "inline-flex":
    case "inline-grid":
    case "inline-table":
    case "inline-flow-root":
    case "inline list-item":
      return D_ATOMIC;
    case "table-cell":
      return D_CELL;
    case "table-row":
      return D_ROW;
  }
  return D_BLOCK;
}

function isFlexOrGrid(display: string): boolean {
  return display === "flex" || display === "grid" || display === "inline-flex" || display === "inline-grid";
}

/** Box kind of element `n` (`styled`: the document has author styles). */
function boxKind(n: NodeImpl, styled: boolean): number {
  const display = computedDisplay(n);
  let kind = kindOf(display);
  if (kind === D_NONE) return D_NONE;
  if (n.ns === SVG_NS) return svgRendersContent(n) ? D_INLINE : D_NONE;
  if (n.ns !== HTML_NS) return kind;
  if (styled && (kind === D_INLINE || kind === D_ATOMIC)) {
    // Flex and grid items are blockified (https://drafts.csswg.org/css-display-3/#blockify);
    // floats and absolutely positioned boxes are block-level too.
    const p = n.parent;
    if (p !== null && p.type === ELEMENT_NODE && isFlexOrGrid(computedDisplay(p))) kind = D_BLOCK;
    else if (computedValue(n, "float") !== "none") kind = D_BLOCK;
    else {
      const position = computedValue(n, "position");
      if (position === "absolute" || position === "fixed") kind = D_BLOCK;
    }
  }
  return kind;
}

/** Whether `el` is being rendered: connected, and no inclusive ancestor is display:none. */
function isBeingRendered(el: NodeImpl): boolean {
  if ((el.flags & F_CONNECTED) === 0) return false;
  for (let n: NodeImpl | null = el; n !== null && n.type === ELEMENT_NODE; n = n.parent) {
    if (computedDisplay(n) === "none") return false;
    // Content of a closed <details> other than its summary is not rendered.
    const p = n.parent;
    if (
      p !== null &&
      p.tag === T.details &&
      p.ns === HTML_NS &&
      contentAttr(p, "open") === null &&
      !(n.tag === T.summary && isFirstSummary(n))
    )
      return false;
  }
  return true;
}

function isFirstSummary(n: NodeImpl): boolean {
  for (let c = n.parent!.first; c !== null; c = c.next) {
    if (c.type === ELEMENT_NODE && c.tag === T.summary) return c === n;
  }
  return false;
}

/** White-space mode for text whose parent element is `p`. */
function whiteSpaceMode(p: NodeImpl, styled: boolean): number {
  if (styled) {
    const ws = computedValue(p, "white-space");
    if (ws === "pre-line") return W_PRE_LINE;
    if (ws === "pre" || ws === "pre-wrap" || ws === "break-spaces" || ws.startsWith("preserve")) return W_PRESERVE;
    return W_COLLAPSE;
  }
  // UA defaults only: pre, listing, xmp, plaintext and textarea preserve white space.
  for (let n: NodeImpl | null = p; n !== null && n.type === ELEMENT_NODE; n = n.parent) {
    if (n.ns !== HTML_NS) continue;
    const t = n.tag;
    if (t === T.pre || t === T.listing || t === T.xmp || t === T.plaintext || t === T.textarea) return W_PRESERVE;
  }
  return W_COLLAPSE;
}

/** The inherited language (https://html.spec.whatwg.org/#language), for locale-aware casing. */
function languageOf(n: NodeImpl): string | undefined {
  for (let p: NodeImpl | null = n; p !== null && p.type === ELEMENT_NODE; p = p.parent) {
    const lang = contentAttr(p, "lang");
    if (lang !== null) return lang === "" ? undefined : lang;
  }
  return undefined;
}

function upper(s: string, lang: string | undefined): string {
  try {
    return s.toLocaleUpperCase(lang);
  } catch {
    return s.toUpperCase();
  }
}

/** https://drafts.csswg.org/css-text-3/#text-transform-property */
function transform(s: string, p: NodeImpl): string {
  const tt = computedValue(p, "text-transform");
  if (tt === "" || tt === "none") return s;
  if (tt.includes("uppercase")) return upper(s, languageOf(p));
  if (tt.includes("lowercase")) {
    const lang = languageOf(p);
    try {
      return s.toLocaleLowerCase(lang);
    } catch {
      return s.toLowerCase();
    }
  }
  if (tt.includes("capitalize")) {
    const lang = languageOf(p);
    return s.replace(/(^|[\s\-(["'])(\p{L})/gu, (_m, pre: string, ch: string) => pre + upper(ch, lang));
  }
  return s;
}

/** Output builder: strings plus "required line break count" items, collapsed at the end. */
class Builder {
  parts: string[] = [];
  /** Pending required line break count before the next string (max of adjacent counts). */
  breaks = 0;
  /** Whether the last emitted character was a collapsible space (for collapsing across nodes). */
  lastSpace = true;
  /** Whether the last part ends with a collapsible space that a line end may remove. */
  trimmable = false;
  /** The document has author styles (style lookups go beyond the UA fast path). */
  styled: boolean;

  constructor(styled: boolean) {
    this.styled = styled;
  }

  text(s: string, mode: number): void {
    if (s === "") return;
    if (mode === W_COLLAPSE) {
      s = s.replace(/[ \t\n\f\r]+/g, " ");
      if (this.lastSpace && s.charCodeAt(0) === 0x20) s = s.slice(1);
      if (s === "") return;
    } else if (mode === W_PRE_LINE) {
      s = s
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t\f]+/g, " ")
        .replace(/ ?\n ?/g, "\n");
      if (this.lastSpace && s.charCodeAt(0) === 0x20) s = s.slice(1);
      if (s === "") return;
    } else {
      s = s.replace(/\r\n?/g, "\n");
    }
    this.flushBreaks();
    this.parts.push(s);
    this.lastSpace = mode !== W_PRESERVE && s.charCodeAt(s.length - 1) === 0x20;
    this.trimmable = this.lastSpace;
  }

  /** A forced string (br, tab) that is not subject to collapsing. */
  raw(s: string): void {
    this.trimTrailingSpace();
    this.flushBreaks();
    this.parts.push(s);
    this.lastSpace = true;
    this.trimmable = false;
  }

  lineBreak(count: number): void {
    this.trimTrailingSpace();
    if (count > this.breaks) this.breaks = count;
    this.lastSpace = true;
  }

  /** Entering an atomic inline: its leading white space collapses away. Returns a marker for {@link atomicEnd}. */
  atomicStart(): number {
    this.lastSpace = true;
    return this.parts.length;
  }

  /** Leaving an atomic inline: trailing white space inside it is trimmed; white space after it is kept. */
  atomicEnd(marker: number): void {
    if (this.parts.length > marker) this.trimTrailingSpace();
    this.lastSpace = false;
    this.trimmable = false;
  }

  flushBreaks(): void {
    if (this.breaks !== 0) {
      // Required line breaks at the start are removed.
      if (this.parts.length !== 0) this.parts.push("\n".repeat(this.breaks));
      this.breaks = 0;
    }
  }

  trimTrailingSpace(): void {
    const parts = this.parts;
    const last = parts.length - 1;
    if (last >= 0 && this.trimmable && parts[last].endsWith(" ")) {
      const s = parts[last].slice(0, -1);
      if (s === "") parts.pop();
      else parts[last] = s;
    }
    this.trimmable = false;
  }

  result(): string {
    this.trimTrailingSpace();
    return this.parts.join("");
  }
}

/** Table boxes whose direct text children are not rendered when they are only white space. */
function isTableInternal(p: NodeImpl): boolean {
  const d = computedDisplay(p);
  return (
    d === "table" ||
    d === "inline-table" ||
    d === "table-row" ||
    d === "table-row-group" ||
    d === "table-header-group" ||
    d === "table-footer-group"
  );
}

function isWhitespaceOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0c && c !== 0x0d) return false;
  }
  return true;
}

/** Whether text directly inside element `p` is rendered. */
function textRendered(p: NodeImpl, styled: boolean): boolean {
  if (p.ns === SVG_NS && !svgRendersText(p)) return false;
  if (styled) {
    const v = computedVisibility(p);
    if (v === "hidden" || v === "collapse") return false;
  }
  return true;
}

function collect(node: NodeImpl, b: Builder): void {
  if (node.type === TEXT_NODE || node.type === CDATA_SECTION_NODE) {
    const p = node.parent;
    if (p === null || p.type !== ELEMENT_NODE) {
      b.text(node.data, W_COLLAPSE);
      return;
    }
    if (!textRendered(p, b.styled)) return;
    // White space directly inside table boxes other than cells and captions generates no box.
    if (isTableInternal(p) && isWhitespaceOnly(node.data)) return;
    b.text(b.styled ? transform(node.data, p) : node.data, whiteSpaceMode(p, b.styled));
    return;
  }
  if (node.type !== ELEMENT_NODE) return;
  const kind = boxKind(node, b.styled);
  if (kind === D_NONE) return;
  const isHTML = node.ns === HTML_NS;
  if (isHTML && node.tag === T.br) {
    b.raw("\n");
    return;
  }
  if (isHTML && node.tag === T.select) {
    collectOptions(node, b);
    return;
  }
  if (isReplaced(node)) {
    // A replaced element produces no text; block-level ones still separate lines.
    if (kind === D_BLOCK) b.lineBreak(1);
    else b.atomicEnd(b.atomicStart());
    return;
  }
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
  // Step 8: <p> gets 2 required line breaks before and after (whatever its display);
  // block-level boxes get 1.
  const isP = isHTML && node.tag === T.p;
  if (kind === D_ATOMIC) {
    if (isP) b.lineBreak(2);
    const marker = b.atomicStart();
    for (let c = node.first; c !== null; c = c.next) collect(c, b);
    b.atomicEnd(marker);
    if (isP) b.lineBreak(2);
    return;
  }
  if (isP) b.lineBreak(2);
  else if (kind === D_BLOCK) b.lineBreak(1);
  for (let c = node.first; c !== null; c = c.next) collect(c, b);
  // Steps 6-7: a tab after each table cell but the last in its row, a newline after each row
  // but the last in its table.
  if (kind === D_CELL) {
    if (!isLastOfKind(node, D_CELL, b.styled)) b.raw("\t");
  } else if (kind === D_ROW) {
    if (!isLastRow(node, b.styled)) b.raw("\n");
  }
  if (isP) b.lineBreak(2);
  else if (kind === D_BLOCK) b.lineBreak(1);
}

/** A <select>'s rendering: its options (not nested in another option), one per line. */
function collectOptions(select: NodeImpl, b: Builder): void {
  for (let n = select.first; n !== null;) {
    if (n.type === ELEMENT_NODE && n.ns === HTML_NS && n.tag === T.option) {
      collect(n, b);
      n = nextSkippingChildren(n, select);
    } else {
      // An optgroup is a block box (its label is not text content).
      if (n.type === ELEMENT_NODE && n.ns === HTML_NS && n.tag === T.optgroup) b.lineBreak(1);
      n = nextInTree(n, select);
    }
  }
}

function isLastOfKind(node: NodeImpl, kind: number, styled: boolean): boolean {
  for (let n = node.next; n !== null; n = n.next)
    if (n.type === ELEMENT_NODE && boxKind(n, styled) === kind) return false;
  return true;
}

function isLastRow(row: NodeImpl, styled: boolean): boolean {
  // Last row of the enclosing table (rows may sit in thead/tbody/tfoot sections).
  let table: NodeImpl | null = row.parent;
  while (
    table !== null &&
    table.type === ELEMENT_NODE &&
    computedDisplay(table) !== "table" &&
    computedDisplay(table) !== "inline-table"
  )
    table = table.parent;
  if (table === null || table.type !== ELEMENT_NODE) return isLastOfKind(row, D_ROW, styled);
  let last: NodeImpl | null = null;
  for (let n = table.first; n !== null; n = nextInTree(n, table)) {
    if (n.type === ELEMENT_NODE && boxKind(n, styled) === D_ROW) last = n;
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
  // 1. Not being rendered: the element's descendant text content.
  if (!isBeingRendered(el)) return descendantText(el);
  // A rendered replaced element has no rendered text of its own.
  if (isReplaced(el)) return "";
  const b = new Builder(hasAuthorStyles(el.doc));
  if (el.ns === HTML_NS && el.tag === T.select) collectOptions(el, b);
  else for (let c = el.first; c !== null; c = c.next) collect(c, b);
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

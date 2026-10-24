// Accessibility snapshots for debugging (not part of upstream @testing-library/dom).
//
// `ariaSnapshot(container)` prints the subtree as the accessibility tree `*ByRole` queries see,
// in Playwright's aria snapshot YAML (https://playwright.dev/docs/aria-snapshots), a format
// models already know:
//
//   - navigation "Main":
//     - link "Home" [current=page]
//   - heading "Checkout" [level=1]
//   - textbox "Email" [active]: ada@example.com
//   - checkbox "Remember me" [checked]
//   - button "Pay" [disabled]
//
// It is a token-cheap replacement for prettyDOM output when a coding agent reads a failing
// test: no classes, styles or SVG paths, only roles, accessible names, the states Testing
// Library filters on, and text. Roles, names and hiddenness come from @rtd/aria, the backend
// ByRole uses, so the snapshot shows exactly what queries match:
// - role: the first `role` token or the implicit role (html-aam element mappings,
//   https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings, as aria-query 5.3 has them);
// - name: the accessible name computation (https://w3c.github.io/accname/#mapping_additional_nd_name);
// - hidden: Testing Library's accessibility-tree exclusion (`hidden`, `aria-hidden="true"`,
//   `display: none` exclude a subtree, `visibility: hidden` an element;
//   https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion).
//
// Elements without a role (`generic`, `none`, `presentation`, SVG internals) are skipped and
// their children hoisted, like Playwright does. Additions to Playwright's format, all valid
// YAML: `[expanded=false]` / `[pressed=false]` for explicit false states (ByRole's
// `expanded: false` / `pressed: false` match only those), `[hidden]` for nodes included with
// `{ hidden: true }`, a `- role … (+N more)` line for collapsed sibling runs and `# …`
// comments for truncation.

import { $impl, DOCUMENT_FRAGMENT_NODE, DOCUMENT_NODE, ELEMENT_NODE, HTML_NS, TEXT_NODE, T, attr, type NodeImpl } from "@rtd/dom/internal";
import { roleSupportsProp } from "@rtd/aria";
import {
  ariaCheckedState,
  ariaPressedState,
  computeAccessibleNameImpl,
  computeAriaBusy,
  computeAriaCurrent,
  computeAriaExpanded,
  computeAriaSelected,
  computeHeadingLevel,
  isDisabledImpl,
  isDisplayInline,
  isDisplayNone,
  isInaccessibleImpl,
  isSubtreeInaccessibleImpl,
  isVisibilityHidden,
  tlRole,
} from "@rtd/aria/internal";
import { getDocument } from "./helpers.ts";

declare const process: any;

export interface AriaSnapshotOptions {
  /** Include elements excluded from the accessibility tree, marked `[hidden]` (default false, like ByRole). */
  hidden?: boolean;
  /** Line budget; the rest is replaced by `# … N more lines` (default 200, or `CTRL_DOM_DEBUG_LINES`). */
  maxLines?: number;
  /** Truncate names, values and text to this many characters (default 100). */
  maxTextLength?: number;
  /** Runs of more than this many same-role siblings show the first ones and `(+N more)` (default 5; `Infinity` disables). */
  collapseAfter?: number;
  /** Print link targets as `- /url: …` children (default false). */
  urls?: boolean;
}

/** One accessibility tree node. Children are nodes or text runs. */
export interface SnapshotNode {
  role: string;
  name: string;
  /** `[checked]`, `[level=2]`, … in print order */
  props: string[];
  /** textbox / slider / combobox value, printed after the colon */
  value: string | null;
  url: string | null;
  children: Array<SnapshotNode | string>;
  element: NodeImpl;
}

const DEFAULT_MAX_LINES = 200;
const DEFAULT_MAX_TEXT = 100;
const DEFAULT_COLLAPSE_AFTER = 5;

/** `CTRL_DOM_DEBUG_LINES`, when set to a positive number. */
export function envMaxLines(): number | undefined {
  const raw = typeof process !== "undefined" ? process.env?.CTRL_DOM_DEBUG_LINES : undefined;
  const n = raw ? Number(raw) : NaN;
  return n > 0 ? n : undefined;
}

/**
 * The accessibility tree of `container` (default `document.body`) in Playwright's aria snapshot
 * YAML. A body, document or fragment prints its children; any other element prints itself.
 */
export function ariaSnapshot(container?: any, options: AriaSnapshotOptions = {}): string {
  const root = rootImpl(container);
  const ctx = new SnapshotContext(root, options);
  const top: Array<SnapshotNode | string> = [];
  let header = "";
  // A root inside an excluded subtree (e.g. the element of a "multiple elements" error) still
  // prints, with the reason it is hidden from ByRole.
  if (!ctx.includeHidden && root.type === ELEMENT_NODE && isInaccessibleImpl(root)) {
    header = `# hidden from the accessibility tree: ${hiddenReason(root)}\n`;
    ctx.includeHidden = true;
    ctx.forceHidden = true;
  }
  if (root.type === ELEMENT_NODE && root !== bodyOf(root)) ctx.visitElement(root, top, ctx.forceHidden);
  else ctx.visitChildren(root, top, false, false);
  finishChildren(top, null);
  const lines: string[] = [];
  ctx.renderList(top, "", lines);
  if (lines.length === 0) {
    return header + (ctx.sawHidden ? "# no accessible content (hidden elements exist: pass { hidden: true })" : "# no accessible content");
  }
  const maxLines = options.maxLines ?? envMaxLines() ?? DEFAULT_MAX_LINES;
  if (lines.length > maxLines) {
    const rest = lines.length - maxLines;
    lines.length = maxLines;
    lines.push(`# … ${rest} more line${rest === 1 ? "" : "s"} (raise maxLines or CTRL_DOM_DEBUG_LINES)`);
  }
  return header + lines.join("\n");
}

function rootImpl(container: any): NodeImpl {
  const node = container ?? getDocument().body;
  const impl: NodeImpl | undefined = node?.[$impl];
  if (impl === undefined) throw new TypeError(`Expected an element, document or fragment but got ${node === null ? "null" : typeof node}`);
  // A document (or its <html>, which prettyDOM passes) prints its body.
  if (impl.type === DOCUMENT_NODE || (impl.tag === T.html && impl.ns === HTML_NS)) {
    const body = (impl.doc as any)?.body;
    return body ? body[$impl] : impl;
  }
  return impl;
}

function bodyOf(impl: NodeImpl): NodeImpl | null {
  const body = (impl.doc as any)?.body;
  return body ? body[$impl] : null;
}

// --- formatting ----------------------------------------------------------------------------

/** Collapse whitespace like the accessible name computation does for text. */
function normalizeSpace(s: string): string {
  return s.replace(/[\t\n\f\r ]+/g, " ");
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s;
}

/** A double-quoted YAML/JSON string (Playwright prints names this way). */
export function quote(s: string): string {
  return JSON.stringify(s);
}

// Plain YAML scalars that would parse as something else or break the mapping.
const NEEDS_QUOTES = /^$|^[\s\-?:,[\]{}#&*!|>'"%@`]|[\s]$|:$|: | #|^(true|false|null|yes|no|on|off|~)$|^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** A YAML value: plain when unambiguous, double-quoted otherwise. */
export function yamlValue(s: string): string {
  return NEEDS_QUOTES.test(s) ? quote(s) : s;
}

/** `- role "name" [props]` without the leading dash. */
export function nodeKey(node: SnapshotNode, maxText: number): string {
  let key = node.role;
  if (node.name !== "") key += " " + quote(truncate(node.name, maxText));
  for (let i = 0; i < node.props.length; i++) key += " " + node.props[i];
  return key;
}

/** Short CSS-ish description of an element for comments: `<div id="x">`, `<span data-testid="y">`. */
export function describeElement(impl: NodeImpl): string {
  const tag = impl.name;
  if (impl.id !== "") return `<${tag} id="${impl.id}">`;
  const testId = attr(impl, "data-testid");
  if (testId !== null) return `<${tag} data-testid="${testId}">`;
  return `<${tag}>`;
}

/** Why `impl` is excluded from the accessibility tree, or "" when it is not. */
export function hiddenReason(impl: NodeImpl): string {
  const chain = hiddenChainReason(impl);
  if (chain !== "") return chain;
  return isVisibilityHidden(impl) ? `visibility: hidden on ${describeElement(impl)}` : "";
}

function hiddenChainReason(impl: NodeImpl): string {
  for (let cur: NodeImpl | null = impl; cur !== null && cur.type === ELEMENT_NODE; cur = cur.parent) {
    if (cur.ns === HTML_NS && attr(cur, "hidden") !== null) return `hidden attribute on ${describeElement(cur)}`;
    if (attr(cur, "aria-hidden") === "true") return `aria-hidden="true" on ${describeElement(cur)}`;
    if (isDisplayNone(cur)) return `display: none on ${describeElement(cur)}`;
  }
  return "";
}

// --- tree building -------------------------------------------------------------------------

const PRESENTATIONAL = new Set(["", "generic", "none", "presentation"]);

function isSkippedTag(impl: NodeImpl): boolean {
  if (impl.ns !== HTML_NS) return false;
  switch (impl.tag) {
    case T.script:
    case T.style:
    case T.template:
    case T.noscript:
    case T.head:
      return true;
  }
  return false;
}

/** The state/property annotations of one node, in Playwright's order plus ours. */
export function nodeProps(impl: NodeImpl, role: string, active: boolean, hidden: boolean): string[] {
  const props: string[] = [];
  if (roleSupportsProp(role, "aria-checked")) {
    const checked = ariaCheckedState(impl);
    if (checked === true) props.push("[checked]");
    else if (checked === "mixed") props.push("[checked=mixed]");
  }
  if (isDisabledImpl(impl)) props.push("[disabled]");
  const expanded = computeAriaExpanded(impl);
  if (expanded === true) props.push("[expanded]");
  else if (expanded === false) props.push("[expanded=false]");
  if (active) props.push("[active]");
  const level = role === "heading" ? computeHeadingLevel(impl) : levelAttr(impl);
  if (level !== undefined) props.push(`[level=${level}]`);
  const pressed = ariaPressedState(impl);
  if (pressed === true) props.push("[pressed]");
  else if (pressed === "mixed") props.push("[pressed=mixed]");
  else if (pressed === false) props.push("[pressed=false]");
  if (computeAriaSelected(impl) === true) props.push("[selected]");
  const current = computeAriaCurrent(impl);
  if (current === true) props.push("[current]");
  else if (typeof current === "string" && current !== "") props.push(`[current=${current}]`);
  if (computeAriaBusy(impl)) props.push("[busy]");
  if (hidden) props.push("[hidden]");
  return props;
}

function levelAttr(impl: NodeImpl): number | undefined {
  const v = attr(impl, "aria-level");
  const n = v === null ? NaN : Number(v);
  return n > 0 ? n : undefined;
}

const VALUE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton", "slider", "progressbar", "meter", "scrollbar", "separator"]);

/** What Playwright prints after the colon for value-bearing widgets. */
function nodeValue(impl: NodeImpl, role: string): string | null {
  if (!VALUE_ROLES.has(role)) return null;
  const valueText = attr(impl, "aria-valuetext");
  if (valueText !== null) return valueText;
  const valueNow = attr(impl, "aria-valuenow");
  if (valueNow !== null) return valueNow;
  if (impl.ns !== HTML_NS) return null;
  if (impl.tag === T.input || impl.tag === T.textarea) {
    const v = String((impl.node as any).value ?? "");
    return v === "" ? null : v;
  }
  // A <select>'s value is its `[selected]` option child.
  return null;
}

class SnapshotContext {
  includeHidden: boolean;
  forceHidden = false;
  sawHidden = false;
  readonly maxText: number;
  readonly collapseAfter: number;
  readonly urls: boolean;
  readonly active: NodeImpl | null;

  constructor(root: NodeImpl, options: AriaSnapshotOptions) {
    this.includeHidden = options.hidden === true;
    this.maxText = options.maxTextLength ?? DEFAULT_MAX_TEXT;
    this.collapseAfter = options.collapseAfter ?? DEFAULT_COLLAPSE_AFTER;
    this.urls = options.urls === true;
    const activeElement = (root.doc as any)?.activeElement;
    const active: NodeImpl | null = activeElement ? (activeElement[$impl] ?? null) : null;
    this.active = active !== null && active === bodyOf(root) ? null : active;
  }

  /** Appends `impl`'s children (nodes and merged text runs) to `out`. */
  visitChildren(impl: NodeImpl, out: Array<SnapshotNode | string>, hidden: boolean, textHidden: boolean): void {
    for (let c = impl.first; c !== null; c = c.next) {
      if (c.type === TEXT_NODE) {
        if (!textHidden) appendText(out, c.data);
      } else if (c.type === ELEMENT_NODE) {
        this.visitElement(c, out, hidden);
      } else if (c.type === DOCUMENT_FRAGMENT_NODE) {
        this.visitChildren(c, out, hidden, textHidden);
      }
    }
  }

  visitElement(el: NodeImpl, out: Array<SnapshotNode | string>, inheritedHidden: boolean): void {
    if (isSkippedTag(el)) return;
    let hidden = inheritedHidden;
    if (!hidden && isSubtreeInaccessibleImpl(el)) {
      this.sawHidden = true;
      if (!this.includeHidden) return;
      hidden = true;
    }
    // `visibility: hidden` hides the element (and its own text) but a descendant can be visible again.
    let selfHidden = hidden;
    if (!hidden && isVisibilityHidden(el)) {
      this.sawHidden = true;
      if (!this.includeHidden) {
        this.visitChildren(el, out, false, true);
        return;
      }
      selfHidden = true;
    }
    const role = tlRole(el);
    if (PRESENTATIONAL.has(role)) {
      const block = !isDisplayInline(el);
      if (block) appendBreak(out);
      this.visitChildren(el, out, hidden, false);
      if (block) appendBreak(out);
      return;
    }
    const node: SnapshotNode = {
      role,
      name: normalizeSpace(computeAccessibleNameImpl(el, undefined, 5)).trim(),
      props: nodeProps(el, role, el === this.active, selfHidden && this.includeHidden),
      value: nodeValue(el, role),
      url: null,
      children: [],
      element: el,
    };
    if (this.urls && role === "link") node.url = attr(el, "href");
    // A textarea's children are its default value, already printed as the value.
    if (!(el.ns === HTML_NS && el.tag === T.textarea)) this.visitChildren(el, node.children, hidden, false);
    finishChildren(node.children, node.name);
    out.push(node);
  }

  renderList(list: Array<SnapshotNode | string>, indent: string, lines: string[]): void {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (typeof item === "string") {
        lines.push(`${indent}- text: ${yamlValue(truncate(item, this.maxText))}`);
        continue;
      }
      // Collapse a run of same-role siblings past `collapseAfter`.
      let run = 1;
      while (i + run < list.length && typeof list[i + run] !== "string" && (list[i + run] as SnapshotNode).role === item.role) run++;
      if (run > this.collapseAfter + 1) {
        for (let k = 0; k < this.collapseAfter; k++) this.renderNode(list[i + k] as SnapshotNode, indent, lines);
        lines.push(`${indent}- ${item.role} … (+${run - this.collapseAfter} more)`);
        i += run - 1;
        continue;
      }
      this.renderNode(item, indent, lines);
    }
  }

  renderNode(node: SnapshotNode, indent: string, lines: string[]): void {
    const key = nodeKey(node, this.maxText);
    const children = node.children;
    if (node.url === null && (children.length === 0 || (children.length === 1 && typeof children[0] === "string" && node.value === null))) {
      const inline = node.value ?? (children.length === 1 ? (children[0] as string) : null);
      lines.push(inline === null ? `${indent}- ${key}` : `${indent}- ${key}: ${yamlValue(truncate(inline, this.maxText))}`);
      return;
    }
    lines.push(node.value === null ? `${indent}- ${key}:` : `${indent}- ${key}: ${yamlValue(truncate(node.value, this.maxText))}`);
    const childIndent = indent + "  ";
    if (node.url !== null) lines.push(`${childIndent}- /url: ${yamlValue(node.url)}`);
    // A value line cannot also be a mapping: children of a valued node are rare (combobox
    // popups); print them as siblings one level down anyway, which YAML tools tolerate.
    this.renderList(children, childIndent, lines);
  }
}

// Text runs: raw text is concatenated (inline elements join words); a block-level wrapper ends
// the run (BREAK entry). `finishChildren` drops the breaks and collapses whitespace per run.
const BREAK = "\u0000";

function appendText(out: Array<SnapshotNode | string>, data: string): void {
  if (data === "") return;
  const last = out.length - 1;
  if (last >= 0 && typeof out[last] === "string" && out[last] !== BREAK) out[last] = (out[last] as string) + data;
  else out.push(data);
}

function appendBreak(out: Array<SnapshotNode | string>): void {
  const last = out.length - 1;
  if (last >= 0 && typeof out[last] === "string" && out[last] !== BREAK) out.push(BREAK);
}

/** Trim text runs, drop empty ones and text that repeats the name (`name` null at the top level). */
function finishChildren(children: Array<SnapshotNode | string>, name: string | null): void {
  let w = 0;
  for (let r = 0; r < children.length; r++) {
    let c = children[r];
    if (typeof c === "string") {
      if (c === BREAK) continue;
      c = normalizeSpace(c).trim();
      if (c === "") continue;
    }
    children[w++] = c;
  }
  children.length = w;
  // Text that repeats the name: the whole content (`<button>Save</button>`) or a leading
  // caption the name came from (`<legend>`, `<caption>`, `<figcaption>`).
  if (children.length > 0 && typeof children[0] === "string" && children[0] === name) children.splice(0, 1);
  // `<label>Email <input></label>`: the label text is already the control's name.
  w = 0;
  for (let r = 0; r < children.length; r++) {
    const c = children[r];
    if (typeof c === "string" && (labels(children[r - 1], c) || labels(children[r + 1], c))) continue;
    children[w++] = c;
  }
  children.length = w;
}

const LABELLED_ROLES = new Set(["textbox", "searchbox", "combobox", "listbox", "checkbox", "radio", "switch", "slider", "spinbutton", "meter", "progressbar"]);

function labels(sibling: SnapshotNode | string | undefined, text: string): boolean {
  return sibling !== undefined && typeof sibling !== "string" && sibling.name === text && LABELLED_ROLES.has(sibling.role);
}

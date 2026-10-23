// Port of @testing-library/dom src/pretty-dom.js and src/DOMElementFilter.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/pretty-dom.js
// https://github.com/testing-library/dom-testing-library/blob/main/src/DOMElementFilter.ts
// (itself from jest's pretty-format DOMElement plugin:
//  https://github.com/jestjs/jest/blob/e7bb6a1e26ffab90611b2593912df15b69315611/packages/pretty-format/src/plugins/DOMElement.ts)
//
// prettyDOM output must be byte-identical to upstream's `prettyFormat.format(dom, {plugins:
// [DOMElementFilter(filterNode), DOMCollection], printFunctionName: false, highlight, ...})`.
// This module reimplements exactly that formatting over NodeImpl, without loading
// pretty-format. Anything outside that fast path (a custom `plugins` or `theme` option, a
// node the DOMElement plugin would not handle) is delegated to the real pretty-format,
// loaded lazily, so output stays identical in every case.

import { createRequire } from "node:module";
import { COMMENT_NODE, DOCUMENT_FRAGMENT_NODE, ELEMENT_NODE, TEXT_NODE, serializeNode, type NodeImpl } from "@rtd/dom/internal";
import { getUserCodeFrame } from "./get-user-code-frame.ts";
import { getDocument } from "./helpers.ts";
import { getConfig } from "./config.ts";
import { matchesSelector } from "./selectors.ts";

declare const process: any;

// --- lazy pretty-format ---

let prettyFormatModule: any = null;
function loadPrettyFormat(): any {
  return (prettyFormatModule ??= createRequire(import.meta.url)("pretty-format"));
}

/**
 * Upstream re-exports pretty-format's module namespace as `prettyFormat`. Same keys here, but
 * the module is only loaded when one of them is first read (keeps import time low).
 */
export const prettyFormat: {
  readonly format: (val: unknown, options?: any) => string;
  readonly default: (val: unknown, options?: any) => string;
  readonly plugins: Record<string, any>;
  readonly DEFAULT_OPTIONS: Record<string, any>;
} = Object.defineProperties({} as any, {
  format: { enumerable: true, get: () => loadPrettyFormat().format },
  default: { enumerable: true, get: () => loadPrettyFormat().default },
  plugins: { enumerable: true, get: () => loadPrettyFormat().plugins },
  DEFAULT_OPTIONS: { enumerable: true, get: () => loadPrettyFormat().DEFAULT_OPTIONS },
});

const shouldHighlight = (): boolean => {
  if (typeof process === "undefined") {
    // Don't colorize in non-node environments (e.g. Browsers)
    return false;
  }
  let colors;
  // Try to safely parse env COLORS: We will default behavior if any step fails.
  try {
    const colorsJSON = process.env?.COLORS;
    if (colorsJSON) {
      colors = JSON.parse(colorsJSON);
    }
  } catch {
    // If this throws, process.env?.COLORS wasn't parsable. Since we only
    // care about `true` or `false`, we can safely ignore the error.
  }

  if (typeof colors === "boolean") {
    // If `colors` is set explicitly (both `true` and `false`), use that value.
    return colors;
  } else {
    // If `colors` is not set, colorize if we're in node.
    return process.versions !== undefined && process.versions.node !== undefined;
  }
};

// https://github.com/facebook/jest/blob/615084195ae1ae61ddd56162c62bbdda17587569/packages/pretty-format/src/plugins/DOMElement.ts#L50
function filterCommentsAndDefaultIgnoreTagsTags(value: any): boolean {
  return value.nodeType !== COMMENT_NODE && (value.nodeType !== ELEMENT_NODE || !value.matches(getConfig().defaultIgnore));
}

// --- the DOMElement printer ---

interface Color {
  open: string;
  close: string;
}
interface Colors {
  comment: Color;
  content: Color;
  prop: Color;
  tag: Color;
  value: Color;
}
interface PrintConfig {
  colors: Colors;
  escapeString: boolean;
  indent: string;
  maxDepth: number;
  min: boolean;
  spacingInner: string;
  spacingOuter: string;
  /** null = default filter (comments + defaultIgnore elements) */
  filterNode: ((node: any) => boolean) | null;
  /** defaultIgnore is "script, style": skip elements named script/style without the selector engine */
  scriptStyleIgnore: boolean;
  defaultIgnore: string;
}

const NO_COLOR: Color = { open: "", close: "" };
const EMPTY_COLORS: Colors = { comment: NO_COLOR, content: NO_COLOR, prop: NO_COLOR, tag: NO_COLOR, value: NO_COLOR };
// ansi-styles values for pretty-format's DEFAULT_THEME (comment: gray, content: reset,
// prop: yellow, tag: cyan, value: green).
const HIGHLIGHT_COLORS: Colors = {
  comment: { open: "\u001b[90m", close: "\u001b[39m" },
  content: { open: "\u001b[0m", close: "\u001b[0m" },
  prop: { open: "\u001b[33m", close: "\u001b[39m" },
  tag: { open: "\u001b[36m", close: "\u001b[39m" },
  value: { open: "\u001b[32m", close: "\u001b[39m" },
};

// pretty-format 27 DEFAULT_OPTIONS keys (validateOptions rejects anything else).
const KNOWN_OPTIONS = new Set([
  "callToJSON",
  "compareKeys",
  "escapeRegex",
  "escapeString",
  "highlight",
  "indent",
  "maxDepth",
  "min",
  "plugins",
  "printBasicPrototype",
  "printFunctionName",
  "theme",
]);

/** Thrown when the fast printer meets something only pretty-format itself prints identically. */
const DELEGATE = Symbol("delegate");

const ELEMENT_REGEXP = /^((HTML|SVG)\w*)?Element$/;
const ctorIsElementName = new Map<unknown, boolean>();

function isCustomElement(val: any): boolean {
  const { tagName } = val;
  return Boolean((typeof tagName === "string" && tagName.includes("-")) || (typeof val.hasAttribute === "function" && val.hasAttribute("is")));
}

/** DOMElementFilter `test()` for a node we are about to print. */
function pluginHandles(impl: NodeImpl): boolean {
  const node = impl.node as any;
  const ctor = node.constructor;
  const constructorName = ctor?.name;
  switch (impl.type) {
    case ELEMENT_NODE: {
      if (!constructorName && !isCustomElement(node)) return false;
      let ok = ctorIsElementName.get(ctor);
      if (ok === undefined) ctorIsElementName.set(ctor, (ok = ELEMENT_REGEXP.test(constructorName)));
      return ok || isCustomElement(node);
    }
    case TEXT_NODE:
      return constructorName === "Text";
    case COMMENT_NODE:
      return constructorName === "Comment";
    case DOCUMENT_FRAGMENT_NODE:
      return constructorName === "DocumentFragment";
  }
  return false;
}

function escapeHTML(str: string): string {
  if (str.indexOf("<") === -1 && str.indexOf(">") === -1) return str;
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function printString(val: string, config: PrintConfig): string {
  if (config.escapeString) {
    return '"' + val.replace(/"|\\/g, "\\$&") + '"';
  }
  return '"' + val + '"';
}

function keepChild(child: NodeImpl, config: PrintConfig): boolean {
  if (config.filterNode !== null) return Boolean(config.filterNode(child.node));
  if (child.type === COMMENT_NODE) return false;
  if (child.type !== ELEMENT_NODE) return true;
  if (config.scriptStyleIgnore) return child.name !== "script" && child.name !== "style";
  return !matchesSelector(child, config.defaultIgnore);
}

function tagNameLower(impl: NodeImpl): string {
  return (impl.node as any).tagName.toLowerCase();
}

function printProps(impl: NodeImpl, config: PrintConfig, indentation: string): string {
  const attrs = impl.attrs;
  if (attrs === null || attrs.length === 0) return "";
  const keys: string[] = [];
  const props = new Map<string, string>();
  for (let i = 0; i < attrs.length; i++) {
    keys.push(attrs[i].name);
    props.set(attrs[i].name, attrs[i].value);
  }
  keys.sort();
  const colors = config.colors;
  let out = "";
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    out +=
      config.spacingInner +
      indentation +
      colors.prop.open +
      key +
      colors.prop.close +
      "=" +
      colors.value.open +
      printString(props.get(key)!, config) +
      colors.value.close;
  }
  return out;
}

function printChildren(impl: NodeImpl, config: PrintConfig, indentation: string, depth: number): string {
  let out = "";
  for (let c = impl.first; c !== null; c = c.next) {
    if (!keepChild(c, config)) continue;
    out += config.spacingOuter + indentation + printNode(c, config, indentation, depth);
  }
  return out;
}

function printNode(impl: NodeImpl, config: PrintConfig, indentation: string, depth: number): string {
  if (!pluginHandles(impl)) throw DELEGATE;
  if (impl.type === TEXT_NODE) {
    return config.colors.content.open + escapeHTML(impl.data) + config.colors.content.close;
  }
  if (impl.type === COMMENT_NODE) {
    const commentColor = config.colors.comment;
    return commentColor.open + "<!--" + escapeHTML(impl.data) + "-->" + commentColor.close;
  }
  const type = impl.type === DOCUMENT_FRAGMENT_NODE ? "DocumentFragment" : tagNameLower(impl);
  const tagColor = config.colors.tag;

  if (++depth > config.maxDepth) {
    return tagColor.open + "<" + type + tagColor.close + " …" + tagColor.open + " />" + tagColor.close;
  }

  const childIndentation = indentation + config.indent;
  const printedProps = impl.type === DOCUMENT_FRAGMENT_NODE ? "" : printProps(impl, config, childIndentation);
  const printedChildren = printChildren(impl, config, childIndentation, depth);

  return (
    tagColor.open +
    "<" +
    type +
    (printedProps && tagColor.close + printedProps + config.spacingOuter + indentation + tagColor.open) +
    (printedChildren
      ? ">" + tagColor.close + printedChildren + config.spacingOuter + indentation + tagColor.open + "</" + type
      : (printedProps && !config.min ? "" : " ") + "/") +
    ">" +
    tagColor.close
  );
}

/** pretty-format's option validation + config construction for the fast path; null = delegate. */
function makePrintConfig(options: Record<string, any>, filterNode: ((node: any) => boolean) | null): PrintConfig | null {
  for (const key of Object.keys(options)) {
    if (!KNOWN_OPTIONS.has(key)) return null; // pretty-format throws `Unknown option`
  }
  if (options.plugins !== undefined || options.theme !== undefined) return null;
  if (options.min && options.indent !== undefined && options.indent !== 0) return null; // throws
  const min = Boolean(options.min);
  const indentWidth = options.indent !== undefined ? options.indent : 2;
  const defaultIgnore = getConfig().defaultIgnore;
  return {
    colors: options.highlight ? HIGHLIGHT_COLORS : EMPTY_COLORS,
    escapeString: options.escapeString !== undefined ? options.escapeString : true,
    indent: min ? "" : new Array(indentWidth + 1).join(" "),
    maxDepth: options.maxDepth !== undefined ? options.maxDepth : Infinity,
    min,
    spacingInner: min ? " " : "\n",
    spacingOuter: min ? "" : "\n",
    filterNode,
    scriptStyleIgnore: defaultIgnore === "script, style",
    defaultIgnore,
  };
}

function formatDOM(dom: any, filterNode: ((node: any) => boolean) | undefined, prettyFormatOptions: Record<string, any>): string {
  const allOptions = { printFunctionName: false, highlight: shouldHighlight(), ...prettyFormatOptions };
  const impl: NodeImpl | undefined = dom._impl;
  const effectiveFilter = filterNode ?? filterCommentsAndDefaultIgnoreTagsTags;
  if (impl !== undefined) {
    const config = makePrintConfig(allOptions, filterNode === undefined ? null : filterNode);
    if (config !== null) {
      try {
        return printNode(impl, config, "", 0);
      } catch (e) {
        if (e !== DELEGATE) throw e;
      }
    }
  }
  return formatWithPrettyFormat(dom, effectiveFilter, allOptions);
}

/** Upstream's exact formatting call (also the oracle for the fast printer's tests). */
export function formatWithPrettyFormat(dom: any, filterNode: (node: any) => boolean, options: Record<string, any>): string {
  const pf = loadPrettyFormat();
  return pf.format(dom, {
    plugins: [createDOMElementFilter(filterNode), pf.plugins.DOMCollection],
    ...options,
  });
}

/** The fast printer alone (null when it would delegate); for tests. */
export function formatWithFastPrinter(dom: any, filterNode: ((node: any) => boolean) | undefined, options: Record<string, any>): string | null {
  const config = makePrintConfig(options, filterNode ?? null);
  if (config === null) return null;
  try {
    return printNode(dom._impl, config, "", 0);
  } catch (e) {
    if (e === DELEGATE) return null;
    throw e;
  }
}

export { filterCommentsAndDefaultIgnoreTagsTags };

export function prettyDOM(dom?: any, maxLength?: any, options: Record<string, any> = {}): string {
  if (!dom) {
    dom = getDocument().body;
  }
  if (typeof maxLength !== "number") {
    maxLength = (typeof process !== "undefined" && typeof process.env !== "undefined" && process.env.DEBUG_PRINT_LIMIT) || 7000;
  }

  if (maxLength === 0) {
    return "";
  }
  if (dom.documentElement) {
    dom = dom.documentElement;
  }

  let domTypeName: string = typeof dom;
  if (domTypeName === "object") {
    domTypeName = dom.constructor.name;
  } else {
    // To don't fall with `in` operator
    dom = {};
  }
  if (!("outerHTML" in dom)) {
    throw new TypeError(`Expected an element or document but got ${domTypeName}`);
  }

  const { filterNode, ...prettyFormatOptions } = options;

  const debugContent = formatDOM(dom, filterNode, prettyFormatOptions);
  return maxLength !== undefined && outerHTMLLength(dom) > maxLength ? `${debugContent.slice(0, maxLength)}...` : debugContent;
}

function outerHTMLLength(dom: any): number {
  const impl: NodeImpl | undefined = dom._impl;
  if (impl !== undefined && impl.type === ELEMENT_NODE) return serializeNode(impl).length;
  return dom.outerHTML.length;
}

export const logDOM = (...args: [any?, any?, any?]): void => {
  const userCodeFrame = getUserCodeFrame();
  if (userCodeFrame) {
    console.log(`${prettyDOM(...args)}\n\n${userCodeFrame}`);
  } else {
    console.log(prettyDOM(...args));
  }
};

// --- delegation: the upstream DOMElementFilter plugin, verbatim, for pretty-format itself ---

function createDOMElementFilter(filterNode: (node: any) => boolean): any {
  const printPropsPF = (keys: string[], props: Record<string, unknown>, config: any, indentation: string, depth: number, refs: any, printer: any): string => {
    const indentationNext = indentation + config.indent;
    const colors = config.colors;
    return keys
      .map((key) => {
        const value = props[key];
        let printed = printer(value, config, indentationNext, depth, refs);
        if (typeof value !== "string") {
          if (printed.indexOf("\n") !== -1) {
            printed = config.spacingOuter + indentationNext + printed + config.spacingOuter + indentation;
          }
          printed = "{" + printed + "}";
        }
        return config.spacingInner + indentation + colors.prop.open + key + colors.prop.close + "=" + colors.value.open + printed + colors.value.close;
      })
      .join("");
  };
  const printText = (text: string, config: any) => config.colors.content.open + escapeHTML(text) + config.colors.content.close;
  const printChildrenPF = (children: any[], config: any, indentation: string, depth: number, refs: any, printer: any): string =>
    children
      .map((child) => {
        const printedChild = typeof child === "string" ? printText(child, config) : printer(child, config, indentation, depth, refs);
        if (printedChild === "" && typeof child === "object" && child !== null && child.nodeType !== TEXT_NODE) {
          // A plugin serialized this Node to '' meaning we should ignore it.
          return "";
        }
        return config.spacingOuter + indentation + printedChild;
      })
      .join("");
  const printElement = (type: string, printedProps: string, printedChildren: string, config: any, indentation: string): string => {
    const tagColor = config.colors.tag;
    return (
      tagColor.open +
      "<" +
      type +
      (printedProps && tagColor.close + printedProps + config.spacingOuter + indentation + tagColor.open) +
      (printedChildren
        ? ">" + tagColor.close + printedChildren + config.spacingOuter + indentation + tagColor.open + "</" + type
        : (printedProps && !config.min ? "" : " ") + "/") +
      ">" +
      tagColor.close
    );
  };
  const testNode = (val: any) => {
    const constructorName = val.constructor.name;
    const { nodeType } = val;
    return (
      (nodeType === ELEMENT_NODE && (ELEMENT_REGEXP.test(constructorName) || isCustomElement(val))) ||
      (nodeType === TEXT_NODE && constructorName === "Text") ||
      (nodeType === COMMENT_NODE && constructorName === "Comment") ||
      (nodeType === DOCUMENT_FRAGMENT_NODE && constructorName === "DocumentFragment")
    );
  };
  return {
    test: (val: any) => (val?.constructor?.name || isCustomElement(val)) && testNode(val),
    serialize: (node: any, config: any, indentation: string, depth: number, refs: any, printer: any) => {
      if (node.nodeType === TEXT_NODE) return printText(node.data, config);
      if (node.nodeType === COMMENT_NODE) {
        const commentColor = config.colors.comment;
        return commentColor.open + "<!--" + escapeHTML(node.data) + "-->" + commentColor.close;
      }
      const isFragment = node.nodeType === DOCUMENT_FRAGMENT_NODE;
      const type = isFragment ? `DocumentFragment` : node.tagName.toLowerCase();
      if (++depth > config.maxDepth) {
        const tagColor = config.colors.tag;
        return tagColor.open + "<" + type + tagColor.close + " …" + tagColor.open + " />" + tagColor.close;
      }
      return printElement(
        type,
        printPropsPF(
          isFragment ? [] : Array.from(node.attributes as ArrayLike<any>).map((attr) => attr.name).sort(),
          isFragment
            ? {}
            : Array.from(node.attributes as ArrayLike<any>).reduce<Record<string, string>>((props, attribute) => {
                props[attribute.name] = attribute.value;
                return props;
              }, {}),
          config,
          indentation + config.indent,
          depth,
          refs,
          printer,
        ),
        printChildrenPF(Array.prototype.slice.call(node.childNodes || node.children).filter(filterNode), config, indentation + config.indent, depth, refs, printer),
        config,
        indentation,
      );
    },
  };
}

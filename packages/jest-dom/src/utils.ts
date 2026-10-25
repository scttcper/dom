// Port of @testing-library/jest-dom@7.0.1 src/utils.js
// https://github.com/testing-library/jest-dom/blob/v7.0.1/src/utils.js
//
// `redent`, `css.escape` and the picocolors `red` formatter are inlined (tiny, and they
// keep this package's import graph flat). `@adobe/css-tools` is loaded lazily, only when a
// matcher has to parse a CSS string (toHaveStyle('...')), so it costs nothing otherwise.

import { createRequire } from "node:module";

/** The `this` of an expect matcher (jest's MatcherContext / vitest's MatcherState). */
export interface MatcherContext {
  isNot: boolean;
  promise?: string;
  equals(a: unknown, b: unknown, ...rest: unknown[]): boolean;
  utils: {
    matcherHint(matcherName: string, received?: string, expected?: string, options?: Record<string, unknown>): string;
    printReceived(value: unknown): string;
    printExpected(value: unknown): string;
    printWithType(name: string, value: unknown, print: (value: unknown) => string): string;
    stringify(value: unknown, maxDepth?: number): string;
    diff(a: unknown, b: unknown, options?: unknown): string | null | undefined;
    RECEIVED_COLOR(text: string): string;
    EXPECTED_COLOR(text: string): string;
  };
}

export interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/** DOM objects here may come from @ctrl/dom or (in oracle/differential runs) from jsdom. */
export type DOMNode = any;

type MatcherFn = (...args: any[]) => unknown;

class GenericTypeError extends Error {
  constructor(expectedString: string, received: unknown, matcherFn: MatcherFn, context: MatcherContext) {
    super();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, matcherFn);
    }
    let withType = "";
    try {
      withType = context.utils.printWithType("Received", received, context.utils.printReceived);
    } catch {
      // Can throw for Document:
      // https://github.com/jsdom/jsdom/issues/2304
    }
    this.message = [
      context.utils.matcherHint(`${context.isNot ? ".not" : ""}.${matcherFn.name}`, "received", ""),
      "",
      `${context.utils.RECEIVED_COLOR("received")} value must ${expectedString}.`,
      withType,
    ].join("\n");
  }
}

export class HtmlElementTypeError extends GenericTypeError {
  constructor(received: unknown, matcherFn: MatcherFn, context: MatcherContext) {
    super("be an HTMLElement or an SVGElement", received, matcherFn, context);
  }
}

export class NodeTypeError extends GenericTypeError {
  constructor(received: unknown, matcherFn: MatcherFn, context: MatcherContext) {
    super("be a Node", received, matcherFn, context);
  }
}

type ErrorClass = new (received: unknown, matcherFn: MatcherFn, context: MatcherContext) => Error;

function checkHasWindow(htmlElement: DOMNode, ErrorClass: ErrorClass, matcherFn: MatcherFn, context: MatcherContext): void {
  if (!htmlElement || !htmlElement.ownerDocument || !htmlElement.ownerDocument.defaultView) {
    throw new ErrorClass(htmlElement, matcherFn, context);
  }
}

export function checkNode(node: DOMNode, matcherFn: MatcherFn, context: MatcherContext): void {
  checkHasWindow(node, NodeTypeError, matcherFn, context);
  const window = node.ownerDocument.defaultView;

  if (!(node instanceof window.Node)) {
    throw new NodeTypeError(node, matcherFn, context);
  }
}

export function checkHtmlElement(htmlElement: DOMNode, matcherFn: MatcherFn, context: MatcherContext): void {
  checkHasWindow(htmlElement, HtmlElementTypeError, matcherFn, context);
  const window = htmlElement.ownerDocument.defaultView;

  if (!(htmlElement instanceof window.HTMLElement) && !(htmlElement instanceof window.SVGElement)) {
    throw new HtmlElementTypeError(htmlElement, matcherFn, context);
  }
}

class InvalidCSSError extends Error {
  constructor(received: { css: string; message: string }, matcherFn: MatcherFn, context: MatcherContext) {
    super();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, matcherFn);
    }
    this.message = [received.message, "", context.utils.RECEIVED_COLOR(`Failing css:`), context.utils.RECEIVED_COLOR(`${received.css}`)].join(
      "\n",
    );
  }
}

interface CSSParse {
  (css: string, options: { silent: boolean }): {
    stylesheet: {
      parsingErrors?: Array<{ reason: string; line: number }>;
      rules: Array<{ declarations: Array<{ type: string; property: string; value: string }> }>;
    };
  };
}

let cssParse: CSSParse | null = null;

export function parseCSS(css: string, matcherFn: MatcherFn, context: MatcherContext): Record<string, string> {
  cssParse ??= (createRequire(import.meta.url)("@adobe/css-tools") as { parse: CSSParse }).parse;
  const ast = cssParse(`selector { ${css} }`, { silent: true }).stylesheet;

  if (ast.parsingErrors && ast.parsingErrors.length > 0) {
    const { reason, line } = ast.parsingErrors[0];

    throw new InvalidCSSError(
      {
        css,
        message: `Syntax error parsing expected css: ${reason} on line: ${line}`,
      },
      matcherFn,
      context,
    );
  }

  const parsedRules: Record<string, string> = {};
  const declarations = ast.rules[0].declarations;
  for (let i = 0; i < declarations.length; i++) {
    const d = declarations[i];
    if (d.type === "declaration") parsedRules[d.property] = d.value;
  }
  return parsedRules;
}

function display(context: MatcherContext, value: unknown): string {
  return typeof value === "string" ? value : context.utils.stringify(value);
}

export function getMessage(
  context: MatcherContext,
  matcher: string,
  expectedLabel: string,
  expectedValue: unknown,
  receivedLabel: string,
  receivedValue: unknown,
): string {
  return [
    `${matcher}\n`,
    `${expectedLabel}:\n${context.utils.EXPECTED_COLOR(redent(display(context, expectedValue), 2))}`,
    `${receivedLabel}:\n${context.utils.RECEIVED_COLOR(redent(display(context, receivedValue), 2))}`,
  ].join("\n");
}

export function matches(textToMatch: string, matcher: unknown): boolean {
  if (matcher instanceof RegExp) {
    return matcher.test(textToMatch);
  }
  return textToMatch.includes(String(matcher));
}

export function deprecate(name: string, replacementText?: string): void {
  // Notify user that they are using deprecated functionality.
  console.warn(`Warning: ${name} has been deprecated and will be removed in future updates.`, replacementText);
}

export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function getTag(element: DOMNode): string {
  return element.tagName && element.tagName.toLowerCase();
}

function getSelectValue({ multiple, options }: { multiple: boolean; options: ArrayLike<DOMNode> }): unknown {
  const selectedOptions: DOMNode[] = [];
  for (let i = 0; i < options.length; i++) if (options[i].selected) selectedOptions.push(options[i]);

  if (multiple) {
    return selectedOptions.map((opt) => opt.value);
  }
  if (selectedOptions.length === 0) {
    return undefined; // Couldn't make this happen, but just in case
  }
  return selectedOptions[0].value;
}

function getInputValue(inputElement: DOMNode): unknown {
  switch (inputElement.type) {
    case "number":
      return inputElement.value === "" ? null : Number(inputElement.value);
    case "checkbox":
      return inputElement.checked;
    default:
      return inputElement.value;
  }
}

const rolesSupportingValues = ["meter", "progressbar", "slider", "spinbutton"];
function getAccessibleValue(element: DOMNode): number | undefined {
  if (!rolesSupportingValues.includes(element.getAttribute("role"))) {
    return undefined;
  }
  return Number(element.getAttribute("aria-valuenow"));
}

export function getSingleElementValue(element: DOMNode): unknown {
  if (!element) {
    return undefined;
  }

  switch (element.tagName.toLowerCase()) {
    case "input":
      return getInputValue(element);
    case "select":
      return getSelectValue(element);
    default: {
      return element.value ?? getAccessibleValue(element);
    }
  }
}

export function toSentence(array: string[], { wordConnector = ", ", lastWordConnector = " and " } = {}): string {
  return [array.slice(0, -1).join(wordConnector), array[array.length - 1]].join(array.length > 1 ? lastWordConnector : "");
}

export function compareAsSet(val1: unknown, val2: unknown): boolean {
  if (Array.isArray(val1) && Array.isArray(val2)) {
    const set2 = new Set(val2);
    return [...new Set(val1)].every((v) => set2.has(v));
  }
  return val1 === val2;
}

// --- inlined dependencies ---------------------------------------------------------------

/**
 * redent@3 (strip-indent@3 + indent-string@4): remove the common leading indentation, then
 * indent every non-empty line by `count` spaces. MIT, Sindre Sorhus.
 */
export function redent(string: string, count: number): string {
  // min-indent
  const match = string.match(/^[ \t]*(?=\S)/gm);
  let indent = 0;
  if (match) {
    indent = match.reduce((r, a) => Math.min(r, a.length), Infinity);
  }
  const stripped = indent > 0 ? string.replace(new RegExp(`^[ \\t]{${indent}}`, "gm"), "") : string;
  if (count === 0) return stripped;
  return stripped.replace(/^(?!\s*$)/gm, " ".repeat(count));
}

/** https://drafts.csswg.org/cssom/#serialize-an-identifier (css.escape@1.5.1, MIT, Mathias Bynens). */
export function cssEscape(value: string): string {
  const string = String(value);
  const length = string.length;
  let index = -1;
  let result = "";
  const firstCodeUnit = string.charCodeAt(0);
  while (++index < length) {
    const codeUnit = string.charCodeAt(index);
    if (codeUnit === 0x0000) {
      result += "�";
      continue;
    }
    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit === 0x007f ||
      (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
    ) {
      result += "\\" + codeUnit.toString(16) + " ";
      continue;
    }
    if (index === 0 && length === 1 && codeUnit === 0x002d) {
      result += "\\" + string.charAt(index);
      continue;
    }
    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002d ||
      codeUnit === 0x005f ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007a)
    ) {
      result += string.charAt(index);
      continue;
    }
    result += "\\" + string.charAt(index);
  }
  return result;
}

// picocolors@1.1.1 `red` (ISC, Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov; NOTICE): same
// color detection, so toHaveStyle strips exactly what upstream strips from the diff header.
const env = process.env;
const argv = process.argv;
const isColorSupported =
  !(!!env.NO_COLOR || argv.includes("--no-color")) &&
  (!!env.FORCE_COLOR || argv.includes("--color") || process.platform === "win32" || (process.stdout?.isTTY && env.TERM !== "dumb") || !!env.CI);

export function picoRed(input: string): string {
  if (!isColorSupported) return String(input);
  const open = "\x1b[31m";
  const close = "\x1b[39m";
  const string = "" + input;
  let index = string.indexOf(close, open.length);
  if (index === -1) return open + string + close;
  let result = "";
  let cursor = 0;
  do {
    result += string.substring(cursor, index) + open;
    cursor = index + close.length;
    index = string.indexOf(close, cursor);
  } while (index !== -1);
  return open + result + string.substring(cursor) + close;
}

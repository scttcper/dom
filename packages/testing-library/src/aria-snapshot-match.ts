// Matching an accessibility tree against an aria snapshot template (not part of upstream
// @testing-library/dom): Playwright's `toMatchAriaSnapshot` semantics
// (https://playwright.dev/docs/aria-snapshots) over ./aria-snapshot.ts's tree, for jest-dom's
// `toMatchAriaSnapshot` matcher.
//
// Ported from Playwright 1.56, and changed from it as described below. The ported code is
// Copyright (c) Microsoft Corporation, licensed under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance with the License. You may obtain a
// copy of the License at http://www.apache.org/licenses/LICENSE-2.0 (also in NOTICE). Unless
// required by applicable law or agreed to in writing, software distributed under the License is
// distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
// implied. See the License for the specific language governing permissions and limitations under
// the License.
// - template parsing: packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts
//   (`parseAriaSnapshot`, `KeyParser`), with a line-based parser for the YAML subset templates
//   use instead of the `yaml` package;
// - matching: packages/injected/src/ariaSnapshot.ts (`matchesNode`, `containsList`, `listEqual`,
//   `matchesNodeDeep`, `matchesTextValue`).
//
// Partial matching (https://playwright.dev/docs/aria-snapshots#partial-matching): a template node
// matches a tree node when the role is equal, the name (a string, or a `/regex/`) matches when
// given, every listed attribute (`[checked]`, `[level=2]`, ...) has that value, and the template's
// children match a subsequence of the node's children in order. The template matches when its
// root matches any node of the tree (a template with several top-level items matches any node
// whose children contain them). `- /children: equal` and `deep-equal` require exact child lists.
//
// Differences from Playwright, all additive: `[active]` is checked (Playwright parses but ignores
// it), and our snapshot's extra states `[current]`, `[busy]` and `[hidden]` are accepted.
//
// On a mismatch the template is compared with the closest part of the tree: the node (or the
// node whose children) scores best against it, projected onto the template's shape, so the
// diff shows only what differs rather than every node the template leaves out.

import { roleSupportsProp } from "@ctrl/dom/aria";
import { ariaSnapshot, ariaSnapshotTree, envMaxLines, quote, truncate, yamlValue, type SnapshotNode } from "./aria-snapshot.ts";
import { diffLines, type Op } from "./aria-snapshot-diff.ts";

// --- templates -----------------------------------------------------------------------------

interface TextValue {
  raw: string;
  normalized: string;
  regex: RegExp | null;
}

interface TextTemplate {
  kind: "text";
  text: TextValue;
}

type ContainerMode = "contain" | "equal" | "deep-equal";

interface RoleTemplate {
  kind: "role";
  /** "fragment" for the implicit root of a template with several top-level items */
  role: string;
  name: string | RegExp | null;
  attrs: Array<[string, string]>;
  url: TextValue | null;
  mode: ContainerMode | null;
  children: Template[];
}

type Template = TextTemplate | RoleTemplate;

/** A template that is not valid aria snapshot YAML; the message names the line. */
export class AriaTemplateError extends Error {
  constructor(message: string, line: number, source: string, column = -1) {
    super(`${message} (template line ${line + 1}):\n\n${source}${column >= 0 ? `\n${" ".repeat(column)}^` : ""}`);
    this.name = "AriaTemplateError";
  }
}

// https://github.com/microsoft/playwright/blob/v1.56.0/packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts#L222
function normalizeWhitespace(text: string): string {
  return text.replace(/[​­]/g, "").replace(/[\r\n\s\t]+/g, " ").trim();
}

function textValue(raw: string): TextValue {
  // Playwright's cachedRegex: a value written `/…/` is a regular expression.
  let regex: RegExp | null = null;
  if (raw.length > 1 && raw.startsWith("/") && raw.endsWith("/")) {
    try {
      regex = new RegExp(raw.slice(1, -1));
    } catch {
      regex = null;
    }
  }
  return { raw, normalized: normalizeWhitespace(raw), regex };
}

const BOOLEAN_ATTRS = new Set(["disabled", "expanded", "active", "selected", "busy", "hidden"]);

/**
 * Parses a template: a YAML sequence of `- role "name" [attr]` items, `key: text` values, nested
 * sequences under `key:`, `- text: …` runs and `- /url:` / `- /children:` properties. A common
 * indentation (template literals) is ignored, as are blank lines and `#` comments.
 */
export function parseAriaTemplate(text: string): Template {
  const source = text.split(/\r?\n/);
  let minIndent = Infinity;
  for (let i = 0; i < source.length; i++) {
    const line = source[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (line.slice(0, indent).includes("\t")) throw new AriaTemplateError("Tabs cannot be used for indentation", i, line);
    if (indent < minIndent) minIndent = indent;
  }
  const fragment: RoleTemplate = { kind: "role", role: "fragment", name: null, attrs: [], url: null, mode: null, children: [] };
  if (minIndent === Infinity) throw new AriaTemplateError("The aria snapshot template is empty", 0, text);
  // Open containers by dash column; `node` is null for a `- text:` item, which takes no children.
  const stack: Array<{ indent: number; node: RoleTemplate | null; line: number }> = [{ indent: -1, node: fragment, line: -1 }];
  for (let i = 0; i < source.length; i++) {
    const line = source[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length - minIndent;
    if (trimmed !== "-" && !trimmed.startsWith("- ")) {
      throw new AriaTemplateError('Aria snapshot must be a YAML sequence, elements starting with "-"', i, line, indent + minIndent);
    }
    while (stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent.node === null) throw new AriaTemplateError(`"- text:" on line ${parent.line + 1} cannot have children`, i, line, indent + minIndent);
    const item = trimmed.slice(2).trimStart();
    const column = line.length - item.length;
    const child = parseItem(item, parent.node, i, line, column);
    if (child !== undefined) stack.push({ indent, node: child, line: i });
  }
  if (fragment.children.length === 1 && (fragment.mode === null || fragment.mode === "contain") && fragment.url === null) return fragment.children[0];
  return fragment;
}

/** One sequence item; returns the node that following deeper items nest under (null: a text item). */
function parseItem(item: string, parent: RoleTemplate, lineNo: number, line: string, column: number): RoleTemplate | null | undefined {
  const fail = (message: string, offset: number): never => {
    throw new AriaTemplateError(message, lineNo, line, column + offset);
  };
  if (item === "") fail("Empty sequence item", 0);
  // `- /url: …`, `- /children: equal`: properties of the parent node.
  if (item.startsWith("/")) {
    const colon = item.indexOf(":");
    if (colon < 0) fail("Property should be written `/name: value`", item.length);
    const prop = item.slice(1, colon).trim();
    const value = parseScalar(item.slice(colon + 1), fail, colon + 1);
    if (prop === "children") {
      if (value !== "contain" && value !== "equal" && value !== "deep-equal") fail('Value of "/children" should be "contain", "equal" or "deep-equal"', colon + 1);
      parent.mode = value as ContainerMode;
    } else if (prop === "url") {
      parent.url = textValue(value);
    }
    // Other properties (Playwright's /placeholder, ...) are accepted and ignored, as Playwright does.
    return undefined;
  }
  let node: RoleTemplate;
  // What follows the key's `:` (null: no colon).
  let rest: string | null = null;
  try {
    if (item[0] === '"' || item[0] === "'") {
      // A whole key in YAML quotes (Playwright prints `- 'link "a: b"'` that way).
      const [key, end] = readQuoted(item, 0, fail);
      const after = item.slice(end).trimStart();
      if (after !== "" && after[0] !== ":") fail("Unexpected input after the quoted key", end);
      if (after !== "") rest = after.slice(1);
      if (key === "text" && rest !== null) return textItem(parent, rest, fail, item.length - rest.length);
      node = new KeyParser(key).parse(false);
    } else {
      if (/^text:(\s|$)/.test(item)) return textItem(parent, item.slice(5), fail, 5);
      const parser = new KeyParser(item);
      node = parser.parse(true);
      if (parser.pos < item.length) rest = item.slice(parser.pos + 1);
    }
  } catch (error) {
    if (error instanceof KeyError) fail(error.message, item[0] === '"' || item[0] === "'" ? 0 : error.pos);
    throw error;
  }
  if (rest !== null && rest.trim() !== "") {
    node.children.push({ kind: "text", text: textValue(parseScalar(rest, fail, item.length - rest.length)) });
  }
  parent.children.push(node);
  return node;
}

function textItem(parent: RoleTemplate, rest: string, fail: (message: string, offset: number) => never, offset: number): null {
  parent.children.push({ kind: "text", text: textValue(parseScalar(rest, fail, offset)) });
  return null;
}

/** A YAML scalar after `key:`: double- or single-quoted, or plain (to a ` #` comment). */
function parseScalar(text: string, fail: (message: string, offset: number) => never, offset: number): string {
  const lead = text.length - text.trimStart().length;
  const value = text.trim();
  if (value[0] === '"' || value[0] === "'") {
    const [unquoted, end] = readQuoted(value, 0, (m, o) => fail(m, offset + lead + o));
    const after = value.slice(end).trim();
    if (after !== "" && !after.startsWith("#")) fail("Unexpected input after the quoted value", offset + lead + end);
    return unquoted;
  }
  if (value === "|" || value === ">" || value.startsWith("|") || value.startsWith(">")) fail("Block scalars are not supported in aria snapshot templates", offset + lead);
  const comment = value.search(/\s#/);
  return comment >= 0 ? value.slice(0, comment).trim() : value;
}

/** A YAML double-quoted (JSON-like escapes) or single-quoted (`''`) scalar starting at `start`. */
function readQuoted(text: string, start: number, fail: (message: string, offset: number) => never): [string, number] {
  const q = text[start];
  let out = "";
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (q === "'") {
      if (ch === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i++;
          continue;
        }
        return [out, i + 1];
      }
      out += ch;
      continue;
    }
    if (ch === '"') return [out, i + 1];
    if (ch === "\\") {
      const next = text[++i];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "u") {
        out += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16));
        i += 4;
      } else out += next ?? "";
      continue;
    }
    out += ch;
  }
  return fail("Unterminated string", text.length);
}

class KeyError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

// https://github.com/microsoft/playwright/blob/v1.56.0/packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts#L246
// (KeyParser): `role "name" [attr] [attr=value]`, or `role /regex/ …`. With `stopAtColon`, the key
// ends at a `:` followed by whitespace or the end of the item, and `pos` is left on it.
class KeyParser {
  pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  private peek(): string {
    return this.input[this.pos] ?? "";
  }

  private eof(): boolean {
    return this.pos >= this.input.length;
  }

  private skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.pos++;
  }

  private atColon(): boolean {
    return this.peek() === ":" && (this.pos + 1 >= this.input.length || /\s/.test(this.input[this.pos + 1]));
  }

  private readIdentifier(type: string): string {
    if (this.eof()) throw new KeyError(`Unexpected end of input when expecting ${type}`, this.pos);
    const start = this.pos;
    while (!this.eof() && /[a-zA-Z]/.test(this.peek())) this.pos++;
    if (this.pos === start) throw new KeyError(`Expected ${type}`, this.pos);
    return this.input.slice(start, this.pos);
  }

  private readString(): string {
    let result = "";
    while (!this.eof()) {
      const ch = this.input[this.pos++];
      if (ch === "\\") {
        const next = this.input[this.pos++] ?? "";
        if (next === "n") result += "\n";
        else if (next === "t") result += "\t";
        else if (next === "u") {
          result += String.fromCharCode(parseInt(this.input.slice(this.pos, this.pos + 4), 16));
          this.pos += 4;
        } else result += next;
      } else if (ch === '"') {
        return result;
      } else {
        result += ch;
      }
    }
    throw new KeyError("Unterminated string", this.pos);
  }

  private readRegex(): RegExp {
    const start = this.pos;
    let result = "";
    let escaped = false;
    let insideClass = false;
    while (!this.eof()) {
      const ch = this.input[this.pos++];
      if (escaped) {
        result += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
        result += ch;
      } else if (ch === "/" && !insideClass) {
        try {
          return new RegExp(result);
        } catch (error) {
          throw new KeyError(`Invalid regular expression: ${(error as Error).message}`, start);
        }
      } else if (ch === "[") {
        insideClass = true;
        result += ch;
      } else if (ch === "]" && insideClass) {
        result += ch;
        insideClass = false;
      } else {
        result += ch;
      }
    }
    throw new KeyError("Unterminated regex", this.pos);
  }

  parse(stopAtColon: boolean): RoleTemplate {
    this.skipWhitespace();
    const role = this.readIdentifier("role");
    this.skipWhitespace();
    let name: string | RegExp | null = null;
    if (this.peek() === '"') {
      this.pos++;
      name = normalizeWhitespace(this.readString());
    } else if (this.peek() === "/") {
      this.pos++;
      name = this.readRegex();
    }
    const node: RoleTemplate = { kind: "role", role, name: name === "" ? null : name, attrs: [], url: null, mode: null, children: [] };
    for (;;) {
      this.skipWhitespace();
      if (this.peek() !== "[") break;
      this.pos++;
      this.skipWhitespace();
      const errorPos = this.pos;
      const attr = this.readIdentifier("attribute");
      this.skipWhitespace();
      let value = "";
      if (this.peek() === "=") {
        this.pos++;
        this.skipWhitespace();
        while (this.peek() !== "]" && !/\s/.test(this.peek()) && !this.eof()) value += this.input[this.pos++];
      }
      this.skipWhitespace();
      if (this.peek() !== "]") throw new KeyError("Expected ]", this.pos);
      this.pos++;
      node.attrs.push([attr, checkAttribute(attr, value || "true", errorPos)]);
    }
    this.skipWhitespace();
    if (stopAtColon && this.atColon()) return node;
    if (!this.eof()) throw new KeyError(stopAtColon ? 'Unexpected input (a key ends with ":" and a space)' : "Unexpected input", this.pos);
    return node;
  }
}

/** Playwright's `_applyAttribute` checks, plus our snapshot's `current`, `busy` and `hidden`. */
function checkAttribute(attr: string, value: string, pos: number): string {
  if (attr === "checked" || attr === "pressed") {
    if (value !== "true" && value !== "false" && value !== "mixed") throw new KeyError(`Value of "${attr}" attribute must be a boolean or "mixed"`, pos);
    return value;
  }
  if (BOOLEAN_ATTRS.has(attr)) {
    if (value !== "true" && value !== "false") throw new KeyError(`Value of "${attr}" attribute must be a boolean`, pos);
    return value;
  }
  if (attr === "level") {
    if (Number.isNaN(Number(value))) throw new KeyError('Value of "level" attribute must be a number', pos);
    return String(Number(value));
  }
  if (attr === "current") return value;
  throw new KeyError(`Unsupported attribute [${attr}]`, pos);
}

// --- the tree being matched ------------------------------------------------------------------

/** A snapshot node with its value as a leading text child (Playwright's model) and parsed states. */
interface MatchNode {
  role: string;
  name: string;
  states: Map<string, string>;
  url: string | null;
  children: Array<MatchNode | string>;
  /** `[checked]`, `[level=2]`, … as printed */
  props: string[];
}

function toMatchNode(node: SnapshotNode): MatchNode {
  const children: Array<MatchNode | string> = [];
  if (node.value !== null && node.value !== "") children.push(normalizeWhitespace(node.value));
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    children.push(typeof c === "string" ? normalizeWhitespace(c) : toMatchNode(c));
  }
  const states = new Map<string, string>();
  for (let i = 0; i < node.props.length; i++) {
    const prop = node.props[i].slice(1, -1);
    const eq = prop.indexOf("=");
    if (eq < 0) states.set(prop, "true");
    else states.set(prop.slice(0, eq), prop.slice(eq + 1));
  }
  return { role: node.role, name: normalizeWhitespace(node.name), states, url: node.url, children, props: node.props };
}

/** A state's value when the snapshot omits it: what the omission means for that role. */
function stateOf(node: MatchNode, attr: string): string | undefined {
  const value = node.states.get(attr);
  if (value !== undefined) return value;
  switch (attr) {
    case "checked":
      return roleSupportsProp(node.role, "aria-checked") ? "false" : undefined;
    case "disabled":
    case "selected":
    case "active":
    case "busy":
    case "hidden":
    case "current":
      return "false";
  }
  // `expanded`, `pressed`, `level`: absent unless the element has them.
  return undefined;
}

function attrsMatch(node: MatchNode, t: RoleTemplate): boolean {
  for (let i = 0; i < t.attrs.length; i++) {
    const [attr, expected] = t.attrs[i];
    const actual = stateOf(node, attr);
    // `[current]` matches any aria-current token (`[current=page]` prints for "page").
    if (attr === "current" && expected === "true") {
      if (actual === undefined || actual === "false") return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

// https://github.com/microsoft/playwright/blob/v1.56.0/packages/injected/src/ariaSnapshot.ts (matchesStringOrRegex)
function matchesName(name: string, template: string | RegExp | null): boolean {
  if (template === null) return true;
  if (name === "") return false;
  if (typeof template === "string") return name === template;
  return template.test(name);
}

// (matchesTextValue)
function matchesText(text: string | null, template: TextValue | null): boolean {
  if (template === null || template.normalized === "") return true;
  if (!text) return false;
  if (text === template.normalized || text === template.raw) return true;
  return template.regex !== null && template.regex.test(text);
}

function headerMatches(node: MatchNode, t: RoleTemplate): boolean {
  return (t.role === "fragment" || t.role === node.role) && attrsMatch(node, t) && matchesName(node.name, t.name) && matchesText(node.url, t.url);
}

// (matchesNode)
function matchesNode(node: MatchNode | string, t: Template, deepEqual: boolean): boolean {
  if (typeof node === "string") return t.kind === "text" && matchesText(node, t.text);
  if (t.kind !== "role" || !headerMatches(node, t)) return false;
  if (t.mode === "contain") return containsList(node.children, t.children);
  if (t.mode === "equal") return listEqual(node.children, t.children, false);
  if (t.mode === "deep-equal" || deepEqual) return listEqual(node.children, t.children, true);
  return containsList(node.children, t.children);
}

// (listEqual)
function listEqual(children: Array<MatchNode | string>, templates: Template[], deepEqual: boolean): boolean {
  if (templates.length !== children.length) return false;
  for (let i = 0; i < templates.length; i++) if (!matchesNode(children[i], templates[i], deepEqual)) return false;
  return true;
}

// (containsList): the templates match a subsequence of the children, in order.
function containsList(children: Array<MatchNode | string>, templates: Template[]): boolean {
  if (templates.length > children.length) return false;
  let c = 0;
  for (let i = 0; i < templates.length; i++) {
    while (c < children.length && !matchesNode(children[c], templates[i], false)) c++;
    if (c === children.length) return false;
    c++;
  }
  return true;
}

// (matchesNodeDeep): does any node of the tree match?
function matchesDeep(node: MatchNode | string, t: Template): boolean {
  if (matchesNode(node, t, false)) return true;
  if (typeof node === "string") return false;
  for (let i = 0; i < node.children.length; i++) if (matchesDeep(node.children[i], t)) return true;
  return false;
}

// --- mismatch report ----------------------------------------------------------------------------

const MAX_TEXT = 100;

function textRepr(value: TextValue): string {
  return value.regex !== null ? value.raw : yamlValue(value.normalized);
}

function templateKey(t: RoleTemplate): string {
  let key = t.role;
  if (typeof t.name === "string") key += " " + quote(t.name);
  else if (t.name !== null) key += ` /${t.name.source}/`;
  for (let i = 0; i < t.attrs.length; i++) key += t.attrs[i][1] === "true" ? ` [${t.attrs[i][0]}]` : ` [${t.attrs[i][0]}=${t.attrs[i][1]}]`;
  return key;
}

function receivedKey(node: MatchNode): string {
  let key = node.role;
  if (node.name !== "") key += " " + quote(truncate(node.name, MAX_TEXT));
  for (let i = 0; i < node.props.length; i++) key += " " + node.props[i];
  return key;
}

function isInline(t: RoleTemplate): boolean {
  return t.url === null && t.mode === null && t.children.length === 1 && t.children[0].kind === "text";
}

/** The template in canonical form, one line per node. */
function renderTemplate(t: Template, indent: string, lines: string[]): void {
  if (t.kind === "text") {
    lines.push(`${indent}- text: ${textRepr(t.text)}`);
    return;
  }
  const key = templateKey(t);
  if (isInline(t)) {
    lines.push(`${indent}- ${key}: ${textRepr((t.children[0] as TextTemplate).text)}`);
    return;
  }
  if (t.children.length === 0 && t.url === null && t.mode === null) {
    lines.push(`${indent}- ${key}`);
    return;
  }
  lines.push(`${indent}- ${key}:`);
  const inner = indent + "  ";
  if (t.url !== null) lines.push(`${inner}- /url: ${textRepr(t.url)}`);
  if (t.mode !== null) lines.push(`${inner}- /children: ${t.mode}`);
  for (let i = 0; i < t.children.length; i++) renderTemplate(t.children[i], inner, lines);
}

/** Scores how well tree nodes fit template nodes, to pick what a failing template is compared with. */
class Scorer {
  private readonly memo = new Map<Template, Map<MatchNode | string, number>>();

  score(t: Template, node: MatchNode | string): number {
    if (t.kind === "text") return typeof node === "string" ? (matchesText(node, t.text) ? 3 : 1) : 0;
    if (typeof node === "string" || (t.role !== "fragment" && t.role !== node.role)) return 0;
    let byNode = this.memo.get(t);
    if (byNode === undefined) this.memo.set(t, (byNode = new Map()));
    const cached = byNode.get(node);
    if (cached !== undefined) return cached;
    let score = 2;
    score += t.name === null ? 1 : matchesName(node.name, t.name) ? 2 : 0;
    if (attrsMatch(node, t)) score += 1;
    if (t.url !== null && matchesText(node.url, t.url)) score += 1;
    score += this.scoreList(t.children, node.children);
    byNode.set(node, score);
    return score;
  }

  scoreList(templates: Template[], children: Array<MatchNode | string>): number {
    const aligned = this.align(templates, children);
    let score = 0;
    for (let i = 0; i < templates.length; i++) if (aligned[i] !== null) score += this.score(templates[i], aligned[i]!);
    return score;
  }

  /** For each template, in order, the best-scoring child after the previous one's (or null). */
  align(templates: Template[], children: Array<MatchNode | string>): Array<MatchNode | string | null> {
    const out: Array<MatchNode | string | null> = [];
    let from = 0;
    for (let i = 0; i < templates.length; i++) {
      let best = -1;
      let bestScore = 0;
      for (let j = from; j < children.length; j++) {
        const s = this.score(templates[i], children[j]);
        if (s > bestScore) {
          best = j;
          bestScore = s;
        }
      }
      if (best < 0) out.push(null);
      else {
        out.push(children[best]);
        from = best + 1;
      }
    }
    return out;
  }

  /** The tree node rendered in the template's shape: matching parts print as the template does. */
  project(t: Template, node: MatchNode | string, indent: string, lines: string[]): void {
    if (t.kind === "text") {
      const text = node as string;
      lines.push(`${indent}- text: ${matchesText(text, t.text) ? textRepr(t.text) : yamlValue(truncate(text, MAX_TEXT))}`);
      return;
    }
    const n = node as MatchNode;
    const key = headerMatches(n, t) ? templateKey(t) : receivedKey(n);
    const aligned = this.align(t.children, n.children);
    if (isInline(t)) {
      const text = aligned[0] as string | null;
      const tt = (t.children[0] as TextTemplate).text;
      lines.push(text === null ? `${indent}- ${key}` : `${indent}- ${key}: ${matchesText(text, tt) ? textRepr(tt) : yamlValue(truncate(text, MAX_TEXT))}`);
      return;
    }
    if (t.children.length === 0 && t.url === null && t.mode === null) {
      lines.push(`${indent}- ${key}`);
      return;
    }
    lines.push(`${indent}- ${key}:`);
    const inner = indent + "  ";
    if (t.url !== null) lines.push(`${inner}- /url: ${matchesText(n.url, t.url) ? textRepr(t.url) : yamlValue(n.url ?? "")}`);
    if (t.mode !== null) lines.push(`${inner}- /children: ${t.mode}`);
    for (let i = 0; i < t.children.length; i++) if (aligned[i] !== null) this.project(t.children[i], aligned[i]!, inner, lines);
  }
}

function forEachNode(node: MatchNode, visit: (node: MatchNode | string) => void): void {
  visit(node);
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    if (typeof c === "string") visit(c);
    else forEachNode(c, visit);
  }
}

/** The closest part of the tree to `t`, projected onto its shape. */
function closestLines(root: MatchNode, t: Template): string[] {
  const scorer = new Scorer();
  const lines: string[] = [];
  if (t.kind === "role" && t.role === "fragment") {
    let best: MatchNode | null = null;
    let bestScore = 0;
    forEachNode(root, (node) => {
      if (typeof node === "string") return;
      const s = scorer.scoreList(t.children, node.children);
      if (s > bestScore) {
        best = node;
        bestScore = s;
      }
    });
    if (best !== null) {
      const aligned = scorer.align(t.children, (best as MatchNode).children);
      for (let i = 0; i < t.children.length; i++) if (aligned[i] !== null) scorer.project(t.children[i], aligned[i]!, "", lines);
    }
    return lines;
  }
  let best: MatchNode | string | null = null;
  let bestScore = 0;
  forEachNode(root, (node) => {
    const s = scorer.score(t, node);
    if (s > bestScore) {
      best = node;
      bestScore = s;
    }
  });
  if (best !== null) scorer.project(t, best, "", lines);
  return lines;
}

/**
 * A run of N removed lines followed by N added ones becomes N `-`/`+` pairs: the projection has
 * the template's shape, so the i-th removed and added lines are the same template node.
 */
function pairChanges(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (let i = 0; i < ops.length; ) {
    if (ops[i].kind === "=") {
      out.push(ops[i++]);
      continue;
    }
    let r = i;
    while (r < ops.length && ops[r].kind === "-") r++;
    let a = r;
    while (a < ops.length && ops[a].kind === "+") a++;
    if (r - i === a - r) {
      for (let k = 0; k < r - i; k++) out.push(ops[i + k], ops[r + k]);
    } else {
      for (let k = i; k < a; k++) out.push(ops[k]);
    }
    i = a;
  }
  return out;
}

// --- API ----------------------------------------------------------------------------------------

export interface AriaSnapshotMatch {
  /** whether the tree contains the template */
  pass: boolean;
  /** The template in canonical form (one line per node). */
  expected(): string;
  /**
   * Template lines (`-`) against the closest part of the tree in the template's shape (`+`),
   * with equal lines (`=`) in between: only what differs, not the nodes the template leaves out.
   */
  diff(): Op[];
  /** The whole snapshot (budgeted, runs not collapsed), usable as a template. */
  received(): string;
}

/** Line budget for the received snapshot in a failure message. */
const RECEIVED_MAX_LINES = 100;

/**
 * Matches the accessibility tree of `container` (an element prints itself, a body, document or
 * fragment its children) against an aria snapshot template, with Playwright's partial matching.
 * Throws AriaTemplateError for an invalid template.
 */
export function matchAriaSnapshot(container: any, template: string): AriaSnapshotMatch {
  const t = parseAriaTemplate(template);
  const tree = ariaSnapshotTree(container, { urls: true });
  const children: Array<MatchNode | string> = [];
  for (let i = 0; i < tree.length; i++) {
    const c = tree[i];
    children.push(typeof c === "string" ? normalizeWhitespace(c) : toMatchNode(c));
  }
  const root: MatchNode = { role: "fragment", name: "", states: new Map(), url: null, children, props: [] };
  const pass = matchesDeep(root, t);
  const expectedLines = (): string[] => {
    const lines: string[] = [];
    if (t.kind === "role" && t.role === "fragment") {
      if (t.mode !== null) lines.push(`- /children: ${t.mode}`);
      for (let i = 0; i < t.children.length; i++) renderTemplate(t.children[i], "", lines);
    } else renderTemplate(t, "", lines);
    return lines;
  };
  return {
    pass,
    expected: () => expectedLines().join("\n"),
    diff: () => pairChanges(diffLines(expectedLines(), closestLines(root, t))),
    received: () => ariaSnapshot(container, { collapseAfter: Infinity, maxLines: envMaxLines() ?? RECEIVED_MAX_LINES }),
  };
}

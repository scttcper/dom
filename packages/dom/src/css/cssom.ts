// CSS Object Model: style sheets, rules and lists.
// https://drafts.csswg.org/cssom/#css-object-model
// https://drafts.csswg.org/css-conditional-3/#the-cssmediarule-interface
// https://drafts.csswg.org/css-cascade-5/#layer-apis
// https://drafts.csswg.org/css-animations-1/#interface-csskeyframesrule
// https://drafts.csswg.org/css-nesting-1/#cssom
//
// Every mutation (insertRule/deleteRule, replace, media/disabled changes, rule.style edits,
// selectorText) bumps the owning document's `_styleVersion`, which invalidates the rule
// index and every cached computed style.

import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import { parseRule, parseStylesheet, RULE_AT, RULE_QUALIFIED, type RawRule } from "./parser.ts";
import { DeclBlock } from "./declarations.ts";
import { CSSStyleDeclaration, type DeclarationOwnerRule } from "./CSSStyleDeclaration.ts";
import { type MediaQuery, parseMediaQueryList, serializeMediaQueryList } from "./media.ts";
import { compileSelectorList, serializeSelector, type CompiledSelectorList } from "../selectors/internal.ts";
import { containsNesting, resolveNested } from "./selector-info.ts";
import { serializeString, serializeUrl, splitComponents, TK_FUNCTION, TK_IDENT, TK_STRING, TK_URL, COMP_SPACE } from "./values.ts";
import { evaluateSupportsCondition } from "./supports.ts";
import { currentWindowOrNull } from "../window/current.ts";

// --- lists -------------------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#the-cssrulelist-interface — live view over a rule array. */
export class CSSRuleList {
  _rules: CSSRule[];
  _indexed: number;

  constructor(rules: CSSRule[]) {
    this._rules = rules;
    this._indexed = 0;
    this._sync();
  }

  /** @internal Swap the backing array (replaceSync). */
  _setRules(rules: CSSRule[]): void {
    this._rules = rules;
    this._sync();
  }

  /** @internal Re-sync own indexed properties after the backing array changed. */
  _sync(): void {
    const self = this as unknown as Record<number, CSSRule>;
    const rules = this._rules;
    for (let i = 0; i < rules.length; i++) self[i] = rules[i];
    for (let i = rules.length; i < this._indexed; i++) delete self[i];
    this._indexed = rules.length;
  }

  get length(): number {
    return this._rules.length;
  }

  item(index: number): CSSRule | null {
    return this._rules[index >>> 0] ?? null;
  }

  *[Symbol.iterator](): IterableIterator<CSSRule> {
    yield* this._rules;
  }

  get [Symbol.toStringTag](): string {
    return "CSSRuleList";
  }
}

/** https://drafts.csswg.org/cssom/#the-medialist-interface */
export class MediaList {
  _queries: MediaQuery[];
  _owner: { _changed(): void } | null;
  _indexed: number;

  constructor(text: string, owner: { _changed(): void } | null) {
    this._queries = text === "" ? [] : parseMediaQueryList(text);
    this._owner = owner;
    this._indexed = 0;
    this._sync();
  }

  _sync(): void {
    const self = this as unknown as Record<number, string>;
    const q = this._queries;
    for (let i = 0; i < q.length; i++) self[i] = q[i].text;
    for (let i = q.length; i < this._indexed; i++) delete self[i];
    this._indexed = q.length;
  }

  get mediaText(): string {
    return serializeMediaQueryList(this._queries);
  }

  set mediaText(text: string) {
    const t = text === null ? "" : String(text);
    this._queries = t === "" ? [] : parseMediaQueryList(t).slice();
    this._sync();
    this._owner?._changed();
  }

  get length(): number {
    return this._queries.length;
  }

  item(index: number): string | null {
    return this._queries[index >>> 0]?.text ?? null;
  }

  /** https://drafts.csswg.org/cssom/#dom-medialist-appendmedium */
  appendMedium(medium: string): void {
    const q = parseMediaQueryList(String(medium));
    if (q.length !== 1) return;
    for (const existing of this._queries) if (existing.text === q[0].text) return;
    this._queries = [...this._queries, q[0]];
    this._sync();
    this._owner?._changed();
  }

  /** https://drafts.csswg.org/cssom/#dom-medialist-deletemedium */
  deleteMedium(medium: string): void {
    const q = parseMediaQueryList(String(medium));
    if (q.length !== 1) return;
    const before = this._queries.length;
    this._queries = this._queries.filter((x) => x.text !== q[0].text);
    if (this._queries.length === before) throw new DOMException("Failed to execute 'deleteMedium' on 'MediaList': Failed to delete the medium.", "NotFoundError");
    this._sync();
    this._owner?._changed();
  }

  toString(): string {
    return this.mediaText;
  }

  *[Symbol.iterator](): IterableIterator<string> {
    for (const q of this._queries) yield q.text;
  }

  get [Symbol.toStringTag](): string {
    return "MediaList";
  }
}

/** https://drafts.csswg.org/cssom/#the-stylesheetlist-interface — kept in sync by stylesheets.ts. */
export class StyleSheetList {
  _sheets: CSSStyleSheet[];
  _indexed: number;

  constructor() {
    this._sheets = [];
    this._indexed = 0;
  }

  /** @internal */
  _set(sheets: CSSStyleSheet[]): void {
    this._sheets = sheets;
    const self = this as unknown as Record<number, CSSStyleSheet>;
    for (let i = 0; i < sheets.length; i++) self[i] = sheets[i];
    for (let i = sheets.length; i < this._indexed; i++) delete self[i];
    this._indexed = sheets.length;
  }

  get length(): number {
    return this._sheets.length;
  }

  item(index: number): CSSStyleSheet | null {
    return this._sheets[index >>> 0] ?? null;
  }

  *[Symbol.iterator](): IterableIterator<CSSStyleSheet> {
    yield* this._sheets;
  }

  get [Symbol.toStringTag](): string {
    return "StyleSheetList";
  }
}

// --- style sheets ------------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#the-stylesheet-interface */
export class StyleSheet {
  _ownerNode: Element | null;
  _media: MediaList;
  _disabled: boolean;
  _title: string | null;
  _href: string | null;

  constructor(ownerNode: Element | null, media: string, title: string | null, href: string | null) {
    this._ownerNode = ownerNode;
    this._media = new MediaList(media, this as unknown as { _changed(): void });
    this._disabled = false;
    this._title = title;
    this._href = href;
  }

  _changed(): void {}

  get type(): string {
    return "text/css";
  }

  get href(): string | null {
    return this._href;
  }

  get ownerNode(): Element | null {
    return this._ownerNode;
  }

  get parentStyleSheet(): CSSStyleSheet | null {
    return null;
  }

  get title(): string | null {
    return this._title;
  }

  get media(): MediaList {
    return this._media;
  }

  set media(text: string) {
    this._media.mediaText = String(text);
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    const v = !!value;
    if (v === this._disabled) return;
    this._disabled = v;
    this._changed();
  }
}

export interface CSSStyleSheetInit {
  baseURL?: string;
  media?: string | MediaList;
  disabled?: boolean;
}

function syntaxError(method: string, iface: string, rule: string): DOMException {
  return new DOMException(`Failed to execute '${method}' on '${iface}': Failed to parse the rule '${rule}'.`, "SyntaxError");
}

/** https://drafts.csswg.org/cssom/#the-cssstylesheet-interface */
export class CSSStyleSheet extends StyleSheet {
  _rules: CSSRule[];
  _list: CSSRuleList | null;
  /** Document whose style version this sheet bumps (owner node's document, or the constructor document). */
  _doc: Document | null;
  /** https://drafts.csswg.org/cssom/#concept-css-style-sheet-constructed-flag */
  _constructed: boolean;
  /** https://drafts.csswg.org/cssom/#concept-css-style-sheet-disallow-modification-flag */
  _disallowModification: boolean;
  _ownerRule: CSSImportRule | null;
  /** @namespace declarations (prefix → URI), for selector compilation. */
  _namespaces: Map<string, string | null> | null;
  _defaultNamespace: string | null | undefined;
  /** Bumped on every change (rule index cache key). */
  _version: number;

  constructor(options?: CSSStyleSheetInit) {
    const media = options?.media;
    super(null, media === undefined ? "" : typeof media === "string" ? media : media.mediaText, null, null);
    this._rules = [];
    this._list = null;
    this._doc = null;
    this._constructed = true;
    this._disallowModification = false;
    this._ownerRule = null;
    this._namespaces = null;
    this._defaultNamespace = undefined;
    this._version = 0;
    if (options?.disabled) this._disabled = true;
    this._doc = (currentWindowOrNull()?.document as Document | undefined) ?? null;
    if (options?.baseURL !== undefined) this._href = null;
  }

  /** @internal Create a non-constructed sheet for a <style>/<link> owner. */
  static _forOwner(owner: Element, text: string, media: string, href: string | null): CSSStyleSheet {
    const sheet = new CSSStyleSheet();
    sheet._constructed = false;
    sheet._ownerNode = owner;
    sheet._doc = owner._impl.doc;
    sheet._href = href;
    sheet._title = owner.getAttribute("title");
    if (media !== "") sheet._media.mediaText = media;
    sheet._setText(text);
    return sheet;
  }

  override _changed(): void {
    this._version++;
    const doc = this._doc;
    if (doc !== null) doc._styleVersion++;
  }

  /** Replaces all rules from stylesheet text (no @import fetching). */
  _setText(text: string): void {
    this._rules = [];
    this._namespaces = null;
    this._defaultNamespace = undefined;
    const raws = text === "" ? [] : parseStylesheet(text);
    let seenOther = false;
    for (const raw of raws) {
      const name = raw.kind === RULE_AT ? raw.name.toLowerCase() : "";
      if (name === "import" || name === "namespace") {
        if (seenOther && name === "import") continue;
        if (seenOther && this._rules.some((r) => !(r instanceof CSSImportRule) && !(r instanceof CSSNamespaceRule) && !(r instanceof CSSLayerStatementRule))) continue;
      }
      const rule = createRule(raw, null, this, false, false);
      if (rule === null) continue;
      if (!(rule instanceof CSSImportRule) && !(rule instanceof CSSLayerStatementRule) && !(rule instanceof CSSNamespaceRule)) seenOther = true;
      rule._sheet = this;
      this._rules.push(rule);
      if (rule instanceof CSSNamespaceRule) this._registerNamespace(rule);
    }
    this._list?._setRules(this._rules);
    this._changed();
  }

  _registerNamespace(rule: CSSNamespaceRule): void {
    if (rule._prefix === "") this._defaultNamespace = rule._uri === "" ? null : rule._uri;
    else (this._namespaces ??= new Map()).set(rule._prefix, rule._uri === "" ? null : rule._uri);
  }

  override get parentStyleSheet(): CSSStyleSheet | null {
    return this._ownerRule === null ? null : this._ownerRule.parentStyleSheet;
  }

  get ownerRule(): CSSImportRule | null {
    return this._ownerRule;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-cssrules */
  get cssRules(): CSSRuleList {
    return (this._list ??= new CSSRuleList(this._rules));
  }

  get rules(): CSSRuleList {
    return this.cssRules;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-insertrule */
  insertRule(rule: string, index: number = 0): number {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'insertRule' on 'CSSStyleSheet': 1 argument required, but only 0 present.");
    if (this._disallowModification) throw new DOMException("Failed to execute 'insertRule' on 'CSSStyleSheet': Cannot modify a sheet while it is being replaced.", "NotAllowedError");
    const text = String(rule);
    const i = index >>> 0;
    if (i > this._rules.length) {
      throw new DOMException(`Failed to execute 'insertRule' on 'CSSStyleSheet': The index provided (${i}) is larger than the maximum index (${this._rules.length}).`, "IndexSizeError");
    }
    const raw = parseRule(text);
    if (raw === null) throw syntaxError("insertRule", "CSSStyleSheet", text);
    const name = raw.kind === RULE_AT ? raw.name.toLowerCase() : "";
    if (name === "import" && this._constructed) throw syntaxError("insertRule", "CSSStyleSheet", text);
    const created = createRule(raw, null, this, false, false);
    if (created === null) throw syntaxError("insertRule", "CSSStyleSheet", text);
    // https://drafts.csswg.org/cssom/#insert-a-css-rule step 6 constraints.
    if (created instanceof CSSImportRule) {
      for (let k = 0; k < i; k++) {
        const r = this._rules[k];
        if (!(r instanceof CSSImportRule) && !(r instanceof CSSLayerStatementRule)) {
          throw new DOMException("Failed to execute 'insertRule' on 'CSSStyleSheet': @import rules must precede all rules except @charset and @layer statements.", "HierarchyRequestError");
        }
      }
    } else if (!(created instanceof CSSNamespaceRule) && !(created instanceof CSSLayerStatementRule)) {
      for (let k = i; k < this._rules.length; k++) {
        if (this._rules[k] instanceof CSSImportRule || this._rules[k] instanceof CSSNamespaceRule) {
          throw new DOMException("Failed to execute 'insertRule' on 'CSSStyleSheet': Rules cannot be inserted before @import or @namespace rules.", "HierarchyRequestError");
        }
      }
    } else if (created instanceof CSSNamespaceRule) {
      for (const r of this._rules) {
        if (!(r instanceof CSSImportRule) && !(r instanceof CSSNamespaceRule) && !(r instanceof CSSLayerStatementRule)) {
          throw new DOMException("Failed to execute 'insertRule' on 'CSSStyleSheet': Failed to insert a @namespace rule after other rules.", "InvalidStateError");
        }
      }
      this._registerNamespace(created);
    }
    created._sheet = this;
    this._rules.splice(i, 0, created);
    this._list?._sync();
    this._changed();
    return i;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-deleterule */
  deleteRule(index: number): void {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'deleteRule' on 'CSSStyleSheet': 1 argument required, but only 0 present.");
    if (this._disallowModification) throw new DOMException("Failed to execute 'deleteRule' on 'CSSStyleSheet': Cannot modify a sheet while it is being replaced.", "NotAllowedError");
    const i = index >>> 0;
    if (i >= this._rules.length) {
      throw new DOMException(`Failed to execute 'deleteRule' on 'CSSStyleSheet': The index provided (${i}) is larger than the maximum index (${Math.max(0, this._rules.length - 1)}).`, "IndexSizeError");
    }
    const [removed] = this._rules.splice(i, 1);
    removed._sheet = null;
    this._list?._sync();
    this._changed();
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-addrule (legacy) */
  addRule(selector: string = "undefined", style: string = "undefined", index?: number): number {
    let rule = String(selector) + " { " + String(style) + " }";
    if (String(style) === "") rule = String(selector) + " { }";
    this.insertRule(rule, index === undefined ? this._rules.length : index);
    return -1;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-removerule (legacy) */
  removeRule(index: number = 0): void {
    this.deleteRule(index);
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-replace */
  replace(text: string): Promise<CSSStyleSheet> {
    if (!this._constructed || this._disallowModification) {
      return Promise.reject(new DOMException("Failed to execute 'replace' on 'CSSStyleSheet': Can't call replace on non-constructed CSSStyleSheets.", "NotAllowedError"));
    }
    this._disallowModification = true;
    const value = String(text);
    return Promise.resolve().then(() => {
      this._setText(stripImports(value));
      this._disallowModification = false;
      return this;
    });
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-replacesync */
  replaceSync(text: string): void {
    if (!this._constructed || this._disallowModification) {
      throw new DOMException("Failed to execute 'replaceSync' on 'CSSStyleSheet': Can't call replaceSync on non-constructed CSSStyleSheets.", "NotAllowedError");
    }
    this._setText(stripImports(String(text)));
  }

  get [Symbol.toStringTag](): string {
    return "CSSStyleSheet";
  }
}

/** Constructed sheets ignore @import rules (https://drafts.csswg.org/cssom/#synchronously-replace-the-rules-of-a-cssstylesheet). */
function stripImports(text: string): string {
  if (text.indexOf("@import") === -1 && text.indexOf("@IMPORT") === -1) return text;
  return text.replace(/@import[^;]*;/gi, "");
}


// --- rules -------------------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#the-cssrule-interface */
export class CSSRule {
  /** Owning sheet for top-level rules (nested rules find it through their parent). */
  _sheet: CSSStyleSheet | null;
  _parent: CSSRule | null;

  static readonly STYLE_RULE = 1;
  static readonly CHARSET_RULE = 2;
  static readonly IMPORT_RULE = 3;
  static readonly MEDIA_RULE = 4;
  static readonly FONT_FACE_RULE = 5;
  static readonly PAGE_RULE = 6;
  static readonly KEYFRAMES_RULE = 7;
  static readonly KEYFRAME_RULE = 8;
  static readonly MARGIN_RULE = 9;
  static readonly NAMESPACE_RULE = 10;
  static readonly COUNTER_STYLE_RULE = 11;
  static readonly SUPPORTS_RULE = 12;
  static readonly DOCUMENT_RULE = 13;
  static readonly FONT_FEATURE_VALUES_RULE = 14;
  static readonly VIEWPORT_RULE = 15;
  static readonly REGION_STYLE_RULE = 16;

  constructor() {
    if (new.target === CSSRule) throw new TypeError("Illegal constructor");
    this._sheet = null;
    this._parent = null;
  }

  get type(): number {
    return 0;
  }

  get cssText(): string {
    return "";
  }

  /** https://drafts.csswg.org/cssom/#dom-cssrule-csstext — setting does nothing. */
  set cssText(_value: string) {}

  get parentRule(): CSSRule | null {
    return this._parent;
  }

  get parentStyleSheet(): CSSStyleSheet | null {
    let r: CSSRule = this;
    while (r._parent !== null) r = r._parent;
    return r._sheet;
  }

  /** Bumps the owning sheet (and document) style version. */
  _changed(): void {
    this.parentStyleSheet?._changed();
  }

  _declarationsChanged(): void {
    this._changed();
  }
}

for (const [k, v] of Object.entries({
  STYLE_RULE: 1, CHARSET_RULE: 2, IMPORT_RULE: 3, MEDIA_RULE: 4, FONT_FACE_RULE: 5, PAGE_RULE: 6, KEYFRAMES_RULE: 7, KEYFRAME_RULE: 8,
  MARGIN_RULE: 9, NAMESPACE_RULE: 10, COUNTER_STYLE_RULE: 11, SUPPORTS_RULE: 12, DOCUMENT_RULE: 13, FONT_FEATURE_VALUES_RULE: 14,
  VIEWPORT_RULE: 15, REGION_STYLE_RULE: 16,
})) {
  Object.defineProperty(CSSRule.prototype, k, { value: v, enumerable: true });
}

function indent(text: string): string {
  return "  " + text.replace(/\n/g, "\n  ");
}

function blockText(prefix: string, rules: CSSRule[]): string {
  if (rules.length === 0) return prefix + " {\n}";
  let out = prefix + " {";
  for (const r of rules) out += "\n" + indent(r.cssText);
  return out + "\n}";
}

/** https://drafts.csswg.org/cssom/#the-cssgroupingrule-interface */
export class CSSGroupingRule extends CSSRule {
  _rules: CSSRule[];
  _list: CSSRuleList | null;

  constructor() {
    super();
    this._rules = [];
    this._list = null;
  }

  get cssRules(): CSSRuleList {
    return (this._list ??= new CSSRuleList(this._rules));
  }

  /** Whether rules inside are nested in a style rule (relative selectors, nested declarations). */
  _nestedContext(): boolean {
    for (let r: CSSRule | null = this; r !== null; r = r._parent) if (r instanceof CSSStyleRule) return true;
    return false;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssgroupingrule-insertrule */
  insertRule(rule: string, index: number = 0): number {
    if (arguments.length === 0) throw new TypeError(`Failed to execute 'insertRule' on '${this.constructor.name}': 1 argument required, but only 0 present.`);
    const text = String(rule);
    const i = index >>> 0;
    if (i > this._rules.length) {
      throw new DOMException(`Failed to execute 'insertRule' on '${this.constructor.name}': The index provided (${i}) is larger than the maximum index (${this._rules.length}).`, "IndexSizeError");
    }
    const raw = parseRule(text);
    if (raw === null) throw syntaxError("insertRule", this.constructor.name, text);
    const nested = this._nestedContext();
    const created = createRule(raw, this, this.parentStyleSheet, nested, false);
    if (created === null || created instanceof CSSImportRule || created instanceof CSSNamespaceRule) {
      if (created instanceof CSSImportRule || created instanceof CSSNamespaceRule) {
        throw new DOMException(`Failed to execute 'insertRule' on '${this.constructor.name}': '${text}' is not allowed here.`, "HierarchyRequestError");
      }
      throw syntaxError("insertRule", this.constructor.name, text);
    }
    this._rules.splice(i, 0, created);
    this._list?._sync();
    this._changed();
    return i;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssgroupingrule-deleterule */
  deleteRule(index: number): void {
    if (arguments.length === 0) throw new TypeError(`Failed to execute 'deleteRule' on '${this.constructor.name}': 1 argument required, but only 0 present.`);
    const i = index >>> 0;
    if (i >= this._rules.length) {
      throw new DOMException(`Failed to execute 'deleteRule' on '${this.constructor.name}': The index provided (${i}) is larger than the maximum index (${Math.max(0, this._rules.length - 1)}).`, "IndexSizeError");
    }
    const [removed] = this._rules.splice(i, 1);
    removed._parent = null;
    this._list?._sync();
    this._changed();
  }
}

/** https://drafts.csswg.org/cssom/#the-cssstylerule-interface (+ CSS Nesting: nested cssRules) */
export class CSSStyleRule extends CSSGroupingRule implements DeclarationOwnerRule {
  _selector: string;
  _block: DeclBlock;
  _style: CSSStyleDeclaration | null;
  /** Compiled (nesting-resolved) selector list, cached until selectorText or an ancestor selector changes. */
  _compiled: CompiledSelectorList | null;
  _compiledFor: string;

  constructor(selector: string, block: DeclBlock) {
    super();
    this._selector = selector;
    this._block = block;
    this._style = null;
    this._compiled = null;
    this._compiledFor = "";
  }

  override get type(): number {
    return 1;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylerule-selectortext */
  get selectorText(): string {
    if (containsNesting(this._selector)) return this._selector;
    return serializeSelector(this._selector) ?? this._selector;
  }

  set selectorText(value: string) {
    const text = String(value).trim();
    if (!isValidSelectorFor(text, this._nestedContextForSelf())) return;
    this._selector = text;
    this._compiled = null;
    this._changed();
  }

  _nestedContextForSelf(): boolean {
    for (let r: CSSRule | null = this._parent; r !== null; r = r._parent) if (r instanceof CSSStyleRule) return true;
    return false;
  }

  get style(): CSSStyleDeclaration {
    return (this._style ??= new CSSStyleDeclaration(null, this._block, this));
  }

  set style(text: string) {
    this.style.cssText = String(text);
  }

  override get cssText(): string {
    const decls = this._block.serialize();
    if (this._rules.length === 0) return decls === "" ? `${this.selectorText} { }` : `${this.selectorText} { ${decls} }`;
    let out = `${this.selectorText} {`;
    if (decls !== "") out += "\n  " + decls;
    for (const r of this._rules) out += "\n" + indent(r.cssText);
    return out + "\n}";
  }

  /**
   * Nesting-resolved selector texts (https://drafts.csswg.org/css-nesting-1/#nest-selector).
   * Top-level rules resolve to their own selector list.
   */
  _resolvedSelectors(): string[] {
    let parent: CSSRule | null = this._parent;
    while (parent !== null && !(parent instanceof CSSStyleRule)) parent = parent._parent;
    if (parent === null) {
      if (!containsNesting(this._selector)) return [this._selector];
      return resolveNested(this._selector, [":scope"]);
    }
    return resolveNested(this._selector, (parent as CSSStyleRule)._resolvedSelectors());
  }

  /** Compiled selector list for matching (null if the engine rejects it). */
  _compile(): CompiledSelectorList | null {
    const resolved = this._resolvedSelectors().join(", ");
    if (this._compiled !== null && this._compiledFor === resolved) return this._compiled;
    const sheet = this.parentStyleSheet;
    const options =
      sheet !== null && (sheet._namespaces !== null || sheet._defaultNamespace !== undefined)
        ? { namespaces: sheet._namespaces ?? undefined, defaultNamespace: sheet._defaultNamespace }
        : undefined;
    this._compiled = compileSelectorList(resolved, options);
    this._compiledFor = resolved;
    return this._compiled;
  }

  get [Symbol.toStringTag](): string {
    return "CSSStyleRule";
  }
}

/** https://drafts.csswg.org/css-nesting-1/#cssnesteddeclarations — declarations after/inside nested group rules. */
export class CSSNestedDeclarations extends CSSRule implements DeclarationOwnerRule {
  _block: DeclBlock;
  _style: CSSStyleDeclaration | null;

  constructor(block: DeclBlock) {
    super();
    this._block = block;
    this._style = null;
  }

  override get type(): number {
    return 0;
  }

  get style(): CSSStyleDeclaration {
    return (this._style ??= new CSSStyleDeclaration(null, this._block, this));
  }

  override get cssText(): string {
    return this._block.serialize();
  }
}

/** https://drafts.csswg.org/css-conditional-3/#the-cssconditionrule-interface */
export class CSSConditionRule extends CSSGroupingRule {
  get conditionText(): string {
    return "";
  }
}

/** https://drafts.csswg.org/css-conditional-3/#the-cssmediarule-interface */
export class CSSMediaRule extends CSSConditionRule {
  _media: MediaList;

  constructor(media: string) {
    super();
    this._media = new MediaList(media, this);
  }

  override get type(): number {
    return 4;
  }

  get media(): MediaList {
    return this._media;
  }

  set media(text: string) {
    this._media.mediaText = String(text);
  }

  override get conditionText(): string {
    return this._media.mediaText;
  }

  override get cssText(): string {
    return blockText("@media " + this._media.mediaText, this._rules);
  }
}

/** https://drafts.csswg.org/css-conditional-3/#the-csssupportsrule-interface */
export class CSSSupportsRule extends CSSConditionRule {
  _condition: string;
  _matches: boolean;

  constructor(condition: string) {
    super();
    this._condition = condition;
    this._matches = evaluateSupportsCondition(condition);
  }

  override get type(): number {
    return 12;
  }

  override get conditionText(): string {
    return this._condition;
  }

  override get cssText(): string {
    return blockText("@supports " + this._condition, this._rules);
  }
}

/** https://drafts.csswg.org/css-contain-3/#the-csscontainerrule-interface — stored, never matches (no layout). */
export class CSSContainerRule extends CSSConditionRule {
  _condition: string;

  constructor(condition: string) {
    super();
    this._condition = condition;
  }

  override get conditionText(): string {
    return this._condition;
  }

  get containerName(): string {
    const m = /^([^\s(]+)\s/.exec(this._condition);
    return m !== null && m[1].toLowerCase() !== "not" ? m[1] : "";
  }

  get containerQuery(): string {
    const name = this.containerName;
    return name === "" ? this._condition : this._condition.slice(name.length).trim();
  }

  override get cssText(): string {
    return blockText("@container " + this._condition, this._rules);
  }
}

/** https://drafts.csswg.org/css-cascade-5/#the-csslayerblockrule-interface */
export class CSSLayerBlockRule extends CSSGroupingRule {
  _name: string;

  constructor(name: string) {
    super();
    this._name = name;
  }

  get name(): string {
    return this._name;
  }

  override get cssText(): string {
    return blockText(this._name === "" ? "@layer" : "@layer " + this._name, this._rules);
  }
}

/** https://drafts.csswg.org/css-cascade-5/#the-csslayerstatementrule-interface */
export class CSSLayerStatementRule extends CSSRule {
  _names: string[];

  constructor(names: string[]) {
    super();
    this._names = names;
  }

  get nameList(): readonly string[] {
    return Object.freeze(this._names.slice());
  }

  override get cssText(): string {
    return "@layer " + this._names.join(", ") + ";";
  }
}

/** https://drafts.csswg.org/css-cascade-6/#the-cssscoperule-interface — stored, applied unscoped is wrong, so not applied. */
export class CSSScopeRule extends CSSGroupingRule {
  _prelude: string;

  constructor(prelude: string) {
    super();
    this._prelude = prelude;
  }

  get start(): string | null {
    const m = /^\(([^)]*)\)/.exec(this._prelude);
    return m === null ? null : m[1].trim();
  }

  get end(): string | null {
    const m = /to\s*\(([^)]*)\)/i.exec(this._prelude);
    return m === null ? null : m[1].trim();
  }

  override get cssText(): string {
    return blockText(this._prelude === "" ? "@scope" : "@scope " + this._prelude, this._rules);
  }
}

/** https://drafts.csswg.org/css-transitions-2/#the-cssstartingstylerule-interface — stored, not applied. */
export class CSSStartingStyleRule extends CSSGroupingRule {
  override get cssText(): string {
    return blockText("@starting-style", this._rules);
  }
}

/** https://drafts.csswg.org/cssom/#the-cssimportrule-interface — never fetched (styleSheet is null). */
export class CSSImportRule extends CSSRule {
  _href: string;
  _media: MediaList;
  _layerName: string | null;
  _supportsText: string | null;

  constructor(href: string, media: string, layerName: string | null, supportsText: string | null) {
    super();
    this._href = href;
    this._media = new MediaList(media, this);
    this._layerName = layerName;
    this._supportsText = supportsText;
  }

  override get type(): number {
    return 3;
  }

  get href(): string {
    return this._href;
  }

  get media(): MediaList {
    return this._media;
  }

  get styleSheet(): CSSStyleSheet | null {
    return null;
  }

  get layerName(): string | null {
    return this._layerName;
  }

  get supportsText(): string | null {
    return this._supportsText;
  }

  override get cssText(): string {
    let out = "@import " + serializeUrl(this._href);
    if (this._layerName !== null) out += this._layerName === "" ? " layer" : ` layer(${this._layerName})`;
    if (this._supportsText !== null) out += ` supports(${this._supportsText})`;
    const media = this._media.mediaText;
    if (media !== "") out += " " + media;
    return out + ";";
  }
}

/** https://drafts.csswg.org/cssom/#the-cssnamespacerule-interface */
export class CSSNamespaceRule extends CSSRule {
  _prefix: string;
  _uri: string;

  constructor(prefix: string, uri: string) {
    super();
    this._prefix = prefix;
    this._uri = uri;
  }

  override get type(): number {
    return 10;
  }

  get namespaceURI(): string {
    return this._uri;
  }

  get prefix(): string {
    return this._prefix;
  }

  override get cssText(): string {
    return "@namespace " + (this._prefix === "" ? "" : this._prefix + " ") + serializeUrl(this._uri) + ";";
  }
}

/** Rules holding a declaration block of descriptors. */
class DescriptorRule extends CSSRule implements DeclarationOwnerRule {
  _block: DeclBlock;
  _style: CSSStyleDeclaration | null;

  constructor(block: DeclBlock) {
    super();
    this._block = block;
    this._style = null;
  }

  get style(): CSSStyleDeclaration {
    return (this._style ??= new CSSStyleDeclaration(null, this._block, this));
  }
}

/** https://drafts.csswg.org/css-fonts-4/#cssfontfacerule */
export class CSSFontFaceRule extends DescriptorRule {
  override get type(): number {
    return 5;
  }

  override get cssText(): string {
    const d = this._block.serialize();
    return d === "" ? "@font-face { }" : `@font-face { ${d} }`;
  }
}

/** https://drafts.csswg.org/cssom/#the-csspagerule-interface */
export class CSSPageRule extends DescriptorRule {
  _selector: string;

  constructor(selector: string, block: DeclBlock) {
    super(block);
    this._selector = selector;
  }

  override get type(): number {
    return 6;
  }

  get selectorText(): string {
    return this._selector;
  }

  set selectorText(v: string) {
    this._selector = String(v).trim();
  }

  override get cssText(): string {
    const d = this._block.serialize();
    const sel = this._selector === "" ? "@page" : "@page " + this._selector;
    return d === "" ? `${sel} { }` : `${sel} { ${d} }`;
  }
}

/** https://drafts.css-houdini.org/css-properties-values-api/#the-css-property-rule-interface */
export class CSSPropertyRule extends CSSRule {
  _name: string;
  _block: DeclBlock;

  constructor(name: string, block: DeclBlock) {
    super();
    this._name = name;
    this._block = block;
  }

  get name(): string {
    return this._name;
  }

  get syntax(): string {
    return unquote(this._block.getPropertyValue("syntax"));
  }

  get inherits(): boolean {
    return this._block.getPropertyValue("inherits").toLowerCase() === "true";
  }

  get initialValue(): string | null {
    const i = this._block.indexOf("initial-value");
    return i === -1 ? null : this._block.values[i];
  }

  override get cssText(): string {
    const d = this._block.serialize();
    return d === "" ? `@property ${this._name} { }` : `@property ${this._name} { ${d} }`;
  }
}

function unquote(s: string): string {
  return s.length >= 2 && (s[0] === '"' || s[0] === "'") ? s.slice(1, -1) : s;
}

/** https://drafts.csswg.org/css-animations-1/#interface-csskeyframerule */
export class CSSKeyframeRule extends DescriptorRule {
  _keyText: string;

  constructor(keyText: string, block: DeclBlock) {
    super(block);
    this._keyText = keyText;
  }

  override get type(): number {
    return 8;
  }

  get keyText(): string {
    return this._keyText;
  }

  set keyText(value: string) {
    const k = normalizeKeyText(String(value));
    if (k === null) throw new DOMException(`Failed to set the 'keyText' property on 'CSSKeyframeRule': The key '${value}' is invalid and cannot be parsed`, "SyntaxError");
    this._keyText = k;
    this._changed();
  }

  override get cssText(): string {
    const d = this._block.serialize();
    return d === "" ? `${this._keyText} { }` : `${this._keyText} { ${d} }`;
  }
}

/** https://drafts.csswg.org/css-animations-1/#interface-csskeyframesrule */
export class CSSKeyframesRule extends CSSRule {
  _name: string;
  _rules: CSSKeyframeRule[];
  _list: CSSRuleList | null;

  constructor(name: string) {
    super();
    this._name = name;
    this._rules = [];
    this._list = null;
  }

  override get type(): number {
    return 7;
  }

  get name(): string {
    return this._name;
  }

  set name(v: string) {
    this._name = String(v);
    this._changed();
  }

  get cssRules(): CSSRuleList {
    return (this._list ??= new CSSRuleList(this._rules));
  }

  get length(): number {
    return this._rules.length;
  }

  appendRule(rule: string): void {
    const raw = parseRule(String(rule));
    if (raw === null || raw.kind !== RULE_QUALIFIED) return;
    const created = createKeyframe(raw);
    if (created === null) return;
    created._parent = this;
    this._rules.push(created);
    this._list?._sync();
    this._changed();
  }

  deleteRule(select: string): void {
    const i = this._findIndex(String(select));
    if (i === -1) return;
    this._rules.splice(i, 1);
    this._list?._sync();
    this._changed();
  }

  findRule(select: string): CSSKeyframeRule | null {
    const i = this._findIndex(String(select));
    return i === -1 ? null : this._rules[i];
  }

  _findIndex(select: string): number {
    const k = normalizeKeyText(select);
    if (k === null) return -1;
    for (let i = this._rules.length - 1; i >= 0; i--) if (this._rules[i]._keyText === k) return i;
    return -1;
  }

  override get cssText(): string {
    return blockText("@keyframes " + this._name, this._rules);
  }
}

// --- rule creation -----------------------------------------------------------------------------

function isValidSelectorFor(text: string, nested: boolean): boolean {
  if (text === "") return false;
  if (nested) return compileSelectorList(resolveNested(text, ["*"]).join(", ")) !== null;
  if (containsNesting(text)) return compileSelectorList(resolveNested(text, [":scope"]).join(", ")) !== null;
  return compileSelectorList(text) !== null;
}

/** https://drafts.csswg.org/css-animations-1/#typedef-keyframe-selector */
function normalizeKeyText(text: string): string | null {
  const parts = text.split(",");
  const out: string[] = [];
  for (const p of parts) {
    const s = p.trim().toLowerCase();
    if (s === "from") out.push("0%");
    else if (s === "to") out.push("100%");
    else {
      const m = /^([+]?\d*\.?\d+(?:e[+-]?\d+)?)%$/.exec(s);
      if (m === null) return null;
      const n = Number(m[1]);
      if (n < 0 || n > 100) return null;
      out.push(String(n) + "%");
    }
  }
  return out.join(", ");
}

function createKeyframe(raw: RawRule): CSSKeyframeRule | null {
  const key = normalizeKeyText(raw.prelude);
  if (key === null) return null;
  const block = new DeclBlock();
  block.addRaw(raw.decls);
  return new CSSKeyframeRule(key, block);
}

/** Creates child rules of a grouping rule (and the nested declarations of a nested group). */
function fillChildren(rule: CSSGroupingRule, raw: RawRule, sheet: CSSStyleSheet | null, nested: boolean): void {
  if (nested && raw.decls.length !== 0 && !(rule instanceof CSSStyleRule)) {
    const block = new DeclBlock();
    block.addRaw(raw.decls);
    const nd = new CSSNestedDeclarations(block);
    nd._parent = rule;
    rule._rules.push(nd);
  }
  for (const child of raw.rules) {
    const c = createRule(child, rule, sheet, nested || rule instanceof CSSStyleRule, false);
    if (c === null || c instanceof CSSImportRule || c instanceof CSSNamespaceRule) continue;
    rule._rules.push(c);
  }
}

/** Parses an @import prelude: url-or-string [layer|layer(name)] [supports(...)] media-list. */
function parseImportPrelude(prelude: string): { href: string; layer: string | null; supports: string | null; media: string } | null {
  const comps = splitComponents(prelude);
  if (comps === null) return null;
  let i = 0;
  while (i < comps.length && comps[i].type === COMP_SPACE) i++;
  const first = comps[i];
  if (first === undefined) return null;
  let href: string;
  if (first.type === TK_STRING || first.type === TK_URL) href = first.value;
  else if (first.type === TK_FUNCTION && first.lower === "url") {
    const inner = splitComponents(first.text.slice(4, -1).trim());
    if (inner === null || inner.length !== 1 || inner[0].type !== TK_STRING) return null;
    href = inner[0].value;
  } else return null;
  i++;
  let layer: string | null = null;
  let supports: string | null = null;
  const rest = comps.slice(i);
  let j = 0;
  const skipWs = (): void => {
    while (j < rest.length && rest[j].type === COMP_SPACE) j++;
  };
  skipWs();
  if (j < rest.length && rest[j].type === TK_IDENT && rest[j].lower === "layer") {
    layer = "";
    j++;
  } else if (j < rest.length && rest[j].type === TK_FUNCTION && rest[j].lower === "layer") {
    layer = rest[j].text.slice(6, -1).trim();
    j++;
  }
  skipWs();
  if (j < rest.length && rest[j].type === TK_FUNCTION && rest[j].lower === "supports") {
    supports = rest[j].text.slice(9, -1).trim();
    j++;
  }
  let media = "";
  for (; j < rest.length; j++) media += rest[j].text;
  return { href, layer, supports, media: media.trim() };
}

/** https://drafts.csswg.org/cssom/#parse-a-css-rule + CSSOM rule construction. */
export function createRule(raw: RawRule, parent: CSSRule | null, sheet: CSSStyleSheet | null, nested: boolean, inKeyframes: boolean): CSSRule | null {
  void sheet;
  let rule: CSSRule | null = null;
  if (raw.kind === RULE_QUALIFIED) {
    if (inKeyframes) return createKeyframe(raw);
    if (!raw.hasBlock) return null;
    if (!isValidSelectorFor(raw.prelude, nested)) return null;
    const block = new DeclBlock();
    block.addRaw(raw.decls);
    const sr = new CSSStyleRule(raw.prelude, block);
    sr._parent = parent;
    fillChildren(sr, raw, sheet, true);
    return sr;
  }
  const name = raw.name.toLowerCase();
  const prelude = raw.prelude;
  switch (name) {
    case "media": {
      if (!raw.hasBlock) return null;
      const r = new CSSMediaRule(prelude);
      r._parent = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "supports": {
      if (!raw.hasBlock || prelude === "") return null;
      const r = new CSSSupportsRule(prelude);
      r._parent = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "container": {
      if (!raw.hasBlock) return null;
      const r = new CSSContainerRule(prelude);
      r._parent = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "layer": {
      const names = prelude === "" ? [] : prelude.split(",").map((s) => s.trim());
      for (const n of names) if (!/^-?[_a-zA-Z\u0080-￿][-_a-zA-Z0-9\u0080-￿]*(\.-?[_a-zA-Z\u0080-￿][-_a-zA-Z0-9\u0080-￿]*)*$/.test(n)) return null;
      if (raw.hasBlock) {
        if (names.length > 1) return null;
        const r = new CSSLayerBlockRule(names[0] ?? "");
        r._parent = parent;
        fillChildren(r, raw, sheet, nested);
        rule = r;
      } else {
        if (names.length === 0) return null;
        rule = new CSSLayerStatementRule(names);
      }
      break;
    }
    case "scope": {
      if (!raw.hasBlock) return null;
      const r = new CSSScopeRule(prelude);
      r._parent = parent;
      fillChildren(r, raw, sheet, true);
      rule = r;
      break;
    }
    case "starting-style": {
      if (!raw.hasBlock) return null;
      const r = new CSSStartingStyleRule();
      r._parent = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "keyframes":
    case "-webkit-keyframes":
    case "-moz-keyframes": {
      if (!raw.hasBlock || nested) return null;
      const comps = splitComponents(prelude);
      if (comps === null || comps.length !== 1 || (comps[0].type !== TK_IDENT && comps[0].type !== TK_STRING)) return null;
      const kname = comps[0].type === TK_STRING ? serializeString(comps[0].value) : comps[0].text;
      const r = new CSSKeyframesRule(kname);
      for (const child of raw.rules) {
        if (child.kind !== RULE_QUALIFIED) continue;
        const k = createKeyframe(child);
        if (k === null) continue;
        k._parent = r;
        r._rules.push(k);
      }
      rule = r;
      break;
    }
    case "font-face": {
      if (!raw.hasBlock || prelude !== "") return null;
      const block = new DeclBlock();
      for (const d of raw.decls) block.putParsed(d.name.toLowerCase(), d.value, d.important);
      rule = new CSSFontFaceRule(block);
      break;
    }
    case "page": {
      if (!raw.hasBlock) return null;
      const block = new DeclBlock();
      block.addRaw(raw.decls);
      rule = new CSSPageRule(prelude, block);
      break;
    }
    case "property": {
      if (!raw.hasBlock || !prelude.startsWith("--")) return null;
      const block = new DeclBlock();
      for (const d of raw.decls) block.putParsed(d.name.toLowerCase(), d.value, false);
      rule = new CSSPropertyRule(prelude, block);
      break;
    }
    case "import": {
      if (raw.hasBlock || nested) return null;
      const p = parseImportPrelude(prelude);
      if (p === null) return null;
      rule = new CSSImportRule(p.href, p.media, p.layer, p.supports);
      break;
    }
    case "namespace": {
      if (raw.hasBlock || nested) return null;
      const comps = splitComponents(prelude);
      if (comps === null) return null;
      const sig = comps.filter((c) => c.type !== COMP_SPACE);
      let prefix = "";
      let k = 0;
      if (sig.length === 2 && sig[0].type === TK_IDENT) {
        prefix = sig[0].text;
        k = 1;
      } else if (sig.length !== 1) return null;
      const u = sig[k];
      let uri: string;
      if (u.type === TK_STRING || u.type === TK_URL) uri = u.value;
      else if (u.type === TK_FUNCTION && u.lower === "url") {
        const inner = splitComponents(u.text.slice(4, -1).trim());
        if (inner === null || inner.length !== 1 || inner[0].type !== TK_STRING) return null;
        uri = inner[0].value;
      } else return null;
      rule = new CSSNamespaceRule(prefix, uri);
      break;
    }
    default:
      // @charset and unknown at-rules are not represented in the CSSOM.
      return null;
  }
  if (rule !== null) rule._parent = parent;
  return rule;
}

export interface CSSRuleList {
  readonly [index: number]: CSSRule;
}
export interface MediaList {
  readonly [index: number]: string;
}
export interface StyleSheetList {
  readonly [index: number]: CSSStyleSheet;
}

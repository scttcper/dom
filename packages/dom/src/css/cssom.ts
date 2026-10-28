// CSS Object Model: style sheets, rules and lists.
// https://drafts.csswg.org/cssom/#css-object-model
// https://drafts.csswg.org/css-conditional-3/#the-cssmediarule-interface
// https://drafts.csswg.org/css-cascade-5/#layer-apis
// https://drafts.csswg.org/css-animations-1/#interface-csskeyframesrule
// https://drafts.csswg.org/css-nesting-1/#cssom
//
// Every mutation (insertRule/deleteRule, replace, media/disabled changes, rule.style edits,
// selectorText) bumps the owning document's `_styleVersion`, which invalidates every cached
// computed style and the rule index. The index is rebuilt, except over rules appended to the end
// of a sheet (`_inserted` leaves `$rebuildVersion`), which extendIndex in css/cascade.ts adds.

import type { Document } from "../nodes/Document.ts";
import type { Element } from "../nodes/Element.ts";
import {
  parseRule,
  parseStylesheet,
  RULE_AT,
  RULE_DECLS,
  RULE_QUALIFIED,
  type RawDecl,
  type RawRule,
} from "./parser.ts";
import { DeclBlock } from "./declarations.ts";
import { CSSStyleDeclaration, type DeclarationOwnerRule } from "./CSSStyleDeclaration.ts";
import { type MediaQuery, parseMediaQueryList, serializeMediaQueryList } from "./media.ts";
import { compileSelectorList, serializeSelector, type CompiledSelectorList } from "../selectors/internal.ts";
import { containsNesting, resolveNested } from "./selector-info.ts";
import {
  serializeString,
  serializeUrl,
  splitComponents,
  TK_FUNCTION,
  TK_IDENT,
  TK_STRING,
  TK_URL,
  COMP_SPACE,
} from "./values.ts";
import { evaluateSupportsCondition } from "./supports.ts";
import { currentWindowOrNull } from "../window/current.ts";
import {
  $block,
  $compiled,
  $compiledFor,
  $condition,
  $constructed,
  $defaultNamespace,
  $disabled,
  $disallowModification,
  $doc,
  $href,
  $impl,
  $indexed,
  $keyText,
  $layerName,
  $list,
  $matches,
  $media,
  $name,
  $names,
  $namespaces,
  $owner,
  $ownerNode,
  $ownerRule,
  $parent,
  $prefix,
  $prelude,
  $queries,
  $rebuildVersion,
  $rules,
  $selector,
  $sheet,
  $sheets,
  $style,
  $styleVersion,
  $supportsText,
  $title,
  $uri,
  $version,
} from "../keys.ts";

// --- lists -------------------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#the-cssrulelist-interface — live view over a rule array. */
export class CSSRuleList {
  [$rules]: CSSRule[];
  [$indexed]: number;

  constructor(rules: CSSRule[]) {
    this[$rules] = rules;
    this[$indexed] = 0;
    this._sync();
  }

  /** @internal Swap the backing array (replaceSync). */
  _setRules(rules: CSSRule[]): void {
    this[$rules] = rules;
    this._sync();
  }

  /**
   * @internal Re-sync own indexed properties after the backing array changed from index `from`
   * on: emotion appends every rule through `insertRule(rule, sheet.cssRules.length)`, and
   * re-syncing from 0 made a sheet of n rules cost O(n²).
   */
  _sync(from = 0): void {
    const self = this as unknown as Record<number, CSSRule>;
    const rules = this[$rules];
    for (let i = from; i < rules.length; i++) self[i] = rules[i];
    for (let i = rules.length; i < this[$indexed]; i++) delete self[i];
    this[$indexed] = rules.length;
  }

  get length(): number {
    return this[$rules].length;
  }

  item(index: number): CSSRule | null {
    return this[$rules][index >>> 0] ?? null;
  }

  *[Symbol.iterator](): IterableIterator<CSSRule> {
    yield* this[$rules];
  }

  get [Symbol.toStringTag](): string {
    return "CSSRuleList";
  }
}

/** https://drafts.csswg.org/cssom/#the-medialist-interface */
export class MediaList {
  [$queries]: MediaQuery[];
  [$owner]: { _changed(): void } | null;
  [$indexed]: number;

  constructor(text: string, owner: { _changed(): void } | null) {
    this[$queries] = text === "" ? [] : parseMediaQueryList(text);
    this[$owner] = owner;
    this[$indexed] = 0;
    this._sync();
  }

  _sync(): void {
    const self = this as unknown as Record<number, string>;
    const q = this[$queries];
    for (let i = 0; i < q.length; i++) self[i] = q[i].text;
    for (let i = q.length; i < this[$indexed]; i++) delete self[i];
    this[$indexed] = q.length;
  }

  get mediaText(): string {
    return serializeMediaQueryList(this[$queries]);
  }

  set mediaText(text: string) {
    const t = text === null ? "" : String(text);
    this[$queries] = t === "" ? [] : parseMediaQueryList(t).slice();
    this._sync();
    this[$owner]?._changed();
  }

  get length(): number {
    return this[$queries].length;
  }

  item(index: number): string | null {
    return this[$queries][index >>> 0]?.text ?? null;
  }

  /** https://drafts.csswg.org/cssom/#dom-medialist-appendmedium */
  appendMedium(medium: string): void {
    const q = parseMediaQueryList(String(medium));
    if (q.length !== 1) return;
    for (const existing of this[$queries]) if (existing.text === q[0].text) return;
    this[$queries] = [...this[$queries], q[0]];
    this._sync();
    this[$owner]?._changed();
  }

  /** https://drafts.csswg.org/cssom/#dom-medialist-deletemedium */
  deleteMedium(medium: string): void {
    if (arguments.length === 0)
      throw new TypeError("Failed to execute 'deleteMedium' on 'MediaList': 1 argument required, but only 0 present.");
    const q = parseMediaQueryList(String(medium));
    if (q.length !== 1) return;
    const before = this[$queries].length;
    this[$queries] = this[$queries].filter((x) => x.text !== q[0].text);
    if (this[$queries].length === before)
      throw new DOMException(
        "Failed to execute 'deleteMedium' on 'MediaList': Failed to delete the medium.",
        "NotFoundError",
      );
    this._sync();
    this[$owner]?._changed();
  }

  toString(): string {
    return this.mediaText;
  }

  *[Symbol.iterator](): IterableIterator<string> {
    for (const q of this[$queries]) yield q.text;
  }

  get [Symbol.toStringTag](): string {
    return "MediaList";
  }
}

/** https://drafts.csswg.org/cssom/#the-stylesheetlist-interface — kept in sync by stylesheets.ts. */
export class StyleSheetList {
  [$sheets]: CSSStyleSheet[];
  [$indexed]: number;

  constructor() {
    this[$sheets] = [];
    this[$indexed] = 0;
  }

  /** @internal */
  _set(sheets: CSSStyleSheet[]): void {
    this[$sheets] = sheets;
    const self = this as unknown as Record<number, CSSStyleSheet>;
    for (let i = 0; i < sheets.length; i++) self[i] = sheets[i];
    for (let i = sheets.length; i < this[$indexed]; i++) delete self[i];
    this[$indexed] = sheets.length;
  }

  get length(): number {
    return this[$sheets].length;
  }

  item(index: number): CSSStyleSheet | null {
    return this[$sheets][index >>> 0] ?? null;
  }

  *[Symbol.iterator](): IterableIterator<CSSStyleSheet> {
    yield* this[$sheets];
  }

  get [Symbol.toStringTag](): string {
    return "StyleSheetList";
  }
}

// --- style sheets ------------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#the-stylesheet-interface */
export class StyleSheet {
  [$ownerNode]: Element | null;
  [$media]: MediaList;
  [$disabled]: boolean;
  [$title]: string | null;
  [$href]: string | null;

  constructor(ownerNode: Element | null, media: string, title: string | null, href: string | null) {
    this[$ownerNode] = ownerNode;
    this[$media] = new MediaList(media, this as unknown as { _changed(): void });
    this[$disabled] = false;
    this[$title] = title;
    this[$href] = href;
  }

  _changed(): void {}

  get type(): string {
    return "text/css";
  }

  get href(): string | null {
    return this[$href];
  }

  get ownerNode(): Element | null {
    return this[$ownerNode];
  }

  get parentStyleSheet(): CSSStyleSheet | null {
    return null;
  }

  /**
   * https://drafts.csswg.org/cssom/#dom-stylesheet-title — the owner's non-empty title
   * attribute (an empty title is null). Read live: changing `title` on a <style>/<link>
   * re-creates the sheet with the new title in browsers.
   */
  get title(): string | null {
    const owner = this[$ownerNode] as { getAttribute(n: string): string | null } | null;
    const t = owner !== null ? owner.getAttribute("title") : this[$title];
    return t === "" ? null : t;
  }

  get media(): MediaList {
    return this[$media];
  }

  set media(text: string) {
    this[$media].mediaText = String(text);
  }

  get disabled(): boolean {
    return this[$disabled];
  }

  set disabled(value: boolean) {
    const v = !!value;
    if (v === this[$disabled]) return;
    this[$disabled] = v;
    this._changed();
  }
}

export interface CSSStyleSheetInit {
  baseURL?: string;
  media?: string | MediaList;
  disabled?: boolean;
}

function syntaxError(method: string, iface: string, rule: string): DOMException {
  return new DOMException(
    `Failed to execute '${method}' on '${iface}': Failed to parse the rule '${rule}'.`,
    "SyntaxError",
  );
}

/** https://drafts.csswg.org/cssom/#the-cssstylesheet-interface */
export class CSSStyleSheet extends StyleSheet {
  [$rules]: CSSRule[];
  [$list]: CSSRuleList | null;
  /** Document whose style version this sheet bumps (owner node's document, or the constructor document). */
  [$doc]: Document | null;
  /** https://drafts.csswg.org/cssom/#concept-css-style-sheet-constructed-flag */
  [$constructed]: boolean;
  /** https://drafts.csswg.org/cssom/#concept-css-style-sheet-disallow-modification-flag */
  [$disallowModification]: boolean;
  [$ownerRule]: CSSImportRule | null;
  /** @namespace declarations (prefix → URI), for selector compilation. */
  [$namespaces]: Map<string, string | null> | null;
  [$defaultNamespace]: string | null | undefined;
  /** Bumped on every change (rule index cache key). */
  [$version]: number;
  /**
   * `$version` at the last change other than appending a rule a rule index can add to itself
   * (see appendableRule): cascade.ts extends its index over rules appended since, and rebuilds it
   * after any other change.
   */
  [$rebuildVersion]: number;

  constructor(options?: CSSStyleSheetInit) {
    const media = options?.media;
    super(null, media === undefined ? "" : typeof media === "string" ? media : media.mediaText, null, null);
    this[$rules] = [];
    this[$list] = null;
    this[$doc] = null;
    this[$constructed] = true;
    this[$disallowModification] = false;
    this[$ownerRule] = null;
    this[$namespaces] = null;
    this[$defaultNamespace] = undefined;
    this[$version] = 0;
    this[$rebuildVersion] = 0;
    if (options?.disabled) this[$disabled] = true;
    this[$doc] = (currentWindowOrNull()?.document as Document | undefined) ?? null;
    if (options?.baseURL !== undefined) this[$href] = null;
  }

  /** @internal Create a non-constructed sheet for a <style>/<link> owner. */
  static _forOwner(owner: Element, text: string, media: string, href: string | null): CSSStyleSheet {
    const sheet = new CSSStyleSheet();
    sheet[$constructed] = false;
    sheet[$ownerNode] = owner;
    sheet[$doc] = owner[$impl].doc;
    sheet[$href] = href;
    sheet[$title] = owner.getAttribute("title");
    if (media !== "") sheet[$media].mediaText = media;
    sheet._setText(text);
    return sheet;
  }

  override _changed(): void {
    this[$version]++;
    this[$rebuildVersion] = this[$version];
    const doc = this[$doc];
    if (doc !== null) doc[$styleVersion]++;
  }

  /** _changed() for a rule inserted at `index`: an appended appendableRule leaves $rebuildVersion. */
  _inserted(rule: CSSRule, index: number): void {
    if (index !== this[$rules].length - 1 || !appendableRule(rule)) return this._changed();
    this[$version]++;
    const doc = this[$doc];
    if (doc !== null) doc[$styleVersion]++;
  }

  /** Replaces all rules from stylesheet text (no @import fetching). */
  _setText(text: string): void {
    // https://drafts.csswg.org/cssom/#synchronously-replace-the-rules-of-a-cssstylesheet: the
    // old rules are detached (their parentStyleSheet becomes null).
    for (const old of this[$rules]) old[$sheet] = null;
    this[$rules] = [];
    this[$namespaces] = null;
    this[$defaultNamespace] = undefined;
    const raws = text === "" ? [] : parseStylesheet(text);
    let seenOther = false;
    for (const raw of raws) {
      const name = raw.kind === RULE_AT ? raw.name.toLowerCase() : "";
      // https://drafts.csswg.org/cssom/#synchronously-replace-the-rules-of-a-cssstylesheet
      // step 2: constructed sheets drop @import rules (parsed as rules, so text inside strings
      // and comments is untouched).
      if (name === "import" && this[$constructed]) continue;
      if (name === "import" || name === "namespace") {
        if (seenOther && name === "import") continue;
        if (
          seenOther &&
          this[$rules].some(
            (r) =>
              !(r instanceof CSSImportRule) &&
              !(r instanceof CSSNamespaceRule) &&
              !(r instanceof CSSLayerStatementRule),
          )
        )
          continue;
      }
      const rule = createRule(raw, null, this, false, false);
      if (rule === null) continue;
      if (
        !(rule instanceof CSSImportRule) &&
        !(rule instanceof CSSLayerStatementRule) &&
        !(rule instanceof CSSNamespaceRule)
      )
        seenOther = true;
      rule[$sheet] = this;
      this[$rules].push(rule);
      if (rule instanceof CSSNamespaceRule) this._registerNamespace(rule);
    }
    this[$list]?._setRules(this[$rules]);
    this._changed();
  }

  _registerNamespace(rule: CSSNamespaceRule): void {
    if (rule[$prefix] === "") this[$defaultNamespace] = rule[$uri] === "" ? null : rule[$uri];
    else (this[$namespaces] ??= new Map()).set(rule[$prefix], rule[$uri] === "" ? null : rule[$uri]);
  }

  override get parentStyleSheet(): CSSStyleSheet | null {
    return this[$ownerRule] === null ? null : this[$ownerRule].parentStyleSheet;
  }

  get ownerRule(): CSSImportRule | null {
    return this[$ownerRule];
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-cssrules */
  get cssRules(): CSSRuleList {
    return (this[$list] ??= new CSSRuleList(this[$rules]));
  }

  get rules(): CSSRuleList {
    return this.cssRules;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-insertrule */
  insertRule(rule: string, index: number = 0): number {
    if (arguments.length === 0)
      throw new TypeError(
        "Failed to execute 'insertRule' on 'CSSStyleSheet': 1 argument required, but only 0 present.",
      );
    if (this[$disallowModification])
      throw new DOMException(
        "Failed to execute 'insertRule' on 'CSSStyleSheet': Cannot modify a sheet while it is being replaced.",
        "NotAllowedError",
      );
    const text = String(rule);
    const i = index >>> 0;
    if (i > this[$rules].length) {
      throw new DOMException(
        `Failed to execute 'insertRule' on 'CSSStyleSheet': The index provided (${i}) is larger than the maximum index (${this[$rules].length}).`,
        "IndexSizeError",
      );
    }
    const raw = parseRule(text);
    if (raw === null) throw syntaxError("insertRule", "CSSStyleSheet", text);
    const name = raw.kind === RULE_AT ? raw.name.toLowerCase() : "";
    if (name === "import" && this[$constructed]) throw syntaxError("insertRule", "CSSStyleSheet", text);
    const created = createRule(raw, null, this, false, false);
    if (created === null) throw syntaxError("insertRule", "CSSStyleSheet", text);
    // https://drafts.csswg.org/cssom/#insert-a-css-rule step 6 constraints.
    if (created instanceof CSSImportRule) {
      for (let k = 0; k < i; k++) {
        const r = this[$rules][k];
        if (!(r instanceof CSSImportRule) && !(r instanceof CSSLayerStatementRule)) {
          throw new DOMException(
            "Failed to execute 'insertRule' on 'CSSStyleSheet': @import rules must precede all rules except @charset and @layer statements.",
            "HierarchyRequestError",
          );
        }
      }
    } else if (!(created instanceof CSSNamespaceRule) && !(created instanceof CSSLayerStatementRule)) {
      for (let k = i; k < this[$rules].length; k++) {
        if (this[$rules][k] instanceof CSSImportRule || this[$rules][k] instanceof CSSNamespaceRule) {
          throw new DOMException(
            "Failed to execute 'insertRule' on 'CSSStyleSheet': Rules cannot be inserted before @import or @namespace rules.",
            "HierarchyRequestError",
          );
        }
      }
    } else if (created instanceof CSSNamespaceRule) {
      for (const r of this[$rules]) {
        if (
          !(r instanceof CSSImportRule) &&
          !(r instanceof CSSNamespaceRule) &&
          !(r instanceof CSSLayerStatementRule)
        ) {
          throw new DOMException(
            "Failed to execute 'insertRule' on 'CSSStyleSheet': Failed to insert a @namespace rule after other rules.",
            "InvalidStateError",
          );
        }
      }
      this._registerNamespace(created);
    }
    created[$sheet] = this;
    this[$rules].splice(i, 0, created);
    this[$list]?._sync(i);
    this._inserted(created, i);
    return i;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-deleterule */
  deleteRule(index: number): void {
    if (arguments.length === 0)
      throw new TypeError(
        "Failed to execute 'deleteRule' on 'CSSStyleSheet': 1 argument required, but only 0 present.",
      );
    if (this[$disallowModification])
      throw new DOMException(
        "Failed to execute 'deleteRule' on 'CSSStyleSheet': Cannot modify a sheet while it is being replaced.",
        "NotAllowedError",
      );
    const i = index >>> 0;
    if (i >= this[$rules].length) {
      throw new DOMException(
        `Failed to execute 'deleteRule' on 'CSSStyleSheet': The index provided (${i}) is larger than the maximum index (${Math.max(0, this[$rules].length - 1)}).`,
        "IndexSizeError",
      );
    }
    const [removed] = this[$rules].splice(i, 1);
    removed[$sheet] = null;
    this[$list]?._sync(i);
    this._changed();
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-addrule (legacy) */
  addRule(selector: string = "undefined", style: string = "undefined", index?: number): number {
    let rule = String(selector) + " { " + String(style) + " }";
    if (String(style) === "") rule = String(selector) + " { }";
    this.insertRule(rule, index === undefined ? this[$rules].length : index);
    return -1;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-removerule (legacy) */
  removeRule(index: number = 0): void {
    this.deleteRule(index);
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-replace */
  replace(text: string): Promise<CSSStyleSheet> {
    if (!this[$constructed] || this[$disallowModification]) {
      return Promise.reject(
        new DOMException(
          "Failed to execute 'replace' on 'CSSStyleSheet': Can't call replace on non-constructed CSSStyleSheets.",
          "NotAllowedError",
        ),
      );
    }
    this[$disallowModification] = true;
    const value = String(text);
    return Promise.resolve().then(() => {
      this._setText(value);
      this[$disallowModification] = false;
      return this;
    });
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylesheet-replacesync */
  replaceSync(text: string): void {
    if (!this[$constructed] || this[$disallowModification]) {
      throw new DOMException(
        "Failed to execute 'replaceSync' on 'CSSStyleSheet': Can't call replaceSync on non-constructed CSSStyleSheets.",
        "NotAllowedError",
      );
    }
    this._setText(String(text));
  }

  get [Symbol.toStringTag](): string {
    return "CSSStyleSheet";
  }
}

// --- rules -------------------------------------------------------------------------------------

/** https://drafts.csswg.org/cssom/#the-cssrule-interface */
export class CSSRule {
  /** Owning sheet for top-level rules (nested rules find it through their parent). */
  [$sheet]: CSSStyleSheet | null;
  [$parent]: CSSRule | null;

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
    this[$sheet] = null;
    this[$parent] = null;
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
    return this[$parent];
  }

  get parentStyleSheet(): CSSStyleSheet | null {
    let r: CSSRule = this;
    while (r[$parent] !== null) r = r[$parent];
    return r[$sheet];
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
  STYLE_RULE: 1,
  CHARSET_RULE: 2,
  IMPORT_RULE: 3,
  MEDIA_RULE: 4,
  FONT_FACE_RULE: 5,
  PAGE_RULE: 6,
  KEYFRAMES_RULE: 7,
  KEYFRAME_RULE: 8,
  MARGIN_RULE: 9,
  NAMESPACE_RULE: 10,
  COUNTER_STYLE_RULE: 11,
  SUPPORTS_RULE: 12,
  DOCUMENT_RULE: 13,
  FONT_FEATURE_VALUES_RULE: 14,
  VIEWPORT_RULE: 15,
  REGION_STYLE_RULE: 16,
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
  [$rules]: CSSRule[];
  [$list]: CSSRuleList | null;

  constructor() {
    super();
    this[$rules] = [];
    this[$list] = null;
  }

  get cssRules(): CSSRuleList {
    return (this[$list] ??= new CSSRuleList(this[$rules]));
  }

  /** Whether rules inside are nested in a style rule (relative selectors, nested declarations). */
  _nestedContext(): boolean {
    for (let r: CSSRule | null = this; r !== null; r = r[$parent]) if (r instanceof CSSStyleRule) return true;
    return false;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssgroupingrule-insertrule */
  insertRule(rule: string, index: number = 0): number {
    if (arguments.length === 0)
      throw new TypeError(
        `Failed to execute 'insertRule' on '${this.constructor.name}': 1 argument required, but only 0 present.`,
      );
    const text = String(rule);
    const i = index >>> 0;
    if (i > this[$rules].length) {
      throw new DOMException(
        `Failed to execute 'insertRule' on '${this.constructor.name}': The index provided (${i}) is larger than the maximum index (${this[$rules].length}).`,
        "IndexSizeError",
      );
    }
    const raw = parseRule(text);
    if (raw === null) throw syntaxError("insertRule", this.constructor.name, text);
    const nested = this._nestedContext();
    const created = createRule(raw, this, this.parentStyleSheet, nested, false);
    if (created === null || created instanceof CSSImportRule || created instanceof CSSNamespaceRule) {
      if (created instanceof CSSImportRule || created instanceof CSSNamespaceRule) {
        throw new DOMException(
          `Failed to execute 'insertRule' on '${this.constructor.name}': '${text}' is not allowed here.`,
          "HierarchyRequestError",
        );
      }
      throw syntaxError("insertRule", this.constructor.name, text);
    }
    this[$rules].splice(i, 0, created);
    this[$list]?._sync(i);
    this._changed();
    return i;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssgroupingrule-deleterule */
  deleteRule(index: number): void {
    if (arguments.length === 0)
      throw new TypeError(
        `Failed to execute 'deleteRule' on '${this.constructor.name}': 1 argument required, but only 0 present.`,
      );
    const i = index >>> 0;
    if (i >= this[$rules].length) {
      throw new DOMException(
        `Failed to execute 'deleteRule' on '${this.constructor.name}': The index provided (${i}) is larger than the maximum index (${Math.max(0, this[$rules].length - 1)}).`,
        "IndexSizeError",
      );
    }
    const [removed] = this[$rules].splice(i, 1);
    removed[$parent] = null;
    this[$list]?._sync(i);
    this._changed();
  }
}

/** https://drafts.csswg.org/cssom/#the-cssstylerule-interface (+ CSS Nesting: nested cssRules) */
export class CSSStyleRule extends CSSGroupingRule implements DeclarationOwnerRule {
  [$selector]: string;
  [$block]: DeclBlock;
  [$style]: CSSStyleDeclaration | null;
  /** Compiled (nesting-resolved) selector list, cached until selectorText or an ancestor selector changes. */
  [$compiled]: CompiledSelectorList | null;
  [$compiledFor]: string;

  constructor(selector: string, block: DeclBlock) {
    super();
    this[$selector] = selector;
    this[$block] = block;
    this[$style] = null;
    this[$compiled] = null;
    this[$compiledFor] = "";
  }

  override get type(): number {
    return 1;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstylerule-selectortext */
  get selectorText(): string {
    if (containsNesting(this[$selector])) return this[$selector];
    return serializeSelector(this[$selector], namespaceOptions(this.parentStyleSheet)) ?? this[$selector];
  }

  set selectorText(value: string) {
    const text = String(value).trim();
    if (!isValidSelectorFor(text, this._nestedContextForSelf(), this.parentStyleSheet)) return;
    this[$selector] = text;
    this[$compiled] = null;
    this._changed();
  }

  _nestedContextForSelf(): boolean {
    for (let r: CSSRule | null = this[$parent]; r !== null; r = r[$parent]) if (r instanceof CSSStyleRule) return true;
    return false;
  }

  get style(): CSSStyleDeclaration {
    return (this[$style] ??= new CSSStyleDeclaration(null, this[$block], this));
  }

  set style(text: string) {
    this.style.cssText = String(text);
  }

  override get cssText(): string {
    const decls = this[$block].serialize();
    if (this[$rules].length === 0)
      return decls === "" ? `${this.selectorText} { }` : `${this.selectorText} { ${decls} }`;
    let out = `${this.selectorText} {`;
    if (decls !== "") out += "\n  " + decls;
    for (const r of this[$rules]) out += "\n" + indent(r.cssText);
    return out + "\n}";
  }

  /**
   * Nesting-resolved selector texts (https://drafts.csswg.org/css-nesting-1/#nest-selector).
   * Top-level rules resolve to their own selector list.
   */
  _resolvedSelectors(): string[] {
    let parent: CSSRule | null = this[$parent];
    while (parent !== null && !(parent instanceof CSSStyleRule)) parent = parent[$parent];
    if (parent === null) {
      if (!containsNesting(this[$selector])) return [this[$selector]];
      return resolveNested(this[$selector], [":scope"]);
    }
    return resolveNested(this[$selector], (parent as CSSStyleRule)._resolvedSelectors());
  }

  /** Compiled selector list for matching (null if the engine rejects it). */
  _compile(): CompiledSelectorList | null {
    const resolved = this._resolvedSelectors().join(", ");
    if (this[$compiled] !== null && this[$compiledFor] === resolved) return this[$compiled];
    this[$compiled] = compileSelectorList(resolved, namespaceOptions(this.parentStyleSheet));
    this[$compiledFor] = resolved;
    return this[$compiled];
  }

  get [Symbol.toStringTag](): string {
    return "CSSStyleRule";
  }
}

/** https://drafts.csswg.org/css-nesting-1/#cssnesteddeclarations — declarations after/inside nested group rules. */
export class CSSNestedDeclarations extends CSSRule implements DeclarationOwnerRule {
  [$block]: DeclBlock;
  [$style]: CSSStyleDeclaration | null;

  constructor(block: DeclBlock) {
    super();
    this[$block] = block;
    this[$style] = null;
  }

  override get type(): number {
    return 0;
  }

  get style(): CSSStyleDeclaration {
    return (this[$style] ??= new CSSStyleDeclaration(null, this[$block], this));
  }

  override get cssText(): string {
    return this[$block].serialize();
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
  [$media]: MediaList;

  constructor(media: string) {
    super();
    this[$media] = new MediaList(media, this);
  }

  override get type(): number {
    return 4;
  }

  get media(): MediaList {
    return this[$media];
  }

  set media(text: string) {
    this[$media].mediaText = String(text);
  }

  override get conditionText(): string {
    return this[$media].mediaText;
  }

  override get cssText(): string {
    return blockText("@media " + this[$media].mediaText, this[$rules]);
  }
}

/** https://drafts.csswg.org/css-conditional-3/#the-csssupportsrule-interface */
export class CSSSupportsRule extends CSSConditionRule {
  [$condition]: string;
  [$matches]: boolean;

  constructor(condition: string) {
    super();
    this[$condition] = condition;
    this[$matches] = evaluateSupportsCondition(condition);
  }

  override get type(): number {
    return 12;
  }

  override get conditionText(): string {
    return this[$condition];
  }

  override get cssText(): string {
    return blockText("@supports " + this[$condition], this[$rules]);
  }
}

/** https://drafts.csswg.org/css-contain-3/#the-csscontainerrule-interface — stored, never matches (no layout). */
export class CSSContainerRule extends CSSConditionRule {
  [$condition]: string;

  constructor(condition: string) {
    super();
    this[$condition] = condition;
  }

  override get conditionText(): string {
    return this[$condition];
  }

  get containerName(): string {
    const m = /^([^\s(]+)\s/.exec(this[$condition]);
    return m !== null && m[1].toLowerCase() !== "not" ? m[1] : "";
  }

  get containerQuery(): string {
    const name = this.containerName;
    return name === "" ? this[$condition] : this[$condition].slice(name.length).trim();
  }

  override get cssText(): string {
    return blockText("@container " + this[$condition], this[$rules]);
  }
}

/** https://drafts.csswg.org/css-cascade-5/#the-csslayerblockrule-interface */
export class CSSLayerBlockRule extends CSSGroupingRule {
  [$name]: string;

  constructor(name: string) {
    super();
    this[$name] = name;
  }

  get name(): string {
    return this[$name];
  }

  override get cssText(): string {
    return blockText(this[$name] === "" ? "@layer" : "@layer " + this[$name], this[$rules]);
  }
}

/** https://drafts.csswg.org/css-cascade-5/#the-csslayerstatementrule-interface */
export class CSSLayerStatementRule extends CSSRule {
  [$names]: string[];

  constructor(names: string[]) {
    super();
    this[$names] = names;
  }

  get nameList(): readonly string[] {
    return Object.freeze(this[$names].slice());
  }

  override get cssText(): string {
    return "@layer " + this[$names].join(", ") + ";";
  }
}

/** https://drafts.csswg.org/css-cascade-6/#the-cssscoperule-interface — stored, applied unscoped is wrong, so not applied. */
export class CSSScopeRule extends CSSGroupingRule {
  [$prelude]: string;

  constructor(prelude: string) {
    super();
    this[$prelude] = prelude;
  }

  /** https://drafts.csswg.org/css-cascade-6/#dom-cssscoperule-start — prelude `[(<scope-start>)]? [to (<scope-end>)]?` */
  get start(): string | null {
    const p = this[$prelude];
    return p.charCodeAt(0) === 0x28 /* ( */ ? parenContents(p, 0) : null;
  }

  /** https://drafts.csswg.org/css-cascade-6/#dom-cssscoperule-end */
  get end(): string | null {
    const p = this[$prelude];
    let i = 0;
    if (p.charCodeAt(0) === 0x28) {
      i = matchingParen(p, 0);
      if (i === -1) return null;
      i++;
    }
    const m = /^\s*to\s*\(/i.exec(p.slice(i));
    return m === null ? null : parenContents(p, i + m[0].length - 1);
  }

  override get cssText(): string {
    return blockText(this[$prelude] === "" ? "@scope" : "@scope " + this[$prelude], this[$rules]);
  }
}

/** Index of the ")" matching the "(" at `open` (nested parentheses and quoted strings skipped), or -1. */
function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c /* \ */) i++;
    else if (c === 0x22 || c === 0x27) {
      for (i++; i < text.length && text.charCodeAt(i) !== c; i++) if (text.charCodeAt(i) === 0x5c) i++;
    } else if (c === 0x28) depth++;
    else if (c === 0x29 && --depth === 0) return i;
  }
  return -1;
}

/** Trimmed text between the "(" at `open` and its matching ")", or null if unbalanced. */
function parenContents(text: string, open: number): string | null {
  const close = matchingParen(text, open);
  return close === -1 ? null : text.slice(open + 1, close).trim();
}

/** https://drafts.csswg.org/css-transitions-2/#the-cssstartingstylerule-interface — stored, not applied. */
export class CSSStartingStyleRule extends CSSGroupingRule {
  override get cssText(): string {
    return blockText("@starting-style", this[$rules]);
  }
}

/** https://drafts.csswg.org/cssom/#the-cssimportrule-interface — never fetched (styleSheet is null). */
export class CSSImportRule extends CSSRule {
  [$href]: string;
  [$media]: MediaList;
  [$layerName]: string | null;
  [$supportsText]: string | null;

  constructor(href: string, media: string, layerName: string | null, supportsText: string | null) {
    super();
    this[$href] = href;
    this[$media] = new MediaList(media, this);
    this[$layerName] = layerName;
    this[$supportsText] = supportsText;
  }

  override get type(): number {
    return 3;
  }

  get href(): string {
    return this[$href];
  }

  get media(): MediaList {
    return this[$media];
  }

  get styleSheet(): CSSStyleSheet | null {
    return null;
  }

  get layerName(): string | null {
    return this[$layerName];
  }

  get supportsText(): string | null {
    return this[$supportsText];
  }

  override get cssText(): string {
    let out = "@import " + serializeUrl(this[$href]);
    if (this[$layerName] !== null) out += this[$layerName] === "" ? " layer" : ` layer(${this[$layerName]})`;
    if (this[$supportsText] !== null) out += ` supports(${this[$supportsText]})`;
    const media = this[$media].mediaText;
    if (media !== "") out += " " + media;
    return out + ";";
  }
}

/** https://drafts.csswg.org/cssom/#the-cssnamespacerule-interface */
export class CSSNamespaceRule extends CSSRule {
  [$prefix]: string;
  [$uri]: string;

  constructor(prefix: string, uri: string) {
    super();
    this[$prefix] = prefix;
    this[$uri] = uri;
  }

  override get type(): number {
    return 10;
  }

  get namespaceURI(): string {
    return this[$uri];
  }

  get prefix(): string {
    return this[$prefix];
  }

  override get cssText(): string {
    return "@namespace " + (this[$prefix] === "" ? "" : this[$prefix] + " ") + serializeUrl(this[$uri]) + ";";
  }
}

/** Rules holding a declaration block of descriptors. */
class DescriptorRule extends CSSRule implements DeclarationOwnerRule {
  [$block]: DeclBlock;
  [$style]: CSSStyleDeclaration | null;

  constructor(block: DeclBlock) {
    super();
    this[$block] = block;
    this[$style] = null;
  }

  get style(): CSSStyleDeclaration {
    return (this[$style] ??= new CSSStyleDeclaration(null, this[$block], this));
  }
}

/** https://drafts.csswg.org/css-fonts-4/#cssfontfacerule */
export class CSSFontFaceRule extends DescriptorRule {
  override get type(): number {
    return 5;
  }

  override get cssText(): string {
    const d = this[$block].serialize();
    return d === "" ? "@font-face { }" : `@font-face { ${d} }`;
  }
}

/** https://drafts.csswg.org/cssom/#the-csspagerule-interface */
export class CSSPageRule extends DescriptorRule {
  [$selector]: string;

  constructor(selector: string, block: DeclBlock) {
    super(block);
    this[$selector] = selector;
  }

  override get type(): number {
    return 6;
  }

  get selectorText(): string {
    return this[$selector];
  }

  set selectorText(v: string) {
    this[$selector] = String(v).trim();
  }

  override get cssText(): string {
    const d = this[$block].serialize();
    const sel = this[$selector] === "" ? "@page" : "@page " + this[$selector];
    return d === "" ? `${sel} { }` : `${sel} { ${d} }`;
  }
}

/** https://drafts.css-houdini.org/css-properties-values-api/#the-css-property-rule-interface */
export class CSSPropertyRule extends CSSRule {
  [$name]: string;
  [$block]: DeclBlock;

  constructor(name: string, block: DeclBlock) {
    super();
    this[$name] = name;
    this[$block] = block;
  }

  get name(): string {
    return this[$name];
  }

  get syntax(): string {
    return unquote(this[$block].getPropertyValue("syntax"));
  }

  get inherits(): boolean {
    return this[$block].getPropertyValue("inherits").toLowerCase() === "true";
  }

  get initialValue(): string | null {
    const i = this[$block].indexOf("initial-value");
    return i === -1 ? null : this[$block].values[i];
  }

  override get cssText(): string {
    const d = this[$block].serialize();
    return d === "" ? `@property ${this[$name]} { }` : `@property ${this[$name]} { ${d} }`;
  }
}

function unquote(s: string): string {
  return s.length >= 2 && (s[0] === '"' || s[0] === "'") ? s.slice(1, -1) : s;
}

/** https://drafts.csswg.org/css-animations-1/#interface-csskeyframerule */
export class CSSKeyframeRule extends DescriptorRule {
  [$keyText]: string;

  constructor(keyText: string, block: DeclBlock) {
    super(block);
    this[$keyText] = keyText;
  }

  override get type(): number {
    return 8;
  }

  get keyText(): string {
    return this[$keyText];
  }

  set keyText(value: string) {
    const k = normalizeKeyText(String(value));
    if (k === null)
      throw new DOMException(
        `Failed to set the 'keyText' property on 'CSSKeyframeRule': The key '${value}' is invalid and cannot be parsed`,
        "SyntaxError",
      );
    this[$keyText] = k;
    this._changed();
  }

  override get cssText(): string {
    const d = this[$block].serialize();
    return d === "" ? `${this[$keyText]} { }` : `${this[$keyText]} { ${d} }`;
  }
}

/** https://drafts.csswg.org/css-animations-1/#interface-csskeyframesrule */
export class CSSKeyframesRule extends CSSRule {
  [$name]: string;
  [$rules]: CSSKeyframeRule[];
  [$list]: CSSRuleList | null;

  constructor(name: string) {
    super();
    this[$name] = name;
    this[$rules] = [];
    this[$list] = null;
  }

  override get type(): number {
    return 7;
  }

  get name(): string {
    return this[$name];
  }

  set name(v: string) {
    this[$name] = String(v);
    this._changed();
  }

  get cssRules(): CSSRuleList {
    return (this[$list] ??= new CSSRuleList(this[$rules]));
  }

  get length(): number {
    return this[$rules].length;
  }

  appendRule(rule: string): void {
    const raw = parseRule(String(rule));
    if (raw === null || raw.kind !== RULE_QUALIFIED) return;
    const created = createKeyframe(raw);
    if (created === null) return;
    created[$parent] = this;
    this[$rules].push(created);
    this[$list]?._sync(this[$rules].length - 1);
    this._changed();
  }

  deleteRule(select: string): void {
    const i = this._findIndex(String(select));
    if (i === -1) return;
    const [removed] = this[$rules].splice(i, 1);
    removed[$parent] = null;
    this[$list]?._sync(i);
    this._changed();
  }

  findRule(select: string): CSSKeyframeRule | null {
    const i = this._findIndex(String(select));
    return i === -1 ? null : this[$rules][i];
  }

  _findIndex(select: string): number {
    const k = normalizeKeyText(select);
    if (k === null) return -1;
    for (let i = this[$rules].length - 1; i >= 0; i--) if (this[$rules][i][$keyText] === k) return i;
    return -1;
  }

  override get cssText(): string {
    return blockText("@keyframes " + this[$name], this[$rules]);
  }
}

// --- rule creation -----------------------------------------------------------------------------

/** The sheet's @namespace declarations as selector compile options (undefined when none). */
function namespaceOptions(
  sheet: CSSStyleSheet | null,
): { namespaces?: Map<string, string | null>; defaultNamespace?: string | null } | undefined {
  return sheet !== null && (sheet[$namespaces] !== null || sheet[$defaultNamespace] !== undefined)
    ? { namespaces: sheet[$namespaces] ?? undefined, defaultNamespace: sheet[$defaultNamespace] }
    : undefined;
}

/**
 * Whether a style rule prelude parses. Namespace prefixes resolve against the sheet's
 * @namespace rules (https://drafts.csswg.org/css-namespaces-3/#prefixes): a selector with an
 * undeclared prefix is invalid, a declared one is not.
 */
function isValidSelectorFor(text: string, nested: boolean, sheet: CSSStyleSheet | null): boolean {
  if (text === "") return false;
  const options = namespaceOptions(sheet);
  if (nested) return compileSelectorList(resolveNested(text, ["*"]).join(", "), options) !== null;
  if (containsNesting(text)) return compileSelectorList(resolveNested(text, [":scope"]).join(", "), options) !== null;
  return compileSelectorList(text, options) !== null;
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

/** The declarations before the block's first nested rule (all of them when there is none). */
function leadingDecls(raw: RawRule): RawDecl[] {
  return raw.leading === raw.decls.length ? raw.decls : raw.decls.slice(0, raw.leading);
}

function nestedDeclarations(parent: CSSGroupingRule, decls: RawDecl[]): CSSNestedDeclarations {
  const block = new DeclBlock();
  block.addRaw(decls);
  const nd = new CSSNestedDeclarations(block);
  nd[$parent] = parent;
  return nd;
}

/** Creates child rules of a grouping rule (and the nested declarations of a nested group). */
function fillChildren(rule: CSSGroupingRule, raw: RawRule, sheet: CSSStyleSheet | null, nested: boolean): void {
  const inStyle = nested || rule instanceof CSSStyleRule;
  if (nested && raw.leading !== 0 && !(rule instanceof CSSStyleRule))
    rule[$rules].push(nestedDeclarations(rule, leadingDecls(raw)));
  for (const child of raw.rules) {
    // Declarations after a nested rule keep their position in the rule list
    // (https://drafts.csswg.org/css-nesting-1/#nested-declarations-rule); outside style rules they are invalid.
    if (child.kind === RULE_DECLS) {
      if (inStyle) rule[$rules].push(nestedDeclarations(rule, child.decls));
      continue;
    }
    const c = createRule(child, rule, sheet, inStyle, false);
    if (c === null || c instanceof CSSImportRule || c instanceof CSSNamespaceRule) continue;
    rule[$rules].push(c);
  }
}

/** Parses an @import prelude: url-or-string [layer|layer(name)] [supports(...)] media-list. */
function parseImportPrelude(
  prelude: string,
): { href: string; layer: string | null; supports: string | null; media: string } | null {
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

/**
 * Whether a rule appended at the end of a sheet can be added to a rule index already built over
 * the sheet by indexing just the rule (cascade.ts extendIndex): anything but layers, @import and
 * @namespace, which change the order or meaning of the rules already indexed, also nested in
 * style rules, @media and @supports.
 */
export function appendableRule(rule: CSSRule): boolean {
  if (
    rule instanceof CSSLayerBlockRule ||
    rule instanceof CSSLayerStatementRule ||
    rule instanceof CSSImportRule ||
    rule instanceof CSSNamespaceRule
  )
    return false;
  if (rule instanceof CSSStyleRule || rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
    const children = rule[$rules];
    for (let i = 0; i < children.length; i++) if (!appendableRule(children[i])) return false;
  }
  return true;
}

/** https://drafts.csswg.org/cssom/#parse-a-css-rule + CSSOM rule construction. */
export function createRule(
  raw: RawRule,
  parent: CSSRule | null,
  sheet: CSSStyleSheet | null,
  nested: boolean,
  inKeyframes: boolean,
): CSSRule | null {
  let rule: CSSRule | null = null;
  if (raw.kind === RULE_QUALIFIED) {
    if (inKeyframes) return createKeyframe(raw);
    if (!raw.hasBlock) return null;
    if (!isValidSelectorFor(raw.prelude, nested, sheet)) return null;
    const block = new DeclBlock();
    // https://drafts.csswg.org/css-syntax-3/#consume-qualified-rule: only the leading
    // declarations are the style rule's own; later runs become CSSNestedDeclarations.
    block.addRaw(leadingDecls(raw));
    const sr = new CSSStyleRule(raw.prelude, block);
    sr[$parent] = parent;
    fillChildren(sr, raw, sheet, true);
    return sr;
  }
  const name = raw.name.toLowerCase();
  const prelude = raw.prelude;
  switch (name) {
    case "media": {
      if (!raw.hasBlock) return null;
      const r = new CSSMediaRule(prelude);
      r[$parent] = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "supports": {
      if (!raw.hasBlock || prelude === "") return null;
      const r = new CSSSupportsRule(prelude);
      r[$parent] = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "container": {
      if (!raw.hasBlock) return null;
      const r = new CSSContainerRule(prelude);
      r[$parent] = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "layer": {
      const names = prelude === "" ? [] : prelude.split(",").map((s) => s.trim());
      for (const n of names)
        if (!/^-?[_a-zA-Z\u0080-￿][-_a-zA-Z0-9\u0080-￿]*(\.-?[_a-zA-Z\u0080-￿][-_a-zA-Z0-9\u0080-￿]*)*$/.test(n))
          return null;
      if (raw.hasBlock) {
        if (names.length > 1) return null;
        const r = new CSSLayerBlockRule(names[0] ?? "");
        r[$parent] = parent;
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
      r[$parent] = parent;
      fillChildren(r, raw, sheet, true);
      rule = r;
      break;
    }
    case "starting-style": {
      if (!raw.hasBlock) return null;
      const r = new CSSStartingStyleRule();
      r[$parent] = parent;
      fillChildren(r, raw, sheet, nested);
      rule = r;
      break;
    }
    case "keyframes":
    case "-webkit-keyframes":
    case "-moz-keyframes": {
      if (!raw.hasBlock || nested) return null;
      const comps = splitComponents(prelude);
      if (comps === null || comps.length !== 1 || (comps[0].type !== TK_IDENT && comps[0].type !== TK_STRING))
        return null;
      const kname = comps[0].type === TK_STRING ? serializeString(comps[0].value) : comps[0].text;
      const r = new CSSKeyframesRule(kname);
      for (const child of raw.rules) {
        if (child.kind !== RULE_QUALIFIED) continue;
        const k = createKeyframe(child);
        if (k === null) continue;
        k[$parent] = r;
        r[$rules].push(k);
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
  if (rule !== null) rule[$parent] = parent;
  return rule;
}

// https://drafts.csswg.org/cssom/#dom-cssrule-csstext: "On setting the cssText attribute must
// do nothing." A subclass `get cssText` alone shadows CSSRule's accessor pair and would make
// assignment throw in strict code, so each subclass gets the inherited no-op setter back.
{
  const base = Object.getOwnPropertyDescriptor(CSSRule.prototype, "cssText")!;
  for (const C of [
    CSSStyleRule,
    CSSNestedDeclarations,
    CSSMediaRule,
    CSSSupportsRule,
    CSSContainerRule,
    CSSLayerBlockRule,
    CSSLayerStatementRule,
    CSSScopeRule,
    CSSStartingStyleRule,
    CSSImportRule,
    CSSNamespaceRule,
    DescriptorRule,
    CSSFontFaceRule,
    CSSPageRule,
    CSSPropertyRule,
    CSSKeyframeRule,
    CSSKeyframesRule,
  ]) {
    const own = Object.getOwnPropertyDescriptor(C.prototype, "cssText");
    if (own !== undefined && own.set === undefined)
      Object.defineProperty(C.prototype, "cssText", { ...own, set: base.set });
  }
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

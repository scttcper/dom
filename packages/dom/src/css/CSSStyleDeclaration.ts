// https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
// https://drafts.csswg.org/cssom/#the-elementcssinlinestyle-mixin
//
// One class for inline styles (backed by the owner's `style` attribute), rule styles
// (CSSStyleRule.style etc.) and computed styles (read-only, see computed.ts subclass).
// Storage is a DeclBlock (declarations.ts) so the cascade can read declarations without
// touching this wrapper.
//
// Named property accessors (camelCase, dashed, `webkit*`/`Webkit*`, `cssFloat`) are defined
// once on the prototype from the generated property list — no Proxy. Indexed access
// (`style[0]`) uses own data properties kept in sync with the declaration list (computed
// declarations use prototype getters instead, see computed.ts).

import type { Element } from "../nodes/Element.ts";
import { attr, setAttribute } from "../nodes/attributes.ts";
import { DeclBlock } from "./declarations.ts";
import { allPropertyNames, cssPropertyToIDLAttribute, isCustomPropertyName } from "./properties.ts";
import { $block, $impl, $indexed, $owner, $parentRule, $readonly, $updating } from "../keys.ts";

/** Parent rule interface needed here (avoids importing cssom.ts). */
export interface DeclarationOwnerRule {
  /** Called after the declarations changed (bumps the style version). */
  _declarationsChanged(): void;
}

export class CSSStyleDeclaration {
  /** Inline style owner element, or null. */
  [$owner]: Element | null;
  /** Rule owning these declarations (CSSStyleRule, CSSFontFaceRule, ...), or null. */
  [$parentRule]: DeclarationOwnerRule | null;
  [$block]: DeclBlock;
  /** Computed declarations are read-only. */
  [$readonly]: boolean;
  /** Set while this declaration writes its owner's style attribute. */
  [$updating]: boolean;
  /** Number of own indexed properties currently defined. */
  [$indexed]: number;

  constructor(
    owner: Element | null = null,
    block: DeclBlock | null = null,
    parentRule: DeclarationOwnerRule | null = null,
  ) {
    if (!accessorsInstalled) installAccessors();
    this[$owner] = owner;
    this[$parentRule] = parentRule;
    this[$block] = block ?? new DeclBlock();
    this[$readonly] = false;
    this[$updating] = false;
    this[$indexed] = 0;
    if (owner !== null) {
      const text = attr(owner[$impl], "style");
      if (text !== null && text !== "") this[$block].parse(text);
    }
    if (this[$block].names.length !== 0) this._syncIndices();
  }

  /** @internal Core hook: the owner's style attribute changed (https://drafts.csswg.org/cssom/#ref-for-concept-element-attributes-change-ext). */
  _attributeChanged(value: string | null): void {
    if (this[$updating]) return;
    this[$block].parse(value ?? "");
    this._syncIndices();
  }

  /**
   * https://drafts.csswg.org/cssom/#update-style-attribute-for
   *
   * Eager: every inline style write serializes the block into the style attribute. Base UI's
   * interaction tests (floating-ui writes positions on every render) spend ~0.5 s of 72.5 s CPU
   * in inline-style writes (bench/README.md "Where real suites spend their time"). Appended
   * declarations, as in React's one-property-at-a-time mount, are serialized onto the previous
   * text (DeclBlock.serialize()), and a value changed in place is spliced into it unless shorthand
   * grouping could change (DeclBlock.put()).
   * Serializing when the attribute is read, as Blink does, would save more, but every attribute
   * read path (getAttribute, attribute iteration, serialization, MutationObserver old values)
   * would then have to check for a stale style attribute.
   */
  _changed(): void {
    this._syncIndices();
    const owner = this[$owner];
    if (owner !== null) {
      this[$updating] = true;
      try {
        setAttribute(owner[$impl], "style", this[$block].serialize());
      } finally {
        this[$updating] = false;
      }
    } else if (this[$parentRule] !== null) {
      this[$parentRule]._declarationsChanged();
    }
  }

  _syncIndices(): void {
    const block = this[$block];
    const names = block.names;
    const n = names.length;
    const from = block.namesSynced;
    if (from === n && n === this[$indexed]) return;
    const self = this as unknown as Record<number, string>;
    for (let i = from; i < n; i++) self[i] = names[i];
    for (let i = n; i < this[$indexed]; i++) delete self[i];
    this[$indexed] = n;
    block.namesSynced = n;
  }

  _checkWritable(): void {
    if (this[$readonly]) {
      throw new DOMException(
        "Failed to execute on 'CSSStyleDeclaration': These styles are computed, and therefore read-only.",
        "NoModificationAllowedError",
      );
    }
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-csstext */
  get cssText(): string {
    if (this[$readonly]) return "";
    return this[$block].serialize();
  }

  set cssText(text: string) {
    this._checkWritable();
    this[$block].parse(text === null ? "" : String(text));
    this._changed();
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-length */
  get length(): number {
    return this[$block].names.length;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-item */
  item(index: number): string {
    return this[$block].names[index >>> 0] ?? "";
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-getpropertyvalue */
  getPropertyValue(property: string): string {
    const p = String(property);
    return this[$block].getPropertyValue(isCustomPropertyName(p) ? p : p.toLowerCase());
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-getpropertypriority */
  getPropertyPriority(property: string): string {
    const p = String(property);
    return this[$block].getPropertyPriority(isCustomPropertyName(p) ? p : p.toLowerCase());
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-setproperty */
  setProperty(property: string, value: string | null, priority: string = ""): void {
    this._checkWritable();
    let p = String(property);
    if (!isCustomPropertyName(p)) p = p.toLowerCase();
    // WebIDL: `[LegacyNullToEmptyString] CSSOMString value` (undefined → "undefined", which is
    // then an invalid value and ignored) and `[LegacyNullToEmptyString] optional priority = ""`.
    const v = value === null ? "" : idlString(value);
    if (v === "") {
      this.removeProperty(p);
      return;
    }
    const prio = priority === null ? "" : idlString(priority);
    let important = false;
    if (prio !== "") {
      if (prio.toLowerCase() !== "important") return;
      important = true;
    }
    // https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-setproperty step 9: only an
    // actual change updates the style attribute (no mutation record for the same value).
    const block = this[$block];
    block.dirty = false;
    if (block.setValue(p, v, important, false) && block.dirty) this._changed();
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-removeproperty */
  removeProperty(property: string): string {
    this._checkWritable();
    let p = String(property);
    if (!isCustomPropertyName(p)) p = p.toLowerCase();
    const value = this[$block].getPropertyValue(p);
    if (this[$block].remove(p)) this._changed();
    return value;
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-parentrule */
  get parentRule(): DeclarationOwnerRule | null {
    return this[$parentRule];
  }

  /** https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-cssfloat */
  get cssFloat(): string {
    return this.getPropertyValue("float");
  }

  set cssFloat(value: string) {
    this._setNamed("float", value);
  }

  /** Setter steps of the camel-cased / dashed attributes (https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-camel-cased-attribute). */
  _setNamed(property: string, value: unknown): void {
    // Computed declarations ignore named assignments (jsdom-compatible; browsers throw).
    if (this[$readonly]) return;
    // `[LegacyNullToEmptyString] attribute CSSOMString` (https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-camel-cased-attribute).
    this.setProperty(property, value === null ? "" : idlString(value));
  }

  *[Symbol.iterator](): IterableIterator<string> {
    const n = this.length;
    for (let i = 0; i < n; i++) yield this.item(i);
  }

  get [Symbol.toStringTag](): string {
    return "CSSStyleDeclaration";
  }
}

let accessorsInstalled = false;

/**
 * Defines the camel-cased, webkit-cased and dashed attributes for every supported property
 * (https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-camel-cased-attribute). Done lazily
 * on first construction to keep module import cheap. The accessors live on a holder object
 * inserted between CSSStyleDeclaration.prototype and Object.prototype: defining ~1700
 * accessors on a null-prototype object that is not yet in a prototype chain is ~6x faster
 * than defining them on the class prototype (measured 28 ms → 5 ms).
 */
function installAccessors(): void {
  accessorsInstalled = true;
  const proto = CSSStyleDeclaration.prototype;
  const holder = Object.create(null) as object;
  const define = (key: string, descriptor: PropertyDescriptor): void => {
    if (Object.hasOwn(holder, key) || Object.hasOwn(proto, key)) return;
    Object.defineProperty(holder, key, descriptor);
  };
  for (const name of allPropertyNames()) {
    // One getter/setter pair per property, shared by its dashed, camel-cased and webkit-cased names.
    const descriptor: PropertyDescriptor = {
      get(this: CSSStyleDeclaration): string {
        return this.getPropertyValue(name);
      },
      set(this: CSSStyleDeclaration, value: unknown) {
        this._setNamed(name, value);
      },
      enumerable: true,
      configurable: true,
    };
    define(name, descriptor);
    if (name.indexOf("-") === -1) continue;
    define(cssPropertyToIDLAttribute(name, false), descriptor);
    if (name.startsWith("-webkit-")) define(cssPropertyToIDLAttribute(name, true), descriptor);
  }
  Object.setPrototypeOf(holder, Object.getPrototypeOf(proto));
  Object.setPrototypeOf(proto, holder);
}

/** Named property accessors (installed at runtime from the property list) and indexed access. */
export interface CSSStyleDeclaration {
  // oxlint-disable-next-line no-explicit-any
  [property: string]: any;
  [index: number]: string;
}

/** WebIDL DOMString conversion (https://webidl.spec.whatwg.org/#js-DOMString): symbols throw. */
function idlString(v: unknown): string {
  if (typeof v === "symbol") throw new TypeError("Cannot convert a Symbol value to a string");
  return String(v);
}

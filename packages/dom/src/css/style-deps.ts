// Which DOM changes cannot change any element's computed style.
//
// Per-element style records (css/cascade.ts styleRecord) were stamped with Document[$version],
// which every mutation bumps, so one text update or one `aria-expanded` flip made the next
// visibility check or getComputedStyle() cascade every element it looked at again. Blink keeps
// invalidation sets per selector feature; this is the coarse form of it. Two kinds of change are
// counted in Document[$benign] next to the version bump, and a style record is stamped with the
// difference, which moves only when something else changed:
//
// - the data of a text node changing between two non-empty strings (React's text updates). Style
//   depends on text only through `:empty` (a text node that becomes or stops being empty) and
//   `:dir()` of `dir=auto`, which is a volatile test (never cached);
// - an `aria-*` or `data-*` attribute changing while no style rule's selector that has been
//   indexed mentions that attribute. Other attributes may be presentational hints or feed
//   pseudo-classes (`disabled`, `href`, `lang`, `open`, `type`...), so they always count.

import type { Document } from "../nodes/Document.ts";
import { $css } from "../keys.ts";
import type { DocCSS } from "./stylesheets.ts";

/** Attribute dependencies from live shadow indexes in this document, including :host selectors. */
export class ShadowAttributeUses {
  readonly counts = new Map<string, number>();
  readonly collected = new FinalizationRegistry<Set<string>>((names) => this.remove(names));

  remove(names: Set<string>): void {
    for (const name of names) {
      const count = this.counts.get(name)!;
      if (count === 1) this.counts.delete(name);
      else this.counts.set(name, count - 1);
    }
  }
}

/** Each shadow index contributes a name once. Its registration contains only names. */
export class ShadowAttributeNames extends Set<string> {
  private readonly uses: ShadowAttributeUses;

  constructor(uses: ShadowAttributeUses, index: object) {
    super();
    this.uses = uses;
    uses.collected.register(index, this, this);
  }

  override add(name: string): this {
    if (!this.has(name)) {
      this.uses.counts.set(name, (this.uses.counts.get(name) ?? 0) + 1);
      super.add(name);
    }
    return this;
  }

  release(): void {
    this.uses.collected.unregister(this);
    this.uses.remove(this);
  }
}

/** `aria-` or `data-` at the start of `name`: most names fail on the fifth character. */
export function ariaOrData(name: string): boolean {
  if (name.length < 6 || name.charCodeAt(4) !== 0x2d) return false;
  const c = name.charCodeAt(0);
  if (c === 0x61) return name.charCodeAt(1) === 0x72 && name.charCodeAt(2) === 0x69 && name.charCodeAt(3) === 0x61;
  return c === 0x64 && name.charCodeAt(1) === 0x61 && name.charCodeAt(2) === 0x74 && name.charCodeAt(3) === 0x61;
}

/**
 * Whether any style record has been cached in this process. Until one has, nothing reads the
 * count, and an attribute write skips the check (4 ns of a 19 ns write in `dom/attr-revisions`).
 */
export let styleRecordsCached = false;

/** css/cascade.ts is about to stamp a style record. */
export function noteStyleRecordCached(): void {
  styleRecordsCached = true;
}

/** Whether a change to a null-namespace attribute leaves the document's style records valid. */
export function styleBlindAttribute(doc: Document, localName: string): boolean {
  if (!ariaOrData(localName)) return false;
  const css = doc[$css] as DocCSS | null;
  return !css?.main.index?.attributeNames?.has(localName) && !css?.shadowAttributeUses?.counts.has(localName);
}

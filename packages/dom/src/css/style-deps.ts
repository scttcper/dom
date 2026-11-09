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
//
// Deliberately import-free: nodes/attributes.ts loads before everything else.

/**
 * The `aria-*` and `data-*` attribute names in the selectors of indexed style rules. Only grows,
 * and stays empty in a suite whose style sheets never select on one: every attribute write asks.
 */
const referenced = new Set<string>();
let anyReferenced = false;

/** `aria-` or `data-` at the start of `name`: most names fail on the fifth character. */
function ariaOrData(name: string): boolean {
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

/** A style rule with `name` in an attribute selector was indexed (css/cascade.ts). */
export function noteSelectorAttribute(name: string): void {
  if (!ariaOrData(name)) return;
  referenced.add(name);
  anyReferenced = true;
}

/** Whether a change to attribute `localName` (no namespace) leaves every computed style as it was. */
export function styleBlindAttribute(localName: string): boolean {
  return ariaOrData(localName) && (!anyReferenced || !referenced.has(localName));
}

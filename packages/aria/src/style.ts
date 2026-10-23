// Style reads needed by the accessibility computations: `display: none`, computed
// `visibility`, whether an element's computed `display` is `inline` (accname uses it to
// decide whether children are separated by a space), and `::before`/`::after` content.
//
// Specs:
//   https://drafts.csswg.org/css-display/#the-display-properties
//   https://drafts.csswg.org/css-display/#visibility (visibility is inherited)
//   https://drafts.csswg.org/css-content-3/#content-property
//
// All reads go through the css area's fast API (`@rtd/dom/internal`, src/css/internal.ts):
// per-element records stamped with Document._version/_styleVersion, and with no author
// styles a plain inline-style + UA-default check without rule matching.

//
// Testing Library compatibility: when no author or inline style overrides an element's
// display (computed display === the css area's UA display), the UA default is classified the
// way jsdom's default stylesheet does — the oracle every existing Testing Library test was
// written against. It differs from the css area's (spec) UA defaults in three ways:
//   - jsdom's UA sheet has no @namespace, so its type selectors also hit SVG/MathML elements
//     (`<svg><title>` and `[hidden]` on SVG elements are display:none there);
//   - `[popover]:not(:popover-open):not(dialog[open])` is display:none (an HTML rendering
//     rule the css area does not apply yet — TODO(css));
//   - select, textarea, meter, progress, option, optgroup are `inline` (no inline-block/block
//     rule in jsdom), which decides whether accname separates them with spaces.

import {
  T,
  attr,
  computedDisplay,
  computedValue,
  computedVisibility,
  pseudoContent,
  tagId,
  uaDisplay,
  type NodeImpl,
} from "@rtd/dom/internal";

const K_NONE = 0;
const K_INLINE = 1;
const K_OTHER = 2;

/** jsdom default-stylesheet display classification (by local name, any namespace). */
function jsdomUaKind(impl: NodeImpl): number {
  const tag = impl.tag !== 0 ? impl.tag : tagId(impl.name);
  const hidden = attr(impl, "hidden");
  if (hidden !== null && tag !== T.embed && hidden.toLowerCase() !== "until-found") return K_NONE;
  if (attr(impl, "popover") !== null && !(tag === T.dialog && attr(impl, "open") !== null)) return K_NONE;
  switch (tag) {
    case 0:
      return K_INLINE;
    case T.area: case T.base: case T.basefont: case T.datalist: case T.head: case T.link: case T.meta:
    case T.noembed: case T.noframes: case T.param: case T.rp: case T.script: case T.style: case T.template:
    case T.title:
      return K_NONE;
    case T.dialog:
      return attr(impl, "open") === null ? K_NONE : K_OTHER;
    case T.input: {
      const type = attr(impl, "type");
      return type !== null && type.toLowerCase() === "hidden" ? K_NONE : K_OTHER;
    }
    case T.html: case T.body: case T.address: case T.blockquote: case T.center: case T.div: case T.figure:
    case T.figcaption: case T.footer: case T.form: case T.header: case T.hr: case T.legend: case T.listing:
    case T.main: case T.p: case T.plaintext: case T.pre: case T.search: case T.xmp: case T.slot: case T.article:
    case T.aside: case T.h1: case T.h2: case T.h3: case T.h4: case T.h5: case T.h6: case T.hgroup: case T.nav:
    case T.section: case T.dir: case T.dd: case T.dl: case T.dt: case T.menu: case T.ol: case T.ul: case T.li:
    case T.ruby: case T.rt: case T.table: case T.caption: case T.colgroup: case T.col: case T.thead: case T.tbody:
    case T.tfoot: case T.tr: case T.td: case T.th: case T.button: case T.fieldset: case T.details: case T.summary:
    case T.marquee:
      return K_OTHER;
    default:
      return K_INLINE;
  }
}

/** Computed `display` is `none` (the element itself; `display` is not inherited). */
export function isDisplayNone(impl: NodeImpl): boolean {
  const d = computedDisplay(impl);
  if (d !== uaDisplay(impl)) return d === "none"; // author / inline style decides
  return jsdomUaKind(impl) === K_NONE;
}

/** Computed `display` is exactly `inline` (accname: inline children are not space-separated). */
export function isDisplayInline(impl: NodeImpl): boolean {
  const d = computedDisplay(impl);
  if (d !== uaDisplay(impl)) return d === "inline";
  return jsdomUaKind(impl) === K_INLINE;
}

/**
 * Computed `visibility` is exactly `hidden` (inherited). `collapse` does not count: Testing
 * Library and dom-accessibility-api compare against "hidden" only.
 */
export function isVisibilityHidden(impl: NodeImpl): boolean {
  return computedVisibility(impl) === "hidden";
}

/**
 * Textual `content` of `::before` / `::after` as dom-accessibility-api extracts it from
 * `getComputedStyle(el, pseudo).getPropertyValue("content")`: a value that starts and ends
 * with a quote, with the outer quotes sliced off; anything else is "".
 */
export function pseudoText(impl: NodeImpl, pseudo: "::before" | "::after"): string {
  // Cheap guard: no author rule targets this pseudo-element → no generated text.
  if (pseudoContent(impl, pseudo) === "") {
    // `content: ""` and attr()-only values with empty attributes also land here; both yield
    // "" under dom-accessibility-api's extraction too.
    return "";
  }
  const content = computedValue(impl, "content", pseudo);
  if (/^["'].*["']$/.test(content)) return content.slice(1, -1);
  return "";
}

/** Whether author style sheets (`<style>`, `<link rel=stylesheet>`) are applied. */
export const AUTHOR_STYLES_SUPPORTED: boolean = true;

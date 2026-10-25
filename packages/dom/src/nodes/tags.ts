// Numeric ids for known HTML element local names. `NodeImpl.tag` holds one of these
// (0 = not a known HTML-namespace element), so hot code (roles, selectors, serialization,
// visibility) can `switch` on a small integer instead of comparing strings.
//
// Append new names at the END only: ids are stable within a process but are not persisted.

// oxfmt-ignore
const NAMES = [
  "", // 0: unknown / non-HTML
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi",
  "bdo", "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col",
  "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl",
  "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
  "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i",
  "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "link", "main",
  "map", "mark", "menu", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup",
  "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby",
  "s", "samp", "script", "search", "section", "select", "slot", "small", "source", "span",
  "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea",
  "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var",
  "video", "wbr", "svg", "math", "frame", "frameset", "noframes", "marquee", "font", "center",
  "dir", "applet", "basefont", "bgsound", "big", "blink", "keygen", "listing", "menuitem", "nobr",
  "noembed", "param", "plaintext", "rb", "rtc", "strike", "tt", "xmp", "image", "selectedcontent",
] as const;

export type TagName = (typeof NAMES)[number];

const ids = new Map<string, number>();
for (let i = 1; i < NAMES.length; i++) ids.set(NAMES[i], i);

/** Tag id for an HTML-namespace local name (already lowercased), or 0. */
export function tagId(localName: string): number {
  return ids.get(localName) ?? 0;
}

export function tagName(id: number): string {
  return NAMES[id] ?? "";
}

/** `T.button === tagId("button")`, for readable switches: `case T.button:`. */
export const T = Object.fromEntries(NAMES.map((n, i) => [n, i])) as { readonly [K in Exclude<TagName, "">]: number };

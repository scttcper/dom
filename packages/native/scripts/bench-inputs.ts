// Deterministic inputs for the native-vs-JS benchmark (no files, no randomness).

function row(i: number): string {
  return (
    `<tr class="row ${i % 2 ? "odd" : "even"}" data-id="${i}" data-testid="row-${i}">` +
    `<td><a href="/projects/${i}?tab=settings&amp;view=full" title="Project ${i} &mdash; details">Project ${i}</a></td>` +
    `<td><span class="status">${i % 3 ? "Active" : "Paused"}</span> &nbsp;&middot;&nbsp; <em>${i * 7}</em> tasks</td>` +
    `<td><label for="c-${i}">Enabled</label><input id="c-${i}" type="checkbox" ${i % 2 ? "checked" : ""}></td>` +
    `<!-- row ${i} --><td><button type="button" aria-label="Delete project ${i}">&times;</button></td></tr>\n`
  );
}

function htmlDoc(rows: number): string {
  let body = "";
  for (let i = 0; i < rows; i++) body += row(i);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Projects</title><style>.row{color:red}</style></head><body><main><h1>Projects &amp; teams</h1><table><tbody>\n${body}</tbody></table></main></body></html>`;
}

function cssSheet(rules: number): string {
  let out = "";
  for (let i = 0; i < rules; i++) {
    out +=
      `.card-${i} > .title:hover, #item-${i}[data-state="open"] { color: rgb(${i % 255}, 20, 30); ` +
      `margin: ${i % 16}px auto 0 calc(100% - ${i % 40}em); background: url("img/${i}.png") no-repeat; ` +
      `font: italic bold 12px/30px Georgia, serif; --custom-${i}: { a: b }; transition: opacity .3s ease-in-out; }\n` +
      `@media (min-width: ${600 + i}px) { .grid-${i} { display: grid; grid-template-columns: repeat(3, 1fr); } }\n`;
  }
  return out;
}

const selectors = [
  "div",
  ".row",
  "#main",
  '[data-testid="row-249"]',
  "[data-testid]",
  "ul > li:nth-child(2n+1)",
  "form input[type=checkbox]:checked",
  "main .card:not(.hidden) > h2 + p",
  ':is(button, [role="button"]):not([disabled])',
  "section:has(> h2) ~ aside",
  "a[href^='https://'][target=_blank]",
  "table tbody tr:last-child td:first-of-type",
  "label[for] , input:focus-visible",
  "*",
  "svg|rect",
  "li:nth-last-of-type(odd) span::before",
  ".a.b.c.d.e",
  "nav > ul > li > a:hover",
  "[aria-hidden='true' i]",
  ":where(.x, .y) .z",
];

const attrValues = [
  "plain value with no references",
  "Tom &amp; Jerry",
  "/search?q=a&amp;page=2&amp;sort=desc",
  "&lt;b&gt;bold&lt;/b&gt;",
  "caf&eacute; &mdash; &#8212; &#x2014;",
  "a&b c&d",
  "",
  "&nbsp;&nbsp;indented",
];

let entityText = "";
while (entityText.length < 1_000_000) {
  entityText += "Lorem ipsum &amp; dolor sit &lt;amet&gt;, consectetur &quot;adipiscing&quot; elit &copy; 2026 &#8211; sed do eiusmod; plain text plain text plain text. ";
}

export const inputs = {
  /** ~2.5 MB document. */
  htmlLarge: htmlDoc(5600),
  /** 250-row fragment, ~110 KB... kept small: 40 rows ≈ 18 KB (typical innerHTML size). */
  htmlFragment: htmlDoc(40),
  /** ~600 KB stylesheet. */
  cssLarge: cssSheet(1500),
  inlineStyles: [
    "color: red",
    "display: none",
    "width: 10px; height: calc(100% - 4px)",
    "background-color: rgb(1, 2, 3); border: 1px solid #ccc",
    "pointer-events: none; visibility: hidden",
  ],
  selectors,
  selectorBatch: Array.from({ length: 10_000 }, (_, i) => selectors[i % selectors.length]).join("\n"),
  attrValues,
  entityText,
};

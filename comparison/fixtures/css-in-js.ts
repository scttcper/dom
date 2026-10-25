// A CSS-in-JS style sheet like the ones Emotion / styled-components / MUI inject into test
// documents (same shape as bench/workloads/react.ts, react/styled-form-rerender): one or two
// hashed classes per component, :hover/:focus variants, descendant and child rules scoped under
// component classes, and a few global tag / universal / attribute rules. `n` component classes
// give about 6n rules; the benchmarks use 200 (≈1,200 rules).

export function cssInJsSheet(n = 200): string {
  const rules = [
    "*, *::before, *::after { box-sizing: border-box; }",
    "html { font-size: 16px; } body { margin: 0; font-family: sans-serif; }",
    "[hidden] { display: none !important; }",
    "button { cursor: pointer; } input, textarea { font: inherit; }",
    "form > fieldset { border: 0; } fieldset legend { font-weight: 600; }",
    ".app .toolbar button.primary { color: white; }",
    "ul li + li { margin-top: 4px; }",
  ];
  for (let i = 0; i < n; i++) {
    rules.push(
      `.css-${i} { display: flex; padding: ${i % 8}px; color: rgb(${i % 255}, 10, 20); }`,
      `.css-${i}:hover { color: blue; }`,
      `.css-${i}:focus-visible { outline: 2px solid; }`,
      `.css-${i} > label { font-weight: ${i % 2 ? 400 : 500}; }`,
      `.css-${i} .hint, .theme-dark .css-${i} input { opacity: 0.8; }`,
      `.panel .css-${i} input[type="text"] { border-color: gray; }`,
    );
  }
  return rules.join("\n");
}

/** Markup of the styled form (fixtures/components.tsx StyledForm), for the DOM-only benchmark. */
export function styledFormHTML(fields = 40): string {
  let html =
    '<div class="app css-199"><div class="toolbar css-198"><button type="button" class="primary css-197">New</button></div>';
  html +=
    '<form aria-label="Styled form" class="css-195"><h2 class="css-194">Profile</h2><fieldset class="css-193"><legend>Fields</legend>';
  for (let i = 0; i < fields; i++) {
    html += `<div class="css-${i} field"><label for="s-${i}" class="css-${100 + (i % 50)}">Field ${i}</label>`;
    html += `<input id="s-${i}" type="text" class="css-${150 + (i % 50)}" value="v${i}">`;
    if (i % 5 === 0) html += `<span class="hint">Hint for field ${i}</span>`;
    html += "</div>";
  }
  return `${html}</fieldset><button type="submit" class="css-192">Submit</button></form></div>`;
}

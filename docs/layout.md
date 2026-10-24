# Layout-lite

By default @rtd/dom has no layout, like jsdom and happy-dom: every geometry API returns zero. That
is right for most component tests and costs nothing. It is wrong for the libraries whose output
depends on geometry:

- **Virtualizers** (TanStack Virtual, react-window, react-virtuoso, React Aria's `Virtualizer`)
  read the scroll element's `offsetHeight`/`clientHeight`, `scrollTop`, `scrollHeight` and
  ResizeObserver entries. On zeros they see a 0px viewport and render only their overscan (or
  nothing), and scrolling never moves the window.
- **Positioning** (Floating UI, Radix popper, Base UI positioners) reads `getBoundingClientRect`,
  `offsetParent`, `offsetWidth/Height`, `clientWidth/Height` of the document element and
  `scrollTop/Left` of scroll ancestors. On zeros everything is placed at 0,0.
- **Scroll areas and focus-into-view helpers** compare `scrollHeight` with `clientHeight` and call
  `scrollIntoView`.

So suites mock prototypes by hand. In the downstream suites this repo tracks, test files spy on
`HTMLElement.prototype` geometry getters (`clientHeight`, `scrollHeight`, `offsetWidth`, ...) in
react-aria (39 files) and sentry (28), mention `getBoundingClientRect` in base-ui (42), react-aria
(34), sentry (21) and radix (3), and sentry installs its own ResizeObserver mock (18 files).

`layout: "lite"` replaces those zeros with a simple, predictable box model. It is an
approximation, not a browser: the rules below are the whole model, so a test can state the
numbers it expects.

## Turning it on

Off by default in every compat profile (`jsdom-26`, `jsdom-30`, `modern`).

| Where | Option |
| --- | --- |
| `createWindow` | `createWindow({ layout: "lite" })` |
| Vitest (`environment: "ctrl-dom"` / `"rtd"`) | `environmentOptions: { "ctrl-dom": { layout: "lite" } }` |
| Vitest plugin | `plugins: [ctrlDom({ layout: "lite" })]` |
| Vitest, one file | `// @vitest-environment-options {"layout":"lite"}` (Vitest files docblock options under the environment's name and replaces the config's) |
| Jest (`jest-environment-ctrl-dom`) | `testEnvironmentOptions: { layout: "lite" }` |

`layout: "none"` (or leaving it out) is the default. Iframes inherit their parent window's mode.
ResizeObserver delivery needs a ResizeObserver global: the `modern` profile exposes one; under the
jsdom profiles (no global, as on jsdom) TanStack Virtual and friends fall back to synchronous
`offsetWidth/offsetHeight` reads, which layout-lite also answers.

## What a virtualizer test looks like

```tsx
function List() {
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: 1000, getScrollElement: () => parentRef.current, estimateSize: () => 35 });
  return (
    <div ref={parentRef} data-testid="scroller" style={{ height: 400, overflow: "auto" }}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((item) => (
          <div key={item.key} role="row" style={{ position: "absolute", top: 0, height: 35, transform: `translateY(${item.start}px)` }}>
            Row {item.index}
          </div>
        ))}
      </div>
    </div>
  );
}

test("renders the visible window and follows scrolling", () => {
  render(<List />);
  expect(screen.getAllByRole("row")).toHaveLength(12 + 1); // 400 / 35, plus overscan
  act(() => {
    screen.getByTestId("scroller").scrollTop = 3500; // clamps, fires `scroll`
  });
  expect(screen.getAllByRole("row")[0]).toHaveTextContent("Row 99");
});
```

Without layout-lite the same test renders one row and scrolling changes nothing, unless the suite
first mocks `HTMLElement.prototype.offsetHeight`, `clientHeight` and `scrollHeight` (and, for
react-window, makes the mocked `scrollTop` agree with them). tests/compat/layout/ has both
versions, plus a react-window style list and ResizeObserver-driven item measurement.

## The model

Layout runs lazily: the whole document is laid out on the first geometry read after
`Document._version` (any DOM mutation, including inline style changes), the style version (sheets,
media rules) or the viewport size changed, and the boxes are cached until then. Mutations never
trigger work. Scrolling does not invalidate the layout: scroll offsets are applied when a
position is read.

### What feeds it

| Input | Used for |
| --- | --- |
| computed `display` | `none`: no box for the element or its subtree. `contents`: the children lay out in the parent. `flex`/`inline-flex`: flex layout. `table-row`: cells share the width. `inline-block`/`inline-flex`/`inline-grid`/`inline-table` and replaced elements: atomic inline boxes. `inline`: inline boxes (an inline element containing a block-level child is treated as a block). Everything else (`block`, `grid`, `table`, `list-item`, `flow-root`, ...) is a block. |
| `width`, `height`, `min-*`, `max-*` | px, em, rem, ex/ch (0.5em), %, vw/vh/vmin/vmax, absolute units, `calc()`/`min()`/`max()`/`clamp()` over them. `auto` width fills the containing block; `auto` height is the content height. Percent heights need a definite containing block height, else act as `auto`. |
| `box-sizing` | `border-box` subtracts padding and border from `width`/`height`. |
| `margin-*`, `padding-*`, `border-*-width` | Resolved per side (percentages against the containing block width). Margins never collapse. `margin: 0 auto` centers a definite width. Border widths are 0 when the style is `none`. |
| `font-size`, `line-height` | A text run is one line box `line-height` tall (`normal` = 1.2 × font-size). |
| `position`, `top`/`right`/`bottom`/`left` | `relative` offsets the box and its subtree. `absolute` lays out against the nearest positioned (or transformed) ancestor's padding box, else the viewport; auto offsets keep the static position; `left`+`right` / `top`+`bottom` size an auto width/height; an otherwise auto width shrinks to fit. `fixed` lays out against the viewport and ignores window scrolling. `sticky` is treated as static. |
| `flex-direction`, `flex-grow`/`-shrink`/`-basis`, `gap`, `justify-content`, `align-items`/`align-self` | One flex line (no wrapping; `*-reverse` reverses the order). Base sizes come from `flex-basis`, else `width`/`height`, else the content. Free space in a definite main size is distributed by grow factors, or overflow taken back by shrink × base size (no min-content floor). Cross size: the container's definite size, else the largest item; `stretch` (the default) fills it. `center`/`flex-end`/`space-*` distribute leftover space. |
| `overflow-x`/`-y` | Anything but `visible`/`clip` makes a scroll container (its size does not grow past a definite height; its descendants scroll). |
| `transform` | `translate()`, `translateX/Y()`, `translate3d()` and `matrix()` translations move `getBoundingClientRect()` (with the subtree), not `offsetTop`/`offsetLeft`. Other functions are ignored. |
| Text | 0.5 × font-size per character after collapsing white space; each text node drops its leading and trailing white space. Runs of inline-level siblings form one line (no wrapping); `<br>` ends a line. |
| Replaced elements | `img`: `width`/`height` attributes (0 without), scaled by a CSS width or height. `canvas`, `video`, `iframe`, `embed`, `object`, `svg`: attributes or 300×150. `audio` 300×54. `input`: checkbox/radio 13×13, buttons their value's text, others `size` (20) × 0.5em wide; `textarea` `cols` × 0.5em by `rows` lines; `select` the longest option + 20px, one line (or `size` lines). |
| Viewport | `innerWidth`/`innerHeight` (`createWindow({ width, height })`, default 1024×768) is the initial containing block and the root element's client box. There are no UA margins (`body` has no 8px margin, as in our UA style sheet) and no scrollbars. |
| Shadow trees | A host lays out its shadow root's children; a `<slot>` lays out its assigned nodes (or its fallback content). |

### What each API returns

All values are 0 / empty for elements without a box (`display: none` and their descendants,
disconnected elements, elements inside replaced elements such as `<select>` options or SVG
content) and for every element of a window without layout-lite.

| API | Returns |
| --- | --- |
| `getBoundingClientRect()` | The border box, transforms applied, minus the scroll offsets of scroll-container ancestors and the window's `scrollX`/`scrollY` (not for `position: fixed` boxes). |
| `getClientRects()` | One rect equal to `getBoundingClientRect()` (no per-line fragments). |
| `offsetWidth`, `offsetHeight` | The border box size, rounded. |
| `offsetTop`, `offsetLeft` | The border edge relative to `offsetParent`'s padding edge (or to the document origin when `offsetParent` is null or `body`), rounded, transforms and scrolling ignored. `offsetParent` is unchanged (it never needed layout). |
| `clientTop`, `clientLeft` | The top/left border widths. |
| `clientWidth`, `clientHeight` | The padding box (no scrollbars). The root element: the viewport. Inline boxes: 0. |
| `scrollWidth`, `scrollHeight` | The content extent (descendant margin boxes, not descending into nested scroll containers or fixed boxes) plus the end padding, at least `clientWidth`/`clientHeight`. The root element covers the whole document. |
| `scrollTop`, `scrollLeft` (get) | The stored offset clamped to `[0, scrollHeight − clientHeight]`, re-clamped when content shrinks. |
| `scrollTop`, `scrollLeft` (set), `scroll()`, `scrollTo()`, `scrollBy()` | Clamp the same way; when the position changes, fire one `scroll` event at the element synchronously. The root element's offsets do not move `window.scrollX/Y`. |
| `scrollIntoView(arg)` | Scrolls each scroll-container ancestor, innermost first, so the border box is in view: `block` `start` (default) / `end` (`false`) / `center` / `nearest`, `inline` `nearest` by default. Does not scroll the window. |
| `ResizeObserver` | Each new observation delivers once (its last reported size starts at −1×−1), then whenever the observed box (`content-box`, `border-box` or `device-pixel-content-box`) changes. Checks run in a microtask after `observe()` and after each layout recomputation of a document with observations — so after a change, something has to read geometry (a re-render that measures, or the test) before the next entry. `contentRect` is the content box at the padding offset. A chain of more than 32 consecutive delivering rounds stops until the next `observe()`. |
| `getComputedStyle()` | Unchanged: computed values keep their specified form (`width: auto` stays `auto`, docs/deviations.md), as before. |

Unchanged with layout-lite: `IntersectionObserver` (never reports), `window.scroll*` (records the
position, no clamping), `visualViewport` (profile-gated), SVG geometry (`getBBox` and friends),
`Range.getBoundingClientRect()`.

### Known limits

No margin collapsing, floats, line wrapping, multi-line flex, grid tracks (grid is a block),
table column sizing (cells of a row are equal), writing modes / RTL, `position: sticky`,
`min-width: auto` for flex items, scale/rotate transforms, scrollbars, intrinsic sizes of
fonts (all text is 0.5em per character), `:hover`/`:focus`-dependent styles changing a box
without a DOM mutation (layout is stamped by version, like computed styles), or absolutely
positioned descendants whose containing block is outside a flex item that a later flex pass moves
(they keep the static position measured before the move). Absolutely positioned boxes count
towards `scrollHeight` only of their containing block and its ancestors.

## Cost

Measured with a fresh process per sample (7 samples, median [min..max]), Node 26, on a 1,000-element
tree (an app shell with a scrolling list of 330 flex rows and a style sheet):

| Scenario | layout-lite |
| --- | --- |
| first geometry read (cold: computed styles + layout) | 13.3 ms [12.9..14.5] |
| read after a mutation (relayout of the whole document) | 3.7 ms [3.5..4.4] |
| `getBoundingClientRect()` on an unchanged layout | 1.6 µs [1.4..2.4] (of which ~0.7 µs is the DOMRect) |
| `offsetHeight` of all 1,000 elements, unchanged layout | 0.27 ms total |
| heap after GC / RSS | 19.4 MB / 150 MB |

With the option off, geometry getters check one module binding before returning zero:
`offsetHeight + clientWidth + scrollTop` reads cost 5.1 ns [4.7..5.5] per triple against
5.4 ns [5.0..5.7] before layout-lite existed, `getBoundingClientRect()` 768 ns vs 807 ns (both the
DOMRect allocation), heap after GC 16.65 MB vs 16.48 MB (the added module code), RSS the same.
Boxes and resolved styles live in WeakMaps keyed by node (tests/compat/test/leaks/layout.test.ts).

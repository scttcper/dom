# Architecture

react-testing-dom is one cohesive stack for testing React components on Node.js:

```
@rtd/react          (drop-in for @testing-library/react)      render, act, renderHook, cleanup
@rtd/user-event     (drop-in for @testing-library/user-event)  pointer/keyboard simulation
@rtd/jest-dom       (drop-in for @testing-library/jest-dom)    matchers for vitest/jest
@rtd/testing-library(drop-in for @testing-library/dom)         queries, waitFor, fireEvent, prettyDOM
@rtd/aria           (replaces aria-query + dom-accessibility-api) roles, names, states, hidden
@rtd/dom            (replaces jsdom / happy-dom)                nodes, parser, selectors, css, events, window
vitest-environment-rtd                                          installs @rtd/dom as globals
@rtd/native         scriptc-compiled accelerators + scriptc compatibility gate
bench/              benchmarks vs jsdom and happy-dom
```

The upper layers are allowed (and expected) to reach into `@rtd/dom/internal` instead of
going through the public DOM API. That is the point of consolidating: `getByRole` walks
`NodeImpl` records, computes roles with an integer `switch`, and asks the CSS layer
"is this element display:none?" through a direct function with a per-node cache, instead of
calling `querySelectorAll('*')` + `getComputedStyle()` per element through generic APIs.

The DOM must ALSO be good enough that the stock `@testing-library/*` packages run on it
unmodified (people will swap only the environment first). `bench/` runs both stacks.

## Why not "everything native" (scriptc)?

Measured on this machine (Node 26.12, scriptc 0.4.2), calling a scriptc-compiled library
through Node-API costs ~14 ns per call vs ~4 ns for a JS call, string arguments/results are
copied and UTF-8 transcoded on every crossing, and compiled code was not faster than V8's
JIT on DOM-shaped work (tree walk ≈ equal; HTML tokenizing 4.5 ms native vs 3.8 ms JS on
2.5 MB, including marshaling). React touches the DOM through millions of tiny calls
(`createElement`, `setAttribute`, `appendChild`, property reads), and every node must be a JS
object anyway (React stores fibers/props as expando properties on it). Putting the node store
behind a native boundary therefore makes the hot path slower; the author's earlier
scriptc-native DOM (`~/gh/vibedom`) reached rough parity with happy-dom for that reason.

So: the node graph lives in V8, written to be as fast as V8 allows. scriptc is used where it
can actually win and kept available everywhere else:

- Pure algorithmic modules (HTML tokenizer, CSS tokenizer/parser, selector parser, entity
  decoding) are written in the scriptc-compilable subset of TypeScript and marked
  `// @scriptc-compatible` at the top. `pnpm scriptc:check` (owned by `@rtd/native`) compiles
  them with scriptc so they never drift out of the subset.
- `@rtd/native` builds them as a scriptc library + Node-API shim and benchmarks native vs JS
  per module. A module switches to native only when the benchmark shows a win (cold start
  included). Results are recorded in `packages/native/RESULTS.md`.

## The node layer (`packages/dom/src/nodes`)

### NodeImpl: one hidden class for every node

Every public node wrapper (`HTMLDivElement`, `Text`, `Document`, ...) owns exactly one
`NodeImpl` in `node[$impl]`. `NodeImpl` (nodes/NodeImpl.ts) is a single class whose constructor
initializes every field, so all nodes share one V8 hidden class. Wrappers have many
prototypes and therefore many hidden classes; walking fields on wrappers goes megamorphic
(measured ~3x slower on a 30-class tree). All hot internal algorithms walk `NodeImpl`.

| field | meaning |
| --- | --- |
| `node` | public wrapper |
| `type` | nodeType |
| `doc` | node document (`Document` wrapper; a Document points to itself) |
| `parent first last prev next` | tree links (doubly linked children list) |
| `childCount` | number of children |
| `flags` | `F_*` bits (constants.ts): connected, HTML-ness, which wrapper hooks exist, ... |
| `tag` | integer id of a known HTML local name (`tags.ts`), 0 otherwise |
| `name` | element local name / doctype name / PI target / attr local name |
| `ns`, `prefix` | element namespace and prefix |
| `attrs` | `AttrRecord[]` in attribute-list order, or null |
| `data` | CharacterData data / Attr value |
| `id` | mirrored id attribute ("" if none) — feeds the id index and `#id` matching |
| `classes` | cached class tokens (null = recompute) |
| `cache` | `NodeCache` or null — per-node caches for aria/css (nodes/cache.ts) |

Rules: never add fields outside the constructor; never change a field's value kind; put
non-hot, type-specific state on the wrapper (e.g. input value lives on `HTMLInputElement`).
New hot fields need an entry in this table.

### Wrappers

Wrapper internal fields are keyed by registered symbols from `src/keys.ts` (`this[$impl]`,
`this[$listeners]`, `doc[$version]`, ...; re-exported by `@rtd/dom/internal`), never by
`_`-prefixed strings: `Object.keys(node)`, `for...in` and `JSON.stringify` must see no internals
(Jest's diff/--json walk own enumerable keys). Methods may keep `_name` (prototype members are
not enumerable). New wrapper fields get a key in keys.ts.

Memory rules for per-node state (every rendered element pays them):
- Rarely used per-wrapper objects (`childNodes`, `children`, `shadowRoot`, `style`, `classList`,
  `dataset`, `attributes`, the listener map) are `declare`d fields added on first use, never
  initialized in constructors: an initialized-to-null field costs every node a slot. Reads treat
  "absent" like null (`== null`, `??=`).
- Attribute lists are exact-size arrays created with `new Array(n)` (one elements kind, no
  `push` slack) and `AttrRecord` holds only `localName`, `value` and a `rare` slot for
  namespace/prefix/`Attr` node; hot loops read `rare === null` directly.

`EventTarget → Node → Element → HTMLElement → HTML*Element`, `CharacterData → Text/Comment`,
`Document`, `DocumentFragment → ShadowRoot`, `DocumentType`, `Attr`. Wrapper fields are
initialized in constructors in a fixed order. Interface mixins (ParentNode, ChildNode, ...)
are implemented once in `nodes/mixins.ts` and installed on prototypes.

Interface objects are module-level singletons shared by all windows (no per-window class
copies; that is most of jsdom's/happy-dom's startup). Constructors that need the "current
global" (`new Text()`, `new Event()`, `new Image()`) use `window/current.ts`.

### Mutation algorithms (`nodes/tree.ts`, `nodes/attributes.ts`, `nodes/CharacterData.ts`)

All tree, attribute and character-data mutations go through these functions. They own the
bookkeeping:

- `F_CONNECTED` on every node of a subtree inserted into / removed from a connected parent;
- the document id index (`Document._ids`, `_idAdd/_idRemove/_idLookup`);
- focus fixup (`Document._focused` cleared when the focused element is disconnected);
- mutation records via `observers/queue.ts` — only when `activeObservers > 0`;
- element hooks, called only when the corresponding flag is set on the element:
  `F_CONNECT_HOOK` → `_connectedSteps/_disconnectedSteps`, `F_ATTR_HOOK` →
  `_attributeChangedSteps`, `F_CHILDREN_HOOK` → `_childrenChangedSteps`; `_cloningSteps`
  always runs on clone;
- `Document._version++` on every mutation. Caches anywhere (live collections, selector
  results, roles, names, computed style) are stamped with the version they were computed at.
  `Document._styleVersion++` when style sheets change.

Parser / clone fast paths build detached trees with `appendDetached` and
`appendAttributeDetached` (no records, hooks or version bumps). The parser must call
`_childrenChangedSteps()` itself on elements with `F_CHILDREN_HOOK` after finishing their
children (e.g. `<option>`, `<textarea>`, `<style>`), and connected hooks run when the
finished fragment is inserted.

### Iteration helpers (`nodes/traverse.ts`)

Allocation-free preorder iteration: `for (let n = root.first; n !== null; n = nextInTree(n, root))`.

## Subsystem contracts

| area | directory | entry points other areas call |
| --- | --- | --- |
| html parser | `dom/src/parser` | `parseFragment(html, contextImpl) → fragmentImpl`, `parseDocument(html, doc)` |
| serializer | `dom/src/serializer` | `serializeChildren(impl)`, `serializeNode(impl)` |
| selectors | `dom/src/selectors` | `querySelector(rootImpl, sel)`, `querySelectorAll(rootImpl, sel) → NodeList`, `matches(elImpl, sel)`, `closest(elImpl, sel)`, plus an internal compiled-matcher API for css |
| css | `dom/src/css` | `CSSStyleDeclaration` (inline style; `_attributeChanged(value)` hook), `getComputedStyle`, and in `css/internal.ts` fast per-property reads for aria/user-event/jest-dom: `computedValue(elImpl, property, pseudo?)`, `isDisplayNone(elImpl)`, `isVisibilityHidden(elImpl)`, `pointerEventsNone(elImpl)`, `hasAuthorStyles(doc)` |
| events | `dom/src/events` | `EventTarget`, `Event` + subclasses, `dispatch(target, event)` with activation behavior; `_getTheParent` propagation hook |
| html elements | `dom/src/html` | element classes + `registry.ts` (installs `setElementClassLookup`), forms, focus (`focus(elImpl)`, `blur`, `Document._focused`), constraint validation |
| window | `dom/src/window` | `createWindow(options)`, `Window` global with interface objects, timers, location, etc.; `installGlobals/uninstallGlobals` used by the environments |
| observers | `dom/src/observers` | `MutationObserver` (+ queue.ts contract), Resize/Intersection observer stubs |
| collections | `dom/src/collections` | `NodeList`, `HTMLCollection`, `DOMTokenList`, `NamedNodeMap`, `DOMStringMap` |
| aria | `packages/aria` | `getRole(el)`, `getImplicitRole`, `computeAccessibleName(el)`, `computeAccessibleDescription(el)`, `isInaccessible(el)`, `isSubtreeInaccessible`, `getRoles(container)`, state helpers (`checked`, `selected`, `pressed`, `expanded`, `current`, `level`, `value*`, `busy`) |
| testing-library | `packages/testing-library` | the `@testing-library/dom` API |

## Performance invariants (enforced in review and by bench/)

1. No per-call allocation in hot read paths (attribute reads, traversal, matching).
2. Lazy everything: `childNodes`, `classList`, `dataset`, `style`, `attributes`, Attr nodes,
   computed styles, live collections are created on first use.
3. Zero cost when unused: mutation observers, ranges, custom elements, stylesheets.
4. Caches are version-stamped, never eagerly invalidated by walking.
5. Startup: importing `@rtd/dom` and creating a window must stay far below happy-dom
   (target: < 15 ms import from the bundled build, < 1 ms `createWindow`).
6. No `Proxy` on hot paths (indexed access on collections is the main temptation).

## Memory: what may stay reachable (enforced by `tests/compat/test/leaks`)

After `window.close()` (environments call it on teardown) a window, its documents, nodes,
observers, ranges, iframes' nested windows and custom element definitions are collectable, and
`installGlobals()`'s uninstall restores every host global. Within a live document, removing a
subtree releases it: version-stamped caches that could still reference removed nodes (selector
results per root, aria's label index, live collection / computed NodeList snapshots, a form's
listed controls) are kept in `Document[$derived]` or registered with `holdSnapshot`
(nodes/derived.ts) and dropped by `remove()`. Intentionally retained:

- the current window (`window/current.ts`) until it is closed or another window is created;
- a window's own state while it is open (its custom element registry, storage, history);
- host timers created through `window.setTimeout` & co. (they are the host's), until they fire,
  are cleared or the window closes (`close()` clears the ones created through the window's, or
  under jest-environment-rtd / Vitest VM pools the file global's, setTimeout/setInterval);
- process-wide, bounded string caches (compiled selectors ≤ 2048, inline style blocks ≤ 2000,
  media query lists ≤ 500, `pattern` regexps ≤ 256, uppercase tag names ≤ 1024) and per-process
  interface objects;
- the host originals `installGlobals` captured (Node's own classes, not ours).

## Deviations from the specs

Intentional deviations are listed with rationale in `docs/deviations.md` (no layout engine,
no script execution, no navigation, one current window, etc.).

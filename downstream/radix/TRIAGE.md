# Radix Primitives downstream triage

Suite: `radix-ui/primitives` @ `eb3a2b7091293e27df8f9ba906632d8daa3d81a3`, `unit` project, full
suite (`--preset all`, 47 files, 1,143 tests, 9 skipped/todo identically in every mode, retry 0).
Run: 2026-10-23, `--workers 4 --rounds 3` (modes interleaved, medians; wall range in
parentheses), report `results/2026-10-23-all.md`. No test changed status between rounds.

| preset | mode | passed | failed | skipped | wall | peak RSS |
| --- | --- | --: | --: | --: | --: | --: |
| smoke (6 files) | jsdom | 237 | 0 | 4 | 2.1s (2.0–4.1) | 248 MiB |
| | rtd-dom | 233 | 4 | 4 | 1.6s (1.4–2.0) | 227 MiB |
| | rtd-full | 233 | 4 | 4 | 1.8s (1.7–1.9) | 231 MiB |
| interactions (24 files) | jsdom | 767 | 0 | 4 | 6.5s (6.0–7.5) | 277 MiB |
| | rtd-dom | 763 | 4 | 4 | 4.8s (4.7–5.1) | 237 MiB |
| | rtd-full | 763 | 4 | 4 | 4.9s (4.5–5.2) | 273 MiB |
| all (47 files) | jsdom | 1134 | 0 | 9 | 11.3s (10.3–12.9) | 260 MiB |
| | rtd-dom | 1128 | 6 | 9 | 9.1s (8.3–9.1) | 258 MiB |
| | rtd-full | 1128 | 6 | 9 | 8.1s (7.8–8.4) | 242 MiB |

The machine was shared with other heavy agents; RSS is `/usr/bin/time -l` max RSS and moves by
tens of MiB run to run, so treat it as noise at this suite size. rtd-full fails the same
tests as rtd-dom: none of the failures come from our Testing Library packages.

## Clusters (by count)

| # | cluster | owner | rtd-dom | rtd-full | repro |
| --: | --- | --- | --: | --: | --- |
| 1 | `for…in` over `ValidityState` yields `_el`, not its WebIDL attributes | html-forms (convention: dom-core) | 4 | 4 | `repros/html-forms-validitystate-for-in.test.ts` |
| 2 | `HTMLElement.prototype.inert` exists (jsdom 29 has none): the tests assume jsdom | html-elements (decision) | 2 | 2 | `repros/html-elements-inert-jsdom-parity.test.ts` |

### 1. `for…in` over ValidityState (html-forms): 4 tests

- Tests: `packages/react/form/src/form.test.tsx` › "given components used outside `Form.Field`
  (explicit wiring)" › render a `Form.Message` outside `Form.Field` and toggle it; describe the
  control via `aria-describedby`; normalize existing `aria-describedby` ids; expose validity
  through `Form.ValidityState` via `name`.
- Symptom: `Unable to find an element with the text: Please enter your email address.` /
  `toHaveTextContent()` after `fireEvent.invalid(control)`.
- Cause: Radix copies native validity with `for (const key in control.validity)`
  (`validityStateToObject`, `hasBuiltInError` in `form.tsx`). WebIDL attributes are enumerable
  accessors on the interface prototype (https://webidl.spec.whatwg.org/#es-attributes), so jsdom
  yields the 11 attributes. @ctrl/dom's ValidityState has non-enumerable class getters and an
  enumerable own `_el` field, so for…in yields only `_el`; `hasBuiltInError` treats `validity._el`
  (truthy) as a built-in error and the copy has no `valueMissing`.
- Fix (html-forms): make ValidityState's attribute getters enumerable on the prototype and keep
  the element reference non-enumerable (or in a private/symbol slot).
- Broader (dom-core decision): the same shape is everywhere. Measured `for…in` / `Object.keys`
  on fresh objects, jsdom vs @ctrl/dom: `div` 267 vs 165 keys with own `_listeners,_impl,_childNodes,…`;
  `Event` 22 vs 5 with own `_s`; `Range` 32 vs 9 with own `_sc,_so,…`; `DOMRect` own `x,y,…` (jsdom)
  vs `_x,_y,_width,_height`; `CSSStyleDeclaration` own `_owner,_block,…`. Code that spreads or
  `Object.keys`s DOMRect/Event objects (common in tests and in libraries that serialize rects)
  will see different keys. Only ValidityState breaks a Radix test today.

### 2. `inert` IDL attribute exists (html-elements, decision): 2 tests

- Tests: `packages/core/primitive/src/aria-hidden.test.tsx` › "inert › supports in jsdom"
  (`expect(supportsInert()).toBeFalsy()`) and "suppressOthers › shadow dom › Understand the host
  location" (inline snapshot recorded on jsdom expects `aria-hidden="true"`, receives
  `inert="true"`).
- Cause: `supportsInert()` is `HTMLElement.prototype.hasOwnProperty('inert')`; `suppressOthers`
  uses `inert` when supported. @ctrl/dom implements the reflected `inert` attribute
  (https://html.spec.whatwg.org/#dom-inert, `packages/dom/src/html/HTMLElement.ts`); jsdom 29 does
  not. Spec-correct behaviour against a test assumption that only holds on jsdom, same category as Base UI's
  visualViewport cluster.
- Recommendation: keep `inert` (it is spec and drives focus/inertness correctly) and record it in
  `docs/deviations.md` as a known difference from jsdom; the repro then documents the decision.

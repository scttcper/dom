# Compatibility suites

Two kinds of compatibility checks live here. Both are owned by the lead; area agents use them
as acceptance gates and report scenarios they believe are wrong (with a spec link) instead of
editing them.

## 1. DOM differential suite (`test/**`, project `@rtd/compat`)

Every scenario is a function of a window that performs DOM operations and returns plain data.
It runs on **jsdom** (the oracle — its DOM/forms code is generated from WebIDL and checked
against web-platform-tests) and on **@rtd/dom** in the same process, and the normalized
observations must be equal (`src/harness.ts`).

When jsdom is wrong or missing an API, the scenario pins the spec-correct value instead, and
must say why and link the spec:

- `jsdomDeviation: { expected, spec, reason }` — replace jsdom's observation entirely.
- `jsdomFix: { fix, spec, reason }` — transform jsdom's observation (for one wrong detail in a
  large matrix).

Current deviations from jsdom (all follow the HTML Standard and what browsers ship):

| Area | jsdom | Spec / browsers |
| --- | --- | --- |
| range sanitization | no step rounding | rounds to the nearest step within [min, max] |
| HTMLFormElement | no named properties | `form.email`, past names map |
| FormData `_charset_` | submits the input's value | submits the encoding name |
| :valid / :invalid | match barred controls | only candidates for constraint validation |
| checkbox activation `input` event | `composed: false` | `composed: true` |
| reflection | missing `formAction/formMethod/formEnctype`, `input.width/height`, `enterKeyHint`, `form.encoding/autocomplete/rel/relList`, `select.autocomplete`; `inputMode` not limited to known values; `button.type` setter rewrites the attribute | as specified |

Files (`test/forms/`): `input-value` (value modes, sanitization per type, type changes,
valueAs*, stepUp/Down, file inputs), `checkedness` (dirty checkedness, indeterminate, radio
groups), `select-option` (selectedness algorithm, HTMLOptionsCollection, Option(), reset),
`textarea-selection` (raw/API value, selection APIs, setRangeText), `form-owner` (form owner,
form.elements, RadioNodeList, named properties, fieldset disabling, labels), `validation`
(barring, every validity flag, custom validity, invalid events), `form-data` (entry list
construction, submitter, formdata event), `submission-activation` (requestSubmit/submit/reset,
activation behavior, label activation), `pseudo-classes`, `reflection`.

```bash
pnpm vitest run --project @rtd/compat                 # compare @rtd/dom with the oracle
pnpm vitest run --project @rtd/compat -t radio        # one area
COMPAT_ORACLE=1 pnpm vitest run --project @rtd/compat # print jsdom's observations (review new scenarios)
```

`@rtd/dom` is imported lazily: if it fails to load, every test fails with the load error and
oracle mode still works.

## 2. React suite (`react/**`, three projects)

React captures `window`/`document` at import time, so these cannot run as an in-process
differential. Instead the same files run in three Vitest projects with explicit expectations:

| Project | Environment | Testing Library |
| --- | --- | --- |
| `compat:react-jsdom` | jsdom | stock packages — proves every expectation |
| `compat:react-rtd` | `vitest-environment-rtd` | stock packages (DOM swap only) |
| `compat:react-rtd-full` | `vitest-environment-rtd` | `@rtd/react`, `@rtd/testing-library`, `@rtd/user-event`, `@rtd/jest-dom` aliased over `@testing-library/*` |

Tests that jsdom cannot pass because jsdom lacks a spec feature use `specOnly(reason)`, which
skips them only in the jsdom project.

```bash
pnpm vitest run --project compat:react-jsdom
pnpm vitest run --project compat:react-rtd
pnpm vitest run --project compat:react-rtd-full
```

# @ctrl/dom

A pnpm monorepo that reimplements the React Testing Library stack — `@testing-library/react`,
`@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`,
`aria-query`, `dom-accessibility-api` — down to the DOM itself (replacing jsdom/happy-dom),
as one cohesive, fast codebase for testing React components. Read `docs/ARCHITECTURE.md`
before changing anything.

## Priorities (in order)

1. **Faster than jsdom and happy-dom, with less memory.** Strive for plain-V8 speed: stable
   hidden classes, monomorphic hot paths over `NodeImpl`, no allocation in hot reads, lazy
   initialization, version-stamped caches. `render(<C/>)` then `getByRole` should be near
   instant.
2. Drop-in compatible public APIs (same exports, same behavior, same error messages and
   `prettyDOM` output as the upstream packages).
3. Spec compliant where it matters for testing React components. No script execution, no
   layout, no navigation, no network. Deviations go in `docs/deviations.md` with a reason.

## Conventions

- TypeScript, ESM, Node 26+. Only erasable syntax (no `enum`, no parameter properties, no
  `namespace`): Node runs the `.ts` sources directly. Relative imports use `.ts` extensions.
- No `lib.dom` types: we ARE the DOM. Shared WebIDL dictionaries live in `packages/dom/src/webidl.ts`.
- Write ultramodern code (latest ECMAScript / Node APIs), but hot paths use plain `for` loops
  over arrays/linked lists rather than iterator protocols or closures.
- Every algorithm that implements a spec algorithm has a comment linking the exact section
  (e.g. `// https://dom.spec.whatwg.org/#concept-node-insert`), and step numbers where useful.
- A window global or interface member that jsdom 26 or 30 lacks needs an entry in `COMPAT`
  (`packages/dom/src/window/compat.ts`) saying which compat profiles expose it and why;
  `tests/compat/test/surface/` enforces it against the real jsdom, and `pnpm docs:compat`
  regenerates the table in `docs/deviations.md`.

## Tests

- Vitest. Tests live in `packages/<pkg>/test/**/*.test.ts(x)`; run one package with
  `pnpm vitest run --project @rtd/dom` (project names are the workspace package names, `@rtd/<dir>`, which the build renames to `@ctrl/dom/<dir>`).
- **Every spec test file starts with a doc block naming the spec(s) and linking the sections
  under test. `describe` names include the section title and URL; each test name states the
  algorithm step or behavior it pins.** See `packages/dom/test/nodes/tree.test.ts`.
- When porting upstream tests (WPT, testing-library, user-event, jest-dom,
  dom-accessibility-api, aria-query), keep a comment linking the original file and keep the
  original assertions; note any intentional difference inline with the reason.
- Prefer differential tests where an oracle exists: run the same scenario on jsdom (+ stock
  testing-library) and on our stack and compare observable results.
- Debugging a failing React/Testing Library test: rerun just that test with `CTRL_DOM_DEBUG=aria`
  for accessibility snapshots and closest matches instead of HTML dumps (docs/agent-debugging.md).
  Never set it for whole-suite runs: differential tests compare upstream's exact messages.
- Adding or removing a spec link in src or test files changes `docs/spec-coverage.md`: rerun
  `pnpm docs:spec` (tests/compat/test/docs/spec-coverage.test.ts fails when it is stale).

## Benchmarks

Compare only against jsdom and happy-dom (and the stock testing-library packages on them).
Never compare against browsers. Fresh process per sample, report medians and spread, and
always report memory (heap after GC, RSS) next to time. See `bench/README.md`.

## Working alongside other agents (shared working tree)

- Edit only files in the area you own (see the ownership table in your brief /
  `docs/ARCHITECTURE.md`). For changes elsewhere, leave a `TODO(<area>): ...` comment at
  the call site and mention it in your final report — or make the smallest possible edit if
  you are blocked, and report it.
- Never run git commands that change the working tree or index (`stash`, `checkout`,
  `reset`, `clean`, `commit`, `add`). Read-only git is fine.
- Keep the tree importable and `pnpm typecheck` clean after every edit; other agents are
  running tests against your files right now.
- Only add dependencies to your own package's `package.json`, and only when necessary.

## Reference material on this machine

`~/gh/jsdom`, `~/gh/testing-library-dom`, `~/gh/dom-accessibility-api`, `~/gh/domSelector`,
`~/gh/jest-dom`, `~/gh/dom-bench`, `~/gh/jsdom-startup`, `~/gh/webidl2js`, and
`~/gh/vibedom` (the author's earlier native DOM — its `docs/` and `bench/README.md`
record what did and did not pay off). Installed packages (`happy-dom`,
`@testing-library/*`, `aria-query`, `dom-accessibility-api`, `jsdom`) are in `node_modules`.
Other upstream repos (e.g. user-event, WPT) may be cloned into a scratch directory outside the
repo. Upstream projects are MIT/Apache-2.0: keep attribution comments on ported code.

## Commands

```bash
pnpm test                               # all packages
pnpm vitest run --project @rtd/dom      # one package
pnpm typecheck                          # tsc -b over everything
pnpm bench                              # benchmarks (bench/)
pnpm bench:compare --base ../base --head .  # regression check between two clean checkouts
pnpm docs:compat                        # regenerate the compat profile table in docs/deviations.md
pnpm docs:spec                          # regenerate docs/spec-coverage.md (spec sections vs tests)
node downstream/track.ts                # latest downstream runs vs downstream/baseline.json
```

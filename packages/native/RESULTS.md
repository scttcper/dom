# scriptc native vs V8 — measurements

Machine: Apple Silicon, Node 26.12.1, scriptc 0.4.2. Native = `scriptc build --lib` static
archive linked into a Node-API addon (`clang -bundle -undefined dynamic_lookup`), C shim in
`spike/addon.c`. JS = the same TypeScript source run by Node directly.

## Initial spike (2026-10-22, `spike/`)

| Workload | Native (Node-API) | JS (V8) |
| --- | ---: | ---: |
| Empty call `noop(x)` | ~14 ns/call | ~4 ns/call |
| Build 200k nodes (createElement + 2× setAttribute + appendChild, string args) | 34–46 ms | 22–25 ms |
| 200k `getAttribute` (string result) | 9–10 ms | 3–4 ms |
| 20× recursive count-by-tag over 200k nodes (one call each) | 15–17 ms | 16–22 ms |
| Tokenize 2.5 MB of HTML (one call, string marshaled) | 4.5–4.7 ms | 3.8–4.3 ms |
| Cold process, 300 nodes + queries (first run, no JIT warmup) | ~340 µs | ~410 µs |
| Memory for 500k nodes | +168 MB RSS | +355 MB RSS (+241 MB heap) |
| Addon load (warm) | ~1.1 ms (first load after build ~150 ms: code signing) | — |

Conclusions:

- Per-call boundary cost and string transcoding make fine-grained DOM operations slower
  through Node-API; React's hot path is exactly that. The node graph stays in V8.
- Compiled code ran at roughly V8-JIT speed on DOM-shaped work, slightly faster cold.
- Native memory per node was about half of the naive JS layout, which mostly argues for a
  leaner JS layout (see `NodeImpl`), not for moving nodes out of the heap.
- Candidates worth re-measuring per module: big-string parsers (HTML, CSS) where one call
  does lots of work, and cold-start-dominated code.

Also: `scriptc coverage` reports react + react-dom (server) 98% statically compilable (61%
in the dynamic tier, 222 deferred sites). Compiling whole test files natively is not a viable
product path (compile time per file, deferred sites), but is noted for future exploration.

## Per-module native vs JS (2026-10-22, `scripts/bench.ts`)

Apple M4 Max, Node 26.12.1, scriptc 0.4.2 (`release`; `speed` measured within ±5%, not used).
Same source both ways: `src/lib/rtd.ts` wraps the real modules from `packages/dom`
(`parser/tokenizer.ts`, `parser/entities.ts`, `css/tokenizer.ts`, `selectors/parser.ts`), built
by `scripts/build.ts` into `dist/rtd-native.node` (1.5 MB) and imported as TS for JS. Results are
checked identical across implementations. 5 fresh processes per cell, impls interleaved; median
[min–max]. **warm** = median of 15–20 iterations after 5 warmups. **cold** = first iteration in a
fresh process (no JIT warmup); "incl. module load" adds the addon dlopen+init (~1.4 ms) or the JS
module import (~10 ms of TS type stripping for the four modules — in practice paid anyway, since
`@rtd/dom` imports them). The native side calls the scriptc collector after every iteration.

| op | mode | JS ms | native ms | native/JS | incl. module load JS / native |
| --- | --- | ---: | ---: | ---: | ---: |
| noop ×1M (boundary only) | warm | 0.30 [0.29–0.41] | 12.4 [12.1–12.7] | 40.8× | |
| html-large (2.5 MB, checksum) | warm | 17.9 [17.7–21.2] | 23.0 [22.6–29.1] | 1.29× | |
| html-large | cold | 26.6 [26.1–29.1] | 24.9 [24.0–26.6] | 0.94× | 37.7 / 27.1 |
| html-fragment ×200 (18 KB each) | warm | 24.9 [24.4–25.3] | 33.6 [32.8–42.6] | 1.35× | |
| html-fragment ×200 | cold | 34.9 [34.0–48.8] | 33.3 [33.0–34.7] | 0.96× | 44.4 / 34.7 |
| html-tokens-large (native: serialize + JS decode; JS: pull) | warm | 14.0 [13.7–14.8] | 46.6 [46.1–148] | 3.33× | |
| html-tokens-large | cold | 22.7 [22.1–23.5] | 54.9 [52.2–56.2] | 2.42× | 33.1 / 56.2 |
| css-large (600 KB) | warm | 3.73 [3.56–4.18] | 4.07 [3.97–4.53] | 1.09× | |
| css-large | cold | 7.14 [7.07–9.41] | 4.24 [4.14–6.97] | 0.59× | 17.2 / 5.56 |
| css-inline ×10k (style attrs) | warm | 1.89 [1.81–2.13] | 2.75 [2.68–2.87] | 1.45× | |
| css-inline ×10k | cold | 5.12 [5.01–7.08] | 3.02 [2.90–3.04] | 0.59× | 15.6 / 4.34 |
| selector parse ×10k | warm | 3.49 [3.41–5.00] | 8.29 [7.93–9.76] | 2.37× | |
| selector parse ×10k | cold | 10.6 [10.0–45.6] | 8.45 [8.26–8.76] | 0.79× | 21.3 / 9.90 |
| selector batch (10k in one call) | warm | 4.02 [3.87–5.67] | 8.07 [7.77–8.60] | 2.01× | |
| entity decode, attr values ×100k | warm | 7.59 [7.48–8.28] | 25.7 [25.5–28.7] | 3.39× | |
| entity decode, attr values ×100k | cold | 11.6 [11.1–12.5] | 26.4 [26.3–26.9] | 2.28× | 21.3 / 27.8 |
| entity decode, 1 MB text | warm | 2.13 [2.06–3.18] | 6.33 [6.15–6.37] | 2.97× | |
| entity decode, 1 MB text | cold | 4.47 [4.38–4.76] | 7.04 [6.98–7.55] | 1.58× | 14.5 / 8.44 |

Memory: native processes end ~10–20 MB lower in RSS on the checksum ops (no JS token strings),
but the serialized token stream costs +150 MB RSS on the 2.5 MB document.

Findings:

- **Warm, JS wins everywhere** (1.1–3.4×). Even batched work that never crosses the boundary
  per item (selector batch, 1 MB entity decode) is 2–3× slower natively: string-heavy code
  (`slice`, concatenation, `indexOf`) is where V8's string representation (ropes, slices,
  one-byte strings) beats scriptc's UTF-8 runtime strings.
- **Cold, native wins only on the compute-only checksums** (CSS 0.6×, selector 0.75×, HTML
  0.94×) — that is V8 running the first iteration in the interpreter/baseline tiers. A real
  caller needs the result as JS values; the one realistic end-to-end path measured (HTML tokens
  materialized for a JS tree builder) is 2.4× slower cold and 3.3× warm.
- Per-call cost is ~12 ns (vs ~0.3 ns for an inlined JS call), so many small calls (style
  attributes, selectors from `querySelector`, attribute values) cannot win.
- **Recommendation: no module switches to native.** The only measurable win is a cold parse of
  a large stylesheet (~3 ms once per test file that injects hundreds of KB of CSS), which does
  not justify shipping per-platform binaries (first load after build/install ~117 ms for code
  signing on macOS). Keep the modules in the scriptc subset (`pnpm scriptc:check`) so this can
  be re-measured as scriptc's string runtime improves; re-run with `node scripts/bench.ts`.

### Context: what the JS parser already does

The parser owner's measurements (packages/dom parser report) of full `innerHTML` (tokenize +
tree build + insert) on the JS implementation: 250-row table **0.74 ms** vs jsdom 8.11 /
happy-dom 5.96 ms; 40-field form **0.18 ms** vs 1.50 / 2.05 ms. `bench/` measures the same
order of magnitude end to end (`dom/innerhtml-250`: 0.31 ms vs jsdom 2.36 / happy-dom 0.98).
At these sizes tokenizing is a fraction of a millisecond per call, so a native tokenizer could
save at most tens of microseconds per `innerHTML` — less than the boundary + materialization
cost measured above.

## scriptc contracts (`@scriptc/types`), 2026-10-24

Tried on the CSS tokenizer (`packages/dom/src/css/tokenizer.ts`), the module where native came
closest. Same bench as above, `css-large` (600 KB), 7 fresh processes per cell, median [min–max];
two other agents were running on the machine, so JS moved by a few percent between runs.

| variant | JS warm | native warm | native cold |
| --- | ---: | ---: | ---: |
| no contracts (baseline) | 3.70–3.77 | 4.55 [4.52–4.64] | 4.79 [4.62–5.09] |
| `NoThrow<boolean>` on the 8 character-class helpers | 4.08 | 4.79 [4.64–4.95] | 5.04 [4.80–5.90] |
| + `Int32` on `len`/`pos`/`type`/`start`/`end` and the `TK_*` constants (writes need `\| 0`) | 3.86–4.00 | 6.28–6.58 | 6.68–6.73 |

- `NoThrow` changes nothing measurable: the helpers are leaf predicates scriptc already inlines.
- `Int32` makes native ~40% slower. Positions flow into and out of doubles everywhere
  (`charCodeAt` indices, `indexOf` results, `slice` bounds, comparisons with `len`), so the int32
  slots add conversions instead of removing them. Proving every write also needs `(x + 1) | 0`
  noise at ~130 sites in this file alone.
- `pnpm scriptc:check` (scripts/check.ts) compiled the annotated module cleanly: it does not
  verify contracts. Only the library build (`pnpm --filter @rtd/native build`) reports SC7002.
  If contracts are ever adopted, the gate has to run the library build.
- Not applicable here: `ProgramLifetime` (rejected for library builds), `Acyclic` (the tokenizers
  allocate no object graphs), `Immutable` on the entity table (data is built once per process
  either way, and V8 owns it on the JS path we ship).

- `Immutable<string[]>` on the HTML tokenizer's literal name tables (`TAG_NAMES` in tags.ts,
  `ATTR_NAMES` in tokenizer.ts, read on every start/end tag and known attribute): built as a
  separate addon from a copy of the tokenizer chain, interleaved with an unannotated copy, 9 fresh
  processes each, median [min–max], identical checksums:

  | variant | addon load | cold 2.5 MB | warm 2.5 MB | 200 × 18 KB fragments | RSS |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | plain | 1.36 [1.24–3.58] | 22.6 [22.0–25.2] | 20.97 [20.76–21.51] | 30.7 [30.1–31.8] | 104.4 MB |
  | `Immutable` | 1.36 [1.27–3.65] | 22.8 [21.9–24.3] | 20.96 [20.82–21.82] | 30.4 [29.9–31.4] | 104.4 MB |

  No difference: two tables of a few hundred strings are not where the time goes.

**Recommendation: no contracts.** The modules stay in the plain scriptc subset.

## Other scriptc options checked (2026-10-24)

- **Profile-guided optimization:** not available for this addon. `scriptc build --lib` rejects
  `--profile-use` / `--profile-generate` ("the profile pins the emission and optimization"), and
  `--profile-generate` only instruments Linux executables.
- **Worker threads** (`@scriptc/threads`, `publish`) and **`@scriptc/experimental`**
  (`LifetimeRegion`, `InternTable`, `ThreadSlots`): native threads and pointer-shared graphs exist
  only in scriptc executables; under Node they fall back to `worker_threads` with cloned messages,
  and `ProgramLifetime` (what `LifetimeRegion` frees) is rejected in library builds. The DOM runs
  synchronously inside V8 in test workers, so neither applies.
- **Native program objects** (`--emit=obj`): an object file defining `main` for linking a whole
  program into another native build; the `--lib` static archive this addon links is already the
  right artifact.
- **`--target-cpu`:** x86-64 only; `--optimization=speed` was measured above (within ±5%).
- **`wasm32-wasi` library** (a portable reactor instead of per-platform binaries): measured on
  scriptc 0.4.4 below; slower than both JS and native.

## scriptc 0.4.4 and the wasm32-wasi reactor (2026-10-24)

Apple M4 Max, Node 26.12.1, zig 0.17.0. `node scripts/bench.ts --samples 5 --impls js,native,wasm`:
5 fresh processes per cell, implementations rotated per sample, median [min–max] in ms. All three
return identical results on every op (including non-ASCII entity values).

**0.4.2 → 0.4.4, native only** (same session, same machine, interleaved with JS): selector parsing
gets ~10% faster (`selector-x10k` warm 8.13 → 7.20, `selector-batch-10k` 7.89 → 7.00), 1 MB of
entity text 5% (4.13 → 3.93); everything else is unchanged within noise. JS still wins every warm
case.

**wasm** (`node scripts/build.ts --target wasm32-wasi` → `dist/rtd.wasm`, 448 KB vs the 1.5 MB
addon; `src/wasm.ts` instantiates it with the four WASI calls it imports and copies strings in as
UTF-8 through one reusable `scriptc_alloc` buffer):

| op | mode | JS | native | wasm | native/JS | wasm/JS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| noop ×1M (boundary only) | warm | 0.29 | 12.3 | 4.59 | 42.8× | 15.9× |
| html-large (2.5 MB) | warm | 17.5 | 21.9 | 25.6 | 1.25× | 1.46× |
| html-large | cold | 25.9 | 23.4 | 38.5 | 0.91× | 1.49× |
| html-fragment ×200 | warm | 24.8 | 31.4 | 37.0 | 1.27× | 1.49× |
| html-tokens-large (decoded by JS) | warm | 13.8 | 46.3 | 50.2 | 3.35× | 3.63× |
| css-large (600 KB) | warm | 3.57 | 4.30 | 5.43 | 1.21× | 1.52× |
| css-large | cold | 7.29 | 4.51 | 9.15 | 0.62× | 1.25× |
| css-inline ×10k | warm | 1.87 | 3.00 | 3.91 | 1.61× | 2.09× |
| selector parse ×10k | warm | 3.49 | 7.20 | 11.2 | 2.06× | 3.21× |
| selector parse ×10k | cold | 10.3 | 7.52 | 18.4 | 0.73× | 1.79× |
| entity decode, attr values ×100k | warm | 5.92 | 17.4 | 35.2 | 2.94× | 5.94× |
| entity decode, 1 MB text | warm | 1.56 | 3.93 | 3.95 | 2.51× | 2.52× |

Load: JS module import 10.2 ms, addon dlopen + init 1.36 ms, wasm compile + instantiate 4.28 ms.

- A call into wasm is cheaper than a Node-API call (4.6 ns vs 12.3 ns per no-op), but copying every
  string into linear memory as UTF-8 and the slower code wasm32 gets cost more than that saves.
- Wasm also loses the cold wins native had (CSS, selectors), and its RSS sits between JS and native.
- **Recommendation unchanged: JS.** The target, loader and three-way bench stay so this can be
  re-measured on new scriptc releases; the runtime pack (~28 MB) is not a dependency. To re-run:
  install zig, `pnpm --filter @rtd/native add -D @scriptc/runtime-wasm32-wasi@<scriptc version>`,
  `node scripts/build.ts --target wasm32-wasi`, `node scripts/build.ts`, then
  `node scripts/bench.ts --impls js,native,wasm`.

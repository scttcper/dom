/**
 * WPT selector conformance files run through a minimal testharness shim.
 *
 * Specs:
 *   Selectors 4 — https://drafts.csswg.org/selectors-4/
 *   DOM §4.2.6 querySelector(All) — https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall
 *   DOM §4.9 matches()/closest() — https://dom.spec.whatwg.org/#dom-element-matches
 *   HTML §4.16.3 pseudo-classes — https://html.spec.whatwg.org/#pseudo-classes
 *
 * The files under ./wpt/tree are copied verbatim from web-platform-tests (revision
 * 89adb92b23d5b0dd9bf8263181783bfde74b2f6d; BSD-3-Clause,
 * https://github.com/web-platform-tests/wpt/blob/master/LICENSE.md), mirroring their WPT paths:
 *   https://github.com/web-platform-tests/wpt/tree/master/dom/nodes  (ParentNode-querySelector*, Element-closest*, ...)
 *   https://github.com/web-platform-tests/wpt/tree/master/css/selectors  (testharness tests that need no layout)
 *
 * Each page's markup becomes the document of a fresh window (URL http://web-platform.test/<path>),
 * then its inline scripts run (concatenated, in order) against that window with a testharness
 * shim. Scripts do NOT run during parsing (no script execution in this DOM), so tests that rely
 * on parse-time scripts are listed in EXPECTED_FAILURES with the reason.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createWindow } from "@rtd/dom";

const ROOT = fileURLToPath(new URL("./wpt/tree/", import.meta.url));

/**
 * Known failures: "<file>" (whole file) or "<file> :: <test name>", each with the reason.
 * Keep this list short and justified (see docs/deviations.md for DOM-wide deviations).
 */
const NO_PARSE_SCRIPTS = "relies on scripts running during parsing (no script execution)";
const NO_LAYOUT = "needs layout (offsetHeight); there is no layout engine";
const EXPECTED_FAILURES = new Map<string, string>([
  ["css/selectors/child-indexed-during-parse.html :: :first-child against an element still being parsed", NO_PARSE_SCRIPTS],
  ["css/selectors/child-indexed-during-parse.html :: :first-of-type against an element still being parsed", NO_PARSE_SCRIPTS],
  ["css/selectors/child-indexed-during-parse.html :: :nth-child(1) against an element still being parsed", NO_PARSE_SCRIPTS],
  ["css/selectors/child-indexed-during-parse.html :: :nth-of-type(1) against an element still being parsed", NO_PARSE_SCRIPTS],
  ["css/selectors/selectors-case-sensitive-001.html :: CSS selector should match for Unicode uppercase element", NO_LAYOUT],
  ["css/selectors/selectors-case-sensitive-001.html :: Elements with namespace should work the same way", NO_LAYOUT],
  ["css/selectors/focus-within-focus-move.html :: test 1", "needs an inline onblur= event handler attribute to run (no script execution)"],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(relative(ROOT, p));
  }
  return out;
}

interface Result {
  name: string;
  error: unknown;
  run: (() => Promise<void>) | null;
}

class AssertionError extends Error {
  override name = "AssertionError";
}

function fmt(v: unknown): string {
  try {
    return typeof v === "string" ? JSON.stringify(v) : String(v);
  } catch {
    return "<value>";
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b) || (a === 0 && b === 0 && Object.is(a, b));
  return a === b;
}

function makeHarness(results: Result[], singleTest: { on: boolean }) {
  const fail = (msg: string, desc?: string): never => {
    throw new AssertionError(desc ? `${desc}: ${msg}` : msg);
  };
  const h = {
    setup: (opts?: { single_test?: boolean }) => {
      if (opts?.single_test) singleTest.on = true;
    },
    done: () => {},
    add_completion_callback: () => {},
    format_value: fmt,
    test(fn: () => void, name?: string) {
      const r: Result = { name: name ?? `test ${results.length + 1}`, error: null, run: null };
      const cleanups: (() => void)[] = [];
      const t = { step_func: (f: (...a: unknown[]) => unknown) => f, add_cleanup: (f: () => void) => cleanups.push(f), name: r.name };
      try {
        (fn as (t: unknown) => void).call(t, t);
      } catch (e) {
        r.error = e;
      }
      for (const c of cleanups) {
        try {
          c();
        } catch {}
      }
      results.push(r);
    },
    promise_test(fn: () => Promise<void>, name?: string) {
      const t = { add_cleanup: () => {}, step_func: (f: (...a: unknown[]) => unknown) => f };
      results.push({ name: name ?? `promise_test ${results.length + 1}`, error: null, run: () => (fn as (t: unknown) => Promise<void>).call(t, t) });
    },
    async_test(fnOrName?: unknown, maybeName?: string) {
      const name = typeof fnOrName === "string" ? fnOrName : (maybeName ?? `async_test ${results.length + 1}`);
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const p = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const t = {
        step: (f: () => void) => {
          try {
            f();
          } catch (e) {
            reject(e);
          }
        },
        step_func: (f: (...a: unknown[]) => unknown) => (...a: unknown[]) => {
          try {
            return f.apply(t, a);
          } catch (e) {
            reject(e);
          }
        },
        step_func_done: (f?: (...a: unknown[]) => unknown) => (...a: unknown[]) => {
          try {
            f?.apply(t, a);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        step_timeout: (f: () => void, ms: number) => setTimeout(() => t.step(f), ms),
        done: () => resolve(),
        add_cleanup: () => {},
        unreached_func: (msg: string) => () => reject(new AssertionError(msg)),
      };
      if (typeof fnOrName === "function") t.step(() => (fnOrName as (this: unknown, t: unknown) => void).call(t, t));
      results.push({ name, error: null, run: () => Promise.race([p, new Promise<void>((_, rej) => setTimeout(() => rej(new AssertionError("async_test timed out")), 2000))]) });
      return t;
    },
    assert_equals(a: unknown, b: unknown, d?: string) {
      if (!sameValue(a, b)) fail(`expected ${fmt(b)} but got ${fmt(a)}`, d);
    },
    assert_not_equals(a: unknown, b: unknown, d?: string) {
      if (sameValue(a, b)) fail(`got disallowed value ${fmt(a)}`, d);
    },
    assert_true(a: unknown, d?: string) {
      if (a !== true) fail(`expected true got ${fmt(a)}`, d);
    },
    assert_false(a: unknown, d?: string) {
      if (a !== false) fail(`expected false got ${fmt(a)}`, d);
    },
    assert_in_array(a: unknown, arr: unknown[], d?: string) {
      if (!arr.includes(a)) fail(`${fmt(a)} not in array`, d);
    },
    assert_array_equals(a: ArrayLike<unknown>, b: ArrayLike<unknown>, d?: string) {
      if (a.length !== b.length) fail(`lengths differ: ${a.length} vs ${b.length}`, d);
      for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) fail(`index ${i}: expected ${fmt(b[i])} got ${fmt(a[i])}`, d);
    },
    assert_greater_than(a: number, b: number, d?: string) {
      if (!(a > b)) fail(`${a} not > ${b}`, d);
    },
    assert_unreached(d?: string) {
      fail("reached unreachable code", d);
    },
    assert_throws_dom(code: string | number, ctorOrFn: unknown, maybeFn?: () => void, d?: string) {
      const fn = (typeof maybeFn === "function" ? maybeFn : ctorOrFn) as () => void;
      const names: Record<number, string> = { 12: "SyntaxError", 8: "NotFoundError", 3: "HierarchyRequestError", 5: "InvalidCharacterError" };
      const want = typeof code === "number" ? names[code] : code === "SYNTAX_ERR" ? "SyntaxError" : code;
      try {
        fn();
      } catch (e) {
        if ((e as { name?: string }).name !== want) fail(`expected ${want} got ${(e as Error).name}: ${(e as Error).message}`, d);
        return;
      }
      fail(`expected ${want} to be thrown`, d);
    },
    assert_throws_js(ctor: { name: string }, fn: () => void, d?: string) {
      try {
        fn();
      } catch (e) {
        if ((e as Error).name !== ctor.name) fail(`expected ${ctor.name} got ${(e as Error).name}`, d);
        return;
      }
      fail(`expected ${ctor.name} to be thrown`, d);
    },
  };
  return h;
}

function scriptsOf(html: string, file: string): string {
  let code = "";
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(m[1] ?? "")?.[1];
    if (src !== undefined) {
      if (src.includes("testharness")) continue;
      const path = src.startsWith("/") ? join(ROOT, src) : join(ROOT, dirname(file), src);
      code += readFileSync(path, "utf8") + "\n;\n";
    } else {
      code += m[2] + "\n;\n";
    }
  }
  return code;
}

function runFile(file: string): Result[] {
  const html = readFileSync(join(ROOT, file), "utf8");
  const results: Result[] = [];
  const singleTest = { on: false };
  const harness = makeHarness(results, singleTest);
  const window = createWindow({ url: `http://web-platform.test/${file}`, html }) as unknown as Record<string, unknown>;
  // Global scope of the page's scripts: the harness, then the Window (interfaces, document, ...),
  // then named access (https://html.spec.whatwg.org/#named-access-on-the-window-object).
  // Anything else (Array, JSON, ...) falls through to the real global.
  const doc = window.document as { getElementById(id: string): unknown };
  const h = harness as unknown as Record<string, unknown>;
  const scope = new Proxy(Object.create(null) as Record<string | symbol, unknown>, {
    has(_t, k) {
      if (typeof k !== "string") return false;
      if (k in h || k === "window" || k === "self" || k === "document") return true;
      if (k in Object.prototype) return false;
      if (k in window) return true;
      return !(k in globalThis) && doc.getElementById(k) !== null;
    },
    get(_t, k) {
      if (typeof k !== "string") return undefined;
      if (k in h) return h[k];
      if (k === "window" || k === "self") return window;
      if (k in window) {
        const v = window[k];
        return typeof v === "function" && /^[a-z]/.test(k) ? (v as (...a: unknown[]) => unknown).bind(window) : v;
      }
      return doc.getElementById(k) ?? undefined;
    },
    set(_t, k, v) {
      (window as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  });
  const code = scriptsOf(html, file);
  try {
    // Sloppy-mode `with` so the scope proxy acts as the global object ("use strict" inside is inert).
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("__scope", `with (__scope) {\n${code}\n}`)(scope);
  } catch (e) {
    if (singleTest.on) results.push({ name: "single test", error: e, run: null });
    else results.push({ name: "<page script>", error: e, run: null });
  }
  if (singleTest.on && results.length === 0) results.push({ name: "single test", error: null, run: null });
  // The page has finished loading: DOMContentLoaded, then load.
  try {
    const w = window as unknown as { document: EventTarget; dispatchEvent(e: unknown): void; Event: new (t: string) => unknown };
    w.document.dispatchEvent(new w.Event("DOMContentLoaded") as Event);
    w.dispatchEvent(new w.Event("load"));
  } catch (e) {
    results.push({ name: "<load event>", error: e, run: null });
  }
  return results;
}

describe("WPT selector files — https://drafts.csswg.org/selectors-4/", () => {
  for (const file of walk(ROOT)) {
    describe(`${file} — https://github.com/web-platform-tests/wpt/blob/master/${file}`, () => {
      const fileReason = EXPECTED_FAILURES.get(file);
      let results: Result[];
      try {
        results = runFile(file);
      } catch (e) {
        results = [{ name: "<setup>", error: e, run: null }];
      }
      if (results.length === 0) results.push({ name: "<no tests>", error: new Error("page declared no tests"), run: null });
      const seen = new Map<string, number>();
      for (const r of results) {
        const n = seen.get(r.name) ?? 0;
        seen.set(r.name, n + 1);
        const name = n === 0 ? r.name : `${r.name} (${n + 1})`;
        const reason = fileReason ?? EXPECTED_FAILURES.get(`${file} :: ${name}`);
        const body = async () => {
          if (r.error) throw r.error;
          if (r.run) await r.run();
        };
        if (reason !== undefined) {
          test.fails(`${name} [expected failure: ${reason}]`, body);
        } else {
          test(name, body);
        }
      }
    });
  }
});

test("the WPT tree is present", () => {
  expect(walk(ROOT).length).toBeGreaterThan(50);
});

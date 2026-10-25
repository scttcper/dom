// Minimal testharness.js stand-in for running Web Platform Tests .html files against @ctrl/dom
// inside vitest. Inline scripts are evaluated (test-only) with the window's properties in
// scope. Implements the subset of https://web-platform-tests.org/writing-tests/testharness-api.html
// the ported css/cssom files use.

import { createWindow } from "@ctrl/dom";
import { setComputedColorMode } from "@ctrl/dom/internal";

export interface SubtestResult {
  name: string;
  status: "pass" | "fail";
  message: string;
}

class AssertionError extends Error {}

function fmt(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" && Object.is(v, -0)) return "-0";
  try {
    return String(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b) || (a === b && a !== 0);
  return a === b;
}

function makeAsserts() {
  const fail = (msg: string, description?: string): never => {
    throw new AssertionError(description ? `${description}: ${msg}` : msg);
  };
  const asserts = {
    assert_equals(actual: unknown, expected: unknown, description?: string) {
      if (!same(actual, expected)) fail(`expected ${fmt(expected)} but got ${fmt(actual)}`, description);
    },
    assert_not_equals(actual: unknown, expected: unknown, description?: string) {
      if (same(actual, expected)) fail(`got disallowed value ${fmt(actual)}`, description);
    },
    assert_true(actual: unknown, description?: string) {
      if (actual !== true) fail(`expected true got ${fmt(actual)}`, description);
    },
    assert_false(actual: unknown, description?: string) {
      if (actual !== false) fail(`expected false got ${fmt(actual)}`, description);
    },
    assert_in_array(actual: unknown, expected: unknown[], description?: string) {
      if (!expected.some((e) => same(e, actual))) fail(`value ${fmt(actual)} not in array ${expected.map(fmt).join(",")}`, description);
    },
    assert_array_equals(actual: ArrayLike<unknown>, expected: ArrayLike<unknown>, description?: string) {
      if (actual === null || actual === undefined || actual.length !== expected.length) fail(`lengths differ: ${fmt(actual?.length)} vs ${expected.length}`, description);
      for (let i = 0; i < expected.length; i++) if (!same(actual[i], expected[i])) fail(`index ${i}: expected ${fmt(expected[i])} got ${fmt(actual[i])}`, description);
    },
    assert_approx_equals(actual: number, expected: number, epsilon: number, description?: string) {
      if (Math.abs(actual - expected) > epsilon) fail(`expected ${expected} +/- ${epsilon} got ${actual}`, description);
    },
    assert_greater_than(a: number, b: number, d?: string) {
      if (!(a > b)) fail(`expected ${a} > ${b}`, d);
    },
    assert_less_than(a: number, b: number, d?: string) {
      if (!(a < b)) fail(`expected ${a} < ${b}`, d);
    },
    assert_regexp_match(actual: string, re: RegExp, d?: string) {
      if (!re.test(actual)) fail(`${fmt(actual)} does not match ${re}`, d);
    },
    assert_class_string(obj: unknown, cls: string, d?: string) {
      const s = Object.prototype.toString.call(obj);
      if (s !== `[object ${cls}]`) fail(`expected [object ${cls}] got ${s}`, d);
    },
    assert_own_property(obj: object, prop: string, d?: string) {
      if (!Object.hasOwn(obj, prop)) fail(`expected own property ${prop}`, d);
    },
    assert_inherits(obj: object, prop: string, d?: string) {
      if (Object.hasOwn(obj, prop) || !(prop in obj)) fail(`expected inherited property ${prop}`, d);
    },
    assert_idl_attribute(obj: object, prop: string, d?: string) {
      if (!(prop in obj)) fail(`expected attribute ${prop}`, d);
    },
    assert_readonly(obj: Record<string, unknown>, prop: string, d?: string) {
      const before = obj[prop];
      try {
        obj[prop] = "changed-value";
      } catch {}
      if (obj[prop] !== before) fail(`property ${prop} is not readonly`, d);
    },
    assert_unreached(d?: string) {
      fail("reached unreachable code", d);
    },
    assert_throws_dom(type: string | number, fn: () => void, d?: string) {
      let threw = false;
      try {
        fn();
      } catch (e) {
        threw = true;
        const name = (e as { name?: string }).name;
        const codeNames: Record<number, string> = { 1: "IndexSizeError", 3: "HierarchyRequestError", 7: "NoModificationAllowedError", 8: "NotFoundError", 11: "InvalidStateError", 12: "SyntaxError", 13: "InvalidModificationError", 14: "NamespaceError" };
        const want = typeof type === "number" ? codeNames[type] : type;
        if (name !== want) fail(`expected DOMException ${want} got ${name}: ${(e as Error).message}`, d);
      }
      if (!threw) fail(`expected ${type} to be thrown`, d);
    },
    assert_throws_js(ctor: { name: string }, fn: () => void, d?: string) {
      let threw = false;
      try {
        fn();
      } catch (e) {
        threw = true;
        if ((e as Error).name !== ctor.name) fail(`expected ${ctor.name} got ${(e as Error).name}: ${(e as Error).message}`, d);
      }
      if (!threw) fail(`expected ${ctor.name} to be thrown`, d);
    },
    assert_any(assertFn: (...a: unknown[]) => void, actual: unknown, expected: unknown[], ...rest: unknown[]) {
      for (const e of expected) {
        try {
          assertFn(actual, e, ...rest);
          return;
        } catch {}
      }
      fail(`no expected value matched ${fmt(actual)}`);
    },
  };
  return asserts;
}

function scriptsOf(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    out.push(m[2]);
  }
  return out;
}

/** Runs a WPT file; returns subtest results (promise tests awaited). */
export async function runWPT(html: string): Promise<SubtestResult[]> {
  // WPT asserts spec behavior: resolved colors are rgb() (the default compat mode keeps the
  // author's serialization, see docs/deviations.md).
  setComputedColorMode("rgb");
  try {
    return await runWPTInner(html);
  } finally {
    setComputedColorMode("specified");
  }
}

async function runWPTInner(html: string): Promise<SubtestResult[]> {
  const window = createWindow({ html, url: "http://web-platform.test/css/cssom/test.html", cssComputedColors: "rgb" } as Parameters<typeof createWindow>[0]);
  const results: SubtestResult[] = [];
  const pending: Promise<void>[] = [];
  const asserts = makeAsserts();
  const record = (name: string, e: unknown): void => {
    results.push({ name, status: e === undefined ? "pass" : "fail", message: e === undefined ? "" : String((e as Error)?.message ?? e) });
  };
  const makeT = (name: string) => {
    const cleanups: (() => void)[] = [];
    const t = {
      name,
      step(fn: () => void) {
        return fn.call(t);
      },
      step_func(fn: (...a: unknown[]) => unknown) {
        return (...a: unknown[]) => fn.apply(t, a);
      },
      step_func_done(fn?: (...a: unknown[]) => unknown) {
        return (...a: unknown[]) => fn?.apply(t, a);
      },
      unreached_func(msg: string) {
        return () => asserts.assert_unreached(msg);
      },
      add_cleanup(fn: () => void) {
        cleanups.push(fn);
      },
      done() {},
      _cleanup() {
        for (const c of cleanups) c();
      },
    };
    return t;
  };
  let counter = 0;
  const api = {
    ...asserts,
    test(fn: (t: unknown) => void, name?: string) {
      const n = name ?? `test ${++counter}`;
      const t = makeT(n);
      try {
        fn.call(t, t);
        record(n, undefined);
      } catch (e) {
        record(n, e);
      } finally {
        t._cleanup();
      }
    },
    promise_test(fn: (t: unknown) => Promise<unknown>, name?: string) {
      const n = name ?? `test ${++counter}`;
      const t = makeT(n);
      const prev = pending.length === 0 ? Promise.resolve() : pending[pending.length - 1];
      pending.push(
        prev.then(async () => {
          try {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error("promise_test timed out")), 2000);
            });
            try {
              await Promise.race([fn.call(t, t), timeout]);
            } finally {
              clearTimeout(timer);
            }
            record(n, undefined);
          } catch (e) {
            record(n, e);
          } finally {
            t._cleanup();
          }
        }),
      );
    },
    async_test(fn: unknown, name?: string) {
      const n = typeof fn === "string" ? fn : (name ?? `test ${++counter}`);
      const t = makeT(n);
      if (typeof fn === "function") {
        try {
          fn.call(t, t);
          record(n, undefined);
        } catch (e) {
          record(n, e);
        }
      }
      return t;
    },
    setup(fn?: unknown) {
      if (typeof fn === "function") fn();
    },
    done() {},
    add_completion_callback() {},
    format_value: fmt,
  };
  const names = Object.keys(api);
  const code = scriptsOf(html).join("\n;\n");
  // Sloppy-mode `with` puts the window's properties (document, getComputedStyle, CSS...) in scope.
  const fn = new Function("window", ...names, `with (window) {\n${code}\n}`);
  try {
    fn(window, ...names.map((k) => (api as Record<string, unknown>)[k]));
  } catch (e) {
    results.push({ name: "(harness: script error)", status: "fail", message: String((e as Error)?.stack ?? e) });
  }
  await Promise.all(pending);
  return results;
}

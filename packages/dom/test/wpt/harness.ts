/**
 * Minimal testharness.js shim for running vendored web-platform-tests files under vitest.
 *
 * Spec of the harness API: https://web-platform-tests.org/writing-tests/testharness-api.html
 * Upstream: https://github.com/web-platform-tests/wpt/blob/master/resources/testharness.js
 * (BSD-3-Clause, W3C). This is a re-implementation of the subset our DOM tests use, not a copy.
 *
 * How it works: `runWPT(file)` reads a vendored `.html` test from test/wpt/fixtures, builds a
 * fresh @rtd/dom window, materializes the test's markup (parsed with parse5 — independent of our
 * own parser, which has its own tests), concatenates every inline/local `<script>` into ONE
 * sloppy-mode function evaluated `with` a scope object (window, document, interface objects,
 * harness functions), runs it, waits for async tests, and returns one result per WPT subtest.
 * `defineWPT(file)` registers one vitest test per WPT subtest, keeping the WPT subtest names and
 * the original assertions. Known failures are listed per file with a reason.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script, createContext } from "node:vm";
import { describe, test as vitestTest, expect } from "vitest";
import * as dom from "@rtd/dom";
import { $mode } from "../../src/keys.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** Vendored fixtures; `WPT_ROOT=<wpt checkout>` points surveys at a full upstream checkout instead. */
export const FIXTURES = process.env.WPT_ROOT ?? join(here, "fixtures");

const requireFromJsdom = createRequire(createRequire(import.meta.url).resolve("jsdom"));
const parse5 = requireFromJsdom("parse5") as {
  parse(html: string, opts?: object): P5Node;
};

interface P5Node {
  nodeName: string;
  tagName?: string;
  value?: string;
  data?: string;
  attrs?: { name: string; value: string; namespace?: string; prefix?: string }[];
  namespaceURI?: string;
  childNodes?: P5Node[];
  content?: P5Node;
  name?: string;
  publicId?: string;
  systemId?: string;
}

export interface SubtestResult {
  name: string;
  status: "PASS" | "FAIL" | "TIMEOUT" | "NOTRUN";
  message: string;
}

const DOM_CODES: Record<string, number> = {
  IndexSizeError: 1,
  HierarchyRequestError: 3,
  WrongDocumentError: 4,
  InvalidCharacterError: 5,
  NoModificationAllowedError: 7,
  NotFoundError: 8,
  NotSupportedError: 9,
  InUseAttributeError: 10,
  InvalidStateError: 11,
  SyntaxError: 12,
  InvalidModificationError: 13,
  NamespaceError: 14,
  InvalidAccessError: 15,
  TypeMismatchError: 17,
  SecurityError: 18,
  NetworkError: 19,
  AbortError: 20,
  URLMismatchError: 21,
  QuotaExceededError: 22,
  TimeoutError: 23,
  InvalidNodeTypeError: 24,
  DataCloneError: 25,
  EncodingError: 0,
  NotReadableError: 0,
  UnknownError: 0,
  ConstraintError: 0,
  DataError: 0,
  TransactionInactiveError: 0,
  ReadOnlyError: 0,
  VersionError: 0,
  OperationError: 0,
  NotAllowedError: 0,
};
const CODE_NAMES: Record<number, string> = {};
for (const [k, v] of Object.entries(DOM_CODES)) if (v !== 0 && !(v in CODE_NAMES)) CODE_NAMES[v] = k;
const LEGACY_CONSTANTS: Record<string, string> = {
  INDEX_SIZE_ERR: "IndexSizeError",
  HIERARCHY_REQUEST_ERR: "HierarchyRequestError",
  WRONG_DOCUMENT_ERR: "WrongDocumentError",
  INVALID_CHARACTER_ERR: "InvalidCharacterError",
  NO_MODIFICATION_ALLOWED_ERR: "NoModificationAllowedError",
  NOT_FOUND_ERR: "NotFoundError",
  NOT_SUPPORTED_ERR: "NotSupportedError",
  INUSE_ATTRIBUTE_ERR: "InUseAttributeError",
  INVALID_STATE_ERR: "InvalidStateError",
  SYNTAX_ERR: "SyntaxError",
  INVALID_MODIFICATION_ERR: "InvalidModificationError",
  NAMESPACE_ERR: "NamespaceError",
  INVALID_ACCESS_ERR: "InvalidAccessError",
  INVALID_NODE_TYPE_ERR: "InvalidNodeTypeError",
};

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === null || v === undefined || typeof v !== "object") {
    if (Object.is(v, -0)) return "-0";
    return String(v);
  }
  if (Array.isArray(v)) return "[" + v.map(formatValue).join(", ") + "]";
  const n = v as { nodeType?: number; nodeName?: string; constructor?: { name?: string } };
  if (typeof n.nodeType === "number") return `${n.constructor?.name ?? "Node"} node ${n.nodeName}`;
  try {
    return String(v);
  } catch {
    return "[object]";
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    if (a !== a && b !== b) return true;
    if (a === 0 && b === 0) return Object.is(a, b);
  }
  return a === b;
}

interface Test {
  name: string;
  status: SubtestResult["status"];
  message: string;
  done: boolean;
  cleanups: (() => void)[];
  resolve: () => void;
  promise: Promise<void>;
}

/** Build the harness functions bound to one run. */
function createHarness(results: Test[], pending: Promise<void>[]) {
  let current: Test | null = null;
  let explicitDone = false;
  let completionCallbacks: ((tests: unknown[], status: unknown) => void)[] = [];

  function newTest(name: string): Test {
    let resolveFn!: () => void;
    const promise = new Promise<void>((r) => (resolveFn = r));
    const t: Test = { name, status: "NOTRUN", message: "", done: false, cleanups: [], resolve: resolveFn, promise };
    results.push(t);
    return t;
  }

  function finish(t: Test, status: SubtestResult["status"], message = ""): void {
    if (t.done) return;
    t.done = true;
    if (t.status === "NOTRUN" || t.status === "PASS") {
      t.status = status;
      t.message = message;
    }
    for (const c of t.cleanups) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    t.resolve();
  }

  function fail(t: Test, e: unknown): void {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    t.status = "FAIL";
    t.message = msg;
    finish(t, "FAIL", msg);
  }

  function makeTestObject(t: Test) {
    const obj = {
      name: t.name,
      get phase() {
        return t.done ? 4 : 1;
      },
      step(fn: (...args: unknown[]) => unknown, thisObj?: unknown, ...args: unknown[]) {
        if (t.done) return undefined;
        const prev = current;
        current = t;
        try {
          return fn.apply(thisObj ?? obj, args);
        } catch (e) {
          fail(t, e);
          return undefined;
        } finally {
          current = prev;
        }
      },
      step_func(fn: (...args: unknown[]) => unknown, thisObj?: unknown) {
        return (...args: unknown[]) => obj.step(fn, thisObj, ...args);
      },
      step_func_done(fn?: (...args: unknown[]) => unknown, thisObj?: unknown) {
        return (...args: unknown[]) => {
          if (fn) obj.step(fn, thisObj, ...args);
          obj.done();
        };
      },
      unreached_func(desc?: string) {
        return obj.step_func(() => {
          throw new AssertionError("assert_unreached: " + (desc ?? "reached unreachable code"));
        });
      },
      step_timeout(fn: () => void, ms: number) {
        return setTimeout(obj.step_func(fn), ms);
      },
      add_cleanup(fn: () => void) {
        t.cleanups.push(fn);
      },
      done() {
        finish(t, "PASS");
      },
      force_timeout() {
        finish(t, "TIMEOUT", "forced timeout");
      },
      set_status(_s: number, _m: string) {},
    };
    return obj;
  }

  function test(fn: (t: unknown) => void, name?: string) {
    const t = newTest(name ?? "(unnamed test)");
    const obj = makeTestObject(t);
    obj.step(fn as (...a: unknown[]) => unknown, obj, obj);
    if (!t.done) finish(t, "PASS");
  }

  function async_test(fn?: ((t: unknown) => void) | string, name?: string) {
    if (typeof fn === "string") {
      name = fn;
      fn = undefined;
    }
    const t = newTest(name ?? "(unnamed async test)");
    const obj = makeTestObject(t);
    pending.push(t.promise);
    if (typeof fn === "function") obj.step(fn as (...a: unknown[]) => unknown, obj, obj);
    return obj;
  }

  let promiseChain = Promise.resolve();
  function promise_test(fn: (t: unknown) => Promise<unknown>, name?: string) {
    const t = newTest(name ?? "(unnamed promise test)");
    const obj = makeTestObject(t);
    pending.push(t.promise);
    promiseChain = promiseChain.then(async () => {
      try {
        await fn(obj);
        finish(t, "PASS");
      } catch (e) {
        fail(t, e);
      }
    });
  }

  function assert(cond: boolean, fn: string, desc: string | undefined, msg: string): void {
    if (!cond) throw new AssertionError(`${fn}: ${desc ? desc + " " : ""}${msg}`);
  }

  function checkDOMException(e: unknown, type: string | number, desc?: string): void {
    assert(typeof e === "object" && e !== null, "assert_throws_dom", desc, `${formatValue(e)} is not an object`);
    let name: string;
    if (typeof type === "number") name = CODE_NAMES[type];
    else name = LEGACY_CONSTANTS[type] ?? type;
    const err = e as { name: string; code: number; constructor: unknown };
    assert(err.name === name, "assert_throws_dom", desc, `expected ${name} but got ${err.name} (${(e as Error).message})`);
    assert(err.code === (DOM_CODES[name] ?? 0), "assert_throws_dom", desc, `code ${err.code} !== ${DOM_CODES[name]}`);
    assert(e instanceof DOMException, "assert_throws_dom", desc, "not a DOMException");
  }

  const asserts = {
    assert_true(actual: unknown, desc?: string) {
      assert(actual === true, "assert_true", desc, `expected true got ${formatValue(actual)}`);
    },
    assert_false(actual: unknown, desc?: string) {
      assert(actual === false, "assert_false", desc, `expected false got ${formatValue(actual)}`);
    },
    assert_equals(actual: unknown, expected: unknown, desc?: string) {
      assert(sameValue(actual, expected), "assert_equals", desc, `expected ${formatValue(expected)} but got ${formatValue(actual)}`);
    },
    assert_not_equals(actual: unknown, expected: unknown, desc?: string) {
      assert(!sameValue(actual, expected), "assert_not_equals", desc, `got disallowed value ${formatValue(actual)}`);
    },
    assert_in_array(actual: unknown, expected: unknown[], desc?: string) {
      assert(expected.includes(actual), "assert_in_array", desc, `value ${formatValue(actual)} not in array ${formatValue(expected)}`);
    },
    assert_array_equals(actual: ArrayLike<unknown>, expected: ArrayLike<unknown>, desc?: string) {
      assert(typeof actual === "object" && actual !== null && "length" in actual, "assert_array_equals", desc, `value is ${formatValue(actual)}, expected array`);
      assert(actual.length === expected.length, "assert_array_equals", desc, `lengths differ, expected ${expected.length} got ${actual.length}`);
      for (let i = 0; i < actual.length; i++) {
        assert(sameValue(actual[i], expected[i]), "assert_array_equals", desc, `expected ${formatValue(expected[i])} but got ${formatValue(actual[i])} at index ${i}`);
      }
    },
    assert_object_equals(actual: Record<string, unknown>, expected: Record<string, unknown>, desc?: string) {
      expect(actual, desc).toStrictEqual(expected);
    },
    assert_approx_equals(actual: number, expected: number, epsilon: number, desc?: string) {
      assert(Math.abs(actual - expected) <= epsilon, "assert_approx_equals", desc, `expected ${expected} +/- ${epsilon} but got ${actual}`);
    },
    assert_less_than(actual: number, expected: number, desc?: string) {
      assert(actual < expected, "assert_less_than", desc, `expected a number less than ${expected} but got ${actual}`);
    },
    assert_greater_than(actual: number, expected: number, desc?: string) {
      assert(actual > expected, "assert_greater_than", desc, `expected a number greater than ${expected} but got ${actual}`);
    },
    assert_less_than_equal(actual: number, expected: number, desc?: string) {
      assert(actual <= expected, "assert_less_than_equal", desc, `expected <= ${expected} but got ${actual}`);
    },
    assert_greater_than_equal(actual: number, expected: number, desc?: string) {
      assert(actual >= expected, "assert_greater_than_equal", desc, `expected >= ${expected} but got ${actual}`);
    },
    assert_regexp_match(actual: string, expected: RegExp, desc?: string) {
      assert(expected.test(actual), "assert_regexp_match", desc, `expected ${expected} but got ${formatValue(actual)}`);
    },
    assert_class_string(object: unknown, className: string, desc?: string) {
      const actual = Object.prototype.toString.call(object);
      assert(actual === `[object ${className}]`, "assert_class_string", desc, `expected [object ${className}] but got ${actual}`);
    },
    assert_own_property(object: object, name: PropertyKey, desc?: string) {
      assert(Object.prototype.hasOwnProperty.call(object, name), "assert_own_property", desc, `expected property ${String(name)} missing`);
    },
    assert_not_own_property(object: object, name: PropertyKey, desc?: string) {
      assert(!Object.prototype.hasOwnProperty.call(object, name), "assert_not_own_property", desc, `unexpected property ${String(name)} is found on object`);
    },
    assert_inherits(object: object, name: PropertyKey, desc?: string) {
      assert(!Object.prototype.hasOwnProperty.call(object, name) && name in object, "assert_inherits", desc, `property ${String(name)} not inherited`);
    },
    assert_idl_attribute(object: object, name: PropertyKey, desc?: string) {
      assert(!Object.prototype.hasOwnProperty.call(object, name) && name in object, "assert_idl_attribute", desc, `property ${String(name)} not found on prototype chain`);
    },
    assert_readonly(object: Record<PropertyKey, unknown>, name: PropertyKey, desc?: string) {
      const initial = object[name];
      try {
        object[name] = initial + "a";
      } catch {
        /* strict-mode TypeError is fine */
      }
      assert(sameValue(object[name], initial), "assert_readonly", desc, `changing property ${String(name)} succeeded`);
    },
    assert_unreached(desc?: string) {
      throw new AssertionError("assert_unreached: " + (desc ?? "reached unreachable code"));
    },
    assert_throws_dom(type: string | number, funcOrCtor: unknown, funcOrDesc?: unknown, maybeDesc?: string) {
      const func = (typeof funcOrCtor === "function" && typeof funcOrDesc === "function" ? funcOrDesc : funcOrCtor) as () => void;
      const desc = (typeof funcOrDesc === "string" ? funcOrDesc : maybeDesc) as string | undefined;
      try {
        func.call(null);
      } catch (e) {
        checkDOMException(e, type, desc);
        return;
      }
      assert(false, "assert_throws_dom", desc, `${func} did not throw`);
    },
    assert_throws_js(ctor: new (...a: unknown[]) => Error, func: () => void, desc?: string) {
      try {
        func.call(null);
      } catch (e) {
        assert(typeof e === "object" && e !== null, "assert_throws_js", desc, `${formatValue(e)} is not an object`);
        assert((e as Error).name === ctor.name, "assert_throws_js", desc, `expected ${ctor.name} but got ${(e as Error).name}: ${(e as Error).message}`);
        return;
      }
      assert(false, "assert_throws_js", desc, `${func} did not throw`);
    },
    assert_throws_exactly(value: unknown, func: () => void, desc?: string) {
      try {
        func.call(null);
      } catch (e) {
        assert(sameValue(e, value), "assert_throws_exactly", desc, `expected ${formatValue(value)} but got ${formatValue(e)}`);
        return;
      }
      assert(false, "assert_throws_exactly", desc, `${func} did not throw`);
    },
    async promise_rejects_dom(_t: unknown, type: string, promise: Promise<unknown>, desc?: string) {
      try {
        await promise;
      } catch (e) {
        checkDOMException(e, type, desc);
        return;
      }
      assert(false, "promise_rejects_dom", desc, "promise did not reject");
    },
    async promise_rejects_js(_t: unknown, ctor: { name: string }, promise: Promise<unknown>, desc?: string) {
      try {
        await promise;
      } catch (e) {
        assert((e as Error).name === ctor.name, "promise_rejects_js", desc, `expected ${ctor.name}`);
        return;
      }
      assert(false, "promise_rejects_js", desc, "promise did not reject");
    },
  };

  /**
   * https://web-platform-tests.org/writing-tests/testharness-api.html#eventwatcher — re-implemented
   * from testharness.js: resolves `wait_for(types)` with the event (or every event with
   * `{record: "all"}`) and fails the test on any event out of the expected order.
   */
  type StepTest = { step_func: (fn: (...a: never[]) => unknown) => (...a: unknown[]) => unknown; add_cleanup: (fn: () => void) => void };
  function EventWatcher(this: Record<string, unknown>, t: StepTest, node: dom.EventTarget, eventTypes: string | string[], timeoutPromise?: () => Promise<unknown>) {
    const types = typeof eventTypes === "string" ? [eventTypes] : eventTypes;
    let waitingFor: { types: string[]; resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null;
    let recorded: dom.Event[] | null = null;
    const handler = t.step_func((evt: dom.Event) => {
      asserts.assert_true(waitingFor !== null, `Not expecting event, but got ${evt.type} event`);
      asserts.assert_equals(evt.type, waitingFor!.types[0], `Expected ${waitingFor!.types[0]} event, but got ${evt.type} event instead`);
      recorded?.push(evt);
      if (waitingFor!.types.length > 1) {
        waitingFor!.types.shift();
        return;
      }
      const { resolve } = waitingFor!;
      waitingFor = null;
      const result = recorded ?? evt;
      recorded = null;
      resolve(result);
    }) as unknown as (e: dom.Event) => void;
    for (const type of types) node.addEventListener(type, handler);
    this.wait_for = (want: string | string[], options?: { record?: string }) => {
      if (waitingFor !== null) return Promise.reject(new Error("Already waiting for an event or events"));
      const list = typeof want === "string" ? [want] : [...want];
      recorded = options?.record === "all" ? [] : null;
      return new Promise((resolve, reject) => {
        timeoutPromise?.().then(() => {
          if (waitingFor?.resolve === resolve) {
            waitingFor = null;
            reject(new Error(`Timed out waiting for ${list.join(", ")}`));
          }
        });
        waitingFor = { types: list, resolve, reject };
      });
    };
    this.stop_watching = () => {
      for (const type of types) node.removeEventListener(type, handler);
    };
    t.add_cleanup(this.stop_watching as () => void);
  }

  return {
    ...asserts,
    EventWatcher,
    test,
    async_test,
    promise_test,
    setup(fnOrOptions?: unknown, maybeOptions?: { explicit_done?: boolean }) {
      const options = (typeof fnOrOptions === "object" ? fnOrOptions : maybeOptions) as { explicit_done?: boolean } | undefined;
      if (options?.explicit_done) explicitDone = true;
      if (typeof fnOrOptions === "function") fnOrOptions();
    },
    done() {
      explicitDone = false;
    },
    generate_tests(fn: (...args: unknown[]) => void, cases: unknown[][], _props?: unknown) {
      for (const c of cases) {
        const [name, ...args] = c;
        test(() => fn(...args), String(name));
      }
    },
    step_timeout(fn: () => void, ms: number) {
      return setTimeout(fn, ms);
    },
    format_value: formatValue,
    add_completion_callback(fn: (tests: unknown[], status: unknown) => void) {
      completionCallbacks.push(fn);
    },
    add_result_callback() {},
    add_start_callback() {},
    get _explicitDone() {
      return explicitDone;
    },
    _runCompletion() {
      const cbs = completionCallbacks;
      completionCallbacks = [];
      for (const cb of cbs) cb(results, { status: 0 });
    },
  };
}

/** Materialize parse5 nodes into our DOM, as children of `parent`. */
function build(doc: dom.Document, parent: dom.Node, nodes: P5Node[], skipScripts: boolean): void {
  for (const n of nodes) {
    if (n.nodeName === "#text") parent.appendChild(doc.createTextNode(n.value ?? ""));
    else if (n.nodeName === "#comment") parent.appendChild(doc.createComment(n.data ?? ""));
    else if (n.nodeName === "#documentType") parent.appendChild(doc.implementation.createDocumentType(n.name ?? "html", n.publicId ?? "", n.systemId ?? ""));
    else if (n.tagName !== undefined) {
      if (skipScripts && n.tagName === "script") continue;
      const el = doc.createElementNS(n.namespaceURI ?? "http://www.w3.org/1999/xhtml", n.tagName);
      for (const a of n.attrs ?? []) {
        if (a.namespace) el.setAttributeNS(a.namespace, a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value);
        else el.setAttribute(a.name, a.value);
      }
      parent.appendChild(el);
      if (n.content !== undefined) {
        const content = (el as unknown as { content?: dom.Node }).content;
        build(doc, content ?? el, n.content.childNodes ?? [], skipScripts);
      } else {
        build(doc, el, n.childNodes ?? [], skipScripts);
      }
    }
  }
}

function findAll(n: P5Node, tag: string, out: P5Node[] = []): P5Node[] {
  if (n.tagName === tag) out.push(n);
  for (const c of n.childNodes ?? []) findAll(c, tag, out);
  if (n.content) findAll(n.content, tag, out);
  return out;
}

function textOf(n: P5Node): string {
  return (n.childNodes ?? []).map((c) => c.value ?? "").join("");
}

export interface RunOptions {
  /** Extra source evaluated before the test scripts (e.g. polyfills for missing pieces). */
  prelude?: string;
  /**
   * `test_driver` (https://web-platform-tests.org/writing-tests/testdriver.html) for tests that
   * use it, e.g. one backed by @rtd/aria (`get_computed_role`/`get_computed_label`) or
   * @rtd/user-event (`click`, `send_keys`). Without one, every call rejects.
   */
  testdriver?: (window: dom.Window, document: dom.Document) => Record<string, unknown>;
  /** Milliseconds to wait for async tests. */
  timeout?: number;
}

interface LoadedDocument {
  window: dom.Window;
  windowProxy: object;
  doc: dom.Document;
  sandbox: Record<string, unknown>;
  errors: string[];
}

/**
 * Load a fixture into a fresh window + vm context and run its scripts. `harness` (null for
 * iframe documents) supplies the testharness functions.
 */
function loadDocument(fileWithQuery: string, harness: Record<string, unknown> | null, prelude?: string, testdriver?: RunOptions["testdriver"]): LoadedDocument {
  const file = fileWithQuery.replace(/[?#].*$/, "");
  const path = join(FIXTURES, file);
  const html = JS_TEST.test(file) ? jsTestPage(path) : readFileSync(path, "utf8");
  const tree = parse5.parse(html);
  const window = dom.createWindow({ url: "http://web-platform.test:8000/" + fileWithQuery });
  const doc = window.document as dom.Document;
  // Replace the default document content with the test's markup.
  for (let c = doc.firstChild; c !== null; c = doc.firstChild) doc.removeChild(c);
  const mode = (tree as unknown as { mode?: string }).mode;
  if (mode === "quirks" || mode === "limited-quirks") (doc as unknown as { [$mode]: string })[$mode] = mode;
  build(doc, doc, tree.childNodes ?? [], false);

  const sources: string[] = [];
  if (prelude) sources.push(prelude);
  for (const s of findAll(tree, "script")) {
    const src = s.attrs?.find((a) => a.name === "src")?.value;
    if (src === undefined) {
      sources.push(textOf(s));
    } else if (!src.startsWith("/resources/testharness") && !src.startsWith("/resources/testdriver") && !/\.py(\?|$)/.test(src)) {
      const resolved = src.startsWith("/") ? join(FIXTURES, src) : resolve(dirname(path), src);
      sources.push(readFileSync(resolved, "utf8"));
    }
  }

  // Browsers run test scripts as classic scripts in the window's global scope (top-level
  // `var`/`let` are globals, `[...].map(eval)` sees them). Each document gets a fresh vm
  // context whose global object carries the window, document, interface objects, harness
  // functions and timers; `window` itself is a proxy that falls back to that global (so
  // `window.foo` sees script globals; identity with document.defaultView is lost).
  const sandbox: Record<string, unknown> = {};
  const windowProxy = new Proxy(window as object, {
    get(t, k) {
      if (k in t) {
        const v = Reflect.get(t, k, t);
        return typeof v === "function" && typeof k === "string" && !/^[A-Z]/.test(k) ? (v as () => unknown).bind(t) : v;
      }
      return sandbox[k as string];
    },
    set(t, k, v) {
      if (k in t) return Reflect.set(t, k, v, t);
      sandbox[k as string] = v;
      return true;
    },
    has(t, k) {
      return k in t || k in sandbox;
    },
  });
  for (const [k, v] of Object.entries(dom)) sandbox[k] = v;
  for (let o: object | null = window; o !== null && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) {
      if (k === "constructor" || k in sandbox) continue;
      try {
        const v = (window as unknown as Record<string, unknown>)[k];
        sandbox[k] = typeof v === "function" && !/^[A-Z]/.test(k) ? (v as () => unknown).bind(window) : v;
      } catch {
        /* ignore throwing getters */
      }
    }
  }
  if (harness !== null) Object.assign(sandbox, harness);
  sandbox.test_driver = testdriver?.(window, doc) ?? unsupportedTestDriver();
  Object.assign(sandbox, {
    window: windowProxy,
    self: windowProxy,
    globalThis: windowProxy,
    document: doc,
    DOMException,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
  });
  instrumentIframes(doc, file);
  const context = createContext(sandbox);
  const errors: string[] = [];
  dom.setCurrentWindow(window);
  // Each <script> runs as its own classic Script; an exception aborts only that script.
  for (let i = 0; i < sources.length; i++) {
    try {
      new Script(sources[i], { filename: `${file}#script${i}` }).runInContext(context);
    } catch (e) {
      const err = e as Error;
      errors.push(err && typeof err === "object" && "message" in err ? `${err.name}: ${err.message}\n${err.stack}` : String(e));
    }
  }
  // The load event: <body onload> (inline handlers are not compiled by @rtd/dom), a global
  // `onload = fn` assigned by the scripts, and listeners on the window.
  const body = doc.body;
  const inline = body?.getAttribute("onload");
  setTimeout(() => {
    dom.setCurrentWindow(window);
    try {
      if (inline) new Script(inline).runInContext(context);
      if (typeof sandbox.onload === "function") (sandbox.onload as () => void).call(windowProxy);
      (window as unknown as dom.EventTarget).dispatchEvent(new dom.Event("load"));
    } catch (e) {
      errors.push(String((e as Error)?.stack ?? e));
    }
  }, 0);
  return { window, windowProxy, doc, sandbox, errors };
}

/** `.any.js` / `.window.js` tests (https://web-platform-tests.org/writing-tests/testharness.html#tests-for-other-or-multiple-globals). */
export const JS_TEST = /\.(any|window)\.js$/;

/** Whether a `.any.js` test runs in a window global (`// META: global=` defaults to window + dedicatedworker). */
export function jsTestRunsInWindow(source: string): boolean {
  const globals = /^\/\/ META: global=(.*)$/m.exec(source)?.[1];
  return globals === undefined || /\b(window|default)\b/.test(globals);
}

/** The page wptserve generates for a `.any.js`/`.window.js` test: testharness, META scripts, the test. */
function jsTestPage(path: string): string {
  const source = readFileSync(path, "utf8");
  const title = /^\/\/ META: title=(.*)$/m.exec(source)?.[1] ?? "";
  const scripts = [...source.matchAll(/^\/\/ META: script=(.*)$/gm)].map((m) => `<script src="${m[1].trim()}"></script>`);
  const self = path.slice(path.lastIndexOf("/") + 1);
  return `<!doctype html><meta charset=utf-8><title>${title}</title><script src="/resources/testharness.js"></script><script src="/resources/testharnessreport.js"></script>${scripts.join("")}<div id=log></div><script src="${self}"></script>`;
}

/** `test_driver` when the caller supplied none: every action rejects, so those subtests fail instead of hanging. */
function unsupportedTestDriver(): Record<string, unknown> {
  return new Proxy({}, {
    get: (_t, k) => (k === "then" ? undefined : () => Promise.reject(new Error(`test_driver.${String(k)} is not supported here`))),
  });
}

/**
 * Minimal <iframe src> emulation for tests that compare against a reference document in an
 * iframe (Range-test-iframe.html): when an iframe created by the test has a `src` and is
 * connected, the fixture is loaded into its own window/context, `contentWindow` /
 * `contentDocument` are exposed on the element, and `load` fires on it.
 */
function instrumentIframes(doc: dom.Document, file: string): void {
  const create = doc.createElement;
  doc.createElement = function (this: dom.Document, name: string, options?: unknown) {
    const el = create.call(this, name, options as never) as dom.Element & Record<string, unknown>;
    if (String(name).toLowerCase() !== "iframe") return el;
    let loaded: LoadedDocument | null = null;
    let src = "";
    let ours = false;
    // @rtd/dom's own iframe support fires `load` for its about:blank document; only the
    // emulated load of the fixture may reach the test's handlers.
    el.addEventListener(
      "load",
      (e) => {
        if (!ours) e.stopImmediatePropagation();
      },
      true,
    );
    const tryLoad = () => {
      if (src === "" || !el.isConnected || loaded !== null) return;
      const target = join(dirname(file), src.split("#")[0]);
      // Server-side fixtures (redirect.py, ...) don't exist on disk: the frame stays about:blank
      // and no emulated load fires (those subtests are expected failures), instead of throwing
      // an uncaught ENOENT from this timer after the test has finished.
      if (!existsSync(join(FIXTURES, target.replace(/[?#].*$/, "")))) return;
      loaded = loadDocument(target, null);
      setTimeout(() => {
        ours = true;
        el.dispatchEvent(new dom.Event("load"));
        ours = false;
        const handler = el.onload;
        if (typeof handler === "function" && !("onload" in Object.getPrototypeOf(el))) (handler as () => void).call(el);
      }, 5);
    };
    Object.defineProperties(el, {
      src: {
        get: () => src,
        set: (v: string) => {
          src = String(v);
          setTimeout(tryLoad, 0);
        },
        configurable: true,
      },
      contentWindow: { get: () => (loaded === null ? null : loaded.windowProxy), configurable: true },
      contentDocument: { get: () => (loaded === null ? null : loaded.doc), configurable: true },
    });
    return el;
  } as typeof doc.createElement;
}

/** Run one vendored WPT .html file and return its subtest results. */
export async function runWPT(file: string, options: RunOptions = {}): Promise<SubtestResult[]> {
  const results: Test[] = [];
  const pending: Promise<void>[] = [];
  const harness = createHarness(results, pending);
  const loaded = loadDocument(file, harness as unknown as Record<string, unknown>, options.prelude, options.testdriver);
  const fail = (message: string) =>
    results.push({ name: "(harness error)", status: "FAIL", message, done: true, cleanups: [], resolve() {}, promise: Promise.resolve() });
  for (const e of loaded.errors) fail(e);
  const errorCount = loaded.errors.length;
  // Let async tests settle.
  const timeout = options.timeout ?? 2000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await new Promise((r) => setTimeout(r, 0));
  await Promise.race([Promise.all(pending), new Promise<void>((r) => (timer = setTimeout(r, timeout)))]);
  clearTimeout(timer);
  for (const e of loaded.errors.slice(errorCount)) fail(e);
  for (const t of results) {
    if (!t.done) {
      t.status = "TIMEOUT";
      t.done = true;
    }
  }
  harness._runCompletion();
  return results.map((t) => ({ name: t.name, status: t.status, message: t.message }));
}

/** Known-failing subtests per WPT file (regenerate with test/wpt/survey.scratch.ts; duplicate subtest names get a ` (#n)` suffix). */
const AGGREGATE_ABOVE = 150;

/**
 * expectations.json plus one file per area in test/wpt/expectations/*.json (so areas never edit
 * the same file): WPT path → known-failing subtest names.
 */
const EXPECTATIONS: Record<string, string[]> = Object.assign(
  JSON.parse(readFileSync(join(here, "expectations.json"), "utf8")),
  ...(existsSync(join(here, "expectations"))
    ? readdirSync(join(here, "expectations"))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(here, "expectations", f), "utf8")))
    : []),
);

/**
 * Register a vitest suite for one WPT file: one vitest test per WPT subtest, named after the
 * WPT subtest. Subtests listed for the file in expectations.json are registered with
 * `test.fails` and `reason` in the name, so they turn red when they start passing.
 */
export function defineWPT(file: string, reason = "", options: RunOptions = {}): void {
  const known = new Set(EXPECTATIONS[file.replace(/[?#].*$/, "")] ?? []);
  if (known.size !== 0 && reason === "") throw new Error(`defineWPT(${file}): expected failures need a reason`);
  describe(`WPT ${file} (https://github.com/web-platform-tests/wpt/blob/master/${file.replace(/[?#].*$/, "")})`, async () => {
    const results = await runWPT(file, options);
    if (results.length === 0) vitestTest("(file defines no subtests here)", () => {});
    const named: { name: string; r: SubtestResult }[] = [];
    const seen = new Map<string, number>();
    for (const r of results) {
      const count = seen.get(r.name) ?? 0;
      seen.set(r.name, count + 1);
      named.push({ name: count === 0 ? r.name : `${r.name} (#${count + 1})`, r });
    }
    // Generated mega-tests (Range-set has ~11k subtests) would cost more to register as
    // individual vitest tests than to run: aggregate them into one test per file.
    if (named.length > AGGREGATE_ABOVE) {
      vitestTest(`all ${named.length} subtests match expectations (${known.size} known failures${known.size ? ": " + reason : ""})`, () => {
        const unexpected = named.filter(({ name, r }) => (r.status === "PASS") === known.has(name));
        if (unexpected.length !== 0) {
          throw new Error(
            unexpected
              .slice(0, 20)
              .map(({ name, r }) => (r.status === "PASS" ? `unexpected PASS: ${name}` : `${r.status}: ${name}: ${r.message}`))
              .join("\n"),
          );
        }
      });
      return;
    }
    for (const { name, r } of named) {
      if (known.has(name)) {
        vitestTest.fails(`${name} [known failure: ${reason}]`, () => {
          if (r.status !== "PASS") throw new Error(r.message);
        });
      } else {
        vitestTest(name, () => {
          if (r.status !== "PASS") throw new Error(`${r.status}: ${r.message}`);
        });
      }
    }
  });
}

/** Every vendored test file under `dir` (relative to the fixtures root), sorted. */
export function wptFiles(dir: string): string[] {
  return readdirSync(join(FIXTURES, dir))
    .filter((f) => /\.html?$/.test(f) && !/-iframe\.html$|Frame\.htm$/.test(f))
    .sort()
    .map((f) => `${dir}/${f}`);
}

/**
 * Register every file of `dir` except `skip` (file → reason it cannot run here at all), with
 * per-file reasons for known subtest failures.
 */
export function defineWPTDirectory(dir: string, reasons: Record<string, string>, skip: Record<string, string>, filter: (file: string) => boolean = () => true): void {
  for (const file of wptFiles(dir)) {
    const base = file.slice(dir.length + 1);
    if (base in skip || !filter(file)) continue;
    defineWPT(file, reasons[base] ?? "");
  }
}

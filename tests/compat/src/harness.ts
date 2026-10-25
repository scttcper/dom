/**
 * Differential compatibility harness.
 *
 * A scenario is a function of a window that performs DOM operations and returns an
 * "observation" (plain data). Each scenario runs twice — on jsdom, the oracle, and on @ctrl/dom —
 * and the JSON-normalized observations must be equal.
 *
 * jsdom is used as the oracle because its forms, events and DOM implementations are generated
 * from WebIDL and checked against web-platform-tests. Where jsdom itself deviates from the spec
 * (or from what browsers ship), a scenario can pin the spec-correct expectation with
 * `jsdomDeviation`, which REQUIRES a spec link and a reason.
 */
import { JSDOM, VirtualConsole } from "jsdom";

// Loaded lazily so a broken @ctrl/dom (other areas are mid-edit) fails each test with the
// load error instead of failing the whole file, and oracle mode keeps working.
let ctrlDomCreateWindow: ((options?: { url?: string }) => unknown) | null = null;
let ctrlDomLoadError: unknown = null;
try {
  ({ createWindow: ctrlDomCreateWindow } = await import("@ctrl/dom"));
} catch (error) {
  ctrlDomLoadError = error;
}
import { expect, test } from "vitest";

// Both implementations are driven through the same untyped surface.
// biome-ignore lint: deliberate
export type AnyWindow = any;

export type Scenario = (window: AnyWindow) => unknown;

export interface DifferentialOptions {
  /** Markup placed in <body> before the scenario runs. */
  body?: string;
  /**
   * jsdom gets this wrong; compare @ctrl/dom against `expected` instead. `spec` must link the
   * section that defines the behavior.
   */
  jsdomDeviation?: { expected: unknown; spec: string; reason: string };
  /**
   * jsdom is mostly right but wrong in one detail: transform jsdom's (normalized) observation
   * into the spec-correct expectation. `spec` must link the section that defines the behavior.
   */
  jsdomFix?: { fix: (observed: any) => unknown; spec: string; reason: string };
  /** Known @ctrl/dom gap: registered as `test.fails` so the suite stays green and the gap visible. */
  knownGap?: string;
}

export function makeJsdomWindow(body = "", url = "http://localhost/"): AnyWindow {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, {
    url,
    // Silence "Not implemented: HTMLFormElement.prototype.submit" and friends.
    virtualConsole: new VirtualConsole(),
    pretendToBeVisual: true,
  });
  return dom.window;
}

export function makeCtrlDomWindow(body = "", url = "http://localhost/"): AnyWindow {
  if (ctrlDomCreateWindow === null) throw ctrlDomLoadError;
  const window = ctrlDomCreateWindow({ url }) as AnyWindow;
  if (body !== "") window.document.body.innerHTML = body;
  return window;
}

/** Short, implementation-independent description of a node. */
export function describeNode(node: AnyWindow): string {
  if (node === null) return "null";
  if (node === undefined) return "undefined";
  switch (node.nodeType) {
    case 1: {
      let s = String(node.localName);
      if (node.id) s += "#" + node.id;
      const name = node.getAttribute?.("name");
      if (name) s += `[name=${name}]`;
      return s;
    }
    case 3:
      return `#text(${JSON.stringify(node.data)})`;
    case 8:
      return "#comment";
    case 9:
      return "#document";
    case 11:
      return "#fragment";
  }
  return `node(${node.nodeType})`;
}

function isNodeLike(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { nodeType?: unknown }).nodeType === "number" &&
    "nodeName" in (v as object)
  );
}

/** Normalize an observation to JSON-comparable data. */
export function normalize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "<depth>";
  if (value === undefined) return "<undefined>";
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "<NaN>";
    if (Object.is(value, -0)) return "<-0>";
    if (!Number.isFinite(value)) return value > 0 ? "<Infinity>" : "<-Infinity>";
    return value;
  }
  if (typeof value === "bigint") return `<bigint ${value}>`;
  if (typeof value === "function") return "<function>";
  if (typeof value === "symbol") return `<${String(value)}>`;
  if (isNodeLike(value)) return `<${describeNode(value)}>`;
  if (value instanceof Date || Object.prototype.toString.call(value) === "[object Date]") {
    const t = (value as Date).getTime();
    return Number.isNaN(t) ? "<Invalid Date>" : `<Date ${new Date(t).toISOString()}>`;
  }
  if (Array.isArray(value)) return value.map((v) => normalize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as object))
    out[key] = normalize((value as Record<string, unknown>)[key], depth + 1);
  return out;
}

/** Run a scenario, capturing a thrown exception as `{ threw: name }` so both sides compare. */
export function observe(scenario: Scenario, window: AnyWindow): unknown {
  try {
    return normalize(scenario(window));
  } catch (error) {
    const e = error as { name?: string; constructor?: { name?: string } };
    return { threw: e?.name ?? e?.constructor?.name ?? String(error) };
  }
}

/**
 * `COMPAT_ORACLE=1` runs only the jsdom side and prints each observation, for reviewing new
 * scenarios (a scenario that throws on jsdom is usually a bug in the scenario).
 */
const ORACLE_ONLY = process.env.COMPAT_ORACLE === "1";

function expectedObservation(scenario: Scenario, options: DifferentialOptions): unknown {
  if (options.jsdomDeviation) return normalize(options.jsdomDeviation.expected);
  const observed = observe(scenario, makeJsdomWindow(options.body));
  return options.jsdomFix ? normalize(options.jsdomFix.fix(structuredClone(observed))) : observed;
}

/** Register a differential test. */
export function differential(name: string, scenario: Scenario, options: DifferentialOptions = {}): void {
  if (ORACLE_ONLY) {
    test(name, () => {
      const expected = expectedObservation(scenario, options);
      console.log(`ORACLE ${name} => ${JSON.stringify(expected)}`);
    });
    return;
  }
  const run = () => {
    const actual = observe(scenario, makeCtrlDomWindow(options.body));
    expect(actual).toEqual(expectedObservation(scenario, options));
  };
  if (options.knownGap) test.fails(`${name} [known gap: ${options.knownGap}]`, run);
  else test(name, run);
}

export type AsyncScenario = (window: AnyWindow) => Promise<unknown>;

/** Run an asynchronous scenario, capturing a rejection as `{ threw: name }`. */
export async function observeAsync(scenario: AsyncScenario, window: AnyWindow): Promise<unknown> {
  try {
    return normalize(await scenario(window));
  } catch (error) {
    const e = error as { name?: string; constructor?: { name?: string } };
    return { threw: e?.name ?? e?.constructor?.name ?? String(error) };
  } finally {
    window.close();
  }
}

/**
 * Register a differential test of an asynchronous scenario (networking): jsdom first, then
 * @ctrl/dom, one after the other. `url` (or a function returning it, for servers started in
 * beforeAll) is both windows' document URL.
 */
export function differentialAsync(
  name: string,
  scenario: AsyncScenario,
  options: Omit<DifferentialOptions, "jsdomDeviation"> & { url?: string | (() => string) } = {},
): void {
  const url = () => (typeof options.url === "function" ? options.url() : (options.url ?? "http://localhost/"));
  const expected = async () => {
    const observed = await observeAsync(scenario, makeJsdomWindow(options.body, url()));
    return options.jsdomFix ? normalize(options.jsdomFix.fix(structuredClone(observed))) : observed;
  };
  if (ORACLE_ONLY) {
    test(name, async () => console.log(`ORACLE ${name} => ${JSON.stringify(await expected())}`));
    return;
  }
  const run = async () => {
    const want = await expected();
    expect(await observeAsync(scenario, makeCtrlDomWindow(options.body, url()))).toEqual(want);
  };
  if (options.knownGap) test.fails(`${name} [known gap: ${options.knownGap}]`, run);
  else test(name, run);
}

/**
 * Register one differential test per probe value, e.g. one per input type × value. Keeps
 * failures pinpointed instead of one giant diff.
 */
export function differentialEach<T>(
  name: (probe: T) => string,
  probes: readonly T[],
  scenario: (window: AnyWindow, probe: T) => unknown,
  options: DifferentialOptions = {},
): void {
  for (const probe of probes) differential(name(probe), (w) => scenario(w, probe), options);
}

/**
 * Record events of `types` dispatched to any node under `root` (capture phase on the root, so
 * listeners added by the scenario later still observe order). Each entry is
 * "type@target" plus optional extra fields from `extra(event)`.
 */
export function recordEvents(
  root: AnyWindow,
  types: readonly string[],
  extra?: (event: AnyWindow) => string,
): string[] {
  const log: string[] = [];
  for (const type of types) {
    root.addEventListener(
      type,
      (event: AnyWindow) => {
        let entry = `${event.type}@${describeNode(event.target)}`;
        if (extra) entry += " " + extra(event);
        log.push(entry);
      },
      true,
    );
  }
  return log;
}

/** Snapshot the commonly observed state of a form control. */
export function controlState(el: AnyWindow): Record<string, unknown> {
  const state: Record<string, unknown> = { value: el.value };
  if ("checked" in el) state.checked = el.checked;
  if ("defaultValue" in el) state.defaultValue = el.defaultValue;
  if ("selectedIndex" in el) state.selectedIndex = el.selectedIndex;
  if ("validity" in el) state.valid = el.validity?.valid;
  return state;
}

/** All ValidityState flags of a control. */
export function validityFlags(el: AnyWindow): Record<string, boolean> {
  const v = el.validity;
  return {
    valueMissing: v.valueMissing,
    typeMismatch: v.typeMismatch,
    patternMismatch: v.patternMismatch,
    tooLong: v.tooLong,
    tooShort: v.tooShort,
    rangeUnderflow: v.rangeUnderflow,
    rangeOverflow: v.rangeOverflow,
    stepMismatch: v.stepMismatch,
    badInput: v.badInput,
    customError: v.customError,
    valid: v.valid,
  };
}

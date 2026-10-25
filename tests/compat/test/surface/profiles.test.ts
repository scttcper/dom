/**
 * Compat profiles: the API surface each profile installs, diffed against the real jsdom it
 * stands in for.
 *
 *   jsdom-26  jsdom 26.1.0, what jest-environment-jsdom 30 ships (the Jest default)
 *   jsdom-30  jsdom 30.1.3, Vitest's jsdom environment (the Vitest and createWindow default)
 *   modern    everything @ctrl/dom implements
 *
 * Spec: Web IDL §3.7 "Interface objects" and §3.7.3 "Interface prototype object"
 *   https://webidl.spec.whatwg.org/#es-interfaces
 *   https://webidl.spec.whatwg.org/#interface-prototype-object
 *
 * The registry is `COMPAT` in packages/dom/src/window/compat.ts. Every window global and
 * interface member a jsdom profile exposes beyond that jsdom version must be listed there with
 * the profiles that get it, so exposing a new API fails here until someone decides which
 * profiles should see it (docs/deviations.md groups the entries by profile). Entries hidden from
 * a profile must be absent from its installation, and every entry must name an API @ctrl/dom
 * really has, at the exact interface that owns it, that at least one of the two jsdoms lacks.
 *
 * The oracles are constructed the way jest-environment-jsdom and Vitest's jsdom environment do
 * (`pretendToBeVisual: true`, which adds requestAnimationFrame). Oracle quirks: jsdom defines
 * [LegacyUnforgeable] members on instances (Window, Location, `document.location`), and jsdom
 * 26's CSSOM objects (the cssom package) keep their members on instances too, so those
 * prototypes are not compared member by member. Legacy factory functions (`Image`, `Audio`,
 * `Option`) share their element's prototype, and aliases (`HTMLDocument` is `Document`) are the
 * same interface object: both are compared through the interface they stand for.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { createWindow, installGlobals, type CompatProfile } from "@ctrl/dom";
import { COMPAT, deferredCompatMembers } from "@ctrl/dom/internal";
import { DEVIATIONS, renderDeviations } from "../../../../scripts/compat-doc.ts";

type AnyRecord = Record<string, any>;
const require = createRequire(import.meta.url);
const ORACLES: Record<Exclude<CompatProfile, "modern">, string> = { "jsdom-26": "jsdom-26", "jsdom-30": "jsdom" };

/** JavaScript builtins every realm has: never part of the comparison. */
const BUILTINS = new Set<string>(runInNewContext("Object.getOwnPropertyNames(globalThis)"));
const UNFORGEABLE_HOSTS = new Set(["Window", "Location"]);
const isJsdom26Cssom = (name: string) => name.startsWith("CSS") || name === "StyleSheet" || name === "MediaList";

interface Surface {
  globals: Set<string>;
  /** "Interface.member" / "Interface.static.member" → the object that owns it. */
  members: Map<string, object>;
  /** Interface name → its interface object. */
  interfaces: Map<string, AnyRecord>;
}

function isInterface(value: unknown): value is AnyRecord {
  return typeof value === "function" && typeof (value as AnyRecord).prototype === "object" && (value as AnyRecord).prototype !== null;
}

/** The interface object named `name` itself: not a legacy factory (`Image`) or an alias (`HTMLDocument`). */
function ownsPrototype(value: AnyRecord, name: string): boolean {
  return value.prototype.constructor === value && value.name === name;
}

/** Own members of `iface.prototype` and own statics, as "Name.member" keys. */
function ownMembers(name: string, iface: AnyRecord, into: Map<string, object>): void {
  for (const m of Object.getOwnPropertyNames(iface.prototype)) {
    if (m !== "constructor" && !m.startsWith("_") && !/^\d+$/.test(m)) into.set(`${name}.${m}`, iface.prototype);
  }
  for (const m of Object.getOwnPropertyNames(iface)) {
    if (!["length", "name", "prototype", "arguments", "caller"].includes(m) && !m.startsWith("_")) into.set(`${name}.static.${m}`, iface);
  }
}

/** Every member name reachable from `iface.prototype` (its chain) and its statics. */
function reachable(iface: AnyRecord): Set<string> {
  const out = new Set<string>();
  for (let p = iface.prototype; p !== null && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const m of Object.getOwnPropertyNames(p)) out.add(m);
  }
  for (const m of Object.getOwnPropertyNames(iface)) out.add(`static.${m}`);
  return out;
}

/** Our surface under `profile`, read while installed on an empty global (as the environments install it). */
function ours(profile: CompatProfile): Surface {
  const target: AnyRecord = Object.create(null);
  const window = createWindow({ compat: profile });
  const uninstall = installGlobals(window, target);
  try {
    const surface: Surface = { globals: new Set(), members: new Map(), interfaces: new Map() };
    for (const name of Object.getOwnPropertyNames(target)) {
      if (name.startsWith("_") || BUILTINS.has(name)) continue;
      surface.globals.add(name);
      if (/^[A-Z]/.test(name) && isInterface(target[name]) && ownsPrototype(target[name], name)) {
        surface.interfaces.set(name, target[name]);
        ownMembers(name, target[name], surface.members);
      }
    }
    // Snapshot "has member" now: members gated by the profile change back at uninstall.
    for (const [key, owner] of surface.members) surface.members.set(key, Object.hasOwn(owner, key.split(".").at(-1)!) ? owner : (undefined as never));
    return surface;
  } finally {
    uninstall();
    window.close();
  }
}

function oracle(profile: Exclude<CompatProfile, "modern">) {
  const { JSDOM } = require(ORACLES[profile]) as { JSDOM: new (html: string, options: object) => { window: AnyRecord } };
  const window = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, runScripts: "dangerously" }).window;
  const globals = new Set<string>();
  for (let p: object | null = window; p !== null && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) globals.add(name);
  }
  return { window, globals };
}

const registered = new Map<string, readonly CompatProfile[]>();
for (const entry of COMPAT) for (const name of [...(entry.globals ?? []), ...(entry.members ?? [])]) registered.set(name, entry.profiles);

const where = "packages/dom/src/window/compat.ts (COMPAT)";

describe.each(Object.keys(ORACLES) as Array<Exclude<CompatProfile, "modern">>)("the %s profile against the real jsdom — https://webidl.spec.whatwg.org/#es-interfaces", (profile) => {
  const surface = ours(profile);
  const jsdom = oracle(profile);

  test("every window global it exposes beyond jsdom is registered for it", () => {
    const extra = [...surface.globals].filter((name) => !jsdom.globals.has(name));
    const unregistered = extra.filter((name) => !registered.get(name)?.includes(profile)).sort();
    expect(unregistered, `globals ${jsdom.window.navigator.userAgent.match(/jsdom\/[\d.]+/)?.[0]} lacks: list them in ${where} with the profiles that should get them`).toEqual([]);
  });

  test("every interface member it exposes beyond jsdom is registered for it", () => {
    const unregistered: string[] = [];
    for (const [name, iface] of surface.interfaces) {
      const theirs = jsdom.window[name];
      if (!isInterface(theirs) || UNFORGEABLE_HOSTS.has(name) || (profile === "jsdom-26" && isJsdom26Cssom(name))) continue;
      const known = reachable(theirs);
      if (name === "Document") for (const m of Object.getOwnPropertyNames(jsdom.window.document)) known.add(m);
      const own = new Map<string, object>();
      ownMembers(name, iface, own);
      for (const key of own.keys()) {
        if (surface.members.get(key) === undefined) continue; // hidden by the profile while installed
        const member = key.slice(name.length + 1);
        if (known.has(member)) continue;
        if (!registered.get(key)?.includes(profile)) unregistered.push(key);
      }
    }
    expect(unregistered.sort(), `members jsdom lacks: list them in ${where} with the profiles that should get them`).toEqual([]);
  });

  test("entries registered without it are absent from its installation", () => {
    const leaked: string[] = [];
    for (const entry of COMPAT) {
      if (entry.profiles.includes(profile)) continue;
      for (const name of entry.globals ?? []) if (surface.globals.has(name)) leaked.push(name);
      for (const key of entry.members ?? []) if (surface.members.get(key) !== undefined) leaked.push(key);
    }
    expect(leaked).toEqual([]);
  });
});

describe("the modern profile and the registry itself", () => {
  const modern = ours("modern");
  const j26 = oracle("jsdom-26");
  const j30 = oracle("jsdom-30");

  test("modern installs every registered API", () => {
    const missing = [...registered.keys()].filter((name) => (name.includes(".") ? modern.members.get(name) === undefined : !modern.globals.has(name)));
    expect(missing, `registered in ${where} but not implemented (or not at that interface)`).toEqual([]);
  });

  test("each entry names something at least one of jsdom 26 and jsdom 30 lacks", () => {
    const has = (j: { window: AnyRecord; globals: Set<string> }, name: string) => {
      if (!name.includes(".")) return j.globals.has(name);
      const [iface, ...rest] = name.split(".");
      const theirs = j.window[iface];
      if (!isInterface(theirs)) return false;
      const known = reachable(theirs);
      if (iface === "Document") for (const m of Object.getOwnPropertyNames(j.window.document)) known.add(m);
      return known.has(rest.join("."));
    };
    const stale = [...registered.keys()].filter((name) => has(j26, name) && has(j30, name));
    expect(stale, `both jsdoms have these: remove them from ${where}`).toEqual([]);
  });

  test("docs/deviations.md's profile table is generated from the current registry", () => {
    const doc = readFileSync(DEVIATIONS, "utf8");
    expect(renderDeviations(doc) === doc, "docs/deviations.md is stale: run `pnpm docs:compat`").toBe(true);
  });

  test("members only modern exposes are held back from the shared prototypes outside modern installations", () => {
    for (const [key, { owner }] of deferredCompatMembers()) {
      expect(registered.get(key), key).toEqual(["modern"]);
      expect(Object.hasOwn(owner, key.split(".").at(-1)!), key).toBe(false);
    }
  });
});

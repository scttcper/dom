// One accessor pair for the accessors React defines with a closure per object.
//
// V8 keeps one accessor pair per map transition. The first object of a shape to get an own
// accessor takes the transition; the next one arrives with different functions and is normalized
// to dictionary mode (Map::TransitionToAccessorProperty, "TransitionToDifferentAccessor"). React
// does that to two kinds of object on every render:
//
// - the props of every element with a key: its development build defines a `key` getter that
//   warns when read (defineKeyPropWarningGetter in react.development.js and both JSX runtimes).
//   React then freezes the props, and freezing a dictionary-mode object copies its map
//   (JSObject::PreventExtensionsWithTransition, "SlowCopyForPreventExtensions"), so every keyed
//   props object has a map of its own: each read of one in react-dom misses its inline cache, and
//   the maps push everyone else's entries out of V8's megamorphic stub cache;
// - every <input> and <textarea>: `trackValueOnNode` defines an own `value` or `checked`
//   accessor (development and production), which leaves the wrapper a dictionary: every
//   `this[$impl]` behind a DOM call on it is a hash lookup (html/forms/control-state.ts).
//
// `Object.defineProperty` of a test realm is wrapped (installGlobals, and the guard in
// isolation.ts) to define one shared pair instead, which calls the functions React passed: found
// by the props object, or kept in the control's state. Reads, writes, the warning and its text
// are React's; only `Object.getOwnPropertyDescriptor(...).get` is not the closure React made.
// It has to be in place before the first such object: a transition taken by a closure stays taken.
// Measurements: bench/README.md, "React's development build and V8".

import { $control } from "../keys.ts";
import type { ControlState } from "../html/forms/control-state.ts";

type KeyWarningGetter = (() => unknown) & { isReactWarning?: boolean };

const keyWarnings = new WeakMap<object, KeyWarningGetter>();

function keyWarningGetter(this: object): unknown {
  return keyWarnings.get(this)?.call(this);
}
// React's hasValidKey() tells its warning getter from a real `key` prop by this mark.
keyWarningGetter.isReactWarning = true;

const KEY_WARNING: PropertyDescriptor = { get: keyWarningGetter, configurable: true };

function keyDescriptor(o: unknown, desc: PropertyDescriptor): PropertyDescriptor {
  const get = desc.get as KeyWarningGetter | undefined;
  if (get === undefined || get.isReactWarning !== true || get === keyWarningGetter) return desc;
  if (desc.set !== undefined || desc.configurable !== true || desc.enumerable !== undefined) return desc;
  keyWarnings.set(o as object, get);
  return KEY_WARNING;
}

type Control = { [$control]?: ControlState };

// React's second call, `{ enumerable }` alone, keeps the transition; an enumerable pair defined
// at once would be normalized by it.
const TRACKER: PropertyDescriptor = {
  get(this: Control): unknown {
    return this[$control]!.tracker!.get!.call(this);
  },
  set(this: Control, value: unknown): void {
    this[$control]!.tracker!.set!.call(this, value);
  },
  configurable: true,
};

function trackerDescriptor(o: Control, desc: PropertyDescriptor): PropertyDescriptor {
  const { get, set } = desc;
  if (typeof get !== "function" || typeof set !== "function") return desc;
  const control = o[$control];
  if (control === undefined) return desc;
  if (get === TRACKER.get || set === TRACKER.set) {
    // The pair came back in a descriptor read off the element (stock user-event spreads it to
    // wrap the setter): define the functions it stands for.
    const tracker = control.tracker!;
    return { ...desc, get: get === TRACKER.get ? tracker.get : get, set: set === TRACKER.set ? tracker.set : set };
  }
  if (control.tracker !== null || desc.configurable !== true || desc.enumerable !== undefined) return desc;
  control.tracker = desc;
  return TRACKER;
}

/** The descriptor to define for `key` on `o`: `desc`, or a shared pair standing for it. */
export function sharedAccessor(o: unknown, key: PropertyKey, desc: PropertyDescriptor): PropertyDescriptor {
  if (key !== "key" && key !== "value" && key !== "checked") return desc;
  if (desc === null || typeof desc !== "object") return desc;
  return key === "key" ? keyDescriptor(o, desc) : trackerDescriptor(o as Control, desc);
}

interface Installed {
  count: number;
  original: PropertyDescriptor;
  wrapper: ObjectConstructor["defineProperty"];
}

/** Realms whose `Object.defineProperty` is wrapped, by their `Object`. */
const installed = new WeakMap<ObjectConstructor, Installed>();

/**
 * Wrap `Object.defineProperty` of the realm whose `Object` is `O` (see the top of this file).
 * Returns the undo; nested calls for one realm share the wrapper.
 */
export function shareAccessors(O: ObjectConstructor): () => void {
  let entry = installed.get(O);
  if (entry === undefined) {
    const original = Object.getOwnPropertyDescriptor(O, "defineProperty")!;
    const defineProperty = O.defineProperty;
    // An object literal method: same name and length as the builtin, no `prototype`. CPU
    // profiles charge the native defineProperty's work to it: React calls it five times per
    // element, so it tops a render-heavy profile (12% of `react/fill-10-submit`) with ~7 ns of
    // its own per call.
    const wrapper = {
      defineProperty<T>(o: T, key: PropertyKey, desc: PropertyDescriptor & ThisType<unknown>): T {
        return defineProperty(o, key, sharedAccessor(o, key, desc));
      },
    }.defineProperty;
    Object.defineProperty(O, "defineProperty", { ...original, value: wrapper });
    installed.set(O, (entry = { count: 0, original, wrapper }));
  }
  entry.count++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--entry.count !== 0) return;
    installed.delete(O);
    // A realm's guard (isolation.ts) replaces the wrapper with its own; leave that one.
    if (O.defineProperty === entry.wrapper) Object.defineProperty(O, "defineProperty", entry.original);
  };
}

/** `O.defineProperty` without this file's wrapper, for a wrapper that calls `sharedAccessor` itself. */
export function unsharedDefineProperty(O: ObjectConstructor): ObjectConstructor["defineProperty"] {
  const entry = installed.get(O);
  return entry !== undefined && O.defineProperty === entry.wrapper
    ? (entry.original.value as ObjectConstructor["defineProperty"])
    : O.defineProperty;
}

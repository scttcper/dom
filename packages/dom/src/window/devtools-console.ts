// React's development build asks the console for two DevTools features when it loads:
// `console.createTask` (an async stack tag per element) and `console.timeStamp` (with
// `performance.measure`, its Performance panel tracks: a call per rendered component, and
// measures that stay in Node's performance timeline). Only V8's inspector console has them:
// Vitest's and Jest's `new Console()` have neither, so React skips both there. Under node:test
// (@ctrl/dom/register), or a runner told not to intercept the console, React finds Node's global
// console and pays for them on every element: 9–13% of a React workload's time (bench/README.md,
// "React's development build and V8"), for output nothing reads unless a debugger is attached.
//
// So a window installed as a realm's global hides the two while no inspector is attached, and
// puts them back when it is uninstalled. It has to happen before React is loaded.

const DEVTOOLS_ONLY = ["createTask", "timeStamp"];

/** Whether a debugger is, or was asked to be, attached to this process. */
function inspectorActive(): boolean {
  if (process.execArgv.some((arg) => arg.startsWith("--inspect"))) return true;
  if (process.env.NODE_OPTIONS?.includes("--inspect")) return true;
  // Opened from code (VS Code's auto attach preloads a script that does): then the module is
  // loaded. Asking the module itself would load it, 1 ms in every process.
  const loaded = (process as { moduleLoadList?: string[] }).moduleLoadList;
  return (
    loaded !== undefined &&
    loaded.includes("NativeModule inspector") &&
    process.getBuiltinModule("node:inspector").url() !== undefined
  );
}

/** Hide the inspector-only members of `console` (see above). Returns the undo, or null when there is nothing to hide. */
export function hideDevtoolsConsole(console: object | undefined): (() => void) | null {
  if (console === undefined) return null;
  let saved: Array<[string, PropertyDescriptor]> | null = null;
  for (const key of DEVTOOLS_ONLY) {
    const descriptor = Object.getOwnPropertyDescriptor(console, key);
    if (descriptor === undefined || !descriptor.configurable) continue;
    // Bun has no such members; asked only once there is something to hide.
    if (saved === null && inspectorActive()) return null;
    (saved ??= []).push([key, descriptor]);
    delete (console as Record<string, unknown>)[key];
  }
  if (saved === null) return null;
  const hidden = saved;
  return () => {
    for (const [key, descriptor] of hidden) {
      if (!Object.hasOwn(console, key)) Object.defineProperty(console, key, descriptor);
    }
  };
}

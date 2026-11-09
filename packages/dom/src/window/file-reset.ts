// The boundary between two test files that share a window.
//
// Where a worker runs one test file after another in the same realm (Vitest with
// `isolate: false`: the ctrlDom() plugin's `sharedWorkers`), the window, its document and every
// module loaded from node_modules live on, so what a file left behind is the next file's starting
// point. `resetWindowBetweenFiles()` puts back what belongs to one file:
//
// - what a testing library still has mounted (`registerTestHooks`: @ctrl/dom/react unmounts the
//   trees render() mounted), in case the file's own hooks did not;
// - pending timers, animation frames and idle callbacks: the file that set them is over;
// - the body's children and the attributes of `<body>` and `<html>`;
// - focus and the selection;
// - localStorage, sessionStorage and cookies;
// - the URL and session history, back to where the window was when the first file started (its
//   first reset).
//
// What stays is whatever a module that also stays may hold on to: `<head>` (a CSS-in-JS library's
// style elements, which its cache believes are there; React's hoisted style sheets, which it
// tracks on the document), event listeners on the window and document (React Aria and the like add
// theirs once per module instance), properties tests or libraries put on these objects, and
// patches to interface prototypes.

import type { Element } from "../nodes/Element.ts";
import { clearActiveClockTimers } from "./clock.ts";
import { currentWindowOrNull } from "./current.ts";
import { clearTimers } from "./timers.ts";
import type { Window } from "./Window.ts";
import {
  $cookieJar,
  $entries,
  $frameCallbacks,
  $frameTask,
  $idleCallbacks,
  $index,
  $runningFrame,
  $tasks,
} from "../keys.ts";

/**
 * What a testing library does around tests, for a runner hook to call. A library registers these
 * when it is loaded, under the conditions it would register the runner's own hooks; loaded once
 * for a worker's files, its own registration reaches only the first.
 */
export interface TestLibraryHooks {
  /** A test file ended with the window going on: unmount what is still mounted. */
  fileEnd?: () => void;
  afterEach?: () => void;
  beforeAll?: () => void;
  afterAll?: () => void;
}

/** Per window: the libraries' hooks by name, and the URL the first file started at (the first reset). */
class FileState {
  hooks: Map<string, TestLibraryHooks>;
  /** Null until the first reset: a library may register its hooks after a test has navigated. */
  url: string | null;
  constructor() {
    this.hooks = new Map();
    this.url = null;
  }
}

// Weak: a window's state goes with the window (Jest and Vitest's VM pools make one per file, and a
// hook is a function of that file's module graph).
const states = new WeakMap<Window, FileState>();

function stateOf(window: Window): FileState {
  let state = states.get(window);
  if (state === undefined) states.set(window, (state = new FileState()));
  return state;
}

/**
 * Testing library `name`'s hooks, added to the ones it registered before. A fresh instance of the
 * library (after a module reset) replaces the previous one's.
 */
export function registerTestHooks(name: string, hooks: TestLibraryHooks): void {
  const window = currentWindowOrNull();
  if (window === null) return;
  const all = stateOf(window).hooks;
  all.set(name, { ...all.get(name), ...hooks });
}

/** The hooks registered for the current window, by library. */
export function testHooks(): TestLibraryHooks[] {
  const window = currentWindowOrNull();
  const state = window === null ? undefined : states.get(window);
  return state === undefined ? [] : [...state.hooks.values()];
}

/** A test file is about to start in `window`, which other files have used or will use. */
export function resetWindowBetweenFiles(window: Window): void {
  const state = stateOf(window);
  for (const hooks of state.hooks.values()) {
    try {
      hooks.fileEnd?.();
    } catch {
      // The previous file's trees: an unmount that throws there must not fail this file.
    }
  }

  // Timers on the clock the file's globals use, then what the window scheduled itself.
  clearActiveClockTimers();
  clearTimers(window);
  const tasks = window[$tasks];
  if (tasks !== null) {
    for (const task of tasks) task.clear(task.handle as never);
    tasks.clear();
  }
  window[$frameCallbacks] = null;
  window[$runningFrame] = null;
  window[$frameTask] = null;
  window[$idleCallbacks] = null;

  const document = window.document;
  document.getSelection()?.removeAllRanges();
  const body = document.body as Element | null;
  if (body !== null) {
    // Removing the focused element moves focus to the body (the focus fixup of nodes/tree.ts).
    body.replaceChildren();
    removeAttributes(body);
  }
  if (document.documentElement !== null) removeAttributes(document.documentElement);

  window.localStorage.clear();
  window.sessionStorage.clear();
  window[$cookieJar] = null;

  const url = (state.url ??= window.location.href);
  if (window.location.href !== url) window._setURL(new URL(url));
  const history = window.history;
  history[$entries] = [{ url, state: null }];
  history[$index] = 0;
}

function removeAttributes(element: Element): void {
  const names = element.getAttributeNames();
  for (let i = 0; i < names.length; i++) element.removeAttribute(names[i]);
}

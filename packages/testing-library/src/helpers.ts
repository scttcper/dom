// Port of @testing-library/dom src/helpers.ts (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/helpers.ts

import type { NodeImpl } from "@ctrl/dom/internal";
import { $impl } from "@ctrl/dom/internal";

// Constant node.nodeType for text nodes, see:
// https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType#Node_type_constants
export const TEXT_NODE = 3;

declare const jest: any;

/**
 * Upstream only detects Jest's fake timers (legacy: `setTimeout._isMockFunction`, modern:
 * `setTimeout.clock`). Divergence (intentional): when there is no `jest` global we also detect
 * @sinonjs/fake-timers clocks, which is what Vitest's `vi.useFakeTimers()` installs (the
 * faked `setTimeout` carries a `clock` with `tick`). Upstream's waitFor hangs under Vitest
 * fake timers; ours advances them like it does for Jest.
 */
export function jestFakeTimersAreEnabled(): boolean {
  if (typeof jest !== "undefined" && jest !== null) {
    return (
      // legacy timers
      (setTimeout as any)._isMockFunction === true ||
      // modern timers
      Object.hasOwn(setTimeout, "clock")
    );
  }
  const clock = (setTimeout as any).clock;
  return clock != null && typeof clock.tick === "function";
}

/** Advance whichever fake clock `jestFakeTimersAreEnabled` detected by `ms`. */
export function advanceFakeTimersByTime(ms: number): void {
  if (typeof jest !== "undefined" && jest !== null) {
    jest.advanceTimersByTime(ms);
    return;
  }
  const vi = (globalThis as any).vi;
  if (vi != null && typeof vi.advanceTimersByTime === "function" && typeof vi.isFakeTimers === "function" && vi.isFakeTimers()) {
    vi.advanceTimersByTime(ms);
    return;
  }
  (setTimeout as any).clock.tick(ms);
}

export function getDocument(): any {
  if (typeof window === "undefined") {
    throw new Error("Could not find default container");
  }
  return (window as any).document;
}

declare const window: any;

export function getWindowFromNode(node: any): any {
  if (node.defaultView) {
    // node is document
    return node.defaultView;
  } else if (node.ownerDocument && node.ownerDocument.defaultView) {
    // node is a DOM node
    return node.ownerDocument.defaultView;
  } else if (node.window) {
    // node is window
    return node.window;
  } else if (node.ownerDocument && node.ownerDocument.defaultView === null) {
    throw new Error(`It looks like the window object is not available for the provided node.`);
  } else if (node.then instanceof Function) {
    throw new Error(
      `It looks like you passed a Promise object instead of a DOM node. Did you do something like \`fireEvent.click(screen.findBy...\` when you meant to use a \`getBy\` query \`fireEvent.click(screen.getBy...\`, or await the findBy query \`fireEvent.click(await screen.findBy...\`?`,
    );
  } else if (Array.isArray(node)) {
    throw new Error(
      `It looks like you passed an Array instead of a DOM node. Did you do something like \`fireEvent.click(screen.getAllBy...\` when you meant to use a \`getBy\` query \`fireEvent.click(screen.getBy...\`?`,
    );
  } else if (typeof node.debug === "function" && typeof node.logTestingPlaygroundURL === "function") {
    throw new Error(
      `It looks like you passed a \`screen\` object. Did you do something like \`fireEvent.click(screen, ...\` when you meant to use a query, e.g. \`fireEvent.click(screen.getBy..., \`?`,
    );
  } else {
    // The user passed something unusual to a calling function
    throw new Error(`The given node is not an Element, the node type is: ${typeof node}.`);
  }
}

export function checkContainerType(container: unknown): void {
  if (
    !container ||
    !(typeof (container as any).querySelector === "function") ||
    !(typeof (container as any).querySelectorAll === "function")
  ) {
    throw new TypeError(`Expected container to be an Element, a Document or a DocumentFragment but got ${getTypeName(container)}.`);
  }
}

function getTypeName(object: unknown): string {
  if (typeof object === "object") {
    return object === null ? "null" : (object as object).constructor.name;
  }
  return typeof object;
}

/**
 * The NodeImpl behind a container passed to a query. Queries in this package walk
 * @ctrl/dom internals directly; `checkContainerType` must have run first.
 */
export function implOf(node: any): NodeImpl {
  const impl = node[$impl];
  if (impl === undefined) {
    throw new TypeError("@ctrl/dom/testing-library requires nodes created by @ctrl/dom.");
  }
  return impl;
}

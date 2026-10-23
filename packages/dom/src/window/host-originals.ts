// Host (Node) globals that installGlobals replaced, captured at install time.
//
// Some host globals are needed by our own replacements after they are shadowed — e.g. our
// FormData subclasses Node's undici FormData so fetch/Request accept it, but once the window is
// installed `globalThis.FormData` is ours. installGlobals records the originals here.
//
// Startup note: Node 26 defines FormData/fetch/Request/MessageEvent/... as V8 lazy data
// properties; reading the value OR the descriptor loads undici + zlib (~20-60 ms cold). So code
// must not touch those globals at module load — only on first real use.

export const hostOriginals = new Map<string, unknown>();

/** Record `value` as the host's original for `key` (first capture wins). */
export function recordHostOriginal(key: string, value: unknown): void {
  if (!hostOriginals.has(key)) hostOriginals.set(key, value);
}

/**
 * The bound Window methods installGlobals puts on a host global (`window.getComputedStyle` there
 * is `Window.prototype.getComputedStyle.bind(window)`), so code can tell them from user
 * replacements and spies by identity.
 */
export const installedWindowMethods: WeakSet<object> = new WeakSet();

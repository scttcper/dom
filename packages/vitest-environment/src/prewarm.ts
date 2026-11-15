// Worker preload of the ctrlDom() plugin's warm workers (./warm-forks.ts): `--import`ed as a
// forked worker starts, before Vitest's worker entry. It loads what every test file of the
// project needs before its first line runs and that depends on nothing the file can change: the
// DOM (the modules the environment's setup() imports) and Node's lazy fetch globals (undici,
// which installGlobals reads before it installs the DOM's Event: packages/dom/src/window/globals.ts).
//
// In a worker forked when its file is scheduled this only moves that work earlier in the same
// process. In a spare worker, forked ahead of its file, it happens while the process waits.
//
// Nothing here is observable to a test: no global is defined or replaced, and a module the
// environment imports again resolves to the instance loaded here.

const ignore = (): void => {};
import("@ctrl/dom").catch(ignore);
import("@ctrl/dom/internal").catch(ignore);
// Reading the descriptor of one of Node's lazy undici globals loads undici.
Object.getOwnPropertyDescriptor(globalThis, "FormData");

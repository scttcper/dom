// Preloaded (`--import`) into Vitest workers and cold-start processes that should run the
// bundles: bare `@ctrl/dom` and `@ctrl/dom/*` imports (the bundles' own) resolve to
// packages/*/dist, from the specifier → path map in CTRL_DOM_DIST_MAP (distMapEnv() in packages.ts).
// Used by bench/suite's *-dist configurations and comparison/'s ctrl-dom contenders.
//
// Plain JavaScript on purpose: a TypeScript preload makes every worker load Node's type stripper,
// a WebAssembly module worth ~10 MB of RSS that an installed package never needs.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const map = new Map(
  Object.entries(JSON.parse(process.env.CTRL_DOM_DIST_MAP ?? "{}")).map(([specifier, path]) => [
    specifier,
    pathToFileURL(path).href,
  ]),
);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = map.get(specifier);
    if (url === undefined) return nextResolve(specifier, context);
    // Counted for the setup files' "the bundles really loaded" checks (as lib/dist-hooks.ts does).
    process.__ctrlDomDistResolutions = (process.__ctrlDomDistResolutions ?? 0) + 1;
    return { url, format: "module", shortCircuit: true };
  },
});

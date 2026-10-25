// Resolve `@ctrl/dom` and its subpaths (`@ctrl/dom/vitest-environment` …) to their bundled `dist/` entries instead of the
// TypeScript sources named in package.json `exports`. Used by the "*-dist" bench configurations
// so startup can be measured without Node's type stripping (packages' exports stay on src/).

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { workspacePackages } from "./packages.ts";

let installed = false;

export function installDistResolution(): void {
  if (installed) return;
  installed = true;
  const map = new Map<string, string>();
  for (const pkg of workspacePackages()) {
    for (const e of pkg.exports) map.set(e.specifier, e.dist);
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const dist = map.get(specifier);
      if (dist !== undefined) {
        if (!existsSync(dist)) {
          throw new Error(`${specifier}: bundle ${dist} is missing (run \`pnpm build\`)`);
        }
        (process as { __ctrlDomDistResolutions?: number }).__ctrlDomDistResolutions =
          ((process as { __ctrlDomDistResolutions?: number }).__ctrlDomDistResolutions ?? 0) + 1;
        return { url: pathToFileURL(dist).href, format: "module", shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

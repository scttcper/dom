// Preloaded into Vitest workers (`--import`) for the `*-dist` suite environments: resolves
// `@rtd/*` and `vitest-environment-rtd` to their bundled dist/ entries, i.e. what a user
// installing the packages from npm would load. Run `pnpm build` first.
import { installDistResolution } from "../lib/dist-hooks.ts";

installDistResolution();

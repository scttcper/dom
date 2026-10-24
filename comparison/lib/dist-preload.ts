// Preloaded (`--import`) into ctrl-dom's Vitest workers and cold-start processes: bare `@rtd/*`
// and `vitest-environment-rtd` imports resolve to the bundles in packages/*/dist.
import { installDistResolution } from "../../bench/lib/dist-hooks.ts";

installDistResolution();

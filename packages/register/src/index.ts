// `@ctrl/dom/register`: importing it installs an @rtd/dom window as the global, for test runners
// without a DOM environment of their own.
//
//   node --import @ctrl/dom/register --test           (or `import "@ctrl/dom/register"` first in a file)
//   bunfig.toml: [test] preload = ["@ctrl/dom/register"]
//
// Defaults are the Vitest environment's (src/pure.ts), with the test runner's hooks wired up
// (`testHooks`). Preloads take no arguments, so a few options come from environment variables:
// CTRL_DOM_URL, CTRL_DOM_COMPAT ("jsdom-26" | "jsdom-30" | "modern"), CTRL_DOM_TIME_SKIP ("0"/"1")
// and CTRL_DOM_TEST_HOOKS ("0" to leave the runner alone). For anything else call
// `register(options)` (it replaces this registration) or import `@ctrl/dom/register/pure`.

import type { CompatProfile } from "@rtd/dom";
import { register } from "./pure.ts";

export { register, unregister, isRegistered, type RegisterOptions, type Registration } from "./pure.ts";

const env = process.env;
register({
  url: env.CTRL_DOM_URL || undefined,
  compat: (env.CTRL_DOM_COMPAT || undefined) as CompatProfile | undefined,
  testHooks: env.CTRL_DOM_TEST_HOOKS !== "0",
});

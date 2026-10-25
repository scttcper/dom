// Wrapper Jest config for the Sentry downstream suite (driven by downstream/sentry/run.ts).
// Imports upstream's own root config (tests/js/createJestConfig.ts via jest.config.mjs) unchanged
// and only substitutes, per mode:
//
//   jsdom        upstream environment (instrumented subclass), everything else upstream's
//   ctrl-dom      testEnvironment -> @ctrl/dom-jest-environment (wrapped in @sentry/jest-environment's
//                factory, like upstream does with jsdom) + the preset's @ctrl/dom moduleNameMapper
//   ctrl-dom-full     ctrl-dom + @testing-library/{react,dom,user-event,jest-dom} -> packages/*/dist/*.cjs
//   ctrl-dom-nohacks  ctrl-dom-full + harness/nohacks.ts after upstream's setup (EXPERIMENT: undoes the
//                jsdom-only speed hacks in tests/js/setup.ts)
//
// No upstream file is edited. Everything is read from environment variables set by run.ts.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const checkout = process.env.CTRL_DOM_SENTRY_CHECKOUT;
const mode = process.env.CTRL_DOM_SENTRY_MODE;
const out = process.env.CTRL_DOM_SENTRY_OUT;
if (!checkout || !mode || !out) throw new Error("Run this config through downstream/sentry/run.ts");
const here = import.meta.dirname;
const repo = path.resolve(here, "../../..");
const pkg = (...p) => path.join(repo, "packages", ...p);

const upstream = (await import(pathToFileURL(path.join(checkout, "jest.config.mjs")).href)).default;
const ctrlDom = mode !== "jsdom";
const full = mode === "ctrl-dom-full" || mode === "ctrl-dom-nohacks";
const nohacks = mode === "ctrl-dom-nohacks";

const ctrlDomPreset = createRequire(import.meta.url)(pkg("jest-environment/jest-preset.cjs"));

// ctrl-dom-full: our built bundles (pnpm build). Jest without --experimental-vm-modules can only
// require CommonJS from a test file, hence the .cjs builds (scripts/build.ts CJS_PACKAGES).
const shims = (process.env.CTRL_DOM_SENTRY_SHIMS ?? "react,dom,user-event,jest-dom").split(",");
const SHIM_MAP = {
  react: {
    "^@testing-library/react/pure(\\.js)?$": pkg("react/dist/pure.cjs"),
    "^@testing-library/react/dont-cleanup-after-each(\\.js)?$": pkg("react/dist/dont-cleanup-after-each.cjs"),
    "^@testing-library/react$": pkg("react/dist/index.cjs"),
  },
  dom: { "^@testing-library/dom$": pkg("testing-library/dist/index.cjs") },
  "user-event": { "^@testing-library/user-event$": pkg("user-event/dist/index.cjs") },
  "jest-dom": {
    "^@testing-library/jest-dom/matchers(\\.js)?$": pkg("jest-dom/dist/matchers.cjs"),
    "^@testing-library/jest-dom/jest-globals(\\.js)?$": pkg("jest-dom/dist/jest-globals.cjs"),
    "^@testing-library/jest-dom$": pkg("jest-dom/dist/index.cjs"),
  },
};
const fullMapper = full
  ? {
      ...Object.assign({}, ...shims.map((s) => SHIM_MAP[s])),
      // Our bundles' own cross-package imports (one module instance each).
      "^@ctrl/dom/testing-library$": pkg("testing-library/dist/index.cjs"),
      "^@ctrl/dom/testing-library/agent$": pkg("testing-library/dist/agent.cjs"),
      "^@ctrl/dom/aria$": pkg("aria/dist/index.cjs"),
      "^@ctrl/dom/aria/internal$": pkg("aria/dist/internal.cjs"),
    }
  : {};

const environment = ctrlDom ? path.join(here, "env-ctrl-dom.cjs") : path.join(here, "env-jsdom.cjs");

export default {
  ...upstream,
  // One cache per mode: mappings differ, and warm-cache timings stay comparable.
  cacheDirectory: path.join(checkout, ".cache", "ctrl-dom-downstream", mode),
  testEnvironment: environment,
  // Our resolver delegates to upstream's tests/js/jestWorkspaceResolver.cjs; it only redirects
  // react/react-dom/scheduler imported *from our packages* to Sentry's copies (one React) and
  // records receipts.
  resolver: path.join(here, "resolver.cjs"),
  moduleNameMapper: {
    ...(ctrlDom ? ctrlDomPreset.moduleNameMapper : {}),
    ...fullMapper,
    ...upstream.moduleNameMapper,
  },
  setupFiles: [path.join(here, "stash.cjs"), ...upstream.setupFiles],
  setupFilesAfterEnv: [
    path.join(here, "probe.cjs"),
    ...upstream.setupFilesAfterEnv,
    ...(nohacks ? [path.join(here, "nohacks.ts")] : []),
  ],
  // Our sources/bundles are plain JS/CJS: never transform them.
  transformIgnorePatterns: [
    ...upstream.transformIgnorePatterns,
    `^${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/packages/`,
  ],
  testEnvironmentOptions: {
    ...upstream.testEnvironmentOptions,
    // Sentry's environment is built on jsdom 30 (@ctrl/dom-jest-environment otherwise defaults to the
    // jsdom-26 profile of jest-environment-jsdom 30, which has no PointerEvent).
    compat: "jsdom-30",
    // Local harness: never send telemetry.
    sentryConfig: {
      ...upstream.testEnvironmentOptions?.sentryConfig,
      init: { ...upstream.testEnvironmentOptions?.sentryConfig?.init, dsn: false },
    },
  },
  // CTRL_DOM_SENTRY_REPORTER=1 (opt in, so a SENTRY_DSN in the shell never reports harness runs by
  // accident): @ctrl/sentry-tests' reporter and test runner, sending to SENTRY_DSN /
  // SENTRY_SPOTLIGHT (packages/sentry-tests/README.md).
  reporters: ["default", ...(process.env.CTRL_DOM_SENTRY_REPORTER === "1" ? [pkg("sentry-tests/src/jest.ts")] : [])],
  ...(process.env.CTRL_DOM_SENTRY_REPORTER === "1" ? { testRunner: pkg("sentry-tests/src/jest-runner.ts") } : {}),
  // Scratch experiments (run.ts --scratch DIR): specs outside the checkout, resolved as if they
  // lived in tests/js (see resolver.cjs). Never used for reported results.
  ...(process.env.CTRL_DOM_SENTRY_SCRATCH
    ? {
        roots: [
          "<rootDir>/static/app/__mocks__",
          "<rootDir>/static/app/utils/__mocks__",
          process.env.CTRL_DOM_SENTRY_SCRATCH,
        ],
        testMatch: [path.join(process.env.CTRL_DOM_SENTRY_SCRATCH, "**/*.spec.tsx")],
        testPathIgnorePatterns: [],
      }
    : {}),
};

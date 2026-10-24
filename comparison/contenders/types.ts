// What a contender is: a DOM implementation, the Vitest environment that installs it, and the
// Testing Library stack test files get. Adding one is a file in this directory plus a line in
// index.ts; every runner (Vitest bench, cold start, the 100-file suite) and the report pick it up.

import type { Environment } from "vitest/runtime";

export interface Contender {
  /** Stable id: Vitest project name, results key, CLI filter (`--contenders jsdom,ctrl-dom`). */
  id: string;
  /** Column header in reports. */
  label: string;
  /** The package whose version the report prints, and where to read it from. */
  version: () => string;
  /**
   * The Vitest environment: a built-in name ("jsdom", "happy-dom") or an absolute path to an
   * environment module. Used by the Vitest bench and suite projects as `test.environment`.
   */
  environment: string;
  environmentOptions?: Record<string, unknown>;
  /** Vite aliases for its test files (e.g. stock `@testing-library/*` routed to another implementation). */
  alias?: Array<{ find: string | RegExp; replacement: string }>;
  /** `--import` preloads for its Vitest workers and cold-start processes. */
  preload?: string[];
  /** Other Node flags for its Vitest workers and cold-start processes (after the preloads). */
  execArgv?: string[];
  /** Environment variables for its Vitest workers and cold-start processes. */
  env?: Record<string, string>;
  /** Modules to load natively in Vitest (`server.deps.external`), as an installed package would be. */
  external?: RegExp[];
  /** For the cold-start runner: the environment object Vitest would load (import included). */
  loadEnvironment: () => Promise<Environment>;
  /** For the cold-start runner: specifiers for the first test (aliases are a Vite feature). */
  imports: { react: string; userEvent: string };
  /**
   * Same DOM as another contender (only the Testing Library stack differs): DOM-only benchmarks
   * are run once, for that one.
   */
  sameDomAs?: string;
  /** Checked before a run: throw with instructions when something is missing (e.g. `pnpm build`). */
  check?: () => void;
  /**
   * For the Jest suite (jest-suite.ts): the Jest environment this DOM ships, and where test
   * files' imports go. `preload` and `env` apply to Jest's workers too. Absent: no Jest row.
   */
  jest?: JestSetup;
}

export interface JestSetup {
  /** Column header in the Jest table, e.g. "jest-environment-jsdom 30.5.2 (jsdom 26.1.0)". */
  label: () => string;
  /** `testEnvironment`: a package name or an absolute path. */
  testEnvironment: string;
  testEnvironmentOptions?: Record<string, unknown>;
  /** Extra `moduleNameMapper` entries (e.g. stock `@testing-library/*` to another implementation). */
  moduleNameMapper?: Record<string, string>;
}

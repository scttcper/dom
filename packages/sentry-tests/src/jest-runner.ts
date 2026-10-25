// Jest's test runner (jest-circus), with each test file recorded as spans:
//
//   testRunner: "@ctrl/sentry-tests/jest-runner"
//
// jest-circus hands its events to the environment's handleTestEvent, so wrapping that before the
// file starts works under any environment (jsdom, node, @ctrl/dom). It only collects when the
// reporter (jest.ts) is on: the reporter sets SENTRY_TESTS_DIR before Jest starts its workers, and
// the runner writes each file's data there.

import { createRequire } from "node:module";
import { join } from "node:path";
import { createJestCollector } from "./jest-collector.ts";

/** jest-circus's runner signature (@jest/test-result's TestFramework). */
type TestFramework = (globalConfig: unknown, config: { rootDir: string }, environment: Environment, runtime: unknown, testPath: string, sendMessageToJest?: unknown) => Promise<unknown>;
interface Environment {
  global?: { document?: unknown };
  handleTestEvent?: (event: never, state: unknown) => void | Promise<void>;
}

export default async function sentryTestsRunner(globalConfig: unknown, config: { rootDir: string }, environment: Environment, runtime: unknown, testPath: string, sendMessageToJest?: unknown): Promise<unknown> {
  const circus = loadCircus(config.rootDir);
  const dir = process.env.SENTRY_TESTS_DIR;
  if (!dir) return circus(globalConfig, config, environment, runtime, testPath, sendMessageToJest);
  const collector = createJestCollector({ dir, testPath, getDocument: () => environment.global?.document });
  // jest-circus binds handleTestEvent when the file starts, after the environment's setup().
  const previous = environment.handleTestEvent;
  environment.handleTestEvent = async function (this: Environment, event, state) {
    await previous?.call(this, event, state);
    await collector.handleTestEvent(event);
  };
  try {
    return await circus(globalConfig, config, environment, runtime, testPath, sendMessageToJest);
  } finally {
    collector.finish();
  }
}

/**
 * Jest's own jest-circus: the project's when it installed one, else the one jest-config (which
 * makes it the default runner) depends on, reached through Jest's dependencies, as a strict
 * pnpm layout hides it from everything but Jest.
 */
function loadCircus(rootDir: string): TestFramework {
  const chains = [["jest-circus/runner"], ["jest-config", "jest-circus/runner"], ["jest", "@jest/core", "jest-config", "jest-circus/runner"]];
  for (const from of [join(rootDir, "package.json"), import.meta.filename]) {
    for (const chain of chains) {
      try {
        let require = createRequire(from);
        for (const pkg of chain.slice(0, -1)) require = createRequire(require.resolve(`${pkg}/package.json`));
        const mod = require(chain.at(-1)!) as TestFramework | { default: TestFramework };
        return typeof mod === "function" ? mod : mod.default;
      } catch {}
    }
  }
  throw new Error("@ctrl/sentry-tests/jest-runner: cannot find jest-circus, Jest's default test runner.");
}

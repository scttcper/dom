// Jest's test runner (jest-circus), with each test file recorded as spans:
//
//   testRunner: "@ctrl/sentry-tests/jest-runner"
//
// jest-circus hands its events to the environment's handleTestEvent, so wrapping that before the
// file starts works under any environment (jsdom, node, @ctrl/dom). It only collects when the
// reporter (jest.ts) is on: the reporter sets SENTRY_TESTS_DIR before Jest starts its workers, and
// the runner writes each file's data there.

import { createRequire } from "node:module";
import { createJestCollector, type JestCollector } from "./jest-collector.ts";

interface Environment {
  global?: { document?: unknown };
  handleTestEvent?: (event: Parameters<JestCollector["handleTestEvent"]>[0], state: unknown) => void | Promise<void>;
}

/** jest-circus/runner's signature (Jest's TestFramework); the package ships no types for it. */
type TestFramework = (
  globalConfig: unknown,
  config: unknown,
  environment: Environment,
  runtime: unknown,
  testPath: string,
  sendMessageToJest?: unknown,
) => Promise<unknown>;

const circus = (createRequire(import.meta.url)("jest-circus/runner") as { default: TestFramework }).default;

export default async function sentryTestsRunner(...args: Parameters<TestFramework>): Promise<unknown> {
  const dir = process.env.SENTRY_TESTS_DIR;
  if (!dir) return circus(...args);
  const [, , environment, , testPath] = args;
  const collector = createJestCollector({ dir, testPath, getDocument: () => environment.global?.document });
  // jest-circus binds handleTestEvent when the file starts, after the environment's setup().
  const previous = environment.handleTestEvent;
  environment.handleTestEvent = async function (this: Environment, event, state) {
    await previous?.call(this, event, state);
    await collector.handleTestEvent(event);
  };
  try {
    return await circus(...args);
  } finally {
    collector.finish();
  }
}

// One cold-start sample, in a fresh process (spawned by startup.ts):
//
//   node --expose-gc [--import <contender preload>] lib/startup-worker.ts <contender>
//
// What a Vitest worker pays per test file before the first assertion: the environment (its
// module and the DOM it imports, the window, the globals; `Environment.setup`, the same code
// Vitest runs), then the first test (React, the Testing Library stack, a render and a role
// query). Prints one `@@RESULT <json>` line.

import { CONTENDERS } from "../contenders/index.ts";

const id = process.argv[2];
const contender = CONTENDERS.find((c) => c.id === id);
if (contender === undefined) throw new Error(`unknown contender ${id}`);

// A Vitest worker has its runtime loaded before it sets up the environment.
await import("vitest/runtime");

const now = () => Number(process.hrtime.bigint()) / 1e6;

const t0 = now();
const environment = await contender.loadEnvironment();
const { teardown } = await environment.setup(globalThis as never, contender.environmentOptions ?? {});
const t1 = now();

const React = await import("react");
const { render, screen, cleanup } = await import(contender.imports.react);
render(React.createElement("button", { type: "button" }, "Hello"));
if (screen.getByRole("button", { name: "Hello" }).textContent !== "Hello")
  throw new Error("first render did not produce the button");
cleanup();
const t2 = now();

const gc = (globalThis as { gc?: () => void }).gc;
gc?.();
gc?.();
const memory = process.memoryUsage();
console.log(
  `@@RESULT ${JSON.stringify({ setupMs: t1 - t0, firstTestMs: t2 - t1, heapMB: memory.heapUsed / 2 ** 20, rssMB: memory.rss / 2 ** 20 })}`,
);
await teardown(globalThis as never);

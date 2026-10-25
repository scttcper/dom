// node packages/vitest-environment/bench/run.ts [files=40] [rounds=3]
// Runs the fixture suite under each environment in a fresh process per round and prints
// Vitest's per-file environment setup time (median/min/max/sum) and wall time.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const files = Number(process.argv[2] ?? 40);
const rounds = Number(process.argv[3] ?? 3);

rmSync(`${here}fixtures`, { recursive: true, force: true });
mkdirSync(`${here}fixtures`);
for (let i = 0; i < files; i++) {
  writeFileSync(
    `${here}fixtures/f${i}.test.tsx`,
    `import { expect, test } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

function Counter() {
  const [n, setN] = useState(${i});
  return <button onClick={() => setN(n + 1)}>count {n}</button>;
}

test("counter ${i}", () => {
  render(<Counter />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button").textContent).toBe("count ${i + 1}");
  cleanup();
});
`,
  );
}

const envs = ["jsdom", "happy-dom", "ctrl-dom"];
for (let r = 0; r < rounds; r++) {
  for (const env of r % 2 === 0 ? envs : envs.toReversed()) {
    const t = performance.now();
    const { stdout: out } = spawnSync("pnpm", ["exec", "vitest", "run", "--config", `${here}vitest.config.ts`], {
      env: { ...process.env, CTRL_DOM_BENCH_ENV: env },
      encoding: "utf8",
      cwd: `${here}..`,
    });
    const line = out.split("\n").find((l) => l.startsWith("ENV "));
    console.log(`${line}  wall=${(performance.now() - t).toFixed(0)}ms`);
  }
}

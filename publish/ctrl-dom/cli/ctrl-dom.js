#!/usr/bin/env node
// `npx ctrl-dom debug <test file> [-t name]`: run one component test the way a coding agent wants
// to read it. Detects Vitest or Jest in the project, runs just that file with CTRL_DOM_DEBUG=aria
// (accessibility snapshots instead of HTML dumps, closest matches on failed queries, a snapshot of
// the page when a test fails) and prints a compact plain-text report through its own reporter
// (./vitest-reporter.js, ./jest-reporter.js). Exits with the test run's status.
//
// A thin wrapper: Node built-ins only, and the test runner is the project's own.
// See docs/agent-debugging.md in the repository.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));

const USAGE = `Usage: ctrl-dom debug <test file>... [options] [-- <runner args>]

Runs the test file(s) with Vitest or Jest (whichever the project uses) and CTRL_DOM_DEBUG=aria,
and prints a compact report: each failure with its message (closest matches for failed queries,
the accessibility snapshot of the page when the test failed), console output, and a summary.
Exits with the test run's status.

Options:
  -t, --test-name <pattern>   only run tests whose name matches (Vitest/Jest -t)
      --runner <vitest|jest>  skip detection
      --config <file>         the runner's config file
      --format <aria|compact> CTRL_DOM_DEBUG value (default aria)
      --lines <n>             CTRL_DOM_DEBUG_LINES: line budget for snapshots
      --raw                   the runner's own output instead of the compact report
  -h, --help                  this help

Example:
  npx ctrl-dom debug src/Checkout.test.tsx -t "submits the form"
`;

function fail(message) {
  process.stderr.write(`ctrl-dom: ${message}\n`);
  process.exit(2);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The nearest directory at or above `from` with a package.json. */
function projectRoot(from) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) return dir;
    if (dirname(dir) === dir) return resolve(from);
  }
}

const CONFIGS = {
  vitest: [
    "vitest.config.ts",
    "vitest.config.mts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vitest.config.cts",
    "vitest.config.cjs",
    "vitest.workspace.ts",
  ],
  jest: [
    "jest.config.js",
    "jest.config.cjs",
    "jest.config.mjs",
    "jest.config.ts",
    "jest.config.mts",
    "jest.config.json",
  ],
};

/** Vitest or Jest: from --config's name, the test files' imports, config files, then dependencies. */
export function detectRunner(root, files, config) {
  if (config !== undefined) {
    const name = config.split(/[\\/]/).pop();
    if (/^(vitest|vite)\./.test(name)) return "vitest";
    if (name.startsWith("jest.")) return "jest";
  }
  for (const file of files) {
    let source = "";
    try {
      source = readFileSync(resolve(file), "utf8");
    } catch {}
    if (/from\s+["']vitest["']|require\(["']vitest["']\)/.test(source)) return "vitest";
    if (/from\s+["']@jest\/globals["']|require\(["']@jest\/globals["']\)/.test(source)) return "jest";
  }
  const pkg = readJson(join(root, "package.json")) ?? {};
  const hasConfig = (runner) =>
    CONFIGS[runner].some((name) => existsSync(join(root, name))) || (runner === "jest" && pkg.jest !== undefined);
  if (hasConfig("vitest") && !hasConfig("jest")) return "vitest";
  if (hasConfig("jest") && !hasConfig("vitest")) return "jest";
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.vitest && !deps.jest) return "vitest";
  if (deps.jest && !deps.vitest) return "jest";
  if (hasConfig("vitest") || deps.vitest) return "vitest";
  if (["vite.config.ts", "vite.config.js", "vite.config.mjs"].some((name) => existsSync(join(root, name))))
    return "vitest";
  return null;
}

/** The runner's CLI script, resolved from the project (its `bin` entry). */
function runnerBin(root, runner) {
  const require = createRequire(join(root, "package.json"));
  let pkgPath;
  try {
    pkgPath = require.resolve(`${runner}/package.json`);
  } catch {
    fail(`${runner} is not installed in ${root}`);
  }
  const pkg = readJson(pkgPath);
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[runner];
  if (!bin) fail(`cannot find ${runner}'s CLI in ${pkgPath}`);
  return join(dirname(pkgPath), bin);
}

export function main(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (command !== "debug") fail(`unknown command "${command}"\n\n${USAGE}`);
  const dashDash = rest.indexOf("--");
  const own = dashDash < 0 ? rest : rest.slice(0, dashDash);
  const passthrough = dashDash < 0 ? [] : rest.slice(dashDash + 1);
  let parsed;
  try {
    parsed = parseArgs({
      args: own,
      allowPositionals: true,
      options: {
        "test-name": { type: "string", short: "t" },
        runner: { type: "string" },
        config: { type: "string" },
        format: { type: "string", default: "aria" },
        lines: { type: "string" },
        raw: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`);
  }
  const { values, positionals: files } = parsed;
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (files.length === 0) fail(`no test file given\n\n${USAGE}`);
  if (!["aria", "compact"].includes(values.format)) fail(`--format must be aria or compact`);
  const root = projectRoot(process.cwd());
  const runner = values.runner ?? detectRunner(root, files, values.config);
  if (runner !== "vitest" && runner !== "jest")
    fail(runner ? `--runner must be vitest or jest` : `cannot tell whether ${root} uses Vitest or Jest: pass --runner`);

  const args = [runnerBin(root, runner)];
  if (runner === "vitest") {
    args.push("run", ...files);
    if (values.config) args.push("--config", values.config);
    if (values["test-name"] !== undefined) args.push("-t", values["test-name"]);
    if (!values.raw) args.push(`--reporter=${join(here, "vitest-reporter.js")}`);
  } else {
    // Exact paths rather than Jest's default path regexes (`[id].test.tsx` stays a path).
    args.push("--runTestsByPath", ...files.map((file) => resolve(file)), "--ci");
    if (values.config) args.push("--config", values.config);
    if (values["test-name"] !== undefined) args.push("-t", values["test-name"]);
    if (!values.raw) args.push(`--reporters=${join(here, "jest-reporter.js")}`);
  }
  args.push(...passthrough);

  const env = { ...process.env, CTRL_DOM_DEBUG: values.format, FORCE_COLOR: "0", NO_COLOR: "1" };
  if (values.lines !== undefined) env.CTRL_DOM_DEBUG_LINES = values.lines;
  process.stdout.write(
    `ctrl-dom debug: ${runner} ${files.join(" ")}${values["test-name"] !== undefined ? ` -t ${JSON.stringify(values["test-name"])}` : ""} (CTRL_DOM_DEBUG=${values.format})\n\n`,
  );
  const run = spawnSync(process.execPath, args, { cwd: process.cwd(), env, stdio: "inherit" });
  if (run.error) fail(run.error.message);
  return run.status ?? 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));

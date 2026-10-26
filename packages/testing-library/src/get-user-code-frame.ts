// Port of @testing-library/dom src/get-user-code-frame.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/get-user-code-frame.js
//
// Upstream loads @babel/code-frame and picocolors at import time; here @babel/code-frame loads
// on the first call (only `logDOM`/`screen.debug` use this) and picocolors' `dim` is inlined.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Upstream skips its own frames because they live under node_modules/. In this monorepo the
// package is not under node_modules, so frames from this package's directory are skipped too.
const OWN_DIR = new URL("./", import.meta.url).pathname;

let codeFrameColumns: any = null;

// picocolors@1.1.1 `dim` (ISC, Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov; NOTICE), with
// its color detection. A file location never contains the close code, so no re-opening.
const env = process.env;
const argv = process.argv;
const isColorSupported =
  !(!!env.NO_COLOR || argv.includes("--no-color")) &&
  (!!env.FORCE_COLOR ||
    argv.includes("--color") ||
    process.platform === "win32" ||
    (process.stdout?.isTTY && env.TERM !== "dumb") ||
    !!env.CI);

function dim(input: string): string {
  return isColorSupported ? `\x1b[2m${input}\x1b[22m` : input;
}

// frame has the form "at myMethod (location/to/my/file.js:10:2)"
function getCodeFrame(frame: string): string {
  codeFrameColumns ??= createRequire(import.meta.url)("@babel/code-frame").codeFrameColumns;
  const locationStart = frame.indexOf("(") + 1;
  const locationEnd = frame.indexOf(")");
  const frameLocation = frame.slice(locationStart, locationEnd);

  const frameLocationElements = frameLocation.split(":");
  const [filename, line, column] = [
    frameLocationElements[0],
    parseInt(frameLocationElements[1], 10),
    parseInt(frameLocationElements[2], 10),
  ];

  let rawFileContents = "";
  try {
    rawFileContents = readFileSync(filename, "utf-8");
  } catch {
    return "";
  }

  // Stack columns count from 1, @babel/code-frame 8's from 0 (upstream's 7 took them as is).
  const codeFrame = codeFrameColumns(
    rawFileContents,
    { start: { line, column: column - 1 } },
    { highlightCode: true, linesBelow: 0 },
  );
  return `${dim(frameLocation)}\n${codeFrame}\n`;
}

export function getUserCodeFrame(): string {
  const err = new Error();
  const firstClientCodeFrame = err
    .stack!.split("\n")
    .slice(1) // Remove first line which has the form "Error: TypeError"
    .find((frame) => !frame.includes("node_modules/") && !frame.includes(OWN_DIR)); // Ignore frames from 3rd party libraries

  return getCodeFrame(firstClientCodeFrame!);
}

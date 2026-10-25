// Port of @testing-library/dom src/get-user-code-frame.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/get-user-code-frame.js
//
// Upstream loads @babel/code-frame and picocolors at import time; here they load on the
// first call (only `logDOM`/`screen.debug` use this).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Upstream skips its own frames because they live under node_modules/. In this monorepo the
// package is not under node_modules, so frames from this package's directory are skipped too.
const OWN_DIR = new URL("./", import.meta.url).pathname;

let deps: { codeFrameColumns: any; picocolors: any } | null | undefined;

function loadDeps() {
  if (deps !== undefined) return deps;
  try {
    const req = createRequire(import.meta.url);
    deps = {
      codeFrameColumns: req("@babel/code-frame").codeFrameColumns,
      picocolors: req("picocolors"),
    };
  } catch {
    // We're in a browser environment
    deps = null;
  }
  return deps;
}

// frame has the form "at myMethod (location/to/my/file.js:10:2)"
function getCodeFrame(frame: string): string {
  const { codeFrameColumns, picocolors } = loadDeps()!;
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

  const codeFrame = codeFrameColumns(
    rawFileContents,
    { start: { line, column } },
    { highlightCode: true, linesBelow: 0 },
  );
  return `${picocolors.dim(frameLocation)}\n${codeFrame}\n`;
}

export function getUserCodeFrame(): string {
  // If we couldn't load dependencies, we can't generate the user trace
  const d = loadDeps();
  if (!d || !readFileSync || !d.codeFrameColumns) {
    return "";
  }
  const err = new Error();
  const firstClientCodeFrame = err
    .stack!.split("\n")
    .slice(1) // Remove first line which has the form "Error: TypeError"
    .find((frame) => !frame.includes("node_modules/") && !frame.includes(OWN_DIR)); // Ignore frames from 3rd party libraries

  return getCodeFrame(firstClientCodeFrame!);
}

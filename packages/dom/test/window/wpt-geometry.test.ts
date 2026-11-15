/**
 * Geometry interfaces — web-platform-tests css/geometry, run unmodified through
 * test/wpt/harness.ts.
 *
 * Spec: Geometry Interfaces Module Level 1
 *   - §2 The DOMPoint interfaces: https://drafts.csswg.org/geometry/#DOMPoint
 *   - §3 The DOMRect interfaces: https://drafts.csswg.org/geometry/#DOMRect
 *   - §4 The DOMRectList interface: https://drafts.csswg.org/geometry/#domrectlist
 *   - §5 The DOMQuad interface: https://drafts.csswg.org/geometry/#DOMQuad
 *   - §6 The DOMMatrix interfaces: https://drafts.csswg.org/geometry/#DOMMatrix
 *   - Parsing a string into an abstract matrix: https://drafts.csswg.org/geometry/#parse-a-string-into-an-abstract-matrix
 *   - Validate and fixup: https://drafts.csswg.org/geometry/#matrix-validate-and-fixup
 *   - The stringifier: https://drafts.csswg.org/geometry/#dommatrixreadonly-stringification-behavior
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/css/geometry
 * (vendored from web-platform-tests/wpt@8d23aa0, 3-clause BSD, under test/wpt/fixtures).
 *
 * Not vendored: DOMMatrix2DInit-validate-fixup
 * (drives CanvasRenderingContext2D.setTransform and compares toDataURL output: no canvas),
 * DOMMatrix-css-string.worker.js and WebKitCSSMatrix.worker.js (workers),
 * structured-serialization (structuredClone is Node's, so geometry objects clone to plain objects
 * and DOMRectList does not throw DataCloneError: docs/deviations.md "Window"; half the file is
 * DOMQuad) and idlharness.any.js (needs WebIDLParser.js / idlharness.js). Hand-written tests for
 * the steps WPT leaves out are in geometry.test.ts.
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

const G = "css/geometry";

describe("The DOMPoint interfaces — https://drafts.csswg.org/geometry/#DOMPoint", () => {
  for (const name of ["DOMPoint-001", "DOMPoint-002", "DOMPoint-matrixTransform-translation-w"]) {
    defineWPT(`${G}/${name}.html`);
  }
});

describe("The DOMRect interfaces — https://drafts.csswg.org/geometry/#DOMRect", () => {
  for (const name of ["DOMRect-001", "DOMRect-002", "DOMRect-nan"]) {
    defineWPT(`${G}/${name}.html`);
  }
});

describe("The DOMRectList interface — https://drafts.csswg.org/geometry/#domrectlist", () => {
  // getClientRects() needs layout to return a box.
  defineWPT(`${G}/DOMRectList.html`, "", { windowOptions: { layout: "lite" } });
});

describe("The DOMQuad interface — https://drafts.csswg.org/geometry/#DOMQuad", () => {
  for (const name of ["DOMQuad-001", "DOMQuad-002", "DOMQuad-nan"]) {
    defineWPT(`${G}/${name}.html`);
  }
});

describe("The DOMMatrix interfaces — https://drafts.csswg.org/geometry/#DOMMatrix", () => {
  // DOMMatrix-002 (operations leave the receiver unchanged) and DOMMatrix-003 (their results)
  // cover every DOMMatrixReadOnly operation, each of which runs the matching *Self steps on a copy:
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-translate
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-scale
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-scale3d
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-rotate
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-rotatefromvector
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-rotateaxisangle
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-skewx
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-skewy
  //   https://drafts.csswg.org/geometry/#dom-dommatrix-skewyself
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-multiply
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-flipy
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-inverse
  //   https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-transformpoint
  //   https://drafts.csswg.org/geometry/#transform-a-point-with-a-matrix
  // DOMMatrix-attributes and DOMMatrix-invert-* cover is2D / isIdentity
  // (https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-is2d,
  // https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-isidentity); DOMMatrixInit-validate-fixup
  // covers fromMatrix() and multiplySelf() with DOMMatrix2DInit / DOMMatrixInit dictionaries
  // (https://drafts.csswg.org/geometry/#dictdef-dommatrix2dinit,
  // https://drafts.csswg.org/geometry/#dictdef-dommatrixinit,
  // https://drafts.csswg.org/geometry/#dom-dommatrixreadonly-frommatrix,
  // https://drafts.csswg.org/geometry/#dom-dommatrix-frommatrix,
  // https://drafts.csswg.org/geometry/#dom-dommatrix-multiplyself).
  for (const name of [
    "DOMMatrix-002",
    "DOMMatrix-003",
    "DOMMatrix-a-f-alias",
    "DOMMatrix-attributes",
    "DOMMatrix-invert-invertible",
    "DOMMatrix-invert-non-invertible",
    "DOMMatrix-invertSelf",
    "DOMMatrixInit-validate-fixup",
  ]) {
    defineWPT(`${G}/${name}.html`);
  }
  defineWPT(`${G}/DOMMatrix-001.html`);
  defineWPT(`${G}/DOMMatrix-invert-preserves-2d.html`);
  defineWPT(`${G}/DOMMatrix-newobject.html`);
  defineWPT(`${G}/DOMMatrix-stringifier.html`);
  defineWPT(
    `${G}/WebKitCSSMatrix.html`,
    "deviation: interface objects are shared classes installed once on Window.prototype, not own properties of each window (docs/deviations.md, Window), so getOwnPropertyDescriptor(window, name) is undefined",
  );
});

describe("Changes from earlier publications — https://drafts.csswg.org/geometry/#changes", () => {
  defineWPT(`${G}/historical.html`);
  defineWPT(`${G}/spec-examples.html`);
});

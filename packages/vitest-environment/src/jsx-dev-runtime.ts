// React's development JSX runtime as an ES module without a default export, published as
// `@ctrl/dom/vitest-environment/jsx-dev-runtime`: what ./jsx-runtime.ts is for `react/jsx-runtime`
// (the reason is there), for the `jsxDEV` calls a development JSX transform emits.
import * as runtime from "react/jsx-dev-runtime";

// Node gives a CommonJS module's `module.exports` as `default`.
const react = (runtime as unknown as { default?: typeof runtime }).default ?? runtime;

export const Fragment: typeof runtime.Fragment = react.Fragment;
export const jsxDEV: typeof runtime.jsxDEV = react.jsxDEV;

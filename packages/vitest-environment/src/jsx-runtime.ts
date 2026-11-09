// React's JSX runtime as an ES module without a default export, published as
// `@ctrl/dom/vitest-environment/jsx-runtime`. The ctrlDom() plugin (./plugin.ts, `jsxRuntime`)
// resolves `react/jsx-runtime` here for test and application code.
//
// Vitest loads a CommonJS dependency through Node and hands the code it transforms a Proxy over
// the namespace, so that default and named imports both work (vitest's module-evaluator,
// `shouldInterop`: any module that is not `.mjs` and has a `default`). React's JSX runtime is
// CommonJS, so every element a test or component creates called `jsx` through that Proxy's `get`
// trap: 3.5% of the CPU of Base UI's suite, and a hooks-heavy render is 8% faster without it.
// A module with only named exports gets no Proxy.
import * as runtime from "react/jsx-runtime";

// Node gives a CommonJS module's `module.exports` as `default`.
const react = (runtime as unknown as { default?: typeof runtime }).default ?? runtime;

export const Fragment: typeof runtime.Fragment = react.Fragment;
export const jsx: typeof runtime.jsx = react.jsx;
export const jsxs: typeof runtime.jsxs = react.jsxs;

// testEnvironment for the react-router downstream runner's `ctrl-dom` / `ctrl-dom-full` modes:
// `@ctrl/dom-jest-environment` (packages/jest-environment) unchanged.
//
// Why a `.mjs` re-export instead of pointing `testEnvironment` at src/index.ts directly (same as
// downstream/react-aria): Jest loads the environment through the project's `transform`, and
// upstream compiles every `.tsx?` file with @swc/jest, which would recompile @ctrl/dom-jest-environment
// and @ctrl/dom's sources into CommonJS. A `.mjs` file matches no transform pattern and Node 26
// `require(esm)`s it natively, so the environment and @ctrl/dom load once per worker, in the outer
// realm, exactly as Node runs them in `pnpm test`.
export { default, TestEnvironment, CTRL_DOM_MODULES } from "../../packages/jest-environment/src/index.ts";

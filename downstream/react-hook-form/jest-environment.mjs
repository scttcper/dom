// testEnvironment for the react-hook-form downstream runner's `rtd-dom` / `rtd-full` modes:
// `jest-environment-rtd` (packages/jest-environment) unchanged.
//
// Why a `.mjs` re-export instead of pointing `testEnvironment` at src/index.ts directly (same as
// downstream/react-aria): Jest loads the environment through the project's `transform`, and
// upstream compiles every `.tsx?` file with @swc/jest, which would recompile jest-environment-rtd
// and @rtd/dom's sources into CommonJS. A `.mjs` file matches no transform pattern and Node 26
// `require(esm)`s it natively, so the environment and @rtd/dom load once per worker, in the outer
// realm, exactly as Node runs them in `pnpm test`.
export { default, TestEnvironment, RTD_MODULES } from "../../packages/jest-environment/src/index.ts";

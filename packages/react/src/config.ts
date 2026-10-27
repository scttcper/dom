// Port of @testing-library/react@16.3.3 src/config.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/config.js

import { configure as configureDTL, getConfig as getConfigDTL, type Config as ConfigDTL } from "./dtl.ts";

export interface Config extends ConfigDTL {
  reactStrictMode: boolean;
  /**
   * Ours (not upstream): when a component suspends on data inside render(), rerender(), a hydrate
   * or an event, reveal the content once the data resolves (default `true`). React 19 otherwise
   * leaves the boundary on its fallback; this relies on React internals (see act-compat.ts).
   * `false` behaves exactly like stock @testing-library/react.
   */
  releaseSuspendedWork: boolean;
}

export interface ConfigFn {
  (existingConfig: Config): Partial<Config>;
}

let configForRTL: { reactStrictMode: boolean | undefined; releaseSuspendedWork: boolean } = {
  reactStrictMode: false,
  releaseSuspendedWork: true,
};

/** `releaseSuspendedWork` without building the merged config (read on every RTL act). */
export function releaseSuspendedWorkEnabled(): boolean {
  return configForRTL.releaseSuspendedWork;
}

export function getConfig(): Config {
  return {
    ...getConfigDTL(),
    ...configForRTL,
  } as Config;
}

export function configure(newConfig: ConfigFn | Partial<Config>): void {
  if (typeof newConfig === "function") {
    // Pass the existing config out to the provided function and accept a delta in return.
    newConfig = newConfig(getConfig());
  }
  const { reactStrictMode, releaseSuspendedWork, ...configForDTL } = newConfig;
  configureDTL(configForDTL);
  configForRTL = {
    ...configForRTL,
    reactStrictMode,
    // Unlike upstream's reactStrictMode, a configure() call that leaves it out keeps it.
    releaseSuspendedWork: releaseSuspendedWork ?? configForRTL.releaseSuspendedWork,
  };
}

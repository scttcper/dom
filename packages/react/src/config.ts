// Port of @testing-library/react@16.3.3 src/config.js
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/config.js

import { configure as configureDTL, getConfig as getConfigDTL, type Config as ConfigDTL } from "./dtl.ts";

export interface Config extends ConfigDTL {
  reactStrictMode: boolean;
}

export interface ConfigFn {
  (existingConfig: Config): Partial<Config>;
}

let configForRTL: { reactStrictMode: boolean | undefined } = {
  reactStrictMode: false,
};

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
  const { reactStrictMode, ...configForDTL } = newConfig;
  configureDTL(configForDTL);
  configForRTL = {
    ...configForRTL,
    reactStrictMode,
  };
}

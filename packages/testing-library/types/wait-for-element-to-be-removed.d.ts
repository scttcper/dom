import {waitForOptions} from './wait-for.js'

export function waitForElementToBeRemoved<T>(
  callback: T | (() => T),
  options?: waitForOptions,
): Promise<void>

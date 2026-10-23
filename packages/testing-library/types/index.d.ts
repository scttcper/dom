// Ported from @testing-library/dom@10.4.2 types/ (MIT) — https://github.com/testing-library/dom-testing-library/tree/main/types
// TypeScript Version: 3.8

import {getQueriesForElement} from './get-queries-for-element.js'
import * as queries from './queries.js'
import * as queryHelpers from './query-helpers.js'

declare const within: typeof getQueriesForElement
export {queries, queryHelpers, within}

export * from './queries.js'
export * from './query-helpers.js'
export * from './screen.js'
export * from './wait-for.js'
export * from './wait-for-element-to-be-removed.js'
export * from './matches.js'
export * from './get-node-text.js'
export * from './events.js'
export * from './get-queries-for-element.js'
export * from './pretty-dom.js'
export * from './role-helpers.js'
export * from './config.js'
export * from './suggestions.js'

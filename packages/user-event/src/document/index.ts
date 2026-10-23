// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/document/index.ts

export {
  getUISelection,
  getUIValue,
  setUISelection,
  setUIValue,
  clearInitialValue,
} from './UI.ts'
export type {UISelectionRange} from './UI.ts'
export {getValueOrTextContent} from './getValueOrTextContent.ts'
export {copySelection} from './copySelection.ts'
export {commitValueAfterInput} from './trackValue.ts'

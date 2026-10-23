// Divergence from upstream: upstream's tests import `getConfig`/`configure` from
// `@testing-library/dom`. @rtd/user-event reads its config from `@rtd/testing-library` when that
// loads (falling back to `@testing-library/dom`), so tests configure whichever module user-event
// actually uses.

import {dtlModule} from '../../../src/setup/dtl.ts'

if (dtlModule === null) {
  throw new Error('no Testing Library DOM module available for tests')
}

export const getConfig = dtlModule.getConfig
export const configure = dtlModule.configure

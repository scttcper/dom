// Divergence from upstream: upstream's React tests render with `@testing-library/react`, which
// configures `@testing-library/dom`'s `asyncWrapper`/`eventWrapper` with React's `act`.
// @rtd/user-event reads that config from `@rtd/testing-library` when it loads (see
// src/setup/dtl.ts), so the React tests render with the adapter matching the environment:
// - on @rtd/dom (RTD_STACK=rtd): `@rtd/react`, which configures @rtd/testing-library;
// - on jsdom: `@testing-library/react` (@rtd/testing-library only accepts @rtd/dom nodes), and
//   when user-event reads a different Testing Library module than the one stock RTL
//   configures, that module's wrappers forward to stock's.

import {dtlModule, dtlSource} from '../../../src/setup/dtl.ts'
import {implOf} from '../../../src/rtd.ts'

type RTL = typeof import('@testing-library/react')

async function pickAdapter(): Promise<RTL> {
  const doc = (globalThis as {document?: object}).document
  if (implOf(doc as never) !== null) {
    return (await import('@rtd/react' as string)) as RTL
  }
  const stock = await import('@testing-library/react')
  if (dtlSource !== '@testing-library/dom' && dtlModule !== null) {
    const stockDTL = await import('@testing-library/dom')
    dtlModule.configure({
      asyncWrapper: cb => stockDTL.getConfig().asyncWrapper(cb),
      eventWrapper: cb => stockDTL.getConfig().eventWrapper(cb) as never,
    })
  }
  return stock
}

const rtl = await pickAdapter()

export const {render, screen, waitFor, act, cleanup, fireEvent, renderHook} = rtl

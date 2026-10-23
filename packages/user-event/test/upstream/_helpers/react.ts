// Divergence from upstream: upstream's React tests render with `@testing-library/react`, which
// configures `@testing-library/dom`'s `asyncWrapper`/`eventWrapper` with React's `act`.
// @rtd/user-event reads that config from `@rtd/testing-library` when it loads (see
// src/setup/dtl.ts), so the React tests render with the adapter matching the environment:
// - on @rtd/dom (RTD_STACK=rtd): `@rtd/react`, which configures @rtd/testing-library;
// - on jsdom: `@testing-library/react` (@rtd/testing-library only accepts @rtd/dom nodes);
//   user-event then reads stock @testing-library/dom's config (mixed-setup fallback).

import {implOf} from '../../../src/rtd.ts'

type RTL = typeof import('@testing-library/react')

async function pickAdapter(): Promise<RTL> {
  const doc = (globalThis as {document?: object}).document
  if (implOf(doc as never) !== null) {
    return (await import('@rtd/react' as string)) as RTL
  }
  // Stock RTL configures stock @testing-library/dom; user-event falls back to its config
  // while @rtd/testing-library's is unconfigured (src/setup/dtl.ts `resolveConfigSource`).
  const stock = await import('@testing-library/react')
  return stock
}

const rtl = await pickAdapter()

export const {render, screen, waitFor, act, cleanup, fireEvent, renderHook} = rtl

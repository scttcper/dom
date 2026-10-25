// Divergence from upstream: upstream's React tests render with `@testing-library/react`, which
// configures `@testing-library/dom`'s `asyncWrapper`/`eventWrapper` with React's `act`.
// @ctrl/dom/user-event reads that config from `@ctrl/dom/testing-library` when it loads (see
// src/setup/dtl.ts), so the React tests render with the adapter matching the environment:
// - on @ctrl/dom (CTRL_DOM_STACK=ctrl-dom): `@ctrl/dom/react`, which configures @ctrl/dom/testing-library;
// - on jsdom: `@testing-library/react` (@ctrl/dom/testing-library only accepts @ctrl/dom nodes);
//   user-event then reads stock @testing-library/dom's config (mixed-setup fallback).

import {implOf} from '../../../src/ctrl-dom.ts'

type RTL = typeof import('@testing-library/react')

async function pickAdapter(): Promise<RTL> {
  const doc = (globalThis as {document?: object}).document
  if (implOf(doc as never) !== null) {
    return (await import('@ctrl/dom/react' as string)) as RTL
  }
  // Stock RTL configures stock @testing-library/dom; user-event falls back to its config
  // while @ctrl/dom/testing-library's is unconfigured (src/setup/dtl.ts `resolveConfigSource`).
  const stock = await import('@testing-library/react')
  return stock
}

const rtl = await pickAdapter()

export const {render, screen, waitFor, act, cleanup, fireEvent, renderHook} =
  rtl

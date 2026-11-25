// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/system/index.ts

import type {EventModifierInit} from '../dom-types.ts'
import {KeyboardHost} from './keyboard.ts'
import {PointerHost} from './pointer/index.ts'

/**
 * @internal Do not create/alter this by yourself as this type might be subject to changes.
 */
export class System {
  readonly keyboard = new KeyboardHost(this)
  #pointer?: PointerHost

  get pointer(): PointerHost {
    return (this.#pointer ??= new PointerHost(this))
  }

  /** Write the modifier members into `init` (no intermediate object; see createEvent). */
  assignUIEventModifiers(init: Record<string, unknown>): void {
    const m = this.keyboard.modifiers
    init.altKey = m.Alt
    init.ctrlKey = m.Control
    init.metaKey = m.Meta
    init.shiftKey = m.Shift
    init.modifierAltGraph = m.AltGraph
    init.modifierCapsLock = m.CapsLock
    init.modifierFn = m.Fn
    init.modifierFnLock = m.FnLock
    init.modifierNumLock = m.NumLock
    init.modifierScrollLock = m.ScrollLock
    init.modifierSymbol = m.Symbol
    init.modifierSymbolLock = m.SymbolLock
  }

  /** Upstream's API (dispatchUIEvent no longer uses it): the members above, in the same order. */
  getUIEventModifiers(): EventModifierInit {
    const init: Record<string, unknown> = {}
    this.assignUIEventModifiers(init)
    return init
  }
}

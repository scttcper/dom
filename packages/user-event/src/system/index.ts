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
  readonly pointer = new PointerHost(this)

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

  getUIEventModifiers(): EventModifierInit {
    return {
      altKey: this.keyboard.modifiers.Alt,
      ctrlKey: this.keyboard.modifiers.Control,
      metaKey: this.keyboard.modifiers.Meta,
      shiftKey: this.keyboard.modifiers.Shift,
      modifierAltGraph: this.keyboard.modifiers.AltGraph,
      modifierCapsLock: this.keyboard.modifiers.CapsLock,
      modifierFn: this.keyboard.modifiers.Fn,
      modifierFnLock: this.keyboard.modifiers.FnLock,
      modifierNumLock: this.keyboard.modifiers.NumLock,
      modifierScrollLock: this.keyboard.modifiers.ScrollLock,
      modifierSymbol: this.keyboard.modifiers.Symbol,
      modifierSymbolLock: this.keyboard.modifiers.SymbolLock,
    }
  }
}

// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utility/type.ts

import type {Element} from '../dom-types.ts'
import {type Instance} from '../setup/index.ts'
import {releaseAllKeys} from '../keyboard/index.ts'
import {setSelectionRange} from '../event/selection/index.ts'
import {type Options} from '../options.ts'

export interface typeOptions {
  skipClick?: Options['skipClick']
  skipAutoClose?: Options['skipAutoClose']
  initialSelectionStart?: number
  initialSelectionEnd?: number
}

export async function type(
  this: Instance,
  element: Element,
  text: string,
  {
    skipClick = this.config.skipClick,
    skipAutoClose = this.config.skipAutoClose,
    initialSelectionStart,
    initialSelectionEnd,
  }: typeOptions = {},
): Promise<void> {
  // TODO: properly type guard
  // we use this workaround for now to prevent changing behavior
  if ((element as {disabled?: boolean}).disabled) return

  if (!skipClick) {
    await this.click(element)
  }

  if (initialSelectionStart !== undefined) {
    setSelectionRange(
      element,
      initialSelectionStart,
      initialSelectionEnd ?? initialSelectionStart,
    )
  }

  await this.keyboard(text)

  if (!skipAutoClose) {
    await releaseAllKeys(this)
  }
}

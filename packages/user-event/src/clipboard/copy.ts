// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/clipboard/copy.ts

import {copySelection} from '../document/index.ts'
import {type Instance} from '../setup/index.ts'
import {writeDataTransferToClipboard} from '../utils/index.ts'

export function copy(this: Instance) {
  return copyOrCut(this, 'copy')
}

/**
 * Ours: upstream's copy() and cut() (src/clipboard/cut.ts) are this body with their own event
 * (cut's default action, removing the selection, is its behavior plugin). Upstream's cut() writes
 * to `target.ownerDocument`, the document `target` came from.
 */
export async function copyOrCut(instance: Instance, type: 'copy' | 'cut') {
  const doc = instance.config.document
  const target = doc.activeElement ?? /* istanbul ignore next */ doc.body

  const clipboardData = copySelection(target)

  if (clipboardData.items.length === 0) {
    return
  }

  if (
    instance.dispatchUIEvent(target, type, {
      clipboardData,
    }) &&
    instance.config.writeToClipboard
  ) {
    await writeDataTransferToClipboard(doc, clipboardData)
  }

  return clipboardData
}

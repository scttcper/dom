// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utils/misc/getDocumentFromNode.ts

import type {Document, Node} from '../../dom-types.ts'
export function getDocumentFromNode(el: Node) {
  return isDocument(el) ? el : el.ownerDocument
}

function isDocument(node: Node): node is Document {
  return node.nodeType === 9
}

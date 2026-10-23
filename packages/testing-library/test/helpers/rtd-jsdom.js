// The slice of jsdom's `JSDOM` API that upstream's __node_tests__ use, backed by @rtd/dom
// windows that are NOT installed as globals ("works without a global dom").

import {createWindow} from '@rtd/dom'

export class JSDOM {
  constructor(html = '') {
    this.window = createWindow({url: 'http://localhost/', html})
  }

  // https://github.com/jsdom/jsdom#fragment
  static fragment(html) {
    const {document} = createWindow({url: 'http://localhost/'})
    const template = document.createElement('template')
    template.innerHTML = html
    return template.content
  }
}

// Not upstream. to-be-invalid.js builds standalone documents with `new JSDOM(html)` so that
// checkValidity() works; this builds them on whichever DOM the suite runs on.
const ctrlDom = process.env.CTRL_DOM_STACK === 'ctrl-dom' ? await import('@ctrl/dom') : null
const {JSDOM} = ctrlDom === null ? await import('jsdom') : {}

export function parseStandalone(htmlString) {
  if (ctrlDom !== null) return ctrlDom.createWindow({html: htmlString}).document
  return new JSDOM(htmlString).window.document
}

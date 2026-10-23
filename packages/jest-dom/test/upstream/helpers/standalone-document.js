// Not upstream. to-be-invalid.js builds standalone documents with `new JSDOM(html)` so that
// checkValidity() works; this builds them on whichever DOM the suite runs on.
const rtd = process.env.RTD_STACK === 'rtd' ? await import('@rtd/dom') : null
const {JSDOM} = rtd === null ? await import('jsdom') : {}

export function parseStandalone(htmlString) {
  if (rtd !== null) return rtd.createWindow({html: htmlString}).document
  return new JSDOM(htmlString).window.document
}

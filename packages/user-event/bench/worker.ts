// One benchmark sample in a fresh process: `node --expose-gc worker.ts <workload> <config> [iterations]`.
// Prints one JSON line: {perOpMs, heapMB, rssMB}.
//
// Configs:
//   stock-jsdom      stock @testing-library/user-event on jsdom        (what people run today)
//   stock-happy-dom  stock @testing-library/user-event on happy-dom
//   stock-ctrl-dom        stock @testing-library/user-event on @ctrl/dom     (swap only the DOM)
//   ctrl-dom-jsdom        @ctrl/dom/user-event on jsdom                          (isolates user-event)
//   ctrl-dom              @ctrl/dom/user-event on @ctrl/dom                       (the target)
// Append `:nodelay` to a config to run with `delay: null` (no yielding at all), which shows the
// CPU cost without timers.

const [workload, configArg, itersArg] = process.argv.slice(2)
const [config, variant] = configArg.split(':')
const iterations = Number(itersArg ?? 30)

const fields20 = Array.from({length: 20}, (_, i) => `<label>f${i}<input name="f${i}"></label>`).join('')
const options10 = Array.from({length: 10}, (_, i) => `<option value="v${i}">Option ${i}</option>`).join('')
const html = `<!doctype html><html><head></head><body>
<input id="text"/>
<button id="btn">Click</button>
<form id="form">${fields20}</form>
<select id="sel">${options10}</select>
</body></html>`

type Win = {document: any; close?(): void; happyDOM?: {close(): Promise<void>}}

async function makeWindow(): Promise<Win> {
  if (config.endsWith('jsdom')) {
    const {JSDOM} = await import('jsdom')
    return new JSDOM(html, {pretendToBeVisual: true}).window as unknown as Win
  }
  if (config.endsWith('happy-dom')) {
    const {Window} = await import('happy-dom')
    const w = new Window({url: 'http://localhost/'}) as unknown as Win
    w.document.write(html)
    return w
  }
  const {createWindow} = await import('@ctrl/dom')
  return createWindow({html}) as unknown as Win
}

const t0 = performance.now()
const win = await makeWindow()
const userEvent = config.startsWith('stock')
  ? (await import('@testing-library/user-event')).userEvent
  : (await import('../src/index.ts')).default
const setupMs = performance.now() - t0

const doc = win.document
const user = (userEvent as any).setup({document: doc, ...(variant === 'nodelay' ? {delay: null} : {})})
const text = doc.getElementById('text')
const btn = doc.getElementById('btn')
const sel = doc.getElementById('sel')
const inputs = Array.from(doc.querySelectorAll('#form input')) as any[]
let clicks = 0
btn.addEventListener('click', () => clicks++)
let changes = 0
sel.addEventListener('change', () => changes++)

async function op(i: number) {
  switch (workload) {
    case 'type': {
      text.value = ''
      await user.type(text, 'hello world')
      if (text.value !== 'hello world') throw new Error(`type: got ${JSON.stringify(text.value)}`)
      return
    }
    case 'click': {
      const before = clicks
      await user.click(btn)
      if (clicks !== before + 1) throw new Error('click not received')
      return
    }
    case 'tab': {
      inputs[0].focus()
      for (let k = 1; k < 20; k++) await user.tab()
      if (doc.activeElement !== inputs[19]) throw new Error(`tab: focus on ${doc.activeElement?.name}`)
      return
    }
    case 'selectOptions': {
      const v = `v${(i % 9) + 1}`
      await user.selectOptions(sel, v)
      if (sel.value !== v) throw new Error(`selectOptions: got ${sel.value}`)
      return
    }
    default:
      throw new Error(`unknown workload ${workload}`)
  }
}

const warmup = Math.max(2, Math.floor(iterations / 10))
for (let i = 0; i < warmup; i++) await op(i)
const times: number[] = []
for (let i = 0; i < iterations; i++) {
  const s = performance.now()
  await op(i + warmup)
  times.push(performance.now() - s)
}
times.sort((a, b) => a - b)
const perOpMs = times[times.length >> 1]

const gc = (globalThis as {gc?: () => void}).gc
gc?.()
gc?.()
const heapMB = process.memoryUsage().heapUsed / 1024 / 1024
const rssMB = process.resourceUsage().maxRSS / 1024
console.log(JSON.stringify({perOpMs, setupMs, heapMB, rssMB}))
win.close?.()
process.exit(0)

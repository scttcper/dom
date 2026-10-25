// user-event benchmark: stock @testing-library/user-event on jsdom / happy-dom vs @ctrl/dom/user-event
// on @ctrl/dom. Methodology follows bench/README.md: fresh process per sample, interleaved
// configs, median of per-process medians with [min–max], heap after GC and peak RSS next to time.
//
//   node packages/user-event/bench/run.ts [--samples 5] [--workloads type,click] [--configs ctrl-dom,stock-jsdom] [--nodelay]

import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const args = process.argv.slice(2)
const flag = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? def : args[i + 1]
}
const samples = Number(flag('samples', '5'))
const workloads = flag('workloads', 'type,click,tab,selectOptions').split(',')
let configs = flag(
  'configs',
  'stock-jsdom,stock-happy-dom,stock-ctrl-dom,ctrl-dom-jsdom,ctrl-dom',
).split(',')
if (args.includes('--nodelay')) configs = configs.map(c => `${c}:nodelay`)
const iterations: Record<string, number> = {
  type: 30,
  click: 100,
  tab: 10,
  selectOptions: 50,
}

const worker = fileURLToPath(new URL('./worker.ts', import.meta.url))
type Sample = {perOpMs: number; setupMs: number; heapMB: number; rssMB: number}
const results = new Map<string, Sample[]>()

for (let s = 0; s < samples; s++) {
  for (const w of workloads) {
    const order = s % 2 ? [...configs].reverse() : configs
    const rotated = order
      .slice(s % order.length)
      .concat(order.slice(0, s % order.length))
    for (const c of rotated) {
      const key = `${w}|${c}`
      try {
        const out = execFileSync(
          process.execPath,
          ['--expose-gc', worker, w, c, String(iterations[w] ?? 30)],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
        const line = out.trim().split('\n').at(-1)!
        results.set(key, [
          ...(results.get(key) ?? []),
          JSON.parse(line) as Sample,
        ])
      } catch (e) {
        const err = (e as {stderr?: string}).stderr ?? String(e)
        console.error(
          `${key}: ${err.split('\n').find(l => /Error/.test(l)) ?? err.slice(0, 300)}`,
        )
        results.set(key, results.get(key) ?? [])
      }
    }
  }
  process.stderr.write(`sample ${s + 1}/${samples} done\n`)
}

const med = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length
    ? a.length % 2
      ? a[a.length >> 1]
      : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
    : NaN
}
const f = (x: number) =>
  !Number.isFinite(x)
    ? '–'
    : x >= 100
      ? x.toFixed(0)
      : x >= 10
        ? x.toFixed(1)
        : x >= 1
          ? x.toFixed(2)
          : x.toFixed(3)

console.log(
  `\nsamples=${samples} (fresh process each), node ${process.version}\n`,
)
console.log(
  '| workload | config | ms/op median [min–max] | vs stock-jsdom | heap MB | peak RSS MB |',
)
console.log('| --- | --- | --- | --- | --- | --- |')
for (const w of workloads) {
  const base = med(
    (results.get(`${w}|${configs[0]}`) ?? []).map(r => r.perOpMs),
  )
  for (const c of configs) {
    const rs = results.get(`${w}|${c}`) ?? []
    const t = rs.map(r => r.perOpMs)
    const m = med(t)
    console.log(
      `| ${w} | ${c} | ${f(m)} [${f(Math.min(...t))}–${f(Math.max(...t))}] | ${rs.length ? (m / base).toFixed(2) + '×' : 'error'} | ${f(med(rs.map(r => r.heapMB)))} | ${f(med(rs.map(r => r.rssMB)))} |`,
    )
  }
}

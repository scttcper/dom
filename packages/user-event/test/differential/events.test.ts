/**
 * Differential tests: identical user-event scenarios, recorded event sequences compared.
 *
 * Oracle: stock @testing-library/user-event@14.6.8 on jsdom (what people run today).
 * Subjects:
 *   - @rtd/user-event on jsdom — the port itself must produce the same events, defaults and
 *     DOM state as upstream on the same DOM;
 *   - @rtd/user-event on @rtd/dom — the target stack. Skipped (with the reason) until
 *     @rtd/dom provides what the scenarios need (form controls, event dispatch with
 *     propagation, focus, Selection); see `rtdUnsupportedReason()`.
 *
 * Each scenario builds a fresh window, attaches capture listeners on the document for every
 * event type user-event dispatches, runs the same API calls and records for each event: type,
 * target, the event-specific fields (key/code/button/buttons/detail/inputType/data/
 * relatedTarget/modifiers), and the target's value/checked/selection at dispatch time. The
 * final DOM state (values, focus, selection) is recorded too. Error messages are compared for
 * scenarios that throw.
 */

import {JSDOM} from 'jsdom'
import {userEvent as stockUserEvent} from '@testing-library/user-event'
import {describe, expect, test} from 'vitest'
import rtdUserEvent from '../../src/index.ts'

type AnyUserEvent = typeof stockUserEvent
type User = ReturnType<AnyUserEvent['setup']>
type Doc = Document

const EVENT_TYPES = [
  'auxclick', 'beforeinput', 'blur', 'click', 'contextmenu', 'copy', 'change', 'cut', 'dblclick',
  'focus', 'focusin', 'focusout', 'keydown', 'keypress', 'keyup', 'paste', 'input', 'mousedown',
  'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'pointerover',
  'pointerenter', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerout',
  'pointerleave', 'submit', 'select',
]

function describeNode(node: unknown): string {
  if (node === null || node === undefined) return 'null'
  const n = node as Element & {nodeType: number}
  if (n.nodeType === 9) return '#document'
  if (n.nodeType === 3) return `#text(${JSON.stringify((n as unknown as Text).data)})`
  if (n.nodeType !== 1) return `node${n.nodeType}`
  let s = n.tagName.toLowerCase()
  if (n.id) s += `#${n.id}`
  const name = n.getAttribute('name')
  if (name) s += `[name=${name}]`
  return s
}

function snapshotTarget(el: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const t = el as HTMLInputElement
  if (t && t.nodeType === 1) {
    const tag = t.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') out.value = t.value
    if (tag === 'input' && (t.type === 'checkbox' || t.type === 'radio')) out.checked = t.checked
    if ((tag === 'input' && ['text', 'search', 'url', 'tel', 'password'].includes(t.type)) || tag === 'textarea') {
      out.sel = [t.selectionStart, t.selectionEnd]
    }
    if (tag === 'div' && t.getAttribute('contenteditable') !== null) out.text = t.textContent
  }
  return out
}

function record(doc: Doc) {
  const log: Array<Record<string, unknown>> = []
  for (const type of EVENT_TYPES) {
    doc.addEventListener(
      type,
      (e: Event) => {
        const ev = e as Event & Partial<KeyboardEvent & PointerEvent & InputEvent & FocusEvent & ClipboardEvent>
        const entry: Record<string, unknown> = {type: e.type, target: describeNode(e.target)}
        if (ev.key !== undefined) Object.assign(entry, {key: ev.key, code: ev.code, repeat: ev.repeat})
        if (ev.button !== undefined) Object.assign(entry, {button: ev.button, buttons: ev.buttons})
        if (ev.pointerType !== undefined) Object.assign(entry, {pointerType: ev.pointerType, pointerId: ev.pointerId, isPrimary: ev.isPrimary})
        if (ev.detail !== undefined && ev.detail !== 0) entry.detail = ev.detail
        if (ev.inputType !== undefined) Object.assign(entry, {inputType: ev.inputType, data: ev.data})
        if ('relatedTarget' in ev && ev.relatedTarget !== undefined) entry.relatedTarget = describeNode(ev.relatedTarget)
        if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) {
          entry.mods = [ev.shiftKey && 'shift', ev.ctrlKey && 'ctrl', ev.altKey && 'alt', ev.metaKey && 'meta'].filter(Boolean).join('+')
        }
        if (ev.clipboardData) entry.clipboard = ev.clipboardData.getData('text/plain')
        entry.bubbles = e.bubbles
        entry.cancelable = e.cancelable
        Object.assign(entry, snapshotTarget(e.target))
        log.push(entry)
      },
      {capture: true},
    )
  }
  // prevent navigation-like default for submit so both DOMs behave the same
  doc.addEventListener('submit', (e: Event) => e.preventDefault())
  return log
}

function finalState(doc: Doc) {
  const fields = Array.from(doc.querySelectorAll('input, textarea, select, [contenteditable]')).map(el => ({
    node: describeNode(el),
    ...snapshotTarget(el),
    ...(el.tagName === 'SELECT'
      ? {selected: Array.from((el as HTMLSelectElement).options).map(o => o.selected)}
      : {}),
    ...(el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file'
      ? {files: Array.from((el as HTMLInputElement).files ?? []).map(f => f.name)}
      : {}),
  }))
  return {active: describeNode(doc.activeElement), fields}
}

interface Scenario {
  name: string
  html: string
  run(user: User, doc: Doc, window: Window): Promise<unknown>
  options?: Record<string, unknown>
}

const fields20 = Array.from({length: 20}, (_, i) => `<input id="f${i}" name="f${i}"/>`).join('')

const scenarios: Scenario[] = [
  {
    name: 'type text into an input (implicit click)',
    html: `<input id="a"/>`,
    run: (user, doc) => user.type(doc.getElementById('a')!, 'hello world'),
  },
  {
    name: 'type with modifiers, arrows, Backspace, Home/End, Delete',
    html: `<input id="a" value="xyz"/>`,
    run: (user, doc) =>
      user.type(doc.getElementById('a')!, '{Shift>}AB{/Shift}{ArrowLeft}{Backspace}q{Home}w{End}{ArrowLeft}{Delete}'),
  },
  {
    name: 'type into textarea with Enter and maxlength',
    html: `<textarea id="t" maxlength="8"></textarea>`,
    run: (user, doc) => user.type(doc.getElementById('t')!, 'ab{Enter}cd{Enter}efgh'),
  },
  {
    name: 'initialSelectionStart/End replaces the selected range',
    html: `<input id="a" value="0123456789"/>`,
    run: (user, doc) =>
      user.type(doc.getElementById('a')!, 'X', {initialSelectionStart: 2, initialSelectionEnd: 5}),
  },
  {
    // Only values that are valid floating-point numbers at every step: for intermediate
    // strings like "-1." upstream normalizes the IDL value with `String(Number(v))` to work
    // around jsdom ("-1." -> "-1", "-1.5e3" -> "-1500"), while @rtd/dom sanitizes like the
    // browser ("-1." -> "", "-1.5e3" stays). See docs/deviations.md and number-input.test.ts.
    name: 'number input',
    html: `<input id="n" type="number"/>`,
    run: (user, doc) => user.type(doc.getElementById('n')!, '-15{ArrowLeft}2{Backspace}{Backspace}'),
  },
  {
    name: 'click a submit button inside a form',
    html: `<form id="f"><input id="a"/><button id="b">ok</button></form>`,
    run: (user, doc) => user.click(doc.getElementById('b')!),
  },
  {
    name: 'Enter submits a form through its submit button',
    html: `<form id="f"><input id="a"/><input id="c"/><button id="b">ok</button></form>`,
    run: (user, doc) => user.type(doc.getElementById('a')!, 'x{Enter}'),
  },
  {
    name: 'Enter in the only input submits the form',
    html: `<form id="f"><input id="a"/></form>`,
    run: (user, doc) => user.type(doc.getElementById('a')!, '{Enter}'),
  },
  {
    name: 'dblClick and tripleClick select text',
    html: `<input id="a" value="foo bar baz"/>`,
    run: async (user, doc) => {
      await user.dblClick(doc.getElementById('a')!)
      await user.tripleClick(doc.getElementById('a')!)
    },
  },
  {
    name: 'right click, middle click',
    html: `<div id="d"><span id="s">x</span></div>`,
    run: (user, doc) =>
      user.pointer([
        {keys: '[MouseRight]', target: doc.getElementById('s')!},
        {keys: '[MouseMiddle]', target: doc.getElementById('d')!},
      ]),
  },
  {
    name: 'tab through a 20-field form and back',
    html: `<form>${fields20}<button id="go">go</button></form>`,
    run: async user => {
      for (let i = 0; i < 22; i++) await user.tab()
      await user.tab({shift: true})
      await user.tab({shift: true})
    },
  },
  {
    name: 'tab honors tabindex order, skips disabled/hidden/negative',
    html: `<div><input id="a" tabindex="2"/><input id="b" disabled/><input id="c" tabindex="-1"/><input id="d" tabindex="1"/><input id="e" type="hidden"/><a id="l" href="#">l</a><button id="z" style="display:none">z</button></div>`,
    run: async user => {
      for (let i = 0; i < 5; i++) await user.tab()
    },
  },
  {
    name: 'selectOptions on a single select',
    html: `<select id="s"><option value="1">One</option><option value="2">Two</option><option value="3" disabled>Three</option></select>`,
    run: async (user, doc) => {
      await user.selectOptions(doc.getElementById('s')!, '2')
      await user.selectOptions(doc.getElementById('s')!, 'One')
    },
  },
  {
    name: 'selectOptions / deselectOptions on a multiple select',
    html: `<select id="s" multiple><option value="a">A</option><option value="b">B</option><option value="c">C</option></select>`,
    run: async (user, doc) => {
      await user.selectOptions(doc.getElementById('s')!, ['a', 'c'])
      await user.deselectOptions(doc.getElementById('s')!, ['a'])
    },
  },
  {
    name: 'selectOptions on a role=listbox',
    html: `<ul id="l" role="listbox"><li id="o1" role="option">one</li><li id="o2" role="option">two</li></ul>`,
    run: (user, doc) => user.selectOptions(doc.getElementById('l')!, ['two']),
  },
  {
    name: 'checkbox: click, label click, Space',
    html: `<label id="lbl"><input id="c" type="checkbox"/> check</label>`,
    run: async (user, doc) => {
      await user.click(doc.getElementById('c')!)
      await user.click(doc.getElementById('lbl')!)
      await user.keyboard(' ')
    },
  },
  {
    // downstream/react-aria TRIAGE #10: keydown and keyup in separate calls, Space activation
    // via keyup -> click (pointerType '' in 14.6.8), keydown handler calling preventDefault on a
    // sibling button so the keyup there must not click.
    name: 'Space press split across keyboard() calls on checkbox and button',
    html: `<label id="lbl"><input id="c" type="checkbox"/> check</label><button id="b">b</button>`,
    run: async (user, doc) => {
      doc.getElementById('b')!.addEventListener('keydown', (e: Event) => e.preventDefault())
      await user.tab()
      await user.keyboard('[Space>]')
      await user.keyboard('[/Space]')
      await user.tab()
      await user.keyboard('[Space>]')
      await user.keyboard('[/Space]')
    },
  },
  {
    name: 'radio group arrow keys',
    html: `<input id="r1" type="radio" name="g" checked/><input id="r2" type="radio" name="g"/><input id="r3" type="radio" name="g" disabled/><input id="r4" type="radio" name="g"/>`,
    run: async (user, doc) => {
      await user.click(doc.getElementById('r1')!)
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowLeft}{ArrowRight}')
    },
  },
  {
    name: 'upload honors accept and multiple',
    html: `<label id="lbl" for="f">pick</label><input id="f" type="file" accept="image/*,.pdf" multiple/>`,
    run: async (user, doc, window) => {
      const W = window as unknown as {File: typeof File}
      await user.upload(doc.getElementById('lbl')!, [
        new W.File(['a'], 'a.png', {type: 'image/png'}),
        new W.File(['b'], 'b.txt', {type: 'text/plain'}),
        new W.File(['c'], 'c.pdf', {type: 'application/pdf'}),
      ])
    },
  },
  {
    name: 'paste, copy, cut in an input',
    html: `<input id="a" value="hello"/>`,
    run: async (user, doc) => {
      const input = doc.getElementById('a') as HTMLInputElement
      await user.click(input)
      await user.paste(' world')
      input.setSelectionRange(0, 5)
      await user.copy()
      await user.cut()
      await user.keyboard('{End}')
      await user.paste()
    },
  },
  {
    name: 'hover and unhover across nested elements',
    html: `<div id="outer"><div id="inner"><button id="b">b</button></div><span id="s">s</span></div>`,
    run: async (user, doc) => {
      await user.hover(doc.getElementById('b')!)
      await user.hover(doc.getElementById('s')!)
      await user.unhover(doc.getElementById('s')!)
    },
  },
  {
    name: 'pointer drag selection in an input',
    html: `<input id="a" value="drag me please"/>`,
    run: (user, doc) =>
      user.pointer([
        {keys: '[MouseLeft>]', target: doc.getElementById('a')!, offset: 2},
        {offset: 7},
        {keys: '[/MouseLeft]'},
      ]),
  },
  {
    name: 'touch pointer tap',
    html: `<button id="b">b</button>`,
    run: (user, doc) => user.pointer({keys: '[TouchA]', target: doc.getElementById('b')!}),
  },
  {
    name: 'keyboard repeat and held modifiers',
    html: `<input id="a"/>`,
    run: async (user, doc) => {
      await user.click(doc.getElementById('a')!)
      await user.keyboard('{a>3/}{Control>}{a}{/Control}[KeyB]{{}[[]')
    },
  },
  {
    name: 'clear an input',
    html: `<input id="a" value="clear me"/>`,
    run: (user, doc) => user.clear(doc.getElementById('a')!),
  },
  {
    name: 'type into contenteditable',
    html: `<div id="ce" contenteditable="true">ab</div>`,
    run: async (user, doc) => {
      // Place the caret explicitly: on jsdom 30, `focus()` collapses the Selection to
      // (element, 0) after user-event's mousedown put it at the end, unlike browsers.
      const ce = doc.getElementById('ce')!
      await user.click(ce)
      doc.getSelection()!.collapse(ce.firstChild!, 1)
      await user.type(ce, 'cd{Backspace}{Enter}e', {skipClick: true})
    },
  },
  {
    name: 'keydown preventDefault blocks input; disabled elements get no events',
    html: `<input id="a"/><button id="b" disabled>b</button>`,
    run: async (user, doc) => {
      doc.getElementById('a')!.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'x') e.preventDefault()
      })
      await user.type(doc.getElementById('a')!, 'axb')
      await user.click(doc.getElementById('b')!)
    },
  },
  {
    name: 'focus moved during keydown retargets the rest of the key press',
    html: `<input id="a"/><input id="b"/>`,
    run: async (user, doc) => {
      doc.getElementById('a')!.addEventListener('keydown', () => (doc.getElementById('b') as HTMLElement).focus())
      await user.type(doc.getElementById('a')!, 'xy')
    },
  },
]

const errorScenarios: Scenario[] = [
  {
    name: 'pointer-events: none on an ancestor',
    html: `<div id="p" style="pointer-events: none"><ul aria-label="list"><li><button id="b">Press</button></li></ul></div>`,
    run: (user, doc) => user.click(doc.getElementById('b')!),
  },
  {
    name: 'pointer-events: none on the element',
    html: `<button id="b" data-testid="btn" style="pointer-events: none">x</button>`,
    run: (user, doc) => user.click(doc.getElementById('b')!),
  },
  {
    name: 'malformed keyboard descriptor',
    html: `<input id="a"/>`,
    run: user => user.keyboard('{Shift'),
  },
  {
    name: 'malformed pointer descriptor',
    html: `<input id="a"/>`,
    run: user => user.pointer('[MouseLeft'),
  },
  {
    name: 'deselect on a single select',
    html: `<select id="s"><option>a</option></select>`,
    run: (user, doc) => user.deselectOptions(doc.getElementById('s')!, 'a'),
  },
  {
    name: 'selectOptions with an unknown value',
    html: `<select id="s"><option>a</option></select>`,
    run: (user, doc) => user.selectOptions(doc.getElementById('s')!, 'zzz'),
  },
  {
    name: 'upload on a non-file input',
    html: `<input id="a"/>`,
    run: (user, doc, window) =>
      user.upload(doc.getElementById('a')!, new (window as unknown as {File: typeof File}).File([''], 'x')),
  },
  {
    name: 'clear on a button',
    html: `<button id="b">b</button>`,
    run: (user, doc) => user.clear(doc.getElementById('b')!),
  },
  {
    name: 'moving a pointer that does not exist',
    html: `<input id="a"/>`,
    run: user => user.pointer({pointerName: 'TouchA'}),
  },
]

interface Env {
  window: Window
  document: Doc
  close(): void
}

function jsdomEnv(html: string): Env {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {pretendToBeVisual: true})
  return {
    window: dom.window as unknown as Window,
    document: dom.window.document as unknown as Doc,
    close: () => dom.window.close(),
  }
}

/**
 * `select` events are fired by the DOM's selection API, not by user-event:
 * - jsdom 30 queues them with a timer, so where they land relative to user-event's actions
 *   depends on how user-event yields between actions (`setTimeout` upstream, `setImmediate`
 *   here for `delay: 0`; docs/deviations.md) — they still fire before the API call resolves;
 * - @rtd/dom does not yet queue one per `setSelectionRange()`.
 *   TODO(html-forms): fire `select` per https://html.spec.whatwg.org/#dom-textarea/input-setselectionrange
 */
function withoutSelectEvents<T extends {log: Array<Record<string, unknown>>}>(r: T): T {
  return {...r, log: r.log.filter(e => e.type !== 'select')}
}

async function runScenario(userEvent: AnyUserEvent, makeEnv: (html: string) => Env, s: Scenario) {
  const env = makeEnv(s.html)
  try {
    const log = record(env.document)
    const user = userEvent.setup({document: env.document, ...s.options} as never)
    let error: string | undefined
    try {
      await s.run(user, env.document, env.window)
    } catch (e) {
      error = (e as Error).message
    }
    return {log, final: finalState(env.document), error}
  } finally {
    env.close()
  }
}

describe('@rtd/user-event on jsdom vs stock @testing-library/user-event on jsdom', () => {
  for (const s of scenarios) {
    test(`same events and DOM state: ${s.name}`, async () => {
      const expected = await runScenario(stockUserEvent, jsdomEnv, s)
      const actual = await runScenario(rtdUserEvent as unknown as AnyUserEvent, jsdomEnv, s)
      expect(expected.error).toBeUndefined()
      expect(expected.log.length).toBeGreaterThan(0)
      expect(withoutSelectEvents(actual)).toEqual(withoutSelectEvents(expected))
    })
  }

  for (const s of errorScenarios) {
    test(`same error message: ${s.name}`, async () => {
      const expected = await runScenario(stockUserEvent, jsdomEnv, s)
      const actual = await runScenario(rtdUserEvent as unknown as AnyUserEvent, jsdomEnv, s)
      expect(expected.error).toBeTypeOf('string')
      expect(actual.error).toBe(expected.error)
      expect(actual.log).toEqual(expected.log)
    })
  }
})

// --- @rtd/dom ---------------------------------------------------------------------------

type RtdDom = {createWindow(options?: {html?: string}): Window & {close?(): void}}

async function loadRtd(): Promise<RtdDom | null> {
  try {
    return (await import('@rtd/dom' as string)) as RtdDom
  } catch {
    return null
  }
}

const rtd = await loadRtd()

/** Why the @rtd/dom subject cannot run yet, or null when it can. */
function rtdUnsupportedReason(): string | null {
  if (rtd === null) return '@rtd/dom failed to import'
  try {
    const win = rtd.createWindow({html: '<!doctype html><html><body><div><input id="a" value="x"></div></body></html>'})
    const w = win as unknown as Record<string, unknown>
    const doc = win.document
    for (const name of ['KeyboardEvent', 'PointerEvent', 'MouseEvent', 'InputEvent', 'FocusEvent', 'HTMLElement']) {
      if (typeof w[name] !== 'function') return `window.${name} missing (events / window agents)`
    }
    if (typeof (w as {getComputedStyle?: unknown}).getComputedStyle !== 'function') return 'window.getComputedStyle missing (css agent)'
    if (typeof doc.getSelection !== 'function') return 'document.getSelection missing (dom-core agent)'
    const input = doc.getElementById('a') as HTMLInputElement | null
    if (!input) return 'getElementById / parser not working'
    if (input.value !== 'x' || typeof input.setSelectionRange !== 'function') return 'HTMLInputElement value/selection API missing (html-forms agent)'
    let bubbled = false
    doc.addEventListener('test-bubble', () => (bubbled = true))
    input.dispatchEvent(new (w.Event as typeof Event)('test-bubble', {bubbles: true}))
    if (!bubbled) return 'event propagation not implemented (events agent)'
    input.focus()
    if (doc.activeElement !== input) return 'focus() does not update document.activeElement (html-elements agent)'
    return null
  } catch (e) {
    return `probe threw: ${(e as Error).message}`
  }
}

const rtdReason = rtdUnsupportedReason()

/**
 * `pointer-events` is an inherited property (https://drafts.csswg.org/css-ui/#pointer-events-control),
 * so `getComputedStyle(child).pointerEvents` is "none" under a `pointer-events: none` ancestor
 * (jsdom 30, browsers). user-event's error message ("has" vs "inherits ... <-- This element
 * declared") depends on it.
 * TODO(css): inherit `pointer-events` in getComputedStyle; then this probe returns true.
 */
function rtdInheritsPointerEvents(): boolean {
  if (rtdReason !== null) return false
  const win = rtd!.createWindow({html: '<!doctype html><html><body><div style="pointer-events: none"><b id="b"></b></div></body></html>'})
  return win.getComputedStyle(win.document.getElementById('b')!).pointerEvents === 'none'
}
const rtdComputesInheritedPointerEvents = rtdInheritsPointerEvents()

function rtdEnv(html: string): Env {
  const win = rtd!.createWindow({html: `<!doctype html><html><body>${html}</body></html>`})
  return {window: win, document: win.document, close: () => win.close?.()}
}

describe('@rtd/user-event on @rtd/dom vs stock @testing-library/user-event on jsdom', () => {
  if (rtdReason !== null) test.skip(`@rtd/dom not ready: ${rtdReason}`, () => {})

  for (const s of scenarios) {
    test.skipIf(rtdReason !== null)(`same events and DOM state: ${s.name}`, async () => {
      const expected = await runScenario(stockUserEvent, jsdomEnv, s)
      const actual = await runScenario(rtdUserEvent as unknown as AnyUserEvent, rtdEnv, s)
      expect(withoutSelectEvents(actual)).toEqual(withoutSelectEvents(expected))
    })
  }

  for (const s of errorScenarios) {
    const needsInheritance = s.name === 'pointer-events: none on an ancestor'
    test.skipIf(rtdReason !== null || (needsInheritance && !rtdComputesInheritedPointerEvents))(
      `same error message: ${s.name}`,
      async () => {
      const expected = await runScenario(stockUserEvent, jsdomEnv, s)
        const actual = await runScenario(rtdUserEvent as unknown as AnyUserEvent, rtdEnv, s)
        expect(actual.error).toBe(expected.error)
      },
    )
  }
})

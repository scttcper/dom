/**
 * React integration tests for @ctrl/dom/user-event.
 *
 * Every scenario runs twice in the same environment: with @ctrl/dom/user-event and with stock
 * @testing-library/user-event@14.6.8 (each paired with the React Testing Library adapter that
 * configures the Testing Library DOM module it reads `asyncWrapper`/`eventWrapper` from). The
 * assertions are identical, so a difference in how React observes the simulated input — e.g.
 * React's `_valueTracker` missing a change, `onChange` firing a different number of times,
 * effects not flushing between keystrokes — fails the @ctrl/dom row.
 *
 * Covers: controlled inputs (cursor, transforms, rejected changes), forms (Enter implicit
 * submission, submit buttons), checkbox / radio / select, focus and blur handlers with `tab`,
 * keyboard shortcuts, clipboard paste/copy/cut, and how React work flushes between actions
 * (docs/deviations.md: "user-event `delay: 0`").
 */

import React, {useEffect, useLayoutEffect, useRef, useState} from 'react'
import * as stockRTL from '@testing-library/react'
import {userEvent as stockUserEvent} from '@testing-library/user-event'
import {afterEach, describe, expect, test, vi} from 'vitest'
import ctrlDomUserEvent from '../../src/index.ts'
import * as ctrlDomRTL from '../upstream/_helpers/react.ts'

type UE = typeof stockUserEvent
type RTL = Pick<typeof stockRTL, 'render' | 'screen' | 'cleanup' | 'act'>

const impls: Array<[name: string, userEvent: UE, rtl: RTL]> = [
  [
    '@ctrl/dom/user-event',
    ctrlDomUserEvent as unknown as UE,
    ctrlDomRTL as unknown as RTL,
  ],
  ['@testing-library/user-event', stockUserEvent, stockRTL],
]

describe.each(impls)('%s', (_name, userEvent, {render, screen, cleanup}) => {
  afterEach(() => cleanup())

  describe('controlled inputs', () => {
    test('type() updates state once per character and React sees every change', async () => {
      const onChange = vi.fn()
      function Input() {
        const [value, setValue] = useState('')
        return (
          <input
            aria-label="name"
            value={value}
            onChange={e => {
              onChange(e.target.value)
              setValue(e.target.value)
            }}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'hello world')

      expect(screen.getByRole('textbox')).toHaveValue('hello world')
      expect(onChange).toHaveBeenCalledTimes(11)
      expect(onChange.mock.calls.map(c => c[0])).toEqual([
        'h',
        'he',
        'hel',
        'hell',
        'hello',
        'hello ',
        'hello w',
        'hello wo',
        'hello wor',
        'hello worl',
        'hello world',
      ])
    })

    test('typing in the middle keeps the cursor where the user put it', async () => {
      function Input() {
        const [value, setValue] = useState('acd')
        return <input value={value} onChange={e => setValue(e.target.value)} />
      }
      render(<Input />)
      const user = userEvent.setup()
      const input = screen.getByRole('textbox') as HTMLInputElement

      await user.click(input)
      input.setSelectionRange(1, 1)
      await user.keyboard('b')
      await user.keyboard('X')

      expect(input).toHaveValue('abXcd')
      expect(input.selectionStart).toBe(3)
      expect(input.selectionEnd).toBe(3)
    })

    test('a transforming onChange (uppercase) wins over the typed value', async () => {
      function Input() {
        const [value, setValue] = useState('')
        return (
          <input
            value={value}
            onChange={e => setValue(e.target.value.toUpperCase())}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'abc')

      expect(screen.getByRole('textbox')).toHaveValue('ABC')
    })

    test('a rejected change is rolled back but onChange still fires', async () => {
      const onChange = vi.fn()
      render(<input value="fixed" onChange={onChange} />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'xy')

      expect(screen.getByRole('textbox')).toHaveValue('fixed')
      expect(onChange).toHaveBeenCalledTimes(2)
    })

    test('maxLength truncates typed and pasted input', async () => {
      const onChange = vi.fn()
      function Input() {
        const [value, setValue] = useState('')
        return (
          <input
            maxLength={5}
            value={value}
            onChange={e => {
              onChange()
              setValue(e.target.value)
            }}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'abcdefg')
      expect(screen.getByRole('textbox')).toHaveValue('abcde')
      expect(onChange).toHaveBeenCalledTimes(5)

      await user.clear(screen.getByRole('textbox'))
      await user.paste('1234567')
      expect(screen.getByRole('textbox')).toHaveValue('12345')
    })

    test('clear() empties a controlled textarea with one onChange', async () => {
      const onChange = vi.fn()
      function TextArea() {
        const [value, setValue] = useState('line 1\nline 2')
        return (
          <textarea
            value={value}
            onChange={e => {
              onChange(e.target.value)
              setValue(e.target.value)
            }}
          />
        )
      }
      render(<TextArea />)
      const user = userEvent.setup()

      await user.clear(screen.getByRole('textbox'))

      expect(screen.getByRole('textbox')).toHaveValue('')
      expect(onChange.mock.calls).toEqual([['']])
    })

    test('number input with intermediate invalid values', async () => {
      function Input() {
        const [value, setValue] = useState('')
        return (
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('spinbutton'), '1.5')

      expect(screen.getByRole('spinbutton')).toHaveValue(1.5)
    })

    test('uncontrolled input with defaultValue and onChange', async () => {
      const onChange = vi.fn()
      render(
        <input defaultValue="foo" onChange={e => onChange(e.target.value)} />,
      )
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), '{Backspace}x')

      expect(screen.getByRole('textbox')).toHaveValue('fox')
      expect(onChange.mock.calls).toEqual([['fo'], ['fox']])
    })
  })

  describe('forms', () => {
    test('Enter in a text input submits through the submit button', async () => {
      const onSubmit = vi.fn((e: {preventDefault(): void}) =>
        e.preventDefault(),
      )
      const onClick = vi.fn()
      render(
        <form onSubmit={onSubmit}>
          <input name="a" />
          <input name="b" />
          <button type="submit" onClick={onClick}>
            Save
          </button>
        </form>,
      )
      const user = userEvent.setup()

      await user.type(screen.getAllByRole('textbox')[0], 'x{Enter}')

      expect(onClick).toHaveBeenCalledTimes(1)
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    test('Enter in the only input of a form without submit button submits', async () => {
      const onSubmit = vi.fn((e: {preventDefault(): void}) =>
        e.preventDefault(),
      )
      render(
        <form onSubmit={onSubmit}>
          <input name="q" />
        </form>,
      )
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'query{Enter}')

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    test('Enter does not submit when there are several inputs and no submit button', async () => {
      const onSubmit = vi.fn((e: {preventDefault(): void}) =>
        e.preventDefault(),
      )
      render(
        <form onSubmit={onSubmit}>
          <input name="a" />
          <input name="b" />
        </form>,
      )
      const user = userEvent.setup()

      await user.type(screen.getAllByRole('textbox')[0], 'x{Enter}')

      expect(onSubmit).not.toHaveBeenCalled()
    })

    test('click on a submit button submits; type="button" does not', async () => {
      const onSubmit = vi.fn((e: {preventDefault(): void}) =>
        e.preventDefault(),
      )
      render(
        <form onSubmit={onSubmit}>
          <button type="button">Cancel</button>
          <button>Save</button>
        </form>,
      )
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', {name: 'Cancel'}))
      expect(onSubmit).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', {name: 'Save'}))
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    test('Space and Enter activate a focused button', async () => {
      const onClick = vi.fn()
      render(<button onClick={onClick}>Go</button>)
      const user = userEvent.setup()

      await user.tab()
      await user.keyboard(' ')
      await user.keyboard('{Enter}')

      expect(onClick).toHaveBeenCalledTimes(2)
    })
  })

  describe('checkbox, radio, select', () => {
    test('controlled checkbox toggles via click, label click and Space', async () => {
      const onChange = vi.fn()
      function Checkbox() {
        const [checked, setChecked] = useState(false)
        return (
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => {
                onChange(e.target.checked)
                setChecked(e.target.checked)
              }}
            />
            Accept
          </label>
        )
      }
      render(<Checkbox />)
      const user = userEvent.setup()
      const checkbox = screen.getByRole('checkbox')

      await user.click(checkbox)
      expect(checkbox).toBeChecked()

      await user.click(screen.getByText('Accept'))
      expect(checkbox).not.toBeChecked()

      await user.keyboard(' ')
      expect(checkbox).toBeChecked()

      expect(onChange.mock.calls).toEqual([[true], [false], [true]])
    })

    test('arrow keys move the selection inside a radio group', async () => {
      const onChange = vi.fn()
      function Radios() {
        const [value, setValue] = useState('a')
        return (
          <fieldset>
            {['a', 'b', 'c'].map(v => (
              <label key={v}>
                <input
                  type="radio"
                  name="letter"
                  value={v}
                  checked={value === v}
                  onChange={e => {
                    onChange(e.target.value)
                    setValue(e.target.value)
                  }}
                />
                {v}
              </label>
            ))}
          </fieldset>
        )
      }
      render(<Radios />)
      const user = userEvent.setup()

      await user.click(screen.getByLabelText('a'))
      await user.keyboard('{ArrowDown}')
      expect(screen.getByLabelText('b')).toBeChecked()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByLabelText('c')).toBeChecked()
      await user.keyboard('{ArrowDown}')
      expect(screen.getByLabelText('a')).toBeChecked()
      await user.keyboard('{ArrowUp}')
      expect(screen.getByLabelText('c')).toBeChecked()

      expect(onChange.mock.calls).toEqual([['b'], ['c'], ['a'], ['c']])
      expect(document.activeElement).toBe(screen.getByLabelText('c'))
    })

    test('selectOptions on a controlled <select>', async () => {
      const onChange = vi.fn()
      function Select() {
        const [value, setValue] = useState('1')
        return (
          <select
            value={value}
            onChange={e => {
              onChange(e.target.value)
              setValue(e.target.value)
            }}
          >
            <option value="1">One</option>
            <option value="2">Two</option>
            <option value="3">Three</option>
          </select>
        )
      }
      render(<Select />)
      const user = userEvent.setup()

      await user.selectOptions(screen.getByRole('combobox'), '2')
      expect(screen.getByRole('combobox')).toHaveValue('2')
      await user.selectOptions(screen.getByRole('combobox'), 'Three')
      expect(screen.getByRole('combobox')).toHaveValue('3')

      expect(onChange.mock.calls).toEqual([['2'], ['3']])
    })

    test('selectOptions / deselectOptions on a multiple <select>', async () => {
      const values: string[][] = []
      function Select() {
        const [value, setValue] = useState<string[]>([])
        return (
          <select
            multiple
            value={value}
            onChange={e => {
              const next = Array.from(e.target.selectedOptions, o => o.value)
              values.push(next)
              setValue(next)
            }}
          >
            <option value="a">A</option>
            <option value="b">B</option>
            <option value="c">C</option>
          </select>
        )
      }
      render(<Select />)
      const user = userEvent.setup()

      await user.selectOptions(screen.getByRole('listbox'), ['a', 'c'])
      await user.deselectOptions(screen.getByRole('listbox'), 'a')

      expect(values).toEqual([['a'], ['a', 'c'], ['c']])
    })
  })

  describe('focus and blur', () => {
    test('tab() moves focus through fields in order and fires focus/blur handlers', async () => {
      const log: string[] = []
      render(
        <form>
          {['first', 'second', 'third'].map(name => (
            <input
              key={name}
              aria-label={name}
              onFocus={() => log.push(`focus ${name}`)}
              onBlur={() => log.push(`blur ${name}`)}
            />
          ))}
          <input aria-label="skipped" tabIndex={-1} />
          <button type="button" onFocus={() => log.push('focus button')}>
            ok
          </button>
        </form>,
      )
      const user = userEvent.setup()

      await user.tab()
      await user.tab()
      await user.tab()
      await user.tab()
      await user.tab({shift: true})

      expect(log).toEqual([
        'focus first',
        'blur first',
        'focus second',
        'blur second',
        'focus third',
        'blur third',
        'focus button',
        'focus third',
      ])
    })

    test('click moves focus; onBlur sees the new relatedTarget', async () => {
      const related: Array<string | null> = []
      render(
        <>
          <input
            aria-label="a"
            onBlur={e =>
              related.push(
                (e.relatedTarget as HTMLElement | null)?.getAttribute(
                  'aria-label',
                ) ?? null,
              )
            }
          />
          <input aria-label="b" />
        </>,
      )
      const user = userEvent.setup()

      await user.click(screen.getByLabelText('a'))
      await user.click(screen.getByLabelText('b'))

      expect(related).toEqual(['b'])
      expect(document.activeElement).toBe(screen.getByLabelText('b'))
    })

    test('change fires on blur after typing into an uncontrolled input (native listener)', async () => {
      const onNativeChange = vi.fn()
      function Input() {
        const ref = useRef<HTMLInputElement>(null)
        useLayoutEffect(() => {
          const el = ref.current!
          el.addEventListener('change', onNativeChange)
          return () => el.removeEventListener('change', onNativeChange)
        }, [])
        return <input ref={ref} />
      }
      render(
        <>
          <Input />
          <button>next</button>
        </>,
      )
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'abc')
      expect(onNativeChange).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button'))
      expect(onNativeChange).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard shortcuts', () => {
    test('modifier state is visible to onKeyDown', async () => {
      const shortcuts: string[] = []
      render(
        <div
          tabIndex={0}
          onKeyDown={e => {
            if (e.ctrlKey && e.key === 's') shortcuts.push('save')
            if (e.metaKey && e.shiftKey && e.key === 'P')
              shortcuts.push('palette')
            if (e.altKey && e.code === 'KeyK') shortcuts.push('alt-k')
          }}
        >
          editor
        </div>,
      )
      const user = userEvent.setup()

      await user.click(screen.getByText('editor'))
      await user.keyboard('{Control>}s{/Control}')
      await user.keyboard('{Meta>}{Shift>}P{/Shift}{/Meta}')
      await user.keyboard('{Alt>}[KeyK]{/Alt}')
      await user.keyboard('s')

      expect(shortcuts).toEqual(['save', 'palette', 'alt-k'])
    })

    test('Ctrl+A selects all, then typing replaces the value', async () => {
      function Input() {
        const [value, setValue] = useState('old value')
        return <input value={value} onChange={e => setValue(e.target.value)} />
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.click(screen.getByRole('textbox'))
      await user.keyboard('{Control>}a{/Control}new')

      expect(screen.getByRole('textbox')).toHaveValue('new')
    })

    test('preventDefault on keydown blocks the character', async () => {
      function Input() {
        const [value, setValue] = useState('')
        return (
          <input
            value={value}
            onKeyDown={e => {
              if (/\d/.test(e.key)) e.preventDefault()
            }}
            onChange={e => setValue(e.target.value)}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'a1b2c3')

      expect(screen.getByRole('textbox')).toHaveValue('abc')
    })

    test('Escape closes a dialog-like component', async () => {
      function Popup() {
        const [open, setOpen] = useState(true)
        return open ? (
          <div
            role="dialog"
            tabIndex={-1}
            onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          >
            <input aria-label="inside" />
          </div>
        ) : null
      }
      render(<Popup />)
      const user = userEvent.setup()

      await user.click(screen.getByLabelText('inside'))
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('clipboard', () => {
    test('paste into a controlled input fires onPaste with clipboardData and onChange', async () => {
      const pasted: string[] = []
      function Input() {
        const [value, setValue] = useState('a')
        return (
          <input
            value={value}
            onPaste={e => pasted.push(e.clipboardData.getData('text/plain'))}
            onChange={e => setValue(e.target.value)}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.click(screen.getByRole('textbox'))
      await user.paste('bc')

      expect(pasted).toEqual(['bc'])
      expect(screen.getByRole('textbox')).toHaveValue('abc')
    })

    test('copy then paste round-trips through the navigator.clipboard stub', async () => {
      function Inputs() {
        const [a, setA] = useState('copy me')
        const [b, setB] = useState('')
        return (
          <>
            <input
              aria-label="a"
              value={a}
              onChange={e => setA(e.target.value)}
            />
            <input
              aria-label="b"
              value={b}
              onChange={e => setB(e.target.value)}
            />
          </>
        )
      }
      render(<Inputs />)
      const user = userEvent.setup()

      await user.tripleClick(screen.getByLabelText('a'))
      await user.copy()
      await expect(navigator.clipboard.readText()).resolves.toBe('copy me')

      await user.click(screen.getByLabelText('b'))
      await user.paste()

      expect(screen.getByLabelText('b')).toHaveValue('copy me')
    })

    test('cut removes the selection and fires onCut + onChange', async () => {
      const onCut = vi.fn()
      function Input() {
        const [value, setValue] = useState('hello world')
        return (
          <input
            value={value}
            onCut={onCut}
            onChange={e => setValue(e.target.value)}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()
      const input = screen.getByRole('textbox') as HTMLInputElement

      await user.click(input)
      input.setSelectionRange(5, 11)
      await user.cut()

      expect(onCut).toHaveBeenCalledTimes(1)
      expect(input).toHaveValue('hello')
      await expect(navigator.clipboard.readText()).resolves.toBe(' world')
    })
  })

  describe('React work between actions', () => {
    test('effects and the renders they trigger flush before the next keystroke', async () => {
      const seenOnKeyDown: number[] = []
      function Input() {
        const [value, setValue] = useState('')
        const [length, setLength] = useState(0)
        useEffect(() => {
          setLength(value.length)
        }, [value])
        return (
          <input
            value={value}
            onKeyDown={() => seenOnKeyDown.push(length)}
            onChange={e => setValue(e.target.value)}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'abcd')

      expect(seenOnKeyDown).toEqual([0, 1, 2, 3])
    })

    test('state set in a promise callback is visible to the next keystroke', async () => {
      const seen: string[] = []
      function Input() {
        const [value, setValue] = useState('')
        const [echo, setEcho] = useState('')
        return (
          <input
            value={value}
            onKeyDown={() => seen.push(echo)}
            onChange={e => {
              const next = e.target.value
              setValue(next)
              void Promise.resolve().then(() => setEcho(next))
            }}
          />
        )
      }
      render(<Input />)
      const user = userEvent.setup()

      await user.type(screen.getByRole('textbox'), 'xyz')

      expect(seen).toEqual(['', 'x', 'xy'])
    })

    test('setTimeout(0) callbacks scheduled during an API call ran when it resolves', async () => {
      function Button() {
        const [label, setLabel] = useState('idle')
        return (
          <button onClick={() => setTimeout(() => setLabel('done'), 0)}>
            {label}
          </button>
        )
      }
      render(<Button />)
      const user = userEvent.setup()

      await user.click(screen.getByRole('button'))

      expect(screen.getByRole('button')).toHaveTextContent('done')
    })

    test('an animation frame requested during a click has run a few clicks later', async () => {
      // Downstream regression (Sentry's notificationActionManager.spec): React Aria restores focus
      // in requestAnimationFrame after a menu closes, and the click after next must not land
      // before it. Every wait between actions takes at least 1 ms on jsdom (Node's setTimeout
      // minimum); under idle time skipping it must advance the clock by as much.
      let frameRan = false
      function Buttons() {
        return (
          <>
            <button
              onClick={() => requestAnimationFrame(() => (frameRan = true))}
            >
              open
            </button>
            <button>next</button>
          </>
        )
      }
      render(<Buttons />)
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', {name: 'open'}))
      let clicks = 0
      while (!frameRan && clicks < 100) {
        await user.click(screen.getByRole('button', {name: 'next'}))
        clicks++
      }
      expect(clicks).toBeLessThanOrEqual(8)
    })

    test('fake timers with advanceTimers keep working', async () => {
      // RTL's asyncWrapper drains with `setTimeout(0)` and only advances fake timers when a
      // global `jest` exists; the usual vitest workaround provides it.
      const g = globalThis as {jest?: unknown}
      g.jest = {advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms)}
      vi.useFakeTimers()
      try {
        function Debounced() {
          const [value, setValue] = useState('')
          const [committed, setCommitted] = useState('')
          useEffect(() => {
            const t = setTimeout(() => setCommitted(value), 300)
            return () => clearTimeout(t)
          }, [value])
          return (
            <>
              <input value={value} onChange={e => setValue(e.target.value)} />
              <output>{committed}</output>
            </>
          )
        }
        render(<Debounced />)
        const user = userEvent.setup({
          advanceTimers: vi.advanceTimersByTime,
          delay: 100,
        })

        await user.type(screen.getByRole('textbox'), 'abc')
        expect(screen.getByRole('status')).toHaveTextContent('')
        await user.keyboard('d')
        await stockRTL.act(() => vi.advanceTimersByTime(300))
        expect(screen.getByRole('status')).toHaveTextContent('abcd')
      } finally {
        vi.useRealTimers()
        delete g.jest
      }
    })
  })
})

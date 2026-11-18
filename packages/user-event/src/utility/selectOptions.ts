// Ported from @testing-library/user-event v14.6.8 (MIT)
// https://github.com/testing-library/user-event/blob/v14.6.8/src/utility/selectOptions.ts

import type {
  Element,
  HTMLElement,
  HTMLOptionElement,
  HTMLSelectElement,
} from '../dom-types.ts'
import {getConfig} from '../setup/dtl.ts'
import {
  hasPointerEvents,
  isDisabled,
  isElementType,
  yieldBetweenActions,
} from '../utils/index.ts'
import {type Instance} from '../setup/index.ts'
import {focusElement} from '../event/index.ts'

export async function selectOptions(
  this: Instance,
  select: Element,
  values: HTMLElement | HTMLElement[] | string[] | string,
) {
  return selectOptionsBase.call(this, true, select, values)
}

export async function deselectOptions(
  this: Instance,
  select: Element,
  values: HTMLElement | HTMLElement[] | string[] | string,
) {
  return selectOptionsBase.call(this, false, select, values)
}

const optionSelector = 'option, [role="option"]'

function resolveOptions(
  select: Element,
  values: HTMLElement | HTMLElement[] | string[] | string,
): HTMLElement[] {
  const requested = Array.isArray(values) ? values : [values]
  if (
    requested.every(
      (value): value is HTMLElement =>
        typeof value !== 'string' &&
        value?.nodeType === 1 &&
        value !== select &&
        select.contains(value) &&
        value.matches(optionSelector),
    )
  ) {
    return requested
  }

  const options = select.querySelectorAll(optionSelector)
  // A single lookup can stop at the match. Copy once for repeated indexed reads on foreign DOMs.
  const candidates = requested.length === 1 ? options : Array.from(options)
  return requested.map(value => {
    if (
      typeof value !== 'string' &&
      Array.prototype.includes.call(candidates, value)
    ) {
      return value
    }
    for (let i = 0, length = candidates.length; i < length; i++) {
      const option = candidates[i]
      if (
        (option as HTMLOptionElement).value === value ||
        option.innerHTML === value
      ) {
        return option
      }
    }
    throw getConfig().getElementError(
      `Value "${String(value as string)}" not found in options`,
      select,
    )
  })
}

async function selectOptionsBase(
  this: Instance,
  newValue: boolean,
  select: Element,
  values: HTMLElement | HTMLElement[] | string[] | string,
) {
  if (!newValue && !(select as HTMLSelectElement).multiple) {
    throw getConfig().getElementError(
      `Unable to deselect an option in a non-multiple select. Use selectOptions to change the selection instead.`,
      select,
    )
  }
  const selectedOptions = resolveOptions(select, values).filter(
    option => !isDisabled(option),
  )

  if (isDisabled(select) || !selectedOptions.length) return

  const selectOption = (option: HTMLOptionElement) => {
    option.selected = newValue
    this.dispatchUIEvent(select, 'input', {
      bubbles: true,
      cancelable: false,
      composed: true,
    })
    this.dispatchUIEvent(select, 'change')
  }

  if (isElementType(select, 'select')) {
    if (select.multiple) {
      for (const option of selectedOptions) {
        const withPointerEvents =
          this.config.pointerEventsCheck === 0
            ? true
            : hasPointerEvents(this, option)

        // events fired for multiple select are weird. Can't use hover...
        if (withPointerEvents) {
          this.dispatchUIEvent(option, 'pointerover')
          this.dispatchUIEvent(select, 'pointerenter')
          this.dispatchUIEvent(option, 'mouseover')
          this.dispatchUIEvent(select, 'mouseenter')
          this.dispatchUIEvent(option, 'pointermove')
          this.dispatchUIEvent(option, 'mousemove')
          this.dispatchUIEvent(option, 'pointerdown')
          this.dispatchUIEvent(option, 'mousedown')
        }

        focusElement(select)

        if (withPointerEvents) {
          this.dispatchUIEvent(option, 'pointerup')
          this.dispatchUIEvent(option, 'mouseup')
        }

        selectOption(option as HTMLOptionElement)

        if (withPointerEvents) {
          this.dispatchUIEvent(option, 'click')
        }

        await yieldBetweenActions(this.config)
      }
    } else if (selectedOptions.length === 1) {
      const withPointerEvents =
        this.config.pointerEventsCheck === 0
          ? true
          : hasPointerEvents(this, select)
      // the click to open the select options
      if (withPointerEvents) {
        await this.click(select)
      } else {
        focusElement(select)
      }

      selectOption(selectedOptions[0] as HTMLOptionElement)

      if (withPointerEvents) {
        // the browser triggers another click event on the select for the click on the option
        // this second click has no 'down' phase
        this.dispatchUIEvent(select, 'pointerover')
        this.dispatchUIEvent(select, 'pointerenter')
        this.dispatchUIEvent(select, 'mouseover')
        this.dispatchUIEvent(select, 'mouseenter')
        this.dispatchUIEvent(select, 'pointerup')
        this.dispatchUIEvent(select, 'mouseup')
        this.dispatchUIEvent(select, 'click')
      }

      await yieldBetweenActions(this.config)
    } else {
      throw getConfig().getElementError(
        `Cannot select multiple options on a non-multiple select`,
        select,
      )
    }
  } else if (select.getAttribute('role') === 'listbox') {
    for (const option of selectedOptions) {
      await this.click(option)
      await this.unhover(option)
    }
  } else {
    throw getConfig().getElementError(
      `Cannot select options on elements that are neither select nor listbox elements`,
      select,
    )
  }
}

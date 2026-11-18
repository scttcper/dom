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

export function selectOptions(
  this: Instance,
  select: Element,
  values: HTMLElement | HTMLElement[] | string[] | string,
) {
  return selectOptionsBase.call(this, true, select, values)
}

export function deselectOptions(
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

  return performSelection.call(this, newValue, select, selectedOptions)
}

async function performSelection(
  this: Instance,
  newValue: boolean,
  select: Element,
  selectedOptions: HTMLElement[],
) {
  if (isElementType(select, 'select')) {
    if (select.multiple) {
      selectedOptions.reverse()
      while (selectedOptions.length) {
        selectMultipleOption(
          this,
          select,
          selectedOptions.pop() as HTMLOptionElement,
          newValue,
        )
        if (selectedOptions.length) await yieldBetweenActions(this.config)
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

      selectOption(
        this,
        select,
        selectedOptions.pop() as HTMLOptionElement,
        newValue,
      )

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
    } else {
      throw getConfig().getElementError(
        `Cannot select multiple options on a non-multiple select`,
        select,
      )
    }
    return finishSelection(this.config)
  } else if (select.getAttribute('role') === 'listbox') {
    selectedOptions.reverse()
    while (selectedOptions.length) {
      const option = selectedOptions.pop()!
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

// The final delay only needs the clock. Release the select and its subtree before waiting.
async function finishSelection(config: Instance['config']) {
  await yieldBetweenActions(config)
}

function selectOption(
  instance: Instance,
  select: Element,
  option: HTMLOptionElement,
  newValue: boolean,
) {
  option.selected = newValue
  instance.dispatchUIEvent(select, 'input', {
    bubbles: true,
    cancelable: false,
    composed: true,
  })
  instance.dispatchUIEvent(select, 'change')
}

function selectMultipleOption(
  instance: Instance,
  select: Element,
  option: HTMLOptionElement,
  newValue: boolean,
) {
  const withPointerEvents =
    instance.config.pointerEventsCheck === 0
      ? true
      : hasPointerEvents(instance, option)

  // events fired for multiple select are weird. Can't use hover...
  if (withPointerEvents) {
    instance.dispatchUIEvent(option, 'pointerover')
    instance.dispatchUIEvent(select, 'pointerenter')
    instance.dispatchUIEvent(option, 'mouseover')
    instance.dispatchUIEvent(select, 'mouseenter')
    instance.dispatchUIEvent(option, 'pointermove')
    instance.dispatchUIEvent(option, 'mousemove')
    instance.dispatchUIEvent(option, 'pointerdown')
    instance.dispatchUIEvent(option, 'mousedown')
  }

  focusElement(select)

  if (withPointerEvents) {
    instance.dispatchUIEvent(option, 'pointerup')
    instance.dispatchUIEvent(option, 'mouseup')
  }

  selectOption(instance, select, option, newValue)

  if (withPointerEvents) {
    instance.dispatchUIEvent(option, 'click')
  }
}

// https://drafts.csswg.org/cssom-view/#the-screen-interface
// https://drafts.csswg.org/cssom-view/#the-visualviewport-interface
//
// No real display: values derive from the window's configured inner size.
//
// No `screen.orientation` (ScreenOrientation), like jsdom and happy-dom: with a fixed angle it
// hides rotation from code that reads `window.orientation`, e.g. React Aria's keyboard tracking,
// whose test polyfill installs a `screen.orientation` only when there is none. docs/deviations.md.

import { EventTarget } from "../events/EventTarget.ts";
import type { Window } from "./Window.ts";
import { $options, $window } from "../keys.ts";

export class Screen extends EventTarget {
  [$window]: Window;

  constructor(window: Window) {
    super();
    this[$window] = window;
  }

  get width(): number {
    return this[$window][$options].screenWidth;
  }
  get height(): number {
    return this[$window][$options].screenHeight;
  }
  get availWidth(): number {
    return this[$window][$options].screenWidth;
  }
  get availHeight(): number {
    return this[$window][$options].screenHeight;
  }
  get availLeft(): number {
    return 0;
  }
  get availTop(): number {
    return 0;
  }
  get colorDepth(): number {
    return 24;
  }
  get pixelDepth(): number {
    return 24;
  }
  get isExtended(): boolean {
    return false;
  }
}

export class VisualViewport extends EventTarget {
  [$window]: Window;

  constructor(window: Window) {
    super();
    this[$window] = window;
  }

  get offsetLeft(): number {
    return 0;
  }
  get offsetTop(): number {
    return 0;
  }
  get pageLeft(): number {
    return this[$window].scrollX;
  }
  get pageTop(): number {
    return this[$window].scrollY;
  }
  get width(): number {
    return this[$window].innerWidth;
  }
  get height(): number {
    return this[$window].innerHeight;
  }
  get scale(): number {
    return 1;
  }
}

// https://drafts.csswg.org/cssom-view/#the-screen-interface
// https://w3c.github.io/screen-orientation/#screenorientation-interface
// https://drafts.csswg.org/cssom-view/#the-visualviewport-interface
//
// No real display: values derive from the window's configured inner size.

import { EventTarget } from "../events/EventTarget.ts";
import type { Window } from "./Window.ts";
import { $options, $orientation, $window } from "../keys.ts";

export class ScreenOrientation extends EventTarget {
  [$window]: Window;

  constructor(window: Window) {
    super();
    this[$window] = window;
  }

  get type(): string {
    return this[$window][$options].screenWidth >= this[$window][$options].screenHeight ? "landscape-primary" : "portrait-primary";
  }

  get angle(): number {
    return 0;
  }

  async lock(_orientation: string): Promise<void> {
    throw new DOMException("Screen orientation locking is not supported.", "NotSupportedError");
  }

  unlock(): void {}
}

export class Screen extends EventTarget {
  [$window]: Window;
  [$orientation]: ScreenOrientation | null;

  constructor(window: Window) {
    super();
    this[$window] = window;
    this[$orientation] = null;
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
  get orientation(): ScreenOrientation {
    return (this[$orientation] ??= new ScreenOrientation(this[$window]));
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

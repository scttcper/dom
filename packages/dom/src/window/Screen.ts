// https://drafts.csswg.org/cssom-view/#the-screen-interface
// https://w3c.github.io/screen-orientation/#screenorientation-interface
// https://drafts.csswg.org/cssom-view/#the-visualviewport-interface
//
// No real display: values derive from the window's configured inner size.

import { EventTarget } from "../events/EventTarget.ts";
import type { Window } from "./Window.ts";

export class ScreenOrientation extends EventTarget {
  _window: Window;

  constructor(window: Window) {
    super();
    this._window = window;
  }

  get type(): string {
    return this._window._options.screenWidth >= this._window._options.screenHeight ? "landscape-primary" : "portrait-primary";
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
  _window: Window;
  _orientation: ScreenOrientation | null;

  constructor(window: Window) {
    super();
    this._window = window;
    this._orientation = null;
  }

  get width(): number {
    return this._window._options.screenWidth;
  }
  get height(): number {
    return this._window._options.screenHeight;
  }
  get availWidth(): number {
    return this._window._options.screenWidth;
  }
  get availHeight(): number {
    return this._window._options.screenHeight;
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
    return (this._orientation ??= new ScreenOrientation(this._window));
  }
}

export class VisualViewport extends EventTarget {
  _window: Window;

  constructor(window: Window) {
    super();
    this._window = window;
  }

  get offsetLeft(): number {
    return 0;
  }
  get offsetTop(): number {
    return 0;
  }
  get pageLeft(): number {
    return this._window.scrollX;
  }
  get pageTop(): number {
    return this._window.scrollY;
  }
  get width(): number {
    return this._window.innerWidth;
  }
  get height(): number {
    return this._window.innerHeight;
  }
  get scale(): number {
    return 1;
  }
}

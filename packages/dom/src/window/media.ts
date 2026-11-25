// https://drafts.csswg.org/cssom-view/#the-mediaquerylist-interface
//
// `matchMedia()` evaluates with the css area's media query evaluator (css/media.ts) against the
// window's viewport and `mediaFeatures` overrides. Change events fire synchronously when the
// window's viewport size or devicePixelRatio is changed (assigning innerWidth, resizeTo, ...).

import { EventTarget } from "../events/EventTarget.ts";
import { hasListeners } from "../events/listeners.ts";
import type { EventListenerOrEventListenerObject } from "../webidl.ts";
import type { MediaFeatureEnvironment } from "./hooks.ts";
import { matchMediaText } from "../css/media.ts";
import { MediaQueryListEvent } from "./events.ts";
import type { Window } from "./Window.ts";
import { $listenerTypesChanged, $matches, $media, $mediaQueryLists, $onchange, $options, $window } from "../keys.ts";

export class MediaQueryList extends EventTarget {
  declare [$window]: Window;
  declare [$media]: string;
  /** Last value change listeners were told about. */
  declare [$matches]: boolean;
  declare [$onchange]: EventListenerOrEventListenerObject | null;

  constructor(window: Window, media: string) {
    super();
    this[$window] = window;
    this[$media] = media;
    this[$matches] = false;
    this[$onchange] = null;
  }

  /** https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-media */
  get media(): string {
    return this[$media];
  }

  /** https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-matches */
  get matches(): boolean {
    return matchMediaText(this[$media], mediaEnvironment(this[$window]));
  }

  /** https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-addlistener */
  addListener(callback: EventListenerOrEventListenerObject | null): void {
    this.addEventListener("change", callback);
  }

  removeListener(callback: EventListenerOrEventListenerObject | null): void {
    this.removeEventListener("change", callback);
  }

  get onchange(): EventListenerOrEventListenerObject | null {
    return this[$onchange];
  }

  set onchange(value: EventListenerOrEventListenerObject | null) {
    if (this[$onchange] !== null) super.removeEventListener("change", this[$onchange]);
    this[$onchange] = typeof value === "function" || (value !== null && typeof value === "object") ? value : null;
    if (this[$onchange] !== null) super.addEventListener("change", this[$onchange]);
  }

  [$listenerTypesChanged](): void {
    const watched = this[$window][$mediaQueryLists];
    if (!hasListeners(this, "change")) watched.delete(this);
    else if (!watched.has(this)) {
      this[$matches] = this.matches;
      watched.add(this);
    }
  }

  get [Symbol.toStringTag](): string {
    return "MediaQueryList";
  }
}

/** https://drafts.csswg.org/cssom-view/#evaluate-media-queries-and-report-changes */
export function reportMediaQueryChanges(window: Window): void {
  for (const mql of window[$mediaQueryLists]) {
    const matches = mql.matches;
    if (matches === mql[$matches]) continue;
    mql[$matches] = matches;
    mql.dispatchEvent(new MediaQueryListEvent("change", { media: mql[$media], matches }));
  }
}

export function mediaEnvironment(window: Window): MediaFeatureEnvironment {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    mediaType: "screen",
    features: window[$options].mediaFeatures ?? null,
  };
}

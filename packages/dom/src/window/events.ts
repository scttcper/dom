// https://drafts.csswg.org/cssom-view/#the-mediaquerylistevent-interface
//
// The one Event subclass the window area owns; the others (HashChangeEvent, PopStateEvent,
// StorageEvent, MessageEvent, ErrorEvent, ProgressEvent, ...) come from the events area.

import { Event } from "../events/Event.ts";
import type { EventInit } from "../webidl.ts";

export interface MediaQueryListEventInit extends EventInit {
  media?: string;
  matches?: boolean;
}

export class MediaQueryListEvent extends Event {
  readonly media: string;
  readonly matches: boolean;
  constructor(type: string, init: MediaQueryListEventInit = {}) {
    super(type, init);
    this.media = init.media === undefined ? "" : String(init.media);
    this.matches = !!init.matches;
  }
}

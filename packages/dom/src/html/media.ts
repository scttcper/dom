// Media elements without a media pipeline.
// https://html.spec.whatwg.org/#htmlmediaelement
//
// Nothing is fetched or decoded: networkState stays NETWORK_EMPTY/NETWORK_NO_SOURCE,
// readyState HAVE_NOTHING, duration NaN. The playback state is still tracked so components can
// drive it: play() clears `paused`, fires `play` (and `playing`) and resolves; pause() sets
// `paused` and fires `pause`; load() resets the state and fires `emptied` when needed. This is
// what tests usually mock by hand on jsdom (whose play()/pause() throw "not implemented"); see
// docs/deviations.md.

import { HTMLElement } from "./HTMLElement.ts";
import { bool, CROSS_ORIGIN, enumerated, LOADING, ulong, url, contentAttr } from "./reflect.ts";
import { fireEvent, queueElementTask } from "./events.ts";
import { currentDocument } from "../window/current.ts";
import type { Document } from "../nodes/Document.ts";
import { setAttribute } from "../nodes/attributes.ts";
import { HTML_NS } from "../nodes/constants.ts";
import { reportNotImplemented, stubbedMethod } from "../window/not-implemented.ts";
import { $impl, $window } from "../keys.ts";

/** What jsdom stubs (and reports, window/not-implemented.ts) on HTMLMediaElement; we implement them. */
const NOT_IMPLEMENTED = {
  load: stubbedMethod("HTMLMediaElement", "load"),
  play: stubbedMethod("HTMLMediaElement", "play"),
  pause: stubbedMethod("HTMLMediaElement", "pause"),
  addTextTrack: stubbedMethod("HTMLMediaElement", "addTextTrack"),
};

const windowOf = (el: HTMLElement): object | null => el[$impl].doc[$window] as object | null;

/** Per-element playback state (wrapper-side; media elements are rare). */
class MediaState {
  paused = true;
  currentTime = 0;
  volume = 1;
  muted: boolean | null = null;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  ended = false;
  seeking = false;
  preservesPitch = true;
  srcObject: unknown = null;
}

const STATE = Symbol("media");

function state(el: HTMLMediaElement): MediaState {
  const rec = el as unknown as Record<symbol, MediaState>;
  let s = rec[STATE];
  if (s === undefined) {
    s = new MediaState();
    Object.defineProperty(el, STATE, { value: s });
  }
  return s;
}

/** https://html.spec.whatwg.org/#timeranges */
export class TimeRanges {
  get length(): number {
    return 0;
  }
  start(index: number): number {
    throw new DOMException(`The index provided (${index}) is greater than or equal to the maximum bound (0).`, "IndexSizeError");
  }
  end(index: number): number {
    throw new DOMException(`The index provided (${index}) is greater than or equal to the maximum bound (0).`, "IndexSizeError");
  }
}

export class MediaError {
  static readonly MEDIA_ERR_ABORTED = 1;
  static readonly MEDIA_ERR_NETWORK = 2;
  static readonly MEDIA_ERR_DECODE = 3;
  static readonly MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
}

export class HTMLMediaElement extends HTMLElement {
  static readonly NETWORK_EMPTY = 0;
  static readonly NETWORK_IDLE = 1;
  static readonly NETWORK_LOADING = 2;
  static readonly NETWORK_NO_SOURCE = 3;
  static readonly HAVE_NOTHING = 0;
  static readonly HAVE_METADATA = 1;
  static readonly HAVE_CURRENT_DATA = 2;
  static readonly HAVE_FUTURE_DATA = 3;
  static readonly HAVE_ENOUGH_DATA = 4;

  get error(): MediaError | null {
    return null;
  }
  get currentSrc(): string {
    return (this as unknown as { src: string }).src;
  }
  get srcObject(): unknown {
    return state(this).srcObject;
  }
  set srcObject(v: unknown) {
    state(this).srcObject = v;
  }
  get networkState(): number {
    return 0;
  }
  get buffered(): TimeRanges {
    return new TimeRanges();
  }
  get readyState(): number {
    return 0;
  }
  get seeking(): boolean {
    return state(this).seeking;
  }
  get currentTime(): number {
    return state(this).currentTime;
  }
  set currentTime(v: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new TypeError("The provided double value is non-finite.");
    state(this).currentTime = n;
  }
  fastSeek(time: number): void {
    this.currentTime = time;
  }
  get duration(): number {
    return NaN;
  }
  getStartDate(): Date {
    return new Date(NaN);
  }
  get paused(): boolean {
    return state(this).paused;
  }
  get defaultPlaybackRate(): number {
    return state(this).defaultPlaybackRate;
  }
  set defaultPlaybackRate(v: number) {
    state(this).defaultPlaybackRate = Number(v);
    fireEvent(this, "ratechange");
  }
  get playbackRate(): number {
    return state(this).playbackRate;
  }
  set playbackRate(v: number) {
    state(this).playbackRate = Number(v);
    fireEvent(this, "ratechange");
  }
  get preservesPitch(): boolean {
    return state(this).preservesPitch;
  }
  set preservesPitch(v: boolean) {
    state(this).preservesPitch = !!v;
  }
  get played(): TimeRanges {
    return new TimeRanges();
  }
  get seekable(): TimeRanges {
    return new TimeRanges();
  }
  get ended(): boolean {
    return state(this).ended;
  }
  get volume(): number {
    return state(this).volume;
  }
  set volume(v: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new TypeError("The provided double value is non-finite.");
    if (n < 0 || n > 1) throw new DOMException(`The volume provided (${n}) is outside the range [0, 1].`, "IndexSizeError");
    const s = state(this);
    if (s.volume === n) return;
    s.volume = n;
    fireEvent(this, "volumechange");
  }
  /** https://html.spec.whatwg.org/#dom-media-muted — initially the `muted` attribute's presence. */
  get muted(): boolean {
    const s = state(this);
    return s.muted ?? contentAttr(this[$impl], "muted") !== null;
  }
  set muted(v: boolean) {
    const s = state(this);
    const m = !!v;
    if (this.muted === m) {
      s.muted = m;
      return;
    }
    s.muted = m;
    fireEvent(this, "volumechange");
  }
  /** https://html.spec.whatwg.org/#dom-navigator-canplaytype */
  canPlayType(_type: string): string {
    return "";
  }
  /** https://html.spec.whatwg.org/#dom-media-load */
  load(): void {
    reportNotImplemented(windowOf(this), NOT_IMPLEMENTED.load);
    const s = state(this);
    const wasPlaying = !s.paused;
    s.currentTime = 0;
    s.ended = false;
    if (wasPlaying) {
      s.paused = true;
      queueElementTask(this, () => fireEvent(this, "pause"));
    }
    queueElementTask(this, () => fireEvent(this, "emptied"));
  }
  /** https://html.spec.whatwg.org/#dom-media-play */
  play(): Promise<void> {
    reportNotImplemented(windowOf(this), NOT_IMPLEMENTED.play);
    const s = state(this);
    if (s.paused) {
      s.paused = false;
      s.ended = false;
      queueElementTask(this, () => {
        fireEvent(this, "play");
        fireEvent(this, "playing");
      });
    }
    return Promise.resolve();
  }
  /** https://html.spec.whatwg.org/#dom-media-pause */
  pause(): void {
    reportNotImplemented(windowOf(this), NOT_IMPLEMENTED.pause);
    const s = state(this);
    if (!s.paused) {
      s.paused = true;
      queueElementTask(this, () => {
        fireEvent(this, "timeupdate");
        fireEvent(this, "pause");
      });
    }
  }
  get textTracks(): unknown[] {
    return [];
  }
  get audioTracks(): unknown[] {
    return [];
  }
  get videoTracks(): unknown[] {
    return [];
  }
  addTextTrack(): never {
    reportNotImplemented(windowOf(this), NOT_IMPLEMENTED.addTextTrack);
    throw new DOMException("Text tracks are not supported.", "NotSupportedError");
  }
  setMediaKeys(): Promise<void> {
    return Promise.resolve();
  }
  get mediaKeys(): null {
    return null;
  }
  setSinkId(): Promise<void> {
    return Promise.resolve();
  }
  get sinkId(): string {
    return "";
  }
}
url(HTMLMediaElement, "src");
enumerated(HTMLMediaElement, "crossOrigin=crossorigin", CROSS_ORIGIN);
enumerated(HTMLMediaElement, "preload", { keywords: ["none", "metadata", "auto"], missing: "metadata", invalid: "metadata", empty: "auto" });
enumerated(HTMLMediaElement, "loading", LOADING);
bool(HTMLMediaElement, "autoplay loop controls defaultMuted=muted disableRemotePlayback=disableremoteplayback");

export class HTMLAudioElement extends HTMLMediaElement {}

export class HTMLVideoElement extends HTMLMediaElement {
  get videoWidth(): number {
    return 0;
  }
  get videoHeight(): number {
    return 0;
  }
  getVideoPlaybackQuality(): object {
    return { creationTime: performance.now(), droppedVideoFrames: 0, totalVideoFrames: 0 };
  }
  requestPictureInPicture(): Promise<never> {
    return Promise.reject(new DOMException("Picture-in-Picture is not supported.", "NotSupportedError"));
  }
  requestVideoFrameCallback(_cb: unknown): number {
    return 0;
  }
  cancelVideoFrameCallback(_handle: number): void {}
}
ulong(HTMLVideoElement, "width height");
url(HTMLVideoElement, "poster");
bool(HTMLVideoElement, "playsInline=playsinline disablePictureInPicture=disablepictureinpicture");

// --- legacy factory functions -----------------------------------------------------------------

/**
 * https://html.spec.whatwg.org/#dom-audio — `new Audio(src?)` creates an <audio preload=auto>
 * in the current window's document.
 */
export const Audio = function Audio(this: unknown, src?: string): HTMLAudioElement {
  if (new.target === undefined) throw new TypeError("Failed to construct 'Audio': Please use the 'new' operator.");
  const doc: Document = currentDocument();
  const el = doc.createElementNS(HTML_NS, "audio") as HTMLAudioElement;
  setAttribute(el[$impl], "preload", "auto");
  if (src !== undefined) setAttribute(el[$impl], "src", String(src));
  return el;
} as unknown as { new (src?: string): HTMLAudioElement; prototype: HTMLAudioElement };
Audio.prototype = HTMLAudioElement.prototype;

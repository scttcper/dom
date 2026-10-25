// Port of @testing-library/dom src/wait-for.js (MIT).
// https://github.com/testing-library/dom-testing-library/blob/main/src/wait-for.js

import { getWindowFromNode, getDocument, jestFakeTimersAreEnabled, advanceFakeTimersByTime, checkContainerType } from "./helpers.ts";
import { getConfig, runWithExpensiveErrorDiagnosticsDisabled } from "./config.ts";
import { envDebugFormat } from "./agent-debug.ts";
import { tracePromise, tracing, type SpanContext } from "@rtd/dom/internal";
import { AsyncLocalStorage } from "node:async_hooks";

export interface WaitForOptions {
  container?: any;
  timeout?: number;
  interval?: number;
  onTimeout?: (error: Error) => Error;
  mutationObserverOptions?: Record<string, unknown>;
  showOriginalStackTrace?: boolean;
  stackTraceError?: Error;
}

// This is so the stack trace the developer sees is one that's
// closer to their code (because async stack traces are hard to follow).
function copyStackTrace(target: Error, source: Error | undefined): void {
  target.stack = source!.stack!.replace(source!.message, target.message);
}

function waitForImpl<T>(
  callback: () => T | Promise<T>,
  {
    container = getDocument(),
    timeout = getConfig().asyncUtilTimeout,
    showOriginalStackTrace = getConfig().showOriginalStackTrace,
    stackTraceError,
    interval = 50,
    onTimeout = (error) => {
      // Ours: under CTRL_DOM_DEBUG a query error already carries the snapshot; upstream prints
      // the DOM a second time here.
      if (error.name === "TestingLibraryElementError" && envDebugFormat() !== null) return error;
      Object.defineProperty(error, "message", {
        value: getConfig().getElementError(error.message, container).message,
      });
      return error;
    },
    mutationObserverOptions = {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    },
  }: WaitForOptions,
  span: SpanContext | null = null,
): Promise<T> {
  if (typeof callback !== "function") {
    throw new TypeError("Received `callback` arg must be a function");
  }

  // eslint-disable-next-line no-async-promise-executor
  return new Promise<T>(async (resolve, reject) => {
    let lastError: any;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let observer: any;
    let finished = false;
    let promiseStatus = "idle";

    const overallTimeoutTimer = setTimeout(handleTimeout, timeout);

    const usingJestFakeTimers = jestFakeTimersAreEnabled();
    if (usingJestFakeTimers) {
      const { unstable_advanceTimersWrapper: advanceTimersWrapper } = getConfig();
      checkCallback();
      // this is a dangerous rule to disable because it could lead to an
      // infinite loop. However, eslint isn't smart enough to know that we're
      // setting finished inside `onDone` which will be called when we're done
      // waiting or when we've timed out.
      while (!finished) {
        if (!jestFakeTimersAreEnabled()) {
          const error = new Error(
            `Changed from using fake timers to real timers while using waitFor. This is not allowed and will result in very strange behavior. Please ensure you're awaiting all async things your test is doing before changing to real timers. For more info, please go to https://github.com/testing-library/dom-testing-library/issues/830`,
          );
          if (!showOriginalStackTrace) copyStackTrace(error, stackTraceError);
          reject(error);
          return;
        }

        // In this rare case, we *need* to wait for in-flight promises
        // to resolve before continuing. We don't need to take advantage
        // of parallelization so we're fine.
        // https://stackoverflow.com/a/59243586/971592
        await advanceTimersWrapper(async () => {
          // we *could* (maybe should?) use `advanceTimersToNextTimer` but it's
          // possible that could make this loop go on forever if someone is using
          // third party code that's setting up recursive timers so rapidly that
          // the user's timer's don't get a chance to resolve. So we'll advance
          // by an interval instead. (We have a test for this case).
          advanceFakeTimersByTime(interval);
        });

        // Could have timed-out
        if (finished) {
          break;
        }
        // It's really important that checkCallback is run *before* we flush
        // in-flight promises. To be honest, I'm not sure why, and I can't quite
        // think of a way to reproduce the problem in a test, but I spent
        // an entire day banging my head against a wall on this.
        checkCallback();
      }
    } else {
      try {
        checkContainerType(container);
      } catch (e) {
        // Divergence (bug fix): upstream leaves the overall timeout armed here, and when it
        // fires `onDone` calls `observer.disconnect()` on an undefined observer (an uncaught
        // TypeError ~1s after the rejection).
        finished = true;
        clearTimeout(overallTimeoutTimer);
        reject(e);
        return;
      }
      // Ours: when traced, checks from the interval and the MutationObserver run in waitFor's async
      // context, so a traced query in the callback stays the waitFor/findBy span's child.
      const inSpan = span !== null ? AsyncLocalStorage.snapshot() : null;
      const onTick = inSpan === null ? checkRealTimersCallback : () => inSpan(checkRealTimersCallback);
      intervalId = setInterval(onTick, interval);
      const { MutationObserver } = getWindowFromNode(container);
      observer = new MutationObserver(onTick);
      observer.observe(container, mutationObserverOptions);
      checkCallback();
    }

    function onDone(error: any, result: any) {
      finished = true;
      clearTimeout(overallTimeoutTimer);

      if (!usingJestFakeTimers) {
        clearInterval(intervalId);
        observer.disconnect();
      }

      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }

    function checkRealTimersCallback() {
      if (jestFakeTimersAreEnabled()) {
        const error = new Error(
          `Changed from using real timers to fake timers while using waitFor. This is not allowed and will result in very strange behavior. Please ensure you're awaiting all async things your test is doing before changing to fake timers. For more info, please go to https://github.com/testing-library/dom-testing-library/issues/830`,
        );
        if (!showOriginalStackTrace) copyStackTrace(error, stackTraceError);
        return reject(error);
      } else {
        return checkCallback();
      }
    }

    function checkCallback() {
      if (promiseStatus === "pending") return;
      // Ours: how many times the callback ran, for the waitFor/findBy span (@rtd/dom trace.ts).
      if (span !== null) span.data.checks = ((span.data.checks as number | undefined) ?? 0) + 1;
      try {
        const result: any = runWithExpensiveErrorDiagnosticsDisabled(callback);
        if (typeof result?.then === "function") {
          promiseStatus = "pending";
          result.then(
            (resolvedValue: any) => {
              promiseStatus = "resolved";
              onDone(null, resolvedValue);
            },
            (rejectedValue: any) => {
              promiseStatus = "rejected";
              lastError = rejectedValue;
            },
          );
        } else {
          onDone(null, result);
        }
        // If `callback` throws, wait for the next mutation, interval, or timeout.
      } catch (error) {
        // Save the most recent callback error to reject the promise with it in the event of a timeout
        lastError = error;
      }
    }

    function handleTimeout() {
      let error;
      if (lastError) {
        error = lastError;
        if (!showOriginalStackTrace && error.name === "TestingLibraryElementError") {
          copyStackTrace(error, stackTraceError);
        }
      } else {
        error = new Error("Timed out in waitFor.");
        if (!showOriginalStackTrace) {
          copyStackTrace(error, stackTraceError);
        }
      }
      onDone(onTimeout(error), null);
    }
  });
}

export function waitFor<T>(callback: () => T | Promise<T>, options?: WaitForOptions): Promise<T> {
  // Ours: a span with the callback's source and how many times it ran, when something subscribes
  // to @ctrl/dom's tracing channel.
  if (!tracing()) return waitForInSpan(callback, options, null);
  return tracePromise("testing-library.wait_for", `waitFor(${describeCallback(callback)})`, (span) => waitForInSpan(callback, options, span));
}

/** waitFor without a span of its own, counting the callback's runs on `span` (findBy* passes its query span). */
export function waitForInSpan<T>(callback: () => T | Promise<T>, options: WaitForOptions | undefined, span: SpanContext | null): Promise<T> {
  // create the error here so its stack trace is as close to the
  // calling code as possible
  const stackTraceError = new Error("STACK_TRACE_MESSAGE");
  return getConfig().asyncWrapper(() => waitForImpl(callback, { stackTraceError, ...options }, span));
}

/**
 * A callback's source on one line, shortened: `() => expect(screen.getByText("Done")).toBeVisible()`.
 * Undoes what transforms do to imported names: Vite's `__vite_ssr_import_0__.screen`, the
 * `(0, expect)(…)` call form (Vite, Babel) and CommonJS interop objects (`_reactTestingLibrary.screen`,
 * Babel and SWC), and drops the braces around a single statement.
 */
function describeCallback(callback: unknown): string {
  if (typeof callback !== "function") return String(callback);
  let source = Function.prototype.toString
    .call(callback)
    .replace(/\s+/g, " ")
    .replace(/__vite_ssr_import_\d+__\./g, "")
    .replace(/\(0, ?([\w$.]+)\)/g, "$1")
    .replace(/(?<![\w$.])_[a-z][\w$]*\.(?=[\w$])/g, "");
  const block = /^(async )?\(\) ?=> ?\{ ?(?:return )?(.*?);? ?\}$/.exec(source);
  if (block !== null && !block[2].includes(";")) source = `${block[1] ?? ""}() => ${block[2]}`;
  return source.length > 120 ? `${source.slice(0, 119)}…` : source;
}

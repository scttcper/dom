// The same pure modules as a WebAssembly reactor: `scriptc build --lib` with
// SCRIPTC_TARGET=wasm32-wasi (scripts/build.ts --target wasm32-wasi) → dist/rtd.wasm. One
// portable file instead of a Node-API addon per platform; see RESULTS.md for whether it pays.
//
// Boundary (https://scriptc.dev/docs/wasm): f64/bool scalars pass as numbers; a string parameter
// is a (byte offset, byte length) pair of UTF-8 in linear memory; a string result is written
// through two extra i32 arguments that point at 4-byte slots (pointer, length) and lives in the
// module's result arena until the next export call, so it is decoded right away. Inputs go
// through one reusable buffer from `scriptc_alloc`, grown on demand.

import { readFileSync } from "node:fs";
import type { RtdLib } from "./index.ts";

type Cls = "f64" | "string" | "bool" | "bytes" | "void";

interface ProfileExport {
  export: string;
  symbol: string;
  params: Cls[];
  returns: Cls;
}

interface Profile {
  abi: { init_symbol: string; collect_symbol?: string | null };
  exports: ProfileExport[];
}

export interface WasmLib extends RtdLib {
  /** The reactor's collect export (invalidates nothing JS holds: results are decoded). */
  collect(): void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Instantiate dist/rtd.wasm (or `wasmPath`) with the profile scripts/build.ts wrote next to it.
 * WASI is reduced to the four calls the reactor imports, so no `node:wasi` instance is needed.
 */
export function loadWasm(
  wasmPath: URL = new URL("../dist/rtd.wasm", import.meta.url),
  profilePath: URL = new URL("../dist/build/rtd.profile.json", import.meta.url),
): WasmLib {
  const profile = JSON.parse(readFileSync(profilePath, "utf8")) as Profile;
  let memory: WebAssembly.Memory;
  const u32 = (ptr: number, value: number) => new DataView(memory.buffer).setUint32(ptr, value, true);
  const imports = {
    wasi_snapshot_preview1: {
      // https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md: no environment.
      environ_sizes_get(countPtr: number, sizePtr: number) {
        u32(countPtr, 0);
        u32(sizePtr, 0);
        return 0;
      },
      environ_get() {
        return 0;
      },
      clock_time_get(_id: number, _precision: bigint, timePtr: number) {
        new DataView(memory.buffer).setBigUint64(timePtr, process.hrtime.bigint(), true);
        return 0;
      },
      proc_exit(code: number) {
        throw new Error(`rtd.wasm exited with ${code}`);
      },
    },
    scriptc: {
      panic(ptr: number, len: number) {
        throw new Error(`rtd.wasm panicked: ${decoder.decode(new Uint8Array(memory.buffer, ptr, len))}`);
      },
    },
  };
  const module = new WebAssembly.Module(readFileSync(wasmPath));
  const instance = new WebAssembly.Instance(module, imports);
  const exports = instance.exports as Record<string, any>;
  memory = exports.memory as WebAssembly.Memory;
  exports._initialize();
  exports[profile.abi.init_symbol]();

  // Two 4-byte result slots, and the reusable input buffer.
  const slots: number = exports.scriptc_alloc(8);
  let input = 0;
  let capacity = 0;
  /** Copy `s` into the input buffer as UTF-8; returns its byte length (the buffer may move: read `input` after). */
  const put = (s: string): number => {
    // UTF-16 → UTF-8 is at most 3 bytes per code unit.
    const need = s.length * 3 || 1;
    if (need > capacity) {
      if (input !== 0) exports.scriptc_free(input);
      capacity = Math.max(need, capacity * 2, 1024);
      input = exports.scriptc_alloc(capacity);
      if (input === 0) throw new Error("rtd.wasm: scriptc_alloc failed");
    }
    return encoder.encodeInto(s, new Uint8Array(memory.buffer, input, capacity)).written;
  };
  const result = (): string => {
    const view = new DataView(memory.buffer);
    return decoder.decode(new Uint8Array(memory.buffer, view.getUint32(slots, true), view.getUint32(slots + 4, true)));
  };

  const lib: Record<string, unknown> = {};
  for (const e of profile.exports) {
    const fn = exports[e.symbol] as (...args: number[]) => number;
    const stringParams = e.params.filter((p) => p === "string").length;
    if (stringParams > 1 || e.params.includes("bytes") || e.returns === "bytes") continue; // not needed by rtd.ts
    // The shapes rtd.ts exports get direct wrappers (no argument arrays on the hot path).
    const sig = `${e.params.join(",")}→${e.returns}`;
    if (sig === "string→f64") {
      lib[e.export] = (s: string) => {
        const n = put(s);
        return fn(input, n);
      };
    } else if (sig === "string→string") {
      lib[e.export] = (s: string) => {
        const n = put(s);
        fn(input, n, slots, slots + 4);
        return result();
      };
    } else if (sig === "f64→f64") {
      lib[e.export] = (x: number) => fn(x);
    } else {
      lib[e.export] = (...args: unknown[]) => {
        const raw: number[] = [];
        for (let i = 0; i < e.params.length; i++) {
          const p = e.params[i];
          if (p === "string") {
            const n = put(String(args[i]));
            raw.push(input, n);
          } else raw.push(p === "bool" ? (args[i] ? 1 : 0) : Number(args[i]));
        }
        if (e.returns === "string") {
          fn(...raw, slots, slots + 4);
          return result();
        }
        const r = fn(...raw);
        return e.returns === "bool" ? r !== 0 : r;
      };
    }
  }
  const collect = profile.abi.collect_symbol ? (exports[profile.abi.collect_symbol] as () => void) : () => {};
  lib.collect = () => collect();
  return lib as unknown as WasmLib;
}

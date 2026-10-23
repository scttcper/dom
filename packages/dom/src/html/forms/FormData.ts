// https://xhr.spec.whatwg.org/#interface-formdata
//
// Node's global FormData (undici) does not know our form elements, so this class adds the
// `new FormData(form, submitter)` constructor steps on top of it. Instances are real undici
// FormData objects (built with Reflect.construct, so they carry undici's internal state and pass
// its brand checks): `fetch`/`Request`/`Response` accept them.
//
// Startup: in Node 26 `globalThis.FormData` is a V8 lazy data property; touching its value or
// descriptor loads undici (fetch) and zlib, ~20-60 ms cold. So the undici class is resolved on
// first construction, not at module load (see window/host-originals.ts):
// - When a window is installed as the global, installGlobals recorded Node's original.
// - Otherwise the current global is Node's.
// - The prototype chain is linked to undici's on first construction; until then (and after)
//   our prototype has its own methods that delegate to undici's, so
//   `vi.spyOn(FormData.prototype, "append")` works before any FormData exists.

import type { Element } from "../../nodes/Element.ts";
import type { NodeImpl } from "../../nodes/NodeImpl.ts";
import { T } from "../../nodes/tags.ts";
import { FormDataEvent } from "../../events/events.ts";
import { dispatchTrusted } from "./common.ts";
import { formOwner } from "./form-associated.ts";
import { constructEntryList, isSubmitButton } from "./form-submission.ts";
import { hostOriginals } from "../../window/host-originals.ts";

type NodeFormDataClass = typeof globalThis.FormData;

let nodeFormDataClass: NodeFormDataClass | null = null;

/** Node's undici FormData: the original installGlobals shadowed, else the current global (not ours). */
function hostFormData(): NodeFormDataClass | undefined {
  const original = hostOriginals.get("FormData") as NodeFormDataClass | undefined;
  if (original !== undefined) return original;
  const current = (globalThis as { FormData?: NodeFormDataClass }).FormData;
  return current === (FormData as unknown) ? undefined : current;
}

function nodeFormData(): NodeFormDataClass {
  if (nodeFormDataClass !== null) return nodeFormDataClass;
  const resolved = hostFormData();
  if (resolved === undefined) throw new TypeError("FormData is not available in this Node.js runtime.");
  nodeFormDataClass = resolved;
  Object.setPrototypeOf(FormData.prototype, nodeFormDataClass.prototype);
  Object.setPrototypeOf(FormData, nodeFormDataClass);
  return nodeFormDataClass;
}

export interface FormData extends globalThis.FormData {}

export class FormData {
  /** https://xhr.spec.whatwg.org/#dom-formdata */
  constructor(form?: Element, submitter: Element | null = null) {
    const self = Reflect.construct(nodeFormData(), [], new.target) as FormData;
    if (form === undefined) return self;
    const formImpl = (form as { _impl?: NodeImpl } | null)?._impl;
    if (formImpl === undefined || formImpl.tag !== T.form) {
      throw new TypeError("Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'.");
    }
    let submitterImpl: NodeImpl | null = null;
    if (submitter !== null && submitter !== undefined) {
      const s = (submitter as { _impl?: NodeImpl })._impl;
      // Step 1.1–1.2: submitter must be a submit button owned by form.
      if (s === undefined || !isSubmitButton(s)) {
        throw new TypeError("Failed to construct 'FormData': The specified element is not a submit button.");
      }
      if (formOwner(s) !== formImpl) {
        throw new DOMException("Failed to construct 'FormData': The specified element is not owned by this form element.", "NotFoundError");
      }
      submitterImpl = s;
    }
    const entries = constructEntryList(formImpl, submitterImpl, (list) => {
      for (let i = 0; i < list.length; i++) {
        const [name, value] = list[i];
        if (typeof value === "string") self.append(name, value);
        else self.append(name, value, value.name);
      }
      // https://html.spec.whatwg.org/#constructing-the-form-data-set step 7: fire formdata.
      dispatchTrusted(form, new FormDataEvent("formdata", { bubbles: true, cancelable: false, formData: self }));
    });
    if (entries === null) {
      throw new DOMException("Failed to construct 'FormData': The form is already constructing its entry list.", "InvalidStateError");
    }
    return self;
  }
}

// Own delegating methods (see the header): resolve undici's implementation on first call.
const METHODS = ["append", "delete", "get", "getAll", "has", "set", "entries", "keys", "values", "forEach"] as const;
for (const name of METHODS) {
  Object.defineProperty(FormData.prototype, name, {
    value: {
      [name](this: FormData, ...args: unknown[]) {
        return (nodeFormData().prototype[name] as (...a: unknown[]) => unknown).apply(this, args);
      },
    }[name],
    writable: true,
    configurable: true,
  });
}
Object.defineProperty(FormData.prototype, Symbol.iterator, {
  value: function entries(this: FormData) {
    return nodeFormData().prototype.entries.call(this);
  },
  writable: true,
  configurable: true,
});
Object.defineProperty(FormData.prototype, Symbol.toStringTag, { value: "FormData", configurable: true });

/**
 * Web Storage — web-platform-tests webstorage/, run unmodified through test/wpt/harness.ts.
 *
 * Spec: HTML Standard §12 "Web storage"
 *   - The Storage interface: https://html.spec.whatwg.org/#the-storage-interface
 *   - localStorage / sessionStorage: https://html.spec.whatwg.org/#the-localstorage-attribute,
 *     https://html.spec.whatwg.org/#the-sessionstorage-attribute
 *   - Broadcasting storage events: https://html.spec.whatwg.org/#concept-storage-broadcast
 *   - The StorageEvent interface: https://html.spec.whatwg.org/#the-storageevent-interface
 * Spec: Web IDL legacy platform objects (named properties): https://webidl.spec.whatwg.org/#es-legacy-platform-objects
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/webstorage
 *
 * Not vendored: event_basic / event_body_attribute / event_case_sensitive / event_setattribute
 * (inline `onstorage` content attributes need script execution), *_window_open* / window_reopen /
 * noopener (window.open never creates a browsing context), document-domain (frames[0] of a
 * markup iframe + document.domain), *partitioned* and localstorage-share-data-unrelated-origins
 * (cross-origin / third-party iframes), *-manual.html.
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

const DIR = "webstorage";

describe("Storage interface — https://html.spec.whatwg.org/#the-storage-interface", () => {
  for (const name of [
    "defineProperty",
    "missing_arguments",
    "set",
    "storage_builtins",
    "storage_clear",
    "storage_enumerate",
    "storage_functions_not_overwritten",
    "storage_getitem",
    "storage_in",
    "storage_indexing",
    "storage_key",
    "storage_key_empty_string",
    "storage_length",
    "storage_local_quota_independent_from_session",
    "storage_local_setitem_quotaexceedederr",
    "storage_removeitem",
    "storage_session_quota_independent_from_local",
    "storage_session_setitem_quotaexceedederr",
    "storage_set_value_enumerate",
    "storage_setitem",
    "storage_string_conversion",
    "storage_supported_property_names",
    "symbol-props",
  ]) {
    defineWPT(`${DIR}/${name}.window.js`);
  }
});

describe("Broadcasting storage events — https://html.spec.whatwg.org/#concept-storage-broadcast", () => {
  for (const type of ["local", "session"]) {
    for (const prop of ["key", "newvalue", "oldvalue", "removeitem", "storagearea", "url"])
      defineWPT(`${DIR}/event_${type}_${prop}.html`);
  }
  defineWPT(`${DIR}/event_no_duplicates.html`);
});

describe("StorageEvent interface — https://html.spec.whatwg.org/#the-storageevent-interface", () => {
  defineWPT(`${DIR}/event_constructor.window.js`);
  // TODO(events): initStorageEvent() must require its `type` argument (WebIDL arity).
  defineWPT(
    `${DIR}/event_initstorageevent.window.js`,
    "initStorageEvent() does not check its argument count (events area)",
  );
});

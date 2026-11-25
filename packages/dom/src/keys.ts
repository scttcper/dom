// Symbol keys for the internal state of @ctrl/dom objects.
//
// Wrappers (nodes, documents, windows, collections, CSSOM objects, ...) keep their internal
// fields under these symbols instead of `_`-prefixed string keys, so `Object.keys(node)`,
// `for...in` and `JSON.stringify` see none of them (jsdom keeps its impl behind a symbol too):
// Jest's diff/--json and structured loggers must never walk into NodeImpl records or the React
// fibers reachable from them. Fields stay plain constructor-initialized properties, so hidden
// classes are unchanged and monomorphic loads cost the same as named ones; megamorphic loads
// (`node[$impl]` at API boundaries, across element classes) go through the keyed IC and are ~2 ns
// slower (docs/deviations.md). Registered symbols (Symbol.for) keep two copies of @ctrl/dom interoperable.

/**
 * `Symbol.for("ctrl-dom." + name)`: the same registered names, without the minified bundle
 * repeating `Symbol.for("ctrl-dom.` for every key. Typed `never` so each declaration below keeps
 * its own `unique symbol` type (class fields and computed keys need one).
 */
const key = (name: string): never => Symbol.for(`ctrl-dom.${name}`) as never;

export const $_proto__: unique symbol = key("_proto__");
export const $aboutBase: unique symbol = key("aboutBase");
export const $active: unique symbol = key("active");
export const $assocGen: unique symbol = key("assocGen");
export const $attr: unique symbol = key("attr");
export const $attributes: unique symbol = key("attributes");
export const $availableToElementInternals: unique symbol = key("availableToElementInternals");
export const $baseFor: unique symbol = key("baseFor");
export const $baseOverride: unique symbol = key("baseOverride");
export const $baseURL: unique symbol = key("baseURL");
export const $baseVersion: unique symbol = key("baseVersion");
/** Document: how many of its version bumps could not change a computed style (css/style-deps.ts). */
export const $benign: unique symbol = key("benign");
export const $block: unique symbol = key("block");
/** CSSStyleRule: its declaration block once parsed, and its text until then (css/cssom.ts). */
export const $blockParsed: unique symbol = key("blockParsed");
export const $blockText: unique symbol = key("blockText");
export const $byCtor: unique symbol = key("byCtor");
export const $byName: unique symbol = key("byName");
export const $cache: unique symbol = key("cache");
export const $callback: unique symbol = key("callback");
export const $childNodes: unique symbol = key("childNodes");
export const $childWindows: unique symbol = key("childWindows");
export const $children: unique symbol = key("children");
export const $classList: unique symbol = key("classList");
export const $clipboard: unique symbol = key("clipboard");
export const $clonable: unique symbol = key("clonable");
export const $closed: unique symbol = key("closed");
export const $compiled: unique symbol = key("compiled");
export const $compiledFor: unique symbol = key("compiledFor");
export const $condition: unique symbol = key("condition");
export const $constructed: unique symbol = key("constructed");
export const $constructingEntryList: unique symbol = key("constructingEntryList");
export const $contentType: unique symbol = key("contentType");
export const $controlsCache: unique symbol = key("controlsCache");
export const $controlsDoc: unique symbol = key("controlsDoc");
export const $coll: unique symbol = key("coll");
export const $controlsVersion: unique symbol = key("controlsVersion");
export const $cookieJar: unique symbol = key("cookieJar");
export const $cookies: unique symbol = key("cookies");
export const $css: unique symbol = key("css");
export const $current: unique symbol = key("current");
export const $customElements: unique symbol = key("customElements");
export const $customValidity: unique symbol = key("customValidity");
export const $cx: unique symbol = key("cx");
export const $data: unique symbol = key("data");
export const $dataset: unique symbol = key("dataset");
export const $declarative: unique symbol = key("declarative");
export const $defaultNamespace: unique symbol = key("defaultNamespace");
export const $defaultValueOverride: unique symbol = key("defaultValueOverride");
export const $delegatesFocus: unique symbol = key("delegatesFocus");
export const $devicePixelRatio: unique symbol = key("devicePixelRatio");
export const $dirtiness: unique symbol = key("dirtiness");
/** An input's or textarea's ControlState (html/forms/control-state.ts). */
export const $control: unique symbol = key("control");
export const $disabled: unique symbol = key("disabled");
export const $disallowModification: unique symbol = key("disallowModification");
export const $derived: unique symbol = key("derived");
export const $doc: unique symbol = key("doc");
export const $dropEffect: unique symbol = key("dropEffect");
export const $ec: unique symbol = key("ec");
export const $effectAllowed: unique symbol = key("effectAllowed");
export const $el: unique symbol = key("el");
export const $elements: unique symbol = key("elements");
export const $entries: unique symbol = key("entries");
export const $eo: unique symbol = key("eo");
export const $error: unique symbol = key("error");
export const $externalFormNames: unique symbol = key("externalFormNames");
export const $file: unique symbol = key("file");
export const $files: unique symbol = key("files");
export const $fill: unique symbol = key("fill");
export const $filter: unique symbol = key("filter");
export const $firingSubmissionEvents: unique symbol = key("firingSubmissionEvents");
export const $focused: unique symbol = key("focused");
export const $form: unique symbol = key("form");
export const $formControlsVersion: unique symbol = key("formControlsVersion");
/**
 * Document: counts what besides the tree decides which label labels which control: an `id`, a
 * label's `for`, an input becoming or ceasing to be hidden, a form-associated custom element's
 * upgrade (@ctrl/dom/aria forms.ts labelMapForTree).
 */
export const $labelsVersion: unique symbol = key("labelsVersion");
/** Document: counts `id` and `name` attribute changes (html/forms/collections.ts namedControl). */
export const $controlNamesVersion: unique symbol = key("controlNamesVersion");
/** Document: the element whose `name` was just set to "", and the name it had (nodes/attributes.ts noteNameChange). */
export const $nameBlanked: unique symbol = key("nameBlanked");
export const $nameBlankedValue: unique symbol = key("nameBlankedValue");
/** Document: an element of it has had a `form` attribute (sticky; html/forms/form-associated.ts formOwnerScope). */
export const $formAttrSeen: unique symbol = key("formAttrSeen");
export const $forLabels: unique symbol = key("forLabels");
export const $forms: unique symbol = key("forms");
export const $frameCallbacks: unique symbol = key("frameCallbacks");
export const $frameElement: unique symbol = key("frameElement");
export const $frameId: unique symbol = key("frameId");
export const $frameTask: unique symbol = key("frameTask");
export const $frameTime: unique symbol = key("frameTime");
export const $generation: unique symbol = key("generation");
export const $globalObject: unique symbol = key("globalObject");
export const $height: unique symbol = key("height");
export const $history: unique symbol = key("history");
export const $home: unique symbol = key("home");
export const $host: unique symbol = key("host");
export const $href: unique symbol = key("href");
export const $id: unique symbol = key("id");
export const $idleCallbacks: unique symbol = key("idleCallbacks");
export const $idleId: unique symbol = key("idleId");
export const $ids: unique symbol = key("ids");
export const $impl: unique symbol = key("impl");
export const $implementation: unique symbol = key("implementation");
export const $index: unique symbol = key("index");
export const $indexed: unique symbol = key("indexed");
export const $inflight: unique symbol = key("inflight");
export const $info: unique symbol = key("info");
export const $innerHeight: unique symbol = key("innerHeight");
export const $innerWidth: unique symbol = key("innerWidth");
export const $isHTML: unique symbol = key("isHTML");
export const $items: unique symbol = key("items");
export const $keyText: unique symbol = key("keyText");
export const $kind: unique symbol = key("kind");
export const $labels: unique symbol = key("labels");
export const $layerName: unique symbol = key("layerName");
export const $list: unique symbol = key("list");
export const $listeners: unique symbol = key("listeners");
export const $listenerTypesChanged: unique symbol = key("listenerTypesChanged");
export const $localStorage: unique symbol = key("localStorage");
export const $location: unique symbol = key("location");
export const $lockedForReset: unique symbol = key("lockedForReset");
export const $matches: unique symbol = key("matches");
export const $media: unique symbol = key("media");
export const $mediaQueryLists: unique symbol = key("mediaQueryLists");
export const $mode: unique symbol = key("mode");
export const $name: unique symbol = key("name");
export const $names: unique symbol = key("names");
export const $namespaces: unique symbol = key("namespaces");
export const $navigator: unique symbol = key("navigator");
export const $nodes: unique symbol = key("nodes");
export const $onchange: unique symbol = key("onchange");
export const $options: unique symbol = key("options");
export const $owner: unique symbol = key("owner");
export const $ownerNode: unique symbol = key("ownerNode");
export const $ownerRule: unique symbol = key("ownerRule");
export const $parent: unique symbol = key("parent");
export const $parentRule: unique symbol = key("parentRule");
export const $parentWindow: unique symbol = key("parentWindow");
export const $pastNames: unique symbol = key("pastNames");
export const $pointerBeforeReference: unique symbol = key("pointerBeforeReference");
export const $prefix: unique symbol = key("prefix");
export const $prelude: unique symbol = key("prelude");
export const $presentationStyle: unique symbol = key("presentationStyle");
export const $pseudo: unique symbol = key("pseudo");
export const $queries: unique symbol = key("queries");
export const $radios: unique symbol = key("radios");
export const $ranges: unique symbol = key("ranges");
export const $readonly: unique symbol = key("readonly");
export const $readyState: unique symbol = key("readyState");
export const $rebuildVersion: unique symbol = key("rebuildVersion");
export const $record: unique symbol = key("record");
export const $records: unique symbol = key("records");
export const $reference: unique symbol = key("reference");
export const $result: unique symbol = key("result");
export const $root: unique symbol = key("root");
export const $rules: unique symbol = key("rules");
export const $running: unique symbol = key("running");
export const $runningFrame: unique symbol = key("runningFrame");
export const $sc: unique symbol = key("sc");
export const $screen: unique symbol = key("screen");
export const $scrollRestoration: unique symbol = key("scrollRestoration");
export const $scrollX: unique symbol = key("scrollX");
export const $scrollY: unique symbol = key("scrollY");
export const $selectedOptions: unique symbol = key("selectedOptions");
export const $selectedness: unique symbol = key("selectedness");
export const $selection: unique symbol = key("selection");
export const $selector: unique symbol = key("selector");
export const $serializable: unique symbol = key("serializable");
export const $sessionStorage: unique symbol = key("sessionStorage");
export const $settled: unique symbol = key("settled");
/** A select's bookkeeping for options appended one at a time (HTMLSelectElement.ts _childrenChangedSteps). */
export const $optionsTail: unique symbol = key("optionsTail");
export const $optionsCount: unique symbol = key("optionsCount");
export const $optionsOnly: unique symbol = key("optionsOnly");
export const $selectionEpoch: unique symbol = key("selectionEpoch");
export const $shadowRoot: unique symbol = key("shadowRoot");
export const $shed: unique symbol = key("shed");
export const $sheet: unique symbol = key("sheet");
export const $sheets: unique symbol = key("sheets");
export const $slotAssignment: unique symbol = key("slotAssignment");
export const $so: unique symbol = key("so");
export const $states: unique symbol = key("states");
export const $style: unique symbol = key("style");
export const $styleVersion: unique symbol = key("styleVersion");
export const $supportsText: unique symbol = key("supportsText");
export const $systemId: unique symbol = key("systemId");
export const $target: unique symbol = key("target");
export const $tasks: unique symbol = key("tasks");
/** Document's appropriate template contents owner, allocated on first use. */
export const $templateContentsOwner: unique symbol = key("templateContentsOwner");
export const $timers: unique symbol = key("timers");
export const $title: unique symbol = key("title");
export const $transients: unique symbol = key("transients");
export const $treeVersion: unique symbol = key("treeVersion");
export const $type: unique symbol = key("type");
export const $types: unique symbol = key("types");
export const $updating: unique symbol = key("updating");
export const $updatingSelectedContent: unique symbol = key("updatingSelectedContent");
export const $uri: unique symbol = key("uri");
export const $url: unique symbol = key("url");
export const $userActivation: unique symbol = key("userActivation");
export const $userValidity: unique symbol = key("userValidity");
export const $validity: unique symbol = key("validity");
export const $value: unique symbol = key("value");
export const $version: unique symbol = key("version");
export const $visualViewport: unique symbol = key("visualViewport");
export const $w: unique symbol = key("w");
export const $whatToShow: unique symbol = key("whatToShow");
export const $whenDefined: unique symbol = key("whenDefined");
export const $width: unique symbol = key("width");
export const $window: unique symbol = key("window");
export const $writeBuffer: unique symbol = key("writeBuffer");
export const $x: unique symbol = key("x");
export const $xhr: unique symbol = key("xhr");
export const $y: unique symbol = key("y");
export const $z: unique symbol = key("z");

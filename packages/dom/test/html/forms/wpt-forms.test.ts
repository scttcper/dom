/**
 * HTML forms — web-platform-tests html/semantics/forms and html/semantics/disabled-elements,
 * run unmodified through test/wpt/harness.ts (vendored under test/wpt/fixtures).
 *
 * Spec: HTML Standard §4.10 Forms — https://html.spec.whatwg.org/multipage/forms.html
 *   - the input element:        https://html.spec.whatwg.org/#the-input-element
 *   - the button element:       https://html.spec.whatwg.org/#the-button-element
 *   - the select/option elements: https://html.spec.whatwg.org/#the-select-element
 *   - the textarea element:     https://html.spec.whatwg.org/#the-textarea-element
 *   - form control infrastructure: https://html.spec.whatwg.org/#form-control-infrastructure
 *   - constraints:              https://html.spec.whatwg.org/#constraints
 *   - text field selection APIs: https://html.spec.whatwg.org/#textFieldSelection
 *   - form submission (entry list, submit/formdata events): https://html.spec.whatwg.org/#form-submission-2
 *   - disabled elements:        https://html.spec.whatwg.org/#concept-element-disabled
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms
 *
 * Not vendored: navigation-based submission tests (target iframes loading the result), tests
 * that need layout, and tests driven only through test_driver input (user-event backs them in
 * packages/user-event). Known failures per file: test/wpt/expectations/html-forms.json.
 */
import { describe } from "vitest";
import { defineWPT } from "../../wpt/harness.ts";

const READONLY_BARRING =
  "readonly bars only the types it applies to, as jsdom (tests/compat validation scenario: a readOnly required checkbox still validates); spec/Chromium bar every input (deviation)";
const PARSER_FORM_POINTER = "harness limitation: the harness builds markup with parse5 + DOM calls, so the parser's form element pointer association is lost";
const NAVIGATION = "needs form submission navigation (out of scope)";
const INSERTED_SELECTED = "an inserted option that is already selected does not win over the last selected option (selectedness setting algorithm keeps the last; Chromium prefers the inserted one)";


describe("attributes-common-to-form-controls — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/attributes-common-to-form-controls", () => {
  defineWPT("html/semantics/forms/attributes-common-to-form-controls/disabled-elements-01.html");
  defineWPT("html/semantics/forms/attributes-common-to-form-controls/formAction_document_address.html");
  defineWPT("html/semantics/forms/attributes-common-to-form-controls/formaction.html");
});

describe("constraints — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/constraints", () => {
  defineWPT("html/semantics/forms/constraints/form-validation-checkValidity.html");
  defineWPT("html/semantics/forms/constraints/form-validation-reportValidity.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validate.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-badInput.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-customError.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-patternMismatch.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-rangeOverflow-weekmonth.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-rangeOverflow.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-rangeUnderflow-weekmonth.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-rangeUnderflow.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-stepMismatch.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-tooLong.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-tooShort.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-typeMismatch.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-valid-weekmonth.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-valid.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-valueMissing-weekmonth.html");
  defineWPT("html/semantics/forms/constraints/form-validation-validity-valueMissing.html");
  defineWPT("html/semantics/forms/constraints/form-validation-willValidate-datalist.html");
  defineWPT("html/semantics/forms/constraints/form-validation-willValidate.html", READONLY_BARRING);
  defineWPT("html/semantics/forms/constraints/input-number-validity-dynamic-value-no-change.html");
  defineWPT("html/semantics/forms/constraints/input-pattern-dynamic-value.html");
  defineWPT("html/semantics/forms/constraints/inputwillvalidate.html");
  defineWPT("html/semantics/forms/constraints/radio-group-valueMissing.html");
  defineWPT("html/semantics/forms/constraints/radio-valueMissing.html");
  defineWPT("html/semantics/forms/constraints/using-form-attribute.html");
});

describe("disabled-elements — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/disabled-elements", () => {
  defineWPT("html/semantics/disabled-elements/disabledElement.html");
});

describe("form-control-infrastructure — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/form-control-infrastructure", () => {
  defineWPT("html/semantics/forms/form-control-infrastructure/association.window.js");
  defineWPT("html/semantics/forms/form-control-infrastructure/form.html", PARSER_FORM_POINTER);
  defineWPT("html/semantics/forms/form-control-infrastructure/form_attribute.html");
  defineWPT("html/semantics/forms/form-control-infrastructure/form_owner_and_table_2.html");
});

describe("form-submission-0 — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/form-submission-0", () => {
  defineWPT("html/semantics/forms/form-submission-0/SubmitEvent.window.js", "SubmitEvent init dictionary is not type-checked (events area) and submitter retargeting after shadow-tree dispatch");
  defineWPT("html/semantics/forms/form-submission-0/form-submit-invalid.html");
  defineWPT("html/semantics/forms/form-submission-0/form-submitters.html");
  defineWPT("html/semantics/forms/form-submission-0/historical.window.js");
  defineWPT("html/semantics/forms/form-submission-0/newline-normalization.html");
  defineWPT("html/semantics/forms/form-submission-0/submit-event.html");
});

describe("§4.10 Forms (top level) — https://html.spec.whatwg.org/#forms", () => {
  defineWPT("html/semantics/forms/historical.html", NAVIGATION);
  defineWPT("html/semantics/forms/setCustomValidity-normalize-newlines.html");
});

describe("resetting-a-form — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/resetting-a-form", () => {
  defineWPT("html/semantics/forms/resetting-a-form/reset-form-2.html");
  defineWPT("html/semantics/forms/resetting-a-form/reset-form.html");
});

describe("textfieldselection — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/textfieldselection", () => {
  // https://html.spec.whatwg.org/#do-not-apply — both <meta name=variant> variants.
  defineWPT("html/semantics/forms/textfieldselection/selection-not-application.html?default");
  defineWPT("html/semantics/forms/textfieldselection/selection-not-application.html?week,month");
  defineWPT("html/semantics/forms/textfieldselection/defaultSelection.html");
  defineWPT("html/semantics/forms/textfieldselection/selection-after-content-change.html");
  defineWPT("html/semantics/forms/textfieldselection/selection-not-application-textarea.html");
  defineWPT("html/semantics/forms/textfieldselection/selection-start-end-extra.html");
  defineWPT("html/semantics/forms/textfieldselection/selection-start-end.html");
  defineWPT("html/semantics/forms/textfieldselection/selection-value-interactions.html");
  defineWPT("html/semantics/forms/textfieldselection/selection.html");
  defineWPT("html/semantics/forms/textfieldselection/setSelectionRange.html");
  defineWPT("html/semantics/forms/textfieldselection/textfieldselection-setRangeText.html");
  defineWPT("html/semantics/forms/textfieldselection/textfieldselection-setSelectionRange.html");
});

describe("the-button-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-button-element", () => {
  defineWPT("html/semantics/forms/the-button-element/button-checkvalidity.html");
  defineWPT("html/semantics/forms/the-button-element/button-click-resets-with-commandfor.html");
  defineWPT("html/semantics/forms/the-button-element/button-click-submits-with-commandfor.html");
  defineWPT("html/semantics/forms/the-button-element/button-click-submits.html");
  defineWPT("html/semantics/forms/the-button-element/button-events.html");
  defineWPT("html/semantics/forms/the-button-element/button-labels.html");
  defineWPT("html/semantics/forms/the-button-element/button-menu-historical.html");
  defineWPT("html/semantics/forms/the-button-element/button-setcustomvalidity.html");
  defineWPT("html/semantics/forms/the-button-element/button-type-enumerated-ascii-case-insensitive.html");
  defineWPT("html/semantics/forms/the-button-element/button-type.html");
  defineWPT("html/semantics/forms/the-button-element/button-untrusted-key-event.html");
  defineWPT("html/semantics/forms/the-button-element/button-validation.html");
  defineWPT("html/semantics/forms/the-button-element/button-validationmessage.html");
  defineWPT("html/semantics/forms/the-button-element/button-validity.html");
  defineWPT("html/semantics/forms/the-button-element/button-willvalidate-readonly-attribute.html");
  defineWPT("html/semantics/forms/the-button-element/button-willvalidate.html");
});

describe("the-datalist-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-datalist-element", () => {
  defineWPT("html/semantics/forms/the-datalist-element/datalistoptions.html");
  defineWPT("html/semantics/forms/the-datalist-element/input-list-detached.html");
});

describe("the-fieldset-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-fieldset-element", () => {
  defineWPT("html/semantics/forms/the-fieldset-element/HTMLFieldSetElement.html");
  defineWPT("html/semantics/forms/the-fieldset-element/disabled-001.html");
  defineWPT("html/semantics/forms/the-fieldset-element/disabled-nested-legend.html");
  defineWPT("html/semantics/forms/the-fieldset-element/fieldset-checkvalidity.html");
  defineWPT("html/semantics/forms/the-fieldset-element/fieldset-setcustomvalidity.html");
  defineWPT("html/semantics/forms/the-fieldset-element/fieldset-validationmessage.html");
  defineWPT("html/semantics/forms/the-fieldset-element/fieldset-validity.html");
  defineWPT("html/semantics/forms/the-fieldset-element/fieldset-willvalidate.html");
});

describe("the-form-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-form-element", () => {
  defineWPT("html/semantics/forms/the-form-element/form-action-reflection-with-base-url.html");
  defineWPT("html/semantics/forms/the-form-element/form-action-reflection.html");
  defineWPT("html/semantics/forms/the-form-element/form-action.html");
  defineWPT("html/semantics/forms/the-form-element/form-attribute-form-owner.html");
  defineWPT("html/semantics/forms/the-form-element/form-autocomplete.html");
  defineWPT("html/semantics/forms/the-form-element/form-checkvalidity.html");
  defineWPT("html/semantics/forms/the-form-element/form-elements-filter.html");
  defineWPT("html/semantics/forms/the-form-element/form-elements-form-owner.html");
  defineWPT("html/semantics/forms/the-form-element/form-elements-interfaces-01.html");
  defineWPT("html/semantics/forms/the-form-element/form-elements-matches.html");
  defineWPT("html/semantics/forms/the-form-element/form-elements-nameditem-01.html");
  defineWPT("html/semantics/forms/the-form-element/form-elements-nameditem-02.html");
  defineWPT("html/semantics/forms/the-form-element/form-elements-sameobject.html");
  defineWPT("html/semantics/forms/the-form-element/form-indexed-element.html");
  defineWPT("html/semantics/forms/the-form-element/form-indexed-property-names.html");
  defineWPT("html/semantics/forms/the-form-element/form-length.html");
  defineWPT("html/semantics/forms/the-form-element/form-nameditem.html", "[LegacyOverrideBuiltIns] is not implemented: built-in members win over named controls (deviation; a Proxy lookup on every form property read)");
});

describe("the-input-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-input-element", () => {
  defineWPT("html/semantics/forms/the-input-element/button.html");
  defineWPT("html/semantics/forms/the-input-element/checkable-active-space-key-untrusted-event.html");
  defineWPT("html/semantics/forms/the-input-element/checkbox-click-events.html");
  defineWPT("html/semantics/forms/the-input-element/checkbox.html");
  defineWPT("html/semantics/forms/the-input-element/clone.html");
  defineWPT("html/semantics/forms/the-input-element/color.html", "color value sanitization only accepts simple colors, as jsdom (tests/compat input-value scenarios); CSS colors become #000000 (deviation)");
  defineWPT("html/semantics/forms/the-input-element/date.html");
  defineWPT("html/semantics/forms/the-input-element/datetime-local-trailing-zeros.html");
  defineWPT("html/semantics/forms/the-input-element/datetime-local-valueasdate.html");
  defineWPT("html/semantics/forms/the-input-element/datetime-local.html");
  defineWPT("html/semantics/forms/the-input-element/datetime-weekmonth.html");
  defineWPT("html/semantics/forms/the-input-element/datetime.html");
  defineWPT("html/semantics/forms/the-input-element/default-type.html");
  defineWPT("html/semantics/forms/the-input-element/email.html");
  defineWPT("html/semantics/forms/the-input-element/files.html", "files accepts array-likes of File (user-event and tests assign plain lists; deviation)");
  defineWPT("html/semantics/forms/the-input-element/hidden.html");
  defineWPT("html/semantics/forms/the-input-element/input-checkvalidity.html");
  defineWPT("html/semantics/forms/the-input-element/input-height.html");
  defineWPT("html/semantics/forms/the-input-element/input-labels.html");
  defineWPT("html/semantics/forms/the-input-element/input-list.html");
  defineWPT("html/semantics/forms/the-input-element/input-seconds-leading-zeroes.html");
  defineWPT("html/semantics/forms/the-input-element/input-setcustomvalidity.html");
  defineWPT("html/semantics/forms/the-input-element/input-step-float.html");
  defineWPT("html/semantics/forms/the-input-element/input-step-realignment.html");
  defineWPT("html/semantics/forms/the-input-element/input-stepdown-02.html");
  defineWPT("html/semantics/forms/the-input-element/input-stepdown-weekmonth.html");
  defineWPT("html/semantics/forms/the-input-element/input-stepdown.html");
  defineWPT("html/semantics/forms/the-input-element/input-stepup.html");
  defineWPT("html/semantics/forms/the-input-element/input-type-button.html", "needs layout (button label width)");
  defineWPT("html/semantics/forms/the-input-element/input-type-change-value.html");
  defineWPT("html/semantics/forms/the-input-element/input-type-checkbox.html");
  defineWPT("html/semantics/forms/the-input-element/input-validationmessage.html");
  defineWPT("html/semantics/forms/the-input-element/input-validity.html");
  defineWPT("html/semantics/forms/the-input-element/input-value-dirty-flag.html");
  defineWPT("html/semantics/forms/the-input-element/input-value-invalidstateerr.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasdate-invalidstateerr.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasdate-null.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasdate-stepping.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasdate-typeerror.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasdate.html", "harness realm: the test compares against Dates of its vm context, valueAsDate returns host-realm Dates");
  defineWPT("html/semantics/forms/the-input-element/input-valueasnumber-invalidstateerr.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasnumber-nan.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasnumber-stepping.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasnumber-typeerror.html");
  defineWPT("html/semantics/forms/the-input-element/input-valueasnumber.html");
  defineWPT("html/semantics/forms/the-input-element/input-width.html");
  defineWPT("html/semantics/forms/the-input-element/input-willvalidate.html");
  defineWPT("html/semantics/forms/the-input-element/maxlength.html");
  defineWPT("html/semantics/forms/the-input-element/minlength.html");
  defineWPT("html/semantics/forms/the-input-element/month.html");
  defineWPT("html/semantics/forms/the-input-element/number-disabled.html");
  defineWPT("html/semantics/forms/the-input-element/number-lang-change.html");
  defineWPT("html/semantics/forms/the-input-element/number.html");
  defineWPT("html/semantics/forms/the-input-element/password.html");
  defineWPT("html/semantics/forms/the-input-element/pattern_attribute.html");
  defineWPT("html/semantics/forms/the-input-element/pattern_attribute_v_flag.html");
  defineWPT("html/semantics/forms/the-input-element/radio-click-events.html");
  defineWPT("html/semantics/forms/the-input-element/radio-disconnected-group-owner.html", "radio group check runs on connection, not on insertion into a disconnected form (no insertion hook for disconnected trees)");
  defineWPT("html/semantics/forms/the-input-element/radio-form-owner.html");
  defineWPT("html/semantics/forms/the-input-element/radio-groupname-case.html");
  defineWPT("html/semantics/forms/the-input-element/radio-input-cancel.html");
  defineWPT("html/semantics/forms/the-input-element/radio-morphed.html");
  defineWPT("html/semantics/forms/the-input-element/radio-multiple-selected.html");
  defineWPT("html/semantics/forms/the-input-element/radio.html");
  defineWPT("html/semantics/forms/the-input-element/range-2.html");
  defineWPT("html/semantics/forms/the-input-element/range.html");
  defineWPT("html/semantics/forms/the-input-element/required_attribute.html");
  defineWPT("html/semantics/forms/the-input-element/reset.html", PARSER_FORM_POINTER);
  defineWPT("html/semantics/forms/the-input-element/search_input.html");
  defineWPT("html/semantics/forms/the-input-element/selection-weekmonth.html");
  defineWPT("html/semantics/forms/the-input-element/selection.html");
  defineWPT("html/semantics/forms/the-input-element/telephone.html");
  defineWPT("html/semantics/forms/the-input-element/text.html");
  defineWPT("html/semantics/forms/the-input-element/time-2.html");
  defineWPT("html/semantics/forms/the-input-element/time-focus-dynamic-value-change.html");
  defineWPT("html/semantics/forms/the-input-element/time.html");
  defineWPT("html/semantics/forms/the-input-element/type-change-state-weekmonth.html");
  defineWPT("html/semantics/forms/the-input-element/type-change-state.html");
  defineWPT("html/semantics/forms/the-input-element/type-change-text-to-file-to-text.html");
  defineWPT("html/semantics/forms/the-input-element/url.html");
  defineWPT("html/semantics/forms/the-input-element/valueMode-weekmonth.html");
  defineWPT("html/semantics/forms/the-input-element/valueMode.html");
  defineWPT("html/semantics/forms/the-input-element/week.html");
});

describe("the-label-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-label-element", () => {
  defineWPT("html/semantics/forms/the-label-element/clicking-interactive-content.html");
  defineWPT("html/semantics/forms/the-label-element/clicking-noninteractive-labelable-content.html");
  defineWPT("html/semantics/forms/the-label-element/clicking-noninteractive-unlabelable-content.html");
  defineWPT("html/semantics/forms/the-label-element/disabled-labeled-control.html");
  defineWPT("html/semantics/forms/the-label-element/label-inside-anchor.html");
  defineWPT("html/semantics/forms/the-label-element/labelable-elements.html");
  defineWPT("html/semantics/forms/the-label-element/labels-live-attribute-changes.html");
  defineWPT("html/semantics/forms/the-label-element/labels-live-label-removal.html");
  defineWPT("html/semantics/forms/the-label-element/proxy-click-to-associated-element.html");
});

describe("the-legend-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-legend-element", () => {
  defineWPT("html/semantics/forms/the-legend-element/HTMLLegendElement.html");
  defineWPT("html/semantics/forms/the-legend-element/legend-form.html");
});

describe("the-meter-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-meter-element", () => {
  defineWPT("html/semantics/forms/the-meter-element/meter-leading-plus-sign.html");
  defineWPT("html/semantics/forms/the-meter-element/meter.html");
});

describe("the-optgroup-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-optgroup-element", () => {
  defineWPT("html/semantics/forms/the-optgroup-element/optgroup-removal.window.js");
});

describe("the-option-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-option-element", () => {
  defineWPT("html/semantics/forms/the-option-element/option-element-constructor.html");
  defineWPT("html/semantics/forms/the-option-element/option-form.html");
  defineWPT("html/semantics/forms/the-option-element/option-index.html");
  defineWPT("html/semantics/forms/the-option-element/option-label.html");
  defineWPT("html/semantics/forms/the-option-element/option-selected.html");
  defineWPT("html/semantics/forms/the-option-element/option-text-backslash.html");
  defineWPT("html/semantics/forms/the-option-element/option-text-label.html");
  defineWPT("html/semantics/forms/the-option-element/option-text-recurse.html");
  defineWPT("html/semantics/forms/the-option-element/option-text-setter.html");
  defineWPT("html/semantics/forms/the-option-element/option-text-spaces.html");
  defineWPT("html/semantics/forms/the-option-element/option-value.html");
});

describe("the-output-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-output-element", () => {
  defineWPT("html/semantics/forms/the-output-element/mutations.window.js");
  defineWPT("html/semantics/forms/the-output-element/output-setcustomvalidity.html");
  defineWPT("html/semantics/forms/the-output-element/output-validity.html");
  defineWPT("html/semantics/forms/the-output-element/output.html");
});

describe("the-progress-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-progress-element", () => {
  defineWPT("html/semantics/forms/the-progress-element/progress-2.html");
  defineWPT("html/semantics/forms/the-progress-element/progress-max-setting.html");
  defineWPT("html/semantics/forms/the-progress-element/progress.html");
  defineWPT("html/semantics/forms/the-progress-element/progress.window.js");
  defineWPT("html/semantics/forms/the-progress-element/serialization-regression-test.html");
});

describe("the-select-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-select-element", () => {
  defineWPT("html/semantics/forms/the-select-element/common-HTMLOptionsCollection-add.html");
  defineWPT("html/semantics/forms/the-select-element/common-HTMLOptionsCollection-namedItem.html");
  defineWPT("html/semantics/forms/the-select-element/common-HTMLOptionsCollection.html");
  defineWPT("html/semantics/forms/the-select-element/inserted-or-removed.html", INSERTED_SELECTED);
  defineWPT("html/semantics/forms/the-select-element/option-selectedness-script-mutation.html");
  defineWPT("html/semantics/forms/the-select-element/select-add-optgroup.html");
  defineWPT("html/semantics/forms/the-select-element/select-add.html");
  defineWPT("html/semantics/forms/the-select-element/select-ancestor-subtree-removal.html");
  defineWPT("html/semantics/forms/the-select-element/select-ask-for-reset.html");
  defineWPT("html/semantics/forms/the-select-element/select-attribute-change-reset.html", "removing multiple keeps the LAST selected option, as jsdom (tests/compat select-option scenario); Chromium keeps the first");
  defineWPT("html/semantics/forms/the-select-element/select-click-does-not-open-picker.html");
  defineWPT("html/semantics/forms/the-select-element/select-defineProperty.html");
  defineWPT("html/semantics/forms/the-select-element/select-insertion-inherited-style.html");
  defineWPT("html/semantics/forms/the-select-element/select-multiple.html");
  defineWPT("html/semantics/forms/the-select-element/select-named-getter.html");
  defineWPT("html/semantics/forms/the-select-element/select-remove.html");
  defineWPT("html/semantics/forms/the-select-element/select-selectedOptions-and-selected.html");
  defineWPT("html/semantics/forms/the-select-element/select-selectedOptions-and-value.html");
  defineWPT("html/semantics/forms/the-select-element/select-selectedOptions-nesting.window.js");
  defineWPT("html/semantics/forms/the-select-element/select-selectedOptions.html");
  defineWPT("html/semantics/forms/the-select-element/select-setcustomvalidity.html");
  defineWPT("html/semantics/forms/the-select-element/select-setter-dirtiness.html");
  defineWPT("html/semantics/forms/the-select-element/select-validity-option-descendants.html");
  defineWPT("html/semantics/forms/the-select-element/select-validity.html", INSERTED_SELECTED);
  defineWPT("html/semantics/forms/the-select-element/select-value.html");
  defineWPT("html/semantics/forms/the-select-element/select-willvalidate-readonly-attribute.html");
  defineWPT("html/semantics/forms/the-select-element/selected-index.html");
  defineWPT("html/semantics/forms/the-select-element/show-picker-disabled.html");
});

describe("the-textarea-element — https://github.com/web-platform-tests/wpt/tree/master/html/semantics/forms/the-textarea-element", () => {
  defineWPT("html/semantics/forms/the-textarea-element/cloning-steps.html");
  defineWPT("html/semantics/forms/the-textarea-element/textarea-maxlength.html");
  defineWPT("html/semantics/forms/the-textarea-element/textarea-minlength.html");
  defineWPT("html/semantics/forms/the-textarea-element/textarea-setcustomvalidity.html");
  defineWPT("html/semantics/forms/the-textarea-element/textarea-textLength.html");
  defineWPT("html/semantics/forms/the-textarea-element/textarea-type.html");
  defineWPT("html/semantics/forms/the-textarea-element/textarea-validity-clone.html");
  defineWPT("html/semantics/forms/the-textarea-element/textarea-validity-valueMissing-inside-datalist.html");
  defineWPT("html/semantics/forms/the-textarea-element/value-defaultValue-textContent.html");
  defineWPT("html/semantics/forms/the-textarea-element/wrapping-transformation.window.js");
});

// ARIA role names, copied from @types/aria-query@5.0.4 (MIT) so the published typings do not
// need aria-query. https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/aria-query/index.d.ts

export type ARIAWidgetRole =
    | "button"
    | "checkbox"
    | "gridcell"
    | "link"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "option"
    | "progressbar"
    | "radio"
    | "scrollbar"
    | "searchbox"
    | "slider"
    | "spinbutton"
    | "switch"
    | "tab"
    | "tabpanel"
    | "textbox"
    | "treeitem";

export type ARIACompositeWidgetRole =
    | "combobox"
    | "grid"
    | "listbox"
    | "menu"
    | "menubar"
    | "radiogroup"
    | "tablist"
    | "tree"
    | "treegrid";

export type ARIADocumentStructureRole =
    | "application"
    | "article"
    | "blockquote"
    | "caption"
    | "cell"
    | "columnheader"
    | "definition"
    | "deletion"
    | "directory"
    | "document"
    | "emphasis"
    | "feed"
    | "figure"
    | "generic"
    | "group"
    | "heading"
    | "img"
    | "insertion"
    | "list"
    | "listitem"
    | "math"
    | "meter"
    | "none"
    | "note"
    | "paragraph"
    | "presentation"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "separator"
    | "strong"
    | "subscript"
    | "superscript"
    | "table"
    | "term"
    | "time"
    | "toolbar"
    | "tooltip";

export type ARIALandmarkRole =
    | "banner"
    | "complementary"
    | "contentinfo"
    | "form"
    | "main"
    | "navigation"
    | "region"
    | "search";

export type ARIALiveRegionRole = "alert" | "log" | "marquee" | "status" | "timer";

export type ARIAWindowRole = "alertdialog" | "dialog";

export type ARIAUncategorizedRole = "code";

export type ARIARole =
    | ARIAWidgetRole
    | ARIACompositeWidgetRole
    | ARIADocumentStructureRole
    | ARIALandmarkRole
    | ARIALiveRegionRole
    | ARIAWindowRole
    | ARIAUncategorizedRole;

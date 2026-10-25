// Shared fixtures for the events tests.
import { createWindow, type Document, type Window } from "@ctrl/dom";

export interface Fixture {
  window: Window;
  document: Document;
}

export function setup(): Fixture {
  const window = createWindow();
  return { window, document: window.document };
}

/**
 * The table most WPT dom/events tests use (built with DOM calls so the tests do not depend
 * on the HTML parser):
 *
 *   <table id="table"><tbody id="table-body">
 *     <tr id="table-row"><td id="table-cell">Shady Grove</td><td>Aeolian</td></tr>
 *     <tr id="parent"><td id="target">Over the river, Charlie</td><td>Dorian</td></tr>
 *   </tbody></table>
 */
export function buildTable(document: Document) {
  const el = (tag: string, id?: string, text?: string) => {
    const e = document.createElement(tag);
    if (id !== undefined) e.setAttribute("id", id);
    if (text !== undefined) e.appendChild(document.createTextNode(text));
    return e;
  };
  const table = el("table", "table");
  const tbody = table.appendChild(el("tbody", "table-body"));
  const row = tbody.appendChild(el("tr", "table-row"));
  row.appendChild(el("td", "table-cell", "Shady Grove"));
  row.appendChild(el("td", undefined, "Aeolian"));
  const parent = tbody.appendChild(el("tr", "parent"));
  const target = parent.appendChild(el("td", "target", "Over the river, Charlie"));
  parent.appendChild(el("td", undefined, "Dorian"));
  document.body!.appendChild(table);
  return { table, tbody, row, parent, target, body: document.body!, html: document.documentElement! };
}

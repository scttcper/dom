/**
 * Downstream repro (React Router: `__tests__/dom/data-browser-router-test.tsx` › "Router:
 * <DataBrowserRouter> / <DataHashRouter> › useSubmit/Form FormData › includes the correct
 * submitter value(s) in tree order", both rtd modes). Fixed in @rtd/dom; kept as a differential
 * check.
 *
 * The test clicks an `<input type=image name=tasks>` with `fireEvent.click(img, { clientX: 1,
 * clientY: 2 })` and expects `tasks.x=1&tasks.y=2` in the submitted FormData. An image button's
 * activation behavior records the coordinate the click selected; constructing the entry list then
 * appends `name.x` / `name.y` from it. jsdom takes the click's offsetX/offsetY (which, without
 * layout, mirror clientX/clientY). @rtd/dom always appended 0,0.
 *
 * Spec: https://html.spec.whatwg.org/#image-button-state-(type=image)
 *       https://html.spec.whatwg.org/#constructing-the-form-data-set (step 5.2)
 * Owner: html-forms (packages/dom/src/html/forms/HTMLInputElement.ts, form-submission.ts).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("image button selected coordinate in the form data set", (make) => {
  test("a click at (1,2) submits name.x=1 / name.y=2", () => {
    const window = make();
    const { document } = window;
    document.body.innerHTML = '<form id="f"><input name="tasks" value="first"><input type="image" name="tasks" alt="Add"></form>';
    const form = document.getElementById("f");
    const entries: string[][] = [];
    form.addEventListener("submit", (e: any) => {
      e.preventDefault();
      entries.push(...[...new window.FormData(form, e.submitter)].map(([k, v]: [string, string]) => [k, v]));
    });
    document.querySelector("input[type=image]").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 1, clientY: 2 }));
    expect(entries).toEqual([
      ["tasks", "first"],
      ["tasks.x", "1"],
      ["tasks.y", "2"],
    ]);
  });
});

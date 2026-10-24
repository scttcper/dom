/**
 * Output size of the agent debug formats vs upstream's prettyDOM on realistic markup. The
 * numbers are recorded in docs/agent-debugging.md; run with `PRINT_SIZES=1` to print them.
 *
 * Specs:
 * - Playwright aria snapshot format — https://playwright.dev/docs/aria-snapshots
 * - Accessible name computation — https://w3c.github.io/accname/#mapping_additional_nd_name
 * - HTML element role mappings — https://www.w3.org/TR/html-aam-1.0/#html-element-role-mappings
 */
import { afterEach, describe, expect, test } from "vitest";
import { PAGE } from "../../../../comparison/fixtures/page.ts";
import { ariaSnapshot, getByRole, prettyDOM } from "../../src/index.ts";

const icon = (d: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-5 shrink-0 text-gray-400"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"></path></svg>`;
const CART = "M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272";
const CHECK = "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z";

function field(id: string, label: string, type = "text", extra = ""): string {
  return `<div class="sm:col-span-3"><label for="${id}" class="block text-sm/6 font-medium text-gray-900">${label}</label><div class="mt-2 grid grid-cols-1"><input id="${id}" name="${id}" type="${type}" autocomplete="${id}" class="col-start-1 row-start-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6" ${extra}>${icon(CHECK)}</div></div>`;
}

function lineItem(i: number): string {
  return `<li class="flex gap-x-6 py-6" data-testid="line-item-${i}"><img src="/p/${i}.jpg" alt="Product ${i}" class="size-24 flex-none rounded-md bg-gray-100 object-cover"><div class="flex flex-auto flex-col"><div><h4 class="font-medium text-gray-900"><a href="/p/${i}">Product ${i}</a></h4><p class="mt-1 text-sm text-gray-500">Color ${i % 3 ? "Black" : "White"}</p></div><div class="mt-6 flex flex-1 items-end"><dl class="flex divide-x divide-gray-200 text-sm"><div class="flex pr-4 sm:pr-6"><dt class="font-medium text-gray-900">Quantity</dt><dd class="ml-2 text-gray-700">1</dd></div><div class="flex pl-4 sm:pl-6"><dt class="font-medium text-gray-900">Price</dt><dd class="ml-2 text-gray-700">$${(i * 9.5 + 20).toFixed(2)}</dd></div></dl></div></div><button type="button" class="-m-2 p-2 text-gray-400 hover:text-gray-500"><span class="sr-only">Remove</span>${icon(CART)}</button></li>`;
}

/** A Tailwind-style checkout page as a React app would render it. */
const CHECKOUT = `<div class="bg-gray-50"><header class="relative bg-white"><nav aria-label="Top" class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div class="flex h-16 items-center"><a href="/" class="flex"><span class="sr-only">Your Company</span><img class="h-8 w-auto" src="/logo.svg" alt=""></a><div class="ml-auto flex items-center"><a href="/cart" class="group -m-2 flex items-center p-2">${icon(CART)}<span class="ml-2 text-sm font-medium text-gray-700 group-hover:text-gray-800">3</span><span class="sr-only">items in cart, view bag</span></a></div></div></nav></header>
<main class="mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6 lg:px-8"><h1 class="sr-only">Checkout</h1><form class="lg:grid lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16"><div><div><h2 class="text-lg font-medium text-gray-900">Contact information</h2>${field("email-address", "Email address", "email")}</div>
<div class="mt-10 border-t border-gray-200 pt-10"><h2 class="text-lg font-medium text-gray-900">Shipping information</h2><div class="mt-4 grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-4">${field("first-name", "First name")}${field("last-name", "Last name")}${field("company", "Company")}${field("address", "Address")}${field("apartment", "Apartment, suite, etc.")}${field("city", "City")}<div><label for="country" class="block text-sm/6 font-medium text-gray-700">Country</label><div class="mt-2 grid grid-cols-1"><select id="country" name="country" class="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pl-3 pr-8 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300"><option>United States</option><option>Canada</option><option>Mexico</option></select>${icon(CHECK)}</div></div>${field("region", "State / Province")}${field("postal-code", "Postal code")}${field("phone", "Phone", "tel")}</div></div>
<div class="mt-10 border-t border-gray-200 pt-10"><fieldset><legend class="text-lg font-medium text-gray-900">Delivery method</legend><div class="mt-4 grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-4"><label aria-label="Standard" class="group relative flex rounded-lg border border-gray-300 bg-white p-4 has-[:checked]:outline has-[:checked]:outline-2 has-[:checked]:-outline-offset-2 has-[:checked]:outline-indigo-600"><input type="radio" name="delivery-method" value="Standard" checked class="absolute inset-0 appearance-none focus:outline focus:outline-0"><div class="flex-1"><span class="block text-sm font-medium text-gray-900">Standard</span><span class="mt-1 block text-sm text-gray-500">4–10 business days</span><span class="mt-6 block text-sm font-medium text-gray-900">$5.00</span></div>${icon(CHECK)}</label><label aria-label="Express" class="group relative flex rounded-lg border border-gray-300 bg-white p-4"><input type="radio" name="delivery-method" value="Express" class="absolute inset-0 appearance-none focus:outline focus:outline-0"><div class="flex-1"><span class="block text-sm font-medium text-gray-900">Express</span><span class="mt-1 block text-sm text-gray-500">2–5 business days</span><span class="mt-6 block text-sm font-medium text-gray-900">$16.00</span></div>${icon(CHECK)}</label></div></fieldset></div></div>
<div class="mt-10 lg:mt-0"><h2 class="text-lg font-medium text-gray-900">Order summary</h2><div class="mt-4 rounded-lg border border-gray-200 bg-white shadow-sm"><h3 class="sr-only">Items in your cart</h3><ul role="list" class="divide-y divide-gray-200">${Array.from({ length: 3 }, (_, i) => lineItem(i)).join("")}</ul><dl class="space-y-6 border-t border-gray-200 px-4 py-6 sm:px-6"><div class="flex items-center justify-between"><dt class="text-sm">Subtotal</dt><dd class="text-sm font-medium text-gray-900">$64.00</dd></div><div class="flex items-center justify-between"><dt class="text-sm">Shipping</dt><dd class="text-sm font-medium text-gray-900">$5.00</dd></div><div class="flex items-center justify-between border-t border-gray-200 pt-6"><dt class="text-base font-medium">Total</dt><dd class="text-base font-medium text-gray-900">$75.52</dd></div></dl><div class="border-t border-gray-200 px-4 py-6 sm:px-6"><button type="submit" class="w-full rounded-md border border-transparent bg-indigo-600 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-50">Confirm order</button></div></div></div></form></main></div>`;

interface Sizes {
  prettyFull: number;
  prettyDebug: number;
  compactFull: number;
  ariaFull: number;
  ariaDebug: number;
  errorUpstream: number;
  errorAria: number;
}

function measure(html: string): Sizes {
  // Upstream's default DOM limit in errors (7000 characters), whatever the shell sets.
  const limit = process.env.DEBUG_PRINT_LIMIT;
  delete process.env.DEBUG_PRINT_LIMIT;
  try {
    return measureWithDefaults(html);
  } finally {
    if (limit !== undefined) process.env.DEBUG_PRINT_LIMIT = limit;
  }
}

function measureWithDefaults(html: string): Sizes {
  document.body.innerHTML = html;
  const body = document.body;
  const error = () => {
    try {
      getByRole(body, "button", { name: "Place order" });
    } catch (e: any) {
      return e.message.length as number;
    }
    throw new Error("did not throw");
  };
  const errorUpstream = error();
  process.env.CTRL_DOM_DEBUG = "aria";
  const errorAria = error();
  delete process.env.CTRL_DOM_DEBUG;
  return {
    // what an agent reads: no ANSI colors (they would add ~40% more to prettyDOM)
    prettyFull: prettyDOM(body, Infinity, { highlight: false }).length,
    prettyDebug: prettyDOM(body, 7000, { highlight: false }).length, // upstream default DEBUG_PRINT_LIMIT
    compactFull: prettyDOM(body, Infinity, { format: "compact" } as any).length,
    ariaFull: ariaSnapshot(body, { maxLines: Infinity, collapseAfter: Infinity }).length,
    ariaDebug: ariaSnapshot(body).length,
    errorUpstream,
    errorAria,
  };
}

afterEach(() => {
  delete process.env.CTRL_DOM_DEBUG;
});

describe("size of agent debug output vs prettyDOM", () => {
  test("Tailwind checkout form: the full aria snapshot is a small fraction of the full prettyDOM", () => {
    const s = measure(CHECKOUT);
    if (process.env.PRINT_SIZES) console.info("checkout", s, `\n${ariaSnapshot()}`);
    expect(s.ariaFull).toBeLessThan(s.prettyFull * 0.12);
    expect(s.compactFull).toBeLessThan(s.prettyFull * 0.5);
    // The upstream error is cut at 7000 characters of DOM (DEBUG_PRINT_LIMIT) and still bigger.
    expect(s.errorAria).toBeLessThan(s.errorUpstream * 0.5);
  });

  test("~200 KB application page (comparison/fixtures/page.ts): the default snapshot fits the budget", () => {
    const s = measure(PAGE);
    if (process.env.PRINT_SIZES) console.info("page", s);
    expect(s.ariaFull).toBeLessThan(s.prettyFull * 0.3);
    expect(s.ariaDebug).toBeLessThan(10_000);
  });
});

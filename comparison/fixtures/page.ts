// A deterministic ~200 KB application page (header, navigation, filters sidebar, product cards,
// a data table, a settings form, footer), the stand-in for happy-dom's comparison input (a saved
// GitHub page) without shipping someone else's markup. Generated, so it can grow or change shape
// in one place.

const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");

function words(seed: number, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += (i === 0 ? "" : " ") + WORDS[(seed * 7 + i * 3) % WORDS.length];
  return out;
}

function card(i: number): string {
  return `<article class="card flex-shrink-0 rounded p-4" data-id="${i}" aria-labelledby="card-${i}-title">
  <img src="/img/${i}.png" alt="Product ${i}" width="120" height="80">
  <h3 id="card-${i}-title" class="card-title text-lg">Product ${i}</h3>
  <p class="card-body text-sm text-muted">${words(i, 24)}</p>
  <ul class="tags flex">${[0, 1, 2].map((t) => `<li class="tag tag-${t}">${WORDS[(i + t) % WORDS.length]}</li>`).join("")}</ul>
  <div class="card-actions flex items-center">
    <span class="price">$${(i * 3.7).toFixed(2)}</span>
    <button type="button" class="btn btn-primary" aria-label="Add product ${i} to cart">Add</button>
    <a href="/products/${i}" class="link">Details</a>
  </div>
</article>`;
}

function row(i: number): string {
  return `<tr class="${i % 2 ? "odd" : "even"}" data-row="${i}">
  <td><input type="checkbox" aria-label="Select order ${i}"></td>
  <td><a href="/orders/${i}">#${10000 + i}</a></td>
  <td><span class="status status-${i % 4}">${["Pending", "Shipped", "Delivered", "Returned"][i % 4]}</span></td>
  <td>${words(i, 4)}</td>
  <td class="text-right">$${(i * 12.5).toFixed(2)}</td>
</tr>`;
}

function field(i: number): string {
  return `<div class="field">
  <label for="setting-${i}">Setting ${i}</label>
  <input id="setting-${i}" name="setting-${i}" type="${["text", "email", "number", "checkbox"][i % 4]}" class="input" aria-describedby="setting-${i}-hint">
  <small id="setting-${i}-hint" class="hint">${words(i, 8)}</small>
</div>`;
}

function build(): string {
  const nav = Array.from({ length: 12 }, (_, i) => `<li class="nav-item"><a href="/section/${i}" class="nav-link" aria-label="Section ${i}">Section ${i}</a></li>`).join("");
  const filters = Array.from({ length: 40 }, (_, i) => `<li class="filter"><label><input type="checkbox" name="filter" value="${i}"> ${words(i, 2)}</label></li>`).join("");
  return `<header class="site-header flex items-center">
  <a href="/" class="logo" aria-label="Home">Shop</a>
  <nav aria-label="Main"><ul class="nav-list flex">${nav}</ul></nav>
  <form role="search" class="search"><input type="search" name="q" aria-label="Search products"><button type="submit">Search</button></form>
</header>
<div class="layout flex">
  <aside class="sidebar flex-shrink-0" aria-label="Filters"><h2>Filters</h2><ul class="filter-list">${filters}</ul></aside>
  <main class="content">
    <section class="cards grid" aria-label="Products">${Array.from({ length: 180 }, (_, i) => card(i)).join("\n")}</section>
    <section aria-label="Orders">
      <table class="data-table">
        <thead><tr><th></th><th>Order</th><th>Status</th><th>Items</th><th>Total</th></tr></thead>
        <tbody>${Array.from({ length: 220 }, (_, i) => row(i)).join("\n")}</tbody>
      </table>
    </section>
    <form class="settings" aria-label="Settings">${Array.from({ length: 40 }, (_, i) => field(i)).join("\n")}<button type="submit">Save</button></form>
  </main>
</div>
<footer class="site-footer"><ul class="flex">${Array.from({ length: 20 }, (_, i) => `<li><a href="/info/${i}">${words(i, 2)}</a></li>`).join("")}</ul></footer>`;
}

/** Markup for `document.body.innerHTML`. */
export const PAGE = build();

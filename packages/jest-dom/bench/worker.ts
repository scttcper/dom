// One jest-dom benchmark sample in a fresh process:
//   node --expose-gc worker.ts <stack> <iterations>
// stacks: rtd (@rtd/jest-dom on @rtd/dom), jsdom / happy-dom (stock @testing-library/jest-dom).
// The document is mutated every iteration to defeat caching across iterations.
// Prints { setupMs, perIterationMs, heapUsedMB, rssMB }.

const [stack, iterationsArg] = process.argv.slice(2);
const iterations = Number(iterationsArg ?? 2000);
const g = globalThis as any;

const t0 = performance.now();
let document: any;
if (stack === "rtd") {
  const dom: any = await import("@rtd/dom");
  const win = dom.createWindow();
  dom.installGlobals(win, g);
  document = win.document;
} else if (stack === "jsdom") {
  const { JSDOM } = await import("jsdom");
  document = new JSDOM("<!doctype html><html><head></head><body></body></html>").window.document;
} else {
  const { Window } = await import("happy-dom");
  document = new Window().document;
}
const matchers: any = stack === "rtd" ? await import("@rtd/jest-dom/matchers") : await import("@testing-library/jest-dom/matchers");
const setupMs = performance.now() - t0;

document.body.innerHTML = `
  <main>
    <form aria-label="login">
      <h1>Sign in</h1>
      <label for="user">Username</label><input id="user" name="user" required>
      <label for="pass">Password</label><input id="pass" name="pass" type="password" required aria-describedby="pass-hint">
      <p id="pass-hint">At least 12 characters</p>
      <label><input type="checkbox" name="remember" checked> Remember me</label>
      <fieldset disabled><legend>Advanced</legend><input name="proxy" aria-label="Proxy"></fieldset>
      <div hidden><span id="hidden-text">secret</span></div>
      <button type="submit" disabled>Sign in</button>
      <a href="/forgot">Forgot password?</a>
    </form>
  </main>`;

const $ = (sel: string) => document.querySelector(sel);
const user = $("#user");
const pass = $("#pass");
const remember = $('input[type="checkbox"]');
const proxy = $('input[name="proxy"]');
const submit = $("button");
const hidden = $("#hidden-text");
const link = $("a");

const ctx = { isNot: false, equals: (a: unknown, b: unknown) => Object.is(a, b), utils: {} };
function assert(name: string, pass: boolean, ...args: unknown[]): void {
  const r = matchers[name].apply(ctx, args);
  if (r.pass !== pass) throw new Error(`${name} returned pass=${r.pass}`);
}

let tick = 0;
function iteration(): void {
  // Mutate the document every iteration so version-stamped caches (roles, names, styles)
  // cannot carry results over from the previous iteration: each iteration is "a new test".
  document.body.setAttribute("data-tick", String(tick++));
  assert("toBeVisible", true, user);
  assert("toBeVisible", false, hidden);
  assert("toHaveAccessibleName", true, user, "Username");
  assert("toHaveAccessibleDescription", true, pass, "At least 12 characters");
  assert("toHaveRole", true, link, "link");
  assert("toBeDisabled", true, proxy);
  assert("toBeDisabled", true, submit);
  assert("toBeChecked", true, remember);
  assert("toBeRequired", true, user);
  assert("toHaveTextContent", true, $("h1"), "Sign in");
}

for (let i = 0; i < Math.max(20, iterations / 10); i++) iteration();
const start = performance.now();
for (let i = 0; i < iterations; i++) iteration();
const perIterationMs = (performance.now() - start) / iterations;
g.gc?.();
g.gc?.();
const mem = process.memoryUsage();
console.log(JSON.stringify({ setupMs, perIterationMs, heapUsedMB: mem.heapUsed / 2 ** 20, rssMB: mem.rss / 2 ** 20 }));
process.exit(0);

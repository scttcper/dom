/**
 * Mocking XMLHttpRequest the way test suites do: MSW (3 and 2) and axios's XHR adapter on top of
 * @ctrl/dom's XMLHttpRequest, installed as the global like the environments install it.
 *
 * Spec: XMLHttpRequest Standard, https://xhr.spec.whatwg.org/#the-send()-method (the events a
 * mocked response must still produce) and https://xhr.spec.whatwg.org/#request-error-steps.
 *
 * MSW 3 mocks the `http.ClientRequest` that XHR's `send()` creates (its Node XHR interceptor
 * relies on XHR being built on `http`/`https`, as jsdom's is); MSW 2 wraps each instance in a
 * Proxy and answers mocked requests itself. Both must see the requests, answer them, and let
 * unhandled ones through to the network. Because MSW 2 never calls our send() for a mocked
 * request, its mocked errors skip loadstart and it ignores `timeout`: jsdom's XHR behaves exactly
 * the same under MSW 2 (checked with the same handlers), so those cases pin MSW 2's sequence.
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createWindow, installGlobals } from "@ctrl/dom";

// Installed as msw-3 / msw-2 (aliases): see .pnpmfile.cjs for why Vitest must not see an "msw".
type Msw = typeof import("msw-3");
type MswNode = typeof import("msw-3/node");
type AnyRecord = Record<string, any>;

let realServer: Server;
let realOrigin = "";
let uninstall: () => void;
let window: ReturnType<typeof createWindow>;
let axios: AnyRecord;
const g = globalThis as AnyRecord;

beforeAll(async () => {
  realServer = createServer((req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.end(`real ${req.method} ${req.url}`);
  });
  await new Promise<void>((resolve) => realServer.listen(0, "localhost", resolve));
  realOrigin = `http://localhost:${(realServer.address() as { port: number }).port}`;
  window = createWindow({ url: "http://localhost/app/" });
  uninstall = installGlobals(window);
  // axios decides at import whether its XHR adapter is available.
  axios = (await import("axios")).default;
});

afterAll(() => {
  uninstall();
  window.close();
  realServer.closeAllConnections();
  realServer.close();
});

/** Send with the global XMLHttpRequest (whatever MSW put there) and record events. */
function xhr(
  method: string,
  url: string,
  setup?: (x: AnyRecord) => void,
  body?: unknown,
): Promise<{ log: string[]; x: AnyRecord }> {
  return new Promise((resolve) => {
    const x = new g.XMLHttpRequest();
    const log: string[] = [];
    x.onreadystatechange = () => log.push(`rs${x.readyState}`);
    for (const type of ["loadstart", "load", "error", "abort", "timeout"])
      x.addEventListener(type, () => log.push(type));
    x.addEventListener("loadend", () => {
      log.push("loadend");
      resolve({ log, x });
    });
    x.open(method, url);
    setup?.(x);
    x.send(body ?? null);
  });
}

/** Unhandled requests pass through: MSW 3's `onUnhandledFrame`, MSW 2's `onUnhandledRequest`. */
type ListenOptions = Parameters<ReturnType<MswNode["setupServer"]>["listen"]>[0];

function suite(
  label: string,
  load: () => Promise<[Msw, MswNode]>,
  listenOptions: ListenOptions,
  mswAnswersXhrItself = false,
): void {
  describe(`${label} — https://xhr.spec.whatwg.org/#the-send()-method`, () => {
    let msw: Msw;
    let server: ReturnType<MswNode["setupServer"]>;

    beforeAll(async () => {
      const [core, node] = await load();
      msw = core;
      const { http, HttpResponse, delay } = core;
      server = node.setupServer(
        http.get("http://localhost/app/api/user", () =>
          HttpResponse.json({ name: "Ada" }, { headers: { "X-Mocked": "yes" } }),
        ),
        http.post("http://localhost/app/api/echo", async ({ request }) =>
          HttpResponse.json({
            body: await request.json(),
            type: request.headers.get("content-type"),
            custom: request.headers.get("x-custom"),
          }),
        ),
        http.get("http://localhost/app/api/broken", () => HttpResponse.error()),
        http.get("http://localhost/app/api/slow", async () => {
          await delay(200);
          return HttpResponse.text("late");
        }),
      );
      server.listen(listenOptions);
    });

    afterAll(() => server.close());

    test("a mocked GET (relative URL) answers with the handler's response and the usual events", async () => {
      const { log, x } = await xhr("GET", "api/user", (r) => (r.responseType = "json"));
      expect(log).toEqual(["rs1", "loadstart", "rs2", "rs3", "rs4", "load", "loadend"]);
      expect([x.status, x.response, x.getResponseHeader("x-mocked"), x.responseURL]).toEqual([
        200,
        { name: "Ada" },
        "yes",
        "http://localhost/app/api/user",
      ]);
      void msw;
    });

    test("a mocked POST sees the request body and headers", async () => {
      const { x } = await xhr(
        "POST",
        "/app/api/echo",
        (r) => {
          r.setRequestHeader("Content-Type", "application/json");
          r.setRequestHeader("X-Custom", "1");
        },
        JSON.stringify({ a: 1 }),
      );
      expect(JSON.parse(x.responseText)).toEqual({ body: { a: 1 }, type: "application/json", custom: "1" });
    });

    test("HttpResponse.error() is a network error: error then loadend, status 0", async () => {
      const { log, x } = await xhr("GET", "api/broken");
      expect(log).toEqual(
        mswAnswersXhrItself ? ["rs1", "rs4", "error", "loadend"] : ["rs1", "loadstart", "rs4", "error", "loadend"],
      );
      expect(x.status).toBe(0);
    });

    test("unhandled requests go through to the network", async () => {
      const { x } = await xhr("GET", `${realOrigin}/through`);
      expect([x.status, x.responseText]).toEqual([200, "real GET /through"]);
    });

    test("a timeout shorter than the handler's delay fires timeout — https://xhr.spec.whatwg.org/#request-error-steps", async () => {
      const { log, x } = await xhr("GET", "api/slow", (r) => (r.timeout = 20));
      expect(log).toEqual(
        mswAnswersXhrItself
          ? ["rs1", "loadstart", "rs2", "rs3", "rs4", "load", "loadend"]
          : ["rs1", "loadstart", "rs4", "timeout", "loadend"],
      );
      expect(x.readyState).toBe(4);
    });

    test("axios with its XHR adapter: mocked data, headers, and a rejected network error", async () => {
      const get = await axios.get("http://localhost/app/api/user", { adapter: "xhr" });
      expect([get.status, get.data, get.headers["x-mocked"]]).toEqual([200, { name: "Ada" }, "yes"]);
      const post = await axios.post(
        "http://localhost/app/api/echo",
        { b: 2 },
        { adapter: "xhr", headers: { "X-Custom": "2" } },
      );
      expect(post.data).toEqual({ body: { b: 2 }, type: "application/json", custom: "2" });
      await expect(axios.get("http://localhost/app/api/broken", { adapter: "xhr" })).rejects.toMatchObject({
        message: "Network Error",
      });
    });
  });
}

suite("MSW 3 (setupServer from msw/node)", async () => [await import("msw-3"), await import("msw-3/node")], {
  onUnhandledFrame: "bypass",
});
suite(
  "MSW 2 (setupServer from msw/node)",
  async () => [(await import("msw-2")) as unknown as Msw, (await import("msw-2/node")) as unknown as MswNode],
  { onUnhandledRequest: "bypass" } as unknown as ListenOptions,
  true,
);

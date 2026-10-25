// Release the published packages with semantic-release, each on its own version line
// (.github/workflows/release.yml runs this on every push to main, after `pnpm build`).
//
//   node tools/release/release.ts [--package all|@ctrl/dom|@ctrl/dom-jest-environment]
//        [--dry-run] [--no-ci]
//
// Each package's next version comes from the conventional commits since its last tag
// (`<name>@<version>`) that touch its paths (packages.ts): feat → minor; fix, perf, deps, revert →
// patch; a breaking change → major; anything else releases nothing. Publishing uses npm trusted
// publishing (OIDC: the job needs `id-token: write`, and each package's trusted publisher on
// npmjs.com names this repository and release.yml); GitHub releases carry the notes. Nothing is
// committed back: versions live in tags and on npm.

import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import semanticRelease from "semantic-release";
import { PACKAGES, tagFormat } from "./packages.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const plugin = fileURLToPath(new URL("./scoped-plugin.ts", import.meta.url));

const { values: flags } = parseArgs({
  options: {
    package: { type: "string", default: "all" },
    "dry-run": { type: "boolean", default: false },
    "no-ci": { type: "boolean", default: false },
  },
});

const selected = flags.package === "all" ? PACKAGES : PACKAGES.filter((p) => p.name === flags.package);
if (selected.length === 0)
  throw new Error(`unknown package ${flags.package} (have: all, ${PACKAGES.map((p) => p.name).join(", ")})`);

for (const pkg of selected) {
  console.log(`\n── ${pkg.name} ──`);
  const result = await semanticRelease(
    {
      branches: ["main"],
      tagFormat: tagFormat(pkg.name),
      dryRun: flags["dry-run"],
      ci: !flags["no-ci"],
      plugins: [
        [plugin, { paths: pkg.paths, pkgRoot: pkg.pkgRoot, peersOnCtrlDom: pkg.peersOnCtrlDom }],
        ["@semantic-release/npm", { pkgRoot: pkg.pkgRoot }],
        [
          "@semantic-release/github",
          { successCommentCondition: false, failCommentCondition: false, releasedLabels: false },
        ],
      ],
    },
    { cwd: repoRoot, env: process.env },
  );
  console.log(
    result
      ? `${pkg.name}: ${flags["dry-run"] ? "would release" : "released"} ${result.nextRelease.version}`
      : `${pkg.name}: nothing to release`,
  );
}

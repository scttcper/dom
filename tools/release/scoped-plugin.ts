// semantic-release plugin: @semantic-release/commit-analyzer and release-notes-generator, fed only
// the commits that touch this package's paths (tools/release/packages.ts), plus the manifest
// fix-ups before publishing: `repository.url` (npm trusted publishing and provenance require it
// to match the GitHub repository the workflow runs in; the template's `directory` is kept) and
// the @ctrl/dom peer range.
//
// Options: { paths: string[], peersOnCtrlDom?: boolean, pkgRoot: string }

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCommits as analyze } from "@semantic-release/commit-analyzer";
import { generateNotes as notes } from "@semantic-release/release-notes-generator";

interface Options {
  paths: string[];
  pkgRoot: string;
  peersOnCtrlDom?: boolean;
}

// The analyzer and notes generator resolve their preset from `cwd`: this package has it installed.
const toolsDir = fileURLToPath(new URL(".", import.meta.url));

// Conventional commits as this repository writes them (`feat(dom): …`, `deps(react): …`).
const COMMITS = {
  preset: "conventionalcommits",
  releaseRules: [
    { type: "deps", release: "patch" },
    { type: "revert", release: "patch" },
  ],
  presetConfig: {
    types: [
      { type: "feat", section: "Features" },
      { type: "fix", section: "Bug Fixes" },
      { type: "perf", section: "Performance" },
      { type: "deps", section: "Dependencies" },
      { type: "revert", section: "Reverts" },
    ],
  },
};

const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

function scoped(options: Options, context: any) {
  const range = context.lastRelease?.gitHead ? `${context.lastRelease.gitHead}..HEAD` : "HEAD";
  const touching = new Set(
    git(context.cwd, ["log", "--format=%H", range, "--", ...options.paths])
      .split("\n")
      .filter(Boolean),
  );
  const commits = context.commits.filter((c: { hash: string }) => touching.has(c.hash));
  context.logger.log(
    `${commits.length} of ${context.commits.length} commits since the last release touch this package`,
  );
  return { ...context, commits, cwd: toolsDir };
}

export function analyzeCommits(options: Options, context: any) {
  return analyze(COMMITS, scoped(options, context));
}

export function generateNotes(options: Options, context: any) {
  return notes(COMMITS, scoped(options, context));
}

/** The latest released @ctrl/dom version (this run's, when it released first). */
function latestCtrlDom(cwd: string): string {
  const tags = git(cwd, ["tag", "--list", "@ctrl/dom@*", "--sort=-v:refname"]).split("\n").filter(Boolean);
  if (tags.length === 0) throw new Error("@ctrl/dom has never been released: release it before the environments");
  return tags[0].slice("@ctrl/dom@".length);
}

/** "https://github.com/owner/repo" of the repository being released. */
function githubRepository(context: any): string {
  if (context.env.GITHUB_REPOSITORY) return `https://github.com/${context.env.GITHUB_REPOSITORY}`;
  const url = new URL(
    String(context.options.repositoryUrl)
      .replace(/^git\+/, "")
      .replace(/^git@github\.com:/, "https://github.com/"),
  );
  return `https://github.com${url.pathname.replace(/\.git$/, "")}`;
}

export function prepare(options: Options, context: any) {
  const file = join(context.cwd, options.pkgRoot, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.repository = { ...pkg.repository, type: "git", url: `git+${githubRepository(context)}.git` };
  context.logger.log(`repository = ${pkg.repository.url}`);
  if (options.peersOnCtrlDom) {
    const range = `^${latestCtrlDom(context.cwd)}`;
    pkg.peerDependencies = { ...pkg.peerDependencies, "@ctrl/dom": range };
    context.logger.log(`peerDependencies["@ctrl/dom"] = ${range}`);
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

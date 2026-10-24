// The published packages and what each one is built from. scripts/release.ts assembles them
// into release/<dir>; a commit releases a package only if it touches one of its paths (and its
// conventional commit type calls for a release), so each package keeps its own version.

const MEMBERS = ["dom", "aria", "testing-library", "react", "user-event", "jest-dom", "vitest-environment", "register"];
const member = (dir: string) => [`packages/${dir}/src`, `packages/${dir}/types`, `packages/${dir}/package.json`];

export interface ReleasePackage {
  name: string;
  /** Assembled package directory, relative to the repository root. */
  pkgRoot: string;
  /** Git pathspecs whose commits count toward this package's next release. */
  paths: string[];
  /** Peer-depends on @ctrl/dom: the release sets the range to `^<latest @ctrl/dom>`. */
  peersOnCtrlDom: boolean;
}

/** In release order: the environments' peer range needs @ctrl/dom's version from this run. */
export const PACKAGES: ReleasePackage[] = [
  {
    name: "@ctrl/dom",
    pkgRoot: "release/ctrl-dom",
    paths: [...MEMBERS.flatMap(member), "publish/ctrl-dom", "scripts/build.ts", "scripts/release.ts"],
    peersOnCtrlDom: false,
  },
  {
    name: "@ctrl/dom-jest-environment",
    pkgRoot: "release/dom-jest-environment",
    paths: [...member("jest-environment"), "publish/dom-jest-environment"],
    peersOnCtrlDom: true,
  },
];

export const tagFormat = (name: string) => `${name}@\${version}`;
